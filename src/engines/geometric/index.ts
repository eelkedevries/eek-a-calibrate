// The geometric engine (spec §3.1 rank 3, §4.6.1): landmark, iris and
// head-pose features from the shared face front end, in plain TypeScript. It
// needs no assets or capabilities, so it is always available.
import type { BackendId, EngineFrame } from '../../core/types.ts';
import type { EngineInput, EngineModule, GazeEngine } from '../types.ts';
import { geometricFeatures } from './features.ts';
import { spec } from './spec.ts';

class GeometricEngine implements GazeEngine {
  readonly spec = spec;
  readonly backend: BackendId = 'js';
  private disposed = false;

  async warmUp(): Promise<void> {}

  // No per-session state.
  resetSession(): void {}

  async extract(input: EngineInput): Promise<EngineFrame> {
    if (this.disposed) throw new Error('the geometric engine has been disposed');
    const t0 = performance.now();
    // A face whose features cannot be computed throws with the reason; the vision core reports it and marks the frame 'error'.
    const { x } = geometricFeatures(input.face, input.meta.videoW, input.meta.videoH);
    return { engine: 'geometric', status: 'ok', x: Float32Array.from(x), prior: null, weight: 1, computeMs: performance.now() - t0 };
  }

  dispose(): void {
    this.disposed = true;
  }
}

const engine: EngineModule = {
  spec,
  probe: () => ({ ok: true }),
  create: async (ctx) => {
    if (ctx.signal.aborted) throw new Error('loading the geometric engine was cancelled');
    return new GeometricEngine();
  },
};

export default engine;
