// The BlazeGaze model (spec §4.6.2): loaded with tf.loadLayersModel and split
// into its frozen encoder (`cnn_encoder`, 128 × 512 × 3 → 512) and its head
// (`gaze_mlp`, [emb 512, hv 3, fo 3] → 2), both LayersModels called directly,
// so the embedding is available as a feature. TF.js stays confined to this
// file and runtimes/tfjs.ts (spec §12). Works on any registered TF.js backend;
// the parity tests run it on the CPU backend in Node.
import * as tf from '@tensorflow/tfjs-core';
import { loadLayersModel, type LayersModel } from '@tensorflow/tfjs-layers';
import { BG_EMB_DIM, STRIP_H, STRIP_W } from './preprocess.ts';

export const ENCODER_LAYER = 'cnn_encoder';
export const HEAD_LAYER = 'gaze_mlp';

export interface BlazeGazeModel {
  full: LayersModel;
  encoder: LayersModel;
  head: LayersModel;
}

type Shape = readonly (number | null)[];

function sameShape(a: Shape, b: Shape): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function describeShapes(shapes: readonly Shape[]): string {
  return shapes.map((s) => `[${s.map((v) => (v === null ? 'null' : v)).join(', ')}]`).join(', ');
}

function checkIo(name: string, model: LayersModel, inputs: Shape[], outputs: Shape[]): void {
  const inShapes = model.inputs.map((t) => t.shape);
  const outShapes = model.outputs.map((t) => t.shape);
  const ok = inShapes.length === inputs.length && outShapes.length === outputs.length
    && inShapes.every((s, i) => sameShape(s, inputs[i])) && outShapes.every((s, i) => sameShape(s, outputs[i]));
  if (!ok) {
    throw new Error(`${name} has inputs ${describeShapes(inShapes)} and outputs ${describeShapes(outShapes)}, not the BlazeGaze topology`);
  }
}

/** The two sub-models of a loaded BlazeGaze LayersModel; throws unless the topology is the expected one. */
export function splitModel(full: LayersModel): BlazeGazeModel {
  const encoder = full.getLayer(ENCODER_LAYER) as unknown as LayersModel;
  const head = full.getLayer(HEAD_LAYER) as unknown as LayersModel;
  if (typeof encoder.predict !== 'function' || typeof head.predict !== 'function') {
    throw new Error(`${ENCODER_LAYER} and ${HEAD_LAYER} must be nested models`);
  }
  checkIo('the model', full, [[null, STRIP_H, STRIP_W, 3], [null, 3], [null, 3]], [[null, 2]]);
  checkIo(ENCODER_LAYER, encoder, [[null, STRIP_H, STRIP_W, 3]], [[null, BG_EMB_DIM]]);
  checkIo(HEAD_LAYER, head, [[null, BG_EMB_DIM], [null, 3], [null, 3]], [[null, 2]]);
  return { full, encoder, head };
}

/** tf.loadLayersModel on a URL (with the caller's fetch and progress options) or an IOHandler, then split. */
export async function loadBlazeGaze(source: string | tf.io.IOHandler, options?: tf.io.LoadOptions): Promise<BlazeGazeModel> {
  const full = await loadLayersModel(source, options);
  try {
    return splitModel(full);
  } catch (error) {
    full.dispose();
    throw error;
  }
}

export interface BlazeGazeOutput {
  emb: Float32Array;
  prior: [number, number];
}

function single(out: tf.Tensor | tf.Tensor[], what: string): tf.Tensor {
  if (Array.isArray(out)) {
    if (out.length !== 1) throw new Error(`${what} returned ${out.length} tensors`);
    return out[0];
  }
  return out;
}

/**
 * emb = encoder(strip); prior = head([emb, hv, fo]). `strip` is the
 * [1, 128, 512, 3] encoder input (RGB / 255). Reads back asynchronously, so a
 * GPU backend does not stall; every tensor is disposed, including on error.
 */
export async function inferBlazeGaze(model: BlazeGazeModel, strip: Float32Array, hv: ArrayLike<number>, fo: ArrayLike<number>): Promise<BlazeGazeOutput> {
  if (strip.length !== STRIP_H * STRIP_W * 3) throw new RangeError(`the strip has ${strip.length} values, not ${STRIP_H * STRIP_W * 3}`);
  if (hv.length !== 3 || fo.length !== 3) throw new RangeError('hv and fo must have 3 values each');
  const [embT, priorT] = tf.tidy(() => {
    const image = tf.tensor4d(strip, [1, STRIP_H, STRIP_W, 3], 'float32');
    const emb = single(model.encoder.predict(image), ENCODER_LAYER);
    const hvT = tf.tensor2d(Array.from(hv), [1, 3], 'float32');
    const foT = tf.tensor2d(Array.from(fo), [1, 3], 'float32');
    const prior = single(model.head.predict([emb, hvT, foT]), HEAD_LAYER);
    return [emb, prior];
  });
  try {
    const [emb, prior] = await Promise.all([embT.data(), priorT.data()]);
    if (!(emb instanceof Float32Array) || emb.length !== BG_EMB_DIM) throw new Error(`${ENCODER_LAYER} returned ${emb.length} values, not ${BG_EMB_DIM}`);
    if (prior.length !== 2) throw new Error(`${HEAD_LAYER} returned ${prior.length} values, not 2`);
    return { emb, prior: [prior[0], prior[1]] };
  } finally {
    tf.dispose([embT, priorT]);
  }
}

/** model.predict([strip, hv, fo]) on the unsplit model: the reference for the split (parity test). */
export async function predictFull(model: BlazeGazeModel, strip: Float32Array, hv: ArrayLike<number>, fo: ArrayLike<number>): Promise<[number, number]> {
  const out = tf.tidy(() => {
    const image = tf.tensor4d(strip, [1, STRIP_H, STRIP_W, 3], 'float32');
    const hvT = tf.tensor2d(Array.from(hv), [1, 3], 'float32');
    const foT = tf.tensor2d(Array.from(fo), [1, 3], 'float32');
    return single(model.full.predict([image, hvT, foT]), 'the model');
  });
  try {
    const v = await out.data();
    return [v[0], v[1]];
  } finally {
    out.dispose();
  }
}

export function disposeBlazeGaze(model: BlazeGazeModel): void {
  // The sub-models share the full model's weights.
  model.full.dispose();
}
