# eek-a-calibrate: procedure and interface for the four steps (Intro, Calibrate, Eye tracking, Game)

Research report for the redesign of `eek-a-calibrate` (live at `https://eelkedevries.com/eek-a-calibrate/`), 4 November 2026. Scope: the best procedure and interface for the four main steps, for people who know nothing about eye tracking, on a phone in portrait and a computer webcam in landscape. The owner's hard constraints are a modern, clean design, **no horizontal or vertical scrollbar** (every screen fits the viewport), and continuous signalling of the phone or camera position so that angle and distance stay good.

## 0. Method and labels

- Sources: web search and full-text reading where it was possible (PDFs extracted with `pdftotext`, saved in `(session scratch, not kept)/downloads/flowgame/`), the earlier literature review (`(session scratch, not kept)/research/lit-sota.md`), the reviewer findings on the current UI (`review-findings.json`, areas `ui-desktop` and `ui-mobile`), the specification v0.4, the FOXIE demo (`/home/user/foxie-kindergaze-demo/kindergaze-demo/FOXIE_demo_kindergaze.py`), and the owner's design system `eek-a-style` (`source/visual/ui-and-interaction.md`, tool-ui profile).
- Labels:
  - **[E]** evidence read in the cited source (URL given);
  - **[E-sec]** evidence reported by a secondary source or a search snippet (the original was not read in full);
  - **[V]** vendor or product documentation (describes their own product, not independently tested);
  - **[H]** heuristic: my design judgement, not tested;
  - **[I]** inference or calculation from evidence.
- No repository was modified.

---

## 1. Executive summary (decision-relevant)

1. **The accuracy budget decides the layout, not the other way round.** Feit et al. (CHI 2017) give the rule a gaze target needs: width = 2 × (accuracy offset + 2 × SD of the gaze points), which held 94.9 % of gaze points in their data [E]. The app's AOI rule (`src/core/metrics/aoi.ts`) is the same rule. Applied to realistic webcam quality (offset + 2·SD ≈ 3–6°), my calculation gives [I]:
   - laptop at 55 cm: 3 × 2 zones at best, often 2 × 1;
   - **phone in portrait at 30–40 cm: only 1 column × 2–3 rows** (the screen spans just 9–13° horizontally);
   - phone in landscape: 2–3 columns × 1 row.

   So the game and the live "zones" demo must use an **adaptive rectangular grid** (columns and rows chosen separately), not the current n × n square grid. That changes a §6 contract (`aoiGrid: 0|2|3|4`), so it needs a specification bump.
2. **One app shell, four steps, nothing scrolls.** Header (brand · step indicator "2 of 4 · Calibrate" · Details), one hero region, one action bar. Portrait stacks these; landscape puts the hero left and the panel right. Expert material (engines, the 14-column results table, export, diagnostics, screen and distance measurement) moves into one **Details sheet**: a bottom sheet on phones, a side sheet on desktop. This follows eek-a-style's mobile rule (single page, secondary options in sheets, cards over dense tables) [E: eek-a-style].
3. **Intro = permission primer + positioning wizard.** Ask for the camera only after the user taps a button that says why. web.dev reports that allow rates rise after a user interaction, and says not to ask on page load [E]. Then show **one instruction at a time**, the most important failing check first, over a large mirrored preview with a target outline the face must fill. This replaces the current list of eight meters. Labvanced's "virtual chinrest" (align the live face mesh with a target mesh; pause the task whenever the head leaves the range) is the strongest precedent: most participants "learned rather quickly" to keep still [E: Kaduk et al. 2024].
4. **Positioning is signalled continuously, at three levels** [H, from E precedents]:
   - **green**: nothing is shown;
   - **amber**: a small posture chip near the camera edge with a plain instruction ("Come a little closer"), plus a soft edge glow;
   - **red**: automatic pause with the live preview and the target outline, resuming by itself once aligned for 1 s.

   The reference is the pose and distance measured at calibration (iris-based distance in cm, face centre, yaw, pitch, roll). On phones the DeviceOrientation tilt can tell "tilt the phone" apart from "lift your chin". This needs a one-tap iOS permission in a click handler [E-sec], and it contradicts spec §14.2.10 ("No device-motion sensors are used"), so it needs an amendment.
5. **Calibration for lay users: one target grammar ("look until it pops"), auto-advance, three short named parts.** Tobii's consumer set-up uses "7 calibration points that you need to look at until they pop" [E-sec: Tobii help]. Apple's iPhone Eye Tracking says "follow its movement with your eyes" [E]. Keep the spec's Standard protocol, which is evidence-based (fixations + pursuit + head poses), but present it as:
   - **Dots** (≈ 25 s);
   - **Follow** (≈ 18 s, pursuit);
   - **Turn your head** (≈ 25 s, shown as a Face ID-style ring that fills as the user turns: "gently move your head to complete the circle" [E-sec: Apple]);
   - **Check** (≈ 20 s, validation).

   There is no tapping per target: on a propped phone a tap shakes the device and the hand covers the screen [H].
6. **Quality in plain words, expressed as "zones you can use".** Map the existing `verdict` and AOI result to four outcomes, each with one likely cause and one action:
   - Great (6 zones);
   - Good (4 zones);
   - Rough (2 zones, left/right or top/bottom);
   - Didn't work.

   Research precedent for three-level grades: EyeLink's GOOD/FAIR/POOR [V]. Degrees, the target plot and per-estimator figures go to Details.
7. **Live gaze: a soft disc, not a hard dot.**
   - The disc's radius is the expected error; it fades with confidence and greys out outside the calibrated head range.
   - There is a "snap to zone" highlight (Apple offers "Snap to Item" [E]) and an optional trail or heatmap.
   - Smoothing is a One Euro filter tuned by its authors' two-step procedure [E]. Filtering reduced the required target size by 32–42 % in Feit et al. [E].
8. **Game: recommend "Pop!", a dwell game built on FOXIE's shrinking target with adaptive zones and a leaky dwell timer.**
   - A bubble appears in one zone and shrinks while the player looks into its zone. With a 1.0 s dwell (0.8 s from level 2) it pops; after 4 s unpopped it floats away.
   - A round is 16 bubbles (≈ 60 s).
   - Dwell evidence: novices use 500–1000 ms [E-sec]; "a thousand milliseconds is usually long enough to prevent false selections" [E: Majaranta et al. 2006]; with shrinking feedback there were 0.187 re-focus events per key, against 0.297 without it [E].
   - The game doubles as a quality check: hit rate, time-to-pop and median offset per zone feed a drift estimate and the end-screen "zone map".

   Two alternatives are documented in §8: **Firefly** (pursuit following, offset-invariant [E]) and **Peekaboo** (look-to-freeze, needs only 2 zones).
9. **Specification items this design touches**:
   - §6 `aoiGrid` becomes rectangular;
   - §14.2.10 device sensors;
   - §7 routes: Welcome/Camera/Screen/Distance merge into Start; Results becomes the Calibrate step's last screen; Data/About/Lab move into Details; a new Play route;
   - face size is measured on the delivered frame's short side, or by iris distance in cm, not as a fraction of video width (the portrait bug the reviewer found);
   - a new "no-overflow" Playwright check at six viewports.

---

## 2. Constraints that shape every step

### 2.1 What the current UI gets wrong (reviewer findings, measured)

| Finding (severity) | Measured | Consequence for the redesign |
|---|---|---|
| Welcome: primary action ≈ 2,100 px down a 2,280 px page (low) | 1280×800 and 1920×1080 | The intro must be one screen with one primary button |
| Camera screen: preview and meters not visible together; Continue ≈ 1,300 px below the preview (medium, desktop) | 1280×800 | Preview, instruction and Continue must share one viewport |
| Phone camera screen: preview starts below the fold; Continue three screens down; in landscape the preview is taller than the viewport (medium) | iPhone 13 portrait 390×664, landscape 750×342 | The preview's height must be bound to the viewport (container units) |
| Results table 1,606–1,679 px wide in a 358–1,120 px wrapper; verdict and the "Use" switch hidden (high) | desktop and phone | Lay users get a quality card; the table becomes cards in Details |
| Face-size meter uses face width ÷ video *width*, the short side in portrait; at 30–40 cm it says "move further away" (medium) | arithmetic in the finding | Use iris-based distance in cm, or normalise to the frame's short side |
| Live touch toolbar covers ≈ 30 % (portrait) to 45 % (landscape) of the stage (low) | iPhone 13 | Live controls collapse to one row plus the Details sheet |
| No safe-area insets on ordinary pages (medium) | iPhone landscape, 47 px insets | Every region pads with `env(safe-area-inset-*)` |
| Wake lock missing during download, calibration intro and Results (medium) | recorded fake wake lock | Hold the wake lock from "Start the camera" to leaving the app |

