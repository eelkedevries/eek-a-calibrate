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
  ONNX Runtime arrives through Vite `?url` imports in `src/engines/runtimes/ort.ts`. Models are
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

## In progress

Prompts 002–007 can run in parallel; then 008, 009 and 010 (`docs-dev/plan.md`).
