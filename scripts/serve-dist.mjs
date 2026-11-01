#!/usr/bin/env node
// Serves dist/ under /eek-a-calibrate/ the way the live host does, so the
// end-to-end tests run under production conditions (spec §10.4): the types
// from public/.htaccess, .wasm.gz as gzip-encoded application/wasm, the CSP and
// Permissions-Policy headers, the site-wide headers, and 404 for unknown paths.
// Port: E2E_PORT (default 4173). Binds to 127.0.0.1 only.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP, MIME_TYPES, PERMISSIONS_POLICY, SITE_HEADERS } from '../config/headers.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, process.argv[2] ?? 'dist');
const BASE = '/eek-a-calibrate/';
const port = Number(process.env.E2E_PORT ?? 4173);
const host = '127.0.0.1';

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`serve-dist: ${dist}/index.html not found; run npm run build first.`);
  process.exit(1);
}

function headersFor(file) {
  const headers = {
    ...SITE_HEADERS,
    'Content-Security-Policy': CSP,
    'Permissions-Policy': PERMISSIONS_POLICY,
  };
  const name = basename(file);
  if (name.endsWith('.wasm.gz')) {
    headers['Content-Type'] = 'application/wasm';
    headers['Content-Encoding'] = 'gzip';
  } else if (name.endsWith('.gz')) {
    headers['Content-Type'] = 'application/gzip';
  } else {
    const type = MIME_TYPES[extname(name).toLowerCase()];
    if (type) headers['Content-Type'] = type;
  }
  if (name.endsWith('.html')) headers['Cache-Control'] = 'no-store';
  return headers;
}

function notFound(res, method) {
  const body = '<!doctype html><title>Page not found</title><h1>Page not found</h1>';
  res.writeHead(404, {
    ...SITE_HEADERS,
    'Content-Security-Policy': CSP,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(method === 'HEAD' ? undefined : body);
}

const server = createServer((req, res) => {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', `http://${host}`).pathname);
  } catch {
    notFound(res, method);
    return;
  }
  if (pathname === BASE.slice(0, -1)) {
    res.writeHead(301, { Location: BASE });
    res.end();
    return;
  }
  if (!pathname.startsWith(BASE)) {
    notFound(res, method);
    return;
  }
  let file = resolve(dist, `.${sep}${pathname.slice(BASE.length)}`);
  if (file !== dist && !file.startsWith(dist + sep)) {
    notFound(res, method);
    return;
  }
  // Apache refuses .htaccess and other .ht* files.
  if (basename(file).startsWith('.ht')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Forbidden');
    return;
  }
  let stat = existsSync(file) ? statSync(file) : null;
  if (stat?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname}/` });
      res.end();
      return;
    }
    file = join(file, 'index.html');
    stat = existsSync(file) ? statSync(file) : null;
  }
  if (!stat?.isFile()) {
    notFound(res, method);
    return;
  }
  res.writeHead(200, { ...headersFor(file), 'Content-Length': stat.size });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`serve-dist: http://${host}:${port}${BASE} (from ${dist})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