Source: `(session scratch, not kept)/review-findings.json` [E: measured by the reviewers].

### 2.2 The accuracy budget, translated into screen zones

- Realistic webcam accuracy is about 2–4° in good conditions, often worse, at up to ≈ 30 Hz [E: spec Appendix B; lit-sota §1].
- Smartphone-specific models reach 0.6–1° after ≈ 30 s of calibration, but only with a device stand, a near-frontal head pose and 25–40 cm [E: Valliappan et al. 2020, https://pmc.ncbi.nlm.nih.gov/articles/PMC7486382/]. Our engines are not that model, so plan for 2–4° on phones too [I].
- **Target-size rule** [E: Feit et al. 2017, https://www.microsoft.com/en-us/research/wp-content/uploads/2017/01/everyday_eyetracking-1.pdf]: S = 2(O + 2σ) per axis. The 2σ term covers ≈ 95 % of samples, and on their data an average of 94.9 % of gaze points fell inside. Even with infrared trackers at 65 cm, sizes ranged from 0.94 × 1.24 cm (good trackers) to 5.96 × 6.24 cm (the 90th percentile of users). Precision was worse toward the right and bottom edges. "Expert users may be able to reliably select targets with dwell times near 300 ms, but only if target sizes are appropriate for the tracking quality."
- The app's AOI rule (half-cell ≥ p75 accuracy + 2·RMS-S2S) is this rule.

**Calculated zone grids** [I]. Script: `(session scratch, not kept)/scripts/aoi_calc.py`. It uses the smallest (outermost) half-cell, eye on the screen normal, and gives columns × rows for "need" = offset + 2σ:

| Device and distance | Screen span | need 2° | need 3° | need 4° | need 6° |
|---|---|---|---|---|---|
| Laptop 14″ 16:9, 55 cm | 31.5 × 18.0° | 6×4 | 5×2 | **3×2** | 2×1 |
| Desktop 24″ 16:9, 65 cm | 44.4 × 25.9° | 6×6 | 6×4 | 5×3 | 3×2 |
| Phone 6.1″ portrait, 30 cm | 12.6 × 26.8° | 3×6 | 2×4 | **1×3** | 1×2 |
| Phone 6.1″ portrait, 40 cm | 9.4 × 20.3° | 2×5 | 1×3 | 1×2 | 1×1 |
| Phone 6.1″ landscape, 35 cm | 23.1 × 10.8° | 5×2 | 3×1 | 2×1 | 1×1 |
| Tablet 11″ landscape, 45 cm | 29.9 × 21.0° | 6×5 | 4×3 | 3×2 | 2×1 |

Consequences:

- A fixed 2×2 grid fails on a portrait phone unless offset + 2σ ≤ 3° at 30 cm [I].
- Sitting a little closer to a phone (30 rather than 40 cm) buys about one extra row, because the screen subtends more degrees [I].
- Valliappan found accuracy "decayed with increasing pan/tilt/roll, or as participants moved further away from the phone", and used 25–40 cm as the "optimal UX settings" [E]. Apple advises "a foot and a half" (≈ 45 cm) for iPhone Eye Tracking, on a stable surface [E: https://support.apple.com/en-gb/guide/iphone/iph66057d0f6/ios].
- Recommendation: aim for **30–40 cm on phones**, with 33 cm as the target marker, and 50–70 cm on desktops (the spec allows 45–85 cm) [H, grounded in E].

### 2.3 "No scrollbars" as an engineering rule, not a hope

- Use the small viewport unit for the shell: `100svh` "is always the safe maximum that fits without scrolling" while mobile browser bars are shown. `dvh` follows the bars but updates throttled [E: web.dev, https://web.dev/blog/viewport-units].
- Shell [H]:
  - `html, body { height: 100%; overflow: hidden }`;
  - `#app { height: 100svh; display: grid; grid-template-rows: auto minmax(0,1fr) auto }`;
  - the middle region gets `container-type: size` and `min-height: 0`;
  - inner sizes use container units (`cqh`, `cqw`, `cqmin`) and `clamp()`;
  - every edge pads with `max(16px, env(safe-area-inset-*))`.
- Orientation layouts [H]:
  - `@media (orientation: portrait)`: preview over text over action bar;
  - `@media (orientation: landscape)`: preview left (≈ 60 %), panel right (≈ 40 %);
  - `@media (max-height: 420px)` (landscape phones): the header shrinks to icons only and body text to one line.
- Content budget per screen [H]: a heading of ≤ 6 words, ≤ 30 words of body text, one primary button, at most two secondary actions. Anything else goes into the Details sheet.
- Enforcement [H]: a Playwright spec that visits every route and state at 360×640, 390×844, 844×390, 1280×720, 1440×900 and 1920×1080, and asserts `scrollWidth ≤ clientWidth` and `scrollHeight ≤ clientHeight` for the document and for every visible element without an explicit `overflow: auto` sheet body.
- Open decision: whether the expert Details sheet may scroll *inside itself* (§9.3).

---

## 3. The shell: four steps, a step indicator, one Details sheet

### 3.1 Steps and routes

| Step (label shown) | Contains (current routes) | Exit condition |
|---|---|---|
| **1 Start** | Welcome + Camera (+ optional Screen and Distance, now launched from Details) | Position checks green for 2 s (spec `holdMs`), or "Continue anyway" after 20 s |
| **2 Calibrate** | Calibrate + Validate + the quality card (replaces Results for lay users) | The user accepts the quality card |
| **3 Track** | Live | The user taps "Play" (or leaves) |
| **4 Play** | New game route | End screen: play again, recalibrate or back to Track |

The owner's names were Intro, Calibrate, Eye tracking and Game. I suggest shorter labels so that each fits one line on a 360 px phone: **Start · Calibrate · Track · Play** [H; eek-a-style asks for single-line labels].

### 3.2 Step indicator [H]

- In the header, between the brand (left) and **Details** (right). eek-a-style: "Both ends of a header bar carry content".
- Four short segments; the current one is filled in the accent colour (the only accent besides the primary button, per the accent budget). Beside it, the text "2 of 4 · Calibrate".
- Completed steps carry a ✓ and can be tapped to go back. Steps ahead cannot be tapped (design-system guidance: do not allow skipping ahead in a linear flow [V: Visa wizard pattern, https://design.visa.com/patterns/wizard/usage/]).
- **Hidden during stimuli** (calibration targets, validation, the game board). eek-a-style: "For calibration or measurement tasks, remove non-essential UI from the stimulus area". In those phases only a 3 px progress line at the top edge and a small Pause button in a corner remain, never at a target position (spec §14.2.7).

### 3.3 The Details sheet (expert features out of the way)

- **Trigger**: a "Details" text button with an icon at the right of the header, plus the URL flag `?details=1` for researchers.
- **Phone**: a bottom sheet with a grip handle, `radius.card` sides rising to `radius.sheet` at the top corners, scrim `rgba(0,0,0,.55)` and a "Done" primary action [E: eek-a-style sheet spec]. Material 3 distinguishes modal sheets (with a scrim) from standard sheets, and modal sheets trap focus [E-sec].
- **Desktop**: a 400–440 px right side sheet that leaves the hero visible.
- **Tabs** (each fits the sheet without scrolling, where possible):
  1. **Quality**: one card per estimator (Combined and each engine) with accuracy (px and % of the screen first, ≈degrees second, as spec §14.1.4 requires), precision, data loss, rate, verdict and a "Use this" switch. Cards replace the 14-column table (eek-a-style: "prefer cards over a dense table").
  2. **Method**: Engines (Auto recommended / choose); calibration length (Quick ≈ 35 s, **Standard ≈ 100 s**, Thorough ≈ 3 min); "Measure screen and distance" (card match, blind spot) for results in true degrees.
  3. **Data**: export (zip), stored sessions, delete all.
  4. **Diagnostics**: the Lab content (delegate, per-stage timings, crops, frame rate).
  5. **About**: method, metrics, licences, privacy.

---

## 4. Step 1, Start: permission priming and positioning

### 4.1 Evidence

- **Permission timing.** web.dev: "Only ask for permission after the user has interacted with the page"; "After a user interaction, allow rates increase to 30%"; "users are substantially more likely to allow access when they understand why a site is asking"; and if access is blocked, "detect that they blocked access using the Permissions API and offer a guide on how to change their settings" [E: https://web.dev/articles/permissions-best-practices].
- Material's permission patterns: critical permissions are educated and asked up front ("Educate before asking") [E-sec: https://m1.material.io/patterns/permissions.html]. The camera is critical to this app, so the intro *is* the education, and the request follows the user's tap.
- **Face-capture guidance in consumer products.**
  - Identity-verification SDKs check alignment, lighting and face visibility live, show specific prompts ("move closer" rather than "poor quality"), use an oval guide, auto-capture when all checks pass, and fall back to a manual path after a time-out (30 s by default) [V: Incode, https://developer.incode.com/docs/face-capture-design].
  - Onfido maps an on-screen oval onto the camera frame and gives visual and haptic feedback once the face fits [V: https://medium.com/onfido-tech/face-detection-and-tracking-on-android-using-ml-kit-part-1-fbee4200d174].
  - Apple's Screen Distance covers the screen with an alert when an iPhone is held closer than 12 inches; the Continue button becomes available only after moving the phone further away [V: https://support.apple.com/105007].
- **Research platforms.** Labvanced's virtual chinrest "provides on-screen feedback and instructions"; the user adjusts "until the blue face mesh is aligned with the green face mesh", and the sensitivity has six steps from very loose to very strict [E: Kaduk et al. 2024, https://pmc.ncbi.nlm.nih.gov/articles/PMC11289017/].
- **Phone set-up.**
  - Apple: "iPhone should be on a stable surface about a foot and a half away from your face … make sure that the camera has a clear view of your face and that your face is adequately lit" [E].
  - Valliappan: device stand, near-frontal pose, 25–40 cm, portrait. Accuracy on the stand was 0.42 ± 0.03 cm and hand-held 0.50 ± 0.03 cm, so hand-held is usable but the stand was the reference set-up [E].

### 4.2 Recommended Start screen (before the camera runs)

Portrait wireframe (360×640 minimum):

```
┌──────────────────────────────┐
│ eek-a-calibrate   ▬ ▭ ▭ ▭  Details │  header: brand · 1 of 4 · Details
│                              │
│   See where you look         │  H1 (≤ 6 words)
│   Your camera estimates      │  ≤ 30 words
│   where on the screen you    │
│   are looking. It all runs   │
│   on this device.            │
│  ① Set up  ② Calibrate 2 min │  three icon steps on one row
│  ③ Watch   ④ Play            │
│  [ Phone propped ▾ ]         │  device chip (auto-detected, changeable)
│                              │
│ ┌──────────────────────────┐ │
│ │     Start the camera      │ │  primary (accent), ≥ 48 px
│ └──────────────────────────┘ │
│  No images are stored or sent │  privacy line, muted
└──────────────────────────────┘
```

- **Copy** (formal British English) [H]:
  - "See where you look";
  - "Your camera estimates where on the screen you are looking. Everything runs on this device; no images are stored or sent.";
  - button: "Start the camera".
- **The capability check** is silent. Show it only if something fails ("This browser cannot run the face model. Try Chrome, Edge or Safari 17 or later."). The list of eight "Yes" rows goes to Details → Diagnostics.
- **Device chip**: "Phone propped up · Phone in hand · Computer webcam". It is pre-selected from `pointer: coarse` and the screen size (spec §14.2.1) and only changes copy and thresholds. "Phone in hand" is allowed but marked "less accurate" [H, from Valliappan's stand/hand-held comparison].
- **Denied camera**: replace the hero with a browser-specific two-line guide ("Tap the camera icon in the address bar, then Allow") and a Retry button. Detect "denied by the system" on macOS separately, because it needs System Settings [E-sec: Medium/W3C discussion in the search results; E: web.dev advice above].
- **Downloads**: start the face model download on the Start screen *before* the tap (it is needed anyway), and show one progress line under the button ("Preparing the face model · 62 %"). This fixes the reviewer's "no progress for 35 s" finding by registering the progress listener before `init`.

### 4.3 Positioning wizard (camera running)

Portrait wireframe:

```
┌──────────────────────────────┐
│ ‹  ▬ ▭ ▭ ▭  1 of 4 · Start  Details │
│ ┌──────────────────────────┐ │
│ │   mirrored preview        │ │  hero: ≈ 55 % of the height (cqh-bound)
│ │      ╭───────╮            │ │  target oval (dashed, muted)
│ │      │ face  │ ← arrow    │ │  live face outline (solid, signal colour)
│ │      ╰───────╯            │ │
│ └──────────────────────────┘ │
│   Come a little closer        │  ONE instruction, large
│   ●────────[■■■■]──────○      │  distance gauge, "48 cm → aim for 33"
│   ✓ Light   ! Distance  ✓ Level│  three chips, glyph + word
│ ┌──────────────────────────┐ │
│ │ Continue (holds when green)│ │  disabled until green for 2 s
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Landscape: the preview takes the left 60 % at full height; the instruction, gauge, chips and button sit in the right column.

**Instruction priority** (show only the first failing item) [H, ordering by how much each blocks tracking; thresholds from spec `SETUP` unless stated]:

| # | Check (signal) | Plain instruction | Threshold (amber → green) |
|---|---|---|---|
| 1 | Face found | "Show your face to the camera" | face present for ≥ 0.5 s |
| 2 | Distance (iris diameter → mm via the 11.7 mm iris and focal length; spec §4.4) | "Come a little closer" / "Move back a little" | phone 300–400 mm (target 330); desktop 500–700 mm (spec allows 450–850) |
| 3 | Centring (face centre in the frame) | "Move your face to the middle" with an arrow | \|dx\| ≤ 0.2, \|dy\| ≤ 0.25 (spec) |
| 4 | Head pose (yaw, pitch, roll) | "Face the screen" / "Lift your chin a little" / "Keep your head level" | \|yaw\|, \|pitch\| ≤ 15° (spec); \|roll\| ≤ 10° [H] |
| 5 | Phone tilt (DeviceOrientation β, γ; optional) | "Tilt the top of the phone back a little" / "Stand the phone upright" | β 65–100°, \|γ\| ≤ 10° [H] |
| 6 | Light (face luma, backlight ratio) | "Turn on a light in front of you" / "A bright light is behind you" | luma 60–200, backlight ≥ 0.8 (spec) |
| 7 | Glare in the eye boxes | "Tilt your glasses or the light to remove reflections" | ≤ 2 % (spec) |
| 8 | Steadiness (head angular speed; device motion if granted) | "Hold still for a moment" | head speed ≤ 60°/s (spec frame acceptance); hand shake [H] |
| 9 | Frame rate | (no instruction; shown only if < 15 Hz) "This device is slow; close other tabs" | ≥ 20 Hz (spec) |

Why distance in **cm** rather than face width: the reviewer showed that face width ÷ video width misreads in portrait [E: review]. The iris method is the one MediaPipe's authors report with < 10 % depth error [E-sec: lit-sota §6.5]. A number in centimetres is also meaningful to lay users ("about the length of a ruler") [H].

**How the three chips collapse the eight meters** [H]:

- **Distance** = item 2;
- **Position** = items 3–5, 8;
- **Light** = items 6–7.

Each chip shows ✓ or ! with a word, so status never rests on colour alone (eek-a-style). The full eight meters are in Details → Diagnostics.

**Auto-advance**: when every chip has been green for 2 s, the Continue button fills like a progress ring over 1 s and then advances. This is the "auto-capture" pattern [V: Incode]. "Continue anyway" appears after 20 s (spec), as Incode's manual fallback does after its time-out [V].

**Eyewear question**: drop it from the default flow. Glare is measured directly (item 7), and the question can live in Details → Method for researchers [H].

### 4.4 Using the phone's tilt sensor (DeviceOrientation): benefit and cost

- **Benefit** [I]: face pitch measured by the camera mixes two causes, the head bowed and the phone leaning back. Gravity-referenced tilt β separates them, so the instruction can be right ("Tilt the phone" against "Lift your chin"). The variance of β and γ also tells a propped phone from a hand-held one, and detects a bump to the phone after calibration even when the face pose is unchanged.
- **Cost** [E-sec]:
  - on iOS, `DeviceOrientationEvent.requestPermission()` must run inside a user gesture (click or touchend, not touchstart), only over HTTPS, and one grant covers motion and orientation (https://yal.cc/js-device-motion/; https://developer.apple.com/forums/thread/128376);
  - calls made after a round trip to a Worker can be denied (https://bugs.webkit.org/show_bug.cgi?id=269706).
- **Recommendation** [H]: request it on the same tap as "Start the camera" on iOS (both prompts in one gesture: the camera first, then orientation). Treat it as optional: without it, chip 5 falls back to face pitch only.
- **Specification**: §14.2.10 says "No device-motion sensors are used". Using them needs an amendment (v0.5) and a privacy note: orientation data stays on the device and is used only for guidance.

---

## 5. Keeping the position good after set-up (continuous signalling)

### 5.1 Reference pose and tolerances

At the end of calibration, store the reference: distance (mm), face centre, yaw, pitch and roll, and β/γ where available. Deviation states [H; Labvanced's adjustable sensitivity is the precedent, E]:

| State | Distance | Centre | Yaw / pitch / roll | Phone β / γ | Duration |
|---|---|---|---|---|---|
| Green | within ±12 % | within 0.08 of the frame | within ±6° | within ±5° | — |
| Amber | ±12–25 % | 0.08–0.15 | ±6–12° | ±5–10° | any |
| Red (pause) | > ±25 % | > 0.15, or face lost | > ±12° | > ±10° | > 400 ms (spec: face lost > 400 ms pauses blocks) |

The spec's frame-acceptance limits (|yaw| ≤ 25°, |pitch| ≤ 20° for fixations) remain the hard data gate. The table above is a stricter *guidance* band, because accuracy degrades with pose [E: Valliappan; lit-sota §5.4].

### 5.2 How each state is shown [H]

- **Green**: nothing. The subject (targets, gaze, game board) keeps all the space (eek-a-style: "the subject gets the space").
- **Amber**:
  - a posture chip at the edge nearest the camera (top centre in portrait; in landscape the camera side, detected from `screen.orientation.angle`): a small face glyph with an arrow and one phrase ("Come a little closer");
  - plus a soft glow on the screen edge in the direction of the needed correction.
  - The chip never sits over a target position (spec §14.2.7).
  - Motion is calm: a 200 ms fade (eek-a-style).
- **Red**:
  - pause the block or game automatically and show a centred card with the live preview, the reference outline (the "ghost" of the calibrated pose) and the one instruction (the Labvanced pattern [E]);
  - resume by itself when green has held for 1 s, with a 3-2-1 count on the target;
  - after 10 s, offer "Recalibrate" as well.
- **Orientation change** (phone turned): this always invalidates. Use the spec's wording, "Rotate back to the orientation you calibrated in, or recalibrate", and also store the orientation *angle* (the reviewer found 180° turns undetected).

### 5.3 Why not always show the preview?

The preview is a strong distractor during calibration and the game. The task needs the eyes on the targets, and a face video invites looking at oneself [H]. Labvanced shows the face only when the head leaves the range [E]. A tiny thumbnail can be offered in Track (Details → "Show camera") for curiosity.

---

## 6. Step 2, Calibrate

### 6.1 Evidence on procedure

| Question | Evidence | Label |
|---|---|---|
| Points against time | Diminishing returns beyond ≈ 4–9 points for well-conditioned models; noisier pipelines keep improving with density (RealEye 137 px at 5 points → 92 px at 78 points; WebGazer 13.6° → 10.3° with denser grids); Labvanced uses ≈ 120 targets over 7 head poses in 5 min | lit-sota §5.2 [E/V] |
| Smartphone | Personalisation with ≈ 100 frames (< 30 s) cut error from 1.92 to 0.46 cm; dot calibration used a pulsating green target (18–50 dp every 300 ms) and a 60 s zig-zag pursuit | Valliappan 2020 [E] |
| Pursuit calibration | With an IR tracker, durations ≥ 10 s reached < 1°; the 5 s version (23.3°/s) was 2.15× worse; corners caused catch-up saccades that broke the gaze–target correlation; accuracy was computable only after ≈ 40 % of the path and stable at ≈ 66 %; a game version ("Stargazing", shooting stars) calibrated 30 of 37 passers-by in a median 30.9 s | Pfeuffer et al. 2013, https://www.unibw.de/usable-security-and-privacy/publikationen/pdf/pfeuffer2013uist.pdf/@@download/file/pfeuffer2013uist.pdf [E] |
| Fixation + pursuit | Pooled fixation + pursuit calibration gave the best webcam accuracy (2.58°) | Saxena et al. 2022 (lit-sota) [E] |
| Head poses | Calibrating across head poses makes the estimator less pose-sensitive; on phones, "users fixate on calibration points while moving their phones" | lit-sota §5.4 [E]; https://arxiv.org/abs/2508.10268 [E: abstract] |
| Gamified calibration | Three calibration games were "significantly more enjoyable" than standard procedures "without a loss in data quality" | Flatla et al. UIST 2011, https://doi.org/10.1145/2047196.2047248 [E: abstract] |
| Children and difficult participants | A 45-dot routine "proved to be unsuccessful for young children"; a horizontal smooth-pursuit target (an interesting moving target) took 30–60 s and was not significantly worse than dots, and worked for children with ADD/ADHD | Blignaut 2017, https://bop.unibe.ch/JEMR/article/view/3676 [E: abstract] |
| Infant attention-getters | Animated targets with globally distributed complexity gave the highest accuracy; alternating precise targets helps infants tolerate repeated calibrations; infant calibrations typically have only 5–6 targets; animated GIFs and sound replace dots in infant modes | Schlegelmilch & Wertz 2019, https://pure.mpg.de/pubman/item/item_3066166_7/component/file_3377246/115%20Schlegelmilch_Effects_2019_Postprint_JH_final.pdf [E-sec: abstract and snippets]; psychopy_tobii_infant (sound during a 5-point calibration, shrinking stimulus) [E-sec] |
| Consumer calibration | Tobii Experience: "7 calibration points that you need to look at until they pop"; "Improve calibration" later | https://help.tobii.com/hc/en-us/articles/115003827934 [E-sec: page refused fetching; search snippet] |
| | iPhone Eye Tracking: "As a dot appears in different locations around the screen, follow its movement with your eyes"; calibrate every time it is turned on; recalibration starts automatically "if you change the position of your face or your iPhone" | Apple [E] |
| | Apple Vision Pro: look at each dot and pinch, in three lighting conditions | press reports [E-sec] |
| | RealEye webcam v3 defaults to a quick 4-point calibration | [V: https://realeye.io/support/realeye-webcam-v1-vs-v3] |
| Attention check | GazeCapture: a pulsating red circle for ≈ 2 s, recording from 0.5 s after onset; an "L" or "R" flashed for 0.05 s and the worker tapped that side; a wrong tap meant a warning and repeating the dot | Krafka et al. 2016, https://arxiv.org/abs/1606.05814 [E] |

### 6.2 Recommended calibration procedure (lay version of the spec's Standard preset)

Keep the spec's protocol (§4.7), which is the evidence-based part: CAL13 fixations, a 16 s Lissajous pursuit, HEAD5 head motion and a VAL12 check. Change only its presentation [H unless stated]:

| Part (on-screen name) | Spec block | Time | What the user sees and does |
|---|---|---|---|
| Intro card | — | 5–8 s, self-paced | One sentence and a 3-second looping demo of a dot shrinking and popping: "Look at each dot until it pops. Keep your head still." A large "Start" button; tap anywhere on phones (spec §14.2.7) |
| **1 Dots** | A: CAL13 | ≈ 25 s | Bullseye target with the shrinking ring (spec: 3° → 0.6° over 400 ms) and a pop when the sample window ends. **Auto-advance**: acceptance is decided by face and eye checks, not by gaze (there is no calibration yet). A failed point retries once at the end (spec) |
| **2 Follow** | B: pursuit | ≈ 18 s | "Follow the dot with your eyes." The same target glides along the Lissajous path; peak speed capped at 15°/s (spec), well below Pfeuffer's problematic 23°/s [E]. No corners (the Lissajous is smooth), so no catch-up saccades [E] |
| **3 Turn your head** | C: HEAD5 | ≈ 25 s | "Keep looking at the dot and slowly turn your head, as if saying no; then nod." A Face ID-style ring around the target fills in four sectors as yaw and pitch reach them (the spec's pose guide). Apple's set-up uses the same metaphor: "gently move your head to complete the circle" [E-sec] |
| **4 Check** | VAL12 | ≈ 20 s | "Last check: look at each dot." The same pop grammar; no feedback per point (avoids bias); then "Scoring…" (≤ 2 s) |
| Quality card | Results | self-paced | §6.4 |

Total ≈ 95–110 s including instruction cards. Between parts, a 1-screen card shows progress ("Part 2 of 4 · Follow") and a short "Ready?" with auto-continue after 3 s or a tap [H].

Choices and their reasons:

- **Auto-advance, not tap-to-confirm.** Evidence for tapping is weak in this context. GazeCapture tapped to *verify attention* in crowd workers [E], and Vision Pro pinches because the hands are free [E-sec]. For a self-motivated user with a propped phone, a tap moves the device and the hand covers the screen near the target [H]. Tobii and Apple consumer flows auto-advance [E/E-sec]. Keep an optional attention check (GazeCapture-style L/R) only for unattended research sessions, in Details → Method [H].
- **One target grammar everywhere.** The same "look until it pops" target is used in calibration, the check, drift checks and the game (§8). The user learns one rule once [H]. Flatla et al. show that game elements make calibration more enjoyable without lowering data quality [E].
- **Visual style.** A pulsating disc (Valliappan's 18–50 dp every 300 ms; Krafka's pulsating circle) is the minimum. The spec's bullseye-plus-cross helps precise fixation [E: spec]. For children or "Fun" mode, an animated character target (a firefly or a bubble) with a sound on pop [E-sec: infant practice; H for the specific design]. Under `prefers-reduced-motion`, the target is static and pursuit can be skipped (spec §7).
- **Progress.** A thin line at the top edge, plus the part count on the between-part cards. No numbers during targets [H].
- **Sound.** A soft tick on onset and a pop on completion (optional, on by default in Fun mode). Majaranta et al. found combined visual and auditory feedback helped at both short and long dwell times [E: https://www.yorku.ca/mack/uais2006.html].
- **Quick and Thorough** stay available in Details → Method. Quick (CAL9 + VAL6, ≈ 35 s) is the "Short" option for repeat users; the default stays Standard, because head-pose and pursuit coverage are the strongest evidence-based levers (lit-sota §6) [I].

### 6.3 During calibration: pauses and failures

- **Face lost > 400 ms, fullscreen exit, hidden tab** (spec): this is the red state of §5.2, with the preview, the ghost outline and one instruction, and automatic resume.
- **Repeated failures** (≥ 3 pauses in one part): offer "Stop and fix the set-up" (back to the Start positioning screen) instead of grinding on [H].
- **iPhone (no element fullscreen)**: viewport mode (spec §14.2.4), with the hint "For best results, add this page to your Home Screen" [H; whether this helps should be checked manually].

### 6.4 Presenting calibration quality to lay users

Map the existing `ValidationReport.verdict` and the AOI result (made rectangular, §1 and §11) to four outcomes [H; thresholds come from the spec's verdict table]:

| Outcome (headline) | Condition | Zone picture | One-line cause → action | Primary action |
|---|---|---|---|---|
| **Great** | verdict good, zones ≥ 6 | the screen miniature split into its zones, all ✓ | "Your set-up works well." | Continue |
| **Good** | verdict acceptable, or zones 3–5 | the zones ✓ | "Good enough for the game; more light in front of you may help." | Continue (secondary: Calibrate again) |
| **Rough** | verdict poor, or zones = 2 | two halves ✓ | the most likely cause from the frame log, for example "The light was behind you" or "Your head moved a lot" → "Fix and try again" | **Calibrate again** (secondary: Continue anyway) |
| **Didn't work** | not-tracking, or zones < 2 | — | the cause, for example "Your face was often lost; prop the phone up" | Calibrate again (secondary: Back to set-up) |

- **Below the headline**: the VAL12 targets drawn on the screen miniature as small marks, ✓ inside the zone or ✗ outside, each with a glyph, so the result never rests on colour alone. Degrees, the target plot, the data-loss funnel and the per-engine cards go to Details → Quality.
- **The precedent for grades**: EyeLink's validation reports GOOD (average < 1.0°, maximum < 1.5°), FAIR and POOR [V: https://sr-research.com/support/thread-244.html]. The research world already uses three plain words. Our thresholds must be webcam-scale, and "zones" carries the meaning lay users need [I].
- **Never** show "Accept and continue" as the primary action when the outcome is "Didn't work" (the reviewer found exactly that) [E: review].

### 6.5 When to recalibrate

Evidence: published webcam studies recalibrate every 1–16 trials. Labvanced recalibrated 7 points after every 6 trials; Prystauka et al. every 16 trials. WebEyeTrack's error grew from 7.24 to 8.72 cm over ≈ 20 min [E: lit-sota §4, §5.5; Kaduk et al.]. Apple recalibrates automatically when the face or phone position changes [E].

Recommendation [H]:

- **Mandatory** after an orientation change, a camera change or a viewport change (spec).
- **Prompted** ("Quick re-check, 10 s"; RECAL5) when any of these hold:
  - the red position state lasted > 10 s;
  - the game's hit rate falls below 50 % over the last 6 targets;
  - drift is estimated > 1 zone-quarter;
  - ≥ 5 minutes since calibration (spec `driftEveryMin` remains the researcher's override).
- **Silent offset correction** from game pops (§8.4) when offsets are consistent across zones; this is the spec's drift machinery, fed by game data.

---

## 7. Step 3, Track (live gaze)

### 7.1 Options for showing gaze

| Visual | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| Hard dot (red, small) | Familiar from demos (gaze-lite, Look to Learn's "larger red dot" [V]) | Implies false precision; jitter is very visible; people try to "push" an offset dot (anecdotal "chasing" reports in AAC forums [E-sec, weak]) | Only as the raw-data option in Details |
| **Soft disc**, radius = expected error (e.g. p68 of validation error), opacity = confidence | Honest about uncertainty; jitter is less disturbing; matches the spec's confidence ring | Less "game-like" | **Default** [H] |
| Snap-to-zone highlight (the zone containing the gaze lights up) | Shows what the system can reliably tell apart; Apple's "Snap to Item: have the pointer automatically move to the item … closest to where you're looking" [E] | Coarse | **Default overlay** in Track and the only gaze feedback in the game [H] |
| Trail / heatmap | Fun after the fact; good for "where did I look?" | Distracting live; heat accumulates offsets | **Toggle** ("Show where I looked"), and replay at the end of the game [H] |

### 7.2 Smoothing and confidence

- **One Euro filter** (spec §4.11). Its authors' tuning: set β = 0, set the minimum cut-off to ≈ 1 Hz to remove jitter at rest, then raise β by factors of 10 while moving quickly until lag is acceptable [E: https://cristal.univ-lille.fr/~casiez/1euro]. Feit et al. found that a weighted average with saccade detection reduced the required target size by 32–42 %, and that a One Euro filter beat a plain weighted average but reacted poorly to saccade jumps [E]. For a 15–30 Hz webcam, tune on recorded sessions and show the raw data only in Details [H].
- **Apple** exposes a "Smoothing" slider for the same trade-off [E]. Do not expose one to lay users; researchers get it in Details [H].
- **Confidence**: the disc fades with face confidence and greys out outside the calibrated head range (spec), and it hides during blinks (spec blink masks) [E: spec].

### 7.3 Track screen layout [H]

- **Portrait**: full-screen stage with the zone grid faintly drawn and the soft disc. A single bottom row (≥ 44 px) holds **Play** (primary, accent), **Re-check** and **Details**. A one-line status strip ("30 fps · good light") in muted mono at the top, the eek-a-style "slim single-line inline strip". The controls auto-hide after 3 s of steady tracking and reappear on a tap. This fixes the toolbar that covered 30–45 % of the stage [E: review].
- **Landscape**: the same, with the action row at the right edge in a vertical stack if the height is < 420 px.
- **Keyboard (desktop)**: Space = Play, R = record (researcher), C = re-check, Esc = back. Do not rely on Esc in real fullscreen, because the browser keeps Esc for leaving fullscreen [E: review]; give every Esc action a visible button.
- **Recording and markers** (R, M) are researcher features: they stay, but are only shown when Details → Data → "Recording" is on.

---

## 8. Step 4, Play (gaze-contingent game)

### 8.1 Requirements derived from evidence

1. **Targets must be at least one zone** in the adaptive grid (§2.2). Never fewer than 2 zones; at 1 zone, offer "Calibrate again" instead of the game [I from Feit].
2. **Dwell selection with visible progress**:
   - novices typically use 500–1000 ms [E-sec: review citing Majaranta & Räihä 2007];
   - "A thousand milliseconds is usually long enough to prevent false selections" [E: Majaranta et al. 2006];
   - at 900 ms, a shrinking-key animation raised speed (7.02 against 6.65 wpm) and lowered re-focus events (0.187 against 0.297 per key), though some found it "disturbing and tiring in the long run";
   - at 450 ms, animation has too little time to help [E: same];
   - Look to Learn has learners dwell ≈ 1–2 s [V: https://support.inclusive.com/article/look-to-learn].
   - **FOXIE** uses a 1.0 s central fixation check and a target that shrinks from 2° to 0.05° radius over 1.0 s while gaze stays inside a 2° window, resetting fully when gaze leaves [E: `FOXIE_demo_kindergaze.py`, lines 50–59 and 560–590].
3. **Midas touch**: Jacob named it; dwell is the practical answer, and the dwell length trades speed against false selections. If a wrong selection is trivially undone, short dwell is fine; for costly actions, confirm separately [E-sec: https://bibtex.github.io/CHI-1990-Jacob.html and the summaries found]. In a game, a false "selection" must be harmless or deliberately part of the challenge (decoys) [I].
4. **Webcam noise needs a forgiving timer** [I]. At 15–30 Hz with an SD of 1–2°, single samples leave even a correctly fixated zone. FOXIE's strict reset (fine with an infrared tracker) would make pops rare. Use a **leaky dwell**: outside samples drain progress at 2× the fill rate, and a full reset follows only after 300 ms continuously outside [H].
5. **Pursuit-based play is robust to calibration error**:
   - Pursuits (Vidal et al. 2013) correlates gaze movement with target movement, so offset and scale errors do not matter ("the eye tracker does not need to be calibrated");
   - implementations used a correlation of 0.8 over 30 samples and distinguish up to ≈ 8 targets [E-sec: DialPlate, https://arxiv.org/abs/1807.03713];
   - Orbits reported ≈ 12 % false positives [E-sec: same];
   - Lohr & Komogortsev compared pursuit and dwell selection at several degraded accuracy levels; pursuit stayed consistent while dwell slowed [E-sec: https://doi.org/10.1145/3027063.3053233, snippet].
6. **Session length** 1–2 minutes [H; matches the brief and keeps drift small, lit-sota §5.5].
7. **Design for failure** [E: *Before Your Eyes* developers]. The webcam game was written knowing players would blink at the wrong time, and the mechanic was gated to moments where it is expected (https://gamedeveloper.com/design/gone-before-you-blink-the-webcam-driven-gameplay-of-before-your-eyes). Our version: never punish a miss hard; a miss is information, not a loss [H].
8. **The game doubles as a quality check** [E precedent: Pfeuffer's Stargazing hid pursuit calibration inside the scene]. Every pop is a fixation on a known location, which gives per-zone accuracy and drift for free [I].

### 8.2 Three concepts

All three adapt to cols × rows from §2.2 and work in portrait (rows dominate) and landscape (columns dominate).

#### Concept A: "Pop!" (dwell, FOXIE-derived), recommended

- **Board**:
  - the safe area minus a 6 % margin, split into the calibrated zones (typically 1×3 or 2×3 in portrait; 3×2 or 2×2 on a laptop; 3×1 on a landscape phone);
  - gutters 4 % of the short side, drawn as faint lines;
  - the zone under the gaze lights up softly (snap-to-zone), and there is no gaze dot.
- **Target**:
  - one bubble at a time, in a random zone different from the last;
  - visible diameter = 55 % of the zone's short side, capped at 28 % of the screen's short side;
  - acceptance area = the **whole zone** (invisible).

  The visible bubble is smaller than the acceptance area so that it gives a precise point to look at, while the forgiving zone absorbs the error [H from Feit's rule].
- **Dwell**:
  - level 1: 1000 ms; level 2: 800 ms; level 3: 700 ms;
  - leaky timer (drain ×2; reset after 300 ms continuously outside);
  - the bubble shrinks from 100 % to 20 % over the dwell (FOXIE), then pops with a sound and a short burst (200 ms);
  - Android haptic 20 ms via `navigator.vibrate`, where supported [H].
- **Timing**:
  - a bubble lives 4 s, then floats away (a miss);
  - 500 ms rest between bubbles;
  - 16 bubbles per round ≈ 40–70 s;
  - with an odd row count, every 5th bubble is a centre "home" bubble that also serves as a fixation drift check, like FOXIE's central check [H].
- **Levels**:
  1. Pop: plain bubbles.
  2. Decoys: grey spiky bubbles also appear in another zone; looking at one for ≥ 600 ms makes it "bonk" (−50). This teaches the Midas touch playfully [H].
  3. Drifters: the bubble moves slowly within its zone (≤ 3°/s); a bridge to pursuit [H].
- **Scoring**:
  - +100 per pop;
  - speed bonus 50 × (1 − time-to-pop / 4 s);
  - streak multiplier ×1.5 after 4 consecutive pops;
  - stars: 1★ ≥ 50 % popped, 2★ ≥ 75 %, 3★ ≥ 90 % with a median time-to-pop ≤ 1.6 s [H].
- **End screen** (fits one viewport):
  - the score and stars as the hero;
  - "Best: 1,820" (local storage, wrapped in try/catch);
  - the **zone map**: each zone filled with its hit rate and a ✓, ~ or ✗ glyph, captioned "Where tracking worked best";
  - **Replay**: a 6 s fast replay of the smoothed gaze trail over the board;
  - primary **Play again**. If ≥ 2 zones show ✗ or the hit rate is < 50 %, the primary becomes **Calibrate again**, with the message "Tracking drifted; a quick re-check will help";
  - secondary **Back to Track** and **Details**.
- **Why it fits**:
  - it exercises exactly what the app delivers, coarse screen position;
  - its single rule ("look at the bubble until it pops") is the same grammar as calibration;
  - it works for children (the FOXIE heritage; animated targets attract attention [E-sec]);
  - it produces validation-like data every round [I].
- **Risks**:
  - a bias toward the screen centre, a known webcam centre bias [E: lit-sota §6.9]: randomise zones evenly and report per-zone results;
  - users may move their head toward targets: the position chip (§5) and the pose gate handle it.

#### Concept B: "Firefly" (smooth pursuit)

- **Mechanic**:
  - a firefly drifts along smooth curves (Lissajous or meandering splines) at 6–12°/s;
  - while the player follows it, its trail glows and a jar fills;
  - "in sync" means Pearson r ≥ 0.6 between gaze and target on the dominant axis over a sliding 1 s window (15–30 samples) [H; IR systems use 0.8 over 30 samples, E-sec].
- **Choice rounds**: 2–3 fireflies on different paths or phases; the one followed for 1.5 s is caught (Pursuits and Orbits-style selection). Keep it to ≤ 3 targets for webcam noise [H; IR implementations handle ≤ 8, E-sec].
- **Portrait/landscape**: paths stretch along the long axis; the vertical axis dominates in portrait.
- **Timing**: 60–90 s, 6 choice rounds.
- **Score**: seconds in sync + catches.
- **End screen**: overlay of the gaze path and the firefly path.
- **Strengths**:
  - offset- and scale-invariant, so it works even when the calibration is "Rough" [E-sec];
  - it collects pursuit data for the lag estimate (spec §4.8.6) and recalibration [I];
  - calm.
- **Weaknesses**:
  - it does not test absolute position, which is the point of the app;
  - it can feel passive;
  - fast curves cause catch-up saccades, so speeds must stay low and paths smooth [E: Pfeuffer].

#### Concept C: "Peekaboo" (look-to-freeze, 2 zones)

- **Mechanic**:
  - small creatures creep in from two sides (left/right in landscape, top/bottom in portrait), but only on the side the player is **not** looking at;
  - looking at a side for ≥ 300 ms freezes its creatures and pushes them back;
  - the player survives 60 s by alternating; the creatures' speed rises slowly.
- **Strengths**:
  - needs only 2 zones, so it works even at offset + 2σ ≈ 6–8° [I];
  - the Midas touch does not apply (looking *is* the intended action);
  - strong game feel.
- **Weaknesses**:
  - lowest spatial information, so it is the weakest quality check;
  - rapid alternation invites head turns;
  - suspense mechanics may suit adults less than children.

### 8.3 Recommendation

**Build Concept A ("Pop!") as the game.** It is the only one of the three that uses and tests the app's real capability (where on the screen), scales from 2 to 6+ zones with the measured quality, shares one rule with calibration, and produces a per-zone quality report every round.

- Concept C appears automatically as **A with 2 zones** when the outcome is Rough; a separate game is not needed.
- Concept B is a good **later bonus level** ("Firefly round" every third game), because it adds pursuit data and still works when absolute accuracy is poor [I/H].

### 8.4 Game as quality check (algorithm sketch) [H]

- For each pop, store the target centre, the zone, the time-to-pop, and the median of the filtered gaze over the last 400 ms of dwell (the fixation estimate).
- After each round, compute per zone the hit rate, the median time-to-pop and the vector offset (gaze median − target).
- **Drift**: if the offsets agree in direction across ≥ 3 zones (resultant length ≥ 0.6 of the mean length) and the mean is > 1/4 of the zone size, apply a global offset correction for the next round (the spec's drift machinery), and say so on the end screen ("Corrected a small shift").
- **Degradation**: if the hit rate < 50 % or a zone fails twice, recommend "Calibrate again" (§6.5).
- **Export**: game pops are labelled `phase: 'game'` rows in the session export, which gives researchers free implicit validation data (Details → Data).

---

## 9. Where expert features live, and remaining layout decisions

### 9.1 Mapping current features to the new structure

| Current location | Feature | New location |
|---|---|---|
| Welcome | capability list (8 rows) | silent; failures only; full list in Details → Diagnostics |
| Welcome → Advanced | engine checkboxes, download sizes, preset | Details → Method |
| Welcome | participant and session fields | Details → Data (and URL params `pid`, `session`, as the spec has) |
| Camera | 8 meters, eyewear question, probe table | three chips; full meters and probe in Details → Diagnostics; eyewear in Details → Method |
| Screen, Distance | card match, blind-spot test | Details → Method → "Measure screen and distance (for results in degrees)" |
| Results | 14-column table, target plot, funnel, CV candidates, AOI advice | quality card (lay) + Details → Quality (cards per estimator) |
| Live | estimator switcher, per-engine dots, raw toggle, record and markers | Details → Quality ("Use this") and Details → Data ("Recording") |
| Data, About, Lab | export, stored sessions, docs, diagnostics | Details tabs |

### 9.2 Desktop landscape wireframes (1280×720 minimum) [H]

Start (positioning):

```
┌────────────────────────────────────────────────────────────────────┐
│ eek-a-calibrate        ▬ ▭ ▭ ▭  1 of 4 · Start              Details │
│ ┌───────────────────────────────────────┐  Come a little closer    │
│ │                                       │  ●──────[■■■■]────○       │
│ │         mirrored preview,             │  62 cm → aim for 60       │
│ │         target oval + live outline    │  ✓ Distance ! Position ✓ Light│
│ │                                       │  ┌─────────────────────┐ │
│ └───────────────────────────────────────┘  │ Continue            │ │
│                                            └─────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

Quality card (end of Calibrate):

```
┌────────────────────────────────────────────────────────────────────┐
│ eek-a-calibrate        ▬ ▬ ▭ ▭  2 of 4 · Calibrate          Details │
│   Good                          ┌─────────────┬─────────────┐       │
│   We can tell 4 areas of your   │   ✓  ✓      │   ✓  ✗      │       │
│   screen apart.                 ├─────────────┼─────────────┤       │
│   More light in front of you    │   ✓  ✓      │   ✓  ✓      │       │
│   may help.                     └─────────────┴─────────────┘       │
│   [ Continue ]  Calibrate again                                    │
└────────────────────────────────────────────────────────────────────┘
```

Portrait phone game board (1 × 3 zones):

```
┌──────────────────┐
│▔▔▔▔▔▔▔▔▔▔▔▔▔ 1,240 ★│  3 px progress line + score (muted)
│                  │
│      ( ◯ )       │  zone 1 (lit when looked at)
│──────────────────│
│                  │  zone 2
│──────────────────│
│                  │  zone 3
│ ⏸            ☺ ok│  pause (corner) · posture chip (only when amber)
└──────────────────┘
```

### 9.3 Open layout decision: may the Details sheet scroll?

The owner's rule ("no horizontal or vertical scrollbar") is unambiguous for the four steps. The Details sheet contains research material (cards per estimator, method text, licences) that will not fit a 360×640 phone without pagination. Options:

- **(a)** pagination inside each tab (cards one at a time with ‹ › controls), so nothing scrolls;
- **(b)** allow internal scrolling inside the sheet only.

Recommendation: (a) for Quality and Data, (b) for About (a long text) [H]. The owner should decide.

---

## 10. Copy deck (formal British English) [H]

| Context | Text |
|---|---|
| Start title / lead | "See where you look" / "Your camera estimates where on the screen you are looking. Everything runs on this device; no images are stored or sent." |
| Start button / download line | "Start the camera" / "Preparing the face model · 62 %" |
| Camera blocked | "The camera is blocked. Tap the camera icon in the address bar and choose Allow, then try again." |
| Positioning | "Show your face to the camera" · "Come a little closer" · "Move back a little" · "Move your face to the middle" · "Face the screen" · "Lift your chin a little" · "Keep your head level" · "Tilt the top of the phone back a little" · "Turn on a light in front of you" · "A bright light is behind you" · "Hold still for a moment" · "All set" |
| Phone set-up tip | "Prop the phone up at eye level, about 30–40 cm away. Keep it in the same orientation throughout." |
| Calibration intro | "Look at each dot until it pops. Keep your head still. About two minutes." |
| Parts | "Dots" · "Follow the dot with your eyes" · "Keep looking at the dot and slowly turn your head, as if saying no; then nod" · "Last check: look at each dot" |
| Pause | "Paused: your face moved out of view. Move back into the outline to continue." |
| Quality | "Great: we can tell 6 areas of your screen apart." · "Good: 4 areas. More light in front of you may help." · "Rough: only left and right. Try again with the light in front of you." · "That did not work: your face was often lost. Prop the phone up and try again." |
| Track | "Look around the screen; the highlighted area is where you are looking." |
| Game intro | "Look at each bubble until it pops. You have 4 seconds per bubble." |
| Game end | "14 of 16 popped · 1.2 s on average" · "Where tracking worked best" · "Play again" · "Tracking drifted; a quick re-check will help" |

---

## 11. Specification and contract implications (for the owner's decision)

1. **§6 contract `aoiGrid: 0|2|3|4`** becomes `{ cols: number; rows: number }` (each 1–6), chosen per axis with the existing half-cell rule. This needs a version bump and a test change (the AOI unit test). The live "zones" demo and the game use it [I].
2. **§14.2.10** "No device-motion sensors are used" → optional DeviceOrientation and DeviceMotion for guidance only, with an iOS permission tap, never stored in the export by default (or stored as a labelled column, if the owner wants it) [H].
3. **§7 routes**: `#/` Start (Welcome + Camera); `#/calibrate` (Calibrate + Validate + quality card); `#/track` (Live); `#/play` (new); Data, About and Lab become Details tabs (deep-linkable `#/details/<tab>` for researchers). The first-run flow becomes Start → Calibrate → Track → Play.
4. **Setup meter**: face size by iris distance in mm (already computed, spec §4.4) instead of `faceWidthFrac` against video width; thresholds per device class (phone 300–400 mm; desktop 450–850 mm) [I from the review finding and Valliappan].
5. **Calibration copy and pose ring**: no protocol change; presentation only.
6. **Game data** in the export (`phase: 'game'`) and the drift correction from game pops (uses the existing drift module).
7. **New check**: the Playwright no-overflow spec at six viewports, added to `npm run check:all`.
8. **Anti-fabrication** (AGENTS.md): no accuracy figure appears in the game or the quality card as a claim about the app. "Zones" come from the user's own validation, and every literature number stays in About with its source.

---

## 12. Risks and open questions

- **Zones on portrait phones may often be just 1 × 2.** If so, Pop! is thin in portrait. The mitigation is to encourage 30 cm rather than 40 cm, and to invite landscape for play ("Turn the phone sideways for more zones"); that needs a separate calibration for that orientation [I].
- **Thresholds for the posture bands (§5.1) are untested heuristics.** Tune them with the manual checklist on real phones (iPhone Safari, Android Chrome; propped and hand-held), as spec §14.2.12 already requires [H].
- **The DeviceOrientation permission** adds a second prompt on iOS. Measure whether it lowers completion; it can stay off by default [H].
- **Leaky-dwell parameters** (×2 drain, 300 ms reset) and the One Euro tuning need tuning on recorded webcam data [H].
- **Children**: animated targets and sound help attention [E-sec], but child faces are smaller and sit differently relative to the camera [E-sec: Kandel & Snedeker via search]. Keep the distance gauge in cm, which is age-independent [I].
- **Not verified**: the exact Tobii help-page wording (403 on fetch; search snippet only); Apple's Face ID instruction wording (community quotes, secondary); the Vision Pro procedure (press reports); Lohr & Komogortsev's numbers (title and snippet only); Isokoski et al.'s genre analysis (not read).

---

## 13. Sources

Primary or read in full text:

- Feit A. M. et al. (2017). Toward everyday gaze input: accuracy and precision of eye tracking and implications for design. CHI. https://www.microsoft.com/en-us/research/wp-content/uploads/2017/01/everyday_eyetracking-1.pdf
- Pfeuffer K., Vidal M., Turner J., Bulling A., Gellersen H. (2013). Pursuit calibration: making gaze calibration less tedious and more flexible. UIST. https://www.unibw.de/usable-security-and-privacy/publikationen/pdf/pfeuffer2013uist.pdf/@@download/file/pfeuffer2013uist.pdf
- Valliappan N. et al. (2020). Accelerating eye movement research via accurate and affordable smartphone eye tracking. Nat. Commun. 11:4553. https://pmc.ncbi.nlm.nih.gov/articles/PMC7486382/
- Krafka K. et al. (2016). Eye tracking for everyone. CVPR. https://arxiv.org/abs/1606.05814
- Kaduk T. et al. (2024). Webcam eye tracking close to laboratory standards. BRM. https://pmc.ncbi.nlm.nih.gov/articles/PMC11289017/
- Majaranta P., MacKenzie I. S., Aula A., Räihä K.-J. (2006). Effects of feedback and dwell time on eye typing speed and accuracy. UAIS 5:199–208. https://www.yorku.ca/mack/uais2006.html
- Apple. Control iPhone with the movement of your eyes (Eye Tracking). https://support.apple.com/en-gb/guide/iphone/iph66057d0f6/ios
- web.dev. Permissions best practices for the web. https://web.dev/articles/permissions-best-practices
- web.dev. The large, small, and dynamic viewport units. https://web.dev/blog/viewport-units
- Casiez G., Roussel N., Vogel D. 1€ filter (project page and tuning). https://cristal.univ-lille.fr/~casiez/1euro
- FOXIE kindergaze demo (owner's code). `/home/user/foxie-kindergaze-demo/kindergaze-demo/FOXIE_demo_kindergaze.py` and `README.md`
- eek-a-style tool-ui profile. `/home/user/eek-a-style/source/visual/ui-and-interaction.md`
- Reviewer findings. `(session scratch, not kept)/review-findings.json`
- Earlier literature review. `(session scratch, not kept)/research/lit-sota.md`

Abstracts, snippets or secondary reports:

- Flatla D. et al. (2011). Calibration games. UIST. https://doi.org/10.1145/2047196.2047248 ; https://scottbateman.github.io/publication/2011-01-01-Calibration-games-making-calibration-tasks-enjoyable-by-adding-motivating-game-elements
- Vidal M., Bulling A., Gellersen H. (2013). Pursuits. UbiComp. https://perceptualui.org/publications/vidal13_ubicomp/ ; parameters via DialPlate (Drewes et al.), https://arxiv.org/abs/1807.03713
- Esteves A. et al. (2015). Orbits. UIST. https://perceptualui.org/publications/esteves15_uist/
- Lohr D., Komogortsev O. (2017). A comparison of smooth pursuit- and dwell-based selection at multiple levels of spatial accuracy. CHI EA. https://doi.org/10.1145/3027063.3053233
- Blignaut P. (2017). Using smooth pursuit calibration for difficult-to-calibrate participants. JEMR 10(4). https://bop.unibe.ch/JEMR/article/view/3676
- Schlegelmilch K., Wertz A. E. (2019). The effects of calibration target, screen location, and movement type on infant eye-tracking data quality. Infancy 24(4). https://pure.mpg.de/pubman/item/item_3066166_7/component/file_3377246/115%20Schlegelmilch_Effects_2019_Postprint_JH_final.pdf
- psychopy_tobii_infant (5-point calibration with sound). https://github.com/yh-luo/psychopy_tobii_infant
- Jacob R. J. K. (1990). What you look at is what you get. CHI. https://bibtex.github.io/CHI-1990-Jacob.html
- Pose-robust calibration strategy for PoG estimation on mobile phones (2025). https://arxiv.org/abs/2508.10268
- Tobii help: calibration in Tobii Experience. https://help.tobii.com/hc/en-us/articles/115003827934
- Apple. Use Face ID. https://support.apple.com/HT208109 ; Screen Distance https://support.apple.com/105007
- Apple Vision Pro eye set-up (press). https://www.macworld.com/article/2252026/how-to-apple-vision-pro-recalibrate-eye-tracking-ipd-adjustment.html
- iOS DeviceOrientation permission. https://yal.cc/js-device-motion/ ; https://developer.apple.com/forums/thread/128376 ; https://bugs.webkit.org/show_bug.cgi?id=269706
- Material Design (M1) permissions patterns. https://m1.material.io/patterns/permissions.html
- Visa Product Design System, wizard pattern. https://design.visa.com/patterns/wizard/usage/

Vendor or product documentation [V]:

- SR Research (EyeLink) validation grades. https://sr-research.com/support/thread-244.html
- RealEye Webcam v1 vs v3. https://realeye.io/support/realeye-webcam-v1-vs-v3
- Incode face-capture design. https://developer.incode.com/docs/face-capture-design
- Onfido engineering, face detection and tracking with ML Kit. https://medium.com/onfido-tech/face-detection-and-tracking-on-android-using-ml-kit-part-1-fbee4200d174
- Smartbox Look to Learn. https://thinksmartbox.com/look-to-learn/ ; https://support.inclusive.com/article/look-to-learn
- *Before Your Eyes* design article. https://gamedeveloper.com/design/gone-before-you-blink-the-webcam-driven-gameplay-of-before-your-eyes
