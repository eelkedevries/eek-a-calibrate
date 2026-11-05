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
  repository; see "Integration and deploy" below.

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

## Calibration, fitting and validation (after prompt 008)

- **Protocol (`src/core/protocol/`, DOM-free):** `layouts.ts` (CAL13/CAL9/HEAD5/RECAL5 sharing
  `loc-<k>` groups, seeded jittered VAL12, VAL6, `nearestCalibrationGroup` measured on the
  screen), `schedule.ts` (`calibrationSchedule`/`validationSchedule`; each kind draws from
  `mulberry32(seed ^ salt)`; durations ÷ speed; `minAcceptedFrames`), `pursuit.ts` (path, peak
  angular speed, `pursuitPeriodMs`), `gating.ts` (`gateFrame` with its precedence,
  `HeadSpeedMeter`, `applyBlinkMask`), `labelling.ts` (`Labeller` over the recording's
  presentations, open while on screen; `FrameRecorder`, used by the screens and by
  `tests/sim/pipeline.test.ts`), `lag.ts`, `headRange.ts`.
- **Fit (`src/core/calibration/`):** `fitCalibration(recs, opts)` in `fitEngine.ts` runs pruning,
  τ, every candidate (`fitCandidate`: robust refit with an explicit CV score mask), the one-SE
  choice, `stack.ts` (Combined), `select.ts` (Auto and its reason) and the head range. Core
  imports nothing outside core, so the mapper table (`MAPPERS`) and feature versions are passed
  in. `restore.ts` is the one prediction path (`mappingState` ⇄ `restoreMapping`);
  `estimator.ts` (`EstimatorSet`, `frameBaseFlags`) converts with `FitResult.fitGeometry` (pixels
  fixed) and reports degrees under the current geometry (§14.1.3).
- **Fit worker (`src/fit/`):** `fitRecording` (worker, inline fallback, and in Node),
  `restoreEstimators`, `restoreEstimatorSet` (for the drift offset), `scoreRecording` (both modes,
  with the receive-time map; re-scores under a newer geometry).
- **App:** `src/app/session.ts` holds the running capture (`ensureCapture`, stopped on any route
  other than camera, calibrate, validate, results, live), the pending fit and the validation run.
  `components/stimulusCanvas.ts`: the stage lives on `<body>` so calibration hands a fullscreen
  stage to validation without a gesture; `BlockRunner` presents items (rAF onsets, extension,
  retry, pause by P, button, face lost > 400 ms of capture time or hidden page; abort by Esc or
  button; invalidation from `platform/presentation.ts`). Test hooks: `__eek.protocol()` and
  `__eek.simulateFullscreenExit()`. Results re-score the stored validation on every visit.

## Setup, live and data screens (after prompt 009)

- **Flow (§14.1.1):** Welcome → Camera → Calibrate → Validate → Results → Live → Data. `#/screen`
  → `#/distance` is one optional action (`?from=` names the screen to return to) on Welcome
  (Advanced), Results and Data. Measuring after calibration only changes `state.geometry` (scale,
  distance model, D_ref rescaled by f_new/f_fit) and re-scores the current validation at once
  (`screen.ts` `rescoreValidation`); the camera keeps running through `#/screen` and `#/distance`.
  `router.ts`'s `FLOW` lists this order (only the unused WP1 placeholder reads it).
- **Camera (`screens/camera.ts`):** meters (`components/qualityMeter.ts`, `HoldGate` latches after
  2 s green; "Continue anyway" after 20 s), picker (`session.setPreferredCamera`), eyewear,
  probe and `decideRunSet` (rule applied for Auto only; a hand-picked list is reported, not cut).
  `setupRecord()`/`snapshotCapture()` keep camera, host, probe and eyewear for session.json.
