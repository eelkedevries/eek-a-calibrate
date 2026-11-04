# eek-a-calibrate redesign: audit and inventory

Prepared 4 November 2026 for the redesign into four steps (Intro, Calibrate, Eye tracking, Game)
with a secondary Details/Settings area. Read-only: no repository was modified.

**Labels used throughout**

- **[C]** read in the code, with file and line where useful (`eek-a-calibrate` at `ff7f4df`).
- **[M]** measured by the earlier reviewers (`scratchpad/review-findings.json`, areas `ui-desktop`
  and `ui-mobile`), or computed here (contrast ratios, word counts; method stated).
- **[E]** external evidence, with its URL.
- **[S]** binding statement in the eek-a-calibrate specification v0.4
  (`docs-dev/reference/primary_authoritative/specification.md`) or in eek-a-style.
- **[H]** heuristic: my judgement, not measured.

---

## 0. Decision-relevant summary

1. **The current UI is eleven routes of document pages** (Welcome, Camera, Screen, Distance,
   Calibrate, Validate, Results, Live, Data, About, Lab) carrying about **6,850 words** of copy
   [M: word count of `strings.en-GB.ts` by key prefix]. Nothing in it is laid out for a single
   viewport: `body { min-height: 100vh }`, a 72 rem centred column and a header and footer on
   every non-stage page [C `style.css`]. The reviewers measured Welcome at 2,280 px with the Start
   button about 2,100 px down, Camera at 2,467 px (desktop) and 2,794 px (iPhone 13 portrait) with
   the preview below the fold, and a 14-column Results table 1,606 px wide in a 358 px phone
   wrapper [M].
2. **About 80 % of what is on screen today is expert-only** [H, from the inventory in §A2]. A
   non-expert needs, per step, one instruction, one live picture, one status and one primary
   action. Everything else (engines, presets, probe table, numeric meter values, eyewear,
   capability list, participant fields, 14 metrics, funnel, CV table, estimator switcher, raw and
   per-engine toggles, recording and markers, export, stored profiles, screen and distance
   measurement, methods and diagnostics) moves to Details, to an "expert mode" switch, or to a
   separate Methods page.
3. **Merges.** Camera becomes the Calibrate step's *positioning* sub-step; Validate is folded into
   the calibration run (the user sees one continuous "look at the dots" task); Results becomes
   the *result* sub-step (one verdict card) with the full table in Details; Live becomes *Eye
   tracking*; Data, About, Lab, Screen and Distance move behind Details. The header and footer
   disappear from the four steps; "Delete all my data", privacy, version and the site link move
   into Details.
4. **Positioning feedback today is a list of nine meters with raw values** (`0.35, -0.12`, `142`,
   `0.91`, `1.2 %` …) and a face box [C `qualityMeter.ts`]. It must become a picture-first guide:
   a face-shaped target on the mirrored preview, one instruction at a time chosen by priority,
   and a hold-still ring. The face-size meter is normalised by the video *width*, which on a
   portrait phone makes a correctly placed face read "move further away" [M]; this must be fixed
   (normalise by the long side, or derive distance from the iris) before any phone guide is built
   on it.
5. **Reusable mechanics from the owner's repos**: gaze-lite's one-card validation result and
   its icon-plus-label toolbar and quiet log strip; PocketGaze's three-tier disclosure ladder
   governed by one master switch; saccadacus's dashed centring box (which it later *replaced* with
   auto-centring, a warning: auto-framing hides exactly the error the owner wants signalled);
   FOXIE's 1 s central fixation check and the target that shrinks while gaze stays inside and
   resets when it leaves. FOXIE's lab parameters (1.0° fixation window, 2.0° target window) are
   too small for webcam accuracy of 2–4°, often worse [S Appendix B]; they need to be scaled to the
   user's own validation result.
6. **eek-a-style tool-UI rules fit the brief directly**: mobile single page with no scrollbars and
   secondary controls in bottom sheets [S `ui-and-interaction.md`]; one accent touchpoint (gold) for
   the primary action and live state; iris blue for signal; Lexend for UI, JetBrains Mono for live
   numerics, Spectral for display only; radii 12/14/22/pill; spacing 4/8/16/24/40.
7. **Three conflicts to settle**:
   - (a) The calibration stage is binding mid-grey `#808080` [S §4.7], against which *no* eek-a-style
     accent or state colour reaches 3:1 (gold 2.07, iris 1.54, success 1.99, error 1.45) [M, WCAG
     formula]. Chrome on the stage must be black, white or a dark chip (`#24242a`, 3.91:1 against
     the grey, text on it 13.8:1).
   - (b) "No scrollbars" conflicts with WCAG 1.4.4/1.4.10 when the user enlarges text. Design it to
     fit at default text size, and let it scroll only as a fallback.
   - (c) The specification forbids device-motion sensors (§14.2 item 10), so the phone tilt cue
     needs a specification amendment and a version bump.
8. **Specification amendments the new structure needs**: the screen table and first-run flow
   (§7), the Results contents (§7 screen 6), the eyewear question (§7 screen 1), device-motion
   sensors (§14.2.10), a new Game section, and possibly the meter thresholds (Appendix A SETUP) and
   the face-size normalisation. Under the project rules these must be amended, with a version bump,
   before implementation (`AGENTS.md`, "Ground truth").

---

# Part A — The current UI

## A1. Shell (every non-stage page) [C `src/main.ts`, `style.css`, `router.ts`]

| Element | Content | Lay or expert |
|---|---|---|
| Skip link | "Skip to content" | keep (accessibility) |
| Header | Brand "eek-a-calibrate", tagline, nav: Start · About · Your data | brand: keep, smaller; nav: replace by a step indicator and a Details button |
| Main | max-width 72 rem, 16 px padding, no safe-area insets (reviewers counted 46 text runs under the notch inset on Welcome in iPhone landscape) [M] | replace by a viewport grid |
| Footer | privacy sentence; links About · Diagnostics · Your data · eelkedevries.com; **Delete all my data** button (39 px tall, below 44 px) [M]; delete status; version line | move all into Details; privacy sentence to Intro |
| Router | 11 hash routes. `immersive` hides header and footer for calibrate and validate. Focus moves to the h1 on each route | keep hash routing; routes reduce to 4 plus Details |
| Theme | own tokens (`--bg`, `--surface`, `--accent` …), system font; dark `#0a0a0f`, gold `#e8b43a` (dark); light accent `#8a5a00` | migrate to eek-a-style role names and values (§C1) |
| Default flow | `FLOW = welcome, camera, calibrate, validate, results, live, data`; screen and distance are a detour | becomes Intro → Calibrate (position → run → result) → Eye tracking → Game |

## A2. Screen-by-screen inventory

Word counts are the words in that screen's string keys, so the copy that can appear on it [M].

### 0. `#/` Welcome (613 words)

| Content / control | Purpose | Needed by a non-expert? |
|---|---|---|
| H1 "Webcam eye tracking, calibrated for you", lead (49 words), "how it works" paragraph | orientation | **yes, in one sentence** |
| Privacy section (2 paragraphs) | trust | **yes, one line**; full text in Details |
| What to expect: 4 bullets (2–4°, often 4–8°; ≤ 30 Hz; 4–6 areas; "your validation counts") + 7 sources + Methods link | honest expectations (anti-fabrication rule) | **one line** ("works for a few large areas of the screen, not for reading words") with a sources link; figures in Details |
| "On a phone or tablet" section (mobile only) | prop-up advice | yes, but as a picture on the positioning step |
| Capability list: 8 Yes/No rows (https, camera, rVFC, SIMD, WebGL 2, OffscreenCanvas, module workers, fullscreen) | diagnostics | **no**; show only a blocking error; full list in Details |
| Preset: 3 radios (Quick / Standard (recommended) / Thorough) with durations | protocol length | **no** (Standard by default); Quick and Thorough in Settings [H] |
| Engines: summary + Advanced `<details>` (Auto/Choose radios, 4 checkboxes with download size and licence, geometry section with measure link). The `<details>` has no marker [M] | engine choice | **no**; Settings |
| Participant and session fields | export labels | **no**; Settings |
| Stored-calibration banner with a link to Your data | reuse | secondary action on the positioning step, where the camera match is known |
| **Start: check the camera** (at y ≈ 2,100 of 2,280 px) [M] | primary action | **yes: the primary action, visible without scrolling** |

