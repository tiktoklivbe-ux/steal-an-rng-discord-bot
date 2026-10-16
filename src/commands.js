import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const command = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description);
const str = (builder, name, description, required = true) => builder.addStringOption(o => o.setName(name).setDescription(description).setRequired(required));
const user = builder => builder.addUserOption(o => o.setName('user').setDescription('Member').setRequired(true));
const integer = (builder, name, description, min, max, required = true) => builder.addIntegerOption(o => o.setName(name).setDescription(description).setMinValue(min).setMaxValue(max).setRequired(required));
const mod = (builder, permission) => builder.setDefaultMemberPermissions(permission);

export const commands = [
  command('roll', 'Roll a pretend rarity for fun (no game rewards)'),
  str(command('8ball', 'Ask the salty magic 8-ball'), 'question', 'Your question'),
  command('coinflip', 'Flip a coin and let fate judge you'),
  integer(command('dice', 'Roll a die'), 'sides', 'Number of sides (default 6)', 2, 100, false),
  command('roast', 'Get a playful roast from the bot'),
  command('heist', 'Try a pretend Halloween heist (no game rewards)'),
  command('rank', 'Your community XP and rarity rank').addUserOption(o => o.setName('user').setDescription('View another member')),
  command('leaderboard', 'Top community chat ranks'),
  command('codes', 'Active official game codes'),
  command('game', 'Play Steal an RNG and see live Roblox stats'),
  str(command('suggest', 'Suggest an improvement'), 'idea', 'Your idea (no private information)'),
  command('bugreport', 'Open a structured bug report form'),
  mod(command('suggestion', 'Review a suggestion'), PermissionFlagsBits.ManageMessages)
    .addSubcommand(s => str(str(s.setName('approve').setDescription('Approve'), 'id', 'Suggestion message ID'), 'reason', 'Decision reason'))
    .addSubcommand(s => str(str(s.setName('deny').setDescription('Deny'), 'id', 'Suggestion message ID'), 'reason', 'Decision reason')),
  mod(command('code', 'Manage official codes'), PermissionFlagsBits.ManageMessages)
    .addSubcommand(s => str(str(str(s.setName('add').setDescription('Add an active code'), 'code', 'Exact redeem code'), 'reward', 'Reward'), 'expires', 'Optional ISO date, e.g. 2026-12-01T00:00:00Z', false))
    .addSubcommand(s => str(s.setName('remove').setDescription('Remove a code'), 'code', 'Exact redeem code'))
    .addSubcommand(s => s.setName('list').setDescription('List codes')),
  mod(command('giveaway', 'Run a community giveaway'), PermissionFlagsBits.ManageMessages)
    .addSubcommand(s => integer(integer(str(s.setName('start').setDescription('Start a giveaway'), 'prize', 'Prize (no gambling)'), 'minutes', 'Duration in minutes', 1, 43200), 'winners', 'Number of winners', 1, 20, false).addRoleOption(o => o.setName('role').setDescription('Optional entry role requirement')))
    .addSubcommand(s => str(s.setName('end').setDescription('End early'), 'id', 'Giveaway message ID'))
    .addSubcommand(s => str(s.setName('reroll').setDescription('Draw new winners'), 'id', 'Giveaway message ID')),
  mod(command('event', 'Publish a confirmed event'), PermissionFlagsBits.ManageMessages)
    .addSubcommand(s => str(s.setName('announce').setDescription('Announce an event').addStringOption(o => o.setName('type').setDescription('Ping group').setRequired(true).addChoices(...['witching','boss','weather','godzilla','update'].map(name => ({ name, value: name })))), 'details', 'Confirmed event details')),
  mod(str(user(command('warn', 'Record a warning')), 'reason', 'Reason'), PermissionFlagsBits.ModerateMembers),
  mod(str(integer(user(command('timeout', 'Timeout a member')), 'minutes', 'Timeout duration', 1, 40320), 'reason', 'Reason'), PermissionFlagsBits.ModerateMembers),
  mod(str(user(command('kick', 'Kick a member')), 'reason', 'Reason'), PermissionFlagsBits.KickMembers),
  mod(str(user(command('ban', 'Ban a member')), 'reason', 'Reason'), PermissionFlagsBits.BanMembers),
  mod(integer(command('purge', 'Delete recent messages (under 14 days)'), 'amount', 'Number of messages', 1, 100), PermissionFlagsBits.ManageMessages),
  mod(integer(command('slowmode', 'Set channel slowmode'), 'seconds', 'Slowmode seconds', 0, 21600), PermissionFlagsBits.ManageChannels),
  mod(command('lock', 'Lock or unlock this channel').addBooleanOption(o => o.setName('locked').setDescription('True to lock, false to restore').setRequired(true)), PermissionFlagsBits.ManageChannels),
].map(builder => builder.toJSON());

// Setup only updates this project's commands; unrelated guild commands are preserved.
export async function registerCommands(guild, manifest) {
  const existing = await guild.commands.fetch();
  for (const body of commands) {
    const found = existing.find(c => c.name === body.name);
    if (found && !manifest.data.commands.includes(found.id)) throw new Error(`Unowned slash command name conflict: /${body.name}. Use a dedicated application or remove the conflict yourself.`);
    const saved = found ? await found.edit(body) : await guild.commands.create(body);
    if (!manifest.data.commands.includes(saved.id)) manifest.data.commands.push(saved.id);
    manifest.save();
  }
}
