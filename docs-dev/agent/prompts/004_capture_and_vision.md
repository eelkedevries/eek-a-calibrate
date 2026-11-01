# Task: Capture and vision host (WP4)

## Goal

Camera capture with a reliable frame clock, the MediaPipe face front end in a module worker with
an inline fallback, per-engine orchestration, the device probe and the diagnostics screen.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs in parallel with 002, 003 and 005–007 (in its own worktree and `E2E_PORT`); 005,
006 and 007 build on its landmark sets, fixture and lab hook, so run it early.

## Owns

`src/platform/{camera,frameClock,fullscreen,capabilities,assets}.ts`, `src/vision/*` (except the
frozen `protocol.ts`), `src/core/face/{landmarkSets,headPose,eyeMeasures,blink,quality}.ts`,
`src/app/screens/lab.ts`, `tests/e2e/vision.spec.ts`, `tests/e2e/make-landmark-fixture.spec.ts`,
`tests/fixtures/landmarks/`, `tests/unit/face-*.test.ts`, `tests/unit/platform-*.test.ts`.

## Context

`specification.md`: §2.1 (the verified module-worker loader path), §4.1 (capture, frame clock,
back-pressure, clocks, pauses), §4.2 (worker and inline hosts, host selection, delegate, `.gz`
retry), §4.3 (FaceLandmarker options, landmark sets, head pose, eye measures, face quality), §4.6
(`FrameImage`), §6 (`vision/protocol.ts`, `engines/types.ts`), §7 (`#/lab`, query parameters),
§8.1 (assets), §10.1 WP4, §10.3 (landmark fixture), §10.4 (`vision.spec.ts`), Appendix A.

Asset URLs come from `assets-manifest.json` (`BASE_URL` + `path`; production builds use the
`.gz` copy where `gz` is true). The registry (`src/engines/registry.ts`) loads each engine's
default-exported `EngineModule`; the stubs report `not implemented`. Test hooks are added with
`registerTestHook` (`src/app/testHooks.ts`).

The smoke test sees worker network requests (context `request` events) and worker console
errors, but a CSP violation inside a worker does not reach the page: the worker should report
`securitypolicyviolation` events in its own scope as console errors.

## Deliverables (required changes)

1. §4.1: the camera request ladder with the error messages, the camera picker data, the hidden
   source video and the mirrored preview, the frame clock (rVFC with the 500 ms poll fallback,
   `presentedFrames` dedupe, clock source per frame), `createImageBitmap` transfer with one frame
   in flight, main-thread timestamps, and the pause conditions. Keep the decision logic (camera
   ladder, frame dedupe) in pure functions that load in Node.
2. §4.2: `WorkerHost` (module WASM pair) and `InlineHost` (classic SIMD or no-SIMD) running the
   same `visionCore.ts`; `createVisionHost` with `?host=` override, the 20 s fallback and the
   recorded reason; GPU then CPU delegate; the `.gz` → plain `.wasm` retry.
3. §4.3: the landmarker (options, `modelAssetBuffer` fetched with progress, strictly increasing
   timestamps, rebuild after a graph error), the landmark sets including the Peekr mirror pairs,
   `headPoseFromMatrix` (gaze-lite port), eye measures, the eyes-open rule with ±1-frame masks,
   and face quality.
4. `FrameImage` with `roi` and `crop` (§4.6); engine orchestration in the worker (load the
   selected `EngineModule`s, run `extract` sequentially per frame, isolate errors per engine,
   time each stage); the probe (§6 `ProbeResult`).
5. `platform/assets.ts`: fetch with progress that checks the manifest sha256, so that a tampered
   model makes only that engine unavailable (§10.4 `failures.spec.ts`).
6. The `#/lab` diagnostics screen (§7) with a pluggable crop-renderer hook for the engines, and
   "Run each engine on 10 frames".
7. A `crashWorker` test hook for `failures.spec.ts` (010).
8. `tests/e2e/make-landmark-fixture.spec.ts`, and the committed `tests/fixtures/landmarks/face-01.json`
   (478 points, blendshapes, matrix, frame size) plus the same frame's pixels as
   `face-01.rgba.gz` for the parity tests of 006 and 007 (§10.3).
9. `tests/e2e/vision.spec.ts` (§10.4) and the unit tests of §10.1 WP4.

## Do not implement

- engine features or inference (005–007), calibration screens (008), setup screens (009);
- a change to `protocol.ts`, `engines/types.ts`, `constants.ts` or `package.json`.

## Acceptance criteria

The task is complete when:
- `vision.spec.ts` passes on both hosts: `ready`, `wasmVariant='module'` (worker) or `'simd'`
  (`?host=inline`), a face within 15 s, a finite `FaceObservation`, the delegate recorded, and
  the `.wasm.gz` responses typed `application/wasm` with gzip;
- the landmark fixture is committed;
- the §10.1 WP4 units pass;
- the stub engines report `not implemented` without breaking the frame loop;
- `npm run check` and `npm run test:e2e -- smoke vision` pass.

## Checks

`npm run check`; `npm run test:e2e -- smoke vision`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
