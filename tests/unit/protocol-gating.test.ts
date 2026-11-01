// WP8 (spec §10.1): frame acceptance per rule (§4.7), head speed, the ±1-frame blink mask, the
// labeller and the recorder; and the head-range gate (§4.10).
import assert from 'node:assert/strict';
import test from 'node:test';
import { GATE_FIX, GATE_HEAD, HEAD_RANGE } from '../../src/core/constants.ts';
import { applyBlinkMask, gateFrame, HeadSpeedMeter, type GateInput } from '../../src/core/protocol/gating.ts';
import { computeHeadRange, inHeadRange } from '../../src/core/protocol/headRange.ts';
import { FrameRecorder, inSettleWindow, Labeller } from '../../src/core/protocol/labelling.ts';
import { calibrationSchedule } from '../../src/core/protocol/schedule.ts';
import type { FaceObservation, FrameMeta, FrameResult, RecordedFrame, RejectCode, SessionGeometry, TargetItem } from '../../src/core/types.ts';

const ok: GateInput = {
  phase: 'fixation',
  dropped: false,
  hidden: false,
  notFullscreen: false,
  inSettle: false,
  face: true,
  open: true,
  interOcularPx: 100,
  yawDeg: 0,
  pitchDeg: 0,
  headSpeedDegS: 5,
};

test('each gating rule rejects with its own code, in precedence order', () => {
  assert.deepEqual(gateFrame(ok), { accepted: true, reject: null });
  const cases: [Partial<GateInput>, string][] = [
    [{ dropped: true }, 'dropped'],
    [{ hidden: true }, 'hidden'],
    [{ notFullscreen: true }, 'not-fullscreen'],
    [{ inSettle: true }, 'settle'],
    [{ face: false }, 'no-face'],
    [{ open: false }, 'blink'],
    [{ interOcularPx: GATE_FIX.interOcularPx - 1 }, 'small-face'],
    [{ interOcularPx: Number.NaN }, 'small-face'],
    [{ yawDeg: GATE_FIX.yawDeg + 0.1 }, 'pose'],
    [{ pitchDeg: -(GATE_FIX.pitchDeg + 0.1) }, 'pose'],
    [{ headSpeedDegS: GATE_FIX.headSpeedDegS + 1 }, 'motion'],
  ];
  for (const [change, code] of cases) assert.deepEqual(gateFrame({ ...ok, ...change }), { accepted: false, reject: code }, code);
  // Precedence: a dropped frame in the settle window is 'dropped'; a hidden frame without a face is 'hidden'.
  assert.equal(gateFrame({ ...ok, dropped: true, inSettle: true }).reject, 'dropped');
  assert.equal(gateFrame({ ...ok, hidden: true, face: false }).reject, 'hidden');
  assert.equal(gateFrame({ ...ok, face: false, open: false }).reject, 'no-face');
  // Limits are inclusive; an unmeasurable speed does not reject.
  assert.equal(gateFrame({ ...ok, yawDeg: GATE_FIX.yawDeg, pitchDeg: GATE_FIX.pitchDeg, headSpeedDegS: GATE_FIX.headSpeedDegS }).accepted, true);
  assert.equal(gateFrame({ ...ok, headSpeedDegS: Number.NaN }).accepted, true);
});

test('head-motion frames use the wider pose limits and no speed limit', () => {
  const head = { ...ok, phase: 'head' as const };
  assert.equal(gateFrame({ ...head, yawDeg: GATE_HEAD.yawDeg, pitchDeg: GATE_HEAD.pitchDeg, headSpeedDegS: 200 }).accepted, true);
  assert.equal(gateFrame({ ...head, yawDeg: GATE_HEAD.yawDeg + 0.5 }).reject, 'pose');
  assert.equal(gateFrame({ ...ok, phase: 'pursuit', yawDeg: GATE_HEAD.yawDeg }).reject, 'pose');
  assert.equal(gateFrame({ ...ok, phase: 'validation', headSpeedDegS: 100 }).reject, 'motion');
});

test('head speed is the finite difference over the frames of the last 100 ms', () => {
  const m = new HeadSpeedMeter();
  assert.ok(Number.isNaN(m.push(0, 0, 0, 0)));
  assert.ok(Math.abs(m.push(33, 1, 0, 0) - 1 / 0.033) < 1e-9);
  assert.ok(Math.abs(m.push(66, 2, 0, 0) - 2 / 0.066) < 1e-9);
  // At 133 ms the frame at 0 has left the window; the oldest left is the one at 33.
  assert.ok(Math.abs(m.push(133, 3, 4, 0) - Math.hypot(2, 4) / 0.1) < 1e-9);
  // After a gap longer than the window there is nothing to difference against.
  assert.ok(Number.isNaN(m.push(400, 3, 4, 0)));
  m.reset();
  assert.ok(Number.isNaN(m.push(500, 0, 0, 0)));
});

