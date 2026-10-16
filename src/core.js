import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { Store, setupDefaults, runtimeDefaults } from './store.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(fs.readFileSync(path.join(root, 'config/server.json'), 'utf8'));
export const manifest = new Store(path.join(root, 'data/setup.json'), setupDefaults);
export const db = new Store(path.join(root, 'data/runtime.json'), runtimeDefaults);
export const log = (message, detail = '') => console.log(new Date().toISOString(), message, detail);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function requireEnv() {
  for (const key of ['DISCORD_TOKEN', 'GUILD_ID', 'CLIENT_ID']) if (!process.env[key]) throw new Error(`Missing ${key}; copy .env.example to .env and fill it in.`);
  for (const key of ['GUILD_ID', 'CLIENT_ID']) if (!/^\d{17,20}$/.test(process.env[key])) throw new Error(`${key} must be a Discord snowflake.`);
  if (manifest.data.guildId && manifest.data.guildId !== process.env.GUILD_ID) throw new Error('data/setup.json belongs to another guild. Use a separate project/data folder.');
}
export function makeClient(live = false) {
  return new Client({ intents: live ? [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates] : [GatewayIntentBits.Guilds], partials: [Partials.Message, Partials.Channel] });
}
export const roleId = key => manifest.data.roles[key];
export const channelId = key => manifest.data.channels[key];
export const perms = names => new PermissionsBitField(names);
export function embed(title, description, color = config.theme.color) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description || '🎲 Steal an RNG').setFooter({ text: config.theme.footer }).setTimestamp();
}
export function buttons(items) {
  const result = [];
  for (let n = 0; n < items.length; n += 5) result.push(new ActionRowBuilder().addComponents(items.slice(n, n + 5).map(item => new ButtonBuilder().setCustomId(item.id).setLabel(item.label).setStyle(item.style || ButtonStyle.Secondary))));
  return result;
}
export const privateReply = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
export async function send(guild, key, payload) {
  const channel = guild.channels.cache.get(channelId(key));
  if (!channel?.isTextBased() || !channel.send) throw new Error(`Missing writable channel: ${key}. Run setup.`);
  return channel.send({ allowedMentions: { parse: [] }, ...payload });
}
export function staff(member, groups = config.staffRoles) {
  return member.id === member.guild.ownerId || member.permissions.has('Administrator') || groups.some(key => member.roles.cache.has(roleId(key)));
}
export function levelFor(xp) { return Math.floor(Math.sqrt(xp / config.leveling.xpPerLevelSquared)); }
export function rankFor(level) { return [...config.leveling.ranks].reverse().find(rank => level >= rank.level); }
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
export function renderOverwrites(policy, guildId, botId) {
  const entries = new Map();
  for (const item of config.permissions[policy]) {
    const id = item.target === 'everyone' ? guildId : item.target === 'bot' ? botId : roleId(item.target);
    if (!id) throw new Error(`Unknown permission target ${item.target}`);
    entries.set(id, { id, allow: perms(item.allow || []), deny: perms(item.deny || []) });
  }
  return [...entries.values()];
}
