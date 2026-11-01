import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const BASE = '/eek-a-calibrate/';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    sourcemap: false,
    // The deploy workflow checks the live page for assets/index-*.js, so the
    // entry keeps the name "index" and the default assets/ directory.
    rollupOptions: { input: { index: 'index.html' } },
  },
  worker: {
    format: 'es',
  },
  // Both packages locate their WebAssembly at run time; pre-bundling breaks those paths.
  optimizeDeps: {
    exclude: ['onnxruntime-web', '@mediapipe/tasks-vision'],
  },
  // No CSP in the dev server (it would block HMR); scripts/serve-dist.mjs applies the production headers.
});
