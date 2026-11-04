// The guard's state machines (design §3.2–§3.8): the ready check's timing, hold, Ready and home,
// "Start anyway"; the grades, auto-pause and resume after Get ready; and the controller.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPositionGuard, GradeGuard, ReadyGuard, type GuardSource } from '../../src/core/position/guard.ts';
import type { Home } from '../../src/core/position/home.ts';
import type { Signals } from '../../src/core/position/signals.ts';
import { classRanges, TIMING } from '../../src/core/position/thresholds.ts';
import type { FrameResult } from '../../src/core/types.ts';
import { clearSignals, FIXTURE, fixtureFace } from './position-helpers.ts';

const PHONE = classRanges('phone-portrait', { setup: 'propped' });
const CTX = { loading: false, cameraStarted: true };

/** Runs the ready guard every `step` ms from `from` to `to` with signals from `at(t)`. */
function run(g: ReadyGuard, from: number, to: number, at: (t: number) => Partial<Signals>, step = 50, ctx = CTX) {
  let view = g.update(clearSignals(PHONE, { tMs: from, ...at(from) }), from, ctx);
  for (let t = from + step; t <= to; t += step) view = g.update(clearSignals(PHONE, { tMs: t, ...at(t) }), t, ctx);
  return view;
}

test('a new cue persists 300 ms before it shows; a shown cue stays at least 1 s; blockers show at once', () => {
  const g = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  let v = run(g, 0, 1500, () => ({ scale: 0.2 }));
  assert.equal(v.condition, 'too-far');
  assert.equal(v.state, 'adjust');
  // Off-centre takes over from too-far only after 300 ms (and too-far has shown over 1 s).
  v = g.update(clearSignals(PHONE, { centring: [0.2, 0] }), 1550, CTX);
  assert.equal(v.condition, 'too-far');
  v = run(g, 1600, 1850, () => ({ centring: [0.2, 0] }));
  assert.equal(v.condition, 'off-centre');
  // Within 1 s another non-blocker cannot replace it…
  v = run(g, 1900, 2400, () => ({ lumaMean: 40 }));
  assert.equal(v.condition, 'off-centre');
  // …but a blocker can, at once.
  v = g.update(clearSignals(PHONE, { delivering: false }), 2450, CTX);
  assert.equal(v.condition, 'no-camera');
  assert.equal(v.state, 'searching');
});

test('the tip appears after 4 s; loading shows the percentage', () => {
  const g = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  let v = run(g, 0, 3000, () => ({ scale: 0.2 }));
  assert.equal(v.tip, null);
  v = run(g, 3050, 4500, () => ({ scale: 0.2 }));
  assert.deepEqual(v.tip, { key: 'guard.tip.tooFar' });
  const l = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  const lv = l.update(clearSignals(PHONE), 0, { loading: true, cameraStarted: false, loadingPct: 62.4 });
  assert.equal(lv.state, 'loading');
  assert.deepEqual(lv.headline, { key: 'guard.cue.loading', vars: { pct: 62 } });
});

test('all clear holds for SETUP.holdMs, then Ready latches with home; a break restarts the ring', () => {
  const g = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  let v = run(g, 0, 1000, () => ({}));
  assert.equal(v.state, 'holding');
  assert.deepEqual(v.headline, { key: 'guard.cue.holding' });
  assert.ok(v.holdFraction > 0.45 && v.holdFraction < 0.55);
  // A break restarts the hold.
  v = run(g, 1050, 1200, () => ({ scale: 0.2 }));
  assert.equal(v.holdFraction, 0);
  v = run(g, 1250, 1250 + TIMING.holdMs - 100, () => ({}));
  assert.equal(v.ready, false);
  let latched = false;
  for (let t = 1250 + TIMING.holdMs - 50; t <= 1250 + TIMING.holdMs + 500; t += 50) {
    v = g.update(clearSignals(PHONE, { scale: 0.34 }), t, CTX);
    latched ||= g.justLatched;
  }
  assert.equal(latched, true);
  assert.equal(v.ready, true);
  assert.equal(v.state, 'ready');
  assert.deepEqual(v.headline, { key: 'guard.cue.ready' });
  assert.deepEqual(v.tip, { key: 'guard.tip.ready' });
  assert.equal(v.holdFraction, 1);
  assert.ok(g.home && Math.abs(g.home.scale - 0.335) < 0.01);
  // Ready stays latched through a later problem; the cue shows the problem meanwhile.
  v = run(g, 5000, 6500, () => ({ centring: [0.2, 0] }));
  assert.equal(v.ready, true);
  assert.equal(v.condition, 'off-centre');
});

