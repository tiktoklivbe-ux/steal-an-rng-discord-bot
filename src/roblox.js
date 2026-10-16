import fs from 'node:fs';
import path from 'node:path';
import { config, root, db, send, embed, channelId } from './core.js';

let cached = null, cachedAt = 0, statsUpdating = false;
export async function gameStats() {
  if (!process.env.ROBLOX_UNIVERSE_ID) return null;
  if (!/^\d+$/.test(process.env.ROBLOX_UNIVERSE_ID)) throw new Error('ROBLOX_UNIVERSE_ID must be numeric.');
  if (cached && Date.now() - cachedAt < 60000) return cached;
  const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${process.env.ROBLOX_UNIVERSE_ID}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Roblox API returned ${response.status}`);
  cached = (await response.json()).data?.[0]; cachedAt = Date.now();
  if (!cached) throw new Error('Roblox universe not found. Use a universe ID, not a place ID.');
  return cached;
}
export async function updateGameStats(guild) {
  if (statsUpdating) return;
  statsUpdating = true;
  try {
    const stats = await gameStats();
    if (!stats) return;
    const ch = guild.channels.cache.get(channelId('player-count'));
    const name = `🟢 Playing: ${stats.playing.toLocaleString('en-US')}`;
    if (ch && ch.name !== name) await ch.setName(name);
  } finally { statsUpdating = false; }
}
export async function weeklyLeaderboard(guild) {
  if (!config.features.weeklyGameLeaderboard) return;
  const week = Math.floor(Date.now() / (7 * 86400000));
  if (db.data.weekly === week) return;
  const file = path.resolve(root, config.game.leaderboardExport);
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.generatedAt || Date.now() - Date.parse(data.generatedAt) > 7 * 86400000 || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('Game leaderboard export is missing a fresh generatedAt timestamp.');
  const description = ['kills','cash','steals'].map(key => {
    if (!Array.isArray(data[key])) throw new Error(`Game export missing ${key}`);
    return `**${key.toUpperCase()}**\n` + data[key].slice(0, 10).map((row, index) => `${index + 1}. ${String(row.username).replace(/[*_`~|<>@]/g, '').slice(0, 40)} — ${Number(row.value).toLocaleString('en-US')}`).join('\n');
  }).join('\n\n');
  await send(guild, 'leaderboards', { embeds: [embed('🏆 Weekly raid leaders', description)] });
  db.data.weekly = week; db.save();
}