### 1. `#/camera` Camera (489 words + meters 143)

| Content / control | Needed by a non-expert? |
|---|---|
| H1, lead (41 words), desktop or mobile steps, "heuristic thresholds" note | one instruction line; the heuristic note goes to Details (but see §A6 on the anti-fabrication rule) |
| Alert banner, status line ("The camera is running (640 × 480)"), downloads progress list (per asset; the face model shows no progress until it has loaded, 2–37 s of blank screen at 4 Mbit/s) [M] | **one** combined, unobtrusive progress indicator; the preview must appear as soon as the landmarker is ready [M fix] |
| Start the camera | yes (permission priming), merged with the Intro's Start |
| Camera picker (only with ≥ 2 cameras) | rarely; small control on the positioning step |
| Mirrored preview with face box (green solid / amber dashed); `width: min(100%, 32rem)`, no height cap: 576 px tall in a 342 px landscape viewport [M] | **yes: the hero of the positioning step** |
| 8–9 meters (Face found, Face size %, Centred x,y, Face brightness, Backlight, Glare %, Frame rate Hz, Facing the screen yaw°,pitch°, Distance cm only if measured), each with state word, value and advice [C `qualityMeter.ts`] | **the advice only, one at a time**; values in Details |
| Hold note ("Hold still for 1.4 s more…") | yes, as a ring, not text |
| Eyewear question (4 radios) + glare advice | no; glare advice appears when the glare check fails; the question goes to Settings (it is export metadata) |
| Device check section: body text, a timing table (landmarker, preparation, each engine, total, limit), run set, dropped engines, slow-device warning, heuristic note. The table pushes Continue down when it arrives [M] | **no**; a one-line "running at N frames per second" in Details; a lay warning only when the rate is too low |
| Stored calibration: "Use stored calibration from {date} (validation required)" | yes, secondary |
| Continue to calibration (enabled after all green for 2 s and probe done) / Continue anyway (after 20 s) / Back | auto-advance after the hold; "Continue anyway" stays, secondary |

### 2. `#/screen` Screen size (237 words) and 3. `#/distance` Viewing distance (504 words)

Both are optional detours [S §14.1]. They contain the bank-card match (outline, slider, Smaller and
Larger, readout, Use), the diagonal input, Skip, a stored measurement, the blind-spot test (cover the
right eye, 5 trials, "It disappeared" button) and a 2 s iris measurement. **Expert-only** in effect:
they change only the degree values, never the calibration [S §14.1.3]. → Details, "Measure screen and
distance (optional)". Each is already a short task and can be redesigned to fit one screen (the
blind-spot stage already is one).

### 4. `#/calibrate` Calibration (345 words + protocol cards 172 + stimulus 136)

| Content / control | Needed by a non-expert? |
|---|---|
| Intro page: H1, lead, steps (desktop or mobile), preset line, reduced-motion note, geometry-assumed note, status line, engine list (ready/unavailable per engine), Start, Back to the start (24 px tall link) [M] | cut the intro page: positioning ends with "Ready — start", and the first instruction card is the intro. Engine list → Details |
| Stage (fullscreen or viewport mode, grey `#808080`): instruction cards per block (fixation, pursuit, head, closer, validation), each "tap anywhere or press Space" | yes, shortened to one sentence plus a pictogram |
| 4 px progress bar at the top, 2.39:1 against the grey [M] | yes, at ≥ 3:1 (black) |
| Pause and Abort corner buttons (hidden when over a target) | yes |
| Caption under target in block C ("slowly turn your head left and right") and the pose-guide ring (four sector arcs plus pose dot) [C `poseGuide.ts`] | yes: the pose guide is already a good lay signal |
| Pause overlays: manual, face lost (> 400 ms), page hidden; invalidation messages (fullscreen exit, rotation, zoom, resize, camera change) | yes, as short cards that name the fix |

### 5. `#/validate` Validation (95 words)

Intro page with Start validation and Calibrate again, then the stage (VAL12 or VAL6), then
"Scoring…" with fit progress. → **fold into the calibration run**: the user sees "Now a few more
dots to check accuracy", with no separate page. The intro page and its buttons are cut.

### 6. `#/results` Results (414 words)

| Content / control | Needed by a non-expert? |
|---|---|
| Approximation hint (degrees ≈) with "Measure screen and distance" link and Dismiss | no; Details |
| "Auto selected {name}." + reason; "In use: {name}." | no; Details |
| Tabs: own valid frames / intersection | no |
| Table: 14 columns (Estimator, CV error, Accuracy mean, Median, Central/peripheral, RMS-S2S, SD, BCEA, Data loss, Rate, ms per frame, Gain, Verdict, Use). Verdict and Use are off-screen on every desktop width and need ~1,250 px of sideways scrolling on a phone [M] | **only the verdict of the estimator in use**, as a word plus an icon |
| Optimism note; heuristic note | Details (the heuristic label must stay attached to any verdict shown, §A6) |
| Target plot (SVG, per-estimator toggles); marks 1.02–1.75:1 against the grey plot background [M] | **a simplified version is lay-useful**: the validation dots, with where the gaze landed, on a screen-shaped thumbnail |
| Data-loss funnel (7 rows) | no |
| Cross-validation candidates table (engine, mapping, CV ± SE, λ, rows, coverage) | no |
| Areas-of-interest advice ("a grid of up to n × n areas can be told apart (heuristic rule)") | **yes, in plain words**: it is the most meaningful lay result |
| Notes from the fit; pursuit lag; fit time | no |
| Accept and continue to live gaze (primary even when the verdict is "not tracking" [M]) / Validate again / Calibrate again | yes, but the primary action must depend on the verdict |

### 7. `#/live` Live gaze (672 words)

| Content / control | Needed by a non-expert? |
|---|---|
| Intro page: H1, lead (with keys), Display fieldset (estimator select, unfiltered, per-engine dots, AOI demo with grid select, timed drift prompts), keys note, accuracy line, Start live gaze / Export / Back to the results, "Recorded in this session" list | cut the intro page: Eye tracking starts on arrival. Display options → expert mode; recordings → Details |
| Stage: gaze dot (One Euro filtered, blink hold), confidence ring, greyed with a dashed outline when the head is outside the calibrated range, hollow at the edge when off-screen [C `gazeDot.ts`] | **yes: the hero**. The greyed state is the start of a continuous positioning signal |
| Optional per-engine dots; AOI grid with the cell under gaze highlighted | per-engine dots: expert; **AOI highlight: lay** (it shows what the tracker can really do) |
| Toolbar (bottom, wraps to 4 rows = 30 % of portrait height, 45 % of landscape) [M]: Exit, Record, Marker, Drift check, estimator select, Unfiltered, Engines, Areas, status "{hz} Hz · recording", Hide controls | lay: Exit, a menu, a quality pill. The rest → expert mode |
| Cards: timed drift prompt (Check now / Later / Stop prompts), drift results (corrected / too large → quick recalibration / no data), recalibration fitting, revalidation, restored-calibration validation, paused (rotate back / layout changed) | yes, reworded as an "accuracy check" in plain words |
| Keys R, M, D, Esc (Esc conflicts with leaving fullscreen [M]) | expert; Esc = exit only |

### 8. `#/data` Your data (437 words)

Export zip (description of 7 files, per-frame features checkbox, Export button, notes), screen and
distance link, stored calibrations (up to 8; use or delete; raw profile key printed [M]), stored
session summaries (store button that duplicates an automatic store [M]; delete), Delete everything.
→ **Details**: "Export" and "Saved on this device". Delete all stays reachable within two taps from
every step [H; privacy promise].

### 9. `#/about` About (1,885 words)

Method, geometry formulae, 7 metric definitions with formulae, protocol, filtering and events,
drift, engines with licences, citations and published evidence, front-end licence, 6 limitations,
3 privacy paragraphs, 18 references. **Cannot fit one screen at any size.** → a Methods page
outside the four-step shell (or a paginated sheet), linked from Details and from every sourced
figure [H; decision for the owner, §A7].

