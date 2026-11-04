# Task: Integration and polish of the game-first interface (v0.5)

## Goal

Finish the game-first interface: remove the legacy screens and routes (redirecting their
hashes), move every end-to-end spec onto the new interface, compare each screen with its board,
pass an accessibility review, bring the documentation and the manual checklist up to date,
confirm the no-scroll rule everywhere, and deploy.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs last, after 017. Fixes found here go into the files that own them, each noted in
the report.

## Owns

- Deleting `src/app/screens/{welcome,camera,calibrate,validate,results,live,data,about}.ts`,
  `src/app/legacy.css`, the legacy chrome in `src/main.ts`, and every component, string module
  and test hook used only by them (list each in the report).
- `src/app/router.ts` (the redirects of §17.2.2).
- `tests/e2e/*.spec.ts` (all of them) and `tests/e2e/visual.spec.ts` (new);
  `docs-dev/reviews/visual-018/` (new: the screenshots and a short comparison note).
- `README.md`, `docs/{usage,troubleshooting,methods,privacy,export-format,engines}.md` (where
  the flow or the interface is described), `docs-dev/planning/current_state.md`,
  `docs-dev/manual-verification.md`.
- Integration fixes in any file of 013–017, each noted.

## Context

- `specification.md` v0.5 §17 in full, especially §17.2.2 (legacy redirects), §17.3.3
  (no-scroll rule and sizes), §17.3.7 (touch and keyboard), §17.12 (tests, visual pass, pilot and
  device checks); §10.4 (the e2e plan), §10.6 (manual checks), §15.2.3, §16.1, Appendix B.
- `interface-design-v2/design-spec.md`: §3.11 (accessibility checklist for the guard), §4.1 rule
  13 (the full size list and 125 % text), §10 (device and pilot checks); the boards in `canvas/`
  and their renderings in `png/` (the visual target at the board sizes: 390×844, 1440×900,
  844×390).
- `AGENTS.md`: deploy after pushing a change to the built site, with the live check in the report
  (`docs/deployment.md`).

## Deliverables (required changes)

1. **Legacy removal.** Delete the legacy screens and what only they use; `#/welcome` → `#/`;
   `#/camera`, `#/calibrate`, `#/validate` → `#/ready`; `#/results` → `#/details/results`;
   `#/live` → `#/look`; `#/data` → `#/details/data`; `#/about` → `#/details/about`. `#/screen`,
   `#/distance`, `#/lab` and `#/methods` stay. Nothing in the app links to a legacy hash any more.
2. **Every e2e spec on the new interface**, passing:
   - `smoke.spec.ts`: the Title; same-origin requests (worker requests included); no console
     errors or CSP violations; reload on every route; the redirects; the production headers.
   - `vision.spec.ts` and `engines.spec.ts`: through `#/lab` (restyled), as before.
   - `flow.spec.ts`: the full game path at `speed=4` (Title → Get ready → the warm-up → Warm-up
     complete → Free look → a challenge round → Round complete), on desktop with injected geometry
     and with every engine; Details → Results then lists every available engine plus Combined.
   - `live-data.spec.ts`: Free look, Re-aim, a round, the export (with `game.csv`), and a restored
     calibration through Skip warm-up.
   - `failures.spec.ts`: camera refused on the Title ("Camera blocked", Try again); a fullscreen
     exit during a level and during a round ("The screen changed", then a fresh run); a tampered
     model making only its engine unavailable; a worker crash during the warm-up recovering.
   - `mobile.spec.ts`: the phone emulation by taps (portrait, then landscape with the camera
     side), targets inside the safe rectangle, a turn of the phone during a level and in Free look.
   - `no-scroll.spec.ts`: **every route and every state fixture at all five sizes** (360×640,
     390×844, 844×390, 1280×650, 1440×900), with the 44 px target check.
3. **Visual pass** (§17.12.3): `visual.spec.ts` captures each screen of the board list (design
   §8) at its board size, in the board's state through the fixtures, and saves the screenshots
   with the matching `png/` rendering beside them in `docs-dev/reviews/visual-018/`, with a note
   per screen listing the remaining differences; differences in layout, copy or state are fixed,
   and only example values (the boards' Example numbers) may differ. Not pixel-asserted.
4. **Accessibility pass**: a keyboard-only run through the whole game (focus order, visible
   focus, Space, P, Esc, D, R and M, the sheet's trap and return); names and roles (the track,
   the chooser, the pip line, the glyph, the overlay, the stars, the zone maps, the cards);
   contrast of every text and UI token pair on its surfaces, including on the grey stage,
   computed from the token values in a unit test (text ≥ 4.5 : 1, large text and UI ≥ 3 : 1);
   touch targets ≥ 44 px; reduced motion end to end; the further sizes of design §4.1 rule 13 and
   125 % root text checked once, with any failure fixed or listed as an open issue.
5. **Docs**: `README.md` and `docs/usage.md` (the game's flow, set-up chooser, Details),
   `docs/troubleshooting.md` (the guard's cues, camera blocked, the screen changed, slow devices,
   motion permission), `docs/methods.md` (warm-up levels as the protocol's presentation, the
   bubble, zones and stars, the challenge and its quality check, all heuristics labelled),
   `docs/privacy.md` (device motion and speech stay on the device), `docs/export-format.md`
   (checked against 014 and 016). No accuracy figure without a source (Appendix B).
6. **`current_state.md`**: the new interface as built (routes, modules, test hooks, fixtures),
   replacing the legacy screen notes; **`manual-verification.md`**: the real-device checks of the
   new flow and of design §10 (the bubble-versus-ring pilot with `?target=ring`, thresholds on
   phones Propped and In hand and on webcams, camera side in landscape, iOS 26 `svh` and the motion
   permission, contrast on the grey in light and dark rooms, challenge tuning, reduced motion and
   read-aloud).
7. **Deploy** (AGENTS.md): after pushing, `npm run deploy`, then the live check of
   `docs/deployment.md` against `https://eelkedevries.com/eek-a-calibrate/` (200, the built entry,
   `.wasm.gz` served as gzip-encoded WebAssembly, the CSP, `font/woff2`), recorded in the report.

## Do not implement

- New features, settings or game rules beyond §17; changes to the pipeline, `constants.ts`,
  `package.json` or the frozen contracts.

## Acceptance criteria

The task is complete when:
- no legacy screen remains, and every legacy hash redirects as listed;
- `npm run check:all` passes, with every e2e spec on the new interface and the no-scroll check at
  all five sizes on every route and state;
- the visual pass's screenshots and notes are in `docs-dev/reviews/visual-018/`;
- the accessibility pass is done, with the contrast test passing;
- the docs, `current_state.md` and `manual-verification.md` describe the new interface;
- the deploy has run and the live check is in the report.

## Checks

`npm run check:all` (with this worktree's `E2E_PORT`); the live check after the deploy.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push. Then deploy as above.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
