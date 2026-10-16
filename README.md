# Steal an RNG Discord Bot

JavaScript / Node.js / discord.js v14 community bot and configurable server setup for Steal an RNG. Developed with AI coding assistance.

## Features

- Configurable channels, roles, verification and permission policies
- 23 slash commands including moderation, game information, XP and fun commands
- Private support tickets with transcripts
- Persistent giveaways, suggestions and rank progress
- Canvas welcome and rank cards
- Member logging, temporary voice rooms and Roblox player counts
- Unit tests using the built-in Node.js test runner

## Code examples

- [Slash command definitions](src/commands.js)
- [Interaction handlers](src/bot.js)
- [Ticket system](src/tickets.js)
- [Giveaways](src/giveaways.js)
- [Permission and persistence tests](test/project.test.js)

## Run locally

Install Node.js 22.12+ and run `npm install`. Copy `.env.example` to `.env` and fill in your own Discord application details. Review `config/server.json` before running `npm run setup`; it changes your selected Discord server. Run `npm start` to launch the bot.

Run `npm run check` and `npm test` to validate the project.

Credentials, member data, transcripts, runtime files and logs are excluded. This is a sanitized source snapshot; deploy with your own application and server IDs.

---

# Steal an RNG — official community server kit 🎃

A configurable discord.js v14 project for **stefunkwn** and [Steal an RNG](https://www.roblox.com/games/89881575589403). Setup builds the server; the live bot powers its interactions. This public snapshot excludes credentials and private runtime data.

## First launch

1. Install **Node.js 22.12+** (Node 24 LTS recommended). Open a terminal in this folder and run `npm install`.
2. Open the [Discord Developer Portal](https://discord.com/developers/applications), create an application named **Steal an RNG**, and open its **Bot** page. Copy its token directly into a local `.env` file; do not paste it into chat or commit it. Use `.env.example` as the template. If a token is exposed, reset it in the portal.
3. On the Bot page, enable **Server Members Intent** and **Message Content Intent**. Presence Intent is unnecessary. Larger/verified bots may need Discord approval for privileged intents.
4. Copy the application's ID into `CLIENT_ID`. Create or choose your Discord server. Enable Developer Mode in Discord, right-click its server icon, Copy Server ID, and put it in `GUILD_ID`.
5. Invite the application using this exact setup URL, replacing `CLIENT_ID` with the numeric application ID:

   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands`

   Administrator is used during setup to enable Community and construct the permission hierarchy. Drag the actual **bot integration role** to the top, below only roles it does not need to manage. The decorative `🤖 Bots` role does not replace that integration role. Setup cannot promote its own integration role.
6. Review `config/server.json`. Community is enabled automatically after the required text channels are created and before forums/stages. This also sets the guild's verification level to Low and explicit-content filtering to All Members. The existing server name is preserved; `name` in config is the suggested name for the server you create.
7. Run:

   ```sh
   npm run setup
   npm start
   ```

8. Read the printed creation/update summary and warnings. Assign Owner / Developer / staff roles to the correct humans manually: a Roblox username cannot safely identify a Discord account. Accept rules with an ordinary test account, choose roles, open a ticket, and try `/rank`, `/suggest`, `/bugreport`, and `/codes`.

For the bundled development environment where npm is absent, use its pnpm installation instead: `pnpm install`, `pnpm run setup`, `pnpm start`. `pnpm-lock.yaml` pins the tested dependency resolution. On a normal Node installation npm is available.

## Permissions and verification

The bot uses Guilds, Guild Members, Guild Messages, Message Content, and Guild Voice States gateway intents. Slash commands are **guild-scoped only**. Setup creates/updates this project's named commands without bulk-overwriting other commands registered by this application. Default command permissions hide staff operations; runtime handlers additionally check staff role membership or the exact moderation permission and role hierarchy.

After setup, Administrator can be removed from the bot integration role. Grant these exact runtime permissions:

`ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`, `AttachFiles`, `EmbedLinks`, `AddReactions`, `UseApplicationCommands`, `ManageChannels`, `ManageRoles`, `ManageMessages`, `ManageThreads`, `CreatePublicThreads`, `Connect`, `Speak`, `MoveMembers`, `ModerateMembers`, `KickMembers`, `BanMembers`, `MentionEveryone`.

Use the OAuth2 URL Generator with that list for a reduced-permission invite. Restore Administrator temporarily for future setup runs, which manage guild settings, AutoMod, and assets. `MentionEveryone` lets the bot ping only the specific configured, non-mentionable ping role with an explicit allowed-mentions list; regular messages never enable broad mentions. Human staff should publish pings through `/event`, `/code`, and `/giveaway` unless you deliberately grant them Mention Everyone.

The exact reduced-permission invite is `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=1428365241430&scope=bot%20applications.commands`.

Unverified users see only welcome, rules and verification channels. Verified users see public channels. Info channels are read-only; staff/tickets/creator lounge are private. Existing unrelated channels and their permissions are preserved, so on an existing server review those channels yourself. The native timeout is the primary mute system. The Muted fallback role denies chat/voice for ordinary members; Discord role allow-overrides can override it for staff/creator posting privileges, so remove those roles or use `/timeout` for those members. The bot rejects commands and buttons for muted users.

Discord's native premium Server Booster role is managed by Discord; the project creates a separate styled display role and synchronizes it while the bot is online. No paid perks are purchased by setup.

## Onboarding and guide

The rules/verification buttons and role panels work immediately. Platform, ping, and region choices are shared with a native onboarding draft. Discord native onboarding assigns/removes those same roles, so the role buttons always reflect the member's current state; the bot does not impersonate a human or call private client APIs.

`setup.enableOnboarding` is **false** by default. Discord requires at least seven default channels and at least five sendable by @everyone (with mode-dependent constraints). That conflicts with this project's strict Verified gate. Setup attempts to save questions disabled and reports any API rejection. Review Community → Onboarding yourself and choose your preferred access policy before enabling it; merely changing `enabled` may be rejected. Welcome Screen, description, and boosted assets are attempted independently and failures appear as warnings. Server Guide copy is posted in #server-guide; Discord's complete native Server Guide editor has no supported public bot API, so its UI-only resources/to-dos need a manual pass.

References: [Discord guild/onboarding API](https://discord.com/developers/docs/resources/guild#modify-guild-onboarding), [discord.js](https://discord.js.org/docs/packages/discord.js/main).

## Configuration and assets

* `config/server.json`: all roles, category/channel definitions, topics, slowmodes, overwrite policies, pinned panels, onboarding choices, ticket types, event ping mappings, XP thresholds, theme, feature switches, and welcome copy. Stable `key` fields identify resources; edit names/text/colors freely. Changes require a setup rerun for server structure and a bot restart for runtime settings.
* `config/codes.json`: initial code seed, an array of `{ "code": "CONFIRMED_CODE", "reward": "Reward description", "expires": null }`. It starts empty because no real code was supplied. Seed data is imported on the first bot start only. Thereafter `/code add|remove|list` is authoritative and persists in runtime state.
* `assets/`: add your icon, banner, splash, custom emojis, and role icons following [assets/README.md](assets/README.md). Missing assets are skipped. Discord boost limits still apply.
* `[DEV TO CONFIRM]`: replace unknown event dates, ability-to-rarity assignments, and creator requirements. The provided ability list is complete but does not invent in-game tier assignments. Discord rank roles grant no game abilities.

## Live features

* Rules acceptance, verification, toggleable platform/region/ping buttons with private confirmations.
* Six private ticket types, per-user/type limit, Support/mod claims, close-with-reason modal, HTML and text transcript exports. Sensitive reports remain in tickets; ticket logs are staff-only. A close waits for successful transcript upload before deleting the channel, and unfinished closes recover on restart. Exports are limited to the configured message cap and attachments are preserved as links, not downloaded files.
* XP with configurable cooldown and highest-only rarity rank. `/rank` produces a Canvas card; `/leaderboard` shows chat XP. Counting and private/staff support do not earn XP.
* `/suggest`, reaction votes and discussion thread, staff `/suggestion approve|deny` with reason. `/bugreport` opens a modal and tags its forum report by platform/category. Ordinary manually created bug posts get a template reminder.
* `/codes`, staff `/code add|remove|list`, targeted Code Pings. `/giveaway start|end|reroll`, optional role requirements, persistent entries, cryptographic random selection, departed/ineligible users excluded, and previous winners excluded on reroll.
* `/event announce` routes each confirmed event to its configured ping role. Optional Witching Hour reminders are OFF; when enabled they fire once per UTC hour at minute 00 and do not backfill missed hours. Discord timestamps render in each user's local time.
* `/warn`, `/timeout`, `/kick`, `/ban`, `/purge`, `/slowmode`, `/lock`. Moderation records include sequential case IDs, actor, target, reason, time, and outcome. `/lock locked:false` restores its saved Verified overwrite; do not rerun setup while channels are locked.
* Native AutoMod keyword presets, spam, mass mentions, scam phrases, and Discord invite filters; configured staff roles are exempt. Discord may reject rules at account/guild limits; review warnings and AutoMod in server settings.
* Strict sequential counting with no consecutive turns by the same user; invalid messages are removed. Bot-enforced image/video attachments in #media (discussion threads accept text), discussion threads in #media/#rolls-and-flexes, trading rules in each new trade forum post and a persistent pinned rules post.
* Temporary squad voice rooms through ➕ Create Voice, reuse per owner, cleanup when empty, and restart recovery. Rotating presence; welcome avatar/name/member-count card plus best-effort DM; join/leave and cached message-edit/delete logs. Messages not cached before restart cannot be reconstructed.

## Roblox integration

Set `ROBLOX_UNIVERSE_ID` to enable public player-count polling and `/game` statistics. A **universe** ID is different from the place ID `89881575589403`. The public endpoint does not need an API key. `ROBLOX_OPEN_CLOUD_KEY` is reserved and never used or sent to public endpoints by this version.

Kills, Cash, and Steals are not available through public game-stat APIs. The leaderboard channel explicitly says data is unconnected. To enable weekly posts, set `features.weeklyGameLeaderboard=true` and write a trusted game-owned export to `data/game-leaderboard.json`:

```json
{
  "generatedAt": "2026-10-11T18:00:00Z",
  "kills": [{ "username": "ExamplePlayer", "value": 120 }],
  "cash": [{ "username": "ExamplePlayer", "value": 250000 }],
  "steals": [{ "username": "ExamplePlayer", "value": 35 }]
}
```

Use your own trusted exporter; this project does not read protected game DataStores. Exports must be less than seven days old. Weekly windows use UTC epoch weeks. For Roblox account linking, invite [Bloxlink](https://blox.link/) or [RoVer](https://rover.link/) and configure their role mappings separately.

## Running 24/7

Use one bot instance only, with persistent `data/`. JSON state is intended for a single small/medium community process; migrate to a transactional database before sharding or running multiple replicas. **Stop the bot before setup**, and never run two setup processes simultaneously.

PM2 on a persistent host:

```sh
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

On Linux, run `pm2 startup` and follow its generated command. On Windows, PM2's startup integration needs a separately configured service or scheduled start; keeping a terminal open is not reboot persistence. The machine must stay powered on and connected.

Docker:

```sh
docker build -t steal-an-rng .
docker volume create steal-rng-data
docker run --rm --env-file .env -v steal-rng-data:/app/data steal-an-rng pnpm run setup
docker run -d --name steal-an-rng --restart unless-stopped --env-file .env -v steal-rng-data:/app/data steal-an-rng
```

The image runs as the non-root node user. The named volume keeps managed-resource IDs, tickets, codes, XP, giveaway entries, and moderation cases across restarts. Rebuild after config/artwork changes. Never bake `.env` into the image; `.dockerignore` excludes it. Docker deployment has not been exercised in this workspace.

For a local Windows background run, execute `./scripts/start-bot.ps1`. This launches a hidden Node supervisor, writes logs to `logs/bot.log`, and restarts the bot after crashes with backoff. Its PID is stored in `data/supervisor.json`. This local option does not install a reboot task and cannot keep the bot online while the PC sleeps or is off. Stop both the supervisor and its bot child before setup; PM2/Docker remain the recommended host-managed deployment options.

## Reruns, recovery, and reset

`data/setup.json` is the ownership manifest. Every created role/channel/panel/AutoMod rule/emoji ID is checkpointed as setup progresses. Reruns edit those resources, recreate recorded resources that are missing, and preserve unrelated objects. A same-name unowned role or channel is a deliberate error: rename it yourself. Never delete the manifest on a configured guild or setup cannot safely know what it owns. API creation and a local checkpoint are not one transaction; after an interruption at exactly that boundary, rename or remove the unowned collision after reviewing it, then rerun. Channel type changes require an explicit migration to preserve history.

New roles may have equal numeric positions: setup uses Discord's snowflake tie-breaking to recognize a hierarchy that is already correct, and only reorders when necessary.

`npm run setup -- --reset` deletes the resources recorded in the ownership manifest and rebuilds them. **This destroys managed channel history.** It does not delete unrelated roles/channels. Reset refuses categories containing unowned child channels and active tickets/giveaways/temp voice rooms. Reset does not erase XP/case history or import code seeds again. Back up first and use a throwaway guild for experimentation.

Back up all `data/*.json` while the bot is stopped. Treat runtime data and exported transcripts as private operational records. Message logging can be disabled with `features.logMessageContent=false`; implement your own retention schedule for logs/transcripts. Malformed state fails loudly rather than silently replacing moderation records. Secrets are excluded by `.gitignore`.

## Validation and launch checklist

```sh
npm run check
npm test
```

Tests exercise setup replay, deleted-resource recreation, unowned collisions, effective permissions, atomic persistence, XP thresholds, embed limits, and giveaway eligibility/rerolls using mocked Discord objects. They do not prove real guild API acceptance. Before inviting players:

* Run setup in a test guild twice and compare its summary; inspect ordinary-member and unverified access.
* Test verification, a private purchase ticket, transcript export/close, bug forum tags, a short giveaway, moderation hierarchy, counting, and temp-voice cleanup.
* Review Community and native onboarding, assign human staff roles, verify the bot integration role is high enough, and add Bloxlink/RoVer if desired.
* Replace unknown developer details, supply actual codes/artwork, review boosts, back up data, and start the persistent host.
