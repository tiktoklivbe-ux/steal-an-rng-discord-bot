import fs from 'node:fs';
import path from 'node:path';

// One process writes each file. Atomic replacement prevents truncated JSON on crashes.
export class Store {
  constructor(file, defaults) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : structuredClone(defaults);
  }
  save() {
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
export const setupDefaults = { guildId: null, roles: {}, channels: {}, messages: {}, automod: {}, emojis: {}, commands: [] };
export const runtimeDefaults = { xp: {}, tickets: {}, giveaways: {}, suggestions: {}, cases: [], counting: { value: 0, user: null }, tempVoice: [], locks: {}, codes: null, reminders: {}, weekly: null };
