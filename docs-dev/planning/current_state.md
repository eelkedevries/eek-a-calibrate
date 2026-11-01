# Current state

Living, high-level orientation for the project: what exists now, key
architectural decisions, and what is in progress. Read it at the start of a
session to orient quickly.

Update it only for genuinely useful orientation (a new system, an
architectural decision), not after routine commits. A stale or bloated state
file is worse than none.

This file records what *is* (current reality). The binding design canon is
`docs-dev/reference/primary_authoritative/`; when the two conflict, the canon
wins and the gap is work still to be done.

## Systems (after prompt 001)

- **Build:** Vite 8 + TypeScript 6, no framework, base `/eek-a-calibrate/`, hash routes.
  `npm run check` = build (`tsc --noEmit`, `vite build`, `scripts/precompress.mjs`), unit tests
  (`node --test` on the TypeScript sources), `scripts/verify-assets.mjs dist`,
  `scripts/check-public-build.sh dist`, `scripts/validate-prompts.sh`.
- **Assets:** `assets-manifest.json` lists every runtime and model file with its hash.
  `scripts/copy-assets.mjs` (predev, prebuild) copies the MediaPipe 0.10.35 WebAssembly pairs
  (module, SIMD, no-SIMD) and the TF.js WebAssembly files into `public/vendor/` (git-ignored).
  ONNX Runtime arrives through Vite `?url` imports in `src/vision/visionCore.ts`. Models are
  committed under `public/models/` with LICENSE and PROVENANCE.
- **Headers:** `public/.htaccess` (types, `.wasm.gz` as gzip-encoded WebAssembly, enforced CSP
  with `connect-src 'self'`, Permissions-Policy; COOP/COEP off). `config/headers.mjs` holds the
  same strings; `scripts/serve-dist.mjs` serves `dist/` with them for the end-to-end tests
  (`E2E_PORT`, default 4173).
- **Contracts (frozen):** `src/core/types.ts`, `src/engines/types.ts`, `src/vision/protocol.ts`
  (specification §6, verbatim) and `src/core/constants.ts` (Appendix A, verbatim).
- **Engines:** `src/engines/registry.ts` loads each engine folder's default-exported
  `EngineModule` by dynamic import; `src/engines/mappers.ts` aggregates each folder's
  `mappers` export. All four engines are stubs (`probe` → not implemented, `mappers` = []).
- **App shell:** `src/main.ts` (header, footer with "Delete all my data", live region),
  `src/app/router.ts` (hash routes, lazy screens with a default-exported `Screen`, a
  `placeholder()` for routes not yet built), `src/app/state.ts` (settings from the query string,
  session clock, result slots, delete-all hook), `src/app/strings.en-GB.ts` (flat dotted keys,
  `t()`), `src/app/testHooks.ts` (`window.__eek` with `?e2e=1`; `registerTestHook`),
  `src/app/dom.ts`, `src/app/style.css` (light/dark tokens, Okabe–Ito engine colours).
  Every route in specification §7 shows a placeholder screen.
- **Tests:** `tests/unit/contracts.test.ts`; `tests/e2e/smoke.spec.ts` (same-origin requests,
  no console errors or CSP violations, hash-route reload, production headers). The fake camera
  is built from `tests/fixtures/face/portrait.jpg` (public-domain NASA portrait) by
  `scripts/make-fake-video.sh`.
- **Core maths (002):** `src/core/maths/` holds the DOM-free numerics of specification §4.8.2–§4.9:
  Cholesky/LU/Jacobi (`linalg.ts`), weighted standardisation with floors, the seeded PCA block
  and clipping (`standardise.ts`, `pca.ts`), weighted ridge whose design already contains the
  intercept column (`withIntercept`, `unpenalised = [0]`), exact grouped LOO
  (`groupedLooResiduals`, the §6 signature, and `groupedLooPath` for a λ grid) with `cvScore`
  taking the angular error as a parameter, the robust refit (`robustRidgeFit`), simplex stacking
  (`simplex.ts`), `mulberry32`/`fisherYates`, robust statistics and `wilcoxonSignedRank`.
  `src/core/filters/` holds `OneEuroFilter2D` (degrees) and the pure `blinkHold` step.