function frame(index: number, open: boolean, reject: RejectCode | null = null): RecordedFrame {
  return {
    meta: { index, tCaptureMs: index * 33, clock: 'captureTime', presentedFrames: index, cameraGap: 0, videoW: 640, videoH: 480 },
    distanceMm: 600,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    eyeMidNorm: [0.5, 0.5],
    open,
    label: { itemId: 'A-loc-4', phase: 'fixation', groupId: 'loc-4', tRelMs: index * 33, accepted: reject === null && open, reject: reject ?? (open ? null : 'blink') },
    engines: {},
  };
}

test('the blink mask closes one frame either side of a closed frame, by capture index', () => {
  const frames = [frame(0, true), frame(1, true), frame(2, false), frame(3, true), frame(4, true), frame(6, true), frame(7, false)];
  frames[4]!.label!.reject = 'pose';
  frames[4]!.label!.accepted = false;
  assert.equal(applyBlinkMask(frames), 3);
  assert.deepEqual(frames.map((f) => f.open), [true, false, false, false, true, false, false]);
  assert.deepEqual(frames.map((f) => f.label!.reject), [null, 'blink', 'blink', 'blink', 'pose', 'blink', 'blink']);
  // A settle rejection outranks the blink and keeps its code.
  const settle = [frame(0, true, 'settle'), frame(1, false)];
  applyBlinkMask(settle);
  assert.equal(settle[0]!.label!.reject, 'settle');
  assert.equal(settle[0]!.open, false);
});

test('the labeller finds the presentation on screen at a capture time', () => {
  const schedule = calibrationSchedule({ preset: 'quick', seed: 1 });
  const items = schedule.items.filter((i): i is TargetItem => i.kind === 'target');
  const l = new Labeller(schedule, []);
  const a = l.open(items[0]!.id, 100, 1);
  assert.equal(l.find(150)?.item.id, items[0]!.id);
  assert.equal(l.find(5000)?.tRelMs, 4900, 'an open presentation has no end yet');
  assert.throws(() => l.open(items[1]!.id, 200, 1), /still open/);
  l.close(a, 1700, 16.7, false);
  assert.equal(l.find(1700), null);
  assert.equal(l.find(99), null);
  const b = l.open(items[1]!.id, 1800, 1);
  assert.equal(l.find(1750), null);
  assert.equal(l.find(1800)?.presentation, b);
  assert.throws(() => l.open('I-fixation', 3000, 1), RangeError);
  assert.equal(inSettleWindow(items[0]!, 599), true);
  assert.equal(inSettleWindow(items[0]!, 600), false);
});

const geometry: SessionGeometry = {
  screen: { viewportWpx: 1280, viewportHpx: 720, screenWpx: 1280, screenHpx: 720, dpr: 1, fullscreen: false, pxPerMm: 3.78, pxPerMmSource: 'assumed', insets: { top: 0, right: 0, bottom: 0, left: 0 }, presentationMode: 'viewport' },
  distance: { focalPx: 554, focalSource: 'assumed-fov', blindSpotMm: null, blindSpotSdMm: null, irisMm: 11.7 },
  refDistanceMm: null,
  degreesApproximate: true,
};

function result(index: number, t: number, opts: { face?: boolean; open?: boolean; interOcular?: number; yaw?: number } = {}): FrameResult {
  const meta: FrameMeta = { index, tCaptureMs: t, clock: 'captureTime', presentedFrames: index, cameraGap: 0, videoW: 640, videoH: 480 };
  const face = opts.face === false
    ? null
    : ({
        pose: { yawDeg: opts.yaw ?? 0, pitchDeg: 0, rollDeg: 0, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, -50], scale: 1 },
        eyes: { earL: 0.3, earR: 0.3, openQL: 1, openQR: 1, blinkL: 0, blinkR: 0, irisDiamPx: 15, eyeMidNorm: [0.5, 0.4], interOcularPx: opts.interOcular ?? 100, open: opts.open ?? true },
      } as unknown as FaceObservation);
  return { meta, face, engines: {}, workerMs: 1, receivedMs: t + 30 };
}

