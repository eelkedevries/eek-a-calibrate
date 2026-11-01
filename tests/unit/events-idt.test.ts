// WP3: I-DT events on synthetic scanpaths with noise, gaps and blinks: onsets and offsets within
// one sample, and gaps over 75 ms never bridged.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENTS } from '../../src/core/constants.ts';
import { detectEvents, idtDispersionDeg, idtSd2dDeg, type EventType, type GazeEvent } from '../../src/core/events/idt.ts';
import { degToPx } from '../../src/core/geometry/angles.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { dispersion } from '../../src/core/metrics/validation.ts';
import { Flags } from '../../src/core/types.ts';
import type { GazeSample, RecordedFrame, Recording, SessionGeometry, TargetItem, Vec2 } from '../../src/core/types.ts';

const DT = 1000 / 30;
const GEOMETRY: SessionGeometry = {
  screen: { viewportWpx: 1920, viewportHpx: 1080, screenWpx: 1920, screenHpx: 1080, dpr: 1, fullscreen: true, pxPerMm: 1920 / 531, pxPerMmSource: 'card' },
  distance: { focalPx: 1000, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 10, irisMm: 11.7 },
  refDistanceMm: 600,
  degreesApproximate: false,
};

type Part =
  | { fix: Vec2; n: number }
  | { saccade: number }
  | { invalid: number; flags: number }
  | { stallFrames: number };

interface Truth {
  type: EventType;
  onsetMs: number;
  offsetMs: number;
}

/**
 * Builds a 30 Hz stream. Saccade samples lie on the line between the fixations either side;
 * invalid samples carry no angle; a stall skips frames without any sample.
 */
function scanpath(parts: readonly Part[], noiseDeg: number, seed = 1): { samples: GazeSample[]; fixations: Truth[] } {
  const g = gaussian(mulberry32(seed));
  const samples: GazeSample[] = [];
  const fixations: Truth[] = [];
  let k = 0;
  const push = (deg: Vec2 | null, flags: number): void => {
    samples.push({
      frameIndex: k, tCaptureMs: k * DT, estimator: 'combined', rawDeg: deg, correctedDeg: deg, rawPx: null, correctedPx: null, filteredPx: null,
      perEngineDeg: {}, flags, confidence: 1, distanceMm: 600,
    });
    k++;
  };
  parts.forEach((part, p) => {
    if ('fix' in part) {
      fixations.push({ type: 'fixation', onsetMs: k * DT, offsetMs: (k + part.n - 1) * DT });
      for (let i = 0; i < part.n; i++) push([part.fix[0] + noiseDeg * g(), part.fix[1] + noiseDeg * g()], 0);
    } else if ('saccade' in part) {
      const from = (parts.slice(0, p).reverse().find((q) => 'fix' in q) as { fix: Vec2 }).fix;
      const to = (parts.slice(p + 1).find((q) => 'fix' in q) as { fix: Vec2 }).fix;
      for (let i = 1; i <= part.saccade; i++) {
        const f = i / (part.saccade + 1);
        push([from[0] + f * (to[0] - from[0]), from[1] + f * (to[1] - from[1])], 0);
      }
    } else if ('invalid' in part) {
      for (let i = 0; i < part.invalid; i++) push(null, part.flags);
    } else {
      k += part.stallFrames;
    }
  });
  return { samples, fixations };
}

function ofType(events: readonly GazeEvent[], type: EventType): GazeEvent[] {
  return events.filter((e) => e.type === type);
}

function assertWithinOneSample(found: readonly GazeEvent[], truth: readonly Truth[], what: string): void {
  assert.equal(found.length, truth.length, `${what}: ${found.length} found, ${truth.length} planted`);
  truth.forEach((t, i) => {
    const e = found[i] as GazeEvent;
    assert.ok(Math.abs(e.onsetMs - t.onsetMs) <= DT + 1e-6, `${what} ${i}: onset ${e.onsetMs} vs ${t.onsetMs}`);
    assert.ok(Math.abs(e.offsetMs - t.offsetMs) <= DT + 1e-6, `${what} ${i}: offset ${e.offsetMs} vs ${t.offsetMs}`);
  });
}

