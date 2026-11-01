# Task: Optional geometry and smartphone platform support (v0.2)

## Goal

Make screen size and viewing distance optional at the platform level, and give the app the
platform pieces it needs to run on smartphone and tablet cameras, before the calibration
screens (008) are built on top of them.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Although numbered 011, it runs **after 007 and before 008** (specification §14.4).

## Owns

`src/core/types.ts` and `src/core/constants.ts` (the additive §14.3 changes only),
`src/platform/camera.ts`, `src/platform/capabilities.ts`, `src/platform/presentation.ts` (new),
`src/core/geometry/{distance,screen}.ts`, `index.html` (viewport meta only),
`scripts/make-fake-video.sh`, `tests/unit/platform-*.test.ts`, `tests/unit/geometry-*.test.ts`,
and a portrait-video audit of `src/vision/*` and `src/core/face/*` (fixes only where landscape
was assumed).

## Context

`specification.md` v0.2: §14 (binding; overrides earlier sections), §4.1 (camera, pauses), §4.4
(screen scale and distance), §4.5 (coordinates), §4.7 (presentation), §6 (contracts), Appendix A.

## Deliverables (required changes)

1. §14.3: add `ScreenGeometry.insets`, `ScreenGeometry.presentationMode`,
   `FitResult.fitGeometry`, `CAMERA_LADDER_MOBILE` and `MOBILE`, all additive; existing code
   must compile unchanged.
2. §14.2.1–2: the device-class function (pure decision function plus a DOM wrapper in
   `capabilities.ts`); the mobile camera ladder in `camera.ts` (keep the decision pure and
   unit-tested); treat a change of delivered track settings as a camera change (an event the
   screens can subscribe to).
3. §14.1.2: the assumed focal length uses the long side of the delivered video
   (`focalFromAssumedFov`); update its callers and tests.
4. Portrait audit: check `src/vision/*`, `src/core/face/*` and the engines' preprocessing for
   any assumption that `videoW >= videoH`, and fix genuine defects only (list them in the
   report, each with file:line).
5. `src/platform/presentation.ts` (§14.2.3–6): one API for blocks, for example
   `startPresentation(el, opts) → { mode, geometry(), onInvalidate(cb), end() }`, choosing
   element fullscreen or viewport mode; the viewport-mode tolerance rule as a pure function
   (`MOBILE.viewportToleranceFrac`); orientation detection and invalidation;
   `screen.orientation.lock` where supported; the wake lock with re-acquisition on visibility;
   safe-rectangle measurement through a probe element with `env(safe-area-inset-*)`; and the
   pure `layoutToPx(xNorm, yNorm, geometry)` (and its inverse) mapping normalised layout
   coordinates into the safe rectangle. The e2e skip-fullscreen hook keeps working.
6. `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
7. `scripts/make-fake-video.sh --portrait` producing a 480×640 video from the same fixture face.
8. Unit tests: device class, mobile ladder, long-side focal length, tolerance rule,
   `layoutToPx` and its inverse with and without insets.

## Do not implement

- calibration, validation or results screens (008); setup, live or data screens (009);
- any change to the frozen contracts beyond §14.3, or to `package.json`.

## Acceptance criteria

The task is complete when:
- the §14.3 additions are present and `npm run check` passes;
- the new unit tests pass;
- `npm run test:e2e -- smoke vision` still passes;
- `make-fake-video.sh --portrait` produces a 480×640 video;
- the report lists every portrait-audit finding and fix.

## Checks

`npm run check`; `npm run test:e2e -- smoke vision`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
