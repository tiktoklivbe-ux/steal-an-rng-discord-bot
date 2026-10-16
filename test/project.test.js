import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Collection, PermissionsBitField, PermissionFlagsBits, ChannelType } from 'discord.js';
import { config, manifest, db, renderOverwrites, levelFor, rankFor, escapeHtml, buttons, embed } from '../src/core.js';
import { Store, setupDefaults, runtimeDefaults } from '../src/store.js';
import { commands } from '../src/commands.js';
import { setupRoles, setupChannels, panels } from '../src/setup.js';
import { enterGiveaway, drawGiveaway } from '../src/giveaways.js';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rng-test-'));
manifest.file = path.join(temporary, 'setup.json'); db.file = path.join(temporary, 'runtime.json');
manifest.data = structuredClone(setupDefaults); db.data = structuredClone(runtimeDefaults);
config.setup.delayMs = 0;
test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

test('config has unique keys, valid references, safe role panels, and Discord-sized embeds', () => {
  for (const list of [config.roles, config.categories, config.channels, config.panels]) assert.equal(new Set(list.map(s => s.key)).size, list.length);
  const roles = new Set(config.roles.map(r => r.key));
  for (const role of config.roles) new PermissionsBitField(role.permissions);
  for (const ch of config.channels) { assert.ok(config.categories.some(c => c.key === ch.parent)); assert.ok(config.permissions[ch.policy]); assert.ok(ch.name.length <= 100); }
  for (const rows of Object.values(config.permissions)) for (const row of rows) { assert.ok(['everyone','bot'].includes(row.target) || roles.has(row.target)); new PermissionsBitField(row.allow || []); new PermissionsBitField(row.deny || []); }
  for (const panel of config.panels) {
    assert.ok(panel.description.length <= 4096, panel.key);
    embed(panel.title, panel.description).toJSON();
    assert.ok(buttons(panel.buttons || []).length <= 5);
    for (const button of panel.buttons || []) if (button.id.startsWith('role:')) assert.ok(config.selfRoleGroups.some(g => g.roles.includes(button.id.slice(5))));
  }
  assert.ok(config.roles.every(r => !r.mentionable));
  assert.equal(commands.length, new Set(commands.map(c => c.name)).size);
  for (const command of commands) assert.ok(command.description.length <= 100);
});

test('atomic store reload preserves cases and malformed data fails loudly', () => {
  const file = path.join(temporary, 'store.json'); const store = new Store(file, { cases: [] });
  store.data.cases.push({ id: 1, reason: 'test' }); store.save();
  assert.equal(new Store(file, {}).data.cases[0].id, 1);
  fs.writeFileSync(file, '{broken'); assert.throws(() => new Store(file, {}));
});
test('XP thresholds and transcript HTML escaping', () => {
  assert.equal(levelFor(0), 0); assert.equal(levelFor(2499), 4); assert.equal(levelFor(2500), 5);
  assert.equal(rankFor(0).role, 'street'); assert.equal(rankFor(100).role, 'omega');
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
});

