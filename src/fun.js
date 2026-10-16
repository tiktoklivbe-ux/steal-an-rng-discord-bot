import { randomInt } from 'node:crypto';
export const funCommands = ['roll', '8ball', 'coinflip', 'dice', 'roast', 'heist'];
const pick = (items, rng) => items[rng(items.length)];
export function funReply(name, options, rng = randomInt) {
  if (name === 'coinflip') return `🪙 **${pick(['Heads', 'Tails'], rng)}!** The coin has spoken. Try coping.`;
  if (name === 'dice') { const sides = options.getInteger('sides') || 6; return `🎲 **${rng(sides) + 1} / ${sides}**. A stunning display of clicking a command.`; }
  if (name === '8ball') return `🎱 ${pick(['Absolutely. Somehow.', 'No. Even RNG has standards.', 'Probably, if you stop procrastinating.', 'The spirits say yes. I demand a recount.', 'Ask again later. My attitude is recharging.', 'Outlook: suspiciously lucky.', 'Not a chance. Blame the pumpkin.'], rng)}`;
  if (name === 'roast') return `🔥 ${pick(['Your luck is so low the tutorial gives you sympathy drops.', 'You guard your base like the lock button costs rent.', 'Your inventory has more hopes than legendaries.', 'You have main-character energy and tutorial-NPC stats.', 'Your strategy is just panic with extra steps.'], rng)}`;
  if (name === 'heist') return `🎃 ${pick(['You escaped with 300 imaginary candy corn. The pumpkin guards are embarrassed.', 'You tripped over your own loot sack. The guards gave you a participation candy.', 'You stole a haunted crown. It immediately started judging your outfit.', 'Your getaway cart turned into a pumpkin. Seasonal budgeting strikes again.'], rng)}\n*Story only—no cash, items, or game rewards.*`;
  if (name === 'roll') {
    const n = rng(10000);
    const rarity = n < 6000 ? 'Street ⚪' : n < 8500 ? 'Forged 🟤' : n < 9500 ? 'Awakened 🌸' : n < 9900 ? 'Legendary 🟡' : n < 9990 ? 'Mythic 🔴' : 'OMEGA 💖';
    return `🎲 You rolled **${rarity}**! ${n < 9500 ? 'The RNG goblin sends its regards.' : 'Fine. That was actually pretty lucky.'}\n*Discord fun roll only—no game rewards or XP.*`;
  }
  throw new Error('Unknown fun command');
}
