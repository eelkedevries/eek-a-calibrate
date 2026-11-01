// Loads the committed landmark fixture (spec §10.3) for Node tests: the
// landmarks, blendshapes and matrix as the typed arrays a FaceObservation
// carries, and the same frame's RGBA pixels. Made by
// tests/e2e/make-landmark-fixture.spec.ts; see face-01.json for provenance.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export interface LandmarkFixture {
  name: string;
  videoW: number;
  videoH: number;
  meta: { index: number; tCaptureMs: number; clock: string; presentedFrames: number; cameraGap: number; videoW: number; videoH: number };
  /** 478 × 3, interleaved x, y, z (FaceObservation.landmarks). */
  landmarks: Float32Array;
  /** 52 scores in BLENDSHAPE_NAMES order. */
  blendshapes: Float32Array;
  blendshapeNames: string[];
  /** Column-major 4×4, as MediaPipe returns it. */
  matrix: Float32Array;
  delegate: string;
  /** What the browser pipeline computed from this frame. */
  computed: {
    pose: { yawDeg: number; pitchDeg: number; rollDeg: number; R: number[]; t: number[]; scale: number };
    eyes: Record<string, number | boolean | number[]>;
    quality: { faceWidthFrac: number; lumaMean: number; lumaSd: number; backlight: number; glare: number; centring: number[] };
    roi: { x: number; y: number; w: number; h: number };
  };
  /** The frame, videoW × videoH RGBA. */
  pixels: { data: Uint8ClampedArray; width: number; height: number };
}

export function loadLandmarkFixture(name = 'face-01'): LandmarkFixture {
  const dir = new URL('./', import.meta.url);
  const json = JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'));
  const raw = gunzipSync(readFileSync(new URL(json.pixels.file, dir)));
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== json.pixels.sha256) throw new Error(`${json.pixels.file}: sha256 ${sha} does not match the fixture JSON`);
  if (raw.length !== json.pixels.width * json.pixels.height * 4) throw new Error(`${json.pixels.file}: unexpected size ${raw.length}`);
  return {
    name,
    videoW: json.videoW,
    videoH: json.videoH,
    meta: json.meta,
    landmarks: Float32Array.from((json.landmarks as number[][]).flat()),
    blendshapes: Float32Array.from(json.blendshapes as number[]),
    blendshapeNames: json.blendshapeNames,
    matrix: Float32Array.from(json.matrix as number[]),
    delegate: json.delegate,
    computed: json.computed,
    pixels: { data: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length), width: json.pixels.width, height: json.pixels.height },
  };
}
