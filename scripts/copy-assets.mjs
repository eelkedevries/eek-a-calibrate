#!/usr/bin/env node
// Copies the npm runtime files listed in assets-manifest.json into
// public/vendor/<pkg>-<version>/ (git-ignored) and checks every hash, so the
// app serves only pinned, self-hosted runtimes (spec §8.1). Runs as predev and
// prebuild. It copies single files, never a package root, because package roots
// contain source maps. Committed models are checked, not copied. Files that
// Vite emits through ?url imports (paths with [hash]) are checked at source.
//
// Idempotent and safe in a fresh worktree: an up-to-date file is left alone,
// a copy is written to a temporary name and renamed into place, and files in
// public/vendor/ that the manifest does not list are removed.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const vendorDir = join(publicDir, 'vendor');
const { assets } = JSON.parse(await readFile(join(root, 'assets-manifest.json'), 'utf8'));

const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const NPM = /^npm:((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/;

const errors = [];
const wanted = new Set();
let copied = 0;
let current = 0;

for (const entry of assets) {
  if (entry.from === 'committed') {
    const file = join(publicDir, entry.path);
    if (!existsSync(file)) errors.push(`${entry.id}: committed file missing: public/${entry.path}`);
    else if ((await sha256(file)) !== entry.sha256) errors.push(`${entry.id}: hash mismatch in public/${entry.path}`);
    continue;
  }

  const m = NPM.exec(entry.from);
  if (!m) {
    errors.push(`${entry.id}: unrecognised source "${entry.from}"`);
    continue;
  }
  const [, pkg, version, file] = m;
  const pkgDir = join(root, 'node_modules', pkg);
  let installed;
  try {
    installed = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')).version;
  } catch {
    errors.push(`${entry.id}: ${pkg} is not installed (run npm ci)`);
    continue;
  }
  if (installed !== version) {
    errors.push(`${entry.id}: ${pkg} is ${installed}, the manifest pins ${version}`);
    continue;
  }
  const source = join(pkgDir, file);
  if (!existsSync(source)) {
    errors.push(`${entry.id}: ${pkg}/${file} not found`);
    continue;
  }
  if ((await sha256(source)) !== entry.sha256) {
    errors.push(`${entry.id}: hash mismatch in node_modules/${pkg}/${file}`);
    continue;
  }
  if (entry.path.includes('[hash]')) continue; // emitted by Vite

  if (!entry.path.startsWith('vendor/')) {
    errors.push(`${entry.id}: npm files must be published under vendor/, not ${entry.path}`);
    continue;
  }
  const dest = join(publicDir, entry.path);
  wanted.add(dest);
  if (existsSync(dest) && (await sha256(dest)) === entry.sha256) {
    current += 1;
    continue;
  }
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  await copyFile(source, tmp);
  await rename(tmp, dest);
  copied += 1;
}

// Remove anything in public/vendor/ that the manifest no longer lists.
async function prune(dir) {
  if (!existsSync(dir)) return;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      await prune(path);
      if ((await readdir(path)).length === 0) await rmdir(path);
    } else if (!wanted.has(path)) {
      await rm(path, { force: true });
      console.log(`copy-assets: removed stale ${relative(root, path).split(sep).join('/')}`);
    }
  }
}
if (errors.length === 0) await prune(vendorDir);

if (errors.length > 0) {
  console.error(`copy-assets: ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`copy-assets: ${assets.length} manifest entries verified; ${copied} copied, ${current} already up to date.`);
