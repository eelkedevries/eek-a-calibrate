# eek-a-calibrate v2: "Pop with your eyes", a game-first design specification

Lead design specification for the redesign of eek-a-calibrate (`https://eelkedevries.com/eek-a-calibrate/`),
version 2, 4 November 2026. It replaces version 1 (`design-spec-v1.md`, same folder), which framed the
app as four procedural steps (Intro, Calibrate, Eye tracking, Game).

**The owner's direction after the first round:** "It was meant primarily as calibration game.
Organise it from start game perspective." This specification therefore treats the whole app as a
game from its first screen. Calibration is not a procedure that precedes the game: it is the game's
**warm-up levels**. Validation is the warm-up's last level, live tracking is a **free look** sandbox,
and the gaze-contingent game is the **challenge**.

Evidence and sources are in the four research reports in
`./`: `r-positioning.md`,
`r-flow-game.md`, `r-layout.md` and `r-audit.md`, cited as `[pos §2.3]`, `[flow §8.1]`,
`[layout §3]` and `[audit B4]`. The protocol figures (`CAL13`, `VAL12`, `HEAD5`, settle and sample
times) come from the binding specification v0.4 (`docs-dev/reference/primary_authoritative/specification.md`
in `eek-a-calibrate`, §4.7, §4.13 and Appendix A), cited as `[spec §4.7]`. Untested thresholds are
marked **heuristic**. Nothing here changes a repository; building it needs the specification
amendments in §9 first.

What v1 settled and v2 keeps unchanged in substance: the positioning system (§3 here), the
no-scroll shell and layout rules (§4), the shared CSS and drawing kit (§6, extended), the Details
sheet (§2.17), studio grey for camera-facing phases, and the honesty rules (no invented accuracy
figures; example values look like examples).

---

## 0. Decisions in brief

1. **The app is one game, "Pop with your eyes"**, shown under the eek-a-calibrate wordmark. Its
   parts, in order: **Title → Get ready → Warm-up (four levels) → Warm-up complete → Free look →
   Challenge (three rounds)**. Every screen belongs to the game; no screen is introduced as a
   procedure.
2. **Calibration is the warm-up.** The Standard protocol is kept exactly and presented as four
   levels: Level 1 **Pop the dots** (`CAL13` fixations), Level 2 **Follow the firefly** (pursuit),
   Level 3 **Turn your head** (`HEAD5` head motion), Level 4 **Test round** (`VAL12` validation).
   Each level opens with a short level card that starts by itself after 3 s.
3. **One bubble everywhere, with one rule**: "Keep your eyes on the dot until the bubble pops." The
   same bubble (a translucent disc with a black edge and the spec's ABC dot at its centre) is the
   warm-up target, the re-aim target and the challenge target.
   - In the warm-up it shrinks during the sampling window and pops when the window ends: **on a
     timer**. The copy never says that the eyes popped it.
   - In the challenge it shrinks **only while the tracker sees you looking at its zone**. The first
     round card says so: "Now your eyes do the popping."
4. **No points during the warm-up.** A pip line on the camera edge counts bubbles, each level card
   reports how steady the camera saw you ("Level 1 clear · Nice and steady"), and stars are awarded
   once, on Warm-up complete, from the Test round. Points exist only where gaze really controls
   something: the challenge.
5. **A level track replaces the step indicator**: four numbered level nodes and a star node for the
   challenge, with the phase name beside them ("Get ready", "Warm-up complete", "Free look"). It
   fits one line at 360 px (134 px of nodes plus a label of up to 133 px) and is never gold.
6. **Warm-up complete is a level-complete screen**: up to three stars (from the verdict) and the
   number of screen zones the player's eyes can control ("You unlocked 3 zones", from the adaptive
   grid). The zones become the challenge board. Below two zones the challenge stays locked and the
   primary action is "Get ready again"; a rough result makes "Warm up again" the primary.
7. **Free look is the sandbox**: the zones drawn on the grey, the looked-at zone lit, a soft disc for
   the gaze estimate, and one primary action, "Play the challenge".
