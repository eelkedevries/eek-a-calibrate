// Produces the committed landmark fixture (spec §10.3): one frame of the fake
// camera, run through the worker host in Chromium (MediaPipe does not run in
// Node), saved as tests/fixtures/landmarks/face-01.json (478 landmarks, the
// blendshapes, the transformation matrix, the frame size and the measures the
// browser computed) and the same frame's pixels as face-01.rgba.gz, for the
// parity tests of 006 and 007.
//
// It runs only on request, because each run picks a different frame:
//   MAKE_LANDMARK_FIXTURE=1 npx playwright test make-landmark-fixture
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { BLENDSHAPE_NAMES } from '../../src/core/face/landmarkSets.ts';

const OUT_DIR = 'tests/fixtures/landmarks';
const NAME = 'face-01';

interface Captured {
  result: {
    meta: { index: number; tCaptureMs: number; clock: string; presentedFrames: number; cameraGap: number; videoW: number; videoH: number };
    face: {
      landmarks: number[];
      blendshapes: number[];
      matrix: number[];
      pose: unknown;
      eyes: unknown;
      quality: unknown;
      landmarkerMs: number;
      delegate: string;
    };
  };
  info: { kind: string; delegate: string; wasmVariant: string; mediapipe: string; modelSha256: string };
  camera: { width: number; height: number; label: string };
  roi: { x: number; y: number; w: number; h: number };
  pixels: { width: number; height: number; rgbaBase64: string };
}

/** Indented JSON with every array of numbers on one line (one landmark per line). */
function compactJson(value: unknown): string {
  const marker = '\u0000';
  const text = JSON.stringify(value, (_key, v) => (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number') ? `${marker}${JSON.stringify(v)}` : v), 1);
  return text.replace(/"\\u0000(\[[^"]*\])"/g, '$1');
}

test('make the landmark fixture', async ({ page }) => {
  test.skip(process.env.MAKE_LANDMARK_FIXTURE !== '1', 'set MAKE_LANDMARK_FIXTURE=1 to regenerate the committed fixture');
  test.setTimeout(120_000);

  await page.goto('./?e2e=1&host=worker#/lab');
  await page.getByRole('button', { name: 'Start camera and vision' }).click();
  await page.waitForFunction(() => ((window.__eek as unknown as { lab(): { faces: number } | null }).lab()?.faces ?? 0) >= 5, null, { timeout: 60_000 });
  const captured = (await page.evaluate(() => (window.__eek as unknown as { labCaptureFixture(): Promise<unknown> }).labCaptureFixture())) as Captured;

  const { result, info, pixels } = captured;
  const face = result.face;
  expect(face.landmarks).toHaveLength(478 * 3);
  expect(face.blendshapes).toHaveLength(BLENDSHAPE_NAMES.length);
  expect(face.matrix).toHaveLength(16);
  expect(pixels.width).toBe(result.meta.videoW);
  expect(pixels.height).toBe(result.meta.videoH);

  const rgba = Buffer.from(pixels.rgbaBase64, 'base64');
  expect(rgba.length).toBe(pixels.width * pixels.height * 4);

  const landmarks: number[][] = [];
  for (let i = 0; i < 478; i++) landmarks.push(face.landmarks.slice(i * 3, i * 3 + 3));

  const fixture = {
    schema: 'eek-a-calibrate/landmark-fixture@1',
    description:
      'One frame of the fake camera (tests/fixtures/face/portrait.jpg through scripts/make-fake-video.sh), run through the worker host in Chromium. Landmarks are normalised to the unmirrored frame (x, y in [0, 1]; z relative depth), as MediaPipe returns them, rounded to float32.',
    generatedBy: 'tests/e2e/make-landmark-fixture.spec.ts',
    mediapipe: info.mediapipe,
    model: 'models/face-landmarker-f16-v1/face_landmarker.task',
    modelSha256: info.modelSha256,
    host: info.kind,
    wasmVariant: info.wasmVariant,
    delegate: face.delegate,
    videoW: result.meta.videoW,
    videoH: result.meta.videoH,
    meta: result.meta,
    landmarks,
    blendshapeNames: [...BLENDSHAPE_NAMES],
    blendshapes: face.blendshapes,
    matrixPacking: 'column-major, as MediaPipe returns facialTransformationMatrixes[0].data',
    matrix: face.matrix,
    computed: { pose: face.pose, eyes: face.eyes, quality: face.quality, roi: captured.roi },
    pixels: {
      file: `${NAME}.rgba.gz`,
      format: 'RGBA, 8 bits per channel, row-major, gzip',
      width: pixels.width,
      height: pixels.height,
      bytes: rgba.length,
      sha256: createHash('sha256').update(rgba).digest('hex'),
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${NAME}.json`, `${compactJson(fixture)}\n`);
  writeFileSync(`${OUT_DIR}/${NAME}.rgba.gz`, gzipSync(rgba, { level: 9 }));
});
