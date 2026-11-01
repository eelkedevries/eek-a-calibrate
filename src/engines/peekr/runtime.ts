// The Peekr model session (spec §4.6.3): peekr.onnx in ONNX Runtime Web on the
// WebAssembly execution provider, with the bundle's session options. The
// runtime must have been configured by initOrt (runtimes/ort.ts) first; in
// Node, onnxruntime-web finds its own files.
import type { Vec2 } from '../../core/types.ts';
import { ort } from '../runtimes/ort.ts';
import { PK_CROP, PK_INPUT_SIZE, PK_X_DIM } from './preprocess.ts';

/** The bundle's InferenceSession options (dist/worker-*.js). */
export const PEEKR_SESSION_OPTIONS = Object.freeze({ executionProviders: ['wasm'], graphOptimizationLevel: 'all' } as const);

/** The model's interface: opset 11, two eye crops and kps in, one gaze point out [C]. */
export const PEEKR_INPUTS = Object.freeze({
  input1: [1, 3, PK_CROP, PK_CROP],
  input2: [1, 3, PK_CROP, PK_CROP],
  kps: [1, PK_X_DIM],
} as const);
export const PEEKR_OUTPUT = 'output';

type InputName = keyof typeof PEEKR_INPUTS;

function sameShape(actual: readonly (number | string)[], expected: readonly number[]): boolean {
  return actual.length === expected.length && actual.every((d, i) => d === expected[i]);
}

/** Throws unless the session has exactly Peekr's inputs and output, with their shapes where the model states them. */
function checkInterface(session: ort.InferenceSession): void {
  const inputs = [...session.inputNames].sort();
  const expected = (Object.keys(PEEKR_INPUTS) as InputName[]).sort();
  if (inputs.join() !== expected.join()) throw new Error(`peekr.onnx has inputs ${inputs.join(', ')}, not ${expected.join(', ')}`);
  if (session.outputNames.join() !== PEEKR_OUTPUT) throw new Error(`peekr.onnx has outputs ${session.outputNames.join(', ')}, not ${PEEKR_OUTPUT}`);
  for (const meta of session.inputMetadata) {
    if (!meta.isTensor) throw new Error(`peekr.onnx input ${meta.name} is not a tensor`);
    if (meta.type !== 'float32') throw new Error(`peekr.onnx input ${meta.name} is ${meta.type}, not float32`);
    const shape = PEEKR_INPUTS[meta.name as InputName];
    if (!sameShape(meta.shape, shape)) throw new Error(`peekr.onnx input ${meta.name} has shape [${meta.shape.join(', ')}], not [${shape.join(', ')}]`);
  }
}

export class PeekrSession {
  private session: ort.InferenceSession | null;
  private running = false;

  private constructor(session: ort.InferenceSession) {
    this.session = session;
  }

  /** Creates the session from the model bytes and checks the model's interface; releases it again if the check fails. */
  static async create(model: Uint8Array): Promise<PeekrSession> {
    const session = await ort.InferenceSession.create(model, { ...PEEKR_SESSION_OPTIONS, executionProviders: [...PEEKR_SESSION_OPTIONS.executionProviders] });
    try {
      checkInterface(session);
    } catch (error) {
      await session.release().catch(() => undefined);
      throw error;
    }
    return new PeekrSession(session);
  }

  get released(): boolean {
    return this.session === null;
  }

  /**
   * One inference: input1 and input2 as [1, 3, 128, 128] BGR tensors, kps
   * [1, 8]. Returns `output` (x, y). The buffers are read, not kept, so the
   * caller may reuse them once the promise settles; every tensor is disposed.
   */
  async run(input1: Float32Array, input2: Float32Array, kps: Float32Array): Promise<Vec2> {
    const session = this.session;
    if (!session) throw new Error('the Peekr session has been released');
    if (this.running) throw new Error('the Peekr session is already running an inference');
    if (input1.length !== PK_INPUT_SIZE || input2.length !== PK_INPUT_SIZE || kps.length !== PK_X_DIM) {
      throw new RangeError(`peekr: inputs of ${input1.length}, ${input2.length} and ${kps.length} values, not ${PK_INPUT_SIZE}, ${PK_INPUT_SIZE} and ${PK_X_DIM}`);
    }
    const feeds: Record<InputName, ort.Tensor> = {
      input1: new ort.Tensor('float32', input1, [...PEEKR_INPUTS.input1]),
      input2: new ort.Tensor('float32', input2, [...PEEKR_INPUTS.input2]),
      kps: new ort.Tensor('float32', kps, [...PEEKR_INPUTS.kps]),
    };
    this.running = true;
    let results: ort.InferenceSession.OnnxValueMapType | null = null;
    try {
      results = await session.run(feeds);
      const out = results[PEEKR_OUTPUT];
      if (!out || out.type !== 'float32' || out.size !== 2) {
        throw new Error(`peekr.onnx returned ${out ? `${out.type} [${out.dims.join(', ')}]` : 'no output'}, not float32 [1, 2]`);
      }
      const data = out.data as Float32Array;
      return [data[0], data[1]];
    } finally {
      this.running = false;
      for (const t of Object.values(feeds)) t.dispose();
      if (results) for (const t of Object.values(results)) t.dispose();
    }
  }

  /** Releases the session; idempotent. */
  async release(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (session) await session.release();
  }
}
