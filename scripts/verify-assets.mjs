#!/usr/bin/env node
// Checks a build (default dist/) against assets-manifest.json and the hosting
// rules (spec §8.1). Part of `npm run check`. It fails when:
// - a manifest entry is missing, or its hash or size differs, or its .gz copy
//   is missing or does not decompress to the same bytes;
// - a committed model folder has no LICENSE or PROVENANCE.md;
// - the build contains a source map, or a .wasm without its .wasm.gz;
// - a JavaScript file contains an http(s) URL whose host is not allowed below,
//   or any mention of a known CDN, model host or telemetry endpoint;
// - public/.htaccess or dist/.htaccess does not carry the CSP and
//   Permissions-Policy of config/headers.mjs verbatim;
// - index.html lacks the assets/index-*.js entry the deploy check looks for.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { CSP, PERMISSIONS_POLICY } from '../config/headers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, process.argv[2] ?? 'dist');
const { assets } = JSON.parse(await readFile(join(root, 'assets-manifest.json'), 'utf8'));

// URLs that may appear in shipped JavaScript. None of them is requested by the
// app (the CSP allows only 'self'); they are XML namespaces, licence texts,
// citations and links shown to the user, and documentation links inside
// third-party comments and error messages.
const ALLOWED_HOSTS = [
  // XML namespaces
  'www.w3.org',
  // This site
  'eelkedevries.com',
  // Licences
  'www.apache.org',
  'opensource.org',
  // Citations and source links shown in the app
  'github.com',
  'www.npmjs.com',
  'arxiv.org',
  'doi.org',
  'www.ijcai.org',
  // Documentation links in third-party comments and error messages
  'developer.mozilla.org',
  'web.dev',
  'emscripten.org',
  'kripken.github.io',
  'rolldown.rs',
  'www.shadertoy.com',
  'www.khronos.org',
  'www.ietf.org',
  'tools.ietf.org',
  'webkit.org',
  'bugzil.la',
  'unicode.org',
  'pubs.opengroup.org',
  'en.wikipedia.org',
  'server.com', // Emscripten's stack-trace example in a comment
];

// Hosts the app must never mention: model CDNs, Google's MediaPipe telemetry,
// the Peekr and WebEyeTrack upstream hosting.
const FORBIDDEN = ['odml.pa.googleapis.com', 'storage.googleapis.com', 'cdn.jsdelivr.net', 'blob.core.windows.net', 'redforestai.github.io'];

const errors = [];
const fail = (message) => errors.push(message);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const rel = (path) => relative(root, path).split(sep).join('/');

async function walk(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`verify-assets: ${rel(dist)}/index.html not found; build first.`);
  process.exit(1);
}
const files = await walk(dist);

// 1. Manifest entries.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const entry of assets) {
  let file = join(dist, entry.path);
  if (entry.path.includes('[hash]')) {
    const dir = dirname(file);
    const pattern = new RegExp(`^${escapeRe(basename(entry.path)).replace(escapeRe('[hash]'), '[A-Za-z0-9_-]+')}$`);
    const matches = existsSync(dir) ? (await readdir(dir)).filter((name) => pattern.test(name)) : [];
    if (matches.length !== 1) {
      fail(`${entry.id}: expected one file matching ${entry.path}, found ${matches.length}`);
      continue;
    }
    file = join(dir, matches[0]);
  }
  if (!existsSync(file)) {
    fail(`${entry.id}: missing ${rel(file)}`);
    continue;
  }
  const bytes = await readFile(file);
  if (bytes.length !== entry.bytes) fail(`${entry.id}: ${rel(file)} is ${bytes.length} bytes, the manifest says ${entry.bytes}`);
  if (sha256(bytes) !== entry.sha256) fail(`${entry.id}: hash mismatch in ${rel(file)}`);
  if (entry.gz) {
    const gz = `${file}.gz`;
    if (!existsSync(gz)) fail(`${entry.id}: missing ${rel(gz)}`);
    else if (sha256(gunzipSync(await readFile(gz))) !== entry.sha256) fail(`${entry.id}: ${rel(gz)} does not decompress to the manifest hash`);
  }
}

// 2. Committed model folders carry their licence and provenance.
const modelsDir = join(dist, 'models');
if (existsSync(modelsDir)) {
  for (const item of await readdir(modelsDir, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    for (const required of ['LICENSE', 'PROVENANCE.md']) {
      if (!existsSync(join(modelsDir, item.name, required))) fail(`models/${item.name}: no ${required}`);
    }
  }
} else {
  fail('dist/models/ is missing');
}

// 3. No source maps; every .wasm has its .wasm.gz.
for (const file of files) {
  if (file.endsWith('.map')) fail(`source map in build: ${rel(file)}`);
  if (file.endsWith('.wasm') && !existsSync(`${file}.gz`)) fail(`no gzip copy of ${rel(file)}`);
}

// 4. URLs in shipped JavaScript.
const URL_RE = /https?:\/\/[^\s"'`)<>\\,;]+/g;
for (const file of files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))) {
  const text = await readFile(file, 'utf8');
  for (const word of FORBIDDEN) if (text.includes(word)) fail(`${rel(file)} mentions ${word}`);
  for (const url of new Set(text.match(URL_RE) ?? [])) {
    // Comment examples such as http://server.com:4324:12 are not valid URLs, so read the host directly.
    const host = /^https?:\/\/([^/:?#]+)/.exec(url)?.[1]?.toLowerCase() ?? '';
    if (!ALLOWED_HOSTS.includes(host)) fail(`${rel(file)}: URL host not on the allowlist: ${url}`);
  }
}

// 5. Headers in .htaccess match config/headers.mjs.
for (const path of [join(root, 'public', '.htaccess'), join(dist, '.htaccess')]) {
  if (!existsSync(path)) {
    fail(`missing ${rel(path)}`);
    continue;
  }
  const text = await readFile(path, 'utf8');
  if (!text.includes(`Header set Content-Security-Policy "${CSP}"`)) fail(`${rel(path)} does not carry the CSP of config/headers.mjs`);
  if (!text.includes(`Header set Permissions-Policy "${PERMISSIONS_POLICY}"`)) fail(`${rel(path)} does not carry the Permissions-Policy of config/headers.mjs`);
}

// 6. The entry script the deploy workflow looks for.
const html = await readFile(join(dist, 'index.html'), 'utf8');
if (!/assets\/index-[A-Za-z0-9_-]+\.js/.test(html)) fail('index.html does not load assets/index-*.js');
if (!html.includes('<link rel="canonical" href="https://eelkedevries.com/eek-a-calibrate/"')) fail('index.html lacks the canonical link');

if (errors.length > 0) {
  console.error(`verify-assets: ${errors.length} problem(s) in ${rel(dist)}:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`verify-assets: ${assets.length} manifest entries, ${files.length} files and the headers in ${rel(dist)} are as expected.`);
