// WP8 (spec §10.1): the pursuit path and its speed limit, labelling at t − τ, and recovery of a
// planted lag (§4.7 block B, §4.8.6).
import assert from 'node:assert/strict';
import test from 'node:test';
import { LAG, PURSUIT } from '../../src/core/constants.ts';
import { buildDataset } from '../../src/core/calibration/dataset.ts';
import { pxToDeg } from '../../src/core/geometry/angles.ts';
import { layoutToPx } from '../../src/core/geometry/screen.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { estimatePursuitLag, lagGridMs, type LagSample } from '../../src/core/protocol/lag.ts';
import { peakAngularSpeedDegS, pursuitPeriodMs, pursuitPoint, pursuitTargetAt } from '../../src/core/protocol/pursuit.ts';
import { calibrationSchedule } from '../../src/core/protocol/schedule.ts';
import type { PursuitItem, RecordedFrame, Recording, ScreenGeometry, SessionGeometry, Vec2 } from '../../src/core/types.ts';

const base = { periodMs: PURSUIT.periodMs, ax: PURSUIT.ax, ay: PURSUIT.ay, phiX: PURSUIT.phiX, phiY: PURSUIT.phiY };
const laptop = { viewportWpx: 1440, viewportHpx: 900, pxPerMm: 1440 / 331, insets: { top: 0, right: 0, bottom: 0, left: 0 } };

test('the path is the 2:3 Lissajous figure, closed after one period, starting at (0.5, 0.92)', () => {
  const start = pursuitPoint(base, 0);
  assert.ok(Math.abs(start[0] - 0.5) < 1e-12 && Math.abs(start[1] - 0.92) < 1e-12);
  const end = pursuitPoint(base, PURSUIT.periodMs);
  assert.ok(Math.abs(end[0] - start[0]) < 1e-12 && Math.abs(end[1] - start[1]) < 1e-12);
  assert.deepEqual(pursuitPoint(base, -500), start);
  const quarter = pursuitPoint(base, PURSUIT.periodMs / 8);
  assert.ok(Math.abs(quarter[0] - 0.92) < 1e-12, 'x peaks at T/8 (two cycles)');
  for (let t = 0; t <= PURSUIT.periodMs; t += 97) {
    const [x, y] = pursuitPoint(base, t);
    assert.ok(x >= 0.08 - 1e-12 && x <= 0.92 + 1e-12 && y >= 0.08 - 1e-12 && y <= 0.92 + 1e-12);
  }
});

