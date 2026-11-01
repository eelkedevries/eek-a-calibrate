// Peekr's static description (spec §3.1, §4.6.3, §16.4): what the main thread shows and stores
// without loading the engine or ONNX Runtime. Pure; index.ts uses the same object.
import type { EngineSpec } from '../types.ts';
import { PK_FEATURE_VERSION, PK_X_DIM } from './preprocess.ts';

export const spec: EngineSpec = {
  id: 'peekr',
  displayName: 'Peekr',
  rank: 2,
  family: 'appearance-cnn',
  version: '1.0.7',
  featureVersion: PK_FEATURE_VERSION,
  featureDim: PK_X_DIM,
  licence: { code: 'MIT', weights: 'MIT' },
  citation: 'Taore, A. (2025). Peekr 1.0.7, browser eye tracking with ONNX (npm package). Accuracy is author-reported and not peer-reviewed.',
  sourceUrl: 'https://www.npmjs.com/package/peekr',
  assets: ['peekr-model', 'ort-wasm', 'ort-mjs'],
  requires: ['wasm-simd'],
  frameBudgetMs: 15,
  mappers: ['prior-affine', 'prior-ridge-pose'],
  inCombinedByDefault: true,
  downloadBytes: 579_176 + 14_239_897 + 24_381,
};