### 10. `#/lab` Diagnostics (309 words, 100 keys)

Start/stop, camera picker, per-engine checkboxes, "Run each engine on 10 frames", sections Vision
host, Camera, Frames, Timings, Face (13 rows of raw signals), Engines, Live crops, Engine run,
Messages. **Expert-only.** It holds every positioning signal in numeric form; keep it as an expert
page reachable from Details. It is also the source for the end-to-end engine tests, so it cannot be
cut [C `lab.ts` header].

### Not present today

There is **no game** anywhere in the code or the specification [C, grep]. The Game step is new and
needs a specification section.

## A3. Reviewer findings that constrain the redesign [M]

Grouped by what the new design must do. Severity in brackets, as the reviewers gave it.

**Layout and scrolling**

- Welcome: primary action about 2,100 px down; the capability list takes the first viewport (low).
- Camera, desktop: one narrow column, Continue about 1,300 px below the preview, 45 % of the width
  empty; propose two columns from ~960 px and a sticky action bar (medium).
- Camera, phone: preview below the fold after Start, nothing scrolls it into view; landscape
  preview 576 px in a 342 px viewport; no height cap (medium).
- Results: 14 columns cut off Verdict and Use on every desktop width (1,606–1,679 px table in a
  1,120 px wrapper); on phones the same table needs ~1,250 px sideways (high on desktop, medium on
  mobile). Fix: per-estimator cards below ~40 rem, verdict first.
- Live toolbar covers 30 % (portrait) to 45 % (landscape) of the stage (low).

**Positioning signals**

- Face-size meter normalised by the video width (the short side in portrait). At the advised
  30–40 cm a real face reads 56–74 % against a 60 % maximum, so the meter says "move further away"
  and blocks Continue for 20 s (medium). Fix: normalise by `max(videoW, videoH)` or use portrait
  thresholds.
- A 180° turn (landscape-primary ↔ landscape-secondary, or the phone upside down) between
  calibration and Live is not detected: `ScreenGeometry` has no orientation (medium).
- After a rotation the Live refusal says "Calibrate again" when turning back would do (low).

**Loading and power**

- No progress for the face model and MediaPipe WebAssembly (~7 MB), because the listener is
  attached after init. On a phone at 4 Mbit/s there is no preview and no meters for ~37 s (high on
  mobile). Fix: two stages (camera plus landmarker → preview and meters; engines in the
  background).
- Wake lock not held during the first download, the calibrate intro or Results; iOS Auto-Lock at
  30 s can suspend the camera (medium). Fix: one lock for the lifetime of the capture.
- Download sizes misleading (Peekr shown 14.8 MB, actual ~4.3 MB; shared 7 MB face model listed
  nowhere) (low).

**Results and flow logic**

- "Accept and continue" stays the primary action even when the verdict is "not tracking"; the
  verdict is not visible in the Results viewport (high, part of the table finding).
- Empty states link to `#/calibrate`, skipping the camera check and the probe (medium).
- After a quick recalibration, Results scores the new fit on the old validation frames with no
  notice (medium).
- The device-check advice "the Quick preset or fewer engines may help" cannot help when the
  landmarker dominates (low).

**Accessibility and touch**

- Control boundaries 1.37–1.52:1 (WCAG 1.4.11 needs 3:1); stage progress bar 2.39:1; focus ring on
  the grey stage 1.8–2.1:1 (low).
- Touch targets below 44 px: results buttons 42 px, calibrate "Back" 24 px, header links 20 px,
  footer links 17 px, Lab select 22 × 19 px (low).
- Esc: in real fullscreen the browser takes Esc; Live then pauses and forces a drift check instead
  of exiting; the pause card's "Exit (Esc)" ignores Esc (medium).
- Keyboard shortcuts in Live stop working once a toolbar checkbox has focus; the stage keeps the
  label "Calibration targets" in Live (low).
- No safe-area insets on ordinary pages; text under the notch in iPhone landscape (medium).

These are properties of the current implementation, but most of them are layout consequences that
the redesign removes by construction (no long pages, no tables on phones, one action bar). The
items under "Positioning signals" and "Loading and power" are engine-side fixes the new UI
**depends on** and must be scheduled first [H].

## A4. Mapping onto the new structure

`→ L` lay view (always on screen); `→ X` expert mode (a single master switch in Settings, the
PocketGaze pattern); `→ D` Details sheet; `→ M` Methods page; `✕` cut.

### Intro (one screen)

| Current item | New home and treatment |
|---|---|
| Title + lead + "how it works" | → L: title (≤ 6 words) and one sentence; a three-pictogram strip "Position · Look at dots · Play" with a duration (about 2 minutes for Standard) |
| Privacy | → L: one line with a lock glyph ("Runs on your device. Nothing is uploaded or stored as images."); → D: full privacy text |
| What to expect (4 bullets + 7 sources) | → L: one line ("Good enough to tell apart a few large areas of the screen") with an inline "sources" link; → M: figures and references. The anti-fabrication rule needs the figure or the claim to carry its source: the link satisfies it only if the figure itself is in the linked text [S `AGENTS.md`] |
| Phone advice | → L as a pictogram on the positioning step, not on Intro |
| Capability check | → L only if blocking ("This browser cannot use the camera"); → D full list |
| Preset | ✕ from Intro; → D "Calibration length: Standard (recommended) / Quick / Thorough" |
| Engines | → D (Auto by default) |
| Participant, session | → D |
| Stored-calibration banner | → Calibrate/positioning, secondary button once the camera match is known (`matchesCurrentSetup` needs the running camera) [C `camera.ts`] |
| Start button | → L primary: "Start camera" (permission priming; the browser prompt follows the tap) |
| Header nav, footer | ✕; Details button (top right) and the step indicator (top left) replace them: "both ends of a header bar carry content" [S eek-a-style] |

### Calibrate — positioning sub-step

| Current item | New home and treatment |
|---|---|
| Preview + face box | → L hero: mirrored preview filling the available space, with a face-shaped target outline (oval) whose colour and dash state show fit; no auto-pan here (§B3) [H] |
| 9 meters | → L: **one** instruction at a time, chosen by a fixed priority (face found → distance → centring → facing → light/backlight → glare → frame rate) [H]; plus a compact row of 3–4 status glyphs (distance, centring, light, tilt) without numbers. → D/X: the numeric meter list as it is today |
| Distance | → L: a near/far gauge, from the iris diameter (11.7 mm) with the assumed or measured focal length, or from face size; phone band about 30–40 cm, desktop 45–85 cm (both heuristic) [S §14.2.8, Appendix A] |
| Phone tilt | → L (new, phones only): a level indicator from DeviceOrientation beta/gamma; **needs a specification amendment** (§14.2.10 forbids device-motion sensors) and an iOS permission tap [E MDN] |
| Hold note | → L: a ring that fills over the 2 s hold (`SETUP.holdMs`), then auto-advance |
| Eyewear question | → D (export metadata). Glare advice → L only when glare fails |
| Downloads | → L: one thin progress bar with "Preparing the eye tracker… 63 %", total size shown once, before starting, on phones [M fix] |
| Device check table, run set | → D one line ("Engines: BlazeGaze, Geometric · 24 frames/s"); → L only a lay warning when the rate is below the threshold |
| Camera picker | → L as a small icon button only when ≥ 2 cameras |
| Stored calibration | → L secondary: "Use my saved calibration (quick check first)" |
| Continue anyway | → L secondary, after 20 s (as now) |
| Screen and distance measurement | → D "Measure screen and distance (optional)" |

### Calibrate — run (fullscreen stage)

| Current item | New home and treatment |
|---|---|
| Calibrate intro page | ✕ (positioning ends with "Start"); the first card is the instruction |
| Instruction cards (5 kinds) | → L: one sentence + pictogram + "Tap to start"; durations stated ("about 30 seconds") |
| Blocks A (fixation), B (pursuit), C (head motion), closer, validation | → L as one task "Look at the dots", with validation folded in ("A few more dots to check accuracy") |
| Progress bar | → L, black, ≥ 3:1 on the grey; plus a step count in the corner chip [H] |
| Pause, Abort | → L, corner chips (dark chip on the grey) |
| Pose guide | → L, unchanged in principle |
| Face-lost pause card | → L: names the fix ("We lost your face — move back into view"); a small preview inset helps the user find the frame again [H] |
| Validate intro page, "Scoring…" | ✕ intro; → L "Checking your accuracy…" spinner of ≤ a few seconds |