8. **The challenge is "Pop!"** (the FOXIE dwell-shrink mechanic made webcam-sized): one bubble at a
   time in one of the player's zones, a leaky dwell timer, three rounds of 16 bubbles (plain,
   spiky decoys, drifters), score, streak and stars. When the hit rate drops, a 5-second **Re-aim**
   mini-level (the spec's 2-target drift check) is offered before anything heavier.
9. **The position guard runs throughout**: the full guide on Get ready (v1's positioning system,
   now the game's ready check, ending with a hold ring and "Start warm-up"), then the compact glyph
   and the auto-pause overlay ("Paused · Move back into view") in every level, in Free look and in
   the challenge.
10. **Luminance**: studio grey (`#808080`, binding during the warm-up levels) for every
    camera-facing play phase; the dark identity for the three menu screens (Title, Warm-up complete,
    Round complete) and for Details.
11. **One screen, never a scrollbar; one instruction, one primary action, one picture per screen**;
    expert material in the Details sheet. Unchanged from v1.
12. **Spec amendments are needed** for presentation (the shrink moves from the settle to the sample
    window), the game screens, tilt sensing, rectangular zones and the stars mapping (§9). The new
    shrink timing is checked on a pilot before release (§10).
13. **Changes from v1, decided here**: the four step names are replaced by the game's parts; the
    title's distance illustration with centimetres is replaced by a level map and a set-up chooser;
    "Start the camera" becomes "Play"; "Continue" after the result becomes "Try your zones"; the
    game end's first remedy is "Re-aim", not "Calibrate again"; on phones the position glyph moves
    out of the top bar into the Free look dock (the bar now carries the track).

---

## 1. Design principles

1. **It is a game from the first screen.** Every screen has a game name, a goal the player can
   see, and a visible sense of progress (the level track, the pip line, stars). Nothing reads as a
   form, a wizard or a test procedure, and nothing is labelled "calibration" outside Details.
2. **Honest play.** Game feedback only claims what the system measured.
   - Warm-up bubbles pop on a timer, and the copy says "until the bubble pops", never "pop it with
     your eyes".
   - Head-driven feedback (the arcs in Level 3, the steadiness line) is real: it comes from the
     measured head pose and frame acceptance, not from gaze.
   - Gaze-driven feedback (lit zones, shrinking in the challenge) appears only after the warm-up.
   - Stars and zones carry "Rule of thumb" and every example number on a board carries the
     **Example** badge (anti-fabrication rule, `AGENTS.md`).
3. **One rule, learnt once.** "Keep your eyes on the dot until the bubble pops" is taught in Level
   1, repeated in the Test round and the Re-aim, and becomes real in the challenge.
4. **Game-like, clean and minimal, not cartoonish** (eek-a-style tool-ui). Flat translucent
   bubbles, thin black strokes on the grey, Spectral for display names, no mascots, no gradients,
   no glow, no confetti, no gold stars.
5. **Non-expert first.** Every screen answers what is happening, what to do now and how to go on.
   *Yaw*, *luma*, *fps*, *estimator* and *degrees* appear only in Details.
6. **One instruction at a time, one primary action per screen**, in gold, at the bottom on phones.
   At most one secondary action beside it.
7. **No scrolling, ever, at default text size.** Copy is written to the budget of §4.6.
8. **The subject gets the space.** The camera image, the bubble, the firefly, the zones or the
   board fill the screen; chrome floats on small dark chips.
9. **Stimulus areas are clean.** While a bubble or the firefly is on screen there is no text and no
   control except the pip line on the camera edge, the corner cluster (position glyph and Pause) in
   the corner farthest from the camera, and, in Level 3 only, one caption chip.
10. **State is never colour alone** (colour plus word, glyph and line style), **calm motion**
    (200 ms transitions, one 1.8 s live pulse, functional animation only), and **gold only for the
    one primary action and the live state**.

---

## 2. The game, screen by screen

### 2.1 Map and timings

```
Title ─Play─▶ Get ready ─Start warm-up─▶ ┌ Level 1 card ▸ Pop the dots ─────────┐
                                         │ Level 2 card ▸ Follow the firefly    │  warm-up
                                         │ Level 3 card ▸ Turn your head        │  (fullscreen
                                         └ Level 4 card ▸ Test round ▸ Checking ┘   from here)
   ┌────────────────────────────────────────────────────────────────────────────┘
   ▼
Warm-up complete ─Try your zones─▶ Free look ─Play the challenge─▶ Round card ▸ Round ▸ Round complete
   │  └─Warm up again─▶ Level 1 card                                   ▲            │ ─Next round─┐
   └─(no zones) Get ready again─▶ Get ready                            └────────────┴─────────────┘
                                         Re-aim (2 bubbles) is offered in Free look and in a round
```

| Part | Screen | Mode (§2.2) | Typical time | Leaves when |
|---|---|---|---|---|
| Title | Title | framed, dark | 10 s | "Play" tapped and the camera is allowed |
| Ready check | Get ready | immersive, grey veil | 15–40 s | *Ready* held, then "Start warm-up" tapped (or "Start anyway" after 20 s) |
| Warm-up | Level 1 card, Pop the dots | stimulus, grey | 3 s + ≈ 23 s | the 13th bubble (and any retries) has popped |
| | Level 2 card, Follow the firefly | stimulus, grey | 3 s + ≈ 17 s | the path ends |
| | Level 3 card, Turn your head | stimulus, grey | 3 s + ≈ 23–30 s | the 5th bubble has popped |
| | Level 4 card, Test round | stimulus, grey | 3 s + ≈ 21 s | the 12th bubble has popped |
| | Checking your aim… | stimulus, grey | ≤ 3 s | fit and scoring done |
| Result | Warm-up complete | framed, dark | 10 s | the outcome's primary or secondary action |
| Sandbox | Free look | immersive, grey | free; 10–60 s | "Play the challenge" |
| Challenge | Round card → round | stimulus, grey | 3 s + ≈ 60 s | 16 bubbles done |
| | Round complete | framed, dark | 10 s | "Next round", "Play again", "Re-aim" or "Free look" |

Level times: Level 1 = 13 × (600 ms settle + 1000 ms sample + 150 ms pop) ≈ 23 s; Level 2 = 1 s hold +
16 s path; Level 3 = 5 × (600 + 2000 + 2000 ms + pop), up to 6 s per bubble; Level 4 = 12 × 1.75 s ≈
21 s [spec §4.7]. Warm-up total with cards ≈ 100 s. Time from Title to the first challenge bubble
≈ 2 min 40 s, so the Title says "About 3 minutes".

**Fullscreen**: "Start warm-up" enters element fullscreen (Android, desktop) or viewport mode
(iPhone), locks orientation where possible, and stays on through Warm-up complete, Free look and
the challenge, because any exit invalidates the fit [spec §4.7]. Dark menu screens inside this span
are drawn inside fullscreen.

### 2.2 Modes and luminance

| Mode | Screens | Background | Rule |
|---|---|---|---|
| **Framed** | Title, Warm-up complete, Round complete | `--color-background` (dark) | regions do not overlap; the stage is a `--color-surface` card, radius 14 |
| **Immersive** | Get ready, Free look, auto-pause overlay | camera preview under the grey veil (Get ready); `--stage` grey (Free look) | the stage bleeds edge to edge; top bar, cue and dock float on `--stage-chip` surfaces |
| **Stimulus** | level cards, warm-up levels, Checking your aim…, round cards, rounds, Re-aim | `--stage` `#808080` | no regions; pip line on the camera edge; corner cluster farthest from the camera; cards are dark chip cards centred on the grey |

The grey is binding for the warm-up levels [spec §4.7]. Get ready (veil at 86 % grey), Free look and
the rounds share its luminance so that the light and glare checks happen under the screen light
that calibration uses [audit C9]. The three menu screens are dark: they are read, not tracked, and
they last about 10 s each.

### 2.3 The level track

The track is the game's map in one line. It replaces v1's step indicator everywhere.

**Nodes** (in order): one node per warm-up level of the chosen length (four in Standard; two in
Quick, five in Thorough, §2.11), then one **star node** for the challenge. Get ready, Free look and
the menu screens are not nodes: they are shown by the **phase label**.

**Node states** (on the dark background and on a stage chip alike):

| State | Circle | Content |
|---|---|---|
| Future | no fill, 1.5 px `--node-line` stroke | number in `--color-muted-text` (14 medium) |
| Current | filled `--color-text` | number in `--color-background` (14 medium) |
| Done | filled `--node-done` | check path stroked `--color-text`, 2 px |
| Star, locked | no fill, 1.5 px `--node-line` | star outline, 1.5 px `--color-muted-text` |
| Star, unlocked (≥ 2 zones) | no fill, 1.5 px `--color-text` | star outline, 1.5 px `--color-text` |
| Star, current (challenge) | filled `--color-text` | star filled `--color-background` |

Connectors: 1.5 px `--node-line`. Never gold; no node pulses.

**Phase label** (14 px medium, `--color-text` on dark, `--stage-chip-text` on a chip), left of the
nodes: "Get ready" · "Warm-up complete" · "Free look" · "Challenge". On desktop the label is shown
only when no node is current (each desktop node already carries its name).

**Geometry**

- **Phones** (bar < 640 px): one inline SVG, 134 × 22 (`aria-hidden="true"`), five 22 px nodes at
  x centres 11, 39, 67, 95, 123, connectors from x 22–28, 50–56, 78–84, 106–112 at y 11. Numbers are
  SVG text, 14 px, weight 500, `style="font-family:var(--font-sans)"`, centred at y 16. The label sits
  10 px left of it. A visually hidden text states the position, e.g. "Get ready. Next: level 1 of
  4", "Warm-up complete. Challenge unlocked".
- **Fit at 360 px**, dark bar (328 px, no padding): label "Warm-up complete" 133 + 10 + nodes 134 +
  Details 44 = 321 px. Stage-chip pill (328 px, padding 12 left and 2 right): label "Get ready" 69
  or "Free look" 64 + 10 + 134 + 44 = 271 px. Both fit with margin. Thorough (six nodes, 162 px)
  drops the label on the dark bar by the fit guard.
- **Desktop and tablets** (bar ≥ 640 px): an `<ol aria-label="Game progress">` centred in the bar.
  Each item: a 24 px node and its name (14 px; current item medium `--color-text`, others
  `--color-muted-text`) 8 px apart; items joined by 24 × 1.5 px connectors with 8 px space each side;
  names "Pop", "Follow", "Turn", "Test", "Challenge" (Quick: "Pop", "Test"; Thorough adds "Lean in"
  before "Test"). The current item has `aria-current="step"`. About 520 px wide; with the phase label
  and a 1 × 20 px divider (`--node-line`) on its left, about 640 px.
- **Fit guard ladder**: drop the wordmark (desktop) → drop the phase label → nodes become 8 px dots
  (current: a 16 × 8 pill) with no numbers.

**Where it shows**

| Screen | Track state | Phase label |
|---|---|---|
| Title | not shown (the level map is the hero, §2.4) | — |
| Get ready | all future, star locked | Get ready |
| Level cards | levels before: done; this level: current; star locked | none (the card says "Level 2 of 4") |
| Levels, Checking, rounds, Re-aim | hidden (stimulus) | — |
| Warm-up complete | all levels done; star unlocked (or locked below 2 zones) | Warm-up complete |
| Free look | all levels done; star unlocked | Free look |
| Round cards, Round complete | all levels done; star current | Challenge (phones only) |

### 2.4 Title screen

The game's front door. Framed, dark. Contents, top to bottom (phone):

1. **Top bar**: identity mark and the wordmark "eek-a-calibrate" (Spectral 600, 20 px) at the left;
   Details at the right.
2. **Title block**, centred: the game title **"Pop with your eyes"** (Spectral 600, 36 px on phones,
   one line: 305 px; 48 px on desktop) and one line of pitch, 16 px muted: "Warm up the tracker,
   then pop bubbles just by looking."
3. **Hero card** (the stage): an emblem of three bubbles (one whole with the ABC dot, one smaller,
   one mid-pop) above the **level map**: five 48 px bubble nodes on a dotted line, each holding its
   level pictogram, named underneath: Pop · Follow · Turn · Test · Challenge. The map is the track
   drawn large; it shows the whole game before it starts. The emblem is decorative and is the first
   thing the fit guard drops (hero inner height < 160 px).
4. **Set-up chooser**: "How are you playing?" (14 medium, muted) over a radio group of three tiles,
   72 px tall, icon over label: **Propped** (phone on a stand), **In hand** (phone held), **Webcam**
   (laptop with a camera dot). Accessible names: "Phone propped up", "Phone in hand", "Computer
   webcam". Pre-selected from `pointer: coarse` and the screen size (spec §14.2.1): phones →
   Propped, everything else → Webcam. The choice changes only copy and thresholds (§3.2): In hand
   relaxes the steadiness cue and adds "Hold the phone at eye level" hints.
5. **Play** (primary, gold, full width, with a play triangle). If a stored warm-up exists for this
   camera and screen, a secondary **"Skip warm-up"** appears to its left; it runs Get ready, then a
   forced Re-aim (the spec forces a drift check after restoring a calibration [spec §4.13]), then
   Free look. First-run boards never show it.
6. **Meta line**, 14 px muted, centred, plain text with icons (not chips): clock "About 3 minutes" ·
   lock "Nothing is uploaded". Quick and Thorough change the time to "About 2 minutes" / "About 4
   minutes".

Behaviour:

- The face-model download (about 7 MB, shared) starts when the Title loads; its size is in Details →
  Device. The capability check is silent; if something blocks, the Play slot shows only the blocking
  message (§2.16).
- **Play** requests the camera; on iOS the same tap then calls `DeviceMotionEvent.requestPermission()`
  (camera first, motion second). Refusing motion changes nothing visible. The wake lock is taken
  here and held until the player leaves.
- Details on the Title opens on About. Words outside the hero: 29.

### 2.5 Get ready (the ready check)

v1's positioning screen (§3 here in full) presented as the game's ready check. Immersive, the
mirrored camera image under the grey veil.

- **Top bar** (stage-chip pill): phase label "Get ready", the track (all future), Details.
- **Cue card** near the camera edge: one instruction at a time from the priority order (§3.4), with
  a tip after 4 s. While the face model loads: "Getting ready… 62 %" (live value).
- **Stage**: the target oval ("fill the oval"), the live face outline, the two eye dots, one
  directional cue (§3.5).
- **Hold ring**: when every check is clear, a 5 px ring in `--state-good` traces the oval clockwise
  over 2 s (`SETUP.holdMs`) with the cue "Perfect, hold still"; a break restarts it. When it
  completes, *Ready* latches: a 24 px ✓ badge sits at the top of the oval, the cue reads "Ready" with
  the tip "Stay like this while you play", and haptics (Android) give 20 ms. *Home* is stored here
  (§3.3).
- **Dock**: status row (Distance · Position · Light, each ✓ or !) and one action slot:
  - not ready: "Start warm-up", disabled;
  - not ready after 20 s with a face present: "Start anyway" in the secondary style, with the faint
    line "You may unlock fewer zones" above it; never offered without a face;
  - *Ready*: **"Start warm-up"**, primary, enabled.
- The tap enters fullscreen and opens the Level 1 card. It cannot start by itself, because
  fullscreen needs the tap; with "Read instructions aloud" on, *Ready* also says "Tap anywhere to
  start" and the whole screen becomes the target.
- If the stimulus window would be smaller than 280 px on its short side, the action slot reads "Make
  the window larger to play" instead.

### 2.6 Warm-up levels: shared rules

**Level card** (stimulus mode, centred dark chip card on the grey, `role="dialog"`):

1. a level-clear line for the previous level (cards 2–4 only): ✓ badge 16 px + "Level 1 clear ·
   Nice and steady" (14 px, `--stage-chip-muted`);
2. the track (nodes only; this level current) and under it "Level 2 of 4" (14 medium, muted);
3. the level pictogram, 48 px, `--stage-chip-text`;
4. the level name, Spectral 600, 28 px: "Pop the dots", "Follow the firefly", "Turn your head",
   "Test round";
5. the rule, 16 px `--stage-chip-text`, at most 2 lines;
6. a hint, 14 px muted (phone and webcam variants, §7);
7. the countdown row: a 40 px ring with the seconds left in mono 16 (3, 2, 1), and a ghost button
   **"Start now"**. The card starts the level by itself after 3 s; a tap anywhere, Space or "Start
   now" starts it at once. The ring is static under reduced motion; the digit still counts.
8. a Sound toggle, a 44 px icon button in the card's top-right corner (`aria-pressed`; default on,
   low volume).

Card width: 328 px max on phones (fits 360 px), 400 px on desktop; padding 24 (32 on desktop).

**The steadiness line** (honest feedback after each level). From the frame-acceptance log of that
level (no gaze involved):

| Condition (heuristic) | Line |
|---|---|
| accepted frames ≥ 80 % and no retried bubble | Nice and steady |
| most rejections were `motion` or `pose` | Try to keep your head still |
| most rejections were `no-face` or `small-face` | Try to stay in view |
| otherwise | Nice work |

**Stimulus HUD** during a level:

- **Pip line** on the camera edge (top in portrait and on desktop; the camera side in phone
  landscape), 12 px in from the edge, inside the side gutters: one 4 px pip per bubble (radius 2,
  4 px gaps on phones, 6 px on desktop). Done pips `--pip-on` (black, 5.3:1 on the grey); pips to go
  `--pip-off`. Level 2 has one continuous bar instead of pips. A retried bubble adds a pip at the end.
  `role="progressbar"`, `aria-label="Level 1 progress"`, value = bubbles done.
- **Corner cluster** in the corner farthest from the camera: the position glyph (§3.7) and Pause
  (44 px dark chip). It fades out while a bubble or the firefly is within 96 px of it. P pauses on
  desktop; Space continues from a card.
- Nothing else. No points, no text, no level name.

**The warm-up bubble** (Levels 1 and 4, and Re-aim):

- **Core**: the spec's ABC target at the bubble's centre, 0.6° (minimum 14 px; 24 px when the
  geometry is unknown) [spec §4.7]. The player is told to look at "the dot".
- **Bubble**: a disc in `--bubble-fill` with a 2 px `--bubble-edge` outline and a short
  `--bubble-shine` arc at its upper left; a dashed `--bubble-ghost` ring stays at the full size as
  the reference. Full diameter 3° from the assumed geometry, clamped to [64 px, 20 % of the window's
  short side] so that edge targets (`CAL13` at 0.08) are never cut off: 78 px on a 390 px phone, about
  120 px on a typical desktop.
- **Timeline per bubble**: onset → the bubble scales in from 0.6× to full size over 150 ms (inside
  the settle window) → static at full size until the 600 ms settle ends → **shrinks linearly to the
  core's size over the 1000 ms sample** → if sampling is extended (fewer than 12 accepted frames,
  up to 2500 ms) it holds at the core's size → **pops**: six short black strokes burst outwards over
  150 ms and the ring vanishes, with a soft pop sound and a 15 ms haptic where on → next onset. The
  pop lies outside the sampling window. Replaces the spec's 400 ms ring at the start of settle
  (amendment §9.2).
- **Retries** follow the spec: a bubble with too few accepted frames comes back once at the end of
  its level, with the bubble re-grown [spec §4.7].
- **Reduced motion**: the bubble is static at full size, no scale-in, no shrink, no burst; it simply
  disappears when its window ends.

**Pausing**: manual Pause opens a dark card "Paused" (Sound toggle, "Exit" ghost, "Carry on"
primary). Auto-pause is the position guard's overlay (§3.8). After a pause the interrupted bubble is
shown again with its full settle window. Three pauses in one level open the card "Let's fix the
set-up first" with the primary "Get ready again".

### 2.7 Level 1: Pop the dots

| | |
|---|---|
| Protocol | block A, `CAL13`: {0.08, 0.5, 0.92}² ∪ {0.29, 0.71}² of the safe rectangle, seeded order [spec §4.7] |
| Rule (card) | "Keep your eyes on the dot until the bubble pops." |
| Hint | phone: "Keep your head and the phone still." · webcam: "Keep your head still." |
| Pictogram | a bubble with its dot and shine |
| On screen | one warm-up bubble at a time; pip line of 13 |
| Interactive? | no: every bubble pops on its timer |
| Time | ≈ 23 s |

### 2.8 Level 2: Follow the firefly

