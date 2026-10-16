import { randomInt } from 'node:crypto';
import { config, db, embed, buttons, send, roleId, privateReply } from './core.js';

const drawing = new Set();
export async function enterGiveaway(i) {
  const g = db.data.giveaways[i.message.id];
  if (!g || g.ended || drawing.has(g.id) || Date.now() >= g.ends) return privateReply(i, 'This giveaway has ended.');
  if (g.role && !i.member.roles.cache.has(g.role)) return privateReply(i, 'You do not have the required role.');
  if (g.entries.includes(i.user.id)) { g.entries = g.entries.filter(id => id !== i.user.id); db.save(); return privateReply(i, 'Entry removed.'); }
  g.entries.push(i.user.id); db.save(); return privateReply(i, '🎁 You are entered. Tap again to leave.');
}
export async function startGiveaway(i) {
  const minutes = i.options.getInteger('minutes'), prize = i.options.getString('prize'), role = i.options.getRole('role');
  const ends = Date.now() + minutes * 60000;
  const msg = await send(i.guild, 'giveaways', { content: `<@&${roleId('giveaway-pings')}>`, allowedMentions: { roles: [roleId('giveaway-pings')] }, embeds: [embed('🎁 GIVEAWAY — good luck, raiders!', `**${prize.slice(0, 1000)}**\nEnds <t:${Math.floor(ends / 1000)}:R>\nWinners: ${i.options.getInteger('winners') || 1}\n${role ? `Required role: <@&${role.id}>` : 'All verified members may enter.'}\nTap to enter or withdraw. Never pay to enter.`)], components: buttons([{ id: 'giveaway-enter', label: '🎁 Enter / Leave', style: 1 }]) });
  db.data.giveaways[msg.id] = { id: msg.id, channel: msg.channelId, prize, role: role?.id || null, ends, winners: i.options.getInteger('winners') || 1, entries: [], ended: false, draws: [] }; db.save();
  return msg;
}
export async function drawGiveaway(guild, id, reroll = false) {
  const g = db.data.giveaways[id];
  if (!g) throw new Error('Unknown giveaway message ID.');
  if (drawing.has(id)) throw new Error('A draw is already in progress.');
  if (reroll && !g.ended) throw new Error('End the giveaway before rerolling.');
  if (!reroll && g.ended) throw new Error('Already ended; use reroll.');
  drawing.add(id);
  try {
    const previous = new Set(g.draws.flatMap(d => d.winners));
    const pool = [];
    for (const uid of g.entries) {
      const member = await guild.members.fetch(uid).catch(e => { if (e.code !== 10007) throw e; return null; });
      if (member && !member.user.bot && (!g.role || member.roles.cache.has(g.role)) && (!reroll || !previous.has(uid))) pool.push(uid);
    }
    const winners = [];
    while (pool.length && winners.length < g.winners) winners.push(pool.splice(randomInt(pool.length), 1)[0]);
    g.ended = true; g.draws.push({ at: Date.now(), winners, published: false }); db.save();
    await publishDraw(guild, g);
    return winners;
  } finally { drawing.delete(id); }
}
async function publishDraw(guild, g) {
  const draw = g.draws.at(-1);
  const channel = guild.channels.cache.get(g.channel);
  if (!channel) throw new Error(`Giveaway channel missing: ${g.channel}`);
  const message = await channel.messages.fetch(g.id);
  await message.edit({ embeds: [embed(`🎁 ${g.draws.length > 1 ? 'Rerolled' : 'Ended'}: ${g.prize.slice(0, 180)}`, draw.winners.length ? `Winners: ${draw.winners.map(uid => `<@${uid}>`).join(', ')}\nContact staff through a ticket to claim your prize.` : 'No eligible entries remain.')], components: [] });
  await channel.send({ content: draw.winners.length ? `🎉 Giveaway winners: ${draw.winners.map(uid => `<@${uid}>`).join(', ')}! Prize: ${g.prize.slice(0, 1000)}` : `Giveaway ended without eligible entries: ${g.prize.slice(0, 1000)}`, allowedMentions: { users: draw.winners } });
  draw.published = true; db.save();
}
export async function tickGiveaways(guild) {
  for (const g of Object.values(db.data.giveaways)) {
    if (!g.ended && g.ends <= Date.now()) await drawGiveaway(guild, g.id);
    else if (g.ended && g.draws.at(-1)?.published === false && !drawing.has(g.id)) await publishDraw(guild, g);
  }
}