### Calibrate — result sub-step (one card)

| Current item | New home and treatment |
|---|---|
| Verdict of the estimator in use | → L: verdict word + glyph + colour role (Good ✓ success, Fair ~ warning, Poor ! error, Not tracking ✕ error) with "(rule of thumb)" attached, since the verdict thresholds are heuristic [S anti-fabrication] |
| AOI advice | → L in plain words: "The tracker can tell apart about 4 areas of your screen" plus a mini n × n grid |
| Target plot | → L simplified: a screen-shaped thumbnail with the validation dots and where the gaze landed (one series only, Auto's choice), black and white marks for contrast |
| Accuracy figure | → L optional, as "about 3 cm off on your screen" or "% of the screen" rather than degrees when degrees are approximate [S §14.1.4 "pixels and % of the screen diagonal first"] [H on the wording] |
| Accept / Validate again / Calibrate again | → L: primary = Continue when Good/Fair, = Try again (with the top fix: "add light from the front") when Poor/Not tracking [M fix] |
| Table, tabs, funnel, CV, Auto's reason, optimism note, fit notes, pursuit lag, estimator switch | → D "Detailed results", as per-estimator cards (≤ 5) or a 4-column table (Estimator · Accuracy · Verdict · Use) with a per-row "more" [S eek-a-style: cards over dense tables] |

### Eye tracking

| Current item | New home and treatment |
|---|---|
| Live intro page | ✕ |
| Gaze dot, confidence ring, blink hold, greyed out of range | → L hero |
| AOI demo | → L by default: the n × n grid of the result card, faint, with the cell under gaze highlighted (honest about resolution) [H] |
| Per-engine dots, unfiltered toggle, estimator select | → X |
| Record, Marker, keys | → X (and D for the recordings list and export) |
| Drift check, timed prompt, quick recalibration, revalidation | → L, reworded "Accuracy check (2 dots)", prompted automatically every 5 minutes and when the position drifts; manual trigger in the menu |
| Toolbar | → L: Exit (corner), one menu button, a quality-and-position pill; everything else in the menu sheet |
| Rate readout | → L in the pill as telemetry ("24 fps"), mono, faint |
| Position monitoring | → L new: edge cue plus a small face thumbnail when the head leaves the calibrated range, distance band or tilt band (see `r-positioning.md`) |

### Game

New. Mechanics in §B4 and the sibling report `r-flow-game.md`. Reuses the Live pipeline, the AOI n
and the validation accuracy to size its targets.

### Details / Settings (bottom sheet on phones, side sheet on desktop [H])

Sections, each sized to fit the viewport: **Settings** (calibration length, engines, expert mode,
drift prompts, participant and session, theme), **Detailed results**, **Recordings and export**,
**Saved on this device** (stored calibrations, sessions, delete all), **Measure screen and distance**,
**This device** (capabilities, run set, camera, frame rate; link to Diagnostics), **About and
privacy** (short; link to Methods), version line.

## A5. Cut, merge, hide

**Cut (no successor)**

- the 13 `placeholder.*` strings and `placeholder()` in `router.ts` (every screen is built) [C];
- the Calibrate, Validate and Live intro pages;
- "The camera is running (W × H)" status;
- duplicate statements: the mobile steps appear on Welcome, Camera and Calibrate; the privacy line
  appears on Welcome, in the footer and on About; "heuristic" notes are repeated on Camera,
  Results, Live and About [C]. Say each fact once [S eek-a-style];
- the session-summary "Store" button, which duplicates an automatic store [M];
- the raw profile key on the Data page [M];
- header nav and footer on step screens.

**Merge**

- Welcome's Start and Camera's Start → one "Start camera";
- Camera → Calibrate/positioning;
- Validate → Calibrate/run;
- Results → Calibrate/result (lay) plus Details/Detailed results (expert);
- Data, Screen, Distance, About (short form) → Details;
- the four Live display toggles and the estimator select → one expert mode;
- the drift check, timed prompt, recalibration and revalidation flows → one "Accuracy check"
  pattern with three outcomes (fine / corrected / recalibrate).

**Hide (progressive disclosure)**

- numeric meter values, the probe table, the capability list, engine status → Details or Diagnostics;
- the 14-metric table, funnel, CV, target plot per engine → Details;
- record, markers, keys, raw and per-engine dots → expert mode;
- methods, formulae, references → Methods page.

## A6. Specification items the new structure changes

Under `AGENTS.md` ("Ground truth") these need a specification amendment and version bump before
implementation:

1. **§7 screen table and first-run flow** (11 screens; Welcome → Camera → Screen → Distance →
   Calibrate → Validate → Results → Live → Data). Becomes four steps plus Details.
2. **§7 screen 0 Welcome** lists the capability check, preset, engines and participant fields
   as Welcome content; they move to Details.
3. **§7 screen 1 Camera**: the eyewear question and the probe display move; the meter list
   becomes a guide. The rule "green for 2 s to continue" can stay as the hold ring.
4. **§7 screen 6 Results** lists the table, tabs, plot, funnel, CV table and actions on Results;
   the lay result card plus Details/Detailed results changes that.
5. **§14.2 item 10** "No device-motion sensors are used" forbids the phone tilt cue.
6. **Appendix A SETUP** thresholds and the face-size normalisation (the portrait bug) [M].
7. **A new Game section** (none exists).
8. **Anti-fabrication rule** [S `AGENTS.md`, `strings.en-GB.ts` header]: any accuracy figure or
   verdict shown in the lay UI must carry its source or the label "heuristic". A compact
   convention is needed: a "rule of thumb" tag on verdicts and AOI advice, and a "sources" link on
   the expectation line [H].
9. **§4.7 mid-grey stage** stays binding for calibration and validation. Whether Eye tracking (it
   already uses the stage [C `live.ts` header]) and the Game also stay on the grey should be
   decided explicitly (§C9).

## A7. The no-scroll budget [H unless marked]

- **Viewports to design for** [M from the reviewers' emulation]: iPhone 13 portrait 390 × 664 and
  landscape 750 × 342 CSS px (browser bars included in those numbers); desktop 1280 × 800 and
  1920 × 1080. A smaller phone (375 × 667 with bars, so roughly 375 × 550 visible [H]) is the
  binding portrait case; phone landscape at about 340 px tall is the binding landscape case.
- **What fits a 390 × 664 portrait viewport** at eek-a-style sizes: a 44 px header row, a title at
  28 px, about 4–6 lines of 16 px body text (≈ 30–45 words at ~7 words per line on 358 px),
  a hero area, and one 44–48 px action row with safe-area padding. On the positioning step the
  hero (preview) takes 50–60 % of the height. So **each lay screen gets ≤ 40 words** of copy [H].
- **Landscape phone (≈ 340 px tall)**: one row of chrome at most; the preview sits beside the
  instruction (two columns), as the reviewers proposed [M].
- **Implementation rules**: size the shell with `100dvh` (falling back to `100vh`), a CSS grid with
  fixed rows (header, hero `minmax(0, 1fr)`, action bar), `min-height: 0` on the hero, the preview
  with `object-fit: cover` and a height cap; type and gaps fluid within the token range
  (`clamp()`); container queries for portrait and landscape layouts [E MDN viewport units:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/length#relative_length_units_based_on_viewport>].
- **Accessibility conflict**: WCAG 2.2 SC 1.4.4 (resize text to 200 %) and SC 1.4.10 (reflow at
  320 CSS px without two-dimensional scrolling) require that content stays available when the
  user enlarges text [E <https://www.w3.org/TR/WCAG22/#resize-text>,
  <https://www.w3.org/TR/WCAG22/#reflow>]. A hard `overflow: hidden` would break them, and Android
  font scaling (1.3× and more) makes it likely. Rule: fit at default size, test at 1.3× text, and
  let the page fall back to vertical scrolling (never horizontal) rather than clipping [H].
- **Long text that cannot fit** (About, 1,885 words; Data; Lab): the owner needs to choose
  between (a) a separate Methods document page, exempt from the no-scroll rule, (b) a sheet with
  tabs or pages, each sized to the viewport, or (c) internal scrolling inside the sheet, which is a
  scrollbar. Recommendation: (a) for Methods and references, (b) for Details [H].

---

# Part B — Reusable ideas from the owner's repositories

## B1. gaze-lite (`/home/user/gaze-lite`, read at HEAD) [C]

**Shell and toolbar** (`index.html`, `style.css`)

- Full-viewport app (`.app { position: fixed; inset: 0; overflow: hidden }`), which means no page
  scroll by construction. Faint 56 px engineering grid and a vignette (decoration that eek-a-style's
  calm pass would remove).
- **One unified toolbar** docked bottom-left (480 px; full width under 720 px), with a dock-top
  toggle. Row 1: icon-plus-label buttons (Camera, Calibrate, Validate, Heatmap, Frame, dock), inline
  monoline SVG icons (18 × 18 viewBox, stroke 1.4). Buttons are disabled until their step is
  possible, which encodes the procedure in the toolbar (Calibrate enables after Camera, Validate and
  Heatmap after Calibrate). Active state in the gaze red.
- Row 2: the camera preview (264 px wide; 180 × 50 px on phones, too small to judge framing) with a
  "STANDBY/LIVE" tag, plus readouts L / R (eye quality, coloured good ≥ 0.7, warn ≥ 0.45, else err),
  Head (yaw, pitch, signed degrees), FPS.
- **Session log strip**: one line with a severity dot, the last message and its time, expanding
  into the full log ("keep logs quiet by default, with expansion available" is also an eek-a-style
  rule [S]).
- During calibration and validation the toolbar is set to `opacity: 0; pointer-events: none` but
  **kept in the render tree**, because the video must stay rendered for MediaPipe and
  `requestVideoFrameCallback` keeps firing (commit `351cb1d`: rVFC "can be throttled for
  transformed or occluded video", which "stalled the gaze dot"). A lesson for any design that
  hides the preview.
- Text in JetBrains Mono throughout, 10.5–13 px, uppercase with letter-spacing. **Not reusable**
  for non-experts: eek-a-style puts mono on numerics only and keeps the UI minimum at 14 px [S].

**Auto-framing preview** (`autoFrame.ts`): a virtual pan, tilt and zoom over the full frame; the
tracker always sees the whole frame. Crop width so that the inter-ocular distance fills 36 % of it;
never closer than a crop of 0.28 of the frame (≈ 3.6×); deadbands 7 % (centre) and 12 % (zoom);
exponential easing with τ = 0.30 s (follow), 0.07 s (fast, when far off-centre; for hand-held
phones), 0.8 s (relax back to the full frame after 800 ms without eyes). Overlay (eye boxes, iris
dots, head-pose axes) mapped through the crop. **Use for the small reassurance thumbnail in Eye
tracking and Game; do not use in the positioning sub-step**, where the user must see the real
framing (§B3).

**Calibration target**: a solid red 64 px dot with a soft halo that **shrinks from scale 1 to 0.22
over 1,800 ms** (600 ms dwell + 1,200 ms collection, extending to 3,000 ms on slow devices); during
the head sweep it pulses, with a hint under the centre dot: "Keep looking at the dot · slowly turn &
move your head (or your phone)" (1,600 ms intro, 7,000 ms sweep). The shrink doubles as a "keep
looking until it has gone" timer, which non-experts understand without words [H]. eek-a-calibrate's
binding ABC target shrinks its ring only over the first 400 ms and then stands still for 1,200 ms
[S §4.7, C `target.ts`], so the user gets no "how long" cue during sampling. A sampling-progress cue
(an arc or fill) would need a §4.7 amendment [H].

**Validation target**: cyan 14 px dot plus a 52 px ring shrinking from 1.6× to 1×; 5 points (centre
and four at 15/85 % × 18/82 %), 450 ms dwell + 900 ms sampling.

**Gaze dot**: 14 px red disc moved with `translate3d` (compositor only); hidden after 600 ms without
eyes; held during blinks (both eyes, hysteresis 0.6/0.4, 800 ms cap); `opacity .25s` fade.
eek-a-calibrate already has a richer dot (confidence ring, greyed, edge-clamped hollow).

**Heatmap**: full-viewport canvas; a sample is added when the dot moves > 16 px, capped at 220;
each drawn as a radial gradient of radius 80 px × dpr (stops red 0.42 → orange 0.18 → transparent).
Reusable as a lay "where you looked" summary in Eye tracking or after a game; recolour to a
single-hue iris-blue ramp or viridis (eek-a-style continuous scales [S `design-system.md`]) and set
the radius from the validated accuracy so the blur honestly shows the uncertainty [H].

**Validation results screen**: one centred card (300–440 px), H1 "Validation", one row per point
("Centre Δ 41 px"), one summary line "Average deviation Δ N px · X % of screen" coloured good / warn
/ err at < 3.5 % / < 7.5 % of the diagonal, and a single "Done" button. **This is the model for the
result sub-step**: one card, one summary, one action. Improve it with a verdict word and glyph (never
colour alone [S]), the AOI sentence, and a verdict-dependent primary action.

## B2. PocketGaze (`/home/user/PocketGaze`) [C]

- **Structure**: an explainer site with Step 0 (overview) and seven step pages (capture and timing;
  face and eye features; head pose and motion quality; eye-local and gaze signals; calibration and
  personalisation; filtering and events; content and stimulus mapping) [C `steps.ts`]. Each step
  page has the same seven sections (introduction, methods, implementation on this page, live demo,
  master-controlled implementation panels, outputs, limitations) [C `StepPage.tsx`]. The pages are
  long and scroll; **the layout is not reusable** under the no-scroll rule.
- **Reusable: the progressive-disclosure ladder**: tier 1 *concept* always visible, tier 2
  *mechanism* in a local `<details>` ("How it works — mechanism"), tier 3 *maths* shown only when
  the single master "Show implementation details" control is on; the project rule forbids a second
  global toggle [C, `AGENTS.md`]. For eek-a-calibrate: tier 1 on the step screen, tier 2 in
  Details, tier 3 on the Methods page, and **one** expert-mode switch governing the expert controls
  in every step [H].
- **Reusable: the honest-claims table** of Step 0 (signal, what it is, needs calibration, needs
  validation, supports, does not support). Its "does not support" column is a good model for the
  one-line expectation on Intro ("not for reading words") [H].
- **Dwell-click demo** (`dwellClickTask.tsx`): 900 ms continuous dwell selects; three large targets
  (26 % × 40 % of the panel each); a progress ring shows the accumulating dwell; after a selection
  the target is **disarmed until the pointer leaves**, which prevents repeated triggering. Directly
  reusable in the Game (re-arm rule, generous targets).
- **Gaze-contingent demo** reports the felt lag as "≈ one gaze update + one render frame", an honest
  latency explanation reusable in the Game's copy (at 30 Hz a gaze update is ~33 ms) [C].
- Calibration layout: 3 × 3 grid at fractions {0, 0.5, 1} with a safe margin of
  `max(28 px, 8 % of the short side)` and a 28 px target; validation on 8 interior points at
  {0.25, 0.75} fractions; settle 700–800 ms [C, via `research/repo-pocketgaze.md` §3.7–3.8].

## B3. saccadacus (`scratchpad/repos/saccadacus`) [C]

- **Static centring guide, then auto-centring**: `cameraOverlay.ts` first drew a dashed box at
  ±18 % of the frame around the centre, with a crosshair, stroked green when the face centre was
  inside and grey otherwise. Commit `7e7292b` ("Auto-centre the camera feed on the head") **replaced
  it**: the feed is scaled by a fixed 1.3 and translated so that the smoothed face centre (EMA,
  α = 0.15 per frame) lands mid-view, clamped so no background shows. The commit message says it
  "replaces the static centring guide overlay".
  - Lesson [H]: auto-centring makes a comfortable picture but **removes the user's only cue** that
    they are off-centre, which is the opposite of what the owner asks for on phones. Use a
    centring guide (oval or box with a state change) in the positioning step, and keep any
    auto-centring for the reassurance thumbnail.
  - With a 1.3× fixed zoom the user can drift up to ~11 % of the frame without the picture changing
    [H arithmetic: the pan range is (1.3 − 1)/1.3 ≈ 23 % of the visible width, half each way].
- **Follow-the-dots**: dots at uniformly random positions with a 5 % margin, a new dot every
  1,200 ms, a 24 px blue dot on a near-black fullscreen dialog, the reliability at each onset
  recorded; at least 5 dots needed to fit a mapping. Shows that a follow-the-dots task can double
  as calibration data. For the Game: a continuous "chase" game can feed recalibration rows if every
  dot is labelled, but random positions without a settle window give poorer labels than the spec's
  600 ms settle + 1,000 ms sampling [H].
- **Status panel**: a 10-row `<dl>` (tracking, delegate, active signal, left/right/face reliability %,
  saccade and blink counts, mapping, export). An anti-pattern for lay users, the same as the 8-meter
  list. What is reusable is the idea underneath: **one smoothed reliability scalar** (EMA, α = 0.2;
  binocular reliability-weighted) that can drive a single lay "tracking quality" pill (Good / Weak /
  Lost) [C `reliability.ts`, H on the pill].
- **Head-motion labels**: head still ≤ 15°/s, moving ≤ 60°/s, otherwise uncertain; head reliability
  < 0.4 → uncertain [C `headMotionLabels.ts`]. Usable as default thresholds for a "hold your head
  still" cue during fixation blocks (heuristic; spec §4.7 already requires slow head motion for a
  frame to count).
- Overlay colours (eye corners orange/green, yaw/pitch/roll axes red/green/orange): expert-only;
  head-pose axes on a lay preview add noise [H].

## B4. FOXIE kindergaze demo (`/home/user/foxie-kindergaze-demo`) [C `FOXIE_demo_kindergaze.py`, `README.md`]

**Mechanics, with the parameters in `USER PARAMETERS`**

- All sizes in visual degrees from the viewing setup (60 cm, 34.5 × 19.5 cm monitor, 1920 × 1080);
  `deg_per_pix = 2·atan2(0.5·pix_cm, D)`.
- **Fixation check**: a fixation cross of 1.0°, an acceptance circle of **radius 1.0°** whose
  outline is always drawn, and a requirement of **1.0 s uninterrupted** inside (a frame counter
  that **resets to 0** on any frame outside); the red gaze dot (radius 0.2°) is drawn on every frame.
- **Target hold**: a black target of radius 2.0° at least 5.0° from the centre (margin = window
  radius + 0.5°), with an outlined acceptance window of **radius 2.0°**. While gaze is inside, the
  dot **shrinks linearly from 2.0° to 0.05° over 1.0 s**; on leaving, it **resets to full size at
  once**; the trial ends when it has shrunk away.
- **Return to centre**: the same 1 s fixation check before the next trial; after 5 s outside, the
  prompt "move gaze/mouse back to the fixation cross to start the next trial" appears below the
  cross.
- 10 trials; Space starts, Esc quits; one row per sample and one per trial are logged.

**What has to change for webcam gaze** [H, from the accuracy figures in spec Appendix B]

- FOXIE's windows assume a laboratory tracker. Webcam gaze is 2–4° off in good conditions, often
  4–8°, at ≤ 30 Hz [S Appendix B]. A 1° fixation window would almost never be held for 30
  consecutive samples. Size every acceptance window from the user's own result:
  radius ≥ max(1.5–2 × the 75th-percentile validation accuracy, half an AOI cell of the advised
  n × n grid), with targets placed at cell centres so the game only asks what the tracker can
  deliver.
- Replace the hard reset with a **grace period** (for example, ignore exits shorter than ~150–250
  ms and blink-held frames) or a leaky integrator (progress decays while outside rather than
  resetting); otherwise noise near the edge of the window makes the target flicker back to full
  size [H].
- **Do not show the raw gaze dot by default.** With a constant offset of a few degrees, users who
  look at the dot move it further away ("chasing"); show feedback on the target (shrink, glow,
  ring) instead, with an optional faint dot [H; a known problem in gaze interaction, not checked
  here].
- Keep the outline of the acceptance window visible: it tells a non-expert how precise they need
  to be, and it is honest about the tracker's resolution [H].
- Use the shrinking target as the game's core feedback: it needs no words, it is the same metaphor
  as gaze-lite's shrinking calibration dot, and it rewards exactly the behaviour (steady fixation)
  that gives good data [H].

## B5. Take and avoid

| Take | From | Where in the new UI |
|---|---|---|
| One card, one summary, one action for validation | gaze-lite results | Calibrate/result |
| Buttons enabled in procedure order; icon + label; single-line labels | gaze-lite toolbar | step indicator and action bar |
| Quiet one-line log that expands | gaze-lite | Details/This device |
| Keep the video rendered when hidden (opacity 0, not `display: none`) | gaze-lite `351cb1d` | every stage that hides the preview |
| Shrinking target as a wordless timer | gaze-lite, FOXIE | Game; optionally calibration (needs §4.7 amendment) |
| Re-arm after selection; generous targets | PocketGaze dwell-click | Game |
| Concept / mechanism / maths ladder with one master switch | PocketGaze | lay screen / Details / Methods; expert mode |
| Dashed centring guide with a state change | saccadacus (pre-`7e7292b`) | positioning sub-step |
| One smoothed reliability scalar → one quality pill | saccadacus | Eye tracking, Game |
| 1 s central fixation check before each trial | FOXIE | Game (window scaled to accuracy, with grace) |
| Heatmap of where you looked | gaze-lite | end of Eye tracking or Game (recoloured, radius = accuracy) |

| Avoid | Why |
|---|---|
| Auto-centring on the positioning screen | hides the framing error the user must correct |
| A list of numeric meters or a reliability `<dl>` | the "8-meter list" the owner found unusable |
| Mono, uppercase micro labels at 10–11 px | below the 14 px minimum; mono is for numerics only [S] |
| Head-pose axes and landmark meshes in the lay view | expert detail with no lay meaning [H] |
| A permanently visible raw gaze dot in the game | chasing an offset dot [H] |
| FOXIE's 1° and 2° windows | far below webcam accuracy [S Appendix B] |

---

# Part C — eek-a-style brief for this tool

Sources: `dist/design-system.md`, `source/visual/ui-and-interaction.md` (context `tool-ui`),
`source/visual/visual-principles.md`, `source/visual/colour-and-themes.md`,
`data/visual/tokens.css`, `source/operations/validation-cards.md` [S]. Tool UI defaults to **dark**.

## C1. Token block (drop-in)

The first two blocks are eek-a-style verbatim (generated from `tokens.json`; do not edit values).
The third block adds the app-specific roles, all built from those tokens or from binding
specification values, so no ad-hoc hex enters the UI.

```css
/* eek-a-style roles: dark is the identity default for tool UI. */
:root {
  color-scheme: dark light;
  --color-text: #f4f2ec;
  --color-muted-text: #9a9aa4;
  --color-faint: #787884;
  --color-background: #08080b;
  --color-surface: #17181e;
  --color-border: #2a2a35;
  --color-accent: #e8b43a;
  --color-accent-ink: #1a1400;
  --color-secondary: #6ba6e4;
  --color-secondary-muted: #69707d;
  --color-link: #7fb4ec;
  --color-success: #3ad08a;
  --color-warning: #f0b429;
  --color-error: #ff6f61;
  --color-info: #6ba6e4;
  --color-focus: #6ba6e4;
  --color-data-1: #e69f00; --color-data-2: #56b4e9; --color-data-3: #009e73;
  --color-data-4: #f0e442; --color-data-5: #0072b2; --color-data-6: #d55e00;
  --color-data-7: #cc79a7; --color-reference: #000000;

  --space-xs: 4px; --space-sm: 8px; --space-md: 16px; --space-lg: 24px; --space-xl: 40px;
  --radius-control: 12px; --radius-card: 14px; --radius-sheet: 22px; --radius-pill: 999px;
  --measure: 70ch;
  --font-serif: Spectral, 'Iowan Old Style', Georgia, serif;
  --font-sans: Lexend, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;
  --font-size-sm: 14px; --font-size-md: 16px; --font-size-lg: 20px; --font-size-xl: 28px;
  --font-weight-regular: 400; --font-weight-medium: 500; --font-weight-bold: 700;
  --line-height-tight: 1.25; --line-height-normal: 1.55;
}

/* Light: OS preference unless the page forces dark; or an explicit data-theme. */
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) {
    --color-text: #1a1a1a; --color-muted-text: #5a5a5a; --color-faint: #70707a;
    --color-background: #ffffff; --color-surface: #f5f5f5; --color-border: #d9d9d9;
    --color-accent: #8a6d00; --color-accent-ink: #ffffff;
    --color-secondary: #1a6cb0; --color-secondary-muted: #6b7280; --color-link: #0061a8;
    --color-success: #1b7a4b; --color-warning: #8a5a00; --color-error: #b3261e;
    --color-info: #1a6cb0; --color-focus: #1a6cb0;
  }
}
:root[data-theme='light'] { /* the same 16 values as the media block above */ }
:root[data-theme='dark']  { /* the dark values of :root */ }

/* App roles (eek-a-calibrate). */
:root {
  /* Calibration stage: binding mid-grey (spec §4.7) and what may sit on it. */
  --stage: #808080;
  --stage-ink: var(--color-reference);          /* black: 5.32:1 on the stage */
  --stage-chip: rgb(23 24 30 / 0.88);           /* surface over the stage = #24242a, 3.91:1 */
  --stage-chip-text: #f4f2ec;                   /* dark text role: 13.8:1 on the chip */

  /* Control boundaries that carry meaning (WCAG 1.4.11 ≥ 3:1): border is decorative only. */
  --control-boundary: var(--color-faint);       /* dark 4.59:1 on bg, 4.06:1 on surface */

  /* Signal versus action: the gaze is signal (iris), the primary action is gold. */
  --gaze: var(--color-secondary);
  --gaze-outline: var(--color-reference);       /* the outline carries contrast on the grey */
  --target: var(--color-reference);             /* ABC target is black (spec §4.7) */

  /* Engines keep the Okabe–Ito mapping already in use. */
  --engine-blazegaze: var(--color-data-5);
  --engine-peekr: var(--color-data-1);
  --engine-geometric: var(--color-data-3);
  --engine-eyepixel: var(--color-data-7);
  --engine-combined: var(--color-text);

  /* Layout. */
  --tap: 44px;                                  /* MOBILE.minTouchPx (spec §14.2.7) */
  --gutter-l: max(var(--space-md), env(safe-area-inset-left));
  --gutter-r: max(var(--space-md), env(safe-area-inset-right));
  --gutter-b: max(var(--space-md), env(safe-area-inset-bottom));
  --app-h: 100dvh;                              /* fall back to 100vh where dvh is missing */
}
```

Notes:

- The eek-a-style `tokens.css` puts light under `@media (prefers-color-scheme: light) { :root }`
  and relies on source order for `[data-theme='dark']` to win; the `:not([data-theme='dark'])`
  guard above makes the override independent of order [C, H].
- Fonts: the app's CSP is `font-src 'self'` [C `public/.htaccess`], and eek-a-style prefers
  self-hosting [S]. Ship Lexend (and only if headings use it, Spectral; JetBrains Mono for
  numerics) as self-hosted WOFF2 under `/eek-a-calibrate/`. All three are licensed under the SIL
  OFL [H: not re-checked here]. System fallbacks are acceptable during load
  (`font-display: swap`).
- Migration from the current tokens: `--bg → --color-background` (`#0a0a0f → #08080b`),
  `--surface → --color-surface`, `--fg → --color-text`, `--muted → --color-muted-text`,
  `--accent` (dark identical; light `#8a5a00 → #8a6d00`), `--ok/--warn/--danger →
  --color-success/--color-warning/--color-error`, `--c-* → --engine-*` (same hues), `--radius
  0.5rem → the role radii`, the system font → Lexend [C `style.css`].

## C2. Type roles

| Role | Family | Size / weight | Use in this app |
|---|---|---|---|
| Display | Spectral | xl 28 px / bold | at most the Intro title; never UI [S] |
| Section heading | Lexend | lg 20 px / medium | card titles ("Good accuracy"), sheet titles |
| Body and UI | Lexend | md 16 px / regular | instructions, buttons, labels |
| Caption, metadata, control labels | Lexend | sm 14 px / regular or medium | the minimum size anywhere [S scale] |
| Live numerics | JetBrains Mono | sm 14 px, `--color-faint` | fps, %, cm, countdowns, the telemetry strip `24 fps · good signal` [S] |

Line height 1.25 (tight, headings and buttons) and 1.55 (body); `--measure` 70ch only for long
text (Methods), not for UI [S]. Labels on one line; full words, no abbreviations ("Accuracy check",
not "Drift (D)") [S].

## C3. Spacing, radius, density

- Spacing `xs 4 · sm 8 · md 16 · lg 24 · xl 40`; one density per surface: compact (sm/md) for the
  stage chips, the sheet and the action bar; md/lg for the Intro and the result card [S].
- Radius by role, everywhere: control 12 (buttons, inputs, chips on the stage), card 14 (result
  card, sheet sides, instruction cards), sheet 22 (top corners of a bottom sheet), pill 999 (status
  pill, toggles, step indicator dots) [S]. Today the app uses one 0.5 rem radius and 0.4 rem on the
  stage [C].
- Elevation, not hairlines: background → surface step for cards and sheets; border only as a
  secondary cue; no accent-tinted panels; soft shadow only in light theme and for the sheet [S].
- Telemetry in one slim inline strip, never tiles [S].

## C4. Accent budget and colour roles, applied

| Element | Role | Note |
|---|---|---|
| The one primary action per view (Start camera, Start, Continue / Try again, Play) | `accent` fill, `accent-ink` label | one touchpoint [S] |
| Live/active state (camera live dot, recording, "tracking" pulse) | `accent` | the second and last touchpoint [S] |
| Gaze dot, signal traces, heatmap hue | `secondary` (iris) | signal is not action [S]; on the grey stage it needs the black outline (1.54:1 alone) |
| A second series (e.g. a per-engine dot in expert mode, a reference) | `secondary-muted` | not a competing hue [S]; per-engine dots use the Okabe–Ito engine colours only in expert mode |
| Verdicts and checks | `success` ✓ / `warning` ~ / `error` ✕ / `info` i | always with a word or glyph [S] |
| Secondary actions (Try again when the verdict is good, Details, Back) | `surface` + `control-boundary` | never gold [S] |
| Focus ring | `focus`, 2–3 px, offset 2 px | ≥ 3:1 against adjacent colour; on the stage add a black outer ring (dark focus is 1.54:1 on the grey) [M] |

## C5. Contrast table (computed with the WCAG 2.x formula) [M]

| Pair | Dark | Light |
|---|---|---|
| text / background | 17.87 | 17.40 |
| muted-text / surface | 6.35 | 6.33 |
| faint / background · faint / surface | 4.59 · 4.06 | 4.90 · 4.49 |
| border / background · border / surface | 1.41 · 1.25 (decorative only) | 1.41 · 1.29 |
| surface / background | 1.13 | 1.09 |
| accent / background · accent-ink on accent | 10.50 · 9.63 | 4.92 · 4.92 |
| secondary / background | 7.81 | 5.50 |
| success · warning · error on surface | 8.91 · 9.50 · 6.49 | 4.90 · 5.44 · 6.00 |
| focus / accent (ring touching a gold button) | 1.34 | 1.12 |

On the stage grey `#808080`: black 5.32, white 3.95, dark surface 4.48, the `#24242a` chip 3.91;
gold 2.07, iris and focus 1.54, success 1.99, error 1.45, data-6 (current target-plot cross)
1.02, data-5 1.31. **On the chip**: text 13.79, muted 5.54, gold 8.10, success 7.77, warning
8.28, error 5.66.

Consequences:

- every control on the stage is a dark chip with light text, or black;
- state colour on the stage lives inside a chip, never as a bare mark on the grey;
- the focus ring must not touch a gold button (offset it over the background, 1.34:1 otherwise);
- `surface` / `background` at 1.13 is a small step; eek-a-style asks for a "clearly visible"
  step but does not set a ratio, so judge it on a real phone at low brightness [H].

## C6. Motion [S unless marked]

- Live-state pulse: opacity 1 → 0.35 → 1, about 1.8 s, ease-in-out (camera live, tracking).
- Sheets and overlays: about 200–220 ms ease-out, scrim fade about 160 ms.
- Nothing attention-grabbing by default; no decorative animation.
- Functional stimulus motion is governed by the specification, not by the style: the target ring
  (3° → 0.6° over 400 ms), the pursuit path, and under `prefers-reduced-motion` a static target and
  an optional pursuit block [S §4.7, §7]. The current global reduced-motion override in `style.css`
  stays [C].
- Game feedback (shrink, a short success burst ≤ 300 ms) is functional and allowed; under reduced
  motion use a fill or opacity change instead of scale [H].

## C7. Bottom sheet and layouts

**Sheet spec** [S]: triggered by a compact row or button; a grip handle; `radius-card` sides
rising to `radius-sheet` at the top corners; scrim `rgba(0, 0, 0, 0.55)`; an elevation shadow; a
"Done" primary action to dismiss. Add [H]: drag-down and Esc also dismiss; focus is trapped while
open and returns to the trigger; the sheet's height is capped at about 85 % of `--app-h`; its
sections are tabs or pages so that no section needs to scroll (§A7); on desktop the same component
docks as a right-hand side sheet about 360–420 px wide.

**Layout skeleton** [H]

- Portrait phone: grid rows `auto` (step indicator left, Details right) · `minmax(0, 1fr)` (hero)
  · `auto` (instruction, ≤ 2 lines) · `auto` (action bar, padded by `--gutter-b`).
- Landscape phone (≈ 340 px tall): two columns, hero left (≈ 60 %), instruction and action right;
  the step indicator collapses into the Details button row.
- Desktop: the same two columns from ~960 px wide (as the reviewers proposed for Camera [M]),
  centred, max ~1,200 px; the hero preview capped so that the face is life-sized at most [H].
- Stage screens (calibration, validation, eye tracking, game): full-bleed grey, chrome only as
  corner chips inside the safe rectangle [S §14.2.5].

## C8. Tool-UI validation card (acceptance checklist) [S `validation-cards.md`]

**Must pass**: primary action clear; secondary actions subordinate; accent budget respected (the
one primary action and the live/active state only; not on headers, tags, borders or icons);
contrast between elements carried by a visible surface-elevation step, not hairlines alone; the
subject given dominant size and position; states visible and bound to the success / warning /
error / info roles; keyboard focus visible on every control; errors and warnings distinct; mobile
and desktop readable; controls grouped by task.

**Allowed variation**: panel layout, accent placement within budget, density, typography.

**Fail if**: chaotic result display; accent spread across many elements; sections grouped by
accent-tinted fills; same-colour blocks separated only by a near-invisible hairline; **low-value
telemetry given the weight of primary content**; ambiguous success or failure state; focus removed
or invisible; status in an off-token colour; primary action hidden; navigation needing horizontal
scrolling on mobile. **Score**: pass / fail, or 0–2.

**App-specific tests to add to the card** [H]:

1. Every lay screen fits 390 × 664 and 750 × 342 without scrolling, at default text size; at 1.3×
   text it may scroll vertically, never horizontally.
2. The positioning step shows at most one instruction sentence, and no raw numbers.
3. The result card shows the verdict as a word plus a glyph, and its primary action changes with
   the verdict.
4. No gold on the grey stage except inside a chip; every stage control ≥ 3:1 against the grey.
5. Every figure and verdict on a lay screen carries a source link or a "rule of thumb" tag
   (anti-fabrication rule).
6. "Delete all my data" is reachable in at most two taps from any step.
7. All targets ≥ 44 × 44 px.

## C9. Where eek-a-style and the app pull apart

1. **Dark identity versus the grey stage.** The style makes tool UI dark; the specification makes
   the calibration stage mid-grey [S §4.7]. On a phone at 30–40 cm the screen lights the face, so
   a dark positioning screen followed by a grey stage changes face brightness and glare between the
   check and the calibration, and changes pupil size [H]. For pupil-based laboratory trackers,
   pupil-size changes are known to shift the estimated gaze (Choe, Blake and Lee 2016, *Vision
   Research* 118, 48–59, as described in
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC8516786>) [E, secondary; transfer to landmark-based
   webcam gaze not established]. Recommendation [H]: the positioning sub-step, Eye tracking and the
   Game share the stage's luminance (grey surround, dark chips), and the dark theme is used for
   Intro, Details and Methods. At minimum, re-run the lighting checks on the grey stage just before
   block A.
2. **"Mono for live numerics"** fits the telemetry strip, but non-experts should rarely see
   numbers at all (§A4) [S, H].
3. **The light theme's gold** (`#8a6d00`) reaches only 4.92:1 for its label on the primary
   button: AA for 16 px text, but no margin [M].
4. **Okabe–Ito engine colours** are already the eek-a-style data palette (identical hex), so no
   re-mapping is needed; keep them out of the lay view (signal hue only) [C, S].
5. **Bottom sheets with scrolling content** would reintroduce scrollbars; see §A7 for the
   pagination rule.

---

## Sources

Code and documents read (local, read-only):

- `/home/user/eek-a-calibrate/src/app/{router.ts, style.css, strings.en-GB.ts, state.ts}`,
  `src/app/screens/*.ts`, `src/app/components/{qualityMeter, poseGuide, target, gazeDot,
  stimulusCanvas}.ts`, `src/main.ts`, `index.html`, `public/.htaccess`,
  `docs-dev/reference/primary_authoritative/specification.md` (§4.7, §7, §14.2), `AGENTS.md`.
- `(session scratch, not kept)/review-findings.json`
  (26 findings in `ui-desktop` and `ui-mobile`, with screenshots under `scratchpad/review-desktop/`
  and `scratchpad/review-mobile/`).
- `/home/user/gaze-lite/{index.html, src/style.css, src/main.ts, src/autoFrame.ts,
  src/drawing.ts, src/calibration.ts}`; `scratchpad/research/repo-gaze-lite.md`.
- `/home/user/PocketGaze/src/{steps.ts, components/StepPage.tsx, demos/dwellClickTask.tsx,
  demos/gazeContingentTask.tsx}`; `scratchpad/research/repo-pocketgaze.md`.
- `scratchpad/repos/saccadacus/src/{app/panels/*.tsx, app/useRealTracking.ts,
  visualisation/cameraOverlay.ts, tasks/followTheDots/followTheDotsController.ts,
  signals/reliability.ts, events/headMotionLabels.ts}`, commit `7e7292b`.
- `/home/user/foxie-kindergaze-demo/kindergaze-demo/{FOXIE_demo_kindergaze.py, README.md}`.
- `/home/user/eek-a-style/{dist/design-system.md, data/visual/tokens.css,
  source/visual/ui-and-interaction.md, source/visual/visual-principles.md,
  source/visual/colour-and-themes.md, source/operations/validation-cards.md}`.

External:

- WCAG 2.2, SC 1.4.4 Resize Text: <https://www.w3.org/TR/WCAG22/#resize-text>
- WCAG 2.2, SC 1.4.10 Reflow: <https://www.w3.org/TR/WCAG22/#reflow>
- WCAG 2.2, SC 1.4.11 Non-text Contrast: <https://www.w3.org/TR/WCAG22/#non-text-contrast>
- MDN, viewport-relative length units (`svh`, `dvh`):
  <https://developer.mozilla.org/en-US/docs/Web/CSS/length#relative_length_units_based_on_viewport>
- MDN, `DeviceOrientationEvent.requestPermission()` (iOS permission tap):
  <https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static>
- Choe, Blake and Lee (2016), pupil size and gaze estimation, as described in
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC8516786> (secondary source).