| | |
|---|---|
| Protocol | block B: 1000 ms hold at the start point, then one 16 s 2:3 Lissajous period, `x = 0.5 + 0.42·sin(2π·2t/T)`, `y = 0.5 + 0.42·sin(2π·3t/T + π/2)`, T lengthened if the peak speed would exceed 15°/s [spec §4.7] |
| Rule | "Follow the firefly with your eyes." |
| Hint | phone: "Keep your head and the phone still." · webcam: "Keep your head still." |
| Pictogram | a firefly at the end of a dotted curve |
| Firefly | the ABC core (24 px) on a 44 px disc of `--firefly-light`; a trail of the last 300 ms, 3 px, round caps, in `--firefly-trail` fading to nothing (drawn as three segments at 40 %, 25 % and 12 % opacity) |
| On screen | the firefly and its trail; a continuous progress bar on the camera edge |
| Interactive? | no |
| Reduced motion | the card offers a secondary "Skip this level" (spec §7 lets pursuit be skipped) |
| Time | ≈ 17 s |

The trail is short and faint on purpose: a long or bright trail would pull the eyes backwards and
cause catch-up saccades [flow §6.1, Pfeuffer et al.]. No path ahead is ever drawn.

### 2.9 Level 3: Turn your head

| | |
|---|---|
| Protocol | block C, `HEAD5`: (0.5, 0.5), (0.29, 0.29), (0.71, 0.29), (0.29, 0.71), (0.71, 0.71); 600 ms settle, 2000 ms turning (about ±10° yaw), 2000 ms nodding (about ±7° pitch), extended up to 6000 ms until 3 of 4 sectors are reached [spec §4.7] |
| Rule | "Keep your eyes on the dot and slowly turn your head." |
| Hint | phone: "Keep the phone still. Fill the arcs." · webcam: "Fill the arcs around the bubble." |
| Pictogram | a dot inside four arcs |
| Bubble | static warm-up bubble, 64 px on phones, 80 px on desktop (no shrink) |
| Arcs | the spec's pose guide: four 60° arcs (left, right, up, down) at radius = bubble radius + 22 px. Each arc's track is dashed 4/4 in `--arc-off` (3.2:1); its fill grows symmetrically from the arc's midpoint in solid `--arc-on`, in proportion to the largest head turn reached towards that side (target ±10° yaw, ±7° pitch; half with "Limited head movement"). A full arc is reached. The arc the head is currently turning towards is drawn 6 px instead of 4 px. |
| Caption chip | under the arcs, a dark pill (14 px): "Slowly turn your head", then "Now nod slowly" |
| Pop | when the location ends (3 of 4 arcs full, or 6 s) |
| Interactive? | **yes, by head pose**: the arcs respond to the measured head turn. This is the one warm-up level that reacts to the player, and it reacts to the head, not to gaze. |
| On screen | pip line of 5 |
| Time | ≈ 23–30 s |

The spec's moving pose dot is not drawn: a moving mark next to the fixation point would pull the
eyes. The arc fills carry the current pose instead (amendment §9.3).

### 2.10 Level 4: Test round

| | |
|---|---|
| Protocol | validation `VAL12`: x ∈ {0.15, 0.38, 0.62, 0.85} × y ∈ {0.15, 0.5, 0.85}, jittered ±0.02, settle 600 ms, sample 1000 ms [spec §4.7] |
| Rule | "Same as level 1. This round checks your aim." |
| Hint | as Level 1 |
| Pictogram | a bubble with a small check |
| On screen | warm-up bubbles exactly as Level 1; pip line of 12; no feedback per bubble (it would bias the test) |
| Time | ≈ 21 s |

Then **Checking your aim…**: a dark chip card centred on the grey, "Checking your aim…" (20 px
medium) over a 4 px progress bar fed by the fit progress, ≤ 3 s (`FIT_BUDGET_MS` allows more on slow
devices; after 3 s the line "Almost there" appears).

### 2.11 Warm-up length as level sets (Details → Settings)

| Length | Levels (track nodes) | Protocol | Time | Title meta |
|---|---|---|---|---|
| Quick | 1 Pop the dots · 2 Test round | `CAL9`; `VAL6` | ≈ 35 s | About 2 minutes |
| **Standard** (default) | 1 Pop the dots · 2 Follow the firefly · 3 Turn your head · 4 Test round | `CAL13`, pursuit, `HEAD5`; `VAL12` | ≈ 100 s | About 3 minutes |
| Thorough | 1 Pop · 2 Follow · 3 Turn · 4 **Lean in** · 5 Test round | Standard, then `CAL13` again after leaning in; `VAL12` | ≈ 3 min | About 4 minutes |

"Lean in" (rule: "Lean in by about a hand's width, then pop the dots again.") re-latches *home* at
its start, because its purpose is a new distance [spec §4.7 `thorough`]. Level numbers follow the
set ("Level 2 of 2" for the Quick test round).

### 2.12 Warm-up complete (the level-complete screen)

Framed, dark, still in fullscreen. It turns the validation result into a game result.

**What is computed** (all from the Test round and the fit; nothing new):

- **Zones** {cols × rows}: the adaptive grid, each axis chosen separately with the existing
  half-cell rule (half-cell ≥ p75 accuracy + 2 × RMS-S2S) [flow §2.2]. n = cols × rows. Typical: phone
  portrait 1 × 2 or 1 × 3; phone landscape 2 × 1 or 3 × 1; laptop 2 × 1 to 3 × 2. The zones are the
  challenge board.
- **Stars** from the spec's verdict [spec Appendix A `VERDICT`, heuristic]: good → 3, acceptable → 2,
  poor → 1, not tracking or n < 2 → 0.
- **Marks**: each of the 12 Test-round bubbles is ✓ when its gaze estimate landed in the bubble's
  zone, ✗ otherwise.
- **Cause** (one), from the frame log, in this order: face often lost → backlit → too dark → much
  head movement → glare → too far.

**Layout** (phone, top to bottom): top bar (label "Warm-up complete", track with all levels done and
the star unlocked, Details); stage card with a miniature of the screen split into the zones and the
12 marks, plus a legend (✓ Hit · ✗ Missed); panel with the stars row (and the **Example** badge on
boards), the headline, one sentence, one tip and "Rule of thumb · How we judge this"; actions.
Desktop: the miniature in the stage card at the left, the panel and actions as one group in the side
column.

**Outcomes**

| Outcome | Condition | Stars | Star node | Headline | Sentence | Tip | Primary | Secondary |
|---|---|---|---|---|---|---|---|---|
| Great | verdict good, n ≥ 2 | ★★★ | unlocked | You unlocked {n} zones | The challenge will use these {n} zones. | Your set-up works well. | **Try your zones** | Warm up again |
| Good | verdict acceptable, n ≥ 2 | ★★☆ | unlocked | You unlocked {n} zones | The challenge will use these {n} zones. | the cause, e.g. "More light in front of you may help." | **Try your zones** | Warm up again |
| Rough | verdict poor, n ≥ 2 | ★☆☆ | unlocked | You unlocked {n} zones | n = 2: "Only left and right for now." / "Only top and bottom for now."; else "Warming up again may unlock more." | the cause, e.g. "The light was behind you. Face the light." | **Warm up again** | Play anyway |
| Didn't work | not tracking, or n < 2 | ☆☆☆ | locked | Warm-up didn't work | We often lost your face. | e.g. "Prop the phone up and add light in front of you." | **Get ready again** | — |

Routes: "Try your zones" → Free look; "Warm up again" → the Level 1 card (fullscreen kept; *home*
kept); "Get ready again" → Get ready (fullscreen left); "Play anyway" → the first round card.
"Rule of thumb · How we judge this" opens Details → Results.

**Arrival**: the zones light up one after another (120 ms each), then the stars fill (150 ms each),
then the actions fade in (200 ms). With reduced motion everything appears at once. No sound beyond
one soft chime (if Sound is on).

### 2.13 Free look

Immersive, grey, straight after "Try your zones". The sandbox: the player sees what their eyes can
now control before being scored.

- **Stage**: the zones of the result as faint rounded outlines (1.5 px `--stage-line`). The zone the
  gaze falls in is lit (`--stage-lit` fill, 2 px black outline at 60 %): snap-to-zone. A **soft
  disc** in `--gaze-soft` with a 1.5 px black edge sits at the filtered gaze point; its radius is the
  player's p68 validation error; it fades with face confidence, and greys out with a dashed outline
  outside the calibrated head range.
- **Top bar**: phase label "Free look", the track (levels done, star unlocked), Details; on desktop
  also the position glyph.
- **Dock**: the live dot (gold, `ek-live`) and "Tracking", with the position glyph at the right end
  of that row on phones; one sentence, "The zone you look at lights up."; secondary **"Re-aim"**
  (crosshair icon) and primary **"Play the challenge"**.
- Bar and dock fade out after 3 s without input and come back on a tap, a mouse move or a key; on
  phones the glyph then stays alone at the bottom right.
- After 5 minutes since the warm-up, or after more than 10 s in the auto-pause overlay, a card
  offers Re-aim (§2.15).
- Expert extras (raw dot, per-engine dots, trail, record and markers, estimator switch) are in
  Details and Expert mode only.

### 2.14 The challenge

"Pop!" is the reward the warm-up unlocks and the first part of the game in which the player's eyes
really control something. The screens are specified here; the mechanics, parameters and scoring
are in §5.

**Three rounds of 16 bubbles**, all played on the player's zones from Warm-up complete:

| Round | Name | What is new | Dwell (§5.3) | Pictogram |
|---|---|---|---|---|
| 1 | Pop! | plain bubbles | 1000 ms | a bubble with its dot |
| 2 | Mind the spikes | a spiky decoy in another zone; looking at it for 600 ms makes it "bonk" (−50) | 800 ms | a spiky ball |
| 3 | Drifters | the bubble drifts within its zone at ≤ 3°/s | 700 ms | a bubble with a short arrow |

**Round card** (stimulus mode, the level-card form of §2.6, `role="dialog"`):

1. the track (nodes only; all levels done, star current) and "Round 1 of 3" (14 medium, muted);
2. the pictogram, 48 px;
3. the round name, Spectral 600, 28 px;
4. the rule, 16 px: round 1 **"Now your eyes do the popping."** (the first time the copy may say so);
   round 2 "Pop the bubbles, not the spikes."; round 3 "The bubbles drift. Follow them with your
   eyes.";
5. the hint, 14 px muted: round 1 "Look at a bubble until it pops. No tapping needed."; round 2
   "Looking at a spike costs points."; round 3 "Same rule: look until it pops.";
6. the meta line "16 bubbles · about 1 minute" (14, muted);
7. the countdown row (40 px ring, mono digit, ghost "Start now") and the Sound toggle in the
   top-right corner, exactly as on a level card. The round starts by itself after 3 s.

**In play** (stimulus, grey, fullscreen kept):

- **Board**: the zones as faint rounded outlines (§5.4); the zone the gaze falls in is lit
  (snap-to-zone, as in Free look). There is no gaze dot (§5.2).
- **Bubble**: one at a time, the warm-up bubble's drawing (§6.1) at the challenge size. It shrinks
  only while the lit zone is the bubble's zone, under the leaky dwell of §5.2, and pops when the
  dwell is full. This is the one place where the copy says the eyes pop it, because they do.
- **HUD** (the challenge adds one element to the stimulus HUD of §2.6):
  - the **pip line** of 16 on the camera edge (done = popped or missed);
  - the **score chip** at the camera end of the camera edge (top-left in portrait and on desktop;
    the top of the camera side in phone landscape): a 40 px dark pill with the score in mono 20
    medium and, after 4 pops in a row, a streak tag "×1.5" (14 medium, `--stage-chip-raise` pill).
    A decoy bonk shows "−50" in the chip for 600 ms; the score counts up over 200 ms after a pop;
  - the **corner cluster** (position glyph and Pause) in the corner farthest from the camera, with
    the 2–3 word nudge beside the glyph when drifting (§3.7).
  Chips fade out while a bubble or decoy is within 96 px of them.
- **A miss**: after 4 s the bubble drifts up 24 px and fades, without penalty; its pip still counts.
- **Pausing**: manual Pause and the auto-pause overlay freeze the round; the bubble's lifetime and
  dwell are held. The Re-aim offer card (§2.15) appears between bubbles when the hit rate falls
  below 50 % over the last 6 bubbles.

**Round complete** (framed, dark, inside fullscreen):

- **Top bar**: phone: phase label "Challenge", the track (levels done, star current), Details;
  desktop: wordmark, the labelled track (star current, so no phase label), Details.