- **Persistence (`platform/storage.ts`):** IndexedDB `eek-a-calibrate` v1 (`geometry`, `profiles`,
  `sessions`); reads never create the database; failed writes fall back to memory with a
  published warning; LRU of 8 profiles; `deleteAllStoredData` is the registered delete-all
  handler (imported by `main.ts`). Profiles store the fit without `oofDeg`/`rowFrameIndex`, the
  key parts and the camera label: the fake camera (and some browsers) change device ids on
  reload, so a profile also matches by camera name and frame size; VAL6 decides.
- **Drift (`core/calibration/drift.ts`):** drift and RECAL5 schedules (nth stream seeds), `driftOffset`
  (o = mean(Ḡ − T) from `scoreValidation`), `driftDecision` (the correction added to θ is −o),
  `nextDriftDueMs`, `forcedDriftReasons`.
- **Live (`screens/live.ts`):** the stage of `stimulusCanvas.ts` with a toolbar; checks reuse
  `BlockRunner`, `FrameRecorder`, `CaptureLink` and `runSchedule`. Session blocks (live, drift,
  recalibration, validation-n), the drift log and per-estimator corrections live in module
  records keyed by the fit lineage (`sessionRecords()`); a new calibration starts them afresh.
  The profile is saved when Live opens after a validated fit. `restoreProfile` → Live requires
  VAL6 ≥ acceptable, then a forced drift check. Test hooks: `__eek.live()`, `__eek.camera()`.
- **Export (`screens/data.ts`, `buildSessionExport`):** assembled file by file (not `buildExport`)
  so geometry.yaml or events.csv can be left out and named in README.txt (§15.2.2); adds
  `markers.csv`; recomputes samples per block with that block's fit, corrections and the current
  geometry (D_t rescaled by focal ratio); live `gaze_*_filt` from the same One Euro stream.

## Integration and deploy (after prompt 010)

- **Live:** <https://eelkedevries.com/eek-a-calibrate/>. eelkedevries.com commit `c64030f` added
  `.github/workflows/deploy-eek-a-calibrate.yml` (builds this repository's `main`, rsyncs `dist/`
  into `/eek-a-calibrate/`), the protect line in its `scripts/deploy.sh` and a README sentence;
  run 1 of the workflow succeeded on 1 November 2026. A push here does not deploy: start the
  workflow (`npm run deploy`, *Run workflow*, or the GitHub API; `docs/deployment.md`).
- **End-to-end suite:** `failures.spec.ts` (camera permission denied, in its own new-headless
  Chromium with the permission denied over CDP, because `--use-fake-ui-for-media-stream` grants
  the camera regardless; fullscreen exit through `__eek.simulateFullscreenExit()` in calibration
  and validation; a tampered Peekr model through `context.route`, which also reaches the worker;
  `__eek.crashWorker()` in the lab and mid-calibration) and `mobile.spec.ts` (390 × 844,
  `isMobile`, `hasTouch`, the portrait fake camera, safe-area insets set with CDP
  `Emulation.setSafeAreaInsetsOverride`; the default flow by taps; turning the phone in Live and
  in a block). A `test.use({ launchOptions })` forces its own worker, so the mobile spec runs in
  its own browser. `tests/e2e/global-setup.ts` builds both fake videos. Besides the scheduled
  positions, `mobile.spec.ts` reads the targets as drawn on the stage canvas and matches each to
  `layoutToPx` with the measured insets (a check without the insets fails).
- **Narrow phones:** Diagnostics and About no longer scroll sideways at 320–390 CSS px (their
  definition lists use `minmax(0, …)` tracks; a long camera name in the lab's picker is cut off
  with an ellipsis; wide lab tables scroll inside their panel).
- **Iris capture:** at least 2 s, continued until 10 open-eye frames or 6 s, so that a slow phone
  can finish; the copy says "a little longer on a slow device".
- **Test hooks:** `__eek.crashWorker()` is registered by `session.ts` as well as by the lab, so it
  works wherever a capture runs.
- **Probe limit:** `MessageHost.probe` gives up after 10 s plus, per frame still to come, the
  longer of 1 s and twice the latest submit-to-result time, re-armed on every result
  (`probeTimeoutMs`), so the CPU BlazeGaze path finishes.
