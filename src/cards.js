import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { config, levelFor, rankFor } from './core.js';

export async function card(user, { welcome = false, count = 0, xp = 0 } = {}) {
  const canvas = createCanvas(960, 300);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 960, 300);
  gradient.addColorStop(0, '#211039'); gradient.addColorStop(1, '#5F1648');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 300);
  ctx.fillStyle = '#FF9B30'; ctx.fillRect(0, 0, 960, 12);
  ctx.fillStyle = '#FF2878'; ctx.fillRect(0, 288, 960, 12);
  for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#FF9B3030' : '#FF287830'; ctx.beginPath(); ctx.arc(i * 83, (i * 67) % 300, 26, 0, Math.PI * 2); ctx.fill(); }
  try {
    const response = await fetch(user.displayAvatarURL({ extension: 'png', size: 256 }), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Avatar fetch failed');
    const avatar = await loadImage(Buffer.from(await response.arrayBuffer()));
    ctx.save(); ctx.beginPath(); ctx.arc(144, 150, 94, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 50, 56, 188, 188); ctx.restore();
  } catch { ctx.fillStyle = '#FF9B30'; ctx.beginPath(); ctx.arc(144, 150, 94, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#FFCA54'; ctx.font = 'bold 24px sans-serif'; ctx.fillText('STEAL AN RNG  /  HALLOWEEN', 274, 70);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 42px sans-serif';
  let name = user.globalName || user.username;
  while (ctx.measureText(name).width > 640) name = name.slice(0, -2) + '…';
  ctx.fillText(name, 274, 126);
  ctx.font = '24px sans-serif';
  if (welcome) {
    ctx.fillText(`Welcome, raider!  Member #${count.toLocaleString()}`, 274, 180);
    ctx.fillStyle = '#FFD1ED'; ctx.fillText('Roll. Raid. Rebirth. Your OMEGA arc starts here.', 274, 226);
  } else {
    const level = levelFor(xp), rank = rankFor(level);
    ctx.fillText(`Level ${level}  •  ${config.roles.find(r => r.key === rank.role).name}  •  ${xp.toLocaleString()} XP`, 274, 178);
    const floor = level ** 2 * config.leveling.xpPerLevelSquared;
    const ceiling = (level + 1) ** 2 * config.leveling.xpPerLevelSquared;
    ctx.fillStyle = '#FFFFFF30'; ctx.fillRect(274, 210, 620, 25);
    ctx.fillStyle = '#FF2878'; ctx.fillRect(274, 210, 620 * (xp - floor) / (ceiling - floor), 25);
  }
  return new AttachmentBuilder(await canvas.encode('png'), { name: welcome ? 'welcome.png' : 'rank.png' });
}