- **Stage card**: the round's zone map, a miniature of the screen split into the zones, each
  zone carrying its pops ("5 of 5", mono 14) and a mark: ✓ (≥ 80 % popped), ~ (50–79 %), ✗ (< 50 %),
  thresholds heuristic; and a **Replay** icon button (play icon, `aria-label="Replay where you
  looked"`) in the card's top-right corner, which plays the smoothed gaze trail over the map for 6 s.
- **Panel**: eyebrow "Round 1 of 3" (14 medium, muted; "Challenge complete" after round 3), the
  stars row (§5.5) with the **Example** badge on boards, the headline "14 of 16 popped" (Spectral
  600), one sentence, and the score line in mono 14 muted: "Score 1 820 · Best 1 820".
- **Sentence**, one of: the hardest zone ("The right zone was the hardest."), "Every zone worked
  well." when all zones show ✓, "We corrected a small shift." after an offset correction (§5.6), or
  the remedy line of the "went badly" row below.
- **Actions**:

| Outcome | Condition | Primary | Secondary |
|---|---|---|---|
| Went well, rounds 1–2 | hit rate ≥ 50 % and fewer than 2 zones ✗ | **Next round** | Free look |
| Went well, round 3 | as above | **Play again** | Free look |
| Went badly | hit rate < 50 % or ≥ 2 zones ✗; sentence "Your aim drifted. Re-aim with two bubbles." | **Re-aim** | Play again |

Routes: "Next round" → the next round card; "Play again" → the round 1 card; "Re-aim" → Re-aim, then
the same round's card again; "Free look" → Free look (back-arrow icon). The best score per zone set
is kept on the device (Details → Data). Arrival as Warm-up complete: zones, then stars, then
actions; one soft chime when Sound is on.

### 2.15 Re-aim and Quick warm-up

**Re-aim** is the spec's drift check [spec §4.13] presented as a two-bubble mini-level.

- **Offered**: in Free look (secondary action, always); in a round, between bubbles, when the hit
  rate is below 50 % over the last 6 bubbles (offer card); after more than 10 s in the auto-pause
  overlay; 5 minutes after the warm-up; on Round complete when the round went badly (primary).
- **Offer card**: "Aim drifting?" (20 medium) · "Re-aim with two bubbles. About 5 seconds." · secondary
  "Keep playing", primary **"Re-aim"**.
- **Play**: no level card. Two warm-up bubbles (the centre and one seeded `VAL12` location; settle
  500 ms, sample 1000 ms each), popping on their timers; a two-pip line.
- **Outcomes**:
  - offset ≤ max(2°, 1.5 × validation accuracy): the correction is applied; a 1.5 s chip "Aim fixed"
    and play resumes where it was;
  - offset tiny (< 0.5°, heuristic): "Your aim was fine" chip, no correction;
  - otherwise: card "Your aim moved a lot" · "A quick warm-up will fix it. About 20 seconds." ·
    secondary "Keep playing", primary **"Quick warm-up"**.
- **Quick warm-up** = the spec's quick recalibration: `RECAL5` with the fixation rules, refit, then
  `VAL6` [spec §4.13], shown as two levels ("Pop the dots", 5 bubbles; "Test round", 6 bubbles) and
  ending on Warm-up complete with the new zones; its primary is then "Back to the challenge".

### 2.16 Failure handling

| Situation | Where | What the player sees | Route |
|---|---|---|---|
| Browser cannot run the tracker | Title | in the Play slot: "This browser cannot run the game. Try Chrome, Edge or Safari 17 or later." No primary action. | stays |
| Camera refused | after Play | Title shows "Camera blocked" · "Allow the camera in your browser settings, then try again." · primary "Try again" | Title |
| No frames for 2 s / black frame | Get ready | cue "Allow the camera to start" / "Uncover the camera" | stays |
| No face | Get ready | "Point the camera at your face" (phone), "Sit facing the camera" (webcam). "Start anyway" never appears without a face. | stays |
| Cannot reach the bands | Get ready | after 20 s, "Start anyway" (secondary) with "You may unlock fewer zones" | → Level 1 card |
| Slow device (< 15 frames per second) | Get ready | one info chip under the cue: "This device is slow. Close other apps." Not a blocker. | stays |
| Out of range > 0.5 s or face lost > 0.4 s | any level | auto-pause overlay (§3.8); the bubble is redone after resuming | resumes |
| Three pauses in one level | any level | card "Let's fix the set-up first" · primary "Get ready again" | → Get ready |
| Fullscreen left, window resized, orientation changed | any warm-up level, Free look, rounds | card "The screen changed" · "Warm up again to keep playing." · primary "Warm up again" (rotation: "Turn the phone back, or warm up again") | → Level 1 card |
| Poor or failed warm-up | Warm-up complete | the Rough and Didn't work rows of §2.12 | as listed |
| Drifting position | Free look, rounds | amber glyph plus a 2–3 word nudge beside it | stays |
| Out of range > 1 s or face lost > 0.7 s | Free look, rounds | auto-pause overlay; the round freezes, the bubble's timer and dwell are held | resumes |
| Stuck in the overlay > 10 s | any | the overlay adds a secondary: "Get ready again" (warm-up) or "Warm up again" (Free look, rounds) | as named |
| Hit rate < 50 % over 6 bubbles | rounds | Re-aim offer card (§2.15) | Re-aim |
| Re-aim finds a large shift | Re-aim | "Your aim moved a lot" · "Quick warm-up" | Quick warm-up |
| Fewer than 2 zones | Warm-up complete | the challenge stays locked (star node locked) | Get ready |
| Stimulus short side < 280 px | Get ready | "Make the window larger to play" in the action slot | stays |

### 2.17 Where expert features live: the Details sheet

Unchanged from v1 apart from names.

**Trigger**: the Details button at the right end of every top bar (icon "⋯"; on desktop icon plus
the word "Details"), and in the manual pause card. Also `#/details/<tab>` for researchers. Not
reachable during a running level except through Pause.

**Form** (`<dialog>`, modal, focus trapped, Esc and Android Back close it, focus returns to the
trigger):

- **Bottom sheet** when the window is < 600 px wide and ≥ 480 px tall: grip handle (36 × 4 px,
  `--color-border`), `--radius-card` sides rising to `--radius-sheet` top corners, scrim
  `rgba(0,0,0,.55)`, soft elevation shadow, `max-block-size: 85svh`, bottom padding
  `max(16px, env(safe-area-inset-bottom))`. Opens in 220 ms ease-out; the scrim fades in over 160 ms.
- **Side sheet** otherwise: `inline-size: clamp(320px, 30vw, 420px)`, full height, from the right on
  desktop and from the edge opposite the camera on a phone in landscape; `--radius-sheet` on the two
  inner corners.
- **Header row**: "Details" (20 px medium) left, **Done** (primary) right. The screen's own primary
  is under the scrim, so only one gold action is visible.
- **Tabs**: **Results · Settings · Data · Device · About** as a pill segmented control.
- **Pagination, never scrolling**: one card per page, ‹ › buttons (44 px) and "2 of 5" (mono 14,
  faint) in the footer.
- **Footer** on every tab: "Delete all my data" (ghost, error-coloured text, bin icon) with a confirm
  dialog; version line in faint 14 px.

| Tab | Pages |
|---|---|
| Results | one card per estimator (Combined, then each engine) from the last Test round: accuracy in px and % of the screen first, ≈ degrees second (spec §14.1.4), precision, data loss, rate, verdict word + glyph, "Use this" switch · the target plot · How we judge this (the stars and zones mapping, thresholds marked heuristic, with sources) · challenge statistics per zone (hit rate, time to pop, offset) |
| Settings | Warm-up length (Quick ≈ 35 s / **Standard ≈ 100 s** / Thorough ≈ 3 min) · Engines (Auto recommended / choose) · Glasses (none / glasses / contacts / prefer not to say) · Sound (on by default) · Read instructions aloud · Limited head movement · Theme (Dark / Light; the grey stage is unaffected) · Camera (only with ≥ 2 cameras) · Expert mode (raw dot, per-engine dots, trail, record and markers) |
| Data | Export (zip, with the per-frame features option; challenge rows as `phase: 'game'`) · Saved on this device (warm-ups, sessions, best scores) · Participant and session IDs |
| Device | live readings, one mono strip per line: distance ≈ cm (estimated unless measured), face size, eye size, head angles, phone tilt, light, glare, frame rate · Measure screen and distance (card match and blind-spot test, for results in true degrees) · capability list and engine timings · "Open diagnostics" (the Lab page) |
| About | three sentences on what the game does · privacy ("Everything runs on this device. Nothing is uploaded and no images are stored.") · the expectation line with its sources · link "Methods (long read)" to a separate document page, which may scroll because it is a document |

---

## 3. The positioning system (the position guard)

v1's positioning system, unchanged in its signals, thresholds and priority order. In the game it is
the **position guard**: the full guide on Get ready (the ready check), then the compact glyph and the
auto-pause overlay in every level, in Free look, in the challenge and in Re-aim.

### 3.1 Signals

| Signal | Source | Smoothing | Used for |
|---|---|---|---|
| Camera delivering, frame not black | track state; frame luma (32 × 18) | 500 ms median | blockers |
| Face found, face count | landmarker (`numFaces: 2`, to detect a second face) | 300 ms debounce | no face, several faces |
| Face scale | inter-ocular distance (landmarks 33/263) ÷ cos(yaw), cross-checked with iris diameter, **divided by the long side of the frame** | 500 ms median | distance |
| Iris diameter (px) | landmarks 469–476 | 500 ms median | resolution floor; ≈ cm in Details |
| Face box margins | landmark box to each edge of the *visible* region | — | face cut off |
| Centring dx, dy | face centre − frame centre, in fractions of each side | 500 ms median | off-centre |
| Head yaw, pitch, roll | transformation matrix | 300 ms median | facing |
| Face luma, backlight ratio, glare | existing `faceQuality()` | 1 s mean | light |
| Eyes open | blendshapes / EAR, blink hold | ignores closures < 1.5 s | eyes hidden |
| Head angular speed | Δpose / Δt | 300 ms | hold still |
| Phone upright angle θ, in-plane roll | `devicemotion` gravity: θ = acos(\|g_z\|/\|g\|); roll = atan2(g_x, g_y) rotated by `screen.orientation.angle` | 300 ms low-pass | phone too flat, phone rotated, phone moved |
| Phone rotation rate | `devicemotion.rotationRate` | 300 ms | phone not steady; hand-held detection |
| Frame rate | rVFC timestamps | 2 s | device message only |

Gravity, not DeviceOrientation β, because β hits gimbal lock at exactly upright [pos §2.1].

### 3.2 Target ranges per device class (all heuristic; calibrate on real devices)

Device class: phone/tablet = spec §14.2.1 `mobile`; portrait vs landscape by the aspect ratio of
the window (< 5/4 portrait); otherwise webcam. The Title's set-up chooser (§2.4) can override the
class: **In hand** uses the phone row with the steadiness cue relaxed (phone > 30°/s instead of
20°/s) and adds the tip "Hold the phone at eye level".

| Quantity | Phone, portrait | Phone, landscape | Webcam (laptop, desktop) |
|---|---|---|---|
| Advised distance (Details → About and Device only) | 30–40 cm | 40–50 cm | about an arm's length (50–70 cm) |
| Face width ÷ frame **long** side: target / accepted | 0.33 / 0.28–0.42 | 0.28 / 0.24–0.33 | 0.21 / 0.16–0.30 |
| Iris diameter floor ("Move a little closer" below it) | 16 px | 14 px | 10 px (12 px is comfortable) |
| Face box margin to the visible edge | ≥ 10 % sideways, ≥ 8 % top/bottom | ≥ 8 % | ≥ 6 % |
| Centring tolerance \|dx\|, \|dy\| | 0.10, 0.12 | 0.12, 0.10 | 0.12, 0.15 |
| Expected pose when looking at the window centre | pitch +12° (down) | yaw ±11° towards the camera side, pitch 0° | pitch +12° (down) |
| Yaw / pitch / roll window around that centre | ±12° / −10° … +12° / ±10° | ±12° / ±12° / ±10° | ±12° / −10° … +12° / ±10° |
| Phone upright angle θ (0 flat, 90 vertical) | 60–100°; cue below 55° or above 105° | same | — |
| Phone in-plane roll | ±10° | ±10° | — |
| Face luma / backlight / glare | 60–200 / ≥ 0.8 / ≤ 2 % | same | same |
| "Hold still" cue | head > 30°/s for 300 ms, or phone > 20°/s for 300 ms | same | head > 30°/s for 300 ms |

