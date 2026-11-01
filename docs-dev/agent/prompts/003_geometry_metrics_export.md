# Task: Geometry, metrics, events and export (WP3)

## Goal

Exact screen and visual-angle geometry, viewing distance, validation metrics, I-DT event
detection and a byte-reproducible, eek-a-gaze-compatible export.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs in parallel with 002 and 004–007 (in its own worktree and `E2E_PORT`).

## Owns

`src/core/geometry/{screen,angles,distance,blindSpot}.ts`,
`src/core/metrics/{validation,funnel,aoi,compare}.ts`, `src/core/events/idt.ts`,
`src/core/export/{csv,samplesCsv,targetsCsv,validationCsv,geometryYaml,sessionJson,zip,readme}.ts`,
their tests (`tests/unit/geometry-*.test.ts`, `tests/unit/metrics-*.test.ts`,
`tests/unit/events-*.test.ts`, `tests/unit/export-*.test.ts`), `tests/fixtures/eek-a-gaze/`.

## Context

`specification.md`: §4.4 (card, diagonal, blind spot, focal length, per-frame distance), §4.5
(coordinates, exact angular separation, `toExportDeg`), §4.12 (metrics, funnel, baseline,
verdicts, AOI advice, own and intersection modes, paired differences), §4.14 (I-DT), §4.16
(export files and formats), §6 (`scoreValidation` signature), §10.1 WP3, Appendix A
(`DISTANCE`, `BLIND_SPOT`, `CARD_MM`, `VERDICT`, `EVENTS`).

The eek-a-gaze geometry reference is `/home/user/eek-a-gaze/tests/data/geometry_reference.csv`;
copy it into `tests/fixtures/eek-a-gaze/` with a provenance note. Statistical helpers (median,
percentiles, Wilcoxon) come from `src/core/maths/` (002): import them rather than duplicating
them, and commit after 002 has landed (`git pull --rebase`).

## Deliverables (required changes)

1. §4.4 and §4.5: the formulae, a `DistanceTracker` (running 1000 ms median of iris diameter
   over open-eye frames), and one tested `toExportDeg`.
2. §4.12: `scoreValidation` as the §6 signature, with accuracy, median error, signed offset,
   accuracy in px, gap-aware RMS-S2S, SD, BCEA₆₈, the data-loss funnel, effective rate, latency,
   constant baseline and tracking gain, % of diagonal, the heuristic verdict, AOI advice, and the
   `own` and `intersection` modes; paired per-target differences with the Wilcoxon test and the
   single-session caveat.
3. §4.14: segmentation (bridging only gaps of 75 ms or less), 3-sample median, I-DT with
   θ_D = clamp(4 × SD₂d, 1.5°, 6°), merging, saccade amplitudes, blinks and `bad_data`, with
   eek-a-gaze's event names.
4. §4.16: every export file with the stated header order, fixed decimals, `\n` line endings and
   UTF-8; `geometry.yaml` with `origin: top_left` and `units: pixels`; `README.txt` with the
   eek-a-gaze command including `--time-units ms`; the zip via fflate.
5. The unit tests of §10.1 WP3.

## Do not implement

- the export UI or persistence (009), the calibration pipeline (008);
- per-engine features, or a change to `constants.ts` or the contracts.

## Acceptance criteria

The task is complete when:
- the §10.1 WP3 list passes, including the eek-a-gaze reference at atol 1e-9, the exact-angle
  properties, RMS-S2S ≈ σ√2, BCEA against an analytic value, the funnel, baseline, AOI and
  verdict rules, event onsets and offsets within one sample with gaps over 75 ms never bridged;
- identical state gives byte-identical CSV and zip output; the header order and `time_ms` pass a
  re-implementation of eek-a-gaze's synonym rule; the zip parses;
- `npm run check` passes.

## Checks

`npm run check`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
