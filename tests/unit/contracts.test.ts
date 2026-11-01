// WP1: the frozen contracts load in Node straight from the TypeScript source,
// as every DOM-free layer must (spec §5), and agree with each other.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LAMBDA_REL, PCA } from '../../src/core/constants.ts';
import { ENGINE_IDS, ENGINE_RANK, Flags, INVALID_MASK } from '../../src/core/types.ts';
import { MAPPERS } from '../../src/engines/mappers.ts';

test('engine ids and a-priori ranks agree', () => {
  assert.deepEqual(ENGINE_IDS, ['blazegaze', 'peekr', 'geometric', 'eyepixel']);
  assert.deepEqual(
    ENGINE_IDS.map((id) => ENGINE_RANK[id]),
    [1, 2, 3, 4],
  );
});

test('INVALID_MASK holds every flag except EXTRAPOLATED and OFFSCREEN', () => {
  const all = Object.values(Flags).reduce((mask, bit) => mask | bit, 0);
  assert.equal(INVALID_MASK, all & ~(Flags.EXTRAPOLATED | Flags.OFFSCREEN));
});

test('the mapper table has an entry for every engine, and each mapper names its engine', () => {
  assert.deepEqual(Object.keys(MAPPERS).sort(), [...ENGINE_IDS].sort());
  for (const id of ENGINE_IDS) {
    const specs = MAPPERS[id];
    assert.ok(Array.isArray(specs));
    assert.equal(new Set(specs.map((spec) => spec.id)).size, specs.length, `duplicate mapper id in ${id}`);
    for (const spec of specs) assert.equal(spec.engine, id);
  }
});

test('the ridge grid and PCA defaults are those of Appendix A', () => {
  assert.deepEqual(LAMBDA_REL, [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 0.1, 0.3, 1, 3]);
  assert.deepEqual(PCA, { k: 64, oversample: 10, powerIters: 2 });
});
