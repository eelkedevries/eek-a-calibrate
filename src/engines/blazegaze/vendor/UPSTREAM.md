# Vendored WebEyeTrack code

| Item | Value |
|---|---|
| Upstream | <https://github.com/RedForestAI/WebEyeTrack> |
| Commit | `75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c` |
| Licence | MIT, © 2025 Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas (`LICENSE` in this folder) |
| Retrieved | 1 November 2026, from the scratch copy named in the specification's "Scratch material" table |

| File here | Upstream file | Upstream SHA-256 |
|---|---|---|
| `mathUtils.ts` | `js/src/utils/mathUtils.ts` | `0e7fd644c92a846482ca5e939e52fdbaf181400863fb3772d8740e63499f60d9` |
| `safeSVD.ts` | `js/src/utils/safeSVD.ts` | `b0b5205184ef91c04d6cfe60fa38fa2382629bc05f1e9019014421b6110b0a9f` |
| `LICENSE` | `LICENSE` | `f779143d708f5f3d510a155fa751fbf205e0aace2660ccfce972fc9503992c19` |

## Every change to the vendored files

**`mathUtils.ts`**

1. A header comment naming the source and commit, followed by the MIT notice from the
   repository's `LICENSE`. The upstream file has no header.
2. Imports:
   - `import { Matrix as MediaPipeMatrix, NormalizedLandmark } from '@mediapipe/tasks-vision'`
     became `import type`. Both are types; with `verbatimModuleSyntax` and Node's type
     stripping, a value import would load MediaPipe at run time.
   - `import * as tf from '@tensorflow/tfjs'` was removed, together with `applyAffineMatrix`
     (item 3).
   - `import { Point } from '../types'` was replaced by upstream's own definition from
     `js/src/types.ts` (`export type Point = number[];`, with its commented-out alternative),
     because `types.ts` is not vendored.
   - `'./safeSVD'` became `'./safeSVD.ts'`. The DOM-free layers import with explicit
     extensions (specification §5).
3. `applyAffineMatrix` was removed (specification §4.6.2). The affine correction it applied
   is the `prior-affine` mapper (§4.8.4).
4. Five `// @ts-expect-error` comments were added, with no code change. They sit above
   declarations that upstream never reads, which this project's `noUnusedLocals` and
   `noUnusedParameters` would otherwise reject:
   - the unused `pseudoInverse` in the `ml-matrix` import;
   - `ORIGIN_POINT_LOCATION`;
   - `N` in `computeAffineMatrixML`;
   - `z` in `convertUvToXyz`;
   - the `alpha` parameter of `refineDepthByRadialMagnitude`.

Everything else is byte-identical. To check, remove the header lines, the five comments and
the inlined `Point` lines; add back the three imports and `applyAffineMatrix`; then
`diff` against the upstream file.

**`safeSVD.ts`**: the same header and MIT notice. The body is byte-identical.

**`LICENSE`**: verbatim, with a final newline added.

`obtainEyePatch`, `warpImageData` and `cropImageData` are kept unchanged, as the parity
reference. Only the tests call them (`tests/parity/blazegaze-strip.test.ts`). The app's
bundle tree-shakes them out.

## Where eek-a-calibrate's BlazeGaze differs from upstream's pipeline

These changes live in `../preprocess.ts`, `../runtime.ts`, `../index.ts` and
`../../runtimes/tfjs.ts`, not in the vendored files.

| Topic | Upstream (`WebEyeTrack.ts`, `BlazeGaze.ts`) | Here | Effect on the numbers |
|---|---|---|---|
| `faceWidthCm` | `estimateFaceWidth` on the first frame, frozen | Median of `estimateFaceWidth` over the first 30 open-eye frames of a session, then frozen. Until then: the median of the frames so far, or the current frame's estimate if there is no open-eye frame yet (upstream's first-frame rule). `resetSession` starts again | Intended (specification §4.6.2): less sensitive to one frame's landmark noise |
| Eye strip | `obtainEyePatch`: warp to 512 × 512, crop rows, resize to 512 × 128, each pass sampling with `floor` | One composite pass with the same homographies, inverses and per-pass `floor` and bounds tests. It reads from the face ROI, or from a 1:1 copy of the needed rectangle when the strip reaches beyond the ROI | None: bit-identical on the fixture and on faces crossing the frame edge (parity test) |
| Face origin `fo` | `faceReconstruction`, then `computeFaceOrigin3D` | The same operations in the same order. The perspective inverse and intrinsics are computed once per frame size, and the per-landmark loops run on plain arrays | None: bit-identical (parity test). About 1 ms instead of about 15 ms a frame |
| Depth guess | Last inferred frame's `faceOrigin3D[2]`, else 60 | Previous frame's `fo` z, else 60. Upstream skips closed-eye frames, so its "last" frame can be older | Small, only after closed-eye frames |
| Perspective matrix | Made once, from the first frame's aspect ratio | Made per frame size | None unless the frame size changes mid-session (upstream would keep the stale matrix) |
| Encoder input | `tf.browser.fromPixels(patch).toFloat().div(255)` on the active backend | RGB / 255 into a `Float32Array` on the CPU | None in IEEE float32 (division correctly rounded). A GPU backend may differ by an ulp |
| Model | `tf.loadLayersModel(origin + '/web/model.json')`, `model.predict` | `tf.loadLayersModel` through the asset manifest (size and SHA-256 checked); `cnn_encoder` and `gaze_mlp` called in turn, so the embedding is a feature | None: encoder → head equals `model.predict` to < 1e-5 (parity test) |
| Not used | Kalman filter, clipping to ±0.5, click listener and `adapt` (Adam), EAR closed-eye skip, the affine matrix | — | Intended (specification §4.6.2). Head adaptation is phase 2 (§13). The mappers replace the affine matrix |
| Backend | `@tensorflow/tfjs` default (WebGL) | WebGL, then WebAssembly; CPU only with `?force=cpu` or in Node. WebGL is set aside when it renders only half-precision floats or renders in software (SwiftShader and similar) | Half precision would change the arithmetic. Software WebGL is about 15× slower than WebAssembly |
