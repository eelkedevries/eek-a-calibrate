// Stub written by WP1. WP5 (005_geometric_and_eyepixel_engines.md) replaces this
// file with the real engine (spec §4.6.1). The registry expects a default-exported
// EngineModule.
import type { EngineModule } from '../types.ts';

const engine: EngineModule = {
  spec: {
    id: 'geometric',
    displayName: 'Geometric (landmarks, iris and head pose)',
    rank: 3,
    family: 'geometric',
    version: '1',
    featureVersion: 'geo-4',
    featureDim: 0, // set by WP5
    licence: { code: 'MIT', weights: null },
    citation: 'eek-a-calibrate: a port of the gaze-lite landmark, iris and head-pose features, with corrections.',
    sourceUrl: 'https://github.com/eelkedevries/eek-a-calibrate',
    assets: [],
    requires: [],
    frameBudgetMs: 5,
    mappers: ['geo-linear', 'geo-quadratic'],
    inCombinedByDefault: true,
    downloadBytes: 0,
  },
  probe: () => ({ ok: false, reason: 'not implemented' }),
  create: () => Promise.reject(new Error('The geometric engine is not implemented yet.')),
};

export default engine;
