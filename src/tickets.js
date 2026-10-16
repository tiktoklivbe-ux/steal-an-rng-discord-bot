import { ChannelType, AttachmentBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { config, db, channelId, roleId, renderOverwrites, embed, buttons, staff, privateReply, send, escapeHtml, sleep } from './core.js';

const opening = new Set(), operating = new Set();
export async function openTicket(i, type) {
  const spec = config.ticketTypes.find(t => t.key === type);
  if (!spec) throw new Error('Unknown ticket type');
  const key = `${i.user.id}:${type}`;
  if (opening.has(key)) return privateReply(i, 'Your ticket is already being opened.');
  opening.add(key);
  try {
    await i.deferReply({ flags: 64 });
    const prior = Object.values(db.data.tickets).find(t => t.user === i.user.id && t.type === type && t.status !== 'closed');
    if (prior && i.guild.channels.cache.has(prior.channel)) return i.editReply(`Your existing ticket: <#${prior.channel}>`);
    if (prior) { prior.status = 'closed'; db.save(); }
    const overwrites = renderOverwrites('tickets', i.guild.id, i.client.user.id);
    overwrites.push({ id: i.user.id, allow: ['ViewChannel','SendMessages','ReadMessageHistory','AttachFiles','EmbedLinks'] });
    const ch = await i.guild.channels.create({ name: `${type}-${i.user.id}`, type: ChannelType.GuildText, parent: channelId('tickets'), permissionOverwrites: overwrites, topic: `Private ${spec.label} ticket • user ${i.user.id}` });
    db.data.tickets[ch.id] = { channel: ch.id, user: i.user.id, type, status: 'open', created: Date.now(), claimed: null };
    db.save();
    await ch.send({ content: `<@${i.user.id}>`, allowedMentions: { users: [i.user.id] }, embeds: [embed(spec.label, 'Tell us what happened, when, and what help you need. Include relevant evidence links. Never share passwords or login cookies.\n\nSupport and moderators can claim this ticket. Closing requires a reason and saves a transcript.')], components: buttons([{ id: 'ticket-claim', label: 'Claim' }, { id: 'ticket-transcript', label: 'Transcript' }, { id: 'ticket-close', label: 'Close', style: 4 }]) });
    await i.editReply(`Ticket ready: <#${ch.id}>`);
  } finally { opening.delete(key); }
}
function authorized(i, ticket, staffOnly = false) {
  return ticket && (staff(i.member) || (!staffOnly && ticket.user === i.user.id));
}
export async function transcript(guild, ticket, reason = 'Manual export') {
  const channel = guild.channels.cache.get(ticket.channel);
  const messages = [];
  let before;
  let truncated = false;
  while (channel && messages.length < config.tickets.maxTranscriptMessages) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, config.tickets.maxTranscriptMessages - messages.length), ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values()); before = batch.last().id;
    if (batch.size < 100) break;
    if (messages.length >= config.tickets.maxTranscriptMessages) truncated = true;
  }
  messages.reverse();
  const header = `Ticket ${ticket.channel} | Opener ${ticket.user} | Type ${ticket.type} | Reason: ${reason}\n${truncated ? 'TRANSCRIPT LIMIT REACHED — older history omitted\n' : ''}`;
  const lines = messages.map(m => `${new Date(m.createdTimestamp).toISOString()} ${m.author?.tag || 'Unknown'} (${m.author?.id || '?'})\n${m.content}\n${m.embeds.map(e => [e.title, e.description].filter(Boolean).join('\n')).join('\n')}\n${[...m.attachments.values()].map(a => a.url).join('\n')}`);
  const plain = header + '\n' + lines.join('\n\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Ticket transcript</title><style>body{background:#211039;color:#fff;font:15px sans-serif;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>Steal an RNG • Ticket</h1><pre>${escapeHtml(plain)}</pre></body></html>`;
  // Split oversized exports into independently readable text chunks; never close if upload fails.
  const buffer = Buffer.from(plain);
  const chunkSize = Math.max(1024, Math.min(guild.maximumUploadLimit || 8_000_000, 8_000_000) - 10000);
  const exports = [];
  for (let n = 0; n < buffer.length; n += chunkSize) exports.push(new AttachmentBuilder(buffer.subarray(n, n + chunkSize), { name: `ticket-${ticket.channel}-${Math.floor(n / chunkSize) + 1}.txt` }));
  if (Buffer.byteLength(html) < chunkSize) exports.push(new AttachmentBuilder(Buffer.from(html), { name: `ticket-${ticket.channel}.html` }));
  let receipt;
  for (let n = 0; n < exports.length; n += 2) receipt = await send(guild, 'ticket-logs', { content: `Ticket ${ticket.channel} • opener ${ticket.user} • ${reason.slice(0, 1000)}`, files: exports.slice(n, n + 2) });
  return receipt;
}
export async function ticketAction(i) {
  const ticket = db.data.tickets[i.channelId];
  if (!authorized(i, ticket)) return privateReply(i, 'You cannot manage this ticket.');
  if (i.customId === 'ticket-close') {
    if (ticket.status === 'closing' || ticket.status === 'closed') return privateReply(i, 'This ticket is already closing.');
    return i.showModal(new ModalBuilder().setCustomId('ticket-close-reason').setTitle('Close ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Why are you closing this ticket?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
  }
  await i.deferReply({ flags: 64 });
  if (i.customId === 'ticket-claim') {
    if (!authorized(i, ticket, true)) return i.editReply('Only Support / moderators can claim tickets.');
    if (ticket.claimed && ticket.claimed !== i.user.id) return i.editReply(`Already claimed by <@${ticket.claimed}>.`);
    ticket.claimed = i.user.id; db.save();
    await i.channel.send({ content: `Claimed by <@${i.user.id}>.`, allowedMentions: { parse: [] } });
    return i.editReply('Ticket claimed.');
  }
  if (i.customId === 'ticket-transcript') { const receipt = await transcript(i.guild, ticket); return i.editReply(`Saved to staff ticket logs: ${receipt.url}`); }
}
export async function closeTicket(i) {
  const ticket = db.data.tickets[i.channelId];
  if (!authorized(i, ticket)) return privateReply(i, 'You cannot close this ticket.');
  if (operating.has(ticket.channel) || ticket.status !== 'open') return privateReply(i, 'This ticket is already closing.');
  operating.add(ticket.channel);
  await i.deferReply({ flags: 64 });
  try {
    const reason = i.fields.getTextInputValue('reason');
    ticket.status = 'closing'; ticket.reason = reason; ticket.closedBy = i.user.id; db.save();
    await i.channel.permissionOverwrites.edit(ticket.user, { SendMessages: false, AttachFiles: false });
    const receipt = await transcript(i.guild, ticket, reason);
    ticket.transcript = receipt.id; ticket.status = 'closed'; ticket.closed = Date.now(); db.save();
    await i.editReply('Transcript saved. This channel will close shortly.');
    await sleep(config.tickets.deleteAfterCloseSeconds * 1000);
    await i.channel.delete(`Ticket closed by ${i.user.id}: ${reason.slice(0, 300)}`);
  } catch (error) {
    if (!ticket.transcript) { ticket.status = 'open'; db.save(); await i.channel.permissionOverwrites.edit(ticket.user, { SendMessages: true, AttachFiles: true }).catch(() => {}); }
    throw error;
  } finally { operating.delete(ticket.channel); }
}
export async function recoverTickets(guild) {
  for (const ticket of Object.values(db.data.tickets)) {
    const ch = guild.channels.cache.get(ticket.channel);
    if (!ch && ticket.status !== 'closed') ticket.status = 'closed';
    if (ch && ticket.status === 'closing' && !ticket.transcript) {
      ticket.status = 'open'; await ch.permissionOverwrites.edit(ticket.user, { SendMessages: true, AttachFiles: true });
    }
    if (ch && ticket.status === 'closed' && ticket.transcript) await ch.delete('Recover completed ticket close');
  }
  db.save();
}
