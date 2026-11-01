// WP6 parity, item 2 (spec §10.3): the encoder followed by gaze_mlp equals
// the full model.predict (max |Δ| < 1e-5), with @tensorflow/tfjs-core,
// -layers and -backend-cpu and the committed weights through tf.io.fromMemory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import { sequential, layers } from '@tensorflow/tfjs-layers';
import { mulberry32 } from '../../src/core/maths/rng.ts';
import {
  BG_EMB_DIM,
  newSession,
  prepareInputs,
  sampleEyeStrip,
  STRIP_H,
  STRIP_W,
  stripTensorData,
} from '../../src/engines/blazegaze/preprocess.ts';
import { disposeBlazeGaze, inferBlazeGaze, loadBlazeGaze, predictFull, splitModel, type BlazeGazeModel } from '../../src/engines/blazegaze/runtime.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('assets-manifest.json', root), 'utf8')) as { assets: { id: string; path: string; sha256: string }[] };

function committed(id: string): Buffer {
  const entry = manifest.assets.find((a) => a.id === id)!;
  const bytes = readFileSync(new URL(`public/${entry.path}`, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${entry.path} does not match the manifest`);
  return bytes;
}

let model: BlazeGazeModel;

before(async () => {
  assert.ok(await tf.setBackend('cpu'));
  const json = JSON.parse(committed('blazegaze-model').toString('utf8'));
  const bin = committed('blazegaze-weights');
  model = await loadBlazeGaze(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
    }),
  );
});

function maxAbsDiff(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

async function assertSplitEqualsFull(strip: Float32Array, hv: number[], fo: number[], label: string) {
  const before = tf.memory().numTensors;
  const split = await inferBlazeGaze(model, strip, hv, fo);
  assert.equal(tf.memory().numTensors, before, `${label}: inferBlazeGaze leaked tensors`);
  const full = await predictFull(model, strip, hv, fo);
  assert.equal(tf.memory().numTensors, before, `${label}: predictFull leaked tensors`);
  assert.equal(split.emb.length, BG_EMB_DIM);
  assert.ok(split.emb.every(Number.isFinite), `${label}: non-finite embedding`);
  assert.ok([...split.prior, ...full].every(Number.isFinite), `${label}: non-finite output`);
  const d = maxAbsDiff(split.prior, full);
  assert.ok(d < 1e-5, `${label}: encoder → gaze_mlp differs from model.predict by ${d}`);
  return split;
}

test('the topology is BlazeGaze: 156,018 parameters, 8,610 in gaze_mlp', () => {
  assert.equal(model.full.countParams(), 156_018);
  assert.equal(model.head.countParams(), 8_610);
  assert.equal(model.encoder.countParams() + model.head.countParams(), 156_018);
});

test('encoder → gaze_mlp equals model.predict on the fixture face', async () => {
  const fx = loadLandmarkFixture();
  const prep = prepareInputs(newSession(), fx.landmarks, fx.matrix, true, fx.videoW, fx.videoH);
  assert.ok(prep.strip.ok);
  const strip = stripTensorData(sampleEyeStrip(prep.strip.plan, { buffer: fx.pixels, x: 0, y: 0 }));
  const out = await assertSplitEqualsFull(strip, prep.hv, prep.fo, 'fixture');
  // The head's estimate is in centre-origin screen units, roughly [−0.5, 0.5] [PG]; this bounds gross failures only.
  assert.ok(out.prior.every((v) => Math.abs(v) < 2), `implausible prior ${out.prior}`);
});

test('encoder → gaze_mlp equals model.predict on seeded random inputs', async () => {
  const rand = mulberry32(6);
  const strip = Float32Array.from({ length: STRIP_W * STRIP_H * 3 }, () => rand());
  const hv = [rand() - 0.5, rand() - 0.5, -0.9];
  const fo = [10 * (rand() - 0.5), 10 * (rand() - 0.5), 40 + 30 * rand()];
  await assertSplitEqualsFull(strip, hv, fo, 'random');
});

test('wrong input sizes and topologies are rejected', async () => {
  await assert.rejects(() => inferBlazeGaze(model, new Float32Array(10), [0, 0, -1], [0, 0, 60]), RangeError);
  await assert.rejects(() => inferBlazeGaze(model, new Float32Array(STRIP_W * STRIP_H * 3), [0, 0], [0, 0, 60]), RangeError);
  const other = sequential({ layers: [layers.dense({ units: 2, inputShape: [3] })] });
  assert.throws(() => splitModel(other));
  other.dispose();
});

test('disposing the model releases its weights', () => {
  const before = tf.memory().numTensors;
  disposeBlazeGaze(model);
  assert.ok(tf.memory().numTensors < before);
});
