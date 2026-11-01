// §16.4: every engine's static spec loads in Node without its runtime, agrees with the engine
// modules and the a-priori ranks, and is where the fit client reads the feature versions from.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ENGINE_IDS, ENGINE_RANK } from '../../src/core/types.ts';
import { BG_FEATURE_VERSION } from '../../src/engines/blazegaze/mappers.ts';
import { EP_FEATURE_VERSION } from '../../src/engines/eyepixel/patches.ts';
import eyepixel from '../../src/engines/eyepixel/index.ts';
import { GEO_FEATURE_VERSION } from '../../src/engines/geometric/features.ts';
import geometric from '../../src/engines/geometric/index.ts';
import { MAPPERS } from '../../src/engines/mappers.ts';
import { PK_FEATURE_VERSION } from '../../src/engines/peekr/preprocess.ts';
import { ENGINE_SPECS } from '../../src/engines/specs.ts';
import { engineFeatureVersions } from '../../src/fit/fitClient.ts';

test('one spec per engine, with its id, rank, mappers and feature version', () => {
  assert.deepEqual(Object.keys(ENGINE_SPECS).sort(), [...ENGINE_IDS].sort());
  const versions = { blazegaze: BG_FEATURE_VERSION, peekr: PK_FEATURE_VERSION, geometric: GEO_FEATURE_VERSION, eyepixel: EP_FEATURE_VERSION };
  assert.deepEqual(versions, { blazegaze: 'bg-75fbd2f-1', peekr: 'pk-1.0.7-1', geometric: 'geo-4', eyepixel: 'ep-1' }, 'the §4.6 feature versions');
  for (const id of ENGINE_IDS) {
    const spec = ENGINE_SPECS[id];
    assert.equal(spec.id, id);
    assert.equal(spec.rank, ENGINE_RANK[id]);
    assert.equal(spec.featureVersion, versions[id]);
    assert.deepEqual([...spec.mappers].sort(), MAPPERS[id].map((m) => m.id).sort());
  }
});

test('the engine modules export the same spec objects', () => {
  assert.equal(geometric.spec, ENGINE_SPECS.geometric);
  assert.equal(eyepixel.spec, ENGINE_SPECS.eyepixel);
});

test('the spec modules import no engine code or runtime', () => {
  const allowed = /^(\.\.\/\.\.\/core\/|\.\.\/types\.ts$|\.\/(mappers|features|patches|preprocess|spec)\.ts$|\.\/(blazegaze|peekr|geometric|eyepixel)\/spec\.ts$|\.\/types\.ts$|\.\.\/core\/types\.ts$)/;
  const files = ['src/engines/specs.ts', ...ENGINE_IDS.map((id) => `src/engines/${id}/spec.ts`)];
  for (const file of files) {
    const imports = [...readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1] as string);
    for (const from of imports) assert.match(from, allowed, `${file} imports ${from}`);
  }
  // BlazeGaze's preprocessing pulls in ml-matrix: its spec must not import it.
  assert.doesNotMatch(readFileSync(new URL('../../src/engines/blazegaze/spec.ts', import.meta.url), 'utf8'), /preprocess/);
});

test('the fit client reads the feature versions from the specs, without loading an engine', () => {
  assert.deepEqual(engineFeatureVersions(['geometric', 'peekr']), { geometric: 'geo-4', peekr: 'pk-1.0.7-1' });
});
