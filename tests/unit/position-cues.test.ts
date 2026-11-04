// The cues of the ready check (design §3.4–§3.6): every rank, the priority order and the single
// instruction, hysteresis, the status row's groups and the copy for phones and webcams.
import assert from 'node:assert/strict';
import test from 'node:test';
import { activeConditions, CONDITIONS, cueCopy, PRIORITY, statusRow, topCondition, type ConditionId } from '../../src/core/position/cues.ts';
import type { Signals } from '../../src/core/position/signals.ts';
import { classRanges } from '../../src/core/position/thresholds.ts';
import { STRINGS } from '../../src/app/strings.en-GB.ts';
import { clearSignals } from './position-helpers.ts';

const PHONE = classRanges('phone-portrait', { setup: 'propped' });
const WEBCAM = classRanges('webcam');
const READY = { loading: false, cameraStarted: true };
const active = (s: Signals, r = PHONE, prev: ReadonlySet<ConditionId> = new Set(), ctx = READY) => activeConditions(s, r, prev, ctx);

test('all clear: no condition, every status good', () => {
  for (const r of [PHONE, WEBCAM, classRanges('phone-landscape'), classRanges('tablet')]) {
    const on = active(clearSignals(r), r);
    assert.deepEqual([...on], [], r.cls);
    assert.deepEqual(statusRow(on, clearSignals(r)), { distance: 'good', position: 'good', light: 'good' });
  }
});

// One case per rank of design §3.4, each on otherwise clear signals.
const RANKED: readonly [number, ConditionId, (r: typeof PHONE) => Partial<Signals>, { ctx?: typeof READY } | undefined][] = [
  [0, 'loading', () => ({}), { ctx: { loading: true, cameraStarted: true } }],
  [1, 'no-camera', () => ({ delivering: false }), undefined],
  [2, 'black', () => ({ frameLuma: 3 }), undefined],
  [3, 'too-dark', () => ({ face: false, faceNow: false, frameLuma: 25 }), undefined],
  [4, 'no-face', () => ({ face: false, faceNow: false }), undefined],
  [5, 'several-faces', () => ({ faceCount: 2 }), undefined],
  [6, 'cut-off', () => ({ margins: { x: 0.02, y: 0.3 } }), undefined],
  [7, 'too-far', (r) => ({ scale: r.face.band[0] - 0.02 }), undefined],
  [8, 'too-close', (r) => ({ scale: r.face.band[1] + 0.02 }), undefined],
  [9, 'phone-flat', () => ({ tiltDeg: 45 }), undefined],
  [9, 'phone-leaning', () => ({ tiltDeg: 112 }), undefined],
  [10, 'face-high', () => ({ centring: [0, -0.2] }), undefined],
  [10, 'face-low', () => ({ centring: [0, 0.2] }), undefined],
  [11, 'off-centre', () => ({ centring: [0.18, 0] }), undefined],
  [12, 'phone-rotated', () => ({ phoneRollDeg: 15 }), undefined],
  [13, 'turned', (r) => ({ yawDeg: r.pose.yaw + 20 }), undefined],
  [14, 'chin-up', (r) => ({ pitchDeg: r.pose.pitch - 14 }), undefined],
  [14, 'chin-down', (r) => ({ pitchDeg: r.pose.pitch + 16 }), undefined],
  [15, 'head-tilted', () => ({ rollDeg: 14 }), undefined],
  [16, 'face-dark', () => ({ lumaMean: 45 }), undefined],
  [17, 'backlit', () => ({ backlight: 0.6 }), undefined],
  [18, 'too-bright', () => ({ lumaMean: 220 }), undefined],
  [19, 'glare', () => ({ glare: 0.05 }), undefined],
  [20, 'eyes-hidden', () => ({ eyesClosedMs: 1600, eyesLidsClosed: false }), undefined],
  [20, 'eyes-closed', () => ({ eyesClosedMs: 1600, eyesLidsClosed: true }), undefined],
  [21, 'moving', () => ({ headDegS: 45 }), undefined],
];