test('the period is lengthened in proportion when the peak angular speed would exceed 15°/s', () => {
  // A laptop at 60 cm: within the limit, so T stays 16 s.
  assert.equal(pursuitPeriodMs(laptop, 600), PURSUIT.periodMs);
  assert.ok(peakAngularSpeedDegS(base, laptop, 600) <= PURSUIT.maxSpeedDegS);
  // A large screen close up: lengthened until the peak is exactly the limit.
  const big = { viewportWpx: 2560, viewportHpx: 1440, pxPerMm: 2560 / 597, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
  const T = pursuitPeriodMs(big, 450);
  assert.ok(T > PURSUIT.periodMs);
  const peak = peakAngularSpeedDegS({ ...base, periodMs: T }, big, 450);
  assert.ok(Math.abs(peak - PURSUIT.maxSpeedDegS) < 1e-6, `peak ${peak}°/s at T = ${T}`);
  // Speed scales as 1/T.
  const p16 = peakAngularSpeedDegS(base, big, 450);
  assert.ok(Math.abs(peakAngularSpeedDegS({ ...base, periodMs: 32000 }, big, 450) - p16 / 2) < 1e-9);
});

function geometry(screen: Omit<ScreenGeometry, 'screenWpx' | 'screenHpx' | 'dpr' | 'fullscreen' | 'pxPerMmSource'>): SessionGeometry {
  return {
    screen: { ...screen, screenWpx: screen.viewportWpx, screenHpx: screen.viewportHpx, dpr: 1, fullscreen: true, pxPerMmSource: 'card' },
    distance: { focalPx: 600, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 10, irisMm: 11.7 },
    refDistanceMm: 600,
    degreesApproximate: false,
  };
}

test('pursuit frames are labelled with the target at t − τ and grouped with the nearest location to it', () => {
  const schedule = calibrationSchedule({ preset: 'standard', seed: 1 });
  const item = schedule.items.find((i): i is PursuitItem => i.kind === 'pursuit')!;
  const g = geometry(laptop);
  const onset = 1000;
  const frames: RecordedFrame[] = [];
  for (let t = onset + item.holdMs + item.discardMs; t < onset + item.holdMs + item.periodMs; t += 100) {
    frames.push({
      meta: { index: frames.length, tCaptureMs: t, clock: 'captureTime', presentedFrames: frames.length, cameraGap: 0, videoW: 640, videoH: 480 },
      distanceMm: 600,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      eyeMidNorm: [0.5, 0.5],
      open: true,
      label: { itemId: item.id, phase: 'pursuit', groupId: 'loc-4', tRelMs: t - onset, accepted: true, reject: null },
      engines: {},
    });
  }
  const rec: Recording = { id: 'r', schedule, geometry: g, presentations: [{ itemId: item.id, onsetMs: onset, offsetMs: onset + 20000, attempt: 1, frameIntervalMs: 16.7, aborted: false }], frames };
  for (const lag of [0, 120, 250]) {
    const ds = buildDataset([rec], lag, 600);
    assert.equal(ds.rows.length, frames.length);
    for (const row of ds.rows) {
      const expected = pursuitTargetAt(item, onset, row.frame.meta.tCaptureMs - lag);
      assert.ok(Math.abs(row.targetNorm[0] - expected[0]) < 1e-12 && Math.abs(row.targetNorm[1] - expected[1]) < 1e-12);
      const px = layoutToPx(expected[0], expected[1], g.screen);
      const deg = pxToDeg(px, g.screen, 600);
      assert.ok(Math.abs(row.targetDeg[0] - deg[0]) < 1e-12 && Math.abs(row.targetDeg[1] - deg[1]) < 1e-12);
      assert.equal(row.unit, '0:pursuit');
    }
  }
  // The groups follow the lagged target, and every group is a CAL13 location.
  const groups = new Set(buildDataset([rec], 120, 600).rows.map((r) => r.groupId));
  assert.ok(groups.size >= 8);
  for (const gId of groups) assert.match(gId, /^loc-(\d|1[0-2])$/);
});

test('a planted 120 ms pursuit lag is recovered within ±33 ms, and a poor pursuit falls back to 100 ms', () => {
  assert.deepEqual(lagGridMs(), [0, 33, 66, 99, 132, 165, 198, 231, 264, 297]);
  const g = geometry(laptop).screen;
  const onset = 0;
  const item = { ...base, kind: 'pursuit', id: 'B-pursuit', phase: 'pursuit', block: 2, holdMs: 1000, discardMs: 500 } as PursuitItem;
  const degAt = (t: number): Vec2 => {
    const p = pursuitTargetAt(item, onset, t);
    return pxToDeg(layoutToPx(p[0], p[1], g), g, 600);
  };
  const normal = gaussian(mulberry32(4));
  const samples: LagSample[] = [];
  for (let t = 1500; t < 17000; t += 33.3) {
    const truth = degAt(t - 120);
    samples.push({ predDeg: [truth[0] + 0.4 * normal(), truth[1] + 0.4 * normal()], weight: 1, targetDegAt: (lag) => degAt(t - lag) });
  }
  const est = estimatePursuitLag(samples, 0.9);
  assert.equal(est.source, 'fit');
  assert.ok(Math.abs(est.lagMs - 120) <= 33, `τ = ${est.lagMs}`);
  assert.equal(est.curve.length, 10);

  // Clamped to [50, 250]: a gaze with no lag gives τ = 50.
  const none = samples.map((s, k) => ({ ...s, predDeg: degAt(1500 + k * 33.3) }));
  assert.equal(estimatePursuitLag(none, 0.9).lagMs, LAG.clampMin);
  const fallback = estimatePursuitLag(samples, 0.3);
  assert.deepEqual([fallback.lagMs, fallback.source], [LAG.fallbackMs, 'fallback']);
  assert.equal(estimatePursuitLag([], 1).lagMs, LAG.fallbackMs);
});