test('speed divides the hold, the tip and "Start anyway" in test mode', () => {
  const g = new ReadyGuard({ ranges: PHONE, setup: 'propped', speed: 4 });
  const v = run(g, 0, TIMING.holdMs / 4 + 100, () => ({}));
  assert.equal(v.ready, true);
});

test('"Start anyway" after 20 s with a face and no Ready, never without a face', () => {
  const g = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  let v = run(g, 0, 19_900, () => ({ scale: 0.2 }), 100);
  assert.equal(v.anyway, false);
  v = run(g, 20_000, 20_200, () => ({ scale: 0.2 }), 100);
  assert.equal(v.anyway, true);
  v = run(g, 20_300, 21_000, () => ({ face: false, faceNow: false }), 100);
  assert.equal(v.anyway, false);
  const blind = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  assert.equal(run(blind, 0, 30_000, () => ({ face: false, faceNow: false }), 500).anyway, false);
});

test('the slow-device chip below 15 Hz, and the hand-held tip once when Propped', () => {
  const g = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  assert.equal(run(g, 0, 400, () => ({ fps: 9, scale: 0.2 })).slow, true);
  const h = new ReadyGuard({ ranges: PHONE, setup: 'propped' });
  let v = run(h, 0, 500, () => ({ handHeld: true, scale: 0.2 }));
  assert.deepEqual(v.tip, { key: 'guard.tip.prop' });
  v = run(h, 550, 9000, () => ({ handHeld: true, scale: 0.2 }), 100);
  assert.notDeepEqual(v.tip, { key: 'guard.tip.prop' }, 'shown once, for a while');
  const inHand = new ReadyGuard({ ranges: classRanges('phone-portrait', { setup: 'in-hand' }), setup: 'in-hand' });
  assert.equal(run(inHand, 0, 500, () => ({ handHeld: true, scale: 0.2 })).tip, null);
});

const HOME: Home = { centring: [0, 0], scale: 0.33, yawDeg: 0, pitchDeg: 12, rollDeg: 0, tiltDeg: 80, phoneRollDeg: 0, irisPx: 24, geometry: null };

function grades(context: 'warmup' | 'look', from: number, to: number, g: GradeGuard, at: (t: number) => Partial<Signals>, step = 50) {
  const events: string[] = [];
  let last = g.update(clearSignals(PHONE, { tMs: from, ...at(from) }), from);
  for (const e of last.events) events.push(`${from}:${e.kind}`);
  for (let t = from + step; t <= to; t += step) {
    last = g.update(clearSignals(PHONE, { tMs: t, ...at(t) }), t);
    for (const e of last.events) events.push(`${t}:${e.kind}`);
  }
  void context;
  return { view: last.view, events };
}

