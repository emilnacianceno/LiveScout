// Runs a Python file with the project's venv interpreter (cross-platform).
// Usage: bun scripts/py.ts <file> [args...]   (paths relative to python/)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const pyDir = resolve(root, 'python');
const venvPy =
  process.platform === 'win32' ? resolve(pyDir, '.venv/Scripts/python.exe') : resolve(pyDir, '.venv/bin/python');

if (!existsSync(venvPy)) {
  console.error('Python venv missing. Run: bun run setup');
  process.exit(1);
}

const proc = Bun.spawn([venvPy, '-u', ...process.argv.slice(2)], {
  cwd: pyDir,
  stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(await proc.exited);