test('setup replay creates once, updates once, replaces deleted resources, and refuses unowned name collisions', async () => {
  let serial = 100, roleCreates = 0, channelCreates = 0, messageCreates = 0;
  const guild = { id: 'guild', features: [], edit: async body => { if (body.features) guild.features = body.features; }, members: { me: { id: 'bot', roles: { add: async () => {} } } } };
  guild.roles = { cache: new Collection(), setPositions: async () => {}, create: async body => {
    roleCreates++; const role = { id: String(serial++), ...body, comparePositionTo: other => Number(BigInt(other.id) - BigInt(role.id)), edit: async edit => Object.assign(role, edit) }; guild.roles.cache.set(role.id, role); return role;
  } };
  function makeMessages(ch) {
    const cache = new Collection();
    ch.messages = { fetch: async id => { if (!cache.has(id)) throw Object.assign(new Error('Missing'), { code: 10008 }); return cache.get(id); } };
    ch.send = async body => { messageCreates++; const m = { id: String(serial++), pinned: false, edit: async edit => Object.assign(m, edit), pin: async () => { m.pinned = true; }, ...body }; cache.set(m.id, m); return m; };
    ch.fetchStarterMessage = async () => cache.first();
  }
  guild.channels = { cache: new Collection(), setPositions: async () => {}, create: async body => {
    channelCreates++; const ch = { id: String(serial++), ...body, availableTags: [], edit: async edit => Object.assign(ch, edit), isThread: () => false }; makeMessages(ch);
    ch.threads = { cache: new Collection(), fetch: async id => ch.threads.cache.get(id), create: async options => {
      const thread = { id: String(serial++), archived: false, isThread: () => true }; makeMessages(thread); await thread.send(options.message); ch.threads.cache.set(thread.id, thread); guild.channels.cache.set(thread.id, thread); return thread;
    } };
    guild.channels.cache.set(ch.id, ch); return ch;
  } };
  await setupRoles(guild); await setupChannels(guild); await panels(guild);
  const first = [roleCreates, channelCreates, messageCreates];
  await setupRoles(guild); await setupChannels(guild); await panels(guild);
  assert.deepEqual([roleCreates, channelCreates, messageCreates], first);
  const removed = manifest.data.channels.general; guild.channels.cache.delete(removed);
  await setupChannels(guild); assert.equal(channelCreates, first[1] + 1); assert.notEqual(manifest.data.channels.general, removed);
  guild.roles.cache.delete(manifest.data.roles.street);
  guild.roles.cache.set('unowned', { id: 'unowned', name: 'Street' });
  await assert.rejects(() => setupRoles(guild), /Unowned role name conflict/);
});

test('permission evaluation gates unverified users and keeps muted public users from posting', () => {
  const resolve = (policy, memberRoles) => {
    const rows = renderOverwrites(policy, 'guild', 'bot');
    let bits = new PermissionsBitField();
    for (const key of memberRoles) bits.add(config.roles.find(r => r.key === key).permissions);
    const everyone = rows.find(r => r.id === 'guild'); bits.remove(everyone.deny); bits.add(everyone.allow);
    const matching = rows.filter(r => memberRoles.some(key => manifest.data.roles[key] === r.id));
    for (const r of matching) bits.remove(r.deny);
    for (const r of matching) bits.add(r.allow);
    return bits;
  };
  assert.equal(resolve('public', []).has('ViewChannel'), false);
  assert.equal(resolve('start', []).has('ViewChannel'), true);
  assert.equal(resolve('public', ['verified']).has('SendMessages'), true);
  assert.equal(resolve('readonly', ['verified']).has('SendMessages'), false);
  assert.equal(resolve('staff', ['verified']).has('ViewChannel'), false);
  assert.equal(resolve('tickets', ['verified']).has('ViewChannel'), false);
  assert.equal(resolve('public', ['verified','muted']).has('SendMessages'), false);
  assert.equal(resolve('public', ['verified','muted']).has('Connect'), false);
});

test('giveaway entry toggles and restart-safe draw only picks eligible entrants', async () => {
  const replies = [];
  const giveaway = { id: 'giveaway', channel: 'gchan', role: 'requirement', ends: Date.now()+60000, winners: 3, entries: [], ended: false, draws: [], prize: 'Test prize' };
  db.data.giveaways.giveaway = giveaway;
  const i = { message: { id: 'giveaway' }, user: { id: 'member' }, member: { roles: { cache: new Collection([['requirement', {}]]) } }, reply: async payload => replies.push(payload.content) };
  await enterGiveaway(i); assert.deepEqual(giveaway.entries, ['member']); await enterGiveaway(i); assert.deepEqual(giveaway.entries, []);
  giveaway.entries = ['valid', 'left', 'no-role'];
  const guild = { members: { fetch: async id => { if (id === 'left') throw Object.assign(new Error('Left'), { code: 10007 }); return { user: { bot: false }, roles: { cache: new Collection(id === 'valid' ? [['requirement',{}]] : []) } }; } }, channels: { cache: new Collection([['gchan', { messages: { fetch: async () => ({ edit: async () => {} }) }, send: async () => {} }]]) } };
  assert.deepEqual(await drawGiveaway(guild, 'giveaway'), ['valid']);
  assert.equal(giveaway.ended, true); assert.equal(giveaway.draws[0].published, true);
  await assert.rejects(() => drawGiveaway(guild, 'giveaway'), /Already ended/);
  assert.deepEqual(await drawGiveaway(guild, 'giveaway', true), []);
});
