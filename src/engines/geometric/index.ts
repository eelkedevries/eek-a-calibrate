// The geometric engine (spec §3.1 rank 3, §4.6.1): landmark, iris and
// head-pose features from the shared face front end, in plain TypeScript. It
// needs no assets or capabilities, so it is always available.
import type { BackendId, EngineFrame } from '../../core/types.ts';
import type { EngineInput, EngineModule, EngineSpec, GazeEngine } from '../types.ts';
import { GEO_FEATURE_VERSION, GEO_X_DIM, geometricFeatures } from './features.ts';

const spec: EngineSpec = {
  id: 'geometric',
  displayName: 'Geometric (landmarks, iris and head pose)',
  rank: 3,
  family: 'geometric',
  version: '1',
  featureVersion: GEO_FEATURE_VERSION,
  featureDim: GEO_X_DIM,
  licence: { code: 'MIT', weights: null },
  citation: 'eek-a-calibrate: a port of the gaze-lite landmark, iris and head-pose features, with corrections.',
  sourceUrl: 'https://github.com/eelkedevries/eek-a-calibrate',
  assets: [],
  requires: [],
  frameBudgetMs: 5,
  mappers: ['geo-linear', 'geo-quadratic'],
  inCombinedByDefault: true,
  downloadBytes: 0,
};

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
