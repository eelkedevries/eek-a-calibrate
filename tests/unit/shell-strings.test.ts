// The string modules behind t() (spec §17.3.6): one module per screen or shell part, no key
// defined twice, the same t() for every caller.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeStrings, STRING_MODULES, STRINGS, t } from '../../src/app/strings.en-GB.ts';

test('every module merges, and no key is defined in two modules', () => {
  const total = Object.values(STRING_MODULES).reduce((n, table) => n + Object.keys(table).length, 0);
  assert.equal(Object.keys(STRINGS).length, total);
});

test('a duplicate key fails the merge, naming both modules', () => {
  assert.throws(() => mergeStrings({ one: { 'a.b': 'x' }, two: { 'a.c': 'y', 'a.b': 'z' } }), /"a\.b" is defined in strings\/one\.ts and strings\/two\.ts/);
});

test('t() keeps its signature: placeholders filled, a missing key returned as is', () => {
  assert.equal(t('track.levelOf', { level: 2, levels: 4 }), 'Level 2 of 4');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(t('constructor'), 'constructor');
  assert.equal(t('welcome.start') !== 'welcome.start', true);
});

test('the shell copy is British English without em dashes (§17.3.6)', () => {
  for (const name of ['shell', 'track', 'details', 'title', 'ready', 'warmup', 'complete', 'look', 'challenge', 'methods']) {
    for (const [key, value] of Object.entries(STRING_MODULES[name]!)) {
      assert.ok(!value.includes('—'), `${key} has an em dash`);
    }
  }
  assert.equal(t('title.name'), 'Pop with your eyes');
  assert.equal(t('title.pitch'), 'Warm up the tracker, then pop bubbles just by looking.');
});