test('θ_D = clamp(4 × SD₂d, 1.5°, 6°)', () => {
  assert.deepEqual([EVENTS.idtK, EVENTS.idtMinDeg, EVENTS.idtMaxDeg], [4, 1.5, 6]);
  assert.equal(idtDispersionDeg(0.1), 1.5);
  assert.equal(idtDispersionDeg(0.5), 2);
  assert.equal(idtDispersionDeg(2), 6);
  assert.equal(idtDispersionDeg(0), 1.5);
  assert.throws(() => idtDispersionDeg(Number.NaN), RangeError);
  assert.throws(() => idtDispersionDeg(-1), RangeError);
});

test('a noisy scanpath with saccades, a blink, a bridged gap, an unbridged gap and a long closure', () => {
  const B: Vec2 = [8, 0];
  const C: Vec2 = [-5, 3];
  const { samples } = scanpath(
    [
      { fix: [0, 0], n: 15 }, // 0–14
      { saccade: 2 }, // 15–16
      { fix: B, n: 20 }, // 17–36
      { invalid: 6, flags: Flags.BLINK }, // 37–42: a 200 ms blink
      { fix: B, n: 15 }, // 43–57
      { invalid: 2, flags: Flags.NO_FACE }, // 58–59: 67 ms, bridged
      { fix: B, n: 15 }, // 60–74
      { saccade: 1 }, // 75
      { fix: C, n: 20 }, // 76–95
      { invalid: 3, flags: Flags.NO_FACE }, // 96–98: 100 ms, never bridged
      { fix: C, n: 20 }, // 99–118
      { invalid: 20, flags: Flags.BLINK }, // 119–138: 667 ms, too long for a blink
      { fix: [2, -4], n: 20 }, // 139–158
    ],
    0.1,
  );
  const { events, thresholds } = detectEvents(samples, GEOMETRY, 0.14);
  assert.equal(thresholds.dispersionDeg, 1.5);
  assert.ok(Math.abs(thresholds.frameIntervalMs - DT) < 1e-9);
  const t = (i: number): number => i * DT;
  assertWithinOneSample(ofType(events, 'fixation'), [
    { type: 'fixation', onsetMs: t(0), offsetMs: t(14) },
    { type: 'fixation', onsetMs: t(17), offsetMs: t(36) },
    { type: 'fixation', onsetMs: t(43), offsetMs: t(74) },
    { type: 'fixation', onsetMs: t(76), offsetMs: t(95) },
    { type: 'fixation', onsetMs: t(99), offsetMs: t(118) },
    { type: 'fixation', onsetMs: t(139), offsetMs: t(158) },
  ], 'fixation');
  const saccades = ofType(events, 'saccade');
  assertWithinOneSample(saccades, [
    { type: 'saccade', onsetMs: t(14), offsetMs: t(17) },
    { type: 'saccade', onsetMs: t(74), offsetMs: t(76) },
  ], 'saccade');
  assert.ok(Math.abs((saccades[0]?.amplitudeDeg as number) - 8) < 0.2, `amplitude ${saccades[0]?.amplitudeDeg}`);
  assert.ok(saccades.every((s) => s.centroidDeg === null && s.centroidPx === null));
  assertWithinOneSample(ofType(events, 'blink'), [{ type: 'blink', onsetMs: t(37), offsetMs: t(42) }], 'blink');
  assertWithinOneSample(ofType(events, 'bad_data'), [
    { type: 'bad_data', onsetMs: t(96), offsetMs: t(98) },
    { type: 'bad_data', onsetMs: t(119), offsetMs: t(138) },
  ], 'bad data');
  const fixB2 = ofType(events, 'fixation')[2] as GazeEvent;
  assert.equal(fixB2.nSamples, 30, 'the two bridged samples are interpolated, not counted');
  assert.ok(Math.abs((fixB2.centroidDeg as Vec2)[0] - 8) < 0.1);
  assert.deepEqual(
    events.map((e) => e.onsetMs),
    [...events.map((e) => e.onsetMs)].sort((a, b) => a - b),
    'events in time order',
  );
});

