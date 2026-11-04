# Task: Warm-up levels and Warm-up complete (v0.5)

## Goal

Present the existing calibration and validation protocol as the game's warm-up levels (level
cards, the bubble, the firefly, the head arcs, the Test round, the stimulus HUD, pauses and the
position guard throughout), then turn the result into the Warm-up complete screen with stars,
rectangular zones, hit and missed test bubbles and one cause line.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs after 014. **The protocol, gating, labelling, fit worker, estimators and scoring
are reused unchanged**; this prompt changes their presentation.

## Owns

- `src/app/screens/{warmup,complete}.ts`, `src/app/strings/{warmup,complete}.ts`.
- `src/app/game/{gameState,warmupRunner}.ts` (new): the game's state across routes (warm-up
  mode and length, *home*, recordings, the fit and Test-round result, zones, stars) and the
  warm-up's non-UI orchestration, **extracted** from `screens/calibrate.ts` and
  `screens/validate.ts` (which then call it until 018 removes them), not copied.
- `src/app/components/{bubble,firefly,headArcs,pipLine,cornerCluster,levelCard,pauseCard,checkingCard,screenChangedCard,zoneMap,starsRow}.ts`
  (new) and `src/app/components/stimulusCanvas.ts` (the new drawing modes, the pop interval,
  guard-driven pause and resume, card auto-start, `?target=ring`), keeping the legacy screens
  working.
- `src/core/warmup/{levels,bubble,steadiness,cause,marks,stars}.ts` and
  `src/core/game/zones.ts` (new, DOM-free); a one-axis half-cell helper may be added to
  `src/core/metrics/aoi.ts` without changing `aoiGrid`.
- `tests/unit/warmup-*.test.ts`, `tests/unit/game-zones.test.ts` (new).
- `tests/e2e/flow.spec.ts`, `tests/e2e/mobile.spec.ts`, and the warm-up and Warm-up complete
  rows of `tests/e2e/no-scroll.spec.ts`.

## Context

- `specification.md` v0.5 §17.2.3–§17.2.5 (guards, fullscreen span, test parameters), §17.3,
  §17.4.4 (the Skip warm-up path), §17.5.2–§17.5.3 (guard is presentation, auto-pause), §17.6
  (warm-up levels), §17.7 (Warm-up complete); §4.7 (protocol, presets, fixation and extension,
  pursuit, head block, acceptance, labels), §4.8–§4.10 (fit), §4.12 (metrics, verdict,
  `aoiGrid`, `halfCellDeg`), §14.2.3–§14.2.7 (orientation, presentation, safe areas, wake lock,
  touch), §16.2.1, Appendix A (`FIXATION`, `VALIDATION`, `HEAD_BLOCK`, `PURSUIT`, `VERDICT`,
  `FIT_BUDGET_MS`).
- `interface-design-v2/design-spec.md`: §2.1 (map and timings), §2.2, §2.3 (track states on cards
  and Warm-up complete), §2.6–§2.11 (level cards, steadiness line, HUD, the bubble, pausing, the
  four levels, Checking, level sets), §2.12 (Warm-up complete), §2.16 (failures), §3.3, §3.7–§3.8,
  §4.3–§4.5 (stimulus layouts, camera side), §6.1 (bubble, burst, firefly, arcs, pip line, stars,
  zones, pictograms), §7 (copy and the honesty check).
- Boards: `canvas/phone-level1-pop.dc.html`, `canvas/phone-level2-follow.dc.html`,
  `canvas/desktop-level1-pop.dc.html` (a level card), `canvas/desktop-level3-turn.dc.html`,
  `canvas/phone-landscape-level1.dc.html`, `canvas/phone-level-complete.dc.html`,
  `canvas/desktop-level-complete.dc.html`, with their `png/` renderings and `briefs/`.
- Built by 014: the guard controller, `positionGlyph`, `pauseOverlay`, `feedback.ts`, *home*.

## Deliverables (required changes)

1. **Level sets** (`core/warmup/levels.ts`, §17.6.1): from the warm-up length and mode — full
   (Quick 2 levels, Standard 4, Thorough 5 with "Lean in"), `restore` (one Test round on `VAL6`,
   §17.4.4) and `quick-warmup` (016 uses it: Pop the dots on `RECAL5`, then Test round on
   `VAL6`) — the levels' names, rules, hints, pictograms and their schedules from the existing
   `calibrationSchedule`, `validationSchedule` and drift module. Unit-tested.
