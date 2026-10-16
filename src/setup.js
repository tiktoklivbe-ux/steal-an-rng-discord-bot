import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChannelType, AutoModerationRuleEventType, AutoModerationRuleTriggerType, AutoModerationActionType, Routes } from 'discord.js';
import { config, root, manifest, requireEnv, makeClient, renderOverwrites, embed, buttons, sleep, log, roleId, channelId, db } from './core.js';
import { registerCommands } from './commands.js';

const types = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, stage: ChannelType.GuildStageVoice, forum: ChannelType.GuildForum };
const summary = { created: [], updated: [], warnings: [] };
async function optional(label, fn) {
  try { await fn(); } catch (error) { summary.warnings.push(`${label}: ${error.message}`); log(`Optional setup skipped: ${label}`, error.message); }
}
async function remember(group, key, value) { manifest.data[group][key] = value.id; manifest.save(); await sleep(config.setup.delayMs); return value; }
async function reset(guild) {
  // Only recorded resources are owned. Never discover ownership by name.
  for (const id of Object.values(manifest.data.channels).reverse()) {
    const ch = guild.channels.cache.get(id);
    if (ch?.type === ChannelType.GuildCategory && ch.children.cache.size) {
      throw new Error(`Reset stopped: category ${ch.name} still contains unowned or live ticket channels. Move them out first.`);
    }
    if (ch) await ch.delete('Explicit --reset: managed resource');
    await sleep(config.setup.delayMs);
  }
  for (const [group, manager] of [['automod', guild.autoModerationRules], ['emojis', guild.emojis], ['roles', guild.roles]]) {
    for (const id of Object.values(manifest.data[group])) {
      const resource = manager.cache.get(id);
      if (resource && !resource.managed) await resource.delete('Explicit --reset: managed resource');
    }
  }
  for (const id of manifest.data.commands) await guild.commands.delete(id).catch(error => { if (error.code !== 10063) throw error; });
  Object.assign(manifest.data, { roles: {}, channels: {}, messages: {}, automod: {}, emojis: {}, commands: [] });
  manifest.save();
}
export async function setupRoles(guild) {
  for (const spec of config.roles) {
    let role = guild.roles.cache.get(roleId(spec.key));
    const body = { name: spec.name, color: spec.color, permissions: spec.permissions, hoist: spec.hoist, mentionable: spec.mentionable, reason: 'Steal an RNG setup' };
    if (role) { await role.edit(body); summary.updated.push(`role:${spec.key}`); }
    else {
      if (guild.roles.cache.some(r => r.name === spec.name)) throw new Error(`Unowned role name conflict: ${spec.name}. Rename it; setup never adopts existing roles.`);
      role = await guild.roles.create(body); summary.created.push(`role:${spec.key}`);
    }
    await remember('roles', spec.key, role);
  }
  // Discord can give newly created roles identical numeric positions. Snowflake
  // tie-breaking still gives them a real hierarchy; avoid an unnecessary reorder
  // above the bot's numeric position when that effective order is already right.
  const desired = config.roles.map(spec => guild.roles.cache.get(roleId(spec.key)));
  const actual = [...desired].sort((a, b) => b.comparePositionTo(a));
  if (!actual.every((role, index) => role.id === desired[index].id)) {
    await guild.roles.setPositions(config.roles.map((r, i) => ({ role: roleId(r.key), position: config.roles.length - i })));
  }
  await guild.members.me.roles.add(roleId('bots'));
}
export async function setupChannels(guild) {
  // Community needs existing rules and staff-update text channels before forums/stages can be created.
  const gated = spec => ['forum', 'stage'].includes(spec.type);
  const ordered = [...config.categories.map(c => ({ ...c, type: 'category' })), ...config.channels.filter(c => !gated(c)), ...config.channels.filter(gated)];
  for (const spec of ordered) {
    if (gated(spec) && !guild.features.includes('COMMUNITY')) {
      if (!config.setup.enableCommunity) throw new Error('Enable Community manually or set setup.enableCommunity=true before creating forums/stages.');
      await guild.edit({ features: [...guild.features, 'COMMUNITY'], rulesChannel: channelId('rules'), publicUpdatesChannel: channelId('staff-announcements'), verificationLevel: 1, explicitContentFilter: 2 });
    }
    let ch = guild.channels.cache.get(channelId(spec.key));
    const type = spec.type === 'category' ? ChannelType.GuildCategory : types[spec.type];
    if (ch && ch.type !== type) throw new Error(`Type changed for ${spec.key}. Migrate it manually; setup will not destroy its history.`);
    const body = { name: spec.name, type, permissionOverwrites: renderOverwrites(spec.policy, guild.id, guild.members.me.id), reason: 'Steal an RNG setup' };
    if (ch && spec.key === 'player-count' && process.env.ROBLOX_UNIVERSE_ID) delete body.name;
    if (spec.parent) body.parent = channelId(spec.parent);
    if (['text','forum'].includes(spec.type)) Object.assign(body, { topic: spec.topic, rateLimitPerUser: spec.slowmode });
    if (spec.type === 'forum') { body.defaultThreadRateLimitPerUser = spec.slowmode; body.availableTags = spec.tags.map(name => ({ name, moderated: false, ...(ch?.availableTags.find(t => t.name === name)?.id ? { id: ch.availableTags.find(t => t.name === name).id } : {}) })); }
    if (ch) { const { type: ignored, ...edit } = body; await ch.edit(edit); summary.updated.push(`channel:${spec.key}`); }
    else {
      if (guild.channels.cache.some(c => c.name === spec.name)) throw new Error(`Unowned channel name conflict: ${spec.name}. Rename it before continuing.`);
      ch = await guild.channels.create(body); summary.created.push(`channel:${spec.key}`);
    }
    await remember('channels', spec.key, ch);
  }
  await guild.channels.setPositions(config.categories.map((c, position) => ({ channel: channelId(c.key), position })));
  for (const cat of config.categories) await guild.channels.setPositions(config.channels.filter(c => c.parent === cat.key).map((c, position) => ({ channel: channelId(c.key), position })));
  await guild.edit({ afkChannel: channelId('afk'), afkTimeout: 300, systemChannel: channelId('welcome') });
}
export async function panels(guild) {
  for (const panel of config.panels) {
    let channel = guild.channels.cache.get(channelId(panel.channel));
    if (channel.type === ChannelType.GuildForum) {
      const threadKey = `${panel.key}-thread`;
      let thread = manifest.data.channels[threadKey] ? await channel.threads.fetch(manifest.data.channels[threadKey]).catch(e => { if (e.code !== 10003) throw e; return null; }) : null;
      if (!thread) {
        thread = await channel.threads.create({ name: '📌 Trading rules — read before posting', message: { embeds: [embed(panel.title, panel.description)], allowedMentions: { parse: [] } } });
        await remember('channels', threadKey, thread);
      }
      if (thread.archived) await thread.setArchived(false);
      channel = thread;
    }
    let message = manifest.data.messages[panel.key] ? await channel.messages.fetch(manifest.data.messages[panel.key]).catch(e => { if (e.code !== 10008) throw e; return null; }) : null;
    if (!message && channel.isThread()) message = await channel.fetchStarterMessage();
    const body = { embeds: [embed(panel.title, panel.description, panel.color)], components: buttons(panel.buttons || []), allowedMentions: { parse: [] } };
    if (message) await message.edit(body); else message = await channel.send(body);
    await remember('messages', panel.key, message);
    if (!message.pinned) await message.pin('Server guide panel');
  }
}
async function automod(guild) {
  if (!config.automod.enabled) return;
  const exemptRoles = config.staffRoles.map(roleId);
  const rules = [
    { key: 'invites', name: 'RNG • Block outside invites', triggerType: AutoModerationRuleTriggerType.Keyword, triggerMetadata: { keywordFilter: config.automod.inviteKeywords } },
    { key: 'scams', name: 'RNG • Block scam phrases', triggerType: AutoModerationRuleTriggerType.Keyword, triggerMetadata: { keywordFilter: config.automod.scamKeywords } },
    { key: 'spam', name: 'RNG • Spam protection', triggerType: AutoModerationRuleTriggerType.Spam },
    { key: 'mentions', name: 'RNG • Mention spam', triggerType: AutoModerationRuleTriggerType.MentionSpam, triggerMetadata: { mentionTotalLimit: config.automod.mentionLimit, mentionRaidProtectionEnabled: true } },
  ];
  if (config.automod.blockSlursWithDiscordPresets) rules.push({ key: 'slurs', name: 'RNG • Safety keyword presets', triggerType: AutoModerationRuleTriggerType.KeywordPreset, triggerMetadata: { presets: [1, 2, 3] } });
  for (const rule of rules) await optional(`AutoMod ${rule.key}`, async () => {
    const { key, ...spec } = rule;
    const body = { ...spec, enabled: true, eventType: AutoModerationRuleEventType.MessageSend, exemptRoles, actions: [{ type: AutoModerationActionType.BlockMessage }] };
    const existing = guild.autoModerationRules.cache.get(manifest.data.automod[key]);
    if (!existing && guild.autoModerationRules.cache.some(r => r.name === spec.name)) throw new Error('Unowned rule name conflict');
    await remember('automod', key, existing ? await existing.edit(body) : await guild.autoModerationRules.create(body));
  });
}
export async function community(guild) {
  if (config.setup.enableCommunity && !guild.features.includes('COMMUNITY')) await optional('Community', () => guild.edit({ features: [...guild.features, 'COMMUNITY'], rulesChannel: channelId('rules'), publicUpdatesChannel: channelId('staff-announcements'), verificationLevel: 1, explicitContentFilter: 2 }));
  await optional('Description', () => guild.edit({ description: config.description }));
  await optional('Welcome Screen', () => guild.editWelcomeScreen({ enabled: true, description: config.description, welcomeChannels: config.onboarding.welcomeChannels.map(c => ({ channel: channelId(c.channel), description: c.description, emoji: c.emoji })) }));
  const prompts = config.onboarding.questions.map((q, i) => ({ id: String(i + 1), title: q.title, type: 0, single_select: false, required: false, in_onboarding: true, options: q.roles.map((key, j) => ({ id: String((i + 1) * 100 + j), title: config.roles.find(r => r.key === key).name, role_ids: [roleId(key)], channel_ids: [] })) }));
  await optional('Onboarding draft', () => guild.client.rest.put(Routes.guildOnboarding(guild.id), { body: { enabled: config.setup.enableOnboarding, mode: 1, default_channel_ids: config.onboarding.defaultChannels.map(channelId), prompts } }));
}
async function assets(guild) {
  for (const [name, field] of [['icon','icon'],['banner','banner'],['splash','splash']]) {
    const file = ['png','jpg','webp','gif'].map(ext => path.join(root, 'assets', `${name}.${ext}`)).find(p => fs.existsSync(p));
    if (file) await optional(name, () => guild.edit({ [field]: fs.readFileSync(file) }));
  }
  for (const file of fs.readdirSync(path.join(root, 'assets/emojis'))) if (/\.(png|webp|gif)$/.test(file)) await optional(`emoji ${file}`, async () => {
    const name = path.parse(file).name.replace(/[^a-zA-Z0-9_]/g, '_');
    const old = guild.emojis.cache.get(manifest.data.emojis[name]);
    if (old) return;
    if (guild.emojis.cache.some(e => e.name === name)) throw new Error('Unowned emoji name conflict');
    await remember('emojis', name, await guild.emojis.create({ name, attachment: path.join(root, 'assets/emojis', file) }));
  });
  for (const spec of config.roles) {
    const file = path.join(root, 'assets/roles', `${spec.key}.png`);
    if (fs.existsSync(file)) await optional(`role icon ${spec.key}`, () => guild.roles.cache.get(roleId(spec.key)).setIcon(fs.readFileSync(file)));
  }
}
async function main() {
  requireEnv();
  if (process.argv.includes('--reset') && (Object.values(db.data.tickets).some(t => t.status !== 'closed') || Object.values(db.data.giveaways).some(g => !g.ended) || db.data.tempVoice.length)) throw new Error('Close live tickets/giveaways and remove temporary voice rooms before reset.');
  const client = makeClient();
  try {
    await client.login(process.env.DISCORD_TOKEN);
    if (!client.isReady()) await new Promise(resolve => client.once('clientReady', resolve));
    if (client.user.id !== process.env.CLIENT_ID) throw new Error('CLIENT_ID does not match this bot token.');
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.roles.fetch(); await guild.channels.fetch(); await guild.members.fetchMe(); await guild.autoModerationRules.fetch(); await guild.emojis.fetch();
    manifest.data.guildId = guild.id; manifest.save();
    if (!guild.members.me.permissions.has('Administrator')) throw new Error('Setup requires Administrator temporarily. See README for reduced runtime permissions.');
    if (process.argv.includes('--reset')) await reset(guild);
    log('Reconciling roles'); await setupRoles(guild);
    log('Reconciling categories and channels'); await setupChannels(guild);
    log('Updating pinned panels'); await panels(guild);
    log('Updating AutoMod and Community'); await automod(guild); await community(guild); await assets(guild);
    if (config.setup.registerCommands) await registerCommands(guild, manifest);
    log('Setup complete', JSON.stringify(summary, null, 2));
    console.log('Manual checklist: enable/review Community and Onboarding; assign human staff roles; keep the actual bot integration role above all managed roles; review boost perks/assets; invite Bloxlink or RoVer; fill [DEV TO CONFIRM] entries. No game abilities were granted by Discord ranks.');
  } finally { client.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { log('SETUP FAILED', error.message); process.exitCode = 1; });
