import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Builds the fake camera stream once per checkout (it is git-ignored). Specs
// that need the camera fail clearly if it could not be made; the smoke test
// does not use it.
export default function globalSetup(): void {
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/ is missing: run `npm run build` before `npm run test:e2e`.');
  }
  if (existsSync('tests/fixtures/generated/face.mjpeg')) return;
  try {
    execFileSync('bash', ['scripts/make-fake-video.sh'], { stdio: 'inherit' });
  } catch (error) {
    console.warn(`global-setup: could not build the fake camera stream (${String(error)}); camera specs will fail.`);
  }
}