- **Copy:** `invalidationText` (calibration) names the calibration; `invalidationReason` gives
  the cause alone (`invalid.*` strings) for validation and Live.
- **Manual checks still owed:** `docs-dev/manual-verification.md` (real cameras, phones, glasses,
  lighting, distances, a low-end laptop, BlazeGaze on WebGL). No accuracy figure is published
  until it has been done.

## Final-review fixes (specification v0.4 §16.2)

- **Slow devices (§16.2.1):** data loss is counted against the frames the device could analyse
  (the median processed rate over targets, capped at the camera's), RMS-S2S pairs follow the
  interval between processed frames, and the pursuit-lag rule counts processed frames only, so a
  host slower than its camera lowers the effective rate, not the verdict. BCEA needs ≥ 3 samples.
- **Recalibration (§16.2.2):** a quick recalibration clears the validation run; Results asks for
  the VAL6 revalidation instead of re-scoring the old run.
- **Main-thread loading (§16.2.3, §16.2.4):** the frame clock makes no bitmap while the host is
  busy; engine specs live in `src/engines/<id>/spec.ts` and `src/engines/specs.ts`, so Welcome,
  About, the export and `fitRecording` load no engine code.

## Real-device findings (specification v0.4 §16.1)

- **Implausible landmarks:** `core/face/plausibility.ts` discards a corrupt landmarker result
  (non-finite or out-of-range coordinates, a degenerate box or a broken transformation matrix);
  3 consecutive or 5 cumulative ones on the GPU delegate rebuild the landmarker on the CPU
  delegate. Phones and tablets, and `?e2e=1`, default to the CPU delegate; `?delegate=` overrides.

## The game-first interface (specification v0.5 §17; prompts 013–018)

- **Decision (4 November 2026):** the interface becomes the game "Pop with your eyes":
  Title → Get ready → warm-up levels (the calibration protocol, unchanged) → Warm-up complete
  (stars and rectangular zones from the Test round) → Free look → Challenge. Routes `#/`,
  `#/ready`, `#/warmup`, `#/complete`, `#/look`, `#/challenge`; expert material in one Details
  sheet (`#/details/<tab>`). No screen ever scrolls (checked at 360×640, 390×844, 844×390,
  1280×650 and 1440×900).
- **Canon:** `interface-design-v2/design-spec.md` and its boards are binding for look and
  behaviour where §17 does not say otherwise. §17 also overrides §14.2.10 (device motion is read
  for the phone tilt check) and adds `phase: 'game'`, `game.csv`, the tilt covariates and
  IndexedDB v2.
- **Contracts (additive, §17.11):** `Phase` gains `'game'`; `RecordedFrame.deviceTiltDeg` and
  `.deviceRollDeg`; `createVisionHost(cfg, prefer?, hooks?)` registers the progress listener
  before init.
- **Status:** the shell and routes (013), the Title and Get ready (014), the warm-up levels and
  Warm-up complete (015) and the Details sheet (017) are built; Free look and the challenge follow
  (016). The legacy screens (Welcome, Camera, Calibrate, Validate, Results, Live, Data, About)
  stay until 018; until 016, Warm-up complete's "Try your zones" and "Play anyway" open the
  legacy `#/live`.

## Title, Get ready and the position guard (after prompt 014)

- **Start-up (`app/session.ts`):** the Title calls `prestartVision()`, which starts the vision host
  without the camera; `createVisionHost(cfg, prefer, hooks)` registers `hooks.onProgress` before
  `init` (worker, inline and the inline fallback), so `loadState()`/`onLoad()` and the hook
  `__eek.loading()` see the face model's download from its first byte. `startPlay()` (the Play
  tap) opens the camera, asks for device motion on iOS, unlocks Web Audio and takes the wake lock
  until the player leaves the game; `ensureCapture` adopts that camera and the started host.
  `currentSetup()`, `setWarmupMode('restore')` (Skip warm-up), `setReadyHome()`/`readyHome()` and
  `gameRecord()` (set-up and motion permission, in `session.json`) live there too.
