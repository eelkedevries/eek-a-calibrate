# eek-a-calibrate: a single-screen, no-scroll layout for phones (portrait and landscape) and desktops

Research report for the interface redesign, 4 November 2026. Scope: the app-shell architecture
that keeps every screen of the four steps (Start, Calibrate, Track, Play; the owner's names are
Intro, Calibrate, Eye tracking, Game) on one screen, without horizontal or vertical scrolling, from
a 360×560 phone with its browser bars showing up to a 1920×1080 desktop. No repository was modified.

Companion reports in the same folder cover the procedure of each step (`r-flow-game.md`) and the
positioning signals (`r-positioning.md`). This report does not repeat them. It decides the
geometry they have to fit into, and flags the three places where it disagrees with them (§10).

**Evidence labels**

- **[E]**: normative or primary documentation, or published research (URL given).
- **[V]**: vendor documentation or shipped tool data (URL or path given).
- **[S]**: secondary or community report (developer forum, pull request). Indicative only.
- **[P]**: measured in this session on a working prototype of the shell. Headless Google Chrome for
  Testing 153 driven by playwright-core 1.63, Lexend loaded, 25 viewport and text-size cases × 5
  screens = 125 renders. Chrome cannot emulate the iOS Safari toolbars, so iOS behaviour stays an
  open device check.
- **[D]**: derived here by arithmetic. The assumptions are stated.
- **[H]**: design judgement or heuristic. Not tested with users.

Prototype files (scratchpad, not in any repository):

- shell: `./proto/shell.html`
- measuring script: `./scripts/measure.mjs`
- results: `./proto-measure.jsonl`
- 100 screenshots: `./proto-shots/`

---

## 1. Decisions in one page

