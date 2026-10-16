import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { ChannelType, ActivityType, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, Events } from 'discord.js';
import { config, root, manifest, db, requireEnv, makeClient, log, roleId, channelId, embed, privateReply, send, staff, levelFor, rankFor, renderOverwrites } from './core.js';
import { card } from './cards.js';
import { personality } from './personality.js';
import { funCommands, funReply } from './fun.js';
const funCooldowns = new Map();
const mentionCooldowns = new Map();
import { openTicket, ticketAction, closeTicket, recoverTickets } from './tickets.js';
import { enterGiveaway, startGiveaway, drawGiveaway, tickGiveaways } from './giveaways.js';
import { moderation, moderationCommands } from './moderation.js';
import { gameStats, updateGameStats, weeklyLeaderboard } from './roblox.js';

requireEnv();
if (!manifest.data.roles.verified) throw new Error('Run npm run setup before starting the bot.');
if (db.data.codes === null) { db.data.codes = JSON.parse(fs.readFileSync(path.join(root, 'config/codes.json'), 'utf8')); db.save(); }
const client = makeClient(true);
let guild;
const timers = [], messageQueues = new Map(), roleQueues = new Map(), voiceCreating = new Set();
let timerRunning = false, presenceIndex = 0;
const activeCodes = () => db.data.codes.filter(c => !c.expires || Date.parse(c.expires) > Date.now());
const codesText = () => activeCodes().map(c => `**\`${c.code.replace(/`/g, '')}\`** — ${c.reward}${c.expires ? ` (until <t:${Math.floor(Date.parse(c.expires) / 1000)}:d>)` : ''}`).join('\n').slice(0, 3900) || 'No confirmed active codes yet. Check back after an official update!';