test('gaps over 75 ms are never bridged, shorter ones always are (seeded random gaps and stalls)', () => {
  const rand = mulberry32(2024);
  const checked = { bridged: 0, broken: 0 };
  for (let trial = 0; trial < 40; trial++) {
    const parts: Part[] = [{ fix: [1, 1], n: 12 }];
    for (let k = 0; k < 6; k++) {
      const frames = 1 + Math.floor(rand() * 5);
      parts.push(rand() < 0.5 ? { invalid: frames, flags: rand() < 0.5 ? Flags.NO_FACE : Flags.DROPPED } : { stallFrames: frames });
      parts.push({ fix: [1, 1], n: 6 + Math.floor(rand() * 10) });
    }
    const { samples } = scanpath(parts, 0.05, trial + 1);
    const fixations = ofType(detectEvents(samples, GEOMETRY, 0.1).events, 'fixation');
    const valid = samples.filter((s) => s.flags === 0);
    for (let i = 1; i < valid.length; i++) {
      const a = (valid[i - 1] as GazeSample).tCaptureMs;
      const b = (valid[i] as GazeSample).tCaptureMs;
      const missing = b - a - DT;
      const spanned = fixations.some((f) => f.onsetMs <= a && f.offsetMs >= b);
      if (missing > EVENTS.bridgeMs + 1e-6) {
        assert.equal(spanned, false, `trial ${trial}: ${missing.toFixed(1)} ms gap bridged`);
        checked.broken++;
      } else if (missing > 1) {
        assert.equal(spanned, true, `trial ${trial}: ${missing.toFixed(1)} ms gap not bridged`);
        checked.bridged++;
      }
    }
  }
  assert.ok(checked.bridged > 50 && checked.broken > 50, JSON.stringify(checked));
});

test('stalls without samples: two missing frames bridged, three not', () => {
  const two = scanpath([{ fix: [0, 0], n: 10 }, { stallFrames: 2 }, { fix: [0, 0], n: 10 }], 0);
  assert.equal(ofType(detectEvents(two.samples, GEOMETRY, 0.1).events, 'fixation').length, 1);
  const three = scanpath([{ fix: [0, 0], n: 10 }, { stallFrames: 3 }, { fix: [0, 0], n: 10 }], 0);
  const split = detectEvents(three.samples, GEOMETRY, 0.1).events;
  assert.equal(ofType(split, 'fixation').length, 2);
  assert.equal(ofType(split, 'saccade').length, 0, 'no saccade across a break');
  assert.equal(ofType(split, 'bad_data').length, 0, 'a stall has no samples to label');
});

test('blinks last 50–500 ms; other invalid runs over 75 ms are bad data', () => {
  const { samples } = scanpath(
    [
      { fix: [0, 0], n: 10 },
      { invalid: 1, flags: Flags.BLINK }, // 33 ms: bridged, too short for a blink
      { fix: [0, 0], n: 10 },
      { invalid: 2, flags: Flags.BLINK }, // 67 ms: bridged, and long enough to be a blink
      { fix: [0, 0], n: 10 },
      { invalid: 15, flags: Flags.BLINK }, // 500 ms: still a blink
      { fix: [0, 0], n: 10 },
      { invalid: 16, flags: Flags.BLINK }, // 533 ms: bad data
      { fix: [0, 0], n: 10 },
      { invalid: 4, flags: Flags.NO_FACE }, // bad data
      { fix: [0, 0], n: 10 },
      { invalid: 6, flags: Flags.BLINK }, // a blink, then the face is lost
      { invalid: 10, flags: Flags.NO_FACE },
      { fix: [0, 0], n: 10 },
    ],
    0,
  );
  const { events } = detectEvents(samples, GEOMETRY, 0.1);
  const t = (i: number): number => i * DT;
  assert.deepEqual(
    ofType(events, 'blink').map((e) => [e.onsetMs, e.offsetMs, e.nSamples]),
    [[t(21), t(22), 2], [t(33), t(47), 15], [t(98), t(103), 6]],
  );
  assert.deepEqual(
    ofType(events, 'bad_data').map((e) => [e.onsetMs, e.offsetMs, e.nSamples]),
    [[t(58), t(73), 16], [t(84), t(87), 4], [t(104), t(113), 10]],
  );
});