Tablets use the phone-landscape row with distance 40–55 cm and face 0.27 (0.22–0.33). Frame rate
is not a positioning cue; below 15 Hz a one-off device message appears.

**Hysteresis** (enter / exit): too far < 0.80 / > 0.88 of target scale; too close > 1.25 / < 1.15;
centring > 0.12 / < 0.08 (scaled per class); pose 15° / 10° off the window centre; luma < 60 / > 70.

**Timing**: a new cue must persist 300 ms before it shows (blockers show at once); a shown cue stays
at least 1 s; "all clear" must hold 2 s (`SETUP.holdMs`) before *Ready*.

### 3.3 Before and after the warm-up: absolute, then "home"

- **Get ready**: the absolute ranges of §3.2.
- **Home**: the median of face centre, face scale, yaw, pitch, roll, phone θ and roll over the 2 s
  hold, stored when *Ready* latches (and again at the start of "Lean in", §2.11).
- **During the warm-up levels**: tolerances around home: scale ±20 %, centre ±0.10, yaw and pitch
  ±15° (angles not checked during Level 3), θ ±8°.
- **After the fit (Free look, the challenge, Re-aim)**: the calibrated head range of spec §4.10 (yaw
  and pitch P2.5–P97.5 ± 4°, ln distance ratio ± 0.10, eye midpoint ± 0.05), plus phone θ and roll
  within ±6° of home.
- **Two grades after Get ready**: *drifting* = beyond 70 % of a margin (amber glyph; a nudge in Free
  look and the challenge only); *out* = beyond the range for > 0.5 s (warm-up levels, Re-aim) or more
  than 1 s (Free look, challenge) → auto-pause. Face lost: pause after 0.4 s in the warm-up and Re-aim
  (spec), 0.7 s in Free look and the challenge.

### 3.4 Priority order and the single-instruction rule

Show only the highest-ranked active condition. Blockers first; then geometry from coarse to fine
(each fix changes the later measurements); then light; then eyes; steadiness last.

| Rank | Condition | Phone headline | Webcam headline | Tip (after 4 s, faint 14 px) | Status item |
|---|---|---|---|---|---|
| 0 | Loading the face model | Getting ready… 62 % | same | First time only | — |
| 1 | Camera not delivering | Allow the camera to start | same | Nothing leaves this device | — |
| 2 | Frame black | Uncover the camera | same | — | — |
| 3 | Too dark to find a face | Too dark. Add some light | same | Face a window or a lamp | Light |
| 4 | No face | Point the camera at your face | Sit facing the camera | — | Position |
| 5 | Several faces | Only one face, please | same | — | Position |
| 6 | Face cut off | Move into the oval | same | — | Position |
| 7 | Too far, or iris below floor | Move a little closer | same | Fill the oval with your face | Distance |
| 8 | Too close | Move back a little | same | — | Distance |
| 9 | Phone too flat / leaning in (sensor) | Stand the phone more upright / Tilt the phone back slightly | — | Prop it on books or a mug | Position |
| 10 | Face high in frame | Raise the phone to eye level | Tilt the screen back a little | Prop it on books or a mug / Or sit up a little | Position |
| 10 | Face low in frame | Lower the phone slightly | Tilt the screen towards you | — | Position |
| 11 | Off-centre sideways | Centre your face in the oval | same | — | Position |
| 12 | Phone rotated in its plane (sensor) | Hold the phone straight | — | — | Position |
| 13 | Head turned | Turn to face the screen | same | — | Position |
| 14 | Chin up / down | Lower your chin a little / Raise your chin a little | same | — | Position |
| 15 | Head tilted | Keep your head level | same | — | Position |
| 16 | Face dark | Add light in front of you | same | Light from behind the screen is best | Light |
| 17 | Backlit | Avoid bright light behind you | same | Close the blind or turn round | Light |
| 18 | Face too bright | Soften the light on your face | same | — | Light |
| 19 | Glare on glasses | Tilt your glasses down slightly | same | Or move the lamp | Light |
| 20 | Eyes hidden / closed > 1.5 s | Make sure we can see your eyes / Keep your eyes open | same | Move hair or a cap away | Position |
| 21 | Moving | Hold the phone steady | Hold still for a moment | Resting it works best (phone) | Position |
| — | All clear, holding | Perfect, hold still | same | — | all ✓ |
| — | Ready | Ready | same | Stay like this while you play | all ✓ |
| — | 20 s without Ready (face present) | (action slot) Start anyway | same | (line above the button) You may unlock fewer zones | — |
| — | Hand-held detected (once, Propped only) | — | — | Prop it on books or a mug | — |

Rules: if distance and centring are both off, distance first (the oval is the target). The status
row summarises ranks 3–21 in three groups (Distance, Position, Light), each ✓ or !, so the player
sees what is already right without a second instruction.

### 3.5 Visual language on Get ready

All drawn in one SVG over a mirrored, cover-fitted `<video>`:

1. **Grey veil**: `--stage-veil` (`#808080` at 86 %) everywhere outside the target oval. It keeps
   the screen at the warm-up luminance and makes the oval the only "window".
2. **Target oval**: aspect 1 : 1.3; width = target face fraction (§3.2) × displayed frame long
   side; centred on the frame centre, raised by 3 % of the frame height. The oval *is* the distance
   cue: "fill the oval". At 390×844 (3:4 camera, cover-fitted): centre (195, 397), radii 139 × 181.
   At 1440×900 (16:9 webcam, cover-fitted): centre (720, 423), radii 168 × 218.
3. **Live face outline**: an ellipse fitted to the face-oval landmarks, 2 px `--color-text`.
4. **Eye dots**: two 12 px discs in `--gaze` with a 1.5 px black edge, at the iris centres. Steady
   dots mean "we can see your eyes".
5. **One directional cue at a time**, in the state colour:
   - distance: four chevrons between outline and oval, pointing outward (closer) or inward (back);
   - centring: one chevron from the face towards the oval centre;
   - phone tilt and height: a 24 px pictogram of the phone (side view with a curved arrow, or with
     an up/down arrow) in a dark chip beside the instruction.
6. **Every stroke has a halo**: the same path drawn first in `--halo` (black 60 %) 3 px wider, so
   it stays ≥ 3:1 on any video and on the grey (WCAG 1.4.11).

**Oval states**

| State | Oval stroke | Glyph | Words |
|---|---|---|---|
| Searching (no face) | `--color-text` at 50 %, 2 px, dashed 8/6 | — | the headline |
| Adjust | `--state-adjust`, 3 px, solid | the directional cue | the headline |
| Holding | `--state-good`, 3 px, solid; a 5 px ring traces the oval clockwise over 2 s, restarting on a break | — | Perfect, hold still |
| Ready | `--state-good`, 3 px, solid, ring complete | ✓ badge (24 px) at the top of the oval | Ready · Stay like this while you play |

Mirroring is kept: moving the head and moving the image go the same way. **No auto-pan or zoom**:
the true frame is shown so that an off-centre or distant face looks off-centre or small. If the
oval would not fit the clear band between the cue and the dock, the displayed preview is scaled
down (contain rather than cover, veil filling the rest), which keeps the oval and outline in the
right proportion. At least 70 % of each frame dimension stays visible.

### 3.6 The cue card and the status row

- **Cue**: a dark chip card (`--stage-chip`, radius 14, padding 12 × 20, centred, max 320 px wide)
  near the camera edge: 8 px below the top bar in portrait and on desktop; at the top of the
  camera-side column on a phone in landscape. Headline 20 px medium, tip 14 px `--stage-chip-muted`.
  `role="status"`, `aria-live="polite"`, holding the headline only. Reading near the camera keeps
  the pose frontal.
- **Status row**: three items in the dock: Distance, Position, Light. Each is a 16 px badge (✓ in
  `--state-good`, ! in `--state-adjust`) plus the word, with no pill or background, so it reads as
  status rather than as buttons; `aria-label` "Distance: adjust" or "Distance: good". No numbers.

### 3.7 The compact position glyph (levels, Free look, challenge, Re-aim)

- **Glyph**: a 40 px circular dark chip containing a face oval (16 × 21 px, 1.5 px stroke) and two
  3 px eye dots in `--gaze`, plus a 14 px status badge at its lower right. The eye dots are drawn
  relative to *home*, with offsets amplified × 3 and spacing scaled by distance, so drift is
  visible at a glance. It is a symbol, not a video thumbnail (a self-view pulls the eyes).
- **States**:

| State | Oval stroke | Eye dots | Badge | Opacity |
|---|---|---|---|---|
| Good | `--stage-chip-muted`, solid | centred | ✓ `--state-good` | 0.6, static |
| Drifting | `--state-adjust`, solid | displaced in the direction of the drift (closer together = too far) | ! `--state-adjust` | 1 |
| Lost | `--state-lost`, dashed 3/3 (a broken oval) | none | ✗ `--state-lost` | 1 |

- **Placement** (v2): in the **corner cluster** (glyph and Pause, 8 px apart) in the corner farthest
  from the camera during the warm-up levels, the challenge rounds and Re-aim; in **Free look** at the
  right end of the dock's "Tracking" row on phones, and in the top bar left of Details on desktop.
  On level and round cards it sits alone in the corner-cluster position.
- **Nudge** (Free look and challenge only, never in a warm-up level or Re-aim): a dark pill beside
  the glyph with an amber "!" and 2–3 words: "A little closer" · "Back a little" · "Re-centre" ·
  "Face the screen" · "Phone moved" · "More light" · "Hold still". During the warm-up the glyph turns
  amber silently, because words would pull the eyes off the bubble.
- `aria-label`: "Position good" / "Position: move a little closer" / "Paused: move back into view".

### 3.8 Auto-pause overlay

- Triggered by *out* or *face lost* (§3.3). The stimulus freezes (in a round, the bubble's lifetime
  and dwell are held); a `--stage-scrim` covers it.
- A dark card (`--stage-chip`, radius 14, padding 16) near the camera edge (top-centre in portrait
  and on desktop; camera side on a phone in landscape), 320 px wide on phones, 400 px on desktop:
  - the eyebrow **"Paused"** (14 medium, `--stage-chip-muted`);
  - a small mirrored live preview (phone 3:4, 180 × 240; desktop 16:10, 368 × 230) with the **ghost
    outline of home** (dashed 2 px `--color-text` at 70 %) and the live outline and eye dots;
  - one headline (20 medium), chosen by the same priority order but relative to home: **"Move back
    into view"** (the default), "Move a little closer", "Move back a little", "Turn to face the
    screen", "The phone has moved", "Look back at the screen" (face lost), "Hold still for a
    moment", "Add light in front of you";
  - 14 px muted: "Carries on by itself";
  - "Exit" (ghost button) always; after 10 s also a secondary: "Get ready again" (warm-up levels)
    or "Warm up again" (Free look, rounds).
- **Resume** when everything is in range for 1 s: "Back in place" for 400 ms, then continue. In a
  warm-up level the interrupted bubble is shown again with its full settle window.
- `role="alertdialog"`; focus moves to it for keyboard users; the first headline is announced
  assertively, later changes politely.

### 3.9 Phone tilt check

- Signals and thresholds in §3.1–3.2. On Get ready: "Stand the phone more upright" (θ < 55°), "Tilt
  the phone back slightly" (θ > 105°), "Hold the phone straight" (roll > 10°), "Hold the phone
  steady" (rotation rate). After the warm-up: θ or roll changed by > 6° → "The phone has moved"
  (nudge "Phone moved"; pause headline "The phone has moved", tip "Put it back, or warm up again").
- Hand-held detection (Propped chosen): rotation-rate variance over 2 s above a threshold → the tip
  "Prop it on books or a mug", once.
- iOS: permission on the "Play" tap (camera first, motion second); Android: no prompt. Without
  permission the camera-based rank 10 ("Raise the phone to eye level") still covers most cases.
- θ and roll are added to the export as covariates (`deviceTiltDeg`, `deviceRollDeg`).
- **Requires** amending spec §14.2.10 ("No device-motion sensors are used"), §9.4.

### 3.10 Haptics, sound, speech

