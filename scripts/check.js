import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const folder of ['src', 'scripts', 'test']) for (const name of fs.readdirSync(folder)) if (name.endsWith('.js')) {
  const result = spawnSync(process.execPath, ['--check', `${folder}/${name}`], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
console.log('JavaScript syntax checks passed.');
