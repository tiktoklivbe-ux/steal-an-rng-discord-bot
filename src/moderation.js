import { PermissionFlagsBits } from 'discord.js';
import { db, roleId, send, embed } from './core.js';

const permissions = { warn: 'ModerateMembers', timeout: 'ModerateMembers', kick: 'KickMembers', ban: 'BanMembers', purge: 'ManageMessages', slowmode: 'ManageChannels', lock: 'ManageChannels' };
export const moderationCommands = Object.keys(permissions);
export async function moderation(i) {
  const action = i.commandName;
  if (!i.member.permissions.has(permissions[action])) throw new Error(`You need ${permissions[action]}.`);
  if (!i.guild.members.me.permissions.has(permissions[action]) && action !== 'warn') throw new Error(`Bot needs ${permissions[action]}.`);
  let target;
  const user = i.options.getUser('user');
  if (user) {
    target = await i.guild.members.fetch(user.id).catch(e => { if (e.code !== 10007) throw e; return null; });
    if (!target) throw new Error('Target must be a current server member.');
    if (user.id === i.user.id || user.id === i.client.user.id || user.id === i.guild.ownerId || target.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('You cannot moderate this member.');
    if (i.user.id !== i.guild.ownerId && i.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) throw new Error('Target must be below your highest role.');
    if (i.guild.members.me.roles.highest.comparePositionTo(target.roles.highest) <= 0) throw new Error('Target must be below the bot role.');
  }
  const reason = (i.options.getString('reason') || `${action} in ${i.channelId}`).slice(0, 1000);
  const entry = { id: db.data.cases.length + 1, action, actor: i.user.id, target: user?.id || i.channelId, reason, at: Date.now(), status: 'pending' };
  db.data.cases.push(entry); db.save();
  try {
    const audit = `Case #${entry.id} by ${i.user.id}: ${reason}`.slice(0, 512);
    if (action === 'timeout') { if (!target.moderatable) throw new Error('Member cannot be timed out.'); await target.timeout(i.options.getInteger('minutes') * 60000, audit); }
    if (action === 'kick') { if (!target.kickable) throw new Error('Member cannot be kicked.'); await target.kick(audit); }
    if (action === 'ban') { if (!target.bannable) throw new Error('Member cannot be banned.'); await target.ban({ reason: audit }); }
    if (action === 'purge') {
      if (!i.channel.bulkDelete) throw new Error('This channel does not support bulk deletion.');
      const deleted = await i.channel.bulkDelete(i.options.getInteger('amount'), true); entry.deleted = deleted.size;
    }
    if (action === 'slowmode') { if (!i.channel.setRateLimitPerUser) throw new Error('This channel has no slowmode.'); await i.channel.setRateLimitPerUser(i.options.getInteger('seconds'), audit); }
    if (action === 'lock') {
      if (!i.channel.permissionOverwrites) throw new Error('Lock the parent channel instead.');
      const id = roleId('verified'), key = i.channelId;
      if (i.options.getBoolean('locked')) {
        if (!db.data.locks[key]) {
          const old = i.channel.permissionOverwrites.cache.get(id);
          db.data.locks[key] = { allow: old?.allow.bitfield.toString() || '0', deny: old?.deny.bitfield.toString() || '0', existed: !!old };
          db.save();
        }
        await i.channel.permissionOverwrites.edit(id, { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false }, { reason: audit });
      } else {
        const saved = db.data.locks[key];
        if (!saved) throw new Error('No saved lock to restore.');
        if (saved.existed) await i.channel.permissionOverwrites.edit(id, Object.fromEntries(Object.entries(PermissionFlagsBits).map(([key, bit]) => [key, (BigInt(saved.allow) & bit) !== 0n ? true : (BigInt(saved.deny) & bit) !== 0n ? false : null])), { reason: audit });
        else await i.channel.permissionOverwrites.delete(id, audit);
        delete db.data.locks[key]; db.save();
      }
    }
    entry.status = 'completed'; db.save();
  } catch (error) { entry.status = 'failed'; entry.error = error.message; db.save(); throw error; }
  await send(i.guild, 'mod-logs', { embeds: [embed(`🔨 Case #${entry.id} • ${action}`, `Actor: <@${entry.actor}>\nTarget: ${entry.target}\nReason: ${reason}${entry.deleted !== undefined ? `\nDeleted: ${entry.deleted}` : ''}`)] });
  return `Case #${entry.id}: ${action} completed.${entry.deleted !== undefined ? ` Deleted ${entry.deleted} recent messages.` : ''}`;
}