- **Haptics** (Android only; never the only cue): 20 ms when *Ready* latches; [30, 60, 30] on
  auto-pause; 15 ms per bubble pop (warm-up and challenge).
- **Sound**: on by default at low volume from the first level card (a soft pop per bubble, a
  two-tone on pause, a chime on resume and on result screens); off on Get ready. Toggle on every
  level and round card and in the pause card. Web Audio starts on the "Play" tap.
- **Read instructions aloud** (Settings): `speechSynthesis`, `lang 'en-GB'`, speaks each new
  headline, at most once per 2.5 s. When on, *Ready* also says "Tap anywhere to start", and the
  whole screen becomes the start target (fullscreen still needs the tap).

### 3.11 Accessibility checklist for the position guard

WCAG 2.2: 1.4.1 (state = colour + line style + glyph + words), 1.4.11 (halo on strokes), 4.1.3
(one polite status region), 2.2.1 ("Start anyway" after 20 s; "Limited head movement" halves the
Level 3 targets), 2.3.1 (nothing flashes), 2.5.8 (all targets ≥ 44 px), 1.3.4 (both
orientations), 1.3.3 (say "the oval", never "the green box").

---

## 4. App shell and layout

### 4.1 Root rules (no-scroll)

```css
html, body { margin: 0; block-size: 100%; overflow: hidden; overscroll-behavior: none;
             background: var(--color-background); }
.app {
  block-size: 100vh; block-size: 100svh;       /* fits with the browser bars shown */
  block-size: var(--app-h, 100svh);            /* JS fallback only if the iOS 26 device check fails */
  inline-size: 100%; display: grid; overflow: clip;
  --pad-t: max(24px, env(safe-area-inset-top));   --pad-b: max(24px, env(safe-area-inset-bottom));
  --pad-l: max(16px, env(safe-area-inset-left));  --pad-r: max(16px, env(safe-area-inset-right));
  padding: var(--pad-t) var(--pad-r) var(--pad-b) var(--pad-l);
}
.stage { grid-area: stage; container-type: size; min-block-size: 0; min-inline-size: 0;
         position: relative; overflow: hidden; }
```

No-scroll rules (all testable):

1. `.app` is `100svh` in normal flow; never bare `100vh`, never `position: fixed; inset: 0` for
   the shell (iOS 26 does not draw fixed content under its floating bars).
2. Exactly one flexible region, the stage (`minmax(0, 1fr)`); all others `auto`.
3. Everything in the stage is sized in `cq*` units or %; media use the contain-fit box
   `aspect-ratio: W/H; inline-size: min(100cqw, 100cqh * W/H)`.
4. Layouts switch by aspect ratio (5/4) and height (480 px); components switch by container
   queries. Never `orientation`, never user-agent sniffing.
5. Type in `rem` (tokens 14/16/20/28 px = 0.875/1/1.25/1.75 rem; display 36/48 px = 2.25/3 rem);
   never `vw` in type.
6. Copy is written to the budget of §4.6. No ellipsis as design.
7. Targets ≥ 44 × 44 px; primary 56 px tall on `pointer: coarse`, 48 px on `pointer: fine`;
   the primary never shrinks below its label (`flex: 1 0 auto`).
8. At most one primary and one secondary visible; below a 320 px action row the secondary becomes
   a 56 px icon button with an `aria-label`.
9. Every region padded by `max(gutter, env(safe-area-inset-*))`; nothing interactive or measured
   lies in an inset.
10. Stimulus geometry is measured once at the start of each level; resize beyond tolerance,
    orientation change or pinch zoom pauses the level ("The screen changed", §2.16) [spec §4.7,
    §14.2.4].
11. **Fit guard**: a `ResizeObserver` degrades each region on its own ladder: top bar (drop the
    wordmark → drop the phase label → dot nodes, §2.3); Title hero (drop the emblem → map without
    names); actions (secondary → icon → hidden, still in Details); panel (drop the tip → body to
    one line + "More" → headline only); positioning preview (stage < 240 px tall → a 40 px position
    glyph in the bar, preview on tap in a sheet).
12. **Escape hatch**: only when the player has enlarged text or zoomed, the *panel* may scroll
    (`overflow-y: auto` with an edge fade). The page never scrolls, and nothing ever scrolls
    sideways.
13. **Check**: a Playwright spec visits every screen and state at 360×640, 390×664, 390×844,
    375×553, 844×390, 750×342, 802×293, 1280×650, 1440×900 and 1920×969 and asserts
    `scrollWidth ≤ clientWidth`, `scrollHeight ≤ clientHeight`, no clipped heading, paragraph,
    button or pill, guard tier ≤ 1, all targets ≥ 44 px; repeated at 125 % root font size.

### 4.2 Modes

The three modes and their screens are in §2.2. Layout consequences: framed screens use the grids
below; immersive screens put a floating bar, a cue and a dock over an edge-to-edge stage; stimulus
screens have no regions at all, only the HUD pieces placed by device in §4.3–4.5.

### 4.3 Phone portrait (reference 390×844; must fit 360×640 and 375×553)

Framed grid (Title, Warm-up complete, Round complete):

```css
.app { grid-template: "top" 48px "stage" minmax(0,1fr) "panel" auto "actions" auto / minmax(0,1fr);
       row-gap: 0; }
.stage { margin-block-start: 8px; } .panel { margin-block-start: 24px; } .actions { margin-block-start: 24px; }
```

- Padding 24 top, 16 sides, 24 bottom.
- **Top bar** 48 px. Title: mark (24 px) + wordmark at the left, Details (44 px icon button) at the
  right. Every other framed screen: phase label + 10 px + track (134 × 22) at the left, Details at the
  right; no mark (fit: §2.3).
- Panel at most 204 px tall: headline (≤ 2 lines), body (≤ 3 lines), one meta or status row.
- Actions 56 px: secondary left (content width), primary fills the rest.
- Budget at 360×640: 48 + 48 + 8 + 24 + 24 + 56 = 208 fixed; panel ≤ 170 → stage ≥ 262 px.
- The Title replaces the panel with the title block above the stage and the chooser below it
  (§2.4); its hero takes the flexible row.

**Immersive** (Get ready, Free look): the stage spans the screen; over it, a flex column with
padding 24 top, 16 sides, 0 bottom: the top bar (48 px `--stage-chip` pill, padding 12 left and 2
right: phase label, track, Details), 8 px, the cue card (Get ready only), a flexible clear band, and
the **dock**: a full-width bottom panel (`margin: 0 -16px`, `--stage-chip`, top corners
`--radius-sheet`, padding 16 sides and top, `max(24px, env(safe-area-inset-bottom))` bottom).

- Get ready dock: status row 32 px, 12 px gap, action 56 px: 140 px total (168 px with the 20 s
  line "You may unlock fewer zones").
- Free look dock: "Tracking" row 40 px (live dot and word left, position glyph right), 8 px, one
  sentence (25 px), 12 px, actions 56 px: 181 px total.
- Full width gives the action row 328 px on a 360 px phone: two buttons of up to about 160 px each
  fit, with 16 px button padding.
- Clear band at 360×640 ≈ 326–354 px; the oval (phone target 0.33 × displayed long side) is
  ≈ 274 px tall there.

**Stimulus** (cards, levels, rounds, Re-aim): pip line 12 px below the top edge across x 16–374;
corner cluster bottom-right (Pause x 330–374, y 776–820 at 390×844; glyph 8 px to its left); score
chip top-left (x 16, y 24, 40 px tall) in rounds; cards centred.

### 4.4 Phone landscape (reference 844×390; must fit 750×342 and 802×293)

- Aspect ≥ 5/4 and height < 480 px: **compact landscape**. No full-width bar: the stage keeps the
  full height.
- Camera side from `screen.orientation.angle` (90 → camera left, 270 → camera right; check on
  devices). Drawings in this document assume **camera left**; mirror everything for camera right.
- Framed: `grid-template: "stage top" auto "stage panel" minmax(0,1fr) "stage actions" auto /
  minmax(0,1fr) clamp(260px, 38vw, 340px)`; stage on the camera side, the side column on the far
  side.
- Immersive: `"cue top" auto ". ." minmax(0,1fr) "panel actions" auto / minmax(0,1fr)
  clamp(260px, 38vw, 340px)`: cue at the top of the camera side, top bar top far side, status row
  (or Tracking row) bottom camera side, actions bottom far side.
- **Stimulus**: the pip line runs vertically 12 px in from the camera edge (x 12–16, y 24–366);
  the corner cluster sits at the bottom of the far side (Pause x 752–796, y 322–366; glyph 8 px to
  its left); the score chip at the top of the camera side (x 48, y 24); cards centred.
- Padding: 24 top and bottom, 48 on both sides (the notch or camera cut-out sits on the camera
  side; the other side is symmetric so content does not jump when the phone is turned round).
- Content budget: headline ≤ 2 lines × 24 characters, body ≤ 3 lines × 31 characters.

### 4.5 Desktop landscape (reference 1440×900; must fit 1280×650)

- Aspect ≥ 5/4 and height ≥ 480 px: **regular landscape**.
- Framed: `grid-template: "top top" 48px "stage side" minmax(0,1fr) / minmax(0,1fr)
  clamp(300px, 30vw, 420px)`, column gap 40, row gap 24, padding 24 × 40, content max 1360 px
  wide and centred. At 1440×900: top bar y 24–72, stage card x 40–940 × y 96–876, side column
  x 980–1400. The side column holds panel and actions as **one group, vertically centred** (actions
  32 px below the panel).
- Top bar 48 px: mark + wordmark "eek-a-calibrate" (Spectral 20, 600) left; the labelled track
  centre (with the phase label when no node is current); Details (icon + word) right; in Free look
  the position glyph sits left of Details.
- Immersive: a floating dark top bar across the width (inset 24, `--stage-chip`, pill), the cue card
  top-centre under the webcam (y 88), and a **bottom-centre dock** in one row, 80 px tall (104 px
  with the 20 s line), y 796–876: Get ready max 720 px wide (status row left, action right); Free
  look 760 px (Tracking, sentence, Re-aim, Play the challenge). On 1280×650 the clear band is
  ≈ 380 px and the webcam oval (0.21 of the long side) ≈ 350 px tall: it fits.
- Stimulus: the pip line along the top edge (y 12–16, x 24–1416, 6 px gaps); corner cluster
  bottom-right (Pause x 1372–1416, y 832–876); score chip top-left (x 24, y 24); cards centred.
- Buttons 48 px tall (`pointer: fine`). Half-screen windows (aspect < 5/4) use the portrait
  template.

### 4.6 Content budget (every screen, written for the narrowest 260 px column)

- Headline ≤ 50 characters (aim ≤ 26, one line).
- Body ≤ 100 characters (about 15 words).
- One meta row: a status row of ≤ 3 items of ≤ 16 characters, or one line of ≤ 36 characters.
- Primary label ≤ 18 characters; secondary ≤ 14.
- ≤ 30 words outside the stage per screen; the two result screens (Warm-up complete, Round
  complete) may use 36, because their headline, sentence, tip and score line each state one
  measured fact.
- Cards (level, round, offer, pause): ≤ 30 words.
- Immersive screens: one cue and one status row, never more.

### 4.7 Sheet geometry

As §2.17: bottom sheet below 600 px width and from 480 px height; side sheet otherwise. In phone
landscape the side sheet slides in from the far side so it never covers the camera-side cue.

---

## 5. The challenge mechanics: "Pop!"

### 5.1 Concept

One bubble at a time appears in one of the player's zones. Looking anywhere in that zone makes the
bubble shrink; when it has shrunk to its dot it pops. The rule is the warm-up rule ("keep your eyes
on the dot until the bubble pops"), so the player learns one thing once; the difference, said on
the first round card, is that now the eyes do the popping. It builds on FOXIE's shrinking target,
with the window made webcam-sized and the timer made forgiving.

### 5.2 Why it survives 2–5° of error

- **Acceptance is the whole zone**, and zones come from the player's own Test round (half-cell
  ≥ p75 accuracy + 2 × RMS-S2S, per axis): with 5° of error a portrait phone simply gets 1 × 2
  zones.
- **The visible bubble is smaller than the zone**: a precise point to look at, a forgiving area to
  hit.
- **Leaky dwell**: progress fills at 1/dwell per second inside the zone, drains at twice that rate
  outside, and resets fully only after 300 ms continuously outside. Blink-held samples pause it.
