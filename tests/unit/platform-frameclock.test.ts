// WP4 (spec §10.1): frame-clock dedupe with injected presentedFrames
// sequences, the poll fallback's detection, and the capture-time choice.
import assert from 'node:assert/strict';
import test from 'node:test';
import { captureStamp, FrameDeduper } from '../../src/platform/frameClock.ts';

function run(seq: number[]): { isNew: boolean; cameraGap: number; reset: boolean }[] {
  const d = new FrameDeduper();
  return seq.map((n) => {
    const { isNew, cameraGap, reset } = d.rvfc(n);
    return { isNew, cameraGap, reset };
  });
}

test('a frame is new only when presentedFrames increases; cameraGap = Δ − 1', () => {
  assert.deepEqual(run([10, 11, 13, 13, 14, 18]), [
    { isNew: true, cameraGap: 0, reset: false },
    { isNew: true, cameraGap: 0, reset: false },
    { isNew: true, cameraGap: 1, reset: false },
    { isNew: false, cameraGap: 0, reset: false },
    { isNew: true, cameraGap: 0, reset: false },
    { isNew: true, cameraGap: 3, reset: false },
  ]);
});

test('repeated callbacks for one frame are dropped, and the first frame never has a gap', () => {
  const out = run([500, 500, 500, 501]);
  assert.deepEqual(out.map((o) => o.isNew), [true, false, false, true]);
  assert.deepEqual(out.map((o) => o.cameraGap), [0, 0, 0, 0]);
});

test('a counter that goes backwards (a new stream) counts as a new frame with no gap', () => {
  const out = run([40, 41, 3, 4, 4, 6]);
  assert.deepEqual(out.map((o) => o.isNew), [true, true, true, true, false, true]);
  assert.deepEqual(out.map((o) => o.reset), [false, false, true, false, false, false]);
  assert.deepEqual(out.map((o) => o.cameraGap), [0, 0, 0, 0, 0, 1]);
});

test('poll mode uses totalVideoFrames, or a change of currentTime when it is unavailable', () => {
  const d = new FrameDeduper();
  assert.deepEqual([d.poll(7, 0.1), d.poll(7, 0.13), d.poll(9, 0.16)].map((o) => [o.isNew, o.cameraGap, o.presentedFrames]), [
    [true, 0, 7],
    [false, 0, 7],
    [true, 1, 9],
  ]);
  const t = new FrameDeduper();
  const seq = [t.poll(null, 1.0), t.poll(null, 1.0), t.poll(null, 1.033), t.poll(null, 1.066)];
  assert.deepEqual(seq.map((o) => o.isNew), [true, false, true, true]);
  assert.deepEqual(seq.map((o) => o.cameraGap), [0, 0, 0, 0]);
  assert.deepEqual(seq.map((o) => o.presentedFrames), [1, 1, 2, 3]);
});

test('switching between rVFC and polling resets the baseline (the counters are unrelated)', () => {
  const d = new FrameDeduper();
  assert.equal(d.rvfc(300).isNew, true);
  const polled = d.poll(12, 5);
  assert.equal(polled.isNew, true);
  assert.equal(polled.cameraGap, 0);
  const back = d.rvfc(320);
  assert.equal(back.isNew, true);
  assert.equal(back.cameraGap, 0);
  assert.equal(d.rvfc(321).cameraGap, 0);
});

test('tCaptureMs prefers captureTime, then expectedDisplayTime, then the callback time', () => {
  assert.deepEqual(captureStamp({ captureTime: 1000.5, expectedDisplayTime: 1040 }, 1033), { tCaptureMs: 1000.5, clock: 'captureTime' });
  assert.deepEqual(captureStamp({ expectedDisplayTime: 1040 }, 1033), { tCaptureMs: 1040, clock: 'expectedDisplayTime' });
  assert.deepEqual(captureStamp({ captureTime: 0, expectedDisplayTime: 1040 }, 1033), { tCaptureMs: 1040, clock: 'expectedDisplayTime' });
  assert.deepEqual(captureStamp({ captureTime: Number.NaN }, 1033), { tCaptureMs: 1033, clock: 'callback' });
  assert.deepEqual(captureStamp({}, 1033), { tCaptureMs: 1033, clock: 'callback' });
});
