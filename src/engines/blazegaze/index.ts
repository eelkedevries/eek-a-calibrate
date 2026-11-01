// Stub written by WP1. WP6 (006_blazegaze_engine.md) replaces this file with the
// real engine (spec §4.6.2). The registry expects a default-exported EngineModule.
import type { EngineModule } from '../types.ts';

const engine: EngineModule = {
  spec: {
    id: 'blazegaze',
    displayName: 'BlazeGaze (WebEyeTrack)',
    rank: 1,
    family: 'appearance-fewshot',
    version: '75fbd2f',
    featureVersion: 'bg-75fbd2f-1',
    featureDim: 518,
    licence: { code: 'MIT', weights: 'MIT' },
    citation: 'Davalos, E., Zhang, Y., Goodwin, A. and Biswas, G. (2025). WebEyeTrack: scalable eye-tracking for the browser via on-device few-shot personalization. arXiv:2508.19544.',
    sourceUrl: 'https://github.com/RedForestAI/WebEyeTrack',
    assets: ['blazegaze-model', 'tfjs-wasm', 'tfjs-wasm-simd'],
    requires: [],
    frameBudgetMs: 25,
    mappers: ['prior-affine', 'prior-ridge-pose', 'emb-ridge'],
    inCombinedByDefault: true,
    downloadBytes: 669_060 + 424_594,
  },
  probe: () => ({ ok: false, reason: 'not implemented' }),
  create: () => Promise.reject(new Error('BlazeGaze is not implemented yet.')),
};

export default engine;
