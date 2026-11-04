# eek-a-calibrate: plan for v1

**Agreed:** 1 November 2026 · **Specification:** v0.1 · **Updated:** 4 November 2026 for v0.5
(the game-first interface; see "v0.5: the game-first interface" below)

The binding detail is in
[`reference/primary_authoritative/specification.md`](reference/primary_authoritative/specification.md).
This file repeats its work breakdown (§11) as the prompt sequence. The prompt files themselves
are in [`agent/prompts/`](agent/prompts/).

## Prompt sequence

| Prompt | Work package | Runs |
|---|---|---|
| `001_scaffold_and_contracts.md` | WP1: build, contracts, assets, checks, app shell | first, alone |
| `002_core_maths.md` | WP2: ridge, grouped LOO, robust fitting, PCA, stacking, filters | in parallel after 001 |
| `003_geometry_metrics_export.md` | WP3: geometry, angles, validation metrics, events, export | in parallel after 001 |
| `004_capture_and_vision.md` | WP4: camera, frame clock, vision worker and inline host, face front end, lab | in parallel after 001 |
| `005_geometric_and_eyepixel_engines.md` | WP5: geometric and eye-pixel engines, face simulator | in parallel after 001 |
| `006_blazegaze_engine.md` | WP6: BlazeGaze engine | in parallel after 001 |
| `007_peekr_engine.md` | WP7: Peekr engine | in parallel after 001 |
| `008_calibration_fit_validation.md` | WP8: protocol, fitting, selection, validation, results | after 002–005 (uses 006/007 if present) |
| `009_setup_live_data_screens.md` | WP9: setup, live, data and about screens; drift; persistence; docs | after 008 (setup screens may start after 004) |
| `010_integration_and_deploy.md` | WP10: integration, failure tests, deploy, manual checklist | last |
| `011_optional_geometry_and_mobile_platform.md` | v0.2: optional screen size and distance; smartphone platform support (specification §14) | after 007, **before 008** |

Parallel prompts run in separate git worktrees (each with its own `E2E_PORT`), commit to `main`
and run `git pull --rebase` before pushing.

## v0.5: the game-first interface (specification §17)

The owner asked for the whole tool to be a game ("Pop with your eyes"), with calibration as its
warm-up levels, no scrollbar on any screen, continuous position signals and a clean eek-a-style
look. Specification v0.5 §17 adopts the design in
[`reference/secondary_background/interface-design-v2/`](reference/secondary_background/interface-design-v2/)
(design-spec.md and the boards are binding for look and behaviour where §17 does not say
otherwise). The eye-tracking pipeline is reused, not rebuilt.

| Prompt | Content | Runs |
|---|---|---|
| `012_pipeline_fixes_and_spec_v05.md` | The seven final-review fixes integrated (specification §16.2); specification v0.5 §17; this plan; prompts 013–018 | first |
| `013_game_shell_and_routes.md` | Tokens and components from `shared.css`, self-hosted fonts, the no-scroll shell, the level track, the Details sheet frame, the new routes (legacy routes kept), strings per screen, the no-scroll e2e helper and spec | after 012 |
| `014_title_and_ready.md` | Title (set-up chooser, Play, permission priming, model progress), the position guard as pure `core/position/*`, device motion, Get ready, the glyph and auto-pause overlay, haptics, sound, speech, the host progress hook and tilt covariates | after 013 |
| `015_warmup_levels_and_complete.md` | The warm-up levels over the existing protocol (level cards, bubble, firefly, arcs, Test round, HUD, pauses), "Checking your aim…", Warm-up complete (zones, stars, marks, cause) | after 014 |
| `016_free_look_and_challenge.md` | Free look, Re-aim and Quick warm-up over the drift and recalibration logic, the challenge as pure `core/game/*` and its screens, `phase: 'game'` export | after 015 |
| `017_details_sheet.md` | The Details tabs (Results, Settings, Data, Device, About) from the existing logic, the Methods page, the restyled measurement and diagnostics pages, IndexedDB v2 | after 016 |
| `018_integration_and_polish.md` | Legacy routes removed and redirected, every e2e spec on the new interface, visual and accessibility passes, docs, manual checklist, deploy | last |

