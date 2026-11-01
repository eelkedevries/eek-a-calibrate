// The geometric engine's static description (spec §3.1, §4.6.1, §16.4). Pure; index.ts uses
// the same object.
import type { EngineSpec } from '../types.ts';
import { GEO_FEATURE_VERSION, GEO_X_DIM } from './features.ts';

export const spec: EngineSpec = {
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