test('fixations split by slow drift merge when under 75 ms apart and within 1°', () => {
  const drift = (n: number, to: number): GazeSample[] =>
    Array.from({ length: n }, (_, k) => {
      const deg: Vec2 = [(to * k) / (n - 1), 0];
      return {
        frameIndex: k, tCaptureMs: k * DT, estimator: 'combined', rawDeg: deg, correctedDeg: deg, rawPx: null, correctedPx: null, filteredPx: null,
        perEngineDeg: {}, flags: 0, confidence: 1, distanceMm: 600,
      };
    });
  const merged = ofType(detectEvents(drift(30, 1.8), GEOMETRY, 0.1).events, 'fixation');
  assert.equal(merged.length, 1, 'two I-DT windows 0.93° apart become one fixation');
  assert.equal(merged[0]?.onsetMs, 0);
  assert.ok(Math.abs((merged[0]?.offsetMs as number) - 29 * DT) < 1e-9);
  const apart = detectEvents(drift(60, 3.6), GEOMETRY, 0.1).events;
  assert.equal(ofType(apart, 'fixation').length, 3, 'centroids more than 1° apart stay separate');
  assert.equal(ofType(apart, 'saccade').length, 2);
});

test('centroids in px at the samples’ distance; minimum duration; input checks', () => {
  const { samples } = scanpath([{ fix: [5, -3], n: 10 }], 0);
  const [fix] = detectEvents(samples, GEOMETRY, 0.1).events;
  assert.ok(fix !== undefined && fix.type === 'fixation');
  const px = degToPx([5, -3], GEOMETRY.screen, 600);
  assert.ok(Math.abs((fix.centroidPx as Vec2)[0] - px[0]) < 1e-9 && Math.abs((fix.centroidPx as Vec2)[1] - px[1]) < 1e-9);
  // 3 samples span 67 ms (< 100 ms): no fixation; 4 samples span 100 ms: one.
  assert.equal(ofType(detectEvents(scanpath([{ fix: [0, 0], n: 3 }], 0).samples, GEOMETRY, 0.1).events, 'fixation').length, 0);
  assert.equal(ofType(detectEvents(scanpath([{ fix: [0, 0], n: 4 }], 0).samples, GEOMETRY, 0.1).events, 'fixation').length, 1);
  assert.deepEqual(detectEvents([], GEOMETRY, 0.1).events, []);
  const backwards = [...samples].reverse();
  assert.throws(() => detectEvents(backwards, GEOMETRY, 0.1), RangeError);
  assert.throws(() => detectEvents(samples, GEOMETRY, Number.NaN), RangeError);
});

test('SD₂d: median per-target SD of the median-filtered validation stream', () => {
  const items: TargetItem[] = [0.3, 0.7].map((xNorm, k) => ({
    kind: 'target', id: `val-${k}`, phase: 'validation', block: 0, xNorm, yNorm: 0.5, groupId: `val-${k}`, settleMs: 600, sampleMs: 1000, maxSampleMs: 1000,
  }));
  const frames: RecordedFrame[] = Array.from({ length: 150 }, (_, i) => ({
    meta: { index: i, tCaptureMs: i * DT, clock: 'captureTime', presentedFrames: i, cameraGap: 0, videoW: 1280, videoH: 720 },
    distanceMm: 600, yawDeg: 0, pitchDeg: 0, rollDeg: 0, eyeMidNorm: [0.5, 0.5], open: true, label: null, engines: {},
  }));
  const rec: Recording = {
    id: 'v', schedule: { seed: 1, preset: 'quick', kind: 'validation', items }, geometry: GEOMETRY, frames,
    presentations: items.map((it, k) => ({ itemId: it.id, onsetMs: 2000 * k, offsetMs: 2000 * k + 1700, attempt: 1, frameIntervalMs: 16.7, aborted: false })),
  };
  const g = gaussian(mulberry32(5));
  const noisy = frames.map((f): GazeSample => {
    const deg: Vec2 = [0.4 * g(), 0.4 * g()];
    return { frameIndex: f.meta.index, tCaptureMs: f.meta.tCaptureMs, estimator: 'combined', rawDeg: deg, correctedDeg: deg, rawPx: null, correctedPx: null, filteredPx: null, perEngineDeg: {}, flags: 0, confidence: 1, distanceMm: 600 };
  });
  const sd2d = idtSd2dDeg(rec, noisy);
  const rawSd = dispersion(noisy.slice(18, 48).map((s) => s.rawDeg as Vec2)).sdDeg;
  assert.ok(sd2d > 0 && sd2d < rawSd, `filtered ${sd2d} vs raw ${rawSd}`);
  const still = noisy.map((s) => ({ ...s, rawDeg: [1, 1] as Vec2 }));
  assert.equal(idtSd2dDeg(rec, still), 0);
  assert.ok(Number.isNaN(idtSd2dDeg(rec, noisy.map((s) => ({ ...s, flags: Flags.NO_FACE })))));
});
