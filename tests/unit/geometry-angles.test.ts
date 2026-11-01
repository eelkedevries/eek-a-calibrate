// WP3: degree conversion against eek-a-gaze's reference, and the exact angular separation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  angularSeparationDeg,
  degToPx,
  degToPxAxis,
  pxPerDegAtCentre,
  pxToDeg,
  pxToDegAxis,
  toExportDeg,
  type PlaneGeometry,
} from '../../src/core/geometry/angles.ts';
import { mulberry32 } from '../../src/core/maths/rng.ts';
import type { Vec2 } from '../../src/core/types.ts';

const REFERENCE = new URL('../fixtures/eek-a-gaze/geometry_reference.csv', import.meta.url);
const SCREEN: PlaneGeometry = { viewportWpx: 1920, viewportHpx: 1080, pxPerMm: 1920 / 531 };
const D = 600;
const DEG = 180 / Math.PI;

test('reproduces every row of eek-a-gaze geometry_reference.csv to 1e-9 degrees', () => {
  const lines = readFileSync(REFERENCE, 'utf8').split('\n').filter((l) => l !== '' && !l.startsWith('#'));
  assert.equal(lines[0], 'px,screen_px,screen_mm,distance_mm,origin,flip_y,expected_deg');
  const rows = lines.slice(1);
  assert.equal(rows.length, 14);
  for (const row of rows) {
    const [pxS, screenPxS, screenMmS, distanceS, origin, flip, expectedS] = row.split(',') as string[];
    const screenPx = Number(screenPxS);
    const pxPerMm = screenPx / Number(screenMmS);
    const distance = Number(distanceS);
    const expected = Number(expectedS);
    // eek-a-gaze's 'centre' origin is our top-left origin shifted by half the extent.
    const px = Number(pxS) + (origin === 'centre' ? screenPx / 2 : 0);
    const asX = pxToDeg([px, 0], { viewportWpx: screenPx, viewportHpx: 2, pxPerMm }, distance)[0];
    const asY = toExportDeg(pxToDeg([0, px], { viewportWpx: 2, viewportHpx: screenPx, pxPerMm }, distance));
    if (flip === 'true') {
      assert.ok(Math.abs(asY[1] - expected) <= 1e-9, `${row}: ${asY[1]}`);
    } else {
      assert.ok(Math.abs(asX - expected) <= 1e-9, `${row}: ${asX}`);
      assert.ok(Math.abs(-asY[1] - expected) <= 1e-9, `${row} (y axis, y down): ${-asY[1]}`);
    }
  }
});

test('toExportDeg keeps x and makes y positive upwards', () => {
  const above = pxToDeg([960, 100], SCREEN, D);
  assert.ok(above[1] < 0, 'internally y grows downwards');
  const out = toExportDeg(above);
  assert.equal(out[0], above[0]);
  assert.equal(out[1], -above[1]);
  assert.ok(out[1] > 0);
  assert.deepEqual(toExportDeg([3, -2]), [3, 2]);
});

test('px → degrees → px round-trips for any distance and scale (distance-scale cancellation)', () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const p: Vec2 = [rand() * 1920, rand() * 1080];
    const d = 300 + rand() * 900;
    const scale = { ...SCREEN, pxPerMm: 2 + rand() * 6 };
    const back = degToPx(pxToDeg(p, scale, d), scale, d);
    assert.ok(Math.abs(back[0] - p[0]) < 1e-9 && Math.abs(back[1] - p[1]) < 1e-9, `${p} → ${back}`);
  }
  // Degrees depend on D·pxPerMm only: a wrong scale with the matching wrong distance changes nothing.
  const p: Vec2 = [1500, 200];
  const a = pxToDeg(p, SCREEN, D);
  const b = pxToDeg(p, { ...SCREEN, pxPerMm: SCREEN.pxPerMm * 1.3 }, D / 1.3);
  assert.ok(Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12);
});

test('degToPx is NaN where the direction misses the screen plane', () => {
  assert.ok(Number.isNaN(degToPxAxis(90, 1920, 3, 600)));
  assert.ok(Number.isNaN(degToPxAxis(-95, 1920, 3, 600)));
  assert.ok(Number.isNaN(degToPxAxis(Number.NaN, 1920, 3, 600)));
  assert.equal(degToPxAxis(0, 1920, 3, 600), 960);
  assert.equal(pxToDegAxis(960, 1920, 3, 600), 0);
});

test('exact angle: zero at identity, symmetric, and equal to the 3-D angle between eye rays', () => {
  const rand = mulberry32(11);
  const ray = (p: Vec2): [number, number, number] => [(p[0] - 960) / SCREEN.pxPerMm, (p[1] - 540) / SCREEN.pxPerMm, D];
  for (let i = 0; i < 500; i++) {
    const pa: Vec2 = [rand() * 1920, rand() * 1080];
    const pb: Vec2 = [rand() * 1920, rand() * 1080];
    const a = pxToDeg(pa, SCREEN, D);
    const b = pxToDeg(pb, SCREEN, D);
    assert.equal(angularSeparationDeg(a, a), 0);
    assert.equal(angularSeparationDeg(a, b), angularSeparationDeg(b, a));
    const ra = ray(pa);
    const rb = ray(pb);
    const cos = (ra[0] * rb[0] + ra[1] * rb[1] + ra[2] * rb[2]) / (Math.hypot(...ra) * Math.hypot(...rb));
    const truth = Math.acos(Math.min(1, cos)) * DEG;
    assert.ok(Math.abs(angularSeparationDeg(a, b) - truth) < 1e-6, `${pa} ${pb}`);
  }
  assert.ok(Number.isNaN(angularSeparationDeg([Number.NaN, 0], [0, 0])));
  // Along one axis through the centre the separation is the plain difference of angles.
  assert.ok(Math.abs(angularSeparationDeg([-10, 0], [15, 0]) - 25) < 1e-12);
});

test('agrees with pixels per degree near the centre and is about 20 % lower near the corners', () => {
  const ppd = pxPerDegAtCentre(SCREEN.pxPerMm, D);
  const step = 20;
  const centre = angularSeparationDeg(pxToDeg([960, 540], SCREEN, D), pxToDeg([960 + step, 540], SCREEN, D));
  assert.ok(Math.abs(centre / (step / ppd) - 1) < 1e-3, `centre ratio ${centre / (step / ppd)}`);
  // A radial displacement at the top-left corner.
  const u = [960, 540].map((c) => c / Math.hypot(960, 540)) as [number, number];
  const corner = angularSeparationDeg(pxToDeg([0, 0], SCREEN, D), pxToDeg([step * u[0], step * u[1]], SCREEN, D));
  const ratio = corner / (step / ppd);
  assert.ok(ratio > 0.75 && ratio < 0.85, `corner ratio ${ratio}`);
});