They run one after another: each needs the screens and components of the one before. 013–017
leave the legacy screens working, so the app stays usable at every step; 018 removes them.

Some parallel prompts use files owned by another: 003 imports statistics and the Wilcoxon test
from 002; 005 uses the landmark sets of 004; 006 and 007 use the landmark fixture, fixture frame
and lab crop-renderer hook of 004. With two prompts at a time, the order **(002, 004) → (003,
005) → (006, 007)** satisfies all of these.

## Work breakdown (specification §11)

**Common rules for every work package.**

- Each WP is one prompt file `docs-dev/agent/prompts/0NN_<name>.md`. WP1 creates all ten from
  this section, so numbering is fixed.
- One commit per WP, to **`main`**, with the **exact prompt filename** as the message. Run
  `git pull --rebase` before pushing; never force-push.
- A WP touches only the files it owns (§5). Contracts (§6), `constants.ts`, `package.json` and
  the lock file belong to WP1. Changing them requires an explicit note in the WP report and a
  spec version bump.
- `npm run check` must pass before the commit.
- Each WP ends with the house five-section report: Work done, Files changed, Scope deviations,
  Open issues, Human actions required.
- British English throughout.

**Dependency graph.**

```
WP1 ─┬─> WP2 ─┐
     ├─> WP3 ─┤
     ├─> WP4 ─┼─> WP8 ─> WP9 ─> WP10
     ├─> WP5 ─┤      (WP9 setup screens may start once WP4 has landed)
     ├─> WP6 ─┤
     └─> WP7 ─┘
```

### WP1 — `001_scaffold_and_contracts.md` (sequential, first)

**Goal.** A buildable, deployable shell, with every contract, dependency, asset and check in
place.

**Deliverables.**

- House files: AGENTS.md (eek-a-look's, with project conventions: British English; commit and
  push to `main`; verify `npm run check`; tests per §10; base `/eek-a-calibrate/`; hosting via
  `deploy-eek-a-calibrate.yml`; a push does not deploy), CLAUDE.md, README.md.
- docs-dev skeleton, with this spec as `specification.md` v0.1, `plan.md` (= §11) and
  `current_state.md`.
- `package.json` with **all** dependencies pinned (§3.1), and the lock file.
- tsconfig, vite.config, index.html (canonical link), `.htaccess`, `config/headers.mjs`.
- `assets-manifest.json`, the committed models (§3.1) with LICENSE and PROVENANCE.
- Every script in §5.
- CI workflow; Playwright config; the fixture face and `make-fake-video.sh`.
- `src/core/types.ts`, `src/core/constants.ts`, `src/engines/types.ts`,
  `src/vision/protocol.ts`, `src/engines/registry.ts` (dynamic loaders pointing at stub
  `index.ts` files that return `probe → {ok:false, reason:'not implemented'}`) and
  `src/engines/mappers.ts` (aggregating stub `mappers.ts` that export `[]`).
- App shell: router, state, dom helper, strings, style tokens, and placeholder screens for every
  route in §7.
- `tests/e2e/smoke.spec.ts`.
- Create and push `main`.

**Acceptance criteria.**

- `npm ci && npm run check` passes.
- `dist/` contains `vendor/mediapipe-0.10.35/*` (three pairs) with `.wasm.gz`, the TF.js WASM,
  the ORT `?url` assets with `.gz`, and the models, with no `.map` files.
- `verify-assets` passes, and fails on a tampered hash (checked by hand once).
- `serve-dist` serves `.wasm.gz` as `application/wasm` + gzip, and the CSP header.
- `npm run test:e2e -- smoke` passes.
- `git log origin/main` shows the commit.

