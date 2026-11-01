// The eye-pixel engine's static description (spec §3.1, §4.6.4, §16.2.4). Pure; index.ts uses the
// same object.
import type { EngineSpec } from '../types.ts';
import { EP_FEATURE_VERSION, EP_X_DIM } from './patches.ts';

export const spec: EngineSpec = {
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
