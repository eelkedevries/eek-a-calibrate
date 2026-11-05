// The challenge's board (spec §17.9.1, design §5.3): the margin, the zones and their gutters, the
// snap to the nearest zone and the bubble's size, checked against the boards' own numbers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { boardRect, bubbleDiameterPx, innerRect, makeBoard, zoneAtPoint, zoneCentre } from '../../src/core/game/board.ts';

const near = (a: number, b: number, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('the phone board: 4 % in from the padded safe area, three zones 16 px apart (phone-free-look)', () => {
  // 390 × 844 with 24 px top and bottom and 16 px sides: the board's zones are x 30–360, y 56–788.
  const board = makeBoard({ x: 16, y: 24, w: 358, h: 796 }, 1, 3);
  near(board.rect.x, 30);
  near(board.rect.x + board.rect.w, 360);
  near(board.rect.y, 56);
  near(board.rect.y + board.rect.h, 788);
  assert.equal(board.zones.length, 3);
  near(board.zones[0]!.rect.h, 233);
  near(board.zones[1]!.rect.y, 56 + 233 + 16);
  near(board.zones[2]!.rect.y + board.zones[2]!.rect.h, 788);
});

test('the desktop and landscape boards match their drawings', () => {
  const desk = makeBoard({ x: 24, y: 24, w: 1392, h: 852 }, 3, 1);
  near(desk.zones[0]!.rect.x, 80);
  near(desk.zones[0]!.rect.w, 416, 1);
  near(desk.zones[2]!.rect.x, 944, 1);
  near(desk.zones[0]!.rect.y, 58);
  near(desk.zones[0]!.rect.h, 784, 1);
  const side = makeBoard({ x: 48, y: 24, w: 748, h: 342 }, 3, 1);
  near(side.zones[0]!.rect.x, 78);
  near(side.zones[0]!.rect.y, 38);
  near(side.zones[2]!.rect.x + side.zones[2]!.rect.w, 766);
});

test('the margin is a share of each axis, and an empty safe area is refused', () => {
  assert.deepEqual(boardRect({ x: 0, y: 0, w: 100, h: 50 }), { x: 4, y: 2, w: 92, h: 46 });
  assert.throws(() => boardRect({ x: 0, y: 0, w: 0, h: 10 }), RangeError);
  assert.throws(() => makeBoard({ x: 0, y: 0, w: 100, h: 100 }, 0, 2), RangeError);
});

test('a point snaps to the nearest zone: gutters split down the middle, the edges extend outwards', () => {
  const board = makeBoard({ x: 0, y: 0, w: 1000, h: 500 }, 3, 2);
  const z = (x: number, y: number) => zoneAtPoint(board, [x, y]);
  assert.equal(z(500, 100)!.index, 1);
  assert.equal(z(-50, -50)!.index, 0);
  assert.equal(z(5000, 5000)!.index, 5);
  const a = board.zones[0]!.rect;
  const gutterMid = a.x + a.w + 8;
  assert.equal(z(gutterMid - 0.01, 100)!.col, 0);
  assert.equal(z(gutterMid + 0.01, 100)!.col, 1);
  assert.equal(z(Number.NaN, 1), null);
  for (const zone of board.zones) assert.equal(zoneAtPoint(board, zoneCentre(zone))!.index, zone.index);
});

test('the bubble: clamp(72 px, 40 % of the zone short side, 20 % of the screen short side)', () => {
  assert.equal(bubbleDiameterPx({ x: 0, y: 0, w: 330, h: 233 }, 390), 78);
  near(bubbleDiameterPx({ x: 0, y: 0, w: 416, h: 784 }, 900), 166.4, 0.01);
  // A small screen: the minimum wins, as in CSS clamp().
  assert.equal(bubbleDiameterPx({ x: 0, y: 0, w: 100, h: 100 }, 300), 72);
  assert.deepEqual(innerRect({ index: 0, col: 0, row: 0, rect: { x: 0, y: 0, w: 100, h: 60 } }, 40), { x: 40, y: 30, w: 20, h: 0 });
});