async function failure(context, error) {
  log(`ERROR ${context}`, error.message);
  if (guild) await send(guild, 'bot-logs', { content: `⚠️ ${context}: ${String(error.message).slice(0, 1500)}` }).catch(() => {});
}
function enqueue(map, key, action) {
  const current = (map.get(key) || Promise.resolve()).catch(() => {}).then(action);
  map.set(key, current);
  current.finally(() => { if (map.get(key) === current) map.delete(key); }).catch(() => {});
  return current;
}
function bugModal() {
  const fields = [['title','Short bug title',100,TextInputStyle.Short],['platform','Platform: Mobile, PC, or Console',20,TextInputStyle.Short],['category','Category: Gameplay, UI, or Crash',20,TextInputStyle.Short],['details','Steps + expected vs actual results',2000,TextInputStyle.Paragraph],['evidence','Screenshot / video URL (optional)',500,TextInputStyle.Short]];
  return new ModalBuilder().setCustomId('bug-submit').setTitle('🧪 Bug report').addComponents(fields.map(([id,label,max,style]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setMaxLength(max).setStyle(style).setRequired(id !== 'evidence'))));
}
async function submitBug(i) {
  await i.deferReply({ flags: 64 });
  const channel = guild.channels.cache.get(channelId('bugs'));
  const platform = i.fields.getTextInputValue('platform').trim().toLowerCase(), category = i.fields.getTextInputValue('category').trim().toLowerCase();
  if (!['mobile','pc','console'].includes(platform) || !['gameplay','ui','crash'].includes(category)) throw new Error('Use Mobile / PC / Console and Gameplay / UI / Crash.');
  const tags = channel.availableTags.filter(t => [platform, category].includes(t.name.toLowerCase())).map(t => t.id);
  const thread = await channel.threads.create({ name: i.fields.getTextInputValue('title').slice(0,100), appliedTags: tags, message: { embeds: [embed('🧪 Bug report', `Reporter: <@${i.user.id}>\nPlatform: ${platform}\nCategory: ${category}\n\n${i.fields.getTextInputValue('details')}\n\nEvidence: ${i.fields.getTextInputValue('evidence') || 'None provided'}`)], allowedMentions: { parse: [] } } });
  await i.editReply(`Report submitted: ${thread.url}`);
}
async function suggestion(i) {
  const idea = i.options.getString('idea');
  if (idea.length > 3500) throw new Error('Please keep suggestions under 3,500 characters.');
  const message = await send(guild, 'suggestions', { embeds: [embed('💡 Community suggestion • Pending', `By <@${i.user.id}>\n\n${idea}`)] });
  db.data.suggestions[message.id] = { author: i.user.id, idea, status: 'pending' }; db.save();
  await message.react('✅'); await message.react('❌');
  await message.startThread({ name: `Discuss: ${idea.slice(0, 85)}`, autoArchiveDuration: 1440 });
  await i.editReply(`Suggestion posted: ${message.url}`);
}
async function reviewSuggestion(i) {
  const id = i.options.getString('id'), entry = db.data.suggestions[id];
  if (!entry) throw new Error('Unknown suggestion message ID.');
  const status = i.options.getSubcommand(), reason = i.options.getString('reason').slice(0,1000);
  const message = await guild.channels.cache.get(channelId('suggestions')).messages.fetch(id);
  await message.edit({ embeds: [embed(`💡 Suggestion • ${status === 'approve' ? 'Approved ✅' : 'Denied ❌'}`, `By <@${entry.author}>\n\n${entry.idea}\n\n**Staff decision:** ${reason}`, status === 'approve' ? '#46C985' : '#FF3030')] });
  Object.assign(entry, { status, reason, reviewer: i.user.id }); db.save();
  await i.editReply('Suggestion updated.');
}
async function manageCode(i) {
  const action = i.options.getSubcommand(), code = i.options.getString('code');
  if (action === 'list') return i.editReply({ embeds: [embed('🔑 Active codes', codesText())] });
  if (action === 'remove') { db.data.codes = db.data.codes.filter(c => c.code !== code); db.save(); await send(guild, 'codes', { embeds: [embed('🔑 Code list updated', codesText())] }); return i.editReply('Code removed; current list posted.'); }
  const expires = i.options.getString('expires');
  if (code.length > 64 || /[\s`]/.test(code)) throw new Error('Codes must be 1–64 non-whitespace characters without backticks.');
  if (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) throw new Error('Expiry must be a future ISO date.');
  const reward = i.options.getString('reward').slice(0,500);
  db.data.codes = db.data.codes.filter(c => c.code !== code); db.data.codes.push({ code, reward, expires }); db.save();
  await send(guild, 'codes', { content: `<@&${roleId('code-pings')}>`, allowedMentions: { roles: [roleId('code-pings')] }, embeds: [embed('🔑 Fresh code drop!', `**\`${code}\`** — ${reward}\nRedeem in game. [Play now](${config.game.url})`)] });
  await i.editReply('Code saved and announced.');
}
async function slash(i) {
  const name = i.commandName;
  const elevated = ['suggestion','code','giveaway','event'];
  if (elevated.includes(name) && !staff(i.member, name === 'event' ? config.eventStaffRoles : config.staffRoles.filter(r => r !== 'support'))) return privateReply(i, 'This command is for authorized staff.');
  if (name === 'bugreport') return i.showModal(bugModal());
  await i.deferReply({ flags: funCommands.includes(name) ? undefined : 64 });
  if (funCommands.includes(name)) {
    const now = Date.now();
    if (now - (funCooldowns.get(i.user.id) || 0) < 5000) return i.editReply('🎃 Give the RNG goblin five seconds to breathe.');
    funCooldowns.set(i.user.id, now);
    if (funCooldowns.size > 1000) for (const [id, time] of funCooldowns) if (now - time > 60000) funCooldowns.delete(id);
    return i.editReply({ content: funReply(name, i.options), allowedMentions: { parse: [] } });
  }
  if (moderationCommands.includes(name)) return i.editReply(await moderation(i));
  if (name === 'rank') {
    const user = i.options.getUser('user') || i.user;
    return i.editReply({ files: [await card(user, { xp: db.data.xp[user.id]?.xp || 0 })] });
  }
  if (name === 'leaderboard') {
    const top = Object.entries(db.data.xp).sort((a,b) => b[1].xp - a[1].xp).slice(0, 10);
    return i.editReply({ embeds: [embed('🏆 Community XP leaderboard', top.map(([uid, row], n) => `**${n+1}.** <@${uid}> — level ${levelFor(row.xp)} • ${row.xp.toLocaleString()} XP`).join('\n') || 'Be the first to start your rarity climb!')] });
  }
  if (name === 'codes') return i.editReply({ embeds: [embed('🔑 Active redeem codes', codesText())] });
  if (name === 'game') {
    const stats = await gameStats();
    return i.editReply({ embeds: [embed('🎲 Steal an RNG', `[Play now](${config.game.url}) • by **${config.game.owner}**\nRoll fighters, defend your pads, raid unlocked bases, and rebirth!${stats ? `\n\n🟢 Playing: **${stats.playing.toLocaleString()}**\n👣 Visits: **${stats.visits.toLocaleString()}**\n⭐ Favorites: **${stats.favoritedCount.toLocaleString()}**` : '\nLive stats: [ROBLOX_UNIVERSE_ID NOT CONFIGURED]'}`)] });
  }
  if (name === 'suggest') return suggestion(i);
  if (name === 'suggestion') return reviewSuggestion(i);
  if (name === 'code') return manageCode(i);
  if (name === 'giveaway') {
    const action = i.options.getSubcommand();
    if (action === 'start') { const msg = await startGiveaway(i); return i.editReply(`Giveaway started: ${msg.url}`); }
    const winners = await drawGiveaway(guild, i.options.getString('id'), action === 'reroll');
    return i.editReply(`Draw complete. ${winners.length} winner(s) announced.`);
  }
  if (name === 'event') {
    const event = config.events[i.options.getString('type')];
    const message = await send(guild, 'events', { content: `<@&${roleId(event.ping)}>`, allowedMentions: { roles: [roleId(event.ping)] }, embeds: [embed(event.title, i.options.getString('details').slice(0,3900))] });
    return i.editReply(`Event announced: ${message.url}`);
  }
  throw new Error('Unknown command. Rerun setup to register current commands.');
}
async function interaction(i) {
  if (!i.inGuild() || i.guildId !== process.env.GUILD_ID) return;
  i.member = await guild.members.fetch(i.user.id);
  if (i.member.roles.cache.has(roleId('muted')) || i.member.isCommunicationDisabled()) return privateReply(i, 'Commands and buttons are unavailable while muted.');
  if (i.isButton() && i.customId === 'verify') {
    await i.deferReply({ flags: 64 }); await i.member.roles.add(roleId('verified'), 'Accepted server rules');
    return i.editReply('✅ Verified! Choose your pings in #roles and say hello in #general.');
  }
  if (!i.member.roles.cache.has(roleId('verified')) && !staff(i.member)) return privateReply(i, 'Accept the rules in #rules first.');
  if (i.isButton()) {
    if (i.customId.startsWith('role:')) {
      const key = i.customId.slice(5);
      if (!config.selfRoleGroups.some(g => g.roles.includes(key))) throw new Error('This role is not self-assignable.');
      await i.deferReply({ flags: 64 });
      return enqueue(roleQueues, i.user.id, async () => {
        const member = await guild.members.fetch({ user: i.user.id, force: true });
        const id = roleId(key), had = member.roles.cache.has(id);
        if (had) await member.roles.remove(id); else await member.roles.add(id);
        await i.editReply(`${had ? 'Removed' : 'Added'} ${config.roles.find(r => r.key === key).name}.`);
      });
    }
    if (i.customId.startsWith('ticket:')) return openTicket(i, i.customId.slice(7));
    if (i.customId.startsWith('ticket-')) return ticketAction(i);
    if (i.customId === 'giveaway-enter') return enterGiveaway(i);
  }
  if (i.isModalSubmit()) {
    if (i.customId === 'bug-submit') return submitBug(i);
    if (i.customId === 'ticket-close-reason') return closeTicket(i);
  }
  if (i.isChatInputCommand()) return slash(i);
}
client.on(Events.InteractionCreate, i => interaction(i).catch(async error => {
  await failure('interaction', error);
  const payload = { content: `⚠️ ${error.message.slice(0, 1500)}`, allowedMentions: { parse: [] } };
  if (i.deferred || i.replied) await i.editReply(payload).catch(() => {});
  else await i.reply({ ...payload, flags: 64 }).catch(() => {});
}));