- **Deploy:** `scripts/deploy.sh` dispatches `deploy-eek-a-calibrate.yml` in the eelkedevries.com
  repository (prompt 010 adds that workflow). Not yet deployed.

## Capture and vision (after prompt 004)

- **Face front end (`src/core/face/`, DOM-free):** `landmarkSets.ts` (indices, the interleaved
  478 × 3 landmark layout, `BLENDSHAPE_NAMES`, Peekr mirror pairs), `headPose.ts`,
  `eyeMeasures.ts`, `blink.ts` (`EyeMeasures.open` is the instantaneous rule; apply `maskBlinks`
  to a frame sequence for the ±1-frame mask), `quality.ts`.
- **Platform:** `camera.ts` (`openCamera` with the ladder and messages, hidden `source` video,
  `createPreview`, `listCameras`), `frameClock.ts` (`FrameClock` feeding a host, rVFC with the
  poll fallback; `watchPauseConditions`), `fullscreen.ts`, `capabilities.ts`
  (`detectCapabilities`, `runtimeEnv`, `defaultDelegate`), `assets.ts` (manifest URLs with the
  `.gz` copies, `plainUrl` for the one retry, `fetchAsset` that checks size and sha256).
- **Vision host:** `createVisionHost(defaultVisionConfig(...), settings.host)` returns a
  `ManagedVisionHost` (`selection` records kind and reason, `info`, `engineStatus`, `busy`,
  `onError`, `stats`). Worker and inline hosts run the same `visionCore.ts`; the worker restarts
  itself after a crash. Engines run in rank order on every frame, errors isolated, outputs copied
  and checked (finite, `featureDim`); the face arrays are transferred, so engines copy what they
  keep. The manifest reaches the runtime as a file (`?url`), never inlined into JavaScript.
  `ctx.env` also carries `forceBackend` (`?force=cpu`), which the frozen `RuntimeEnv` lacks: read
  it as `(ctx.env as EngineRuntimeEnv).forceBackend` (`platform/capabilities.ts`). The core
  resolves the ORT `?url` assets itself, so it does not depend on `engines/runtimes/ort.ts`.
- **`#/lab`:** diagnostics and "Run each engine on 10 frames" (the probe). Crop renderers are
  discovered from `src/engines/<id>/lab.ts` (default export of the `CropRenderer` shape in
  `src/app/screens/lab.ts`; DOM-free). Test hooks once `lab.ts` has loaded: `__eek.lab()`,
  `labStart`, `labRunAll`, `labCaptureFixture`, `crashWorker`.
- **Landmark fixture:** `tests/fixtures/landmarks/face-01.json` and `face-01.rgba.gz`, loaded in
  Node with `tests/fixtures/landmarks/fixture.ts`; regenerate only on purpose with
  `MAKE_LANDMARK_FIXTURE=1 npx playwright test make-landmark-fixture`.

## Geometric and eye-pixel engines (after prompt 005)

- **Geometric (`src/engines/geometric/`):** `features.ts` (pure) gives `x` of 14 values
  (`GEO_X_NAMES`: per-eye eye-in-head offsets, dc = E⁻¹e₃, blendshape gaze, openQ, gaze ray);
  pose, eye midpoint and lnDistRatio come from the `RowContext`, so `geo-linear` (24 columns)
  and `geo-quadratic` (27) assemble their rows in `mappers.ts`. |det E| < 0.2 uses the planar
  fallback with dc = (0, 0). A face that cannot give finite features makes `extract` throw with
  the reason (the vision core reports it and marks the frame `error`).
- **Eye-pixel (`src/engines/eyepixel/`):** `patches.ts` (pure): padded contour boxes,
  area-averaged BT.601 luma to 10 × 6, histogram equalisation; `x` = [L 60, R 60], row-major;
  `crop-invalid` when a box is under 4 px or leaves the ROI. `pix-ridge` (floors 2/255) and
  `pix-webgazer` (×255, unstandardised, absolute λ 1e-5); every column is primary.