2. **The warm-up screen** (`#/warmup`): runs the levels in order inside the presentation started
   by Get ready (§17.2.4): level card → block (the existing `BlockRunner`, `runSchedule`,
   `CaptureLink`, `FrameRecorder`) → next card … → Test round → **Checking your aim…** (the fit
   worker's progress and the scoring, "Almost there" after 3 s) → `#/complete`. The fit, the
   validation run and the reports land in the same state the legacy screens use
   (`setPendingFit`, `setValidationRun`, `setState`), so Results and the export keep working.
   "Lean in" re-latches *home*. Guard: no presentation → `#/ready`.
3. **Level cards** (design §2.6; board `desktop-level1-pop`): the steadiness line for the
   previous level (`core/warmup/steadiness.ts`, from that level's rejection codes only, heuristic
   table), the track (nodes only), "Level n of N", pictogram, name, rule, hint, the 3 s countdown
   ring that starts the level by itself (÷ speed in test mode; static ring under reduced motion),
   **Start now**, tap anywhere or Space, the Sound toggle, and "Skip this level" on the pursuit
   card under reduced motion. `role="dialog"`.
4. **The bubble** (§17.6.3; design §2.6, §6.1): a pure `bubbleRadius(tRelMs, item, sizes,
   reducedMotion)` (scale-in over 150 ms of the settle window, full size to its end, linear
   shrink to the core over the sample window, hold during extension) with unit tests at every
   boundary, including the speed divisor; the drawing (ghost ring, disc, edge, shine, the ABC core
   of `target.ts`), the 150 ms pop burst after the item with the soft pop and 15 ms haptic, the
   re-grown retry, and the static reduced-motion form. Full diameter 3° clamped to [64 px, 20 % of
   the stage's short side]. `?target=ring` draws the §4.7 ring instead (pilot only).
5. **Follow the firefly** (design §2.8): the ABC core on the 44 px light disc with the 300 ms
   trail in three fading segments; a continuous progress bar instead of pips.
6. **Turn your head** (§17.6.5; design §2.9; board `desktop-level3-turn`): the static bubble (64
   px phones, 80 px desktop), the four arcs filled from the measured pose through the existing
   `SectorTracker`, the arc being reached drawn thicker, the caption chip ("Slowly turn your
   head", then "Now nod slowly"); no pose dot. Limited head movement halves the sector targets
   and is recorded in `session.json` (its toggle comes in 017; default off).
7. **Test round**: the bubbles as Level 1 on the validation schedule; no feedback per bubble.
8. **Stimulus HUD** (§17.6.6; design §2.6, §4.3–§4.5): the pip line on the camera edge
   (`role="progressbar"`, a retried bubble adds a pip), the corner cluster (the glyph from 014
   and Pause) in the corner farthest from the camera, fading out and taking no pointer input
   while a target is within 96 px; phone landscape puts the pip line on the camera side. Nothing
   else on screen.
9. **Pausing** (design §2.6, §3.8; §17.5.3): the manual Pause card (Sound, Details, Exit = the
   §4.7 abort, **Carry on**); auto-pause through the guard controller with the warm-up thresholds
   (*out* > 0.5 s, face lost > 0.4 s, relative to *home*); the glyph turns amber silently while
   drifting; the interrupted bubble is shown again with its full settle window; three pauses in a
   level open "Let's fix the set-up first" → `#/ready`; after 10 s in the overlay "Get ready
   again" is offered.
10. **Screen changes** (§17.6.7): an invalidation from `presentation.ts` shows "The screen
    changed" with **Warm up again** (back to the Level 1 card, *home* kept), or the rotation copy.
11. **Warm-up complete** (`#/complete`, §17.7; boards `phone-level-complete`,
    `desktop-level-complete`): `zoneGrid` (`core/game/zones.ts`, per-axis n ∈ {1, 2, 3, 4},
    unit-tested against hand-worked geometries, including portrait phones giving 1 × n and
    landscape giving n × 1), stars from the verdict, the marks (Ḡ in the target's zone), the
    cause line (`core/warmup/cause.ts`, in the order of design §2.12, heuristic), the outcome
    table of design §2.12 (Great, Good, Rough, Didn't work) with its headline, sentence, tip and
    actions; the zone map with ✓ and ✗ marks and the legend; the stars row
    (`role="img"`, "2 of 3 stars"); "Rule of thumb · How we judge this" opening Details →
    Results; the arrival sequence (zones, stars, actions; all at once under reduced motion) and
    one chime. Routes: **Try your zones** → `#/look`, **Warm up again** → the Level 1 card
    (presentation kept), **Get ready again** → `#/ready` (presentation ended), **Play anyway** →
    `#/challenge`. Until 016 lands, Try your zones and Play anyway open the legacy `#/live`. The
    `restore` mode below acceptable offers only the full warm-up (§17.4.4). Track: levels done,
    star unlocked or locked. Guard: no scored Test round → `#/ready`.
12. **Test hooks and fixtures:** `__eek.warmup()` (level, card, item, pauses) and
    `__eek.result()` (zones, stars, marks, cause, outcome); fixtures for a level card, a level in
    play, Checking, each Warm-up complete outcome, and the pause and screen-changed cards.
13. **End-to-end.** `flow.spec.ts`: Title → Play → Get ready → Start warm-up (or Start anyway) →
    the Quick warm-up (two levels at `speed=4`, injected geometry) → Checking → Warm-up complete
    with stars, zones and marks rendered and the result in `__eek.result()` (accuracy is not
    asserted); the Standard set's cards appear in order (Pop, Follow, Turn, Test).
    `mobile.spec.ts`: the same by taps on the phone emulation, the bubbles inside the safe
    rectangle (matched to `layoutToPx` with the measured insets), and turning the phone during a
    level showing "The screen changed". `no-scroll.spec.ts`: every fixture above at the five
    sizes.

## Do not implement

- Free look, Re-aim, the Quick warm-up's entry points, the forced Re-aim after a restore, and the
  challenge (016); the Details tab contents (017); removal of the legacy calibrate, validate and
  results screens (018).
- Any change to schedules, layouts, durations, acceptance, labels, weights, the fit, metrics or
  the verdict; any change to `constants.ts`, `package.json` or the frozen contracts.

## Acceptance criteria

The task is complete when:
- the four Standard levels (and the Quick and Thorough sets) run over the unchanged protocol with
  the bubble, firefly and arcs, the HUD, the guard and pausing as specified, and produce the same
  recordings, fit and reports as the legacy screens;
- Warm-up complete shows stars, zones, marks, the cause and the right actions for each outcome;
- the new unit tests pass, `flow.spec.ts`, `mobile.spec.ts` and `no-scroll.spec.ts` pass, and so
  does every other e2e spec; `npm run check` passes.

## Checks

`npm run check`; `npx playwright test` (with this worktree's `E2E_PORT`).

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push. Then deploy as `AGENTS.md` requires (`npm run deploy`) and include the live check
in the report: the legacy flow stays reachable, so the deployed app remains usable.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
