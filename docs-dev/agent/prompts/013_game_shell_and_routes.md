# Task: Game shell, design tokens and routes (v0.5)

## Goal

Lay the foundation of the game-first interface: the eek-a-style tokens and components, a
no-scroll app shell with its three modes, the level track, the Details sheet frame, the new
route map and a reusable no-scroll check, while every legacy screen keeps working.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. The new screens are frames with placeholder content here; 014–017 fill them. Runs after
012.

## Owns

- `src/app/style.css` (rewritten from `shared.css`) and `src/app/legacy.css` (new: the v1 styles
  the legacy screens still need, moved out unchanged; deleted by 018).
- `src/main.ts`, `src/app/router.ts`, `src/app/testHooks.ts`.
- `src/app/shell/{appShell,topBar,levelTrack,detailsSheet,pager,icons,fitGuard}.ts` (new).
- `src/app/screens/{title,ready,warmup,complete,look,challenge,methods}.ts` (new placeholders).
- `src/app/strings.en-GB.ts` (becomes the merger behind `t()`) and `src/app/strings/*.ts` (new:
  one module per screen or shell part, the legacy screens' keys included).
- `src/app/session.ts`: the `CAMERA_ROUTES` set only.
- `public/fonts/**` (new), `NOTICE.md` (font lines), `config/headers.mjs` and
  `public/.htaccess` (the `.woff2` type only).
- `tests/e2e/helpers/noScroll.ts`, `tests/e2e/no-scroll.spec.ts` (new), `tests/e2e/smoke.spec.ts`,
  and only the lines of `flow.spec.ts`, `mobile.spec.ts`, `failures.spec.ts` and
  `live-data.spec.ts` that open the old Welcome at `#/`.
- `tests/unit/shell-*.test.ts` (new) for the pure parts.

## Context

- `specification.md` v0.5 §17.1 (precedence), §17.2 (routes, legacy routes, guards, fullscreen
  span, test parameters), §17.3 (tokens, fonts, no-scroll rule, layouts, level track, copy,
  touch and keyboard), §17.13; §7 (query parameters), §14.2.5 (safe areas), §4.15 (delete all).
- `interface-design-v2/design-spec.md`: §1 (principles), §2.2 (modes), §2.3 (the level track),
  §2.17 and §4.7 (the Details sheet), §4.1–§4.6 (root rules, modes, the three layouts, content
  budget), §6.0–§6.1 (shared CSS, icons, track and star paths), §7 (copy).
- `interface-design-v2/spec-core.md` and `shared.css` (tokens and component CSS, verbatim).
- Boards for the shell parts: `canvas/Main.dc.html`, `canvas/desktop-title.dc.html` (top bars),
  `canvas/phone-ready.dc.html` (stage-chip pill bar), `canvas/desktop-level-complete.dc.html`
  (labelled desktop track), with `png/` renderings as the visual target.

## Deliverables (required changes)

1. **Tokens and components.** `src/app/style.css` starts from `shared.css` verbatim (the
   eek-a-style roles, the theme-independent stage roles, the game roles, `.btn` and its
   variants, `.icon-btn`, `.choice`, `.chip`, `.ex`, `.sr-only`, `.ek-live`), dark by default,
   light under `:root[data-theme="light"]` (no settings UI yet: `?theme=light` sets it for now).
   Colour only through role tokens. The legacy screens keep their look through `legacy.css`,
   loaded only while a legacy route is shown.
2. **Fonts (§17.3.2).** Self-host Spectral 600, Lexend 400 and 500, and JetBrains Mono 400 and
   500 as Latin WOFF2 under `public/fonts/<family>/` with `OFL.txt` and `PROVENANCE.md` (source
   URL, version, sha256), `@font-face` with `font-display: swap`; add `.woff2` → `font/woff2` to
   `config/headers.mjs` `MIME_TYPES` and `public/.htaccess`. Obtain the files from their upstream
   OFL repositories through the proxy; if a family cannot be fetched, keep the fallback stack,
   say so in the report and list it under human actions. Never load a font from another origin.
3. **The no-scroll shell (design §4.1–§4.5).** `appShell.ts` renders the new routes into `.app`
   (`100svh` with the `100vh` fallback, `overflow: clip`, safe-area paddings, exactly one
   flexible region) in one of three modes: framed, immersive and stimulus (design §2.2). Layouts
   switch by aspect ratio (5/4) and height (480 px) and components by container queries; never
   by orientation or user agent. `html` and `body` stop scrolling only while a new route other
   than `#/methods` is shown; legacy routes keep the v1 header, footer and page scrolling until 018. The fit guard
   (`fitGuard.ts`, a `ResizeObserver` per region with the ladders of design §4.1 rule 11) is
   available to every screen.
4. **Top bar** (design §2.3, §4.3–§4.5): on the Title the mark and wordmark left and Details
   right; elsewhere the phase label and the level track left (phones) or the labelled track
   centred (bars ≥ 640 px), Details right (icon on phones, icon and word on desktop); the
   stage-chip pill form on immersive screens.
5. **Level track** (`levelTrack.ts`): a pure state function (warm-up length → nodes; screen and
   progress → node states, phase label and the visually hidden position text) with unit tests,
   and two renderers: the 134 × 22 SVG for bars under 640 px and the `<ol aria-label="Game
   progress">` with names for wider bars (Quick: Pop, Test; Standard: Pop, Follow, Turn, Test;
   Thorough adds Lean in), plus the star node. States: future, current, done, star locked,
   unlocked and current; never gold; the fit ladder (drop the wordmark, then the label, then dot
   nodes). Hidden on stimulus screens.
6. **Details sheet frame** (design §2.17, §4.7): a modal `<dialog>`; a bottom sheet when the
   window is under 600 px wide and at least 480 px tall, a side sheet otherwise (from the right;
   from the side away from the camera on a phone in landscape); header "Details" with **Done**;
   the tabs Results · Settings · Data · Device · About as a segmented control (`role="tablist"`,
   arrow keys); a pager (`pager.ts`: one page at a time, ‹ › buttons of 44 px and "2 of 5"),
   never scrolling; a footer with "Delete all my data" (the existing handler, behind a confirm
   dialog) and the version line. Focus is trapped; Esc (and Android Back) closes it; focus
   returns to the trigger. Opening it never changes the route. A small API lets 017 register each
   tab's pages (`registerDetailsTab(id, buildPages)`); each tab shows one placeholder page now.
7. **Routes (§17.2).** `#/` Title, `#/ready`, `#/warmup`, `#/complete`, `#/look`,
   `#/challenge`, `#/details/<tab>` (the Title with the sheet open on that tab) and `#/methods`
   (a placeholder document page). The old Welcome moves to `#/welcome`; `#/camera`, `#/screen`,
   `#/distance`, `#/calibrate`, `#/validate`, `#/results`, `#/live`, `#/data`, `#/about` and
   `#/lab` stay as they are. Each route declares its layout (game or legacy) and may declare a
   guard (state missing → redirect, §17.2.3); the placeholders declare none yet. Placeholder
   screens show their mode, the top bar with the track in the state of design §2.3 "Where it
   shows", and the screen's name; the Title shows the wordmark, "Pop with your eyes", its pitch
   and a **Play** that, until 014 lands, opens the legacy flow at `#/welcome`. Add the new
   camera-using routes to `CAMERA_ROUTES` in `session.ts`.
8. **Strings.** Split the flat table into modules under `src/app/strings/` (one per screen or
   shell part); `t()` keeps its signature and keys; a duplicate key fails the build or a unit
   test.
9. **Test hooks.** `?e2e=1&fixture=<name>`: a registry (`registerFixture(name, apply)`) through
   which later prompts put a screen into a given state for tests without running the warm-up;
   `__eek.route()` and `__eek.sheet()` (open, tab, page).
10. **No-scroll check (§17.3.3).** `tests/e2e/helpers/noScroll.ts` exports `expectNoScroll(page)`:
    `documentElement.scrollWidth ≤ innerWidth`, `scrollHeight ≤ innerHeight`, no visible
    element's box past the viewport (0.5 px tolerance), and every visible interactive element at
    least 44 × 44 px. `tests/e2e/no-scroll.spec.ts` visits every new route except the
    `#/methods` document, and the sheet on each tab, at **360×640, 390×844, 844×390, 1280×650
    and 1440×900**, from a table of states that later prompts extend (route, optional fixture,
    optional action).
11. **Smoke and legacy specs.** `smoke.spec.ts` loads the Title; same-origin requests, no
    console errors or CSP violations, a hash-route reload, the production headers (including
    `font/woff2`). Specs that opened the old Welcome at `#/` open `#/welcome`; nothing else in
    them changes.

## Do not implement

- Title content beyond the frame, Get ready, the position guard (014); warm-up levels and Warm-up
  complete (015); Free look and the challenge (016); Details tab contents and settings storage
  (017); removing legacy routes (018).
- Any change to the pipeline, the frozen contracts, `constants.ts` or `package.json`.

## Acceptance criteria

The task is complete when:
- the new routes render in the shell with the design tokens and self-hosted fonts (or the
  reported fallback), the track and the sheet frame;
- `no-scroll.spec.ts` passes for every new route and sheet tab at the five sizes;
- the sheet traps focus, closes on Esc and Done, returns focus, and opens from `#/details/<tab>`;
- the legacy flow still runs from `#/welcome`, and every existing e2e spec passes;
- `npm run check` passes.

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