- **Position guard (`src/core/position/`, DOM-free):** `signals.ts` (the smoothed signals and the
  face's outline), `thresholds.ts` (per-class ranges, hysteresis, timing, all heuristic),
  `cues.ts` (conditions in the priority order of design §3.4, the status row, copy keys and
  directional cues), `home.ts` (home, deviations, grades, the overlay headline and nudges),
  `guard.ts` (`ReadyGuard` for Get ready; `GradeGuard` and `createPositionGuard(capture, context)`
  for the screens after it), `tilt.ts` (gravity → θ and roll, steadiness).
- **Components:** `setupChooser`, `levelMap`, `faceGuide` (the preview layout and SVG),
  `cueCard`, `statusRow`, `holdRing`, `positionGlyph`, `pauseOverlay` (and
  `attachPositionGuard`, which wires a guard to the glyph, the overlay, haptics and sound).
- **Platform:** `motion.ts` (device motion, the orientation fallback, the permission state, the
  reading log) and `feedback.ts` (vibration, Web Audio tones, local en-GB speech).
- **Tilt covariates:** `FrameRecorder` stamps `deviceTiltDeg`/`deviceRollDeg` from the lookup set
  by `setTiltLookup` (the motion source on phones); `samples.csv` ends with `device_tilt_deg`,
  `device_roll_deg`.
- **Test hooks and fixtures:** `__eek.guard()` and `__eek.forceGuard(name)`; fixtures
  `title-skip`, `title-blocked`, `title-unsupported`, `ready-<loading|searching|adjust|holding|
  ready|anyway>`, `guard-overlay`, `guard-overlay-late`.

## The warm-up levels and Warm-up complete (after prompt 015)

- **Presentation span (`app/game/gameState.ts`):** Get ready's "Start warm-up" calls
  `startSpan(.app)` inside its tap: the game shell itself is the fullscreen (or viewport-mode)
  element, so the warm-up, Warm-up complete and, from 016, Free look and the challenge render
  inside it. `span()`, `releaseSpan()` (an invalidated span, fullscreen kept), `endSpan()`;
  leaving the span's routes ends it. gameState also holds the warm-up mode (`full`, `restore`,
  `quick-warmup`), the quick recalibrations, and each `WarmupResult` (`warmupResult()`,
  `warmupHistory()`, with the levels' pauses for 016's export).
- **Core (`src/core/warmup/`, `src/core/game/zones.ts`, DOM-free):** `levels.ts` (`warmupPlan`:
  the level sets over the unchanged `calibrationSchedule`, `validationSchedule` and
  `recalibrationSchedule`; `withoutItems` for a skipped pursuit), `bubble.ts` (`bubbleRadius`,
  `bubbleDiameterPx`, the pop), `steadiness.ts`, `cause.ts`, `marks.ts` (Ḡ per Test-round target
  and hit/miss), `stars.ts` (stars, outcome); `zoneGrid` chooses columns and rows separately with
  `halfCellDegAxis` (added to `metrics/aoi.ts`; `aoiGrid` unchanged).
- **Orchestration (`app/game/warmupRunner.ts`):** `CaptureLink`, `sessionGeometry`,
  `finishCalibration`, `applyTestRound` and `chosenEstimator` moved here from the v1 calibrate and
  validate screens (which call them, and re-export them for Live, until 018); `WarmupSession`
  runs one warm-up (geometry measured at the start of Level 1, the recorders, level frames, the
  refit of a quick warm-up); `warmupResultFrom` turns the scored Test round into zones, stars,
  marks and the cause for the selected estimator in mode `own`.
