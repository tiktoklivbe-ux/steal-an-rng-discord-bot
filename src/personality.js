export const stefonId = process.env.REACTION_USER_ID || '';
export const stefonLetters = ['🇸', '🇹', '🇪', '🇫', '🇴', '🇳'];

export function saltyAnswer(question, config, channelId, codes = []) {
  const q = question.toLowerCase().trim();
  const channel = key => `<#${channelId(key)}>`;
  let answer;
  if (!q) answer = 'You rang? Ask an actual question. My crystal ball is on cooldown.';
  else if (/\b(verify|verification|unlock|private|locked channels)\b/.test(q)) answer = `Read the rules and press Verify in ${channel('verify')}. Yes, the button has a purpose. That unlocks community channels; staff areas still need staff roles.`;
  else if (/\b(code|codes)\b/.test(q)) answer = 'Use /codes for confirmed active codes. No, I am not inventing free rewards because you asked aggressively.';
  else if (/\b(ticket|support|help|report|bug|appeal)\b/.test(q)) answer = `Open a private ticket in ${channel('ticket-panel')}. Include what happened and evidence. “It broke” is a vibe, not a bug report.`;
  else if (/\b(play|game link|join game)\b/.test(q)) answer = `Play here: ${config.game.url}. There, your epic quest to find a link is complete.`;
  else if (/\b(owner|developer|made|created|stefon|stefunkwn)\b/.test(q)) answer = `Steal an RNG is developed by ${config.game.owner}. Stefon owns this Discord. I just work here and judge the questions.`;
  else if (/\b(rank|ranks|rarity|rarities|xp|level|levels)\b/.test(q)) answer = 'Discord ranks come from chat XP; /rank and /leaderboard show your progress. They do not grant game abilities. Shocking, I know. Rarities: Street → Forged → Awakened → Ascended → Legendary → Mythic → Divine → Celestial → Forbidden → Absolute → OMEGA → Admin-only.';
  else if (/\b(roll|rolling|rolls|luck)\b/.test(q)) answer = 'Use the Roll control in game. Current costs and luck boosts are shown in its UI. Staring at me does not improve your odds.';
  else if (/\b(rebirth|rebirths)\b/.test(q)) answer = 'Rebirths unlock multipliers and movement perks. Read the confirmation screen to see what resets before clicking. A radical strategy, reading.';
  else if (/\b(steal|stealing|raid|base|lock)\b/.test(q)) answer = 'Raid unlocked bases and follow the in-game carrying and escape prompts. Use your base lock control to protect your units; its timer and cooldown are shown in game. Defenders may object. Weird, right?';
  else if (/\b(event|events|witching|kong|godzilla|weather)\b/.test(q)) answer = `Check ${channel('events')} and in-game alerts for confirmed events. Witching Hour is hourly in game; unconfirmed dates stay unconfirmed. I am salty, not psychic.`;
  else if (/\b(role|roles|ping|pings)\b/.test(q)) answer = `Choose optional platform, region, and notification roles in ${channel('roles')}. Staff roles are assigned by staff. Asking loudly is not a promotion system.`;
  else if (/\b(hello|hi|hey|sup)\b/.test(q)) answer = 'Oh good, another ping. What do you need, legendary question asker?';
  else answer = `I don’t have a reliable answer to that. My current knowledge covers this server and Steal an RNG—try verification, rolls, ranks, events, roles, or support. Even my attitude has limits.`;
  return answer;
}

export async function personality(message, botId, config, channelId, cooldowns, now = Date.now()) {
  if (message.author.id === stefonId) {
    for (const letter of stefonLetters) await message.react(letter).catch(() => {});
  }
  if (!message.mentions.users.has(botId)) return;
  const key = message.author.id;
  if (now - (cooldowns.get(key) || 0) < 8000) return;
  cooldowns.set(key, now);
  // Bound memory without retaining messages or conversations.
  if (cooldowns.size > 1000) for (const [id, time] of cooldowns) if (now - time > 60000) cooldowns.delete(id);
  const question = message.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
  await message.reply({ content: saltyAnswer(question, config, channelId), allowedMentions: { parse: [], repliedUser: false } });
}
