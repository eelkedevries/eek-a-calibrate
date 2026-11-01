# Task: BlazeGaze engine (WP6)

## Goal

The default appearance engine: WebEyeTrack's BlazeGaze, with an eye strip bit-exact with
upstream, the frozen encoder and `gaze_mlp` run as two TF.js sub-models, and its mapper specs.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs in parallel with 002–005 and 007 (in its own worktree and `E2E_PORT`). Its parity
tests use the landmark fixture and frame of 004, and its crop renderer the lab hook of 004: run it
after 004 has landed.

## Owns

`src/engines/blazegaze/{index,preprocess,runtime,mappers}.ts`,
`src/engines/blazegaze/vendor/{mathUtils.ts,safeSVD.ts,LICENSE,UPSTREAM.md}`,
`src/engines/runtimes/tfjs.ts`, `tests/parity/blazegaze-*.test.ts`, the BlazeGaze block of
`tests/e2e/engines.spec.ts` (shared with 007: each adds its own `describe` block, and whoever
lands second rebases).

## Context

`specification.md`: §2.1 (model split, composite strip), §3.1 (packages, model files), §4.6
(rule; `FrameImage`), §4.6.2 (vendoring, inputs, composite strip, `faceWidthCm`, inference,
output, backend chain), §4.8.4 (mapper table), §8.1 (TF.js WebAssembly under
`vendor/tfjs-backend-wasm-4.22.0/`, `.gz` copies), §10.3 WP6, §10.4 (`engines.spec.ts`).

The upstream source at `75fbd2f` and the weights are listed in the specification's "Scratch
material" table; the weights are already committed under `public/models/blazegaze-75fbd2f/`.
`preprocess.ts`, `mappers.ts` and `vendor/**` are DOM-free (§5).

## Deliverables (required changes)

1. Vendor `mathUtils.ts` and `safeSVD.ts` with their MIT header, removing only
   `applyAffineMatrix` and its `@tensorflow/tfjs` import; `UPSTREAM.md` lists every change; keep
   the upstream `obtainEyePatch` as the parity reference.
2. The inputs of §4.6.2: the composite 512 × 128 eye strip in one nearest-neighbour pass,
   `faceWidthCm` as the median of the first 30 open-eye frames, `fo` and `hv`.
3. The model split (`cnn_encoder`, `gaze_mlp`) with `tf.loadLayersModel` and progress; output
   `x = [emb, hv, fo]` (518) and `prior`; no upstream Kalman filter, clipping, click listener or
   EAR skip.
4. The backend chain: `tfjs-webgl`, then `tfjs-wasm` (`setWasmPaths` with the `.gz` URLs), then
   `tfjs-cpu` only with `?force=cpu` or in Node; `resetSession`.
5. Mapper specs: `prior-affine`, `prior-ridge-pose`, `emb-ridge` (§4.8.4).
6. A strip crop renderer for `#/lab`.
7. The parity tests of §10.3 WP6 and the BlazeGaze block of `engines.spec.ts`.

## Do not implement

- Adam head adaptation (phase 2, §13); fitting or selection (002, 008);
- any request to a third-party host; a change to the contracts, `constants.ts` or `package.json`.

## Acceptance criteria

The task is complete when:
- §10.3 WP6 passes: the composite strip is bit-identical to the vendored two-pass
  `obtainEyePatch` on the fixture frame and landmarks (at least 99.9 % identical pixels, any
  difference only at boundary pixels); encoder → `gaze_mlp` equals the full `model.predict`
  (max |Δ| < 1e-5); `hv` and `fo` are finite and `faceWidthCm` is frozen after 30 frames;
- in `engines.spec.ts` the engine returns `ok` on at least 3 of 10 frames, with backend and ms
  recorded, and the `?force=cpu` path works;
- no third-party request; `npm run check` passes.

## Checks

`npm run check`; `npm run test:e2e -- smoke engines`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