test('every rank of design §3.4 fires on its own, with its rank and status group', () => {
  const ranks = new Set<number>();
  for (const [rank, id, make, opts] of RANKED) {
    const s = clearSignals(PHONE, make(PHONE));
    const on = active(s, PHONE, new Set(), opts?.ctx ?? READY);
    assert.ok(on.has(id), `${id} should be active`);
    assert.equal(CONDITIONS[id].rank, rank, id);
    assert.equal(topCondition(on), id, `${id} is the single instruction`);
    ranks.add(rank);
  }
  assert.deepEqual([...ranks].sort((a, b) => a - b), Array.from({ length: 22 }, (_, i) => i));
  // The phone's own steadiness reading also counts as moving.
  assert.ok(active(clearSignals(PHONE, { rotationDegS: 25 })).has('moving'));
  // In hand allows the phone more movement.
  const inHand = classRanges('phone-portrait', { setup: 'in-hand' });
  assert.ok(!active(clearSignals(inHand, { rotationDegS: 25 }), inHand).has('moving'));
  // The camera not started yet is the same blocker as no frames.
  assert.ok(active(clearSignals(PHONE), PHONE, new Set(), { loading: false, cameraStarted: false }).has('no-camera'));
  // The iris floor alone also asks to come closer.
  assert.ok(active(clearSignals(PHONE, { irisPx: 12 })).has('too-far'));
});

test('the webcam has no phone sensors: tilt and roll readings are ignored', () => {
  const s = clearSignals(WEBCAM, { tiltDeg: 30, phoneRollDeg: 40, rotationDegS: 90 });
  assert.deepEqual([...active(s, WEBCAM)], []);
});

test('the single instruction follows the priority order; distance comes before centring', () => {
  const s = clearSignals(PHONE, { scale: 0.2, centring: [0.2, 0.2], lumaMean: 40, headDegS: 50 });
  const on = active(s);
  assert.ok(on.has('too-far') && on.has('off-centre') && on.has('face-low') && on.has('face-dark') && on.has('moving'));
  assert.equal(topCondition(on), 'too-far');
  on.delete('too-far');
  assert.equal(topCondition(on), 'face-low');
  assert.equal(topCondition(new Set()), null);
  for (let i = 1; i < PRIORITY.length; i++) assert.ok(CONDITIONS[PRIORITY[i - 1]!].rank <= CONDITIONS[PRIORITY[i]!].rank);
  // Without a face only the face itself (and the blockers) can be judged.
  const none = active(clearSignals(PHONE, { face: false, faceNow: false, scale: 0.1, lumaMean: 10 }));
  assert.deepEqual([...none], ['no-face']);
});

test('hysteresis: a condition leaves at a safer value than it enters', () => {
  const lo = PHONE.face.band[0];
  const just = clearSignals(PHONE, { scale: lo + 0.005 });
  assert.ok(!active(just).has('too-far'), 'not entered above the band');
  assert.ok(active(just, PHONE, new Set(['too-far'])).has('too-far'), 'not left until 10 % inside');
  assert.ok(!active(clearSignals(PHONE, { scale: lo * 1.12 }), PHONE, new Set(['too-far'])).has('too-far'));

  const tol = PHONE.centre.x;
  assert.ok(!active(clearSignals(PHONE, { centring: [tol * 0.9, 0] })).has('off-centre'));
  assert.ok(active(clearSignals(PHONE, { centring: [tol * 0.9, 0] }), PHONE, new Set(['off-centre'])).has('off-centre'));
  assert.ok(!active(clearSignals(PHONE, { centring: [tol * 0.6, 0] }), PHONE, new Set(['off-centre'])).has('off-centre'));

  assert.ok(!active(clearSignals(PHONE, { lumaMean: 65 })).has('face-dark'));
  assert.ok(active(clearSignals(PHONE, { lumaMean: 65 }), PHONE, new Set(['face-dark'])).has('face-dark'));
  assert.ok(!active(clearSignals(PHONE, { lumaMean: 72 }), PHONE, new Set(['face-dark'])).has('face-dark'));

  assert.ok(!active(clearSignals(PHONE, { yawDeg: 10 })).has('turned'));
  assert.ok(active(clearSignals(PHONE, { yawDeg: 10 }), PHONE, new Set(['turned'])).has('turned'));
  assert.ok(!active(clearSignals(PHONE, { yawDeg: 7 }), PHONE, new Set(['turned'])).has('turned'));

  assert.ok(!active(clearSignals(PHONE, { tiltDeg: 57 })).has('phone-flat'));
  assert.ok(active(clearSignals(PHONE, { tiltDeg: 57 }), PHONE, new Set(['phone-flat'])).has('phone-flat'));
});