- **Face simulator (`tests/sim/faceSim.ts`):** `simulateFrame(scene, head, gaze, opts)` returns
  `{ meta, face, truth }` from the canonical model (`tests/sim/data/`, Apache-2.0), the §10.2
  eyeball model, pinhole projection with seeded noise (`normalSource`), the column-major matrix,
  eyeLook* blendshapes and the screen ground truth. `headAt` and `onScreenNormalCm` place the
  head; poses are in MediaPipe's metric frame, screen geometry in the OpenCV camera frame.

## BlazeGaze engine (after prompt 006)

- **Inputs (`src/engines/blazegaze/preprocess.ts`, DOM-free):** `prepareInputs(session, …)` gives
  the strip plan, `hv`, `fo` and `faceWidthCm` (median of the first 30 open-eye frames, then
  frozen; `newSession()` restarts). The strip (`planEyeStrip`, `sampleEyeStrip`) and `faceOrigin`
  reproduce upstream's arithmetic exactly without its 512 × 512 intermediate or per-point
  matrices (about 3 ms a frame); `vendor/` holds upstream `mathUtils.ts`/`safeSVD.ts` at
  `75fbd2f`, with `obtainEyePatch` as the parity reference and every change in `UPSTREAM.md`.
- **Model (`runtime.ts`):** `loadBlazeGaze` (tf.loadLayersModel, split into `cnn_encoder` and
  `gaze_mlp`), `inferBlazeGaze` → `{ emb, prior }`. `x` = [emb 512, hv 3, fo 3]; the layout
  constants live in `mappers.ts` so the fit worker never loads the preprocessing.
- **Backends (`src/engines/runtimes/tfjs.ts`):** WebGL, then WebAssembly (`.gz` URLs, one plain
  retry), CPU only with `?force=cpu` or in Node. WebGL is set aside when it renders only half
  floats or in software (SwiftShader), so the headless tests run on `tfjs-wasm`. TF.js is
  imported only inside `create`; the model files go through `fetchAsset` (size and sha256).
- **Mappers:** `prior-affine` (λ_rel 1e-6), `prior-ridge-pose` (12), `emb-ridge` (518 raw columns,
  PCA block [0, 512) → 64, every score primary). `#/lab` shows the strip (`lab.ts`).

## Geometry, metrics, events and export (after prompt 003)

- **Geometry (`src/core/geometry/`):** `screen.ts` (card, diagonal, assumed scale; `screenKey`),
  `angles.ts` (`pxToDeg`/`degToPx` on the screen-centre normal, the exact
  `angularSeparationDeg`, and `toExportDeg`, the one place y flips to positive up),
  `distance.ts` (focal length, iris distance, `refDistanceMm`, `DistanceTracker`: running 1000 ms
  median over open-eye frames), `blindSpot.ts` (`assessBlindSpot`). Reproduces eek-a-gaze's
  `tests/fixtures/eek-a-gaze/geometry_reference.csv` to 1e-9°.
- **Metrics (`src/core/metrics/`):** `scoreValidation` (the §6 signature plus an optional
  `{ receivedMs }` map, because `RecordedFrame` has no receive time; latency is NaN without it).
  Per-sample target angles use that frame's distance. `dataLossPct` and `accuracyPctDiag` are
  percentages. `funnel.ts`, `aoi.ts`, `compare.ts` (paired differences, Wilcoxon, the
  single-session caveat with its source).
- **Events (`src/core/events/idt.ts`):** `detectEvents(samples, geometry, sd2dDeg)` and
  `idtSd2dDeg(validationRecording, samples)` for θ_D.
- **Export (`src/core/export/`):** `buildExport(input)` returns every file and the zip;
  `canonicalJson` sorts keys so state built in any order gives identical bytes; the zip has
  fixed entry order, deflate level and DOS time. cv.csv and events.csv are written by
  `validationCsv.ts`. targets.csv adds `trial` and `aborted` columns.

## Peekr engine (after prompt 007)

