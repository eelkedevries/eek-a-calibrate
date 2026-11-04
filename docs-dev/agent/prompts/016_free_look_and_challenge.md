# Task: Free look, Re-aim and the challenge (v0.5)

## Goal

Give the player what the warm-up unlocked: Free look (the looked-at zone lit, a soft gaze disc),
Re-aim and the Quick warm-up as the game's faces of the existing drift check and quick
recalibration, and the gaze-contingent challenge "Pop!" in three rounds, with its scoring,
stars, quality check and export.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs after 015. Live filtering, the drift and recalibration maths, the estimators and
the export format rules are reused; this prompt adds the game and presents the rest.

## Owns

- `src/app/screens/{look,challenge}.ts`, `src/app/strings/{look,challenge}.ts`.
- `src/app/game/liveSession.ts` (new): the live machinery **extracted** from
  `src/app/screens/live.ts` (estimator set and One Euro display stream, drift checks and the drift
  log, quick recalibration and the required revalidation, session records and recorded blocks,
  forced-check reasons), which `live.ts` then calls until 018 removes it; not copied.
- `src/app/components/{zoneBoard,gazeDisc,freeLookDock,scoreChip,roundCard,roundComplete,offerCard,replay,decoy}.ts`
  (new).
- `src/core/game/{params,board,placement,dwell,round,scoring,stars,offset,reaim,stats}.ts` (new,
  DOM-free) and `tests/unit/game-*.test.ts`.
- `src/core/types.ts`: `Phase` gains `'game'` (§17.11) only.
- `src/core/export/{samplesCsv,targetsCsv,gameCsv,readme,sessionJson}.ts` (`gameCsv.ts` new),
  the export assembly in `src/app/screens/data.ts` (or its extraction to `src/app/export.ts`,
  which 017's Data tab then calls), `tests/unit/export-*.test.ts`, `docs/export-format.md`.
- `src/app/game/gameState.ts` (the zones, rounds and best scores in memory; 017 persists the best
  scores).
- `tests/e2e/live-data.spec.ts`, and the Free look, Re-aim and challenge rows of
  `tests/e2e/no-scroll.spec.ts`.

## Context

- `specification.md` v0.5 §17.2 (routes, guards, fullscreen span), §17.3, §17.5.3 (auto-pause in
  Free look and the challenge, nudges), §17.7.2 (zones), §17.8 (Free look, Re-aim, Quick
  warm-up), §17.9 (the challenge), §17.10.1 (game export), §17.11 (`Phase`); §4.10 (head range,
  `OUT_OF_RANGE`), §4.11 (One Euro, blink hold), §4.13 (drift check, correction limit, quick
  recalibration, forced checks), §4.15–§4.16, §16.2.2, Appendix A (`DRIFT`, `ONE_EURO`,
  `BLINK_HOLD`).
- `interface-design-v2/design-spec.md`: §2.13 (Free look), §2.14 (the challenge screens), §2.15
  (Re-aim and Quick warm-up), §2.16, §3.3, §3.7 (glyph placement and nudges), §3.8, §4.3–§4.5,
  §5 in full (mechanics, parameters, visuals, scoring, quality check), §6.1 (zones, gaze disc,
  decoy, stars, bubble), §7 (copy).
- Boards: `canvas/phone-free-look.dc.html`, `canvas/desktop-free-look.dc.html`,
  `canvas/phone-challenge.dc.html`, `canvas/phone-landscape-challenge.dc.html`,
  `canvas/desktop-challenge.dc.html` (Round complete), with their `png/` renderings and
  `briefs/`.
- Built by 014 and 015: the guard controller, glyph and overlay, `feedback.ts`, the bubble, pip
  line, corner cluster, level cards, `warmupRunner` (with the `quick-warmup` and `restore` level
  sets), `zoneGrid`, Warm-up complete.

## Deliverables (required changes)

1. **Free look** (`#/look`, §17.8.1; design §2.13; boards `phone-free-look`,
   `desktop-free-look`): the zones as outlines over the grey; the zone of the selected
   estimator's filtered, drift-corrected gaze lit (snap-to-zone); the soft gaze disc with radius
   = p68 of the per-target Test-round accuracy in px, fading with confidence and greyed with a
   dashed edge when `OUT_OF_RANGE`; the dock ("Tracking" with the live dot and, on phones, the
   glyph; "The zone you look at lights up."; **Re-aim**; **Play the challenge**); the desktop
   glyph in the top bar; nudges; bar and dock fading after 3 s without input and returning on a
   tap, a mouse move or a key; auto-pause at *out* > 1 s or face lost > 0.7 s; the Re-aim offer
   card at 5 minutes since the warm-up and after 10 s in the overlay. Expert mode (a setting; its
   toggle comes in 017, `?expert=1` meanwhile): the raw and per-engine dots, the trail, record
   (R) and markers (M), the estimator switch, as Live had them. Guard: no validated fit of at
   least two zones → `#/complete` (or `#/`).
2. **Re-aim** (§17.8.2; design §2.15): the §4.13 drift check (the existing drift schedule: the
   centre and one seeded `VAL12` location, settle 500 ms, sample 1000 ms) as a two-bubble
   mini-level with a two-pip line and no card, run over the screen that offered it (no route
   change; play resumes where it was); the offer card ("Aim drifting?", Keep playing,
   **Re-aim**); the outcomes with unchanged behaviour (the correction applied within the limit;
   chip "Your aim was fine" below 0.5°, "Aim fixed" otherwise; beyond the limit "Your aim moved a
   lot" with **Quick warm-up**). Offered from Free look (also by D), between bubbles when the hit
   rate is below 50 % over the last six, after 10 s in the overlay, at 5 minutes, and as the
   primary on a Round complete that went badly. A check forced by §4.13 (camera, viewport,
   backend or delegate change, worker restart, restored calibration) is a Re-aim that cannot be
   skipped; the `restore` path of §17.4.4 runs it after its Test round.
3. **Quick warm-up** (§17.8.3): 015's `quick-warmup` level set on `#/warmup` (`RECAL5` with the
   fixation rules, the refit at weight ×2, then `VAL6`), ending on Warm-up complete with the new
   zones and the primary **Back to the challenge**; the earlier validation is dropped (§16.2.2).
4. **The challenge core** (`src/core/game/*`, §17.9.1–§17.9.3, design §5; every parameter in
   `params.ts`, marked heuristic): the board from the zones (safe rectangle minus 4 % per axis,
   16 px gutters); bubble size; seeded placement (jitter, no repeat, balance, the centre-zone
   check when both counts are odd); the leaky dwell (fill, double-rate drain, reset after 300 ms
   outside, held by blink-held or invalid frames); lifetime, miss and gap; the rounds (Pop!,
   Mind the spikes with the decoy and its 600 ms bonk, Drifters at ≤ 3°/s, never nearer than its
   radius to the zone edge); scoring (+100 and the speed bonus, the × 1.5 streak after four pops,
   −50 per bonk, never below 0); round stars; per-zone statistics (hit rate, median time to pop,
   median offset); the offset-correction rule (≥ 3 zones, resultant ≥ 0.6, mean above a quarter
   zone); the Re-aim offer rule (once per round). Unit tests for each, with fixed seeds.
5. **The challenge screens** (`#/challenge`, §17.9.4; design §2.14, §5.4; boards
   `phone-challenge`, `phone-landscape-challenge`, `desktop-challenge`): round cards (track with
   the star current, "Round n of 3", pictogram, name, rule, hint, "16 bubbles · about 1 minute",
   countdown, Start now, Sound); the board with faint zones and the lit zone, the bubble (015's
   drawing at the challenge size, shrinking with the dwell and growing back as it drains, the
   200 ms burst), the decoy and drifters, the miss drifting up 24 px and fading; the HUD (16-pip
   line, the score chip with the streak tag and the −50 flash, the corner cluster with nudges,
   chips fading within 96 px of a target); reduced motion per design §5.4; Pause and auto-pause
   freezing lifetime and dwell; a screen change ending the round ("The screen changed").
   **Round complete** (framed, inside the presentation): the zone map with "5 of 5" and ✓, ~ or ✗
   per zone, **Replay** (6 s of the smoothed gaze trail over the map), the stars row, "14 of 16
   popped", one sentence (the hardest zone, every zone well, the corrected shift, or the drift
   remedy), "Score 1 820 · Best 1 820" in mono, and the actions of design §2.14 (Next round, Play
   again, Re-aim, Free look). The best score is kept per zone set. Guard as Free look.