test('the recorder labels, gates and masks frames, and records refused frames as dropped', () => {
  const schedule = calibrationSchedule({ preset: 'quick', seed: 1 });
  const item = schedule.items.find((i): i is TargetItem => i.kind === 'target')!;
  const r = new FrameRecorder('rec-1', schedule, geometry);
  const state = { hidden: false, notFullscreen: false, distanceMm: 600 };
  r.addResult(result(0, 50), state);
  const p = r.labeller.open(item.id, 100, 1);
  for (let k = 1; k <= 30; k++) {
    const t = 100 + k * 33;
    if (k === 25) {
      r.addDropped({ index: k, tCaptureMs: t, clock: 'captureTime', presentedFrames: k, cameraGap: 0, videoW: 640, videoH: 480 });
      continue;
    }
    r.addResult(result(k, t, { open: k !== 22, interOcular: k === 28 ? 40 : 100, yaw: k === 29 ? 30 : 0, face: k !== 30 }), { ...state, hidden: k === 27 });
  }
  r.labeller.close(p, 1100, 16.7, false);
  const live = r.counts(p);
  const rec = r.finish();
  const byIndex = new Map(rec.frames.map((f) => [f.meta.index, f]));
  assert.equal(byIndex.get(0)!.label, null, 'before the presentation');
  assert.equal(byIndex.get(1)!.label!.reject, 'settle');
  assert.equal(byIndex.get(20)!.label!.accepted, true);
  assert.equal(byIndex.get(20)!.label!.groupId, item.groupId);
  assert.deepEqual([21, 22, 23].map((k) => byIndex.get(k)!.label!.reject), ['blink', 'blink', 'blink'], 'the ±1 mask around frame 22');
  assert.equal(byIndex.get(25)!.label!.reject, 'dropped');
  assert.deepEqual(byIndex.get(25)!.engines, {});
  assert.equal(byIndex.get(27)!.label!.reject, 'hidden');
  assert.equal(byIndex.get(28)!.label!.reject, 'small-face');
  assert.equal(byIndex.get(29)!.label!.reject, 'pose');
  assert.equal(byIndex.get(30)!.label!.reject, 'no-face');
  assert.equal(byIndex.get(30)!.yawDeg, null);
  assert.equal(r.receivedMs.get(20), 100 + 20 * 33 + 30);
  assert.deepEqual(rec.frames.map((f) => f.meta.index), Array.from({ length: 31 }, (_, k) => k));
  // Live counts saw the look-back mask (22, 23) but not yet frame 21.
  const finalAccepted = rec.frames.filter((f) => f.label?.accepted).length;
  assert.equal(live.accepted, finalAccepted + 1);
  assert.ok(live.labelled >= live.accepted);
});

test('the head range is P2.5–P97.5 of the calibration frames widened by the margins, and gates frames', () => {
  const samples = Array.from({ length: 401 }, (_, i) => ({ yawDeg: -10 + i * 0.05, pitchDeg: 0, lnDistRatio: 0, eyeMid: [0.5, 0.5] as [number, number] }));
  const range = computeHeadRange(samples);
  assert.ok(Math.abs(range.yawDeg[0] - (-10 + 0.025 * 20 - HEAD_RANGE.angleMarginDeg)) < 1e-9);
  assert.ok(Math.abs(range.yawDeg[1] - (10 - 0.025 * 20 + HEAD_RANGE.angleMarginDeg)) < 1e-9);
  assert.deepEqual(range.pitchDeg, [-HEAD_RANGE.angleMarginDeg, HEAD_RANGE.angleMarginDeg]);
  assert.deepEqual(range.lnDistRatio, [-HEAD_RANGE.lnDistMargin, HEAD_RANGE.lnDistMargin]);
  assert.deepEqual(range.eyeMidX, [0.5 - HEAD_RANGE.eyeMidMargin, 0.5 + HEAD_RANGE.eyeMidMargin]);
  const inside = { yawDeg: 12, pitchDeg: -3, lnDistRatio: 0.05, eyeMid: [0.53, 0.47] as [number, number] };
  assert.equal(inHeadRange(range, inside), true);
  assert.equal(inHeadRange(range, { ...inside, yawDeg: 14 }), false);
  assert.equal(inHeadRange(range, { ...inside, pitchDeg: 4.5 }), false);
  assert.equal(inHeadRange(range, { ...inside, lnDistRatio: -0.2 }), false);
  assert.equal(inHeadRange(range, { ...inside, eyeMid: [0.56, 0.5] }), false);
  assert.equal(inHeadRange(range, { ...inside, yawDeg: Number.NaN }), false);
  assert.throws(() => computeHeadRange([]), RangeError);
});