async function messageCreate(m) {
  if (m.guildId !== process.env.GUILD_ID || m.author.bot || !m.member) return;
  if (m.member.roles.cache.has(roleId('muted'))) { await m.delete(); return; }
  if (!m.member.roles.cache.has(roleId('verified'))) return;
  await personality(m, client.user.id, config, channelId, mentionCooldowns).catch(error => failure('bot replies', error));
  const parent = m.channel.isThread() ? m.channel.parentId : m.channelId;
  if (config.features.imageOnly.some(key => channelId(key) === parent) && !staff(m.member)) {
    // Replies inside media discussion threads are allowed; top-level posts require attachments.
    if (!m.channel.isThread() && !m.attachments.some(a => /^(image|video)\//.test(a.contentType || ''))) {
      await m.delete(); const notice = await m.channel.send({ content: '📸 Please attach an image or video here. Use #general for text chat.', allowedMentions: { parse: [] } });
      const timer = setTimeout(() => notice.delete().catch(() => {}), 6000); timer.unref(); return;
    }
  }
  if (m.channelId === channelId('counting')) {
    const expected = db.data.counting.value + 1;
    if (!/^\d+$/.test(m.content) || Number(m.content) !== expected || db.data.counting.user === m.author.id) {
      await m.delete(); return;
    }
    db.data.counting = { value: expected, user: m.author.id }; db.save(); await m.react('✅');
  }
  if (config.features.autoThreads.some(key => channelId(key) === m.channelId) && !m.hasThread) await m.startThread({ name: `${m.author.username}'s ${m.channelId === channelId('rolls') ? 'roll showcase' : 'media'} 🎲`.slice(0,100), autoArchiveDuration: 1440 });
  // Only public conversation earns XP; private support and staff messages never do.
  const spec = config.channels.find(c => c.key && channelId(c.key) === parent);
  if (!spec || spec.policy !== 'public' || m.channelId === channelId('counting')) return;
  const entry = db.data.xp[m.author.id] || { xp: 0, last: 0 };
  if (Date.now() - entry.last < config.leveling.cooldownSeconds * 1000) return;
  entry.xp += randomInt(config.leveling.xpMin, config.leveling.xpMax + 1); entry.last = Date.now();
  db.data.xp[m.author.id] = entry; db.save();
  await syncRank(m.member, rankFor(levelFor(entry.xp)).role);
}
async function syncRank(member, key) {
  for (const rank of config.leveling.ranks) if (rank.role !== key && member.roles.cache.has(roleId(rank.role))) await member.roles.remove(roleId(rank.role));
  if (!member.roles.cache.has(roleId(key))) await member.roles.add(roleId(key));
}
client.on(Events.MessageCreate, m => enqueue(messageQueues, m.channelId, () => messageCreate(m)).catch(error => failure('message', error)));
client.on(Events.GuildMemberAdd, member => {
  if (member.guild.id !== process.env.GUILD_ID) return;
  (async () => {
    await send(guild, 'join-leave-logs', { content: `➕ ${member.user.tag} (${member.id}) joined. Account created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>.` });
    await send(guild, 'welcome', { content: config.copy.welcome.replace('{user}', `<@${member.id}>`), allowedMentions: { users: [member.id] }, files: [await card(member.user, { welcome: true, count: guild.memberCount })] });
    await member.send({ content: config.copy.dm, allowedMentions: { parse: [] } }).catch(() => {});
  })().catch(error => failure('welcome', error));
});
client.on(Events.GuildMemberRemove, member => { if (member.guild.id === process.env.GUILD_ID) send(guild, 'join-leave-logs', { content: `➖ ${member.user.tag} (${member.id}) left.` }).catch(e => failure('leave log', e)); });
client.on(Events.GuildMemberUpdate, (before, after) => {
  if (after.guild.id !== process.env.GUILD_ID || before.premiumSinceTimestamp === after.premiumSinceTimestamp) return;
  (after.premiumSince ? after.roles.add(roleId('booster')) : after.roles.remove(roleId('booster'))).catch(e => failure('booster display role', e));
});
async function logMessage(kind, before, after) {
    if (before.guildId !== process.env.GUILD_ID) return;
    if (['message-logs', 'bot-logs'].some(key => before.channelId === channelId(key))) return;
    // Uncached embed/pin updates have no reliable previous content. They are
    // metadata events, not evidence that a member edited a message.
    if (after && (before.partial || typeof before.content !== 'string')) return;
    if (after?.partial) after = await after.fetch().catch(() => null);
    const author = after?.author || before.author;
    if (!author || author.bot || before.system || after?.system) return;
    if (kind === 'edited' && (!after || before.content === after.content)) return;
  const text = config.features.logMessageContent ? `\nBefore: ${before.content || '[not cached]'}${after ? `\nAfter: ${after.content || '[empty]'}` : ''}` : '\nContent retention is disabled in config.';
    await send(guild, 'message-logs', { embeds: [embed(`📝 Message ${kind}`, `Channel: <#${before.channelId}>\nAuthor: ${author.id}\nMessage: ${before.id}${text}`.slice(0,3900))] });
}
client.on(Events.MessageDelete, m => logMessage('deleted', m).catch(e => failure('delete log', e)));
client.on(Events.MessageUpdate, (a,b) => logMessage('edited', a,b).catch(e => failure('edit log', e)));

async function voice(old, next) {
  if (next.guild.id !== process.env.GUILD_ID) return;
  if (next.channelId === channelId('create-voice') && old.channelId !== next.channelId && !voiceCreating.has(next.id)) {
    voiceCreating.add(next.id);
    try {
      if (!next.member.roles.cache.has(roleId('verified')) || next.member.roles.cache.has(roleId('muted'))) return;
      let room = db.data.tempVoice.find(t => t.owner === next.id && guild.channels.cache.has(t.id));
      let channel = room ? guild.channels.cache.get(room.id) : null;
      if (!channel) {
        channel = await guild.channels.create({ name: `🎲 ${next.member.displayName}'s squad`.slice(0,100), type: ChannelType.GuildVoice, parent: channelId('voice'), userLimit: 10, permissionOverwrites: renderOverwrites('public', guild.id, client.user.id) });
        db.data.tempVoice.push({ id: channel.id, owner: next.id }); db.save();
      }
      if (next.member.voice.channelId === channelId('create-voice')) await next.member.voice.setChannel(channel);
    } finally { voiceCreating.delete(next.id); }
  }
  await cleanupVoice();
}
async function cleanupVoice() {
  for (const room of [...db.data.tempVoice]) {
    const ch = guild.channels.cache.get(room.id);
    if (!ch || ch.members.size === 0) {
      if (ch) await ch.delete('Empty temporary voice room');
      db.data.tempVoice = db.data.tempVoice.filter(t => t.id !== room.id); db.save();
    }
  }
}
client.on(Events.VoiceStateUpdate, (a,b) => enqueue(messageQueues, 'voice', () => voice(a,b)).catch(e => failure('voice', e)));
client.on(Events.ThreadCreate, thread => {
  if (thread.guildId !== process.env.GUILD_ID) return;
  if (thread.parentId === channelId('trading')) thread.send({ content: config.sticky.trading, allowedMentions: { parse: [] } }).catch(e => failure('trading sticky',e));
  if (thread.parentId === channelId('bugs')) thread.send({ content: '🧪 Report template: **Platform** • **Steps to reproduce** • **Expected result** • **Actual result** • **Evidence link**. For private or exploit-related details, open a ticket.', allowedMentions: { parse: [] } }).catch(e => failure('bug template',e));
});

async function tick() {
  if (timerRunning) return;
  timerRunning = true;
  try {
    await tickGiveaways(guild).catch(e => failure('giveaways', e));
    await weeklyLeaderboard(guild).catch(e => failure('weekly leaderboard', e));
    if (config.features.witchingHourReminders) {
      const hour = Math.floor(Date.now() / 3600000);
      if (db.data.reminders.witching !== hour && new Date().getUTCMinutes() === 0) {
        await send(guild, 'events', { content: `<@&${roleId('witching-pings')}>`, allowedMentions: { roles: [roleId('witching-pings')] }, embeds: [embed('👹 Witching Hour!', 'Hourly reminder: check in-game alerts for zombies and candy corn.')] });
        db.data.reminders.witching = hour; db.save();
      }
    }
  } finally { timerRunning = false; }
}
client.once(Events.ClientReady, async () => {
  try {
    if (client.user.id !== process.env.CLIENT_ID) throw new Error('CLIENT_ID does not match the token.');
    guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.channels.fetch(); await guild.roles.fetch(); await guild.members.fetchMe();
    await recoverTickets(guild); await cleanupVoice();
    await tick();
    // Channel renames have a separate, strict Discord bucket. A queued rename
    // must never delay presence, readiness reporting, or live interactions.
    updateGameStats(guild).catch(e => failure('Roblox stats', e));
    const presence = () => client.user.setPresence({ activities: [{ name: config.presence[presenceIndex++ % config.presence.length], type: ActivityType.Playing }], status: 'online' });
    presence();
    timers.push(setInterval(presence, 60000), setInterval(() => tick().catch(e => failure('scheduler',e)), 15000), setInterval(() => updateGameStats(guild).catch(e => failure('Roblox stats',e)), config.game.statsIntervalMinutes * 60000));
    await send(guild, 'status', { embeds: [embed('🟢 Community systems online', `Tickets, roles, suggestions, giveaways, and XP are ready.\n[Play Steal an RNG](${config.game.url})\n${process.env.ROBLOX_UNIVERSE_ID ? 'Live Roblox player counts are enabled.' : 'Live player counts: [UNIVERSE ID NOT CONFIGURED]'}`)] });
    log(`Online as ${client.user.tag} in ${guild.name}`);
  } catch (error) { await failure('startup', error); shutdown(1); }
});
client.on(Events.Error, e => failure('client', e));
function shutdown(code = 0) { for (const timer of timers) clearInterval(timer); db.save(); client.destroy(); process.exitCode = code; }
process.on('SIGINT', () => shutdown()); process.on('SIGTERM', () => shutdown());
client.login(process.env.DISCORD_TOKEN).catch(error => { log('Login failed', error.message); shutdown(1); });