1. **Size the shell with `100svh`, and make sure the page itself never scrolls.**
   - `100vh` is the *large* viewport, so on a phone with its bars shown it "will bleed out of the
     viewport" [E: web.dev].
   - `svh` is the viewport with the browser bars expanded, and it is stable [E: web.dev].
   - Mobile bars retract only when the page scrolls. On a page that never scrolls, `dvh` therefore
     equals `svh` in the steady state, and `svh` adds no throttled resizes [E: web.dev; D].
   - Measured on iOS 26 Safari (iPhone 17): `100svh` = `innerHeight` = 714 px with the bars
     expanded, against `100lvh` = 754 px [S: scorebrawl PR #754].
   - Do **not** build the shell as `position: fixed; inset: 0`. iOS 26 Safari does not render fixed
     content below its floating controls [S: Apple Developer Forums 800798].
2. **One shell with four regions: top bar, stage, panel and action bar.** The stage is the only
   flexible region (`minmax(0, 1fr)`); every other region is `auto` and works to a fixed content
   budget (§4).
   - Two modes:
     - **framed**: the regions do not overlap;
     - **immersive**: the stage bleeds under everything, and the other regions float over it on
       translucent surfaces.
   - A third, **stimulus**, mode for calibration and validation has no regions at all.
3. **Switch layout by aspect ratio and height, not by `orientation` or device type.**
   - At aspect ≥ 5/4 the stage goes left and the panel right.
   - At height < 480 px (the "compact height" class, which covers "99.78 % of phones in
     landscape" [E: Android window size classes]) the top bar moves into the side column, so the
     stage keeps the full height.
   - Components such as the stepper, action row and preview switch by **container queries**, not by
     viewport width. The prototype showed why: a viewport query put the 4-label stepper into a
     310 px side column and overflowed it [P].
4. **The camera preview is sized from the stage, never from the page.** The stage is a size
   container. A contain-fit box is `aspect-ratio: W/H; inline-size: min(100cqw, 100cqh * W/H)`, and
   it cannot overflow at any of the 25 sizes tested [P]. In immersive mode the video is cover-fitted
   edge to edge, under the rule from `r-positioning.md` that at least 70 % of the frame stays
   visible.
5. **The top bar is 48 px**, with both ends carrying content (eek-a-style):
   - left: the mark, then the step indicator;
   - right: Details (⋯), which is a 44×44 target.
   - Phones show 4 segments plus "2 of 4 · Calibrate" (114 px [P]). The labelled 4-step stepper
     (348 px with the short labels, 408 px with the owner's labels [P]) appears only when the bar
     is ≥ 640 px wide.
   - Use **Start · Calibrate · Track · Play**. "Eye tracking" is 87 px against 38 px for "Track"
     [P], which costs the label on 300 px columns.
6. **The action bar holds one primary and at most one secondary action, at the bottom.**
   - Below a 320 px action row, the secondary action becomes a 56 px icon button.
   - The primary button is 56 px tall on touch screens. Hoober asks for edge rows of 9–10 mm, and
     56 CSS px is about 9 mm [E/D].
   - In compact-landscape screens the action bar sits in the column **away from the camera**, so
     the tapping hand does not cover the lens [H].
7. **Content budget at the minimum sizes** (§4). Write all copy to it, for the narrowest column
   (260 px):
   - headline ≤ 50 characters (aim for ≤ 26, one line);
   - body ≤ 100 characters (about 15 words);
   - one meta row of at most 3 chips or one ≤ 36-character telemetry strip;
   - primary label ≤ 18 characters, secondary ≤ 14.

   With that budget the prototype fits all 20 default-text viewports at tier 0. The exceptions are
   two cases that drop the meta row, and a 360×300 split screen, which degrades on purpose [P].
8. **A fit guard with independent ladders** (§6). A `ResizeObserver` checks every region for
   clipped content and degrades only that region:
   - **bar**: drop the wordmark, then "of 4", then the segments;
   - **actions**: secondary → icon → hidden;
   - **panel**: drop the meta row → body to 1 line plus "More" → headline only;
   - **preview** (Start step): below 240 px of stage height it collapses to a **ring indicator**.

   The guard is the safety net, not the design. The prototype's first guard coupled the ladders
   and wrongly dropped text whenever a button was too wide [P].
9. **Accessibility outranks "never scroll" only when the user enlarges text or zooms.** Reflow
   (1.4.10) and Resize text (1.4.4) mean content must not be lost at 200 % text [E: WCAG 2.2]. The
   last rung of the ladder is therefore a scrollable *panel*, never a clipped page.
   - Type is set in `rem`. A `vw`-based type size defeats zoom [E: Roselli].
   - Under that rule the prototype still fits at 125 % and 150 % text on a 360×560 phone. At 200 %
     on a 1366×617 desktop, one of five screens needs the panel scroll [P].
10. **Use sheets for everything secondary**, as a `<dialog>`:
    - a bottom sheet when the window is < 600 px wide and ≥ 480 px tall;
    - otherwise a side sheet, which includes phones in landscape, where a bottom sheet would be
      293–360 px tall.

    Rules: a visible Close button, Back dismisses it (Chrome 120+), no stacking, no long content
    [E: NN/g; Chrome 120]. Content is paginated. Whether About may scroll inside its sheet is the
    owner's decision (§10).
11. **Safe areas and the browser.**
    - Every region is padded with `max(gutter, env(safe-area-inset-*))`. The viewport meta already
      has `viewport-fit=cover`.
    - Since Chrome 135 this also opts into Android edge to edge, where `safe-area-inset-bottom`
      follows the gesture bar [E: Chrome edge-to-edge guide].
    - Set `overscroll-behavior: none` on `html` and `body`, so that a downward swipe on a propped
      phone cannot pull-to-refresh away a calibration [E: Chrome].
    - Give `body` the app background: Safari 26 tints its toolbars from the page background
      [S: WebKit bug 301756].
12. **Stimulus geometry is never tied to dynamic units.** This follows spec §4.7 and §14.2.4:
    - calibration uses element fullscreen on Android and desktop;
    - on iPhone, which has no element fullscreen (caniuse "partial"; WebKit bug 212934 WONTFIX
      [E/V]), it uses viewport mode measured once at block start;
    - the block pauses on a resize beyond tolerance or on `visualViewport.scale ≠ 1` (pinch
      zoom) [H].

---

## 2. Platform facts that constrain the layout

### 2.1 Viewport units [E]

- **Definitions** (web.dev, https://web.dev/blog/viewport-units):
  - `svh` is "the viewport sized assuming any UA interfaces that are dynamically expanded and
    retracted to be expanded";
  - `lvh` is the same with those interfaces retracted;
  - `dvh` is clamped between the two.
- **Support**: Chrome 108, Firefox 101, Safari 15.4.
- **`100vh` overflows.** On load, "elements sized to be `100vh` tall will bleed out of the
  viewport".
- **`dvh` lags.** Dynamic values "do not update at 60fps … updating is throttled as the UA UI
  expands or retracts".
- **The keyboard is not UA UI.** The on-screen keyboard "does not affect the size of the viewport
  units".
- **Keyboard behaviour in Chrome 108+ on Android** (https://developer.chrome.com/blog/viewport-resize-behavior):
  - "Chrome on Android will no longer resize the Layout Viewport, and instead resize only the
    Visual Viewport";
  - the default is `interactive-widget=resizes-visual`.

  An open keyboard therefore does not reflow the shell. That is acceptable because the four steps
  have no text inputs. The participant and session fields move into Details, per
  `r-flow-game.md`.
- **Container queries** fall back to small-viewport units: "If no eligible container is available
  … the container query length unit defaults to the small viewport unit"
  [E: MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries].

**Consequence [D].** A page that never scrolls never triggers the bar-retraction gesture, so in
practice `dvh` = `svh`. `svh` is the stable choice. It wastes the bar height only when a user
deliberately hides the bars, which iOS can do in landscape. In fullscreen and in Home Screen
(standalone) mode all three units are equal.

### 2.2 iOS 26 Safari ("Liquid Glass" floating bars) [S], with no Apple documentation found

- **Measured values** (iPhone 17, iOS 26 Safari; https://github.com/thor-coding-cowboys/scorebrawl/pull/754):

  | Bars | `innerHeight` | `clientHeight` | `100svh` | `100lvh` |
  |---|---|---|---|---|
  | expanded | 714 | 714 | 714 | 754 |
  | collapsed | 754 | 714 | 714 | 754 |

  With the address bar docked at the top, `visualViewport.offsetTop` is non-zero. That PR's fix
  used `h-dvh` sheets plus `padding-bottom: max(1.25rem, env(safe-area-inset-bottom))`.
- **Fixed content is cut off.** "Safari refuses to render content that is position: fixed or
  position: sticky if it goes below the iOS 26 navigation controls at the bottom of the browser"
  (https://developer.apple.com/forums/thread/800798, no Apple reply). The same thread reports that
  the bars take "large chunks of the useable screen" on an iPhone SE when the site does not scroll
  behind them.
- **The safe-area inset does not cover the toolbar.** `env(safe-area-inset-bottom)` "covers the home
  indicator, not that toolbar" (https://github.com/joebywan/daybook/pull/204, which sizes `#app`
  from `100svh` and says this is still to be confirmed on a device).
- **Safari 26 tints its bars from the page background**
  (WebKit bug 301756, https://bugs.webkit.org/show_bug.cgi?id=301756).

**Consequence [H].** Use `block-size: 100svh` in normal flow, not `position: fixed`. Set the `html`
and `body` background to `--color-background`. Before shipping, run a one-page device check in all
three Safari tab-bar modes (Compact, Bottom, Top): does the bottom of the action bar stay visible
and tappable? If it does not, the fallback is a JS custom property
`--app-h = visualViewport.height` (read only while `visualViewport.scale === 1`), which the shell
already accepts as `block-size: var(--app-h, 100svh)`.

### 2.3 Android Chrome edge to edge [E]

Source: https://developer.chrome.com/docs/css-ui/edge-to-edge.

- "From Chrome 135, the viewport is allowed to extend into Android's gesture navigation bar."
- With `viewport-fit=cover`, "the viewport will extend up to the bottom edge by default without the
  chin ever being visible".
- `safe-area-inset-bottom` "gets dynamically updated as the chin moves out of the way", and
  `safe-area-max-inset-bottom` (Chrome 135) is its maximum.
- Chrome advises against padding by the inset, because of layout thrashing *while the chin
  animates*. The chin moves only during scrolling, and this page does not scroll, so padding by
  `env(safe-area-inset-bottom)` is safe here [D].
- `index.html` already sets `viewport-fit=cover`
  (`/home/user/eek-a-calibrate/index.html`), so the app is already edge to edge on Chrome 135+.
  The reviewer found that no screen pads for it [R: review-findings.json, ui-mobile, style.css:168].

### 2.4 Fullscreen and orientation [E/V]

- **Element fullscreen.** Supported on Chrome for Android. Safari on iOS is "partial" up to 27.2
  (https://caniuse.com/fullscreen). The partial support is iPad and `<video>` only: WebKit bug
  212934, "fullscreen for non-video elements on iOS", is RESOLVED WONTFIX
  (https://www2.webkit.org/show_bug.cgi?id=212934). Spec §14.2.4 already provides the viewport
  mode for iPhone.
- **Screen Orientation API.** Safari 16.4 added `ScreenOrientation.type`, `.angle` and `onchange`,
  but not `lock()`
  (https://web-platform-dx.github.io/web-features-explorer/features/screen-orientation). A WebKit
  bug reports that iOS 16.4 is inconsistent here, and that tools read `window.orientation` first
  (https://lists.webkit.org/pipermail/webkit-unassigned/2023-April/1098018.html).
- **`orientation` media feature.** "Portrait" means height ≥ width. MDN warns that "opening the soft
  keyboard on many devices in portrait orientation will cause the viewport to become wider than it
  is tall"
  (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/orientation). Chrome 108's
  resizes-visual default removes this for Chrome, but the feature still describes the window, not
  the device. This is one more reason to switch on an aspect-ratio threshold with hysteresis
  (5/4), not on `orientation`.
- **WCAG 1.3.4 Orientation.** "Content does not restrict its view and operation to a single display
  orientation … unless a specific display orientation is essential"
  (https://www.w3.org/WAI/WCAG22/Understanding/orientation.html).
  - The app supports both orientations.
  - Locking the orientation *during a calibration block* (spec §14.2.3) is defensible as
    essential, because the mapping is invalid in the other orientation. Locking it app-wide is
    not [H].

### 2.5 Which sizes to design for

**Share of screen sizes** (StatCounter, October 2026 [V]):

- mobile (https://gs.statcounter.com/screen-resolution-stats/mobile/worldwide):
  - 414×896: 12.7 %;
  - 360×800: 8.6 %;
  - 384×832: 7.2 %;
  - 390×844: 5.3 %;
  - 393×873: 4.4 %;
  - 360×780: 3.3 %.
- desktop (https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide):
  - 1920×1080: 27.8 %;
  - 1536×864: 9.1 %;
  - 800×600: 8.9 % (probably bots or VMs);
  - 1366×768: 7.5 %;
  - 1280×720: 4.4 %;
  - 2560×1440: 3.8 %.

These are *screen* sizes. What the layout gets is the viewport minus the browser chrome.

**Usable viewports used by Playwright 1.63's device descriptors** [V: `playwright-core` `devices`,
read from `/home/user/eek-a-calibrate/node_modules`]:

- iPhone 13: 390×664 in portrait, **750×342** in landscape;
- iPhone 15: 393×659, and 734×343 in landscape;
- iPhone 15 Pro Max: 430×739, and 814×380 in landscape;
- iPhone 13 Mini: 375×629, and 712×327 in landscape;
- Pixel 7: 412×839, and 863×360 in landscape;
- **Pixel 5 in landscape: 802×293**, the shortest common case;
- Galaxy S24: 360×780, and 780×360 in landscape;
- Moto G4: 360×640.

**Window size classes** (Android, https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
[E]):

- compact width < 600 dp covers "99.96 % of phones in portrait";
- compact height < 480 dp covers "99.78 % of phones in landscape";
- for phones in landscape "two pane layouts are not practical" when the full-width chrome stays.

That is why the compact-height template below gives up the full-width top bar.

**Design envelope [D/H]**

| Class | Minimum to design for | Floor (must not break) | Comfortable |
|---|---|---|---|
| Phone portrait | 360×560 (a 360×640 Android with status and URL bars), 375×553 (an iPhone SE with Safari bars, estimated) | 320×460 (an iPhone SE first generation with bars); 360×300 split screen degrades | 390×664 to 430×739 |
| Phone landscape | 640×360 and 658×320 | 802×293 (Pixel 5) | 750×342 to 863×360 |
| Desktop | 1280×600 (a 1280×720 laptop with browser chrome); 1366×617 (a 1366×768 screen less the Windows task bar and the Chrome tab strip and toolbar) | 960×969 (a half-screen window: the portrait template) | 1536×730 to 1920×969 |

The desktop chrome heights are estimates [D]. The owner's figure of "1280×650 usable" falls inside
the range.

### 2.6 Touch, reach and target size

- **Grips** (Hoober, https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
  [E]): of 780 people observed touching their phones, 49 % used one hand, 36 % cradled the phone
  and 15 % used two hands. In 2017 the author added: "People touch the center of the screen. More,
  more quickly, more accurately, and by preference."
- **Accuracy** (Hoober 2017, https://www.uxmatters.com/mt/archives/2017/07/design-for-fingers-touch-and-people-part-3.php
  [E]):
  - "Accuracy varies from 7 mm at the center of the screen to 12 mm at the corners";
  - "Place key actions in the middle half to two-thirds of the screen";
  - edge rows should be "at least 9 or 10 mm in height";
  - "design everything about 20 % larger".
- **WCAG 2.5.8** (AA) sets a minimum of 24×24 CSS px
  (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). The spec already uses
  `MOBILE.minTouchPx = 44`.

**Consequence [D/H].**

- A full-width primary button at the bottom covers the horizontal centre that Hoober prefers.
- At about 160 CSS px per inch, 56 px is about 9 mm, which meets the edge-row rule.
- For a **propped** phone, the reaching hand comes from below. A bottom action keeps it out of the
  camera's view, while a top action would occlude the lens and can nudge the phone [H].

### 2.7 Type and zoom

- **WCAG 1.4.4 and vw-based type** (Roselli, https://adrianroselli.com/2019/12/responsive-type-and-zoom.html
  [E]):
  - "the `vw` value in your `calc()` will not change with zoom";
  - with `clamp()`, "never set the maximum font size to a value below twice the base font size";
  - "you must test it by zooming".
- **WCAG 1.4.10 Reflow** requires no two-dimensional scrolling at 320 CSS px width. It exempts
  "video, games … interfaces where it is necessary to keep toolbars in view"
  (https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). It does not require vertical
  scrolling, but content must not be lost.
- **Chrome's OS text-scale opt-in** (`<meta name="text-scale">`) was still Canary-only in early
  2026 (https://developer.chrome.com/docs/modern-web-guidance/guides/accessibility/respect-os-text-scale;
  https://joshtumath.uk/posts/2026-01-27-try-text-scaling-support-in-chrome-canary) [V/S]. Do not
  opt in yet. Design so that it would still work.

**Consequence.** Set the font-size tokens in `rem`: eek-a-style's 14/16/20/28 px become
0.875/1/1.25/1.75 rem. Do not use `vw` in type. Size *graphics* in `cq*` units, which do not need
to follow text zoom.

### 2.8 Sheets, steppers and the back button

- **Bottom sheets** (NN/g, https://www.nngroup.com/articles/bottom-sheet/ [E]):
  - they should "not be used on top of other bottom sheets or for displaying lengthy content";
  - avoid "replac[ing] typical page-to-page user flows";
  - provide "a clear Close button";
  - support "the use of Back for dismissing the bottom sheet".
- **Material** guidance: "bottom sheets can be swapped for side sheets to reduce the amount of
  space occupied on larger screens" (https://material.io/components/sheets-side [V]).
- **Back button (Chrome 120)**: `<dialog>` and `popover` respond to the Android back gesture
  through the CloseWatcher framework (https://developer.chrome.com/blog/new-in-chrome-120 [V]).
- **Progress indicators** (GOV.UK Design System, https://design-system.service.gov.uk/patterns/question-pages/
  [E, from service research]):
  - step-list indicators "are often not noticed", "take up lots of space", "do not scale well on
    small screens";
  - services "removed this style of progress indicator without any negative effects";
  - a simple "Step x of y" is acceptable.
- **Wizards** (NN/g, https://www.nngroup.com/articles/wizards/ [E]): show the steps, highlight the
  current one, and "label the steps descriptively".

**Synthesis [H].** On phones, show segments plus a text label ("2 of 4 · Calibrate"), which takes
114 px [P]. Show the full labelled list only where it fits comfortably (≥ 640 px of bar). Never
show it during stimuli.

### 2.9 Container queries [E]

- Supported in Chrome 106, Safari and iOS Safari 16.0, and Firefox 110, at 95.9 % global usage
  (https://caniuse.com/css-container-queries).
- The units (MDN): `cqw` and `cqh` are 1 % of the container's width and height, and `cqmin`/`cqmax`
  the smaller and larger of the two.
- The spec's mobile targets (iOS 17+, current Chrome) are all covered.

---

## 3. App-shell blueprint

### 3.1 Regions and modes

| Region | Contents | Height or width rule |
|---|---|---|
| **top** | mark · step indicator · position ring (from step 2 on) · Details (⋯) | 48 px (one 44 px target plus 4) |
| **stage** | the subject: an illustration, the camera preview, the zone map, the gaze canvas or the game board | `minmax(0, 1fr)`; a **size container** |
| **cue** (immersive only) | one instruction pill, near the camera edge | auto; one line at 20 px is 41 px |
| **panel** | headline, body, one meta row (chips or a telemetry strip) | auto, within the §4 budget |
| **actions** | one primary, at most one secondary | 56 px on touch, 48 px on a fine pointer |

**Modes**

- **Framed** (Intro, calibration intro, quality card, Play end screen): the regions do not overlap.
  The stage is a raised `surface` card at `radius.card`.
- **Immersive** (positioning, Track, Play board, the auto-pause overlay): the stage bleeds
  edge-to-edge, under the safe areas. top, cue, panel and actions float over it on
  `color-mix(surface 92 %)` pills or bars. In Track and Play they fade after 3 s without input,
  leaving only the ring and Pause [H].
- **Stimulus** (calibration, validation): there are no regions. The fullscreen canvas, or the
  viewport-mode canvas on iPhone, shows:
  - a 3 px progress line along the edge nearest the camera;
  - one 44 px Pause button in the corner farthest from the camera.

  Nothing else is shown. This follows the eek-a-style rule "remove non-essential UI from the
  stimulus area" and spec §14.2.7.

### 3.2 Root (all modes)

```css
/* index.html keeps: width=device-width, initial-scale=1, viewport-fit=cover */
html, body { margin: 0; block-size: 100%; overflow: hidden;
  overscroll-behavior: none;                    /* no pull-to-refresh, no rubber band */
  background: var(--color-background); }       /* Safari 26 tints its bars from this */

.app {
  --gutter: 16px;
  --pad-t: max(var(--space-sm), env(safe-area-inset-top));
  --pad-r: max(var(--gutter),   env(safe-area-inset-right));
  --pad-b: max(var(--space-md), env(safe-area-inset-bottom));
  --pad-l: max(var(--gutter),   env(safe-area-inset-left));
  block-size: 100vh;                    /* pre-2022 engines only */
  block-size: 100svh;                   /* fits with the browser bars shown */
  block-size: var(--app-h, 100svh);     /* set from JS only if the iOS 26 device check fails */
  inline-size: 100%;
  display: grid;
  padding: var(--pad-t) var(--pad-r) var(--pad-b) var(--pad-l);
  overflow: clip;                       /* clipping is a bug the guard reports, never a feature */
}
.stage { grid-area: stage; container-type: size; min-block-size: 0; min-inline-size: 0;
  position: relative; overflow: hidden; }
.top     { grid-area: top;     container: top / inline-size; }
.panel   { grid-area: panel;   min-block-size: 0; }
.actions { grid-area: actions; container: actions / inline-size; }
```

### 3.3 Grid templates (exact)

**A. Portrait-like windows: aspect < 5/4** (phones in portrait, tablets in portrait, half-screen
desktop windows):

```css
.app {
  grid-template:
    "top"     auto
    "stage"   minmax(0, 1fr)
    "panel"   auto
    "actions" auto
    / minmax(0, 1fr);
  row-gap: var(--space-sm);              /* 8 px */
}
```

**B. Landscape, regular height: aspect ≥ 5/4 and height ≥ 480 px** (desktops, laptops, tablets in
landscape):

```css
@media (min-aspect-ratio: 5/4) {
  .app {
    grid-template:
      "top   top"     auto
      "stage panel"   minmax(0, 1fr)
      "stage actions" auto
      / minmax(0, 1fr) clamp(300px, 30vw, 420px);
    column-gap: var(--space-lg); row-gap: var(--space-md);
  }
  .panel { align-self: center; }         /* the panel content is short; centre it beside the stage */
}
```

**C. Landscape, compact height: aspect ≥ 5/4 and height < 480 px** (phones in landscape). There is
no full-width bar, so the stage gets the whole height. The stage goes on the **camera side** and
the action column on the other side.

```css
@media (min-aspect-ratio: 5/4) and (max-height: 479px) {
  .app {                                  /* camera on the left: screen.orientation.angle === 90 */
    grid-template:
      "stage top"     auto
      "stage panel"   minmax(0, 1fr)
      "stage actions" auto
      / minmax(0, 1fr) clamp(260px, 38vw, 340px);
    column-gap: var(--space-md); row-gap: var(--space-sm);
    --pad-b: max(var(--space-sm), env(safe-area-inset-bottom));
  }
  .app[data-camera-side="right"] {        /* angle === 270 */
    grid-template-areas: "top stage" "panel stage" "actions stage";
    grid-template-columns: clamp(260px, 38vw, 340px) minmax(0, 1fr);
  }
}
```

**D. Immersive overlay grid**: the stage spans the whole grid and bleeds.

```css
.app[data-mode="immersive"] {
  grid-template:
    "top"     auto
    "cue"     auto                         /* instruction pill under the camera (portrait, desktop) */
    "."       minmax(0, 1fr)               /* the clear band: oval, gaze disc, game zones */
    "panel"   auto                         /* chips, status strip */
    "actions" auto
    / minmax(0, 1fr);
}
.app[data-mode="immersive"] .stage {
  grid-area: 1 / 1 / -1 / -1; z-index: 0; border-radius: 0;
  margin: calc(-1 * var(--pad-t)) calc(-1 * var(--pad-r)) calc(-1 * var(--pad-b)) calc(-1 * var(--pad-l));
}
@media (min-aspect-ratio: 5/4) {
  .app[data-mode="immersive"] .actions { justify-self: end; inline-size: min(100%, 420px); }
}
@media (min-aspect-ratio: 5/4) and (max-height: 479px) {
  .app[data-mode="immersive"] {            /* camera left: cue on the camera side, actions opposite */
    grid-template:
      "cue   top"     auto
      ".     ."       minmax(0, 1fr)
      "panel actions" auto
      / minmax(0, 1fr) clamp(260px, 38vw, 340px);
  }
  .app[data-mode="immersive"][data-camera-side="right"] {
    grid-template-areas: "top cue" ". ." "actions panel";
    grid-template-columns: clamp(260px, 38vw, 340px) minmax(0, 1fr);
  }
  .app[data-mode="immersive"] .actions { inline-size: 100%; }   /* a container must not shrink-wrap */
}
```

**Why 5/4 and 480 [H/E].**

- A 1:1–1.25:1 window, such as a half-screen desktop or a tablet in split view, is too square for
  a 300 px side column next to a useful stage, so it stays stacked.
- 480 px is the compact-height boundary of the window size classes [E].
- If the app ever reacts to resizes, give the switch about 24 px of hysteresis in JS, so that a
  window at exactly the boundary does not flap [H].

**Camera side [E/H].**

- Android: "if the device is rotated 90 degrees counter-clockwise … the returned value here will be
  Surface.ROTATION_90"
  (https://developer.android.com/reference/android/view/Display#getRotation()). The top edge, and
  so the camera, is then on the **left**.
- Use `screen.orientation.angle`, falling back to `window.orientation`:
  - 90 → camera left;
  - 270 → camera right;
  - 0 or 180 → camera at the top or bottom.
- Assume top-centre on desktops and iPads, whose webcams sit in the bezel.
- Verify the browser angle mapping on one Android phone and one iPhone; it is listed under open
  checks.
- Store the angle with the calibration. The reviewer found that a 180° turn goes undetected today
  [R: review-findings.json, ui-mobile, live.ts:239].

### 3.4 Top bar

`container: top / inline-size`. The switches are container queries on the bar's own width.

| Bar width | Left | Middle | Right |
|---|---|---|---|
| < 300 px (compact column, large text) | 4 segments + "**2** · Calibrate" | position ring (40 px) | ⋯ (44×44, icon only) |
| 300–639 px (phone portrait, landscape side column) | mark (24 px) + segments + "**2 of 4** · Calibrate" | ring | ⋯ Details (label from 360 px) |
| ≥ 640 px (desktop, tablet) | mark + "eek-a-calibrate" | labelled stepper: ① Start ② Calibrate ③ Track ④ Play (348 px [P]) | ring · ⋯ Details |

- Done segments and the current segment use `--color-text`; future segments use `--color-border`.
  The current step is **not** gold: eek-a-style's accent budget keeps the accent for the primary
  action and the live state.
- Completed steps can be tapped to go back. Steps ahead cannot.
- In stimulus mode the bar is not rendered.

### 3.5 Stage contents

**Contain-fit media box** (the preview, zone map or illustration with a fixed aspect):

```css
.fit { aspect-ratio: var(--ar); inline-size: min(100cqw, 100cqh * var(--ar)); }   /* --ar: 3/4, 16/9, … */
```

This needs a definite container size, which the grid track `minmax(0, 1fr)` provides.
Placing it in the stage cell is enough; no `max-height` hacks are needed. It produced no overflow
at any of the 25 sizes [P].

**Immersive preview** (cover-fitted):

- Use `object-fit: cover` on a 100 %×100 % mirrored `<video>`.
- Draw the overlays through the same cover transform (PocketGaze's `coverMap`,
  `r-positioning.md` §6).
- Keep at least 70 % of each frame dimension visible.
- **Do not auto-pan or auto-zoom the preview on the Start screen.** gaze-lite's `AutoFramer` and
  saccadacus's auto-panning keep the eyes centred in the *preview*. That hides exactly the
  off-centre position the user has to correct
  [R: `(session scratch, not kept)/research/repo-gaze-lite.md` §2.11; H].
  Auto-framing belongs in the small ring thumbnail during Track and Play, where only "are the eyes
  visible?" matters.

**Oval and target band.**

- The oval is `block-size: min(56cqh, 60cqw * 4/3); aspect-ratio: 3/4`.
- It must sit inside the clear band of grid D, never under the cue or the action bar.
- The band is 331 px tall at 360×560 portrait and 157 px at 802×293 landscape [D, from the
  measured region heights].

**Sizes measured in framed mode** [P]. Stage at the minimum sizes:

- 360×560: 328×303, so a 3:4 portrait preview is 227×303 and a 9:16 one 170×303 [D];
- 802×293: 449×277, so a 4:3 landscape preview is 369×277 [D].

### 3.6 Action bar

```css
.actin { display: flex; gap: var(--space-sm); }
.btn { block-size: var(--btn-h); min-inline-size: 0; white-space: nowrap; }
.btn.primary { flex: 1 0 auto; }                      /* never shrinks below its label */
@container actions (max-width: 319px) {               /* 260–318 px columns, 288 px floor phone */
  .btn.secondary { inline-size: 56px; padding: 0; }   /* icon plus aria-label */
  .btn.secondary .txt { display: none; }
}
:root { --btn-h: 56px; } @media (pointer: fine) { :root { --btn-h: 48px; } }
```

- In portrait the secondary action sits on the left and the primary takes the rest, over the
  horizontal centre.
- In landscape the bar sits at the bottom of the side column.
- In immersive regular landscape it is ≤ 420 px wide and right-aligned.
- **Measured failure the rule prevents** [P]: at a 260 px column, "Calibrate again" (123 px of
  text plus padding) and "Continue" truncated the *primary* button to "Conti…". The shrink rule
  plus the icon fallback fixed it in all cases.

### 3.7 Details sheet

- **Element**: a `<dialog>` (modal, focus-trapping, Esc and Back close it). It has:
  - a grip;
  - `radius.card` sides rising to `radius.sheet` at the top corners;
  - a scrim at `rgba(0,0,0,.55)`;
  - a "Done" primary button, per the eek-a-style sheet spec.
- **Bottom sheet** when the window is < 600 px wide and ≥ 480 px tall:
  - `max-block-size: 85svh`;
  - pad `env(safe-area-inset-bottom)`.
- **Side sheet** otherwise:
  - `inline-size: clamp(320px, 40vw, 440px)`, full height, from the edge opposite the camera
    on phones in landscape;
  - on a desktop it leaves the stage visible.
- **Content**: tabs (Quality, Method, Data, Diagnostics, About, per `r-flow-game.md` §3.3). Each tab
  is **paginated**, one card per page with ‹ › controls, so that nothing scrolls. About is the one
  candidate for internal scrolling; the owner decides.
- **Inputs** (participant or session ID) go in the upper half of the sheet. The keyboard overlays
  the lower half (Chrome resizes-visual default, iOS overlay).

---

## 4. Content budget per screen at the minimum sizes

**Measured type metrics** [P] (Lexend, eek-a-style tokens):

| Text style | Average width per character | Line height |
|---|---|---|
| 16 px regular | 7.65 px | 24.8 px (16 × 1.55) |
| 20 px medium | 9.77 px | 25 px (20 × 1.25) |
| 28 px medium | 13.67 px | — |
| 14 px regular | 6.69 px | — |

Characters per line (CPL) below allow about 10 % for word wrapping [D].

| Class (minimum size) | Content width | Stage | Headline (20 px; 28 px on desktop) | Body (16 px) | Meta row | Actions |
|---|---|---|---|---|---|---|
| Phone portrait 360×560 | 328 px | 257–303 px tall | ≤ 2 lines × 30 CPL | ≤ 3 lines × 38 CPL | 1 row (≤ 3 chips) | primary + secondary in one row; labels ≤ 18 and ≤ 14 characters |
| Phone portrait floor 320×460 | 288 px | 157–179 px tall | ≤ 2 × 26 | ≤ 2 × 34 | 1 row | primary + icon secondary |
| Phone landscape, compact (640×360 … 802×293) | side column 260–305 px; panel 157–224 px tall | full height (277–344 px) | ≤ 2 × 24, or 1 line if a meta row is shown | ≤ 3 × 31 | 0–1 | primary + icon secondary (row < 320 px) |
| Desktop 1280×600 | column 384 px; panel 448 px tall | 840×512 | ≤ 2 × 25 at 28 px | ≤ 6 × 45 | 1–2 | primary + secondary |

**Region heights at 360×560 portrait** [D, from §3]: 8 + 48 + 8 + stage + 8 + panel + 8 + 56 +
16. The stage and panel therefore share 408 px. Keeping the stage at least half of that ("the
subject gets the space", eek-a-style) gives a panel of at most 204 px:

- headline: 2 × 25 = 50;
- gap: 8;
- body: 3 × 24.8 = 74;
- gap: 8;
- meta row: 28.

That totals 168 px. It fits with 36 px to spare, which absorbs 125 % text [P].

**Universal copy budget [D/H].** Write every screen to the narrowest column, so that no screen
needs per-device copy:

- headline ≤ 50 characters (aim for ≤ 26, one line everywhere);
- body ≤ 100 characters (about 15 words);
- one meta row: ≤ 3 chips of ≤ 16 characters, or one telemetry strip of ≤ 36 characters
  (the eek-a-style "slim single-line inline strip");
- primary label ≤ 18 characters (≤ 130 px at 16 px medium [P]);
- secondary label ≤ 14 characters, plus an icon for the < 320 px fallback;
- in total, ≤ 30 visible words per screen, outside the stage.

This is stricter than the sibling's "≤ 30 words of body" (`r-flow-game.md` §2.3). That figure fits
portrait, but in landscape compact it fills a 157 px panel only with a 1-line headline and no meta
row [D].

**Immersive budget (positioning, Track, Play).** The overlays take 48 (bar) + 41 (cue) + 28
(chips) + 56 (actions) + gaps:

- at 360×560 this is about 229 px, 41 % of the height;
- in compact landscape, the top row (48) and the bottom row (56) leave a 157–232 px clear band.

**Rule [H]:** no more than one cue line and one chip row in immersive mode, ever. The full meter
list belongs only in Details → Diagnostics.

---

## 5. Rules every screen must follow (testable)

1. **Root.** `.app` uses `block-size: 100svh` in normal flow. `html` and `body` have
   `overflow: hidden` and `overscroll-behavior: none`. Never use bare `100vh`. Never use
   `position: fixed; inset: 0` for the shell.
2. **Exactly one flexible region**, the stage, at `minmax(0, 1fr)`. Every other region is `auto`.
   Any grid or flex child that may shrink sets `min-block-size: 0` / `min-inline-size: 0`.
3. **The stage is a size container.** Everything inside it is sized in `cq*` units or `%`. Media
   boxes use the contain-fit formula (§3.5). Nothing inside the stage sets a pixel height.
4. **Containers take their size from the parent.** Never put `container-type` on a shrink-to-fit
   element. In the prototype, a right-aligned `auto`-width action bar collapsed to 0 px and pushed
   the primary button out [P].
5. **Switch layout by aspect ratio (5/4) and height (480 px). Switch components by container
   queries.** Never use `orientation`, never user-agent sniffing, never viewport width for a
   component that can sit in a side column.
6. **Type in `rem`, graphics in `cq*`.** No `vw` or `vh` in font sizes. Any `clamp()` on type has
   `rem` ends and a maximum of at least twice the base size [E: Roselli].
7. **Copy is written to the budget in §4.** A copy change that breaks the budget fails the
   Playwright check (rule 15).
8. **No ellipsis as a design device.**
   - `line-clamp` and `text-overflow` exist only as the guard's safety net.
   - The guard counts a clamped element as overflowing.
   - Truncated body text moves behind a "More" link that opens the sheet.
9. **Targets.**
   - Every target is ≥ 44×44 CSS px.
   - The primary button is 56 px tall on `pointer: coarse` and 48 px on `pointer: fine`.
   - The primary never shrinks below its label.
   - Single-line labels (eek-a-style).
10. **Actions.**
    - At most one primary and one secondary visible.
    - Below a 320 px row, the secondary becomes an icon button with an `aria-label`.
    - Further actions live in Details.
    - Actions go at the bottom, on the side away from the camera when the camera is at a side.
11. **Safe areas.**
    - Every region is padded with `max(gutter, env(safe-area-inset-*))`.
    - Only the immersive stage background may extend under the insets.
    - No text, control, target, pursuit path or game zone may lie in an inset. This is spec
      §14.2.5's safe rectangle, which applies to the shell as well as the stimulus.
12. **Stimulus geometry is frozen** (spec §4.7, §14.2.4):
    - the canvas is measured once at block start, never from `dvh`;
    - a resize beyond tolerance, an orientation change or `visualViewport.scale ≠ 1` pauses the
      block.
13. **Accent budget.** Gold is used only for the primary button and the live-state indicator. The
    stepper, chips and borders stay neutral (eek-a-style).
14. **One instruction at a time** in immersive mode (the cue). Telemetry is one strip at most.
15. **The automated check** is a Playwright spec, extending the sibling reports' proposal:
    - visit every route and state at the 20 default-text viewports of §8;
    - assert `scrollWidth ≤ clientWidth` and `scrollHeight ≤ clientHeight` on the document;
    - assert no clipped `h1`, `p`, `.btn` or `.pill`;
    - assert guard tier ≤ 1 everywhere except the 360×300 split screen;
    - assert every target is ≥ 44 px;
    - repeat at 125 % root font size, where the "scroll" fallback must not trigger.

---

## 6. The fit guard and the fallbacks (for short phones and large text)

**Mechanism.** A `ResizeObserver` on `documentElement` and the stage, plus `document.fonts.ready`
and every screen change, runs `fit()`. Each region has its own ladder and degrades alone. The final
state is written to `data-*` attributes on `.app`, so that CSS does the hiding.

| Region | Trigger | Rung 1 | Rung 2 | Rung 3 |
|---|---|---|---|---|
| top bar | the bar or step label overflows | drop the wordmark, "of 4" and the Details label | drop the segments ("2 · Calibrate") | — |
| actions | any visible button overflows its label | secondary → 56 px icon (container query) | secondary hidden (it stays reachable from ⋯) | — |
| panel | any clipped headline, body, chip or cue | drop the meta row (T1) | body to 1 line + "More" (T2) | headline + "More" only (T3) |
| stage (framed) | min(w, h) < 120 px | hide the illustration (nothing lost) | — | — |
| stage (camera preview on Start) | stage height < 240 px | **ring indicator** in the bar + the cue text | preview on demand in a sheet | — |
| escape hatch | still overflowing (enlarged text or zoom only) | the panel becomes `overflow-y: auto` with an edge fade, never the page | — | — |

**The ring indicator [H]** is the compact position glyph from `r-positioning.md` §4.2: a 40 px
ring in the top bar, with a two-eye glyph or an auto-framed eye thumbnail inside.

| State | Ring | Mark | Shape |
|---|---|---|---|
| good | green | ✓ | solid |
| nudge | amber | ! | dashed |
| lost | red | ✗ | the ring breaks |

Colour is never the only cue; the mark and shape carry the same information (eek-a-style). It is
shown from step 2 on, and on Start whenever the preview has collapsed. Tapping it opens the
preview in a sheet.

**Very short or unusual windows [P/H]**

- **320×460 portrait floor**: tier 0, with an icon secondary on the narrow intro row. Copy within
  budget.
- **802×293 landscape (Pixel 5)**: tier 0 on all 5 screens. The 157 px panel holds a 2-line
  headline and a 2-line body.
- **360×300 split screen**: T3 on the framed screens (headline and primary only). **Block
  calibration** when the stimulus short side is < 280 px, or when a phone window is clearly not
  the full screen (for example `innerHeight < 0.6 × screen.height`). Show "Make the window larger
  or close split screen to calibrate" [H]. Calibration in a 300 px band would be meaningless.
- **Keyboard open** (inputs only in Details): the shell does not resize under resizes-visual or on
  iOS, so the sheet's inputs must sit in its upper half.
- **Large text**: at 125 % the portrait screens hold at tier 0 (only a too-wide secondary drops). At
  150 % on 360×560 the compact bar and primary-only actions apply, and the intro stage shrinks to
  129 px. At 200 % on desktop, one screen uses the panel escape hatch [P]. This is the intended
  WCAG-compatible behaviour.

---

## 7. Layout per step (geometry only; procedure in `r-flow-game.md`)

| Step and screen | Mode | Stage | Cue or panel | Actions |
|---|---|---|---|---|
| Start, before the camera | framed | illustration: phone at eye level with face distance | headline + ≤ 15 words + 3 chips (time · light · position) | **Start the camera** · How it works |
| Start, positioning | immersive | mirrored cover-fit preview, oval in the clear band, face outline and eye dots | cue: one instruction near the camera; panel: 3 status chips | **Continue** (enabled when held) · Settings |
| Calibrate, intro | framed | grey stimulus thumbnail with the target | "Look at each dot until it pops" + ≤ 60 characters | **Start calibration** (enters fullscreen) · Back |
| Calibrate, running | stimulus | the full canvas | none (3 px progress line) | Pause in the far corner |
| Calibrate, quality card | framed | zone map (the adaptive grid from `r-flow-game.md`) | "Good: 4 areas" + one cause + one strip (px first, % of the screen, ≈°) | **Continue** · Calibrate again |
| Track | immersive | gaze canvas (soft disc) | chips: "● Tracking · 28 fps" (auto-hides) | **Play the game** · Pause |
| Play, board | immersive | zones fill the stage; score at the top right | none | Pause in the corner |
| Play, end | framed | the zone map of the round | "16 of 16 popped" + one line | **Play again** · Calibrate again |
| Auto-pause (any phase) | immersive over the current phase | live preview + ghost "home" outline | cue: one instruction | Resume (automatic after 1 s in place) · Exit |

**Fullscreen continuity [H].** Enter fullscreen on the "Start calibration" tap, which is a user
gesture, and **stay in fullscreen through validation, Track and Play**. Each exit and re-entry
changes the geometry and, under spec §4.7, invalidates the fit. The framed quality card is
therefore rendered *inside* the fullscreen element; `<dialog>` sheets in the top layer also render
there. On desktops the browser keeps Esc for leaving fullscreen [R: review-findings, ui-desktop,
live.ts:1312], so Esc must not be the app's only Exit.

---

## 8. Prototype verification [P]

**Method.**

- A self-contained shell implementing §3 with the eek-a-style tokens, Lexend, and 5 representative
  screens (intro, positioning, calibration intro, quality card, Track).
- The 25 cases are 20 default-text viewports plus 5 large-text or split-screen cases.
- Insets of 0/47/21/47 were emulated for iPhone 13 in landscape, through
  `Emulation.setSafeAreaInsetsOverride`.
- `isMobile` and `hasTouch` were set for phones.
- Measured per render: document overflow, clipped text and buttons, region sizes, the guard state,
  and the minimum target height.

**Results at default text: no page overflow in any of the 125 renders; every target ≥ 44 px.**

| Viewport (CSS px) | Stage, framed (quality card) | Illustration box (intro) | Panel height | Bar / actions | Outcome |
|---|---|---|---|---|---|
| 320×460 (iPhone SE 1 with bars, floor) | 288×179 | 142×113 | 129 | 48 / 56 | all screens tier 0 (secondary as icon) |
| 360×560 (small Android with bars) | 328×303 | 232×185 | 105 | 48 / 56 | all tier 0 |
| 375×553 (iPhone SE 3 with bars, estimated) | 343×296 | 225×180 | 105 | 48 / 56 | all tier 0 |
| 360×640 (Moto G4) | 328×383 | 295×236 | 105 | 48 / 56 | all tier 0 |
| 390×664 (iPhone 13) | 358×407 | 322×258 | 105 | 48 / 56 | all tier 0 |
| 430×739 (iPhone 15 Pro Max) | 398×482 | 358×287 | 105 | 48 / 56 | all tier 0 |
| 412×839 (Pixel 7) | 380×582 | 342×274 | 105 | 48 / 56 | all tier 0 |
| 802×293 (Pixel 5, landscape) | 449×277 | 249×199 | 157 | 48 / 56 | all tier 0 |
| 658×320 (Galaxy S9+, landscape) | 350×304 | 274×219 | 184 | 48 / 56 | calibration intro: T1 (meta strip dropped) |
| 640×360 (Moto G4, landscape) | 332×344 | 299×239 | 224 | 48 / 56 | calibration intro: T1 |
| 750×342 (iPhone 13 landscape, insets; camera left or right) | 355×313 | 282×225 | 193 | 48 / 56 | all tier 0, both sides |
| 863×360 (Pixel 7, landscape) | 487×344 | 310×248 | 224 | 48 / 56 | all tier 0 |
| 820×1106 / 1180×746 (iPad) | 788×874 / 770×658 | — | 80 / 586 | 48 / 56 | all tier 0 |
| 1280×600 | 840×512 | 461×369 | 448 | 48 / 48 | all tier 0 |
| 1366×617 | 900×529 | 476×381 | 465 | 48 / 48 | all tier 0 |
| 1536×730 | 1060×642 | 578×462 | 578 | 48 / 48 | all tier 0 |
| 1920×969 | 1444×881 | 793×634 | 817 | 48 / 48 | all tier 0 |
| 960×969 (half-screen window → template A) | 928×745 | 658×526 | 80 | 48 / 48 | all tier 0 |
| 360×300 (Android split screen) | 328×123 | 111×89 | 25 | 48 / 56 | framed screens T3; immersive OK |
| 360×560 at 125 % / 150 % text | 328×254 / 328×229 | 208×166 / 116×93 | 154 / 179 | 48 / 56 | 125 %: secondary hidden on intro. 150 %: compact bar + primary only |
| 750×342 at 125 % text | 417×326 | 293×235 | 206 | 48 / 56 | intro T3 |
| 1366×617 at 200 % text | 900×529 | 476×381 | 465 | 48 / 48 | 1 screen uses the panel escape hatch |

**Five layout bugs the prototype exposed, all now encoded as rules:**

1. **Viewport-width breakpoints for a component that can sit in a side column.** The labelled
   stepper overflowed a 310 px column at 863×360. Rule 5.
2. **Button truncation the guard missed** ("Conti…"). The guard now checks `.btn`, and the primary
   button is `flex: 1 0 auto`. Rule 9.
3. **A container-query element with a shrink-to-fit width collapsed to 0.** Rule 4.
4. **Clamped text counted as fitting.** The guard now treats clamped text as overflow. Rule 8.
5. **Coupled ladders.** One too-wide button dropped all body text. The ladders are now
   independent (§6).

The prototype's own first draft of copy broke the §4 budget on calibration intro in the 260 px
column. Shortening the body to 50 characters fixed it, which is the case for writing copy to the
budget [P].

**Not verified here.** iOS Safari's real toolbars (all three iOS 26 tab-bar modes), Android's
gesture bar (`safe-area-inset-bottom` > 0 in portrait), in-app browsers (Instagram, Gmail
WebViews), real OS text scaling, and fullscreen transitions.

---

## 9. Device checks before shipping (manual checklist additions)

1. **iOS 26 Safari, all three tab modes** (Compact, Bottom, Top), portrait and landscape:
   - Are the action bar and its bottom 8 px visible and tappable?
   - Log `innerHeight`, `visualViewport.height` and `offsetTop` against `100svh`.
   - If the bar is covered, enable `--app-h` from `visualViewport.height`.
2. **Android Chrome, gesture navigation and 3-button navigation:** confirm that
   `env(safe-area-inset-bottom)` pads the action bar, and that there is no chin flash at load.
3. **Camera-side mapping**: on one Android phone and one iPhone, turn each way and confirm
   `screen.orientation.angle` 90 → camera left.
4. **Pull-to-refresh**: on a propped Android phone, a downward swipe during positioning must not
   reload.
5. **Text size**: Chrome Android Accessibility → Text scaling at 150 %, and iOS Safari "aA" page
   zoom at 125 %. The guard ladders apply, and nothing is clipped.
6. **Split screen and pop-up windows** on Android: calibration is refused with the message from §6.

---

## 10. Disagreements with the sibling reports, and decisions for the owner

1. **Which side of a phone in landscape gets what.**
   - `r-positioning.md` §6 puts "text and actions on the camera side".
   - This report puts the **preview and the cue** on the camera side and the **actions** on the
     far side. The tapping hand then stays away from the lens, so it neither occludes the camera
     nor nudges a propped phone. The text the user reads while positioning still sits beside the
     camera [H].
   - Both are untested. Decide on device.
2. **Breakpoints.**
   - `r-flow-game.md` §2.3 uses `@media (orientation)`, a 60/40 split and `max-height: 420px`.
   - This report recommends an aspect ratio ≥ 5/4 (so near-square windows stay stacked), compact
     height < 480 px (the Android size class [E]), and side columns of `clamp(300px, 30vw, 420px)`
     regular and `clamp(260px, 38vw, 340px)` compact (the measured minimum for two buttons plus a
     2-line headline [P]).
3. **The colour of the current step.**
   - `r-flow-game.md` §3.2 makes it gold.
   - This report keeps it neutral, under eek-a-style's one-to-two-accent budget: the primary
     button plus the live indicator already use both.
4. **For the owner: may anything scroll?**
   - Recommended: nothing in the four steps at default text. The panel escape hatch only at
     enlarged text or zoom, which accessibility requires. Inside the Details sheet, pagination
     everywhere except About.
   - If the owner wants zero scrolling even at 200 % text, content would have to be dropped, which
     WCAG 1.4.4 and 1.4.10 do not allow.
5. **Specification items** (to fold into the bump `r-flow-game.md` §11 proposes):
   - a §7 layout section with the shell rules of §5;
   - the no-overflow Playwright spec;
   - `ScreenGeometry` gains `orientationAngle`;
   - the split-screen refusal;
   - type tokens in `rem`.

---

## 11. Sources

**Viewport, browsers and platforms**

- web.dev, "The large, small, and dynamic viewport units": https://web.dev/blog/viewport-units
- Chrome, "Prepare for viewport resize behavior changes coming to Chrome on Android" (Chrome 108, `interactive-widget`): https://developer.chrome.com/blog/viewport-resize-behavior
- Chrome, "Chrome on Android edge-to-edge migration guide" (Chrome 135, `safe-area-max-inset-bottom`): https://developer.chrome.com/docs/css-ui/edge-to-edge
- Chrome, "Take control of your scroll" (`overscroll-behavior`, pull-to-refresh): https://developer.chrome.com/blog/overscroll-behavior
- Chrome, "New in Chrome 120" (CloseWatcher; `<dialog>` and popover close on Android Back): https://developer.chrome.com/blog/new-in-chrome-120
- Chrome, "Respect OS text scale": https://developer.chrome.com/docs/modern-web-guidance/guides/accessibility/respect-os-text-scale
- J. Tumath, "Try text scaling support in Chrome Canary" (2026): https://joshtumath.uk/posts/2026-01-27-try-text-scaling-support-in-chrome-canary
- Apple Developer Forums 800798, "iOS 26 Safari will not render position: fixed content below the browser controls": https://developer.apple.com/forums/thread/800798
- scorebrawl PR #754 (iOS 26 iPhone 17 measurements): https://github.com/thor-coding-cowboys/scorebrawl/pull/754
- daybook PR #204 (the safe-area inset does not cover Safari 26's floating bar): https://github.com/joebywan/daybook/pull/204
- WebKit bug 301756 (Safari 26 toolbar tint from the page background): https://bugs.webkit.org/show_bug.cgi?id=301756
- WebKit bug 212934 (fullscreen for non-video elements on iOS, WONTFIX): https://www2.webkit.org/show_bug.cgi?id=212934
- caniuse, Fullscreen API: https://caniuse.com/fullscreen
- caniuse, CSS container queries: https://caniuse.com/css-container-queries
- MDN, `orientation` media feature: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/orientation
- MDN, container queries and units: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries
- web-features explorer, Screen Orientation (Safari 16.4): https://web-platform-dx.github.io/web-features-explorer/features/screen-orientation
- WebKit bug-list mail, iOS 16.4 Screen Orientation inconsistency: https://lists.webkit.org/pipermail/webkit-unassigned/2023-April/1098018.html
- Android `Display.getRotation()`: https://developer.android.com/reference/android/view/Display#getRotation()
- Android window size classes: https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes

**Usage data**

- StatCounter mobile screen resolutions (October 2026): https://gs.statcounter.com/screen-resolution-stats/mobile/worldwide
- StatCounter desktop screen resolutions (October 2026): https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide
- Playwright 1.63 device descriptors: `playwright-core` in `/home/user/eek-a-calibrate/node_modules`

**Accessibility and interaction research**

- WCAG 2.2 Understanding 1.4.10 Reflow: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- WCAG 2.2 Understanding 1.3.4 Orientation: https://www.w3.org/WAI/WCAG22/Understanding/orientation.html
- WCAG 2.2 Understanding 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- A. Roselli, "Responsive Type and Zoom": https://adrianroselli.com/2019/12/responsive-type-and-zoom.html
- S. Hoober, "How Do Users Really Hold Mobile Devices?" (2013): https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
- S. Hoober, "Design for Fingers, Touch, and People, Part 3" (2017): https://www.uxmatters.com/mt/archives/2017/07/design-for-fingers-touch-and-people-part-3.php
- NN/g, "Bottom Sheets: Definition and UX Guidelines": https://www.nngroup.com/articles/bottom-sheet/
- NN/g, "Wizards: Definition and Design Recommendations": https://www.nngroup.com/articles/wizards/
- GOV.UK Design System, Question pages (progress indicators): https://design-system.service.gov.uk/patterns/question-pages/
- Material Design, side sheets: https://material.io/components/sheets-side

**The owner's material**

- eek-a-style: `/home/user/eek-a-style/source/visual/ui-and-interaction.md` (tool-ui: header ends, accent budget, radii, the mobile single-page-plus-sheets rule, the sheet spec, removing UI from the stimulus area); `visual-principles.md`; `data/visual/tokens.css`
- eek-a-calibrate: the specification (§4.7, §14.2); `index.html`; `src/app/style.css`
- Reviewer findings (ui-desktop, ui-mobile): `(session scratch, not kept)/review-findings.json`
- gaze-lite auto-framing: `(session scratch, not kept)/research/repo-gaze-lite.md` §2.11
- Sibling reports: `research/r-flow-game.md`, `research/r-positioning.md`
