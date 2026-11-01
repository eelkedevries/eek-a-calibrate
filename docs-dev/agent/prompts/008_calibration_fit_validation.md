# Task: Calibration, fitting and validation (WP8)

## Goal

The calibration protocol and stimulus, labelling and gating, per-engine fitting with
cross-validation, stacking and Auto selection, estimators, validation scoring and the results
screen.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs after 002–005 have landed; uses 006 and 007 if present.

## Owns

`src/core/protocol/{layouts,schedule,pursuit,gating,labelling,lag,headRange}.ts`,
`src/core/calibration/{dataset,prune,fitEngine,stack,select,estimator,restore}.ts`,
`src/fit/{fit.worker,fitClient}.ts`, `src/app/screens/{calibrate,validate,results}.ts`,
`src/app/components/{stimulusCanvas,target,poseGuide,metricTable,targetPlot}.ts`,
`tests/unit/protocol-*.test.ts`, `tests/unit/calibration-*.test.ts`,
`tests/sim/pipeline.test.ts`, `tests/e2e/flow.spec.ts`; its own keys in
`src/app/strings.en-GB.ts`.

## Context

`specification.md`: §4.7 (presentation, target, layouts, order, presets, fixation items,
pursuit, head motion, frame acceptance, labels, weights, CV groups), §4.8 (pruning, mapper
candidates, choice within an engine, out-of-fold predictions, pursuit lag), §4.9 (Combined
estimator and Auto selection), §4.10 (prediction-time handling, flags, head range, confidence),
§4.12 (validation protocol; `scoreValidation` from 003), §6 (`fitClient` signatures and
`FitResult`), §7 (screens 4–6), §10.1 WP8, §10.2 WP8, §10.4 (`flow.spec.ts`), Appendix A.

The fit worker imports only `core/` and `src/engines/mappers.ts`, never a runtime (§5). The app
state (`src/app/state.ts`) already has slots for the recording, fit, validation and estimator;
in test mode `window.__eek` provides injected geometry and `skipFullscreen`, and
`registerTestHook` adds hooks (010 needs one that simulates a fullscreen exit).

## Specification v0.2 amendments (binding)

Specification §14 and §15 (v0.3) override earlier sections. Apply the integration rules of §15.2.1. For this prompt:
- Run blocks through `platform/presentation.ts` (from 011): element fullscreen where available,
  viewport mode otherwise (§14.2.4); orientation changes and large viewport changes abort the
  block; small viewport changes in viewport mode are tolerated.
- Place every target, the pursuit path and the head-block locations with `layoutToPx` (safe
  rectangle, §14.2.5); label, score and export with the same function.
- Touch equivalents for every key (§14.2.7): tap to continue, corner Pause and Abort buttons.
- Geometry is optional (§14.1): store `FitResult.fitGeometry`; estimators convert with it; when
  geometry changes after calibration, re-derive degrees from pixel predictions and re-score
  validation from the stored frames; px and % of diagonal first while `degreesApproximate`.
- Calibration must work end to end with assumed geometry (no screen or distance step).

## Deliverables (required changes)

1. §4.7–§4.10: schedules and layouts (seeded `mulberry32` + Fisher–Yates, `?seed=`), the stimulus
   with rAF onsets, the recorder and labelling, gating, pruning, the pursuit lag, dataset
   building, per-engine candidate fitting with exact grouped LOO, stacking, selection with its
   reason, the head range and the estimators; `?e2e=1&speed=N` scaling.
2. The fit worker with progress; `fitRecording` and `restoreEstimators` (§6).
3. Validation scoring (calling 003) and the results screen of §7 (screen 6), with the own and
   intersection tabs, the selected estimator and reason, the target plot, the funnel, the CV
   candidates, the AOI advice and the note on optimism when switching.
4. The calibrate and validate screens (§7 screens 4–5), with pause overlays and abort on
   fullscreen exit, resize or DPR change.
5. The unit tests of §10.1 WP8, `tests/sim/pipeline.test.ts` (§10.2 WP8) and `flow.spec.ts`.

## Do not implement

- drift checks and quick recalibration (009 owns `core/calibration/drift.ts`), persistence and
  export UI (009), setup screens (009);
- click-based learning; a change to the contracts, `constants.ts` or `package.json`.

## Acceptance criteria

The task is complete when:
- §10.1 WP8 and §10.2 WP8 pass (noise-free validation mean accuracy < 0.5°; < 1.5° with
  σ = 0.5 px; `trackingGain` > 3; out-of-range poses flagged; a fixed seed gives identical
  `FitResult` JSON);
- `flow.spec.ts` passes with `?e2e=1&speed=4&preset=quick&engines=all`;
- `fitMs` ≤ 15 s is logged in e2e (headless figures are informational);
- the results table shows every available engine plus Combined, with the selection reason;
- `npm run check` passes.

## Checks

`npm run check`; `npm run test:e2e -- smoke flow`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
