// WP8 (spec §10.1): dataset rows, group assignment, weights per unit (§4.7), and that holding out
// a group removes every row of that location, whatever its phase (§4.8.3).
import assert from 'node:assert/strict';
import test from 'node:test';
import { WEIGHTS } from '../../src/core/constants.ts';
import { buildDataset, buildDesign, referenceDistanceMm, unitWeights } from '../../src/core/calibration/dataset.ts';
import { pruneFixationRows } from '../../src/core/calibration/prune.ts';
import { groupedLooResiduals } from '../../src/core/maths/groupedLoo.ts';
import { predictRow, ridgeFit, withIntercept } from '../../src/core/maths/ridge.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { nearestCalibrationGroup } from '../../src/core/protocol/layouts.ts';
import { pursuitTargetAt } from '../../src/core/protocol/pursuit.ts';
import { calibrationSchedule } from '../../src/core/protocol/schedule.ts';
import type { EngineFrame, Phase, PursuitItem, RecordedFrame, Recording, Schedule, SessionGeometry, TargetItem } from '../../src/core/types.ts';
import { geoLinear } from '../../src/engines/geometric/mappers.ts';

const geometry: SessionGeometry = {
  screen: { viewportWpx: 1600, viewportHpx: 900, screenWpx: 1600, screenHpx: 900, dpr: 1, fullscreen: true, pxPerMm: 4.5, pxPerMmSource: 'card', insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  distance: { focalPx: 600, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 10, irisMm: 11.7 },
  refDistanceMm: null,
  degreesApproximate: false,
};

/** A recording with `perItem` accepted frames for every stimulus item of the schedule, and geometric x from `x`. */
function recording(schedule: Schedule, perItem: number, x: (f: number) => Float32Array, opts: { accept?: (k: number) => boolean } = {}): Recording {
  const frames: RecordedFrame[] = [];
  const presentations: Recording['presentations'] = [];
  let t = 0;
  let index = 0;
  for (const item of schedule.items) {
    if (item.kind === 'instruction') continue;
    const onset = t;
    const start = item.kind === 'pursuit' ? item.holdMs + item.discardMs : item.settleMs;
    const span = item.kind === 'pursuit' ? item.periodMs - item.discardMs : item.sampleMs;
    for (let k = 0; k < perItem; k++) {
      const tRel = start + ((k + 0.5) * span) / perItem;
      const accepted = opts.accept ? opts.accept(index) : true;
      const geo: EngineFrame = { engine: 'geometric', status: 'ok', x: x(index), prior: null, weight: 1, computeMs: 0 };
      frames.push({
        meta: { index, tCaptureMs: onset + tRel, clock: 'captureTime', presentedFrames: index, cameraGap: 0, videoW: 640, videoH: 480 },
        distanceMm: 550 + (index % 7) * 10,
        yawDeg: 2,
        pitchDeg: -1,
        rollDeg: 0.5,
        eyeMidNorm: [0.5, 0.45],
        open: true,
        label: { itemId: item.id, phase: item.phase as Phase, groupId: item.kind === 'target' ? item.groupId : 'loc-4', tRelMs: tRel, accepted, reject: accepted ? null : 'pose' },
        engines: { geometric: geo },
      });
      index++;
    }
    const duration = item.kind === 'pursuit' ? item.holdMs + item.periodMs : item.settleMs + item.sampleMs;
    presentations.push({ itemId: item.id, onsetMs: onset, offsetMs: onset + duration, attempt: 1, frameIntervalMs: 16.7, aborted: false });
    t = onset + duration + 100;
  }
  return { id: 'r', schedule, geometry: { ...geometry }, presentations, frames };
}

const randomX = (seed: number) => {
  const normal = gaussian(mulberry32(seed));
  return () => Float32Array.from({ length: 14 }, () => 0.1 * normal());
};

test('every accepted calibration frame becomes a row, with its group and unit; rejected frames do not', () => {
  const schedule = calibrationSchedule({ preset: 'thorough', seed: 5 });
  const rec = recording(schedule, 10, randomX(1), { accept: (k) => k % 11 !== 3 });
  const dRef = referenceDistanceMm([rec])!;
  const ds = buildDataset([rec], 100, dRef);
  assert.equal(ds.rows.length, rec.frames.filter((f) => f.label!.accepted).length);
  const items = new Map(schedule.items.map((i) => [i.id, i]));
  for (const row of ds.rows) {
    const item = items.get(row.itemId)!;
    if (item.kind === 'target') {
      assert.equal(row.groupId, item.groupId, 'fixation and head rows keep their location');
      assert.equal(row.unit, `${item.phase}:${item.groupId}`, 'A and A′ share the fixation unit of a location');
    } else {
      const p = item as PursuitItem;
      const target = pursuitTargetAt(p, row.onsetMs, row.frame.meta.tCaptureMs - 100);
      assert.equal(row.groupId, nearestCalibrationGroup(target, 1600, 900), 'pursuit rows take the nearest location to the lagged target');
      assert.equal(row.unit, '0:pursuit');
    }
    assert.ok(Math.abs(row.ctx.lnDistRatio - Math.log(row.distanceMm / dRef)) < 1e-12);
    assert.ok(Math.abs(row.ctx.yawRad - (2 * Math.PI) / 180) < 1e-12);
  }
  assert.deepEqual(ds.groupNames, Array.from({ length: 13 }, (_, k) => `loc-${k}`));
});

test('weights: 1.0 per fixation location (A and A′ together), 4.0 for the pursuit, 0.8 per head location, ×2 for recalibration', () => {
  const schedule = calibrationSchedule({ preset: 'thorough', seed: 5 });
  const rec = recording(schedule, 9, randomX(2), { accept: (k) => k % 5 !== 0 });
  const recal: Recording = { ...recording(calibrationSchedule({ preset: 'quick', seed: 6 }), 4, randomX(3)), schedule: { ...calibrationSchedule({ preset: 'quick', seed: 6 }), kind: 'recalibration' } };
  const ds = buildDataset([rec, recal], 100, 600);
  const keep = ds.rows.map((r) => r.id % 13 !== 0);
  const w = unitWeights(ds.rows, keep);
  const totals = new Map<string, number>();
  ds.rows.forEach((r, i) => totals.set(r.unit, (totals.get(r.unit) ?? 0) + (w[i] as number)));
  for (const [unit, total] of totals) {
    const expected = unit.endsWith(':pursuit') ? WEIGHTS.pursuitTotal : unit.startsWith('head:') ? WEIGHTS.headPerLocation : unit.startsWith('1:recal:') ? WEIGHTS.fixationPerLocation * WEIGHTS.recalibrationFactor : WEIGHTS.fixationPerLocation;
    assert.ok(Math.abs(total - expected) < 1e-12, `${unit}: ${total}`);
  }
  assert.ok(totals.has('fixation:loc-12') && totals.has('head:loc-9') && totals.has('0:pursuit') && totals.has('1:recal:loc-0'));
  // Spread equally within a unit; pruned rows get nothing.
  keep.forEach((k, i) => {
    if (!k) assert.equal(w[i], 0);
  });
  const unitRows = ds.rows.filter((r, i) => r.unit === 'fixation:loc-3' && keep[i]);
  assert.ok(unitRows.every((r) => w[r.id] === w[unitRows[0]!.id]));
});

test('holding out a group removes every row of that location: fixation, head and pursuit alike', () => {
  const schedule = calibrationSchedule({ preset: 'standard', seed: 9 });
  const normal = gaussian(mulberry32(11));
  const rec = recording(schedule, 8, () => Float32Array.from({ length: 14 }, () => normal()));
  const ds = buildDataset([rec], 132, 600);
  const w = unitWeights(ds.rows, ds.rows.map(() => true));
  const design = buildDesign(geoLinear, ds.rows, w);
  const n = design.n;
  const p = design.pIn + 1;
  const Z = withIntercept(design.X, n, design.pIn);
  const Y = new Float64Array(n * 2);
  design.ids.forEach((id, i) => {
    Y[i * 2] = ds.rows[id]!.targetDeg[0];
    Y[i * 2 + 1] = ds.rows[id]!.targetDeg[1];
  });
  const wd = Float64Array.from(design.ids, (id) => w[id] as number);
  const groups = Int32Array.from(design.ids, (id) => ds.group[id] as number);
  const lambda = 0.5;
  const e = groupedLooResiduals(Z, Y, wd, n, p, lambda, groups, [0]);
  const phasesSeen = new Set<string>();
  for (let g = 0; g < ds.groupNames.length; g++) {
    const held = [...groups.keys()].filter((i) => groups[i] === g);
    const train = [...groups.keys()].filter((i) => groups[i] !== g);
    for (const i of held) phasesSeen.add(`${ds.groupNames[g]}:${ds.rows[design.ids[i]!]!.phase}`);
    // No training row carries the held-out location.
    assert.ok(train.every((i) => ds.rows[design.ids[i]!]!.groupId !== ds.groupNames[g]));
    const sub = (a: Float64Array, cols: number) => Float64Array.from(train.flatMap((i) => Array.from(a.subarray(i * cols, (i + 1) * cols))));
    const fit = ridgeFit(sub(Z, p), sub(Y, 2), Float64Array.from(train, (i) => wd[i] as number), train.length, p, lambda, [0]);
    for (const i of held) {
      const [x, y] = predictRow(fit.B, Z.subarray(i * p, (i + 1) * p), p);
      assert.ok(Math.abs((Y[i * 2] as number) - x - (e[i * 2] as number)) < 1e-9 && Math.abs((Y[i * 2 + 1] as number) - y - (e[i * 2 + 1] as number)) < 1e-9);
    }
  }
  assert.ok([...phasesSeen].some((s) => s.endsWith(':pursuit')) && phasesSeen.has('loc-9:head') && phasesSeen.has('loc-9:fixation'));
});

test('fixation pruning drops rows far from their location’s median on the geometric primary columns', () => {
  const schedule = calibrationSchedule({ preset: 'quick', seed: 2 });
  const normal = gaussian(mulberry32(3));
  const rec = recording(schedule, 20, (k) => {
    const x = Float32Array.from({ length: 14 }, () => 0.01 * normal());
    if (k === 7) x[2] = 0.5;
    return x;
  });
  const ds = buildDataset([rec], 100, 600);
  const keep = ds.rows.map(() => true);
  const pruned = pruneFixationRows(ds.rows, geoLinear, keep);
  assert.ok(pruned >= 1 && pruned < ds.rows.length * 0.1, `${pruned} pruned`);
  assert.equal(keep[ds.rows.findIndex((r) => r.frame.meta.index === 7)], false);
});

test('a frame whose engine did not return ok is lost to that engine only', () => {
  const schedule = calibrationSchedule({ preset: 'quick', seed: 2 });
  const rec = recording(schedule, 6, randomX(4));
  rec.frames[3]!.engines.geometric = { engine: 'geometric', status: 'error', x: null, prior: null, weight: 0, computeMs: 0 };
  const ds = buildDataset([rec], 100, 600);
  const design = buildDesign(geoLinear, ds.rows, unitWeights(ds.rows, ds.rows.map(() => true)));
  assert.equal(ds.rows.length, rec.frames.length);
  assert.equal(design.n, ds.rows.length - 1);
  assert.ok(!design.ids.includes(3));
  assert.ok(rec.schedule.items.some((i): i is TargetItem => i.kind === 'target'));
});