- **No gaze dot.** Only the lit zone shows where the tracker thinks the player looks, so nobody
  chases an offset dot.
- Fewer than 2 zones: no challenge; Warm-up complete offers "Get ready again" (§2.12).

### 5.3 Parameters

| Parameter | Value |
|---|---|
| Board | the safe rectangle minus a 4 % margin on each axis, split into the result's cols × rows; 16 px gutters |
| Bubble diameter | clamp(72 px, 40 % of the zone's short side, 20 % of the screen's short side) (78 px on a 390 px phone) |
| Bubble core | the ABC dot, as in the warm-up (24 px when the geometry is unknown) |
| Placement | zone centre ± 10 % jitter; never the same zone twice in a row; zones balanced over the round |
| Dwell | round 1: 1000 ms; round 2: 800 ms; round 3: 700 ms |
| Shrink | full diameter → the core's size, in proportion to dwell progress (it grows back while progress drains); the dashed ghost ring stays at full size |
| Pop | 200 ms burst of six short black strokes; sound and 15 ms haptic where on |
| Lifetime | 4 s, then the bubble drifts up 24 px and fades (a miss, no penalty); the lifetime is held while paused |
| Gap | 500 ms between bubbles |
| Round | 16 bubbles ≈ 60 s; with an odd number of rows or columns, every 5th bubble is in the centre zone (a drift check) |
| Round 2 | adds a decoy (dark spiky ball, the bubble's diameter) in another zone for the bubble's lifetime; looking at it for 600 ms makes it "bonk" (it shakes for 200 ms, −50) |
| Round 3 | the bubble drifts within its zone at ≤ 3°/s, never closer than its radius to the zone edge |
| Re-aim offer | hit rate < 50 % over the last 6 bubbles (between bubbles, at most once per round) |

### 5.4 Visuals

- Grey stage (`--stage`); zones as faint rounded rectangles (radius 14, 1.5 px `--stage-line`);
  the zone being looked at is lit (`--stage-lit` fill + 2 px `--halo` outline).
- Bubble: exactly the warm-up bubble (§6.1): `--bubble-fill` disc, 2 px `--bubble-edge`, a 3 px
  `--bubble-shine` arc at its upper left (from 213° to 251° at 0.7 × the radius), the ABC dot at its
  centre and a dashed `--bubble-ghost` ring at full size. No gradient, no glow.
- Decoy: a 12-point spiky ball in `--decoy`, no edge, no dot (nothing to look at).
- HUD: §2.14. No track, no level name, no gaze dot.
- Under reduced motion: no shrink; a `--bubble-ghost` inner disc grows from the core to the full
  size as the dwell fills; no burst, no drift-away (the bubble simply disappears).

### 5.5 Scoring and stars

| | |
|---|---|
| Pop | +100, plus a speed bonus of 50 × (1 − time to pop / 4 s) |
| Streak | × 1.5 on every pop after 4 pops in a row; a miss or a bonk ends it |
| Decoy bonk | −50 (the score never goes below 0) |
| Stars per round (heuristic) | 1 ★ ≥ 50 % popped; 2 ★ ≥ 75 %; 3 ★ ≥ 90 % with a median time to pop ≤ 1.6 s |
| Best score | kept per zone set on the device (a 1 × 2 board is not compared with a 3 × 2 board) |

Stars are drawn in `--star-on` (filled) and `--star-off` (outline); never gold.

### 5.6 The challenge as a quality check

Each pop stores the target, zone, time to pop and the median filtered gaze over the last 400 ms.
After a round: per-zone hit rate, median time to pop and offset (Details → Results). Consistent
offsets in ≥ 3 zones (resultant ≥ 0.6, mean > a quarter of a zone) → a global offset correction for
the next round, announced on Round complete ("We corrected a small shift."). Hit rate < 50 % or
≥ 2 zones ✗ → Re-aim becomes the primary remedy (§2.14). Challenge rows are exported with
`phase: 'game'`.

---

## 6. Shared CSS and drawing kit

### 6.0 Shared CSS

`shared.css` (same folder) is binding: every artboard pastes it verbatim into `<helmet><style>`,
after `body{margin:0}` and the `a` rules. It holds the eek-a-style roles (dark identity default,
light override under `[data-theme="light"]`), the theme-independent stage roles, the v2 game roles
and the component classes (`.btn`, `.btn--primary|secondary|ghost|chip`, `.icon-btn`, `.choice`,
`.chip`, `.ex`, `.sr-only`, `.ek-live`). Roles added for v2:

| Token | Value | Role |
|---|---|---|
| `--bubble-fill` | white 30 % | the bubble's disc (warm-up, Re-aim, challenge) |
| `--bubble-edge`, `--bubble-core` | black | bubble outline; ABC dot |
| `--bubble-shine` | white | the highlight arc |
| `--bubble-ghost` | black 30 % | dashed full-size ring; reduced-motion fill |
| `--firefly-light`, `--firefly-trail` | white 45 %, white 40 % | the firefly's disc and trail |
| `--decoy` | `#24242a` | round 2 spiky ball |
| `--pip-on`, `--pip-off` | black, black 22 % | pip line |
| `--arc-on`, `--arc-off` | black, black 60 % | Level 3 arcs (fill, dashed track) |
| `--node-done`, `--node-line` | white 12 %, white 35 % | track nodes and connectors |
| `--star-on`, `--star-off` | `--color-text`, `--color-faint` | stars |
| `--control-boundary` | `--color-faint` | secondary button and chooser tile borders |

The design-canvas digest of this section and §2.3 is `spec-core.md` (≤ 8 KB); per-board briefs are
in `briefs/`.

### 6.1 Drawing kit (inline SVG, `aria-hidden="true"` unless stated)

Icons: `viewBox="0 0 24 24"`, 20 px, `fill="none" stroke="currentColor" stroke-width="1.75"
stroke-linecap="round" stroke-linejoin="round"`. F = `fill="currentColor" stroke="none"`.

| Icon | Markup |
|---|---|
| Mark (identity eye) | `<path d="M2 12c2.6-4.2 6-6.3 10-6.3s7.4 2.1 10 6.3c-2.6 4.2-6 6.3-10 6.3S4.6 16.2 2 12z"/><circle cx="12" cy="12" r="3.2" F/>` (24 px) |
| More (Details) | three circles r 1.6 F at (5,12), (12,12), (19,12) |
| Pause | `<rect x="7" y="5" width="3.2" height="14" rx="1" F/><rect x="13.8" y="5" width="3.2" height="14" rx="1" F/>` |
| Play | `<path d="M8 5.5v13l10.5-6.5z" F/>` |
| Sound | `<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>` |
| Crosshair (Re-aim) | `<circle cx="12" cy="12" r="7"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>` |
| Back | `<path d="M19 12H5M11 6l-6 6 6 6"/>` |
| Clock | `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>` |
| Lock | `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>` |
| Sun | `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>` |
| Check ✓ / Alert ! / Cross ✗ | `M5 12.5l4.5 4.5L19 7.5` / `M12 6.5v7` + circle (12, 17.5) r 1.2 F / `M7 7l10 10M17 7L7 17` |
| Info | `<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1.1" F/>` |
| Propped (chooser) | `<rect x="8" y="3" width="8" height="14" rx="1.5"/><path d="M6 21l6-4 6 4"/>` |
| In hand (chooser) | `<rect x="9" y="2.5" width="7" height="12" rx="1.5"/><path d="M6 12v3.5a5 5 0 0 0 5 5h2.5a4 4 0 0 0 4-4V14"/>` |
| Webcam (chooser) | `<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/><circle cx="12" cy="7.2" r="0.9" F/>` |

**Level pictograms** (24 box drawn at 48 px, stroke 1.5): Pop `<circle cx="12" cy="12" r="8"/><circle
cx="12" cy="12" r="2.2" F/><path d="M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4"/>`; Follow `<path d="M3 18c3-1 4-7
8-7s5 4 8-1" stroke-dasharray="1.5 2.5"/><circle cx="19.5" cy="9.5" r="2.5" F/>`; Turn: a dot
(12, 12) r 2.2 F inside the arcs `M5.1 16A8 8 0 0 1 5.1 8M18.9 8A8 8 0 0 1 18.9 16M8 5.1A8 8 0 0 1 16
5.1M16 18.9A8 8 0 0 1 8 18.9`; Test `<circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="2" F/><path
d="M15.5 18.5l2 2 4-4.5"/>`; Challenge: the star (below), stroked; Spiky (round 2): the decoy path
scaled to 0.3; Drifter (round 3): Pop plus `<path d="M17 4.5h3.5V8"/>`.

**State badges** (14, 16 or 24 px): a circle filled with `--state-good` / `--state-adjust` /
`--state-lost` holding the check / alert / cross path stroked `var(--badge-ink)` at 2.5 px; on the
grey, a 1.5 px `--stage-ink` edge is added.

**Position glyph**: as v1 (spec-core.md holds the markup): Good at opacity 0.6; Drifting with the
oval and badge in `--state-adjust`, eye dots at cx 18 and 22 for "too far", alert path `M31
27.6v3.4` and a dot at (31, 34); Lost with the oval in `--state-lost` dashed 3 3, no eye dots, cross
path `M28.5 28.5l5 5M33.5 28.5l-5 5`.

**The bubble** (one drawing for the warm-up, Re-aim and the challenge), centred at (X, Y), full
radius RF, current radius R:

```html
<g transform="translate(X Y)">
  <circle r="RF" fill="none" stroke="var(--bubble-ghost)" stroke-width="1.5" stroke-dasharray="4 4"/>
  <circle r="R" fill="var(--bubble-fill)" stroke="var(--bubble-edge)" stroke-width="2"/>
  <path d="SHINE" fill="none" stroke="var(--bubble-shine)" stroke-width="3" stroke-linecap="round"/>
  <!-- ABC dot (24 px): disc, cross cut in the colour beneath (stage, then the overlay), centre dot -->
  <circle r="12" fill="var(--bubble-core)"/>
  <path d="M-12-1.5h24v3h-24zM-1.5-12h3v24h-3z" fill="var(--stage)"/>
  <path d="M-12-1.5h24v3h-24zM-1.5-12h3v24h-3z" fill="var(--bubble-fill)"/>
  <circle r="4" fill="var(--bubble-core)"/>
</g>
```

SHINE = `M{-0.587R} {-0.381R} A{0.7R} {0.7R} 0 0 1 {-0.228R} {-0.662R}`; for R = 20, 23, 24, 39, 40,
60: `M-11.7-7.6A14 14 0 0 1-4.6-13.2`, `M-13.5-8.8A16.1 16.1 0 0 1-5.2-15.2`, `M-14.1-9.1A16.8 16.8 0 0
1-5.5-15.9`, `M-22.9-14.9A27.3 27.3 0 0 1-8.9-25.8`, `M-23.5-15.2A28 28 0 0 1-9.1-26.5`, `M-35.2-22.9A42
42 0 0 1-13.7-39.7`. A static bubble (Level 3) omits the ghost ring. **Pop burst** (150 ms warm-up,
200 ms challenge): `<path d="M0-18L0-26M15.6-9L22.5-13M15.6 9L22.5 13M0 18L0 26M-15.6 9L-22.5 13M-15.6-9L-22.5-13"
stroke="var(--bubble-edge)" stroke-width="2" stroke-linecap="round"/>`, scaled with the bubble.

**Firefly**: `<circle r="22" fill="var(--firefly-light)"/>` plus the ABC dot (second cross fill
`--firefly-light`); the trail of the last 300 ms as three 3 px round-cap segments, stroke
`--firefly-trail` at stroke-opacity 1, 0.625 and 0.3 from newest to oldest (40 %, 25 %, 12 %).

**Level 3 arcs**: four 60° arcs (left 150–210°, right −30–30°, up 240–300°, down 60–120°) at
radius RB + 22; track dashed 4 4 in `--arc-off`, 4 px; fill solid `--arc-on`, growing from each
arc's midpoint; the arc being reached is drawn 6 px.

**Decoy** (radius 30; scale for other sizes): `<path d="M0-30L6-22.2L15-26L16.3-16.3L26-15L22.2-6L30
0L22.2 6L26 15L16.3 16.3L15 26L6 22.2L0 30L-6 22.2L-15 26L-16.3 16.3L-26 15L-22.2 6L-30 0L-22.2-6L-26-15L-16.3-16.3L-15-26L-6-22.2Z"
fill="var(--decoy)"/>`.

**Zones**: `<rect rx="14" fill="none" stroke="var(--stage-line)" stroke-width="1.5"/>`; lit: fill
`--stage-lit`, stroke `--halo` 2 px. **Gaze disc** (Free look): fill `--gaze-soft`, 1.5 px
`--gaze-outline` edge, radius = the player's p68 Test-round error.

**Pip line**: one `<rect height="4" rx="2">` per bubble, done `--pip-on`, to go `--pip-off`; gaps
4 px (phones) or 6 px (desktop); widths fill the line.

**Stars** (24 box; 28 px on phones, 32 px on desktop): `M12 3.6L14.3 9.6L20.7 10L15.7 14L17.4 20.2L12
16.7L6.6 20.2L8.3 14L3.3 10L9.7 9.6Z`; on: fill `--star-on`; off: no fill, 1.5 px `--star-off`.
Track stars: in the 22 box `M11 5.1L12.6 9.3L17.1 9.5L13.6 12.3L14.8 16.7L11 14.2L7.2 16.7L8.4 12.3L4.9
9.5L9.4 9.3Z` (offset by the node's x − 11); in the 24 box `M12 5.5L13.7 10.1L18.7 10.3L14.8 13.4L16.1
18.2L12 15.4L7.9 18.2L9.2 13.4L5.3 10.3L10.3 10.1Z`.

**Camera preview** (abstract, never a photo): `--preview-bg` panel; head = ellipse in
`--preview-figure` with a 1 px `--preview-edge` stroke; shoulders = a path in `--preview-figure`;
veil = an even-odd path (full rectangle plus the oval) in `--stage-veil`; oval and outline strokes
each drawn twice (halo first). Mirroring needs no drawing.

---

## 7. Copy deck (British English; no em dashes in UI copy)

| Where | Text |
|---|---|
| Title | eek-a-calibrate · **Pop with your eyes** · Warm up the tracker, then pop bubbles just by looking. |
| Title map | Pop · Follow · Turn · Test · Challenge |
| Title chooser | How are you playing? · Propped · In hand · Webcam (names: Phone propped up · Phone in hand · Computer webcam) |
| Title actions and meta | **Play** · Skip warm-up (stored warm-up only) · About 3 minutes · Nothing is uploaded |
| Get ready | Get ready · status row Distance · Position · Light · cues and tips §3.4 · Ready · Stay like this while you play |
| Get ready action slot | Start warm-up (disabled) · Start anyway + "You may unlock fewer zones" (after 20 s) · **Start warm-up** (ready) · Make the window larger to play |
| Level cards | Level 1 of 4 · Level 1 clear · Nice and steady / Try to keep your head still / Try to stay in view / Nice work · Start now · Skip this level (Level 2, reduced motion) |
| Level 1 | Pop the dots · Keep your eyes on the dot until the bubble pops. · Keep your head and the phone still. / Keep your head still. |
| Level 2 | Follow the firefly · Follow the firefly with your eyes. · (hints as Level 1) |
| Level 3 | Turn your head · Keep your eyes on the dot and slowly turn your head. · Keep the phone still. Fill the arcs. / Fill the arcs around the bubble. · chips: Slowly turn your head · Now nod slowly |
| Level 4 | Test round · Same as level 1. This round checks your aim. |
| Lean in (Thorough) | Lean in · Lean in by about a hand's width, then pop the dots again. |
| Checking | Checking your aim… · Almost there |
| Pause card | Paused · Carry on · Exit · Sound |
| Auto-pause | Paused · Move back into view (and §3.8) · Carries on by itself · Back in place · Exit · Get ready again / Warm up again |
| Too many pauses | Let's fix the set-up first · **Get ready again** |
| Warm-up complete | Warm-up complete · You unlocked 3 zones · The challenge will use these 3 zones. · Your set-up works well. · Only left and right for now. · Only top and bottom for now. · Warming up again may unlock more. · Warm-up didn't work · We often lost your face. · Rule of thumb · How we judge this · Hit · Missed |
| Warm-up complete actions | **Try your zones** · Warm up again · **Warm up again** · Play anyway · **Get ready again** · **Back to the challenge** (after a quick warm-up) |
| Free look | Free look · Tracking · The zone you look at lights up. · Re-aim · **Play the challenge** |
| Re-aim | Aim drifting? · Re-aim with two bubbles. About 5 seconds. · Keep playing · **Re-aim** · Aim fixed · Your aim was fine · Your aim moved a lot · A quick warm-up will fix it. About 20 seconds. · **Quick warm-up** |
| Round cards | Round 1 of 3 · Pop! · Now your eyes do the popping. · Look at a bubble until it pops. No tapping needed. · Mind the spikes · Pop the bubbles, not the spikes. · Looking at a spike costs points. · Drifters · The bubbles drift. Follow them with your eyes. · Same rule: look until it pops. · 16 bubbles · about 1 minute · Start now |
| Round HUD | score (mono) · ×1.5 · −50 |
| Round complete | Round 1 of 3 / Challenge complete · 14 of 16 popped · The right zone was the hardest. · Every zone worked well. · We corrected a small shift. · Your aim drifted. Re-aim with two bubbles. · Score 1 820 · Best 1 820 · **Next round** · **Play again** · **Re-aim** · Free look · Play again · Replay where you looked (button name) |
| Screen changes | The screen changed · Warm up again to keep playing. · Turn the phone back, or warm up again · **Warm up again** |
| Errors | This browser cannot run the game. Try Chrome, Edge or Safari 17 or later. · Camera blocked · Allow the camera in your browser settings, then try again. · **Try again** · This device is slow. Close other apps. |
| Details | Details · Done · Results · Settings · Data · Device · About · Delete all my data · Methods (long read) |

Every number above is an example except the protocol counts (13, 12, 5, 16 bubbles, 3 rounds, 4
levels) and the times. On boards, example values carry the **Example** badge.

**Honesty check for copy** (applies to every new line): a warm-up line may say *look*, *keep your
eyes on*, *follow*, *until the bubble pops*; it may not say or imply that looking pops, moves or
scores anything. Head-driven lines (Level 3 arcs, steadiness) may say "fill" and "reached" because
the head pose drives them. Only round cards, the round HUD and Round complete may credit the eyes.

---

## 8. Artboards

Seventeen boards on the design canvas (`canvas-full-v2.json`), each with a self-contained brief in
`briefs/` (≤ 4 KB) that every drawing agent reads together with `spec-core.md` and
`authoring-guide.md`. Phone and webcam boards of the same screen show the same state and copy.

| Board | Title | Size | State shown | Brief |
|---|---|---|---|---|
| `Main.dc.html` | Phone · Title screen | 390×844 | first run, Propped chosen | `briefs/Main.md` |
| `phone-ready.dc.html` | Phone · Get ready | 390×844 | *Ready* latched | `briefs/phone-ready.md` |
| `phone-level1-pop.dc.html` | Phone · Level 1 Pop the dots | 390×844 | bubble 7 of 13 mid-shrink | `briefs/phone-level1-pop.md` |
| `phone-level2-follow.dc.html` | Phone · Level 2 Follow the firefly | 390×844 | firefly 20 % along the path | `briefs/phone-level2-follow.md` |
| `phone-level-complete.dc.html` | Phone · Warm-up complete | 390×844 | Good: 2 stars, 3 zones | `briefs/phone-level-complete.md` |
| `phone-free-look.dc.html` | Phone · Free look | 390×844 | top zone lit, bar and dock shown | `briefs/phone-free-look.md` |
| `phone-challenge.dc.html` | Phone · Challenge | 390×844 | round 2, bubble 9 of 16, decoy shown | `briefs/phone-challenge.md` |
| `desktop-title.dc.html` | Webcam · Title screen | 1440×900 | first run, Webcam chosen | `briefs/desktop-title.md` |
| `desktop-ready.dc.html` | Webcam · Get ready | 1440×900 | *Ready* latched | `briefs/desktop-ready.md` |
| `desktop-level1-pop.dc.html` | Webcam · Level 1 Pop the dots | 1440×900 | Level 1 card, 3 s left | `briefs/desktop-level1-pop.md` |
| `desktop-level3-turn.dc.html` | Webcam · Level 3 Turn your head | 1440×900 | bubble 3 of 5, nodding | `briefs/desktop-level3-turn.md` |
| `desktop-level-complete.dc.html` | Webcam · Warm-up complete | 1440×900 | Good: 2 stars, 3 zones | `briefs/desktop-level-complete.md` |
| `desktop-free-look.dc.html` | Webcam · Free look | 1440×900 | left zone lit, bar and dock shown | `briefs/desktop-free-look.md` |
| `desktop-challenge.dc.html` | Webcam · Challenge | 1440×900 | Round 1 complete, 14 of 16 | `briefs/desktop-challenge.md` |
| `position-signals.dc.html` | Position guard: every state | 1440×900 | component sheet | `briefs/position-signals.md` |
| `phone-landscape-level1.dc.html` | Phone landscape · Level 1 | 844×390 | bubble 7 of 13 mid-shrink | `briefs/phone-landscape-level1.md` |
| `phone-landscape-challenge.dc.html` | Phone landscape · Challenge | 844×390 | round 2, bubble 9 of 16 | `briefs/phone-landscape-challenge.md` |

Example state shared by the boards: 3 zones (phone portrait 1 × 3, phone landscape and webcam
3 × 1), outcome Good, Test-round misses at the top-right and bottom-left positions.

---

## 9. Specification amendments needed (v0.5) before building

1. **§7 flow and screens**: the app's screens become the game's parts (Title, Get ready, four warm-up
   levels with cards, Warm-up complete, Free look, three challenge rounds with Round complete), with
   the names and routes of §2. The protocol blocks and their order do not change.
2. **§4.7 target presentation**: the 400 ms ring at the start of the settle window is replaced by
   the bubble: scale-in inside the settle window, static to its end, linear shrink to the core over
   the sample window, hold at the core during extension, pop outside the window. Reduced motion:
   static. To be piloted (§10).
3. **§4.7 head block**: the moving pose dot is not drawn; the four arcs carry the measured pose.
4. **§14.2.10 sensors**: device motion (gravity and rotation rate) is read for the phone tilt check,
   with the iOS permission on "Play", and θ and roll are exported as covariates.
5. **Zones**: the adaptive grid chooses columns and rows separately (rectangular zones) [flow §2.2];
   the zones are the challenge board.
6. **Stars**: Warm-up complete stars from `VERDICT` (good 3, acceptable 2, poor 1, not tracking or
   fewer than 2 zones 0); challenge stars per §5.5. Both heuristic and shown under "Rule of thumb".
7. **§4.13 drift check**: presented as Re-aim (two bubbles), offered by the triggers of §2.15; the
   quick recalibration is presented as Quick warm-up. Behaviour unchanged.
8. **Set-up chooser**: Propped / In hand / Webcam may override the device class for copy and
   thresholds (§3.2).
9. **Export**: challenge rows as `phase: 'game'`, with round, zone, time to pop and decoy events.

Bump the specification version and record the change in `current_state.md`, as `AGENTS.md`
requires.

---

## 10. Device and pilot checks still open

- **Shrink timing pilot**: compare the bubble (shrink in the sample window) with the spec's ring on
  a small pilot on at least one phone and one laptop, for accepted frames per target and validation
  accuracy. Ship the bubble only if it is not worse. No figure is published before this.
- **Thresholds**: every range of §3.2, the hysteresis and the steadiness lines (§2.6) on real phones
  (Propped and In hand) and webcams.
- **Camera side** in phone landscape from `screen.orientation.angle` (90 / 270) on iOS and Android.
- **iOS 26** `svh` behaviour with the floating bars; fullscreen versus viewport mode on iPhone.
- **Motion permission** on iOS after the camera prompt; behaviour when refused.
- **Contrast on the grey**: pips, arcs, zone outlines, lit zone, bubble edge, chips and the
  Example badge measured on device screens, light and dark rooms.
- **Challenge tuning**: dwell per round, the leaky-dwell rates, the Re-aim trigger (50 % over 6), the
  zone marks (80 % / 50 %) and the star thresholds, from pilot play.
- **Reduced motion** and **Read instructions aloud** end to end.
- **Words and fit**: the Playwright no-scroll check (§4.1, rule 13) on every screen and state,
  including 125 % text.
