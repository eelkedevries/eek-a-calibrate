// Stub written by WP1. WP5 (005_geometric_and_eyepixel_engines.md) replaces this
// file with the real engine (spec §4.6.4). The registry expects a default-exported
// EngineModule.
import type { EngineModule } from '../types.ts';

const engine: EngineModule = {
  spec: {
    id: 'eyepixel',
    displayName: 'WebGazer method (re-implementation)',
    rank: 4,
    family: 'eye-pixel',
    version: '1',
    featureVersion: 'ep-1',
    featureDim: 120,
    licence: { code: 'MIT', weights: null },
    citation: 'Method of Papoutsaki, A., Sangkloy, P., Laskey, J., Daskalova, N., Huang, J. and Hays, J. (2016). WebGazer: scalable webcam eye tracking using user interactions. IJCAI 2016, 3839–3845. Clean-room re-implementation; no WebGazer code is used.',
    sourceUrl: 'https://github.com/eelkedevries/eek-a-calibrate',
    assets: [],
    requires: [],
    frameBudgetMs: 5,
    mappers: ['pix-ridge', 'pix-webgazer'],
    inCombinedByDefault: true,
    downloadBytes: 0,
  },
  probe: () => ({ ok: false, reason: 'not implemented' }),
  create: () => Promise.reject(new Error('The eye-pixel engine is not implemented yet.')),
};

export default engine;