### WP2 — `002_core_maths.md` (parallel)

**Owns.** `src/core/maths/*`, `src/core/filters/*`, `tests/unit/maths-*.test.ts`,
`tests/unit/filters-*.test.ts`.

**Deliverables.** Everything in §4.8.2, §4.8.3 (generic, per-mapper-agnostic: standardise with
floors and PCA, ridge fit, grouped LOO, Huber and hard rejection, leverage) and §4.9 (simplex
solver, nested CV helper), plus One Euro, blinkHold, mulberry32, Fisher–Yates, robust stats and
Wilcoxon.

**Acceptance.** The §10.1 WP2 list passes; grouped LOO matches brute force to 1e-9; a fit of
1,500×72 with 13 groups and 10 λ takes < 300 ms in Node.

### WP3 — `003_geometry_metrics_export.md` (parallel)

**Owns.** `src/core/geometry/*`, `src/core/metrics/*`, `src/core/events/*`,
`src/core/export/*`, their tests, `tests/fixtures/eek-a-gaze/`.

**Deliverables.** §4.4 and §4.5 (formulae and `DistanceTracker`), §4.12, §4.14, §4.16.

**Acceptance.** The §10.1 WP3 list passes, including the eek-a-gaze reference at 1e-9 and
byte-identical CSV and zip output.

### WP4 — `004_capture_and_vision.md` (parallel)

**Owns.** `src/platform/{camera,frameClock,fullscreen,capabilities,assets}.ts`, `src/vision/*`
(protocol.ts excepted), `src/core/face/*`, `src/app/screens/lab.ts`, `tests/e2e/vision.spec.ts`,
`tests/e2e/make-landmark-fixture.spec.ts`, `tests/fixtures/landmarks/face-01.json`.

**Deliverables.**

- §4.1–§4.3.
- `WorkerHost` and `InlineHost` with automatic fallback.
- The `FrameImage` ROI and crop.
- Engine orchestration in the worker: load the selected `EngineModule`s, run `extract`
  sequentially per frame, isolate errors per engine, time each stage.
- The probe.
- Lab diagnostics, with a pluggable crop-renderer hook for the engines.

**Acceptance.**

- `vision.spec.ts` passes on both hosts.
- The fixture JSON is committed.
- The §10.1 WP4 units pass.
- The stub engines report `not implemented` without breaking the frame loop.

### WP5 — `005_geometric_and_eyepixel_engines.md` (parallel)

**Owns.** `src/engines/geometric/*`, `src/engines/eyepixel/*`, `tests/sim/faceSim.ts`,
`tests/sim/geometric-*.test.ts`, `tests/unit/engine-geometric*.test.ts`,
`tests/unit/engine-eyepixel*.test.ts`.

**Deliverables.**

- §4.6.1 and §4.6.4 extractors: pure functions plus an `EngineModule` wrapper.
- Mapper specs: `geo-linear`, `geo-quadratic`, `pix-ridge`, `pix-webgazer`.
- The simulation generator (§10.2).
- The mirror-pair test.

**Acceptance.** The §10.1 WP5 list and the WP5 simulation test pass; both engines return `ok`
in `#/lab` (checked through `engines.spec.ts` once WP6 and WP7 land, otherwise by a local run).

### WP6 — `006_blazegaze_engine.md` (parallel)

**Owns.** `src/engines/blazegaze/*` (including `vendor/`), `src/engines/runtimes/tfjs.ts`,
`tests/parity/blazegaze-*.test.ts`, the BlazeGaze part of `tests/e2e/engines.spec.ts`.

**Deliverables.**

- §4.6.2: vendoring with `UPSTREAM.md`, composite strip, model split, backend chain
  (`setWasmPaths` with the `.gz` URLs), progress, `resetSession`.
- Mapper specs: `prior-affine`, `prior-ridge-pose`, `emb-ridge`.
- A strip crop renderer for `#/lab`.

