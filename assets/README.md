# Add your game artwork

No fake official artwork is supplied. Missing files are skipped gracefully.

* `icon.png` — square server icon, ideally 512×512.
* `banner.png` — 16:9 banner, ideally 960×540; requires the appropriate boost perk.
* `splash.png` — invite splash, ideally 1920×1080; requires the appropriate boost perk.
* `roles/<role-key>.png` — square role icons (for example `omega.png`, `legendary.png`); requires ROLE_ICONS capability.
* `emojis/<emoji_name>.png` — transparent rarity gems, candy_corn, roll_dice, omega; PNG, WebP, or GIF. Use Discord-compatible size limits (emojis at most 256 KiB, short alphanumeric/underscore names).

Run setup after adding assets. Existing managed emojis are preserved so their IDs and messages remain valid. To replace an emoji image, delete that managed emoji in Discord and rerun setup. Role icons/server images update on each run. The welcome and rank cards are generated automatically by Canvas; install a chunky licensed font in your host OS for a different font appearance.
