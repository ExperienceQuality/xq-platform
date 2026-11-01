import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactsRoot = join(root, 'artifacts');

const entries = await readdir(artifactsRoot, { withFileTypes: true });
const packageDirs = entries
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('packages-'))
  .map((entry) => entry.name)
  .sort();

if (packageDirs.length === 0) {
  throw new Error('ci:build expected artifacts/packages-* after verify:packages');
}

const latestDir = join(artifactsRoot, packageDirs.at(-1));
const tarballs = (await readdir(latestDir)).filter((name) => name.endsWith('.tgz'));
if (tarballs.length === 0) {
  throw new Error(`no .tgz files in ${latestDir}`);
}

await mkdir(artifactsRoot, { recursive: true });
for (const name of tarballs) {
  await copyFile(join(latestDir, name), join(artifactsRoot, name));
}
