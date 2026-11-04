# Task: The Details sheet (v0.5)

## Goal

Fill the Details sheet with everything an expert needs, drawn from the existing logic: Results
(one card per estimator), Settings, Data, Device and About, each paginated so that nothing
scrolls; restyle the measurement and diagnostics pages to fit one screen; add the Methods long
read; and keep preferences and best scores on the device.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs after 016. Content comes from the legacy Results, Data, About and Live screens and
the Welcome screen's Advanced section by **extraction** (they call the extracted code until 018
removes them), never by copying.

## Owns

- `src/app/details/{results,settings,data,device,about}.ts` (new: each tab's page builders,
  registered through 013's `registerDetailsTab`), `src/app/strings/details-*.ts`.
- `src/app/shell/detailsSheet.ts` and `src/app/shell/pager.ts` (extend only).
- `src/app/screens/methods.ts` (the long read), and the restyle of
  `src/app/screens/{screen,distance,lab}.ts` with their components
  `src/app/components/{cardMatch,blindSpot,targetPlot}.ts`; `src/app/components/metricCard.ts`
  (new).
- `src/app/state.ts` (the settings of design §2.17: warm-up length, engines, glasses, sound,
  read aloud, Limited head movement, theme, camera, Expert mode) and their persistence.
- `src/platform/storage.ts` (IndexedDB version 2 with `prefs` and `scores`, §17.10.3) and its
  tests.
- `tests/e2e/details.spec.ts` (new), the Details rows of `tests/e2e/no-scroll.spec.ts`, and the
  restyled pages' rows (`#/screen`, `#/distance`, `#/lab`).

## Context

- `specification.md` v0.5 §17.2.1 (Details, delete all), §17.3 (no-scroll rule, theme, touch,
  copy), §17.4.6 (what moved into Details), §17.5.5 (sound, speech with local voices), §17.6.5
  (Limited head movement), §17.7 (stars and zones: "How we judge this"), §17.8.1 (Expert mode),
  §17.9.5 (best scores), §17.10.3 (IndexedDB v2); §4.4 (card match, blind spot), §4.12 (metrics,
  own and intersection, funnel with §16.2.1, AOI advice, paired differences and the
  single-session caveat), §4.15 (profiles, restore, delete all), §4.16 (export, `dataset.json`
  option), §7 rows 0, 2, 3, 6, 8, 9, 10 (the content that moves here), §14.1 (px first, ≈ degrees),
  Appendix B (the only sources for numbers in copy).
- `interface-design-v2/design-spec.md`: §2.17 (the sheet and the table of tab contents), §4.7
  (sheet geometry), §2.12 and §5.5 (what "How we judge this" explains), §3.2 (advised distances,
  shown in Device and About only), §7 (copy).
- There is no board for the sheet: follow design §2.17 and the tokens, components and type
  scale of `shared.css` and `spec-core.md`, in the look of the other boards.

## Deliverables (required changes)

1. **Results** (from `screens/results.ts`): one **metric card** per estimator (Combined first,
   then each engine) from the latest Test round: accuracy in px and % of the screen first, ≈
   degrees second (§14.1.4), precision, data loss, rate, the verdict as word and glyph, and a
   **Use this** switch (the instant estimator switch); the selected estimator marked with Auto's
   reason. Further pages: the target plot (toggled per estimator); **How we judge this** (the
   stars and zones mapping of §17.7 and §17.9.5, thresholds marked heuristic, with sources); the
   challenge statistics per zone (hit rate, median time to pop, offset); and, as their own pages,
   own versus intersection, the data-loss funnel with its note, the cross-validation candidates,
   the paired differences with the single-session caveat, the areas-of-interest advice, and the
   approximate-degrees note with the link to measuring. Wide tables become cards or pages; no
   page scrolls. "Rule of thumb · How we judge this" on Warm-up complete opens this tab on that
   page.
2. **Settings**: Warm-up length (Quick ≈ 35 s / **Standard ≈ 100 s** / Thorough ≈ 3 min; applies
   from the next warm-up, and the Title's meta line follows); Engines (**Auto (recommended)** or
   chosen, with download sizes from `ENGINE_SPECS`; a change needs a new warm-up); Glasses (none,
   glasses, contacts, prefer not to say); Sound; Read instructions aloud (unavailable without a
   local voice, §17.5.5); Limited head movement; Theme (Dark, Light; the grey stage unaffected;
   applied before first paint where possible); Camera (with two or more cameras); Expert mode.
   Each is persisted in `prefs` and applied at once where it can be.
3. **Data** (from `screens/data.ts`): export the zip (with the per-frame features option for
   `dataset.json`), including the game data of 016; saved on this device: stored warm-ups
   (profiles), sessions and best scores, each listed with what it is; participant and session
   IDs (editable before a warm-up); delete all.
4. **Device**: the live readings strip, one mono line each (distance ≈ cm, estimated unless
   measured; face size; eye size; head angles; phone tilt; light; glare; frame rate) from the
   position core; **Measure screen and distance** (opens `#/screen?from=details`, then
   `#/distance`, returning to where Details was opened); the capability list; the engine timings
   from the probe and the run set with its reasons; **Open diagnostics** (`#/lab`); the advised
   distances of design §3.2.
5. **About** (from `screens/about.ts` and the Welcome screen's Advanced section): three sentences
   on what the game does; privacy ("Everything runs on this device. Nothing is uploaded and no
   images are stored."); the expectation line with its sources (Appendix B); the engines with
   licences and citations; **Methods (long read)** → `#/methods`.
6. **`#/methods`**: a document page (it may scroll, because it is a document) with the methods,
   metric formulae, protocol, engines and limitations that About held in v1, consistent with
   `docs/methods.md`; a clear way back to the game.
7. **Restyled pages**: `#/screen` (card match with slider and arrow keys, or the diagonal, or
   Skip), `#/distance` (blind-spot test with the large "It disappeared" button, the iris
   measurement, or Skip) and `#/lab` (diagnostics, live crops, "Run each engine on 10 frames") in
   the new tokens and shell, each fitting one screen at the five sizes (tables become paged
   cards); their behaviour and test hooks unchanged.
8. **Persistence** (§17.10.3): IndexedDB `eek-a-calibrate` version 2, upgrading v1 in place
   (stores kept) and adding `prefs` and `scores`; the existing rules hold (reads never create the
   database; failed writes fall back to memory with a warning); 016's best scores are persisted;
   delete all clears every store. Unit tests for the pure parts (upgrade plan, key building).
9. **Sheet behaviour**: the sheet opens on the right tab and page from the top bar, the Pause
   card, "Rule of thumb · How we judge this" and `#/details/<tab>`; the pager keeps one page at a
   time; focus, Esc and Done as 013 built them.
10. **Tests.** `details.spec.ts`: open from the top bar and from the deep link, tab and page
    navigation by keyboard, focus trap and return, Esc and Done, a setting that persists across a
    reload, the export downloading a zip from the Data tab, delete all behind its confirmation.
    `no-scroll.spec.ts`: every page of every tab, with and without a result, and `#/screen`,
    `#/distance` and `#/lab`, at the five sizes.

## Do not implement

- Removal of the legacy Results, Data, About and Live screens or their routes (018); new metrics
  or changes to how any metric is computed; changes to `constants.ts`, `package.json` or the
  frozen contracts.

## Acceptance criteria

The task is complete when:
- every tab of design §2.17 holds its content from the existing logic, paginated, with no page
  scrolling at the five sizes;
- settings persist in IndexedDB v2 and take effect as described; delete all clears everything;
- `#/methods`, `#/screen`, `#/distance` and `#/lab` work in the new look;
- `details.spec.ts`, `no-scroll.spec.ts` and every other e2e spec pass; `npm run check` passes.

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
