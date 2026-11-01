// WP7 parity (spec §10.3 item 3): the BGR tensor layout of Peekr's `F` on a
// synthetic RGBA fixture: [1, 3, 128, 128], channel 0 = B/255, 1 = G/255,
// 2 = R/255, row-major, alpha dropped, no mean or standard deviation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bgrTensor, PK_CROP, PK_INPUT_SIZE } from '../../src/engines/peekr/preprocess.ts';

interface Reference {
  F_transcribed(rgba: ArrayLike<number>, a: number, s: number): Float32Array;
}
// A computed specifier keeps the untyped JavaScript reference out of the type check.
const ref = (await import(new URL('../reference/peekr-boxes.js', import.meta.url).href)) as Reference;

/** Every pixel's channels differ from each other and from their neighbours', so any transposition or channel swap shows. */
function synthetic(width: number, height: number, alpha: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set([(x * 2 + y) & 255, (y * 2 + 3 * x + 1) & 255, (x * 7 + y * 13 + 5) & 255, alpha(x, y)], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const same = (a: Float32Array, b: Float32Array) => a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

test('the tensor equals the bundle’s F, bit for bit, on a synthetic 128 × 128 RGBA image', () => {
  const image = synthetic(PK_CROP, PK_CROP, (x, y) => (x ^ y) & 255);
  const tensor = bgrTensor(image);
  assert.equal(tensor.length, PK_INPUT_SIZE);
  assert.ok(same(tensor, ref.F_transcribed(image.data, PK_CROP, PK_CROP)));
});

test('channel 0 is blue, 1 green, 2 red, each /255, row-major; alpha is ignored', () => {
  const image = synthetic(PK_CROP, PK_CROP, () => 255);
  const tensor = bgrTensor(image);
  const plane = PK_CROP * PK_CROP;
  for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127], [5, 77], [101, 3]]) {
    const p = (y * PK_CROP + x) * 4;
    const [r, g, b] = [image.data[p], image.data[p + 1], image.data[p + 2]];
    const i = y * PK_CROP + x;
    assert.equal(tensor[i], Math.fround(b / 255), `B at (${x}, ${y})`);
    assert.equal(tensor[plane + i], Math.fround(g / 255), `G at (${x}, ${y})`);
    assert.equal(tensor[2 * plane + i], Math.fround(r / 255), `R at (${x}, ${y})`);
  }
  // Pure colours land in their own plane only; 255 maps to exactly 1.
  const red = { data: new Uint8ClampedArray(PK_CROP * PK_CROP * 4), width: PK_CROP, height: PK_CROP };
  for (let i = 0; i < PK_CROP * PK_CROP; i++) red.data.set([255, 0, 0, 0], i * 4);
  const t = bgrTensor(red);
  assert.ok(t.subarray(0, 2 * plane).every((v) => v === 0));
  assert.ok(t.subarray(2 * plane).every((v) => v === 1));
  // Changing alpha changes nothing.
  assert.ok(same(bgrTensor(synthetic(PK_CROP, PK_CROP, (x) => x & 255)), tensor));
});

test('a reused buffer is overwritten completely, and wrong sizes throw', () => {
  const a = synthetic(PK_CROP, PK_CROP, () => 255);
  const out = new Float32Array(PK_INPUT_SIZE).fill(Number.NaN);
  assert.equal(bgrTensor(a, out), out);
  assert.ok(same(out, bgrTensor(a)));
  // Row-major for a non-square image too: plane c, row y, column x.
  const small = synthetic(7, 5, () => 255);
  const ts = bgrTensor(small);
  assert.equal(ts[35 + 4 * 7 + 6], Math.fround(small.data[(4 * 7 + 6) * 4 + 1] / 255));
  assert.throws(() => bgrTensor(a, new Float32Array(PK_INPUT_SIZE - 1)), RangeError);
  assert.throws(() => bgrTensor({ data: new Uint8ClampedArray(10), width: 2, height: 2 }), RangeError);
  assert.throws(() => bgrTensor({ data: new Uint8ClampedArray(0), width: 0, height: 0 }), RangeError);
});