test('the status row groups the conditions into Distance, Position and Light', () => {
  const s = clearSignals(PHONE, { scale: 0.2, glare: 0.05 });
  const row = statusRow(active(s), s);
  assert.deepEqual(row, { distance: 'adjust', position: 'good', light: 'adjust' });
  const t = clearSignals(PHONE, { centring: [0.2, 0] });
  assert.deepEqual(statusRow(active(t), t), { distance: 'good', position: 'adjust', light: 'good' });
  // Without a face nothing shows as good except a light already measured.
  const n = clearSignals(PHONE, { face: false, faceNow: false, lumaMean: Number.NaN });
  assert.deepEqual(statusRow(active(n), n), { distance: 'adjust', position: 'adjust', light: 'adjust' });
  for (const id of PRIORITY) {
    const g = CONDITIONS[id].group;
    if (CONDITIONS[id].rank <= 2) assert.equal(g, null, id);
    else if (id === 'too-far' || id === 'too-close') assert.equal(g, 'distance');
    else if (['too-dark', 'face-dark', 'backlit', 'too-bright', 'glare'].includes(id)) assert.equal(g, 'light', id);
    else assert.equal(g, 'position', id);
  }
});

test('every condition has copy in strings/guard.ts for phones and webcams, with the directional cues', () => {
  for (const r of [PHONE, WEBCAM]) {
    for (const id of PRIORITY) {
      const c = cueCopy(id, r, r.phone ? 'propped' : 'webcam');
      assert.ok(STRINGS[c.headline], `${c.headline}`);
      if (c.tip) assert.ok(STRINGS[c.tip], `${c.tip}`);
    }
  }
  assert.equal(STRINGS[cueCopy('no-face', PHONE, 'propped').headline], 'Point the camera at your face');
  assert.equal(STRINGS[cueCopy('no-face', WEBCAM, 'webcam').headline], 'Sit facing the camera');
  assert.equal(STRINGS[cueCopy('face-high', PHONE, 'propped').headline], 'Raise the phone to eye level');
  assert.equal(STRINGS[cueCopy('face-high', WEBCAM, 'webcam').headline], 'Tilt the screen back a little');
  assert.equal(STRINGS[cueCopy('face-high', PHONE, 'in-hand').tip!], 'Hold the phone at eye level');
  assert.equal(STRINGS[cueCopy('moving', PHONE, 'propped').headline], 'Hold the phone steady');
  assert.equal(STRINGS[cueCopy('moving', WEBCAM, 'webcam').headline], 'Hold still for a moment');
  assert.deepEqual(cueCopy('too-far', PHONE, 'propped').cue, { kind: 'chevrons', direction: 'out' });
  assert.deepEqual(cueCopy('too-close', PHONE, 'propped').cue, { kind: 'chevrons', direction: 'in' });
  assert.deepEqual(cueCopy('off-centre', PHONE, 'propped').cue, { kind: 'chevron' });
  assert.deepEqual(cueCopy('phone-flat', PHONE, 'propped').cue, { kind: 'phone', icon: 'upright' });
  assert.equal(cueCopy('turned', PHONE, 'propped').cue, null);
  assert.equal(STRINGS['guard.cue.loading']!.replace('{pct}', '62'), 'Getting ready… 62 %');
});
