// The Details sheet's pager (design §2.17): one page at a time, "2 of 5", never past either end.
import assert from 'node:assert/strict';
import test from 'node:test';
import { pageAfter, pagerView, splitBlocks } from '../../src/app/shell/pager.ts';

test('steps stay inside the pages', () => {
  assert.equal(pageAfter(0, 1, 5), 1);
  assert.equal(pageAfter(4, 1, 5), 4);
  assert.equal(pageAfter(0, -1, 5), 0);
  assert.equal(pageAfter(9, 0, 5), 4);
  assert.equal(pageAfter(2, -1, 1), 0);
  assert.equal(pageAfter(3, 1, 0), 0);
});

test('the label and which buttons can move', () => {
  assert.deepEqual(pagerView(1, 5), { label: '2 of 5', canPrev: true, canNext: true });
  assert.deepEqual(pagerView(0, 5), { label: '1 of 5', canPrev: false, canNext: true });
  assert.deepEqual(pagerView(4, 5), { label: '5 of 5', canPrev: true, canNext: false });
  assert.deepEqual(pagerView(0, 1), { label: '1 of 1', canPrev: false, canNext: false });
  assert.deepEqual(pagerView(0, 0), { label: '1 of 1', canPrev: false, canNext: false });
});

test('a page taller than the panel is cut between blocks, its title opening every piece', () => {
  // Title 20, blocks 40 each, gap 10: 20 + 3 × (10 + 40) = 170 fits 170, a fourth does not.
  const heights = [20, 40, 40, 40, 40, 40];
  const heads = [true, false, false, false, false, false];
  assert.deepEqual(splitBlocks(heights, heads, 10, 170), [[1, 2, 3], [4, 5]]);
  // Everything fits: one piece.
  assert.deepEqual(splitBlocks(heights, heads, 10, 1000), [[1, 2, 3, 4, 5]]);
  // Without a title the first block starts at the top.
  assert.deepEqual(splitBlocks([50, 50, 50], [false, false, false], 10, 110), [[0, 1], [2]]);
  // A block taller than a piece gets a piece of its own (it overflows; the sheet reports it).
  assert.deepEqual(splitBlocks([20, 300, 40], [true, false, false], 10, 100), [[1], [2]]);
  // Half a pixel of rounding is tolerated.
  assert.deepEqual(splitBlocks([20, 40, 40], [true, false, false], 10, 159.6), [[1, 2]]);
  // A page of only a title is one empty piece.
  assert.deepEqual(splitBlocks([20], [true], 10, 100), [[]]);
});
