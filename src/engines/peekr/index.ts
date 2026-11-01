// Stub written by WP1. WP7 (007_peekr_engine.md) replaces this file with the
// real engine (spec §4.6.3). The registry expects a default-exported EngineModule.
import type { EngineModule } from '../types.ts';
// Keeps the ONNX Runtime files in the build until WP7 lands (spec §11 WP1 acceptance).
import '../runtimes/ort.ts';

const engine: EngineModule = {
  spec: {
    id: 'peekr',
    displayName: 'Peekr',
    rank: 2,
    family: 'appearance-cnn',
    version: '1.0.7',
    featureVersion: 'pk-1.0.7-1',
    featureDim: 8,
    licence: { code: 'MIT', weights: 'MIT' },
    citation: 'Taore, A. (2025). Peekr 1.0.7, browser eye tracking with ONNX (npm package). Accuracy is author-reported and not peer-reviewed.',
    sourceUrl: 'https://www.npmjs.com/package/peekr',
    assets: ['peekr-model', 'ort-wasm', 'ort-mjs'],
    requires: [],
    frameBudgetMs: 15,
    mappers: ['prior-affine', 'prior-ridge-pose'],
    inCombinedByDefault: true,
    downloadBytes: 579_176 + 14_239_897 + 24_381,
  },
  probe: () => ({ ok: false, reason: 'not implemented' }),
  create: () => Promise.reject(new Error('Peekr is not implemented yet.')),
};

export default engine;