- **Stage (`components/stimulusCanvas.ts`):** `new StimulusStage({ game: true })` embeds the
  stage in the shell; `RunContext.game` (`GameHooks`) draws the bubble, firefly and head arcs
  (`components/{bubble,firefly,headArcs}.ts`; `?target=ring` keeps the §4.7 ring), pops between
  items, reports progress to the pip line and waits out pauses through the screen (`paused`,
  `resumed`); `resume(reason)` never ends another reason's pause. The v1 path is unchanged.
- **Screens:** `screens/warmup.ts` (level cards, HUD, the guard in context `warmup` /
  `warmup-head`, Pause card, three-pause card, screen-changed card, Checking your aim…) and
  `screens/complete.ts` (zone map, stars, outcome copy and actions; an actions fit guard), styled
  by `screens/game.css`. Test hooks `__eek.warmup()` and `__eek.result()`; fixtures
  `warmup-<card|card-2|pop|follow|turn|checking|pause|changed|rotated|fix>` and
  `complete-<great|good|rough|rough-two|failed|restore|quick>`.

## The Details sheet (after prompt 017)

- **Tabs:** `src/app/details/{results,settings,data,device,about}.ts` register their pages with
  `registerDetailsTab`; `shell/detailsSheet.ts` loads each tab's module the first time it is shown.
  A page is a `section.sheet-page` whose children are blocks (`details/page.ts`); a page taller
  than the panel is cut between blocks (`splitBlocks` in `shell/pager.ts`; a plain-text paragraph
  is first cut between words), its title repeated, pieces named `<id>~2`. `__eek.sheet()` reports
  `pageIds` and `overflow`. `openDetails({ tab, page })`, `openHowWeJudge()` (page `judge`) and
  `#/details/<tab>?page=<id>` open a page; `ctx.whileShown`/`ctx.every` run live parts (Device
  readings) only while their page is shown.
- **Extracted code:** the export (`buildSessionExport`, `storeSessionSummary`) lives in
  `details/data.ts`, the Results computations (`estimatorRows`, `bestCandidates`, …) in
  `details/results.ts`, the engine sizes in `details/settings.ts`, Methods' sections in
  `screens/methods.ts`; the v1 Results, Data, About and Welcome screens call them until 018.
- **Preferences:** `state.prefs` (`Prefs`: warm-up length, engines, glasses, sound, speech,
  Limited head movement, theme, camera, Expert mode, set-up choice) via `setPrefs`, stored in
  IndexedDB v2 `prefs` (storage.ts registers the store with `setPrefsStore`); `main.ts` loads them
  before the router starts (a late answer still applies unless a setting changed meanwhile). The
  warm-up length, engines, sound, speech and set-up choice are mirrored into `Settings` (`preset`,
  `engines`, `sound`, `speech`, `setup`, which 014's screens read); the address wins for each it
  names, and for `theme`. The Title's set-up chooser stores its choice, and its map and meta line
  follow the warm-up length. A camera chosen in Settings is used from the camera's next start
  (`preferStoredCamera` makes it Play's choice once listed); a running camera is never taken from
  the screen beneath. Delete all resets them. `state.challenge` takes the challenge's per-zone
  statistics (016).
- **Storage v2:** `prefs` and `scores` stores (`upgradePlan` adds what is missing); best scores per
  zone set with `recordScore`/`bestScore`/`listScores` (`scoreKey(cols, rows)`).
- **Tool pages:** `#/screen`, `#/distance` and `#/lab` are framed game routes (`toolFrame` in
  `screens/screen.ts`, `pages.css`); `from=details` returns to the screen Details was opened over
  (`detailsReturnHash`). The card match lies at true size in the stage (across, upright, or upright
  and cut, matching the card's width). The lab's cards page in the stage (`Section` select).

## In progress

v1 (prompts 001–011) is complete, with the final-review fixes of specification §16.2. Next:
prompts 013–018 (the game-first interface), in order; then the owner's manual checks, including
the pilot of the bubble target against the ring (§17.12); phase-2 items (specification §13) only
by new prompts.
