#!/usr/bin/env node
// Writes <file>.wasm.gz (gzip -9) next to every .wasm in dist/. The host does
// not compress WebAssembly; the app requests these copies in production and
// public/.htaccess serves them gzip-encoded, about a third of the raw size.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist';

async function* wasmFiles(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const full = join(path, item.name);
    if (item.isDirectory()) yield* wasmFiles(full);
    else if (item.name.endsWith('.wasm')) yield full;
  }
}

let count = 0;
for await (const file of wasmFiles(dir)) {
  const raw = await readFile(file);
  const gz = gzipSync(raw, { level: 9 });
  await writeFile(`${file}.gz`, gz);
  count += 1;
  console.log(`${relative(dir, file)}: ${(raw.length / 1e6).toFixed(2)} MB → ${(gz.length / 1e6).toFixed(2)} MB gzip`);
}
console.log(`precompress: ${count} WebAssembly file(s) compressed.`);
