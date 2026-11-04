// The Details sheet's pager (design §2.17): one page at a time, "2 of 5", never past either end.
import assert from 'node:assert/strict';
import test from 'node:test';
import { pageAfter, pagerView } from '../../src/app/shell/pager.ts';

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
