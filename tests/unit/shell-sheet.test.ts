// The Details sheet's geometry (design §2.17, §4.7) and its tab keys.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DETAILS_TABS, isDetailsTab, sheetPlacement, tabAfterKey } from '../../src/app/shell/detailsSheet.ts';

test('a bottom sheet under 600 px wide when at least 480 px tall, a side sheet otherwise', () => {
  assert.deepEqual(sheetPlacement(360, 640, 'left'), { form: 'bottom', from: 'bottom' });
  assert.deepEqual(sheetPlacement(390, 844, null), { form: 'bottom', from: 'bottom' });
  assert.deepEqual(sheetPlacement(599, 480, null), { form: 'bottom', from: 'bottom' });
  assert.deepEqual(sheetPlacement(600, 900, null), { form: 'side', from: 'right' });
  assert.deepEqual(sheetPlacement(1440, 900, 'left'), { form: 'side', from: 'right' });
  assert.deepEqual(sheetPlacement(1280, 650, 'right'), { form: 'side', from: 'right' });
  // A short window under 600 px wide is a side sheet too.
  assert.deepEqual(sheetPlacement(560, 400, null), { form: 'side', from: 'right' });
});

test('a phone held sideways gets the sheet from the side away from the camera', () => {
  assert.deepEqual(sheetPlacement(844, 390, 'left'), { form: 'side', from: 'right' });
  assert.deepEqual(sheetPlacement(844, 390, 'right'), { form: 'side', from: 'left' });
  assert.deepEqual(sheetPlacement(750, 342, 'right'), { form: 'side', from: 'left' });
});

test('the tabs and the arrow, Home and End keys of the segmented control', () => {
  assert.deepEqual([...DETAILS_TABS], ['results', 'settings', 'data', 'device', 'about']);
  assert.equal(isDetailsTab('device'), true);
  assert.equal(isDetailsTab('lab'), false);
  assert.equal(tabAfterKey(0, 'ArrowRight', 5), 1);
  assert.equal(tabAfterKey(4, 'ArrowRight', 5), 0);
  assert.equal(tabAfterKey(0, 'ArrowLeft', 5), 4);
  assert.equal(tabAfterKey(2, 'Home', 5), 0);
  assert.equal(tabAfterKey(2, 'End', 5), 4);
  assert.equal(tabAfterKey(2, 'Enter', 5), null);
  assert.equal(tabAfterKey(0, 'ArrowRight', 0), null);
});
