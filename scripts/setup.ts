// One-time setup: JS deps, Python venv, Python deps, Playwright Chromium.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const pyDir = resolve(root, 'python');
const win = process.platform === 'win32';
const venvPy = resolve(pyDir, win ? '.venv/Scripts/python.exe' : '.venv/bin/python');

async function run(cmd: string[], cwd = root) {
  console.log(`\n> ${cmd.join(' ')}`);
  const code = await Bun.spawn(cmd, { cwd, stdio: ['inherit', 'inherit', 'inherit'] }).exited;
  if (code !== 0) process.exit(code);
}

await run(['bun', 'install']);
if (!existsSync(venvPy)) await run([win ? 'python' : 'python3', '-m', 'venv', '.venv'], pyDir);
await run([venvPy, '-m', 'pip', 'install', '-r', 'requirements-dev.txt'], pyDir);
await run([venvPy, '-m', 'playwright', 'install', 'chromium'], pyDir);

if (!existsSync(resolve(root, '.env'))) {
  await Bun.write(resolve(root, '.env'), await Bun.file(resolve(root, '.env.example')).text());
  console.log('\nCreated .env from .env.example');
}
console.log('\nDone. Next:');
console.log('  1. Set the DATABASE_URL password in .env, then `bun run db:migrate`');
console.log('  2. `bun run login` (once, to sign in to Facebook)');
console.log('  3. `bun run dev`, then add groups at http://localhost:5173');
