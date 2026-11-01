import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Builds the fake camera streams once per checkout (they are git-ignored): the
// landscape one for the desktop specs and the portrait one (480×640) for
// mobile.spec.ts. Specs that need a camera fail clearly if theirs could not be
// made; the smoke test uses neither.
const STREAMS: readonly { file: string; args: string[] }[] = [
  { file: 'tests/fixtures/generated/face.mjpeg', args: [] },
  { file: 'tests/fixtures/generated/face-portrait.mjpeg', args: ['--portrait'] },
];

export default function globalSetup(): void {
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/ is missing: run `npm run build` before `npm run test:e2e`.');
  }
  for (const { file, args } of STREAMS) {
    if (existsSync(file)) continue;
    try {
      execFileSync('bash', ['scripts/make-fake-video.sh', ...args], { stdio: 'inherit' });
    } catch (error) {
      console.warn(`global-setup: could not build ${file} (${String(error)}); the specs that use it will fail.`);
    }
  }
}