**Acceptance.** §10.3 WP6 (bit-identical strip; split |Δ| < 1e-5); the e2e engine returns `ok`;
no third-party request.

### WP7 — `007_peekr_engine.md` (parallel)

**Owns.** `src/engines/peekr/*`, `src/engines/runtimes/ort.ts`, `tests/parity/peekr-*.test.ts`,
`tests/reference/peekr-boxes.js`, the Peekr part of `engines.spec.ts`.

**Deliverables.**

- §4.6.3: ORT via `?url` with `.gz`, crops via `FrameImage.crop`, BGR tensors.
- Mapper specs: `prior-affine`, `prior-ridge-pose`.
- A crop renderer for `#/lab`.

**Acceptance.** §10.3 WP7 passes; the e2e engine returns `ok`; no third-party request (Peekr's
Azure URL is never referenced).

### WP8 — `008_calibration_fit_validation.md` (after WP2–WP5; uses WP6 and WP7 if present)

**Owns.** `src/core/protocol/*`, `src/core/calibration/{dataset,prune,fitEngine,stack,select,estimator,restore}.ts`,
`src/fit/*`, `src/app/screens/{calibrate,validate,results}.ts`,
`src/app/components/{stimulusCanvas,target,poseGuide,metricTable,targetPlot}.ts`,
`tests/unit/protocol-*.test.ts`, `tests/unit/calibration-*.test.ts`, `tests/sim/pipeline.test.ts`,
`tests/e2e/flow.spec.ts`.

**Deliverables.**

- §4.7–§4.10: schedules and layouts; the stimulus with rAF onsets; the recorder and labelling;
  gating; pruning; lag; dataset building; per-engine candidate fitting; stacking; selection;
  head range; estimators.
- The fit worker with progress.
- Validation scoring (calls WP3); the results screen.

**Acceptance.**

- §10.1 WP8 and §10.2 WP8 pass.
- `flow.spec.ts` passes.
- `fitMs` ≤ 15 s logged in e2e (headless figures are informational).
- The results table shows every available engine plus Combined, with the selection reason.

### WP9 — `009_setup_live_data_screens.md` (after WP8; setup screens may start after WP4)

**Owns.** `src/app/screens/{welcome,camera,screen,distance,live,data,about}.ts`,
`src/app/components/{qualityMeter,gazeDot,banner,progress,cardMatch,blindSpot}.ts`,
`src/core/calibration/drift.ts`, `src/platform/storage.ts`, `docs/{usage,methods,engines,privacy,export-format,troubleshooting}.md`,
`tests/unit/drift-*.test.ts`, `tests/e2e/live-data.spec.ts`.

**Deliverables.**

- §7 screens 0–3 and 7–9; the device probe and run-set decision.
- §4.11 Live filtering and display; §4.13 drift; §4.15 persistence; export UI over WP3.
- `docs/` pages, where every numeric claim carries a source or is labelled heuristic.

**Acceptance.** `live-data.spec.ts` passes; drift unit tests pass; About lists every engine
with licence and citation; no unsourced accuracy claims (grep review).

### WP10 — `010_integration_and_deploy.md` (last)

**Owns.** `tests/e2e/failures.spec.ts`, `docs/deployment.md` (final), `docs-dev/planning/current_state.md`,
`docs-dev/manual-verification.md`, and the eelkedevries.com changes (§9).

**Deliverables.**

- Full `npm run check:all` green; fixes for any integration defects in the owning files, with
  each fix noted.
- The eelkedevries.com commit; the dispatch; the live verification of §9.
- The manual checklist.

**Acceptance.**

- `https://eelkedevries.com/eek-a-calibrate/` returns 200 with the built `assets/index-*.js`.
- `.wasm.gz` is served as `application/wasm` with `content-encoding: gzip`.
- The CSP header is present.
- `deploy-eek-a-calibrate.yml` has a successful run.
- The main-site `scripts/deploy.sh` contains the protect line.
- The final report lists the camera checks still to be done by hand.