6. **The quality check** (§17.9.3): each pop stores target, zone, time to pop and the median
   filtered gaze over the last 400 ms; a qualifying offset, converted to degrees, is **added** to
   the selected estimator's drift correction for the next round (the gaze it was measured on is
   already corrected, so it must not replace the correction), unless the sum would exceed the
   §4.13 limit; it is logged in the drift log with source `game` (an optional field of the
   export's `DriftLogEntry`), and Round complete says "We corrected a small shift." A unit test
   covers the addition and the limit.
7. **Recording and export** (§17.10.1, §17.11): `Phase` gains `'game'`; every round is recorded
   as a block (bubbles as `TargetItem`s with phase `game`), exported as trial `game-<nnn>` in
   `samples.csv` (target columns follow a drifter), bubble rows in `targets.csv`, the new
   `game.csv` (one row per bubble or decoy, columns as §17.10.1), the `session.json` additions
   and the `README.txt` line; byte-identical output still holds; `docs/export-format.md`
   documents it all.
8. **Test hooks and fixtures:** `__eek.look()` (lit zone, disc), `__eek.challenge()` (round,
   bubble, dwell, score, streak, stars, per-zone statistics); fixtures for Free look (bar shown and
   faded), the Re-aim offer and outcomes, each round card, a round in play (with a decoy), and
   each Round complete outcome.
9. **End-to-end.** `live-data.spec.ts` on the new screens: after the Quick warm-up, Free look
   shows a lit zone; Re-aim runs and reports its outcome; a challenge round runs to Round complete
   (the fake face does not look at the bubbles, so misses are expected at `speed=4`); the export
   zip parses and validates, including `game.csv` and `phase` `game` rows in `samples.csv`; a
   stored calibration restored through Skip warm-up forces the `VAL6` Test round and the Re-aim.
   `no-scroll.spec.ts`: every fixture above at the five sizes.

## Do not implement

- The Details tabs, the settings UI and IndexedDB v2 (017); the removal of the legacy Live screen
  (018).
- Any change to the drift limit, the recalibration procedure, filtering, the estimators,
  `constants.ts`, `package.json`, or contracts beyond `Phase` (§17.11).

## Acceptance criteria

The task is complete when:
- Free look, Re-aim, the Quick warm-up and the three challenge rounds with Round complete work as
  specified and match their boards;
- the challenge core's unit tests pass, with fixed seeds;
- the export carries the game rows and `game.csv` and stays byte-identical for identical state;
- `live-data.spec.ts`, `no-scroll.spec.ts` and every other e2e spec pass; `npm run check`
  passes;
- the report notes the `Phase` contract change (§17.11).

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