- **Preprocessing (`src/engines/peekr/preprocess.ts`, pure):** the bundle's `B`/`C` boxes on
  mirrored landmarks m(L) = (1 − x, y) of the tasks-vision points 359, 257, 463, 253 (input1, the
  subject's left eye) and 243, 27, 130, 23 (input2), `kps` (8, mirrored frame), crop rectangles
  at sx = W − x − w in the unmirrored frame (drawn by `FrameImage.crop`), and the BGR tensor.
  Bit-identical to the real bundle's `E`/`F`. `crop-invalid` when a box is under 4 px or does not
  lie wholly inside the frame; non-finite landmarks throw.
- **Runtime:** `src/engines/runtimes/ort.ts` imports `onnxruntime-web/wasm` (only the Peekr
  chunk carries it) and holds no `?url` imports any more: the URLs come from
  `ctx.assetUrl('ort-wasm' | 'ort-mjs')`, i.e. the vision core's `?url` imports, `.gz` in
  production. ONNX Runtime remembers a failed WebAssembly start for the life of the realm, so
  `initOrt` fetches the binary itself, checks it against the manifest hash (one retry with the
  plain file after a bad `.gz`), and passes it as `env.wasm.wasmBinary` with `wasmPaths` set.
  One thread unless cross-origin isolated. `peekr/runtime.ts` checks the model's interface and
  disposes every tensor. Both run in Node for the parity tests.
- **Mappers:** `prior-affine` (λ_rel 1e-6) and `prior-ridge-pose` (17 columns, raw prior² and
  x·y). **Lab:** `src/engines/peekr/lab.ts` shows the two crops.
- **Tests:** `tests/parity/peekr-{boxes,tensor,session}.test.ts` against
  `tests/reference/peekr-boxes.js` (bundle code with its MIT notice); the Peekr block of
  `tests/e2e/engines.spec.ts`.

## Optional geometry and mobile platform (after prompt 011, specification v0.2 §14)

- **Contracts (additive, §14.3):** `ScreenGeometry.insets` and `.presentationMode`,
  `FitResult.fitGeometry`; `CAMERA_LADDER_MOBILE` and `MOBILE` in `constants.ts`.
- **Assumed geometry:** `focalFromAssumedFov(videoW, videoH)` applies the 60° field of view to
  the long side of the delivered video, so portrait frames give the landscape focal length.
  `screenKey` puts the long side first, so a measured scale survives rotation.
- **Safe rectangle:** `layoutToPx` / `pxToLayout` / `safeRect` live in
  `core/geometry/screen.ts` (core code may use them) and are re-exported by
  `platform/presentation.ts`. Without insets `layoutToPx` is exactly (xNorm·W, yNorm·H).
- **Device class:** `isMobileDevice` (pure) and `detectDeviceClass()` in `capabilities.ts`;
  `openCamera` walks the mobile ladder on mobile (`CameraInfo.ladder`).
  `CameraSession.onChange` reports a change of the delivered frame size or frame rate
  (`settingsChange`, pure), to be treated as a camera change.
- **Presentation (`platform/presentation.ts`):** `startPresentation(stage, { mode, scale })` from
  the block's user gesture gives `{ mode, geometry(), onInvalidate, onTolerated, check(), end() }`:
  element fullscreen (orientation locked where allowed) or viewport mode (a fixed stage sized
  to the visual viewport, changes within `MOBILE.viewportToleranceFrac` tolerated); invalidation
  reasons `fullscreen-exit`, `orientation` (including a 180° turn), `dpr`, `zoom`, `resize`
  (call `check()` once per stimulus frame: some pixel-ratio changes fire no event). It
  holds the wake lock (`holdWakeLock`, also usable alone) and measures the safe-area insets.
  With `?e2e=1` mode `auto` is viewport mode; `mode: 'fullscreen'` keeps fullscreen testable.
  `watchOrientation` serves Live.
- **Portrait audit:** `ear4` normalises portrait frames as the same camera held landscape, so the
  open-eye rule keeps its landscape thresholds. BlazeGaze's and Peekr's preprocessing are
  upstream's and stay unchanged (§4.6); on the portrait video all four engines are `ok`.
  `scripts/make-fake-video.sh --portrait` writes
  `tests/fixtures/generated/face-portrait.mjpeg` (480×640). Under the mobile ladder Chromium's
  fake capture crops that file to 480×540 (still portrait).

## In progress

Prompts 002–007 can run in parallel; then 008, 009 and 010 (`docs-dev/plan.md`).
