// The eye-pixel engine (spec §3.1 rank 4, §4.6.4): a clean-room
// re-implementation of the WebGazer method, used as a literature baseline. It
// reads the frame's ROI pixels in plain TypeScript, so it needs no assets.
// Always labelled "WebGazer method (re-implementation)", never "WebGazer".
import type { BackendId, EngineFrame } from '../../core/types.ts';
import type { EngineInput, EngineModule, EngineSpec, GazeEngine } from '../types.ts';
import { EP_FEATURE_VERSION, EP_X_DIM, eyePixelFeatures } from './patches.ts';

const spec: EngineSpec = {
  id: 'eyepixel',
  displayName: 'WebGazer method (re-implementation)',
  rank: 4,
  family: 'eye-pixel',
  version: '1',
  featureVersion: EP_FEATURE_VERSION,
  featureDim: EP_X_DIM,
  licence: { code: 'MIT', weights: null },
  citation: 'Method of Papoutsaki, A., Sangkloy, P., Laskey, J., Daskalova, N., Huang, J. and Hays, J. (2016). WebGazer: scalable webcam eye tracking using user interactions. IJCAI 2016, 3839–3845. Clean-room re-implementation; no WebGazer code is used.',
  sourceUrl: 'https://github.com/eelkedevries/eek-a-calibrate',
  assets: [],
  requires: [],
  frameBudgetMs: 5,
  mappers: ['pix-ridge', 'pix-webgazer'],
  inCombinedByDefault: true,
  downloadBytes: 0,
};

class EyePixelEngine implements GazeEngine {
  readonly spec = spec;
  readonly backend: BackendId = 'js';
  private disposed = false;

  async warmUp(): Promise<void> {}

  // No per-session state.
  resetSession(): void {}

  async extract(input: EngineInput): Promise<EngineFrame> {
    if (this.disposed) throw new Error('the eye-pixel engine has been disposed');
    const t0 = performance.now();
    const out = eyePixelFeatures(input.face.landmarks, input.image, input.meta.videoW, input.meta.videoH);
    const computeMs = performance.now() - t0;
    if (out.status !== 'ok') return { engine: 'eyepixel', status: out.status, x: null, prior: null, weight: 0, computeMs };
    return { engine: 'eyepixel', status: 'ok', x: Float32Array.from(out.x), prior: null, weight: 1, computeMs };
  }

  dispose(): void {
    this.disposed = true;
  }
}

const engine: EngineModule = {
  spec,
  probe: () => ({ ok: true }),
  create: async (ctx) => {
    if (ctx.signal.aborted) throw new Error('loading the eye-pixel engine was cancelled');
    return new EyePixelEngine();
  },
};

export default engine;
