# Task: Peekr engine (WP7)

## Goal

The Peekr eye-crop CNN as an exact reproduction of the 1.0.7 bundle's preprocessing, run with
single-threaded ONNX Runtime Web, with its mapper specs.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs in parallel with 002–006 (in its own worktree and `E2E_PORT`). Its parity tests use
the landmark fixture and frame of 004, and its crop renderer the lab hook of 004: run it after
004 has landed.

## Owns

`src/engines/peekr/{index,preprocess,runtime,mappers}.ts`, `src/engines/runtimes/ort.ts`
(replacing the stub of 001, which only holds the `?url` imports), `tests/parity/peekr-*.test.ts`,
`tests/reference/peekr-boxes.js`, the Peekr block of `tests/e2e/engines.spec.ts` (shared with
006: each adds its own `describe` block, and whoever lands second rebases).

## Context

`specification.md`: §2.2 item 3 (mirrored landmarks, unmirrored crop), §3.1 (package, model
file), §4.3 (mirror pairs), §4.6 (`FrameImage.crop`), §4.6.3 (boxes, `kps`, crop rule, BGR
tensor, session, validity), §4.8.4 (mapper table), §8.1 (ORT through Vite `?url` imports with
`.gz`), §10.3 WP7, §10.4 (`engines.spec.ts`).

The Peekr 1.0.7 package (model and bundle) is listed in the specification's "Scratch material"
table; the model is already committed under `public/models/peekr-1.0.7/`. `preprocess.ts` and
`mappers.ts` are DOM-free (§5). eek-a-look's UNISAL worker shows the `?url` and `wasmPaths`
pattern live on this host.

## Deliverables (required changes)

1. §4.6.3: mirrored landmarks, the two boxes and `kps` exactly as Peekr's `B`/`C` functions,
   crops through `FrameImage.crop` from the unmirrored frame, BGR tensors scaled to [0, 1],
   `status='crop-invalid'` for degenerate boxes.
2. The ORT session: `executionProviders:['wasm']`, `graphOptimizationLevel:'all'`, one thread
   unless cross-origin isolated, `wasmPaths` from the `?url` imports with the `.gz` copy in
   production and a single retry with the plain `.wasm`.
3. Output `x = kps` (8) and `prior = output`.
4. Mapper specs: `prior-affine`, `prior-ridge-pose` (§4.8.4).
5. A crop renderer for `#/lab`.
6. `tests/reference/peekr-boxes.js` (copied from the bundle with its MIT notice), the parity
   tests of §10.3 WP7 and the Peekr block of `engines.spec.ts`.

## Do not implement

- the 1,040-d embedding output (phase 2, §13); fitting or selection (002, 008);
- any reference to Peekr's third-party model URL; a change to the contracts, `constants.ts` or
  `package.json`.

## Acceptance criteria

The task is complete when:
- §10.3 WP7 passes: boxes and `kps` equal Peekr's `B`/`C` on legacy-equivalent mirrored
  landmarks; the ORT session in Node (one thread) gives finite, deterministic output; the BGR
  layout matches on a synthetic RGBA fixture;
- in `engines.spec.ts` the engine returns `ok` on at least 3 of 10 frames, with backend and ms
  recorded;
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
