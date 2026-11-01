// BlazeGaze's static description (spec §3.1, §4.6.2, §16.2.4): what the main thread shows and
// stores without loading the engine or TF.js. Pure; index.ts uses the same object.
import { PROBE } from '../../core/constants.ts';
import type { EngineSpec } from '../types.ts';
import { BG_FEATURE_VERSION, BG_X_DIM } from './mappers.ts';

export const spec: EngineSpec = {
  id: 'blazegaze',
  displayName: 'BlazeGaze (WebEyeTrack)',
  rank: 1,
  family: 'appearance-fewshot',
  version: '75fbd2f',
  featureVersion: BG_FEATURE_VERSION,
  featureDim: BG_X_DIM,
  licence: { code: 'MIT', weights: 'MIT' },
  citation: 'Davalos, E., Zhang, Y., Goodwin, A. and Biswas, G. (2025). WebEyeTrack: scalable eye-tracking for the browser via on-device few-shot personalization. arXiv:2508.19544.',
  sourceUrl: 'https://github.com/RedForestAI/WebEyeTrack',
  assets: ['blazegaze-model', 'tfjs-wasm', 'tfjs-wasm-simd'],
  requires: [],
  frameBudgetMs: PROBE.budgetMs.blazegaze,
  mappers: ['prior-affine', 'prior-ridge-pose', 'emb-ridge'],
  inCombinedByDefault: true,
  downloadBytes: 669_060 + 424_594,
};
