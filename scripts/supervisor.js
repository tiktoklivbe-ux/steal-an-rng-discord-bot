import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const lockFile = path.join(root, 'data/supervisor.json');
if (fs.existsSync(lockFile)) {
  const old = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  try { process.kill(old.pid, 0); console.log(`Supervisor already running (PID ${old.pid}).`); process.exit(0); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  fs.unlinkSync(lockFile);
}
fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, root }), { flag: 'wx' });
let child, timer, stopping = false, failures = 0;
const output = fs.createWriteStream(path.join(root, 'logs/bot.log'), { flags: 'a' });
function start() {
  const started = Date.now();
  child = spawn(process.execPath, [path.join(root, 'src/bot.js')], { cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
  child.once('error', error => output.write(`${new Date().toISOString()} Failed to launch bot: ${error.message}\n`));
  child.once('close', code => {
    if (stopping) return;
    failures = Date.now() - started > 60000 ? 0 : failures + 1;
    const wait = Math.min(60000, 5000 * 2 ** Math.min(failures, 4));
    output.write(`${new Date().toISOString()} Bot exited (${code}); restarting in ${wait / 1000}s\n`);
    timer = setTimeout(start, wait);
  });
}
function stop() {
  stopping = true; clearTimeout(timer); child?.kill();
  if (fs.existsSync(lockFile) && JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid === process.pid) fs.unlinkSync(lockFile);
  output.end();
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
start();