test('out of range pauses after 0.5 s in the warm-up, 1 s in Free look; resume after 1 s and "Back in place"', () => {
  const warm = new GradeGuard({ home: HOME, context: 'warmup' });
  let r = grades('warmup', 0, 450, warm, () => ({ centring: [0.15, 0] }));
  assert.equal(r.view.phase, 'running');
  assert.equal(r.view.glyph, 'drifting');
  r = grades('warmup', 500, 600, warm, () => ({ centring: [0.15, 0] }));
  assert.equal(r.view.phase, 'paused');
  assert.equal(r.view.reason, 'out');
  assert.deepEqual(r.view.headline, { key: 'guard.pause.intoView' });
  assert.equal(r.events.length, 1);
  // Back in range: 1 s, then 400 ms of "Back in place", then one resume.
  r = grades('warmup', 650, 1600, warm, () => ({}));
  assert.equal(r.view.phase, 'paused');
  r = grades('warmup', 1650, 1900, warm, () => ({}));
  assert.equal(r.view.phase, 'resuming');
  assert.deepEqual(r.view.headline, { key: 'guard.pause.backInPlace' });
  r = grades('warmup', 1950, 2200, warm, () => ({}));
  assert.equal(r.view.phase, 'running');
  assert.equal(r.events.filter((e) => e.endsWith('resume')).length, 1);
  assert.equal(warm.pauses, 1);

  const look = new GradeGuard({ home: HOME, context: 'look' });
  r = grades('look', 0, 900, look, () => ({ centring: [0.15, 0] }));
  assert.equal(r.view.phase, 'running');
  assert.deepEqual(r.view.nudge, { key: 'guard.nudge.centre' });
  r = grades('look', 950, 1100, look, () => ({ centring: [0.15, 0] }));
  assert.equal(r.view.phase, 'paused');
});

test('face lost pauses after 0.4 s in the warm-up and 0.7 s in Free look; the headline asks to look back', () => {
  for (const [context, ms] of [['warmup', 400], ['look', 700]] as const) {
    const g = new GradeGuard({ home: HOME, context });
    const lost = (t: number): Partial<Signals> => ({ face: false, faceNow: false, faceLostMs: t });
    let r = grades(context, 0, ms - 50, g, lost);
    assert.equal(r.view.phase, 'running', context);
    assert.equal(r.view.glyph, 'lost');
    r = grades(context, ms, ms + 100, g, lost);
    assert.equal(r.view.phase, 'paused', context);
    assert.equal(r.view.reason, 'face-lost');
    assert.deepEqual(r.view.headline, { key: 'guard.pause.lookBack' });
  }
});

test('the overlay adds its second action after 10 s; nudges never appear in the warm-up', () => {
  const g = new GradeGuard({ home: HOME, context: 'warmup' });
  let r = grades('warmup', 0, 9000, g, () => ({ scale: 0.2 }), 100);
  assert.equal(r.view.phase, 'paused');
  assert.equal(r.view.extra, false);
  assert.deepEqual(r.view.headline, { key: 'guard.pause.closer' });
  r = grades('warmup', 9100, 11_000, g, () => ({ scale: 0.2 }), 100);
  assert.equal(r.view.extra, true);
  const d = new GradeGuard({ home: HOME, context: 'warmup' });
  assert.equal(grades('warmup', 0, 300, d, () => ({ centring: [0.08, 0] })).view.nudge, null);
});

test('the controller reads results, ticks between them, reports pause and resume once, and can be forced', async () => {
  let listener: ((r: FrameResult) => void) | null = null;
  const source: GuardSource = {
    onResult(cb) {
      listener = cb;
      return () => (listener = null);
    },
  };
  let clock = 0;
  const guard = createPositionGuard(source, 'warmup', { home: HOME, now: () => clock, tickMs: 5 });
  const face = fixtureFace();
  const emit = (f: typeof face | null) =>
    listener?.({ meta: { index: 0, tCaptureMs: clock, clock: 'captureTime', presentedFrames: 0, cameraGap: 0, videoW: FIXTURE.videoW, videoH: FIXTURE.videoH }, face: f, engines: {}, workerMs: 1, receivedMs: clock });
  const pauses: string[] = [];
  let resumes = 0;
  guard.onPause((reason) => pauses.push(reason));
  guard.onResume(() => (resumes += 1));
  for (clock = 0; clock < 1000; clock += 50) emit(null);
  assert.deepEqual(pauses, ['face-lost']);
  assert.equal(guard.state().view.phase, 'paused');
  guard.force({ phase: 'running', glyph: 'good' });
  assert.equal(guard.state().forced, true);
  assert.equal(guard.state().view.glyph, 'good');
  guard.force(null);
  guard.setContext('look');
  assert.equal(guard.state().context, 'look');
  await new Promise((resolve) => setTimeout(resolve, 20));
  guard.dispose();
  assert.equal(listener, null);
  assert.equal(resumes, 0);
});
