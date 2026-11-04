// The position guard's signals (design §3.1): face scale, the face's geometry and the smoothing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { faceGeometry, faceScale, FACE_WIDTH_PER_IO, OVAL_RAISE, SignalTracker, TimeWindow } from '../../src/core/position/signals.ts';
import { FIXTURE, fixtureFace } from './position-helpers.ts';

const W = FIXTURE.videoW;
const H = FIXTURE.videoH;

test('face scale: the outer-corner distance as a face width over the long side, close to the landmark box', () => {
  const face = fixtureFace();
  const scale = faceScale(face, W, H);
  assert.ok(Math.abs(scale - (FACE_WIDTH_PER_IO * face.eyes.interOcularPx) / Math.cos((face.pose.yawDeg * Math.PI) / 180) / W) < 1e-9);
  // The landmark box is 27.5 % of the long side in this frame; the estimate agrees within 10 %.
  assert.ok(Math.abs(scale / FIXTURE.computed.quality.faceWidthFrac - 1) < 0.1, `scale ${scale}`);
  // The same face in a portrait frame of the same long side has the same scale.
  assert.ok(Math.abs(faceScale(face, H, W) - scale) < 1e-12);
});

test('face scale divides by cos(yaw) and falls back to the iris, and mixes it in when they disagree', () => {
  const turned = fixtureFace({ pose: { ...fixtureFace().pose, yawDeg: 40 } });
  const frontal = fixtureFace({ pose: { ...fixtureFace().pose, yawDeg: 0 } });
  assert.ok(faceScale(turned, W, H) > faceScale(frontal, W, H));
  const noIo = fixtureFace({ eyes: { ...fixtureFace().eyes, interOcularPx: Number.NaN } });
  assert.ok(Math.abs(faceScale(noIo, W, H) - (11 * (FIXTURE.computed.eyes.irisDiamPx as number)) / W) < 1e-9);
  const badIris = fixtureFace({ eyes: { ...fixtureFace().eyes, irisDiamPx: 60 } });
  const io = faceScale(fixtureFace({ eyes: { ...fixtureFace().eyes, irisDiamPx: Number.NaN } }), W, H);
  assert.ok(faceScale(badIris, W, H) > io);
  assert.ok(Number.isNaN(faceScale(fixtureFace({ eyes: { ...fixtureFace().eyes, irisDiamPx: Number.NaN, interOcularPx: Number.NaN } }), W, H)));
});

test('the outline is an ellipse around the face oval, with the iris centres inside it', () => {
  const g = faceGeometry(fixtureFace(), W, H)!;
  assert.ok(g);
  const o = g.outline;
  const box = g.box;
  assert.ok(o.cx > box.minX * W && o.cx < box.maxX * W);
  assert.ok(o.cy > box.minY * H && o.cy < box.maxY * H);
  assert.ok(o.rx > 0.35 * (box.maxX - box.minX) * W && o.rx < 0.6 * (box.maxX - box.minX) * W);
  assert.ok(o.ry > o.rx, 'a face is taller than wide');
  assert.ok(Math.abs(o.angleDeg) < 10);
  for (const [x, y] of g.eyes) {
    const dx = (x - o.cx) / o.rx;
    const dy = (y - o.cy) / o.ry;
    assert.ok(dx * dx + dy * dy < 1);
  }
  // The subject's right eye is on the image left.
  assert.ok(g.eyes[0][0] < g.eyes[1][0]);
});

test('time windows give the median and the mean of their span', () => {
  const w = new TimeWindow(500);
  for (const [t, v] of [[0, 9], [100, 1], [200, 2], [300, 3], [700, 4]] as const) w.push(t, v);
  // Only 200–700 ms is inside the span at 700 ms: 2, 3 and 4.
  assert.equal(w.median(700), 3);
  assert.equal(w.mean(700), 3);
  assert.ok(Number.isNaN(new TimeWindow(10).median(0)));
});

test('the tracker smooths, debounces the face by 300 ms and times closed eyes', () => {
  const tr = new SignalTracker();
  const face = fixtureFace();
  for (let t = 0; t <= 1000; t += 33) tr.pushResult({ tMs: t, face, videoW: W, videoH: H });
  let s = tr.snapshot(1000);
  assert.equal(s.face, true);
  assert.equal(s.delivering, true);
  assert.ok(Math.abs(s.scale - faceScale(face, W, H)) < 1e-9);
  assert.ok(Math.abs(s.centring[1] - (FIXTURE.computed.quality.centring[1]! + OVAL_RAISE)) < 0.02);
  assert.ok(s.fps > 29 && s.fps < 31);
  assert.ok(s.headDegS < 1e-9, 'a still head');
  assert.ok(Math.abs(s.frameLuma - FIXTURE.computed.quality.lumaMean / FIXTURE.computed.quality.backlight) < 1e-6);

  // The face goes: still present for 300 ms, then gone.
  tr.pushResult({ tMs: 1033, face: null, videoW: W, videoH: H });
  s = tr.snapshot(1100);
  assert.equal(s.face, true);
  assert.equal(s.faceNow, false);
  s = tr.snapshot(1400);
  assert.equal(s.face, false);
  assert.ok(s.faceLostMs >= 367);
  assert.equal(s.geometry, null);

  // Closed eyes count from the first closed frame.
  const shut = fixtureFace({ eyes: { ...face.eyes, open: false, blinkL: 0.9, blinkR: 0.9 } });
  for (let t = 2000; t <= 3700; t += 50) tr.pushResult({ tMs: t, face: shut, videoW: W, videoH: H });
  s = tr.snapshot(3700);
  assert.ok(s.eyesClosedMs >= 1700);
  assert.equal(s.eyesLidsClosed, true);

  // Nothing for 2 s: the camera is not delivering.
  assert.equal(tr.snapshot(6000).delivering, false);
});

test('head speed over 300 ms, margins to the visible region, and motion readings', () => {
  const tr = new SignalTracker();
  const base = fixtureFace();
  for (let t = 0; t <= 300; t += 30) {
    tr.pushResult({ tMs: t, face: { ...base, pose: { ...base.pose, yawDeg: (t / 1000) * 60 } }, videoW: W, videoH: H });
  }
  const s = tr.snapshot(300);
  assert.ok(Math.abs(s.headDegS - 60) < 1);
  const full = s.margins!;
  tr.setVisibleRegion({ x0: 0.25, y0: 0, x1: 0.75, y1: 1 });
  for (let t = 330; t <= 900; t += 30) tr.pushResult({ tMs: t, face: base, videoW: W, videoH: H });
  const cropped = tr.snapshot(900).margins!;
  assert.ok(cropped.x < full.x, 'cropping the preview narrows the margins');
  tr.pushMotion({ tMs: 890, tiltDeg: 70, rollDeg: 3, rotationDegS: 4, handHeld: true, source: 'motion' });
  const m = tr.snapshot(900);
  assert.equal(m.tiltDeg, 70);
  assert.equal(m.handHeld, true);
  assert.ok(Number.isNaN(tr.snapshot(2000).tiltDeg), 'an old reading is not used');
});
