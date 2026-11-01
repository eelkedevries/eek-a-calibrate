# Task: Setup, live and data screens (WP9)

## Goal

The welcome, camera, screen-size and distance screens, live gaze with filtering and drift
correction, persistence, export, the About page and the user documentation.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs after 008; the setup screens (0–3) may start once 004 has landed.

## Owns

`src/app/screens/{welcome,camera,screen,distance,live,data,about}.ts`,
`src/app/components/{qualityMeter,gazeDot,banner,progress,cardMatch,blindSpot}.ts`,
`src/core/calibration/drift.ts`, `src/platform/storage.ts`,
`docs/{usage,methods,engines,privacy,export-format,troubleshooting}.md`,
`tests/unit/drift-*.test.ts`, `tests/e2e/live-data.spec.ts`; its own keys in
`src/app/strings.en-GB.ts`.

## Context

`specification.md`: §4.4 (card match, diagonal, blind spot, iris focal length), §4.11 (One Euro
and blink hold for display), §4.13 (drift and recalibration), §4.15 (persistence, profile key,
restore rules, delete all), §4.16 (export), §7 (screens 0–3 and 7–9, query parameters, first-run
flow, device probe and run set), §10.4 (`live-data.spec.ts`), Appendix A (`SETUP`, `PROBE`,
`DRIFT`), Appendix B (the only sources for numbers in copy).

The footer's "Delete all my data" button calls the handler registered with
`setDeleteAllHandler` (`src/app/state.ts`); `storage.ts` registers the real one.

## Specification v0.2 amendments (binding)

Specification §14 and §15 (v0.3) override earlier sections. Apply the integration rules of §15.2.2. For this prompt:
- The default flow is Welcome → Camera → Calibrate → Validate → Results → Live → Data (§14.1.1).
  `#/screen` and `#/distance` stay available but only as the optional action "Measure screen and
  distance (optional; makes degree values exact)" on Welcome (Advanced), Results and Data;
  nothing waits for them.
- Camera-screen meters show the distance band only when distance was measured (§14.1.5).
- Mobile (§14.2): device class, mobile instructions (§14.2.8), touch equivalents for every key
  (§14.2.7, including the blind-spot test), the wake lock during camera setup and Live
  (§14.2.6), orientation handling in Live (§14.2.3), the mobile warning threshold (§14.2.9),
  and px / % of diagonal first while degrees are approximate (§14.1.4).
- Measuring geometry after calibration re-scores without refitting (§14.1.3); the export
  states when degree values are approximate (§14.1.6).

## Deliverables (required changes)

1. §7 screens 0–3: welcome (privacy, sourced expectations, capability check, preset, engines with
   download sizes, participant and session), camera (permission, picker, preview, heuristic live
   meters, eyewear question, background engine loading, the device probe and run-set decision),
   screen size (card match, diagonal or skip, remembered per screen), distance (blind spot, iris
   measurement or skip).
2. §7 screens 7–9: live (filtered dot with a raw toggle, per-engine dots, confidence ring,
   head-range greying, estimator switcher, AOI demo, record with markers, drift check and the
   timed prompt, quick recalibration), data (export zip over 003, stored profiles and sessions,
   restore forcing VAL6, delete all), about (methods and formulae, protocol, engines with
   licences and citations, limitations, privacy).
3. §4.11 live filtering and display; §4.13 drift (`drift.ts`); §4.15 persistence (`storage.ts`).
4. The `docs/` pages, where every numeric claim carries a source or is labelled heuristic.
5. The drift unit tests and `live-data.spec.ts`.

## Do not implement

- calibration, fitting or the results screen (008);
- any accuracy figure for this app (the manual checks of 010 come first);
- a change to the contracts, `constants.ts` or `package.json`.

## Acceptance criteria

The task is complete when:
- `live-data.spec.ts` passes: the live dot renders, the drift check runs, the export zip parses
  and validates (headers, YAML keys, `session.json` schema), and an IndexedDB profile saved,
  reloaded and restored forces VAL6;
- the drift unit tests pass;
- About lists every engine with licence and citation;
- a grep review finds no unsourced accuracy claims;
- `npm run check` passes.

## Checks

`npm run check`; `npm run test:e2e -- smoke live-data`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
