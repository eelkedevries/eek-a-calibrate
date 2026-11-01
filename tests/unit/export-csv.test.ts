// WP3: number formats and CSV writing shared by every export file.
import assert from 'node:assert/strict';
import test from 'node:test';
import { csvField, csvTable, fmtBool, fmtDeg, fmtFixed, fmtInt, fmtMm, fmtMs, fmtPx, fmtSig, relMs, utf8 } from '../../src/core/export/csv.ts';

test('fixed decimals: ms 3, px 2, deg 4, mm 1', () => {
  assert.equal(fmtMs(1234.56789), '1234.568');
  assert.equal(fmtPx(959.999), '960.00');
  assert.equal(fmtDeg(-12.345678), '-12.3457');
  assert.equal(fmtMm(600.04), '600.0');
  assert.equal(fmtFixed(2, 0), '2');
});

test('empty for null, undefined and NaN; inf for infinities; never a negative zero', () => {
  for (const f of [fmtMs, fmtPx, fmtDeg, fmtMm, fmtSig, fmtInt]) {
    assert.equal(f(null), '');
    assert.equal(f(undefined), '');
    assert.equal(f(Number.NaN), '');
  }
  assert.equal(fmtDeg(Infinity), 'inf');
  assert.equal(fmtSig(-Infinity), '-inf');
  assert.equal(fmtPx(-0), '0.00');
  assert.equal(fmtPx(-0.001), '0.00');
  assert.equal(fmtDeg(-0.00004), '0.0000');
  assert.equal(fmtMs(-0.0006), '-0.001');
  assert.equal(fmtSig(-0), '0');
  assert.equal(fmtInt(-0), '0');
});

test("6 significant figures match C's %.6g (reference strings from Python)", () => {
  const reference: [number, string][] = [
    [0.5, '0.5'],
    [1, '1'],
    [123456, '123456'],
    [1234567, '1.23457e+06'],
    [0.0001, '0.0001'],
    [0.00001, '1e-05'],
    [0.000123456789, '0.000123457'],
    [-2.5e-10, '-2.5e-10'],
    [1e100, '1e+100'],
    [3.14159265, '3.14159'],
    [99999.95, '99999.9'],
    [999999.5, '1e+06'],
    [-0.000999999, '-0.000999999'],
    [1.5e-5, '1.5e-05'],
    [2 / 3, '0.666667'],
    [-123.456789, '-123.457'],
    [100000, '100000'],
    [1e21, '1e+21'],
    [6.02214076e23, '6.02214e+23'],
    [0, '0'],
  ];
  for (const [v, s] of reference) assert.equal(fmtSig(v), s, String(v));
});

test('integers and booleans', () => {
  assert.equal(fmtInt(42), '42');
  assert.equal(fmtInt(-7), '-7');
  assert.throws(() => fmtInt(1.5), RangeError);
  assert.throws(() => fmtInt(Infinity), RangeError);
  assert.equal(fmtBool(true), '1');
  assert.equal(fmtBool(false), '0');
  assert.equal(fmtBool(null), '');
});

test('RFC 4180 quoting only where needed', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField('cr\r'), '"cr\r"');
  assert.equal(csvField(null), '');
});

test('tables: LF only, a final newline, every row as wide as the header', () => {
  const text = csvTable(['a', 'b'], [['1', 'x,y'], ['', '2']]);
  assert.equal(text, 'a,b\n1,"x,y"\n,2\n');
  assert.ok(!text.includes('\r'));
  assert.equal(csvTable(['a'], []), 'a\n');
  assert.throws(() => csvTable(['a', 'b'], [['1']]), RangeError);
});

test('UTF-8 without a byte-order mark; times relative to session start', () => {
  const bytes = utf8('participant\nZoë');
  assert.deepEqual([...bytes.slice(0, 3)], [0x70, 0x61, 0x72]);
  assert.deepEqual([...bytes.slice(-3)], [0x6f, 0xc3, 0xab]);
  const id = { participant: 'p', session: 's', sessionStartMs: 1000.5 };
  assert.equal(relMs(id, 1500.75), 500.25);
  assert.equal(relMs(id, null), null);
  assert.ok(Number.isNaN(relMs(id, Number.NaN) as number));
});
