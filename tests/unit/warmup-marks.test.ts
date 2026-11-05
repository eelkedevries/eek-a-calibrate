// The Test round's marks (spec §17.7.4): a hit when Ḡ (px) lies in the target's zone, a miss
// otherwise or without a valid sample; Ḡ from the selected estimator's valid samples.
import assert from 'node:assert/strict';
import test from 'node:test';
import { degToPx, pxToDeg } from '../../src/core/geometry/angles.ts';
import { layoutToPx } from '../../src/core/geometry/screen.ts';
import { Flags, type GazeSample, type RecordedFrame, type Recording, type SessionGeometry, type TargetItem, type Vec2 } from '../../src/core/types.ts';
import { meanGazeTargets, testMarks } from '../../src/core/warmup/marks.ts';

const SCREEN = { viewportWpx: 1200, viewportHpx: 800, screenWpx: 1200, screenHpx: 800, dpr: 1, fullscreen: true, pxPerMm: 4, pxPerMmSource: 'assumed' as const };
const G: SessionGeometry = { screen: SCREEN, distance: { focalPx: 600, focalSource: 'assumed-fov', blindSpotMm: null, blindSpotSdMm: null, irisMm: 11.7 }, refDistanceMm: 600, degreesApproximate: true };

function item(id: string, x: number, y: number): TargetItem {
  return { kind: 'target', id, phase: 'validation', block: 1, xNorm: x, yNorm: y, groupId: id, settleMs: 600, sampleMs: 1000, maxSampleMs: 1000 };
}

/** Frames every 100 ms over each item's presentation; the gaze of item k is `gaze[k]` (px), or invalid. */
function scenario(items: TargetItem[], gaze: (Vec2 | null)[]) {
  const frames: RecordedFrame[] = [];
  const samples: GazeSample[] = [];
  const presentations = items.map((it, k) => ({ itemId: it.id, onsetMs: 2000 * k, offsetMs: 2000 * k + 1600, attempt: 1, frameIntervalMs: 16, aborted: false }));
  let index = 0;
  items.forEach((_item, k) => {
    for (let t = 2000 * k; t < 2000 * k + 1600; t += 100) {
      const f = { meta: { index, tCaptureMs: t }, distanceMm: 600 } as unknown as RecordedFrame;
      frames.push(f);
      const g = gaze[k];
      const deg = g ? pxToDeg(g, SCREEN, 600) : null;
      samples.push({ frameIndex: index, tCaptureMs: t, estimator: 'combined', rawDeg: deg, correctedDeg: deg, rawPx: g, correctedPx: g, filteredPx: null, perEngineDeg: {}, flags: g ? 0 : Flags.NO_FACE, confidence: 1, distanceMm: 600 });
      index += 1;
    }
  });
  const rec = { id: 'v', schedule: { seed: 1, preset: 'quick', kind: 'validation', items }, geometry: G, presentations, frames } as unknown as Recording;
  return { rec, samples };
}

test('Ḡ is the mean of the valid samples in the sampling window, in px', () => {
  const items = [item('a', 0.15, 0.15), item('b', 0.85, 0.85)];
  const { rec, samples } = scenario(items, [[200, 150], null]);
  const targets = meanGazeTargets(rec, samples, G);
  assert.equal(targets.length, 2);
  assert.deepEqual(targets[0]!.targetPx, layoutToPx(0.15, 0.15, SCREEN));
  const g = targets[0]!.gazePx!;
  const expected = degToPx(pxToDeg([200, 150], SCREEN, 600), SCREEN, 600);
  assert.ok(Math.abs(g[0] - expected[0]) < 1e-9 && Math.abs(g[1] - expected[1]) < 1e-9);
  assert.equal(targets[1]!.gazePx, null, 'no valid sample');
});

test('hit in the target\'s zone, miss elsewhere or without a sample', () => {
  const grid = { cols: 3, rows: 1 };
  const v = { w: 1200, h: 800 };
  const marks = testMarks(
    [
      { itemId: 'a', targetPx: [180, 120], gazePx: [390, 700] },
      { itemId: 'b', targetPx: [1020, 680], gazePx: [700, 680] },
      { itemId: 'c', targetPx: [600, 400], gazePx: null },
      { itemId: 'd', targetPx: [1020, 120], gazePx: [1300, -50] },
    ],
    grid,
    v,
  );
  assert.deepEqual(marks.map((m) => m.hit), [true, false, false, true]);
  assert.deepEqual(marks.map((m) => m.zone), [[0, 0], [2, 0], [1, 0], [2, 0]]);
  // With no zones, nothing can be hit.
  assert.deepEqual(testMarks([{ itemId: 'a', targetPx: [180, 120], gazePx: [180, 120] }], { cols: 0, rows: 0 }, v).map((m) => m.hit), [false]);
});
