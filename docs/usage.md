# Using eek-a-calibrate

eek-a-calibrate is a game, "Pop with your eyes", at <https://eelkedevries.com/eek-a-calibrate/>.
You warm up the eye tracker in a few short levels, then pop bubbles just by looking at them.
Under the game, the warm-up is a full calibration and validation of four webcam eye-tracking
engines, and every result is in the Details sheet. Everything runs on your device: the camera
picture never leaves the browser tab, and no image or video is ever stored (see
[privacy](privacy.md)).

It works on desktop and laptop computers with a webcam, and on current phones and tablets
(Android Chrome, iOS and iPadOS Safari 17 or later) with the front camera, upright or on their
side. No screen of the game scrolls: everything fits the window, from a small phone to a large
monitor.

## The game

1. **Title.** Choose how you are playing: **Propped** (a phone resting on something),
   **In hand** or **Webcam**. The choice is made for you from the device (a phone starts on
   Propped, a computer on Webcam); it only changes the advice and how strictly steadiness is
   judged. **Play** asks for the camera (and, on an iPhone, for the motion sensors, which you
   may refuse). The face model starts downloading as soon as the Title opens. If a warm-up for
   this screen is stored on the device, **Skip warm-up** appears beside Play.
2. **Get ready.** Your camera picture, mirrored, with an oval to fill. One instruction at a
   time tells you what to change (closer, further, raise the phone, more light, and so on), and
   the row at the bottom says whether *Distance*, *Position* and *Light* are good. When
   everything has been right for two seconds the oval shows *Ready*, and **Start warm-up**
   turns on. If it cannot get there, **Start anyway** appears after 20 seconds while your face
   is in view. Start warm-up switches the screen to fullscreen (on an iPhone the page fills the
   browser window instead) for the rest of the game.
3. **The warm-up levels.** Each level opens with a card that says what to do and starts by
   itself after 3 seconds (or press Space, tap, or choose *Start now*):

   | Level | What you do |
   |---|---|
   | Pop the dots | Keep your eyes on the dot until the bubble pops. |
   | Follow the firefly | Follow the firefly with your eyes. |
   | Turn your head | Keep your eyes on the dot and slowly turn your head, then nod, until the four arcs fill. |
   | Lean in (Thorough only) | Lean in by about a hand's width, then pop the dots again. |
   | Test round | Same as level 1. This round checks your aim. |

   Popping in the warm-up happens by itself on a timer: your eyes do not pop anything yet. The
   short line along the edge nearest the camera shows how far the level has got; Pause and a
   small position sign sit in the corner furthest from the camera.
4. **Checking your aim…** The tracker is fitted and the Test round scored, in a few seconds.
5. **Warm-up complete.** Stars (heuristic, see "Rule of thumb · How we judge this"), the zones
   you unlocked, drawn with a mark for each Test-round bubble (hit or missed), a sentence about
   the result and, when something got in the way, one tip. At least two zones unlock the
   challenge.
6. **Free look.** The zones as outlines; the one you look at lights up, and a soft disc shows
   where the tracker thinks you look (its size is the typical error of your Test round).
   **Re-aim** runs a two-bubble check of your aim; **Play the challenge** starts the rounds.
7. **The challenge.** Three rounds of 16 bubbles, about a minute each: **Pop!** (look at a
   bubble until it pops), **Mind the spikes** (looking at a spike costs points) and
   **Drifters** (the bubbles drift). A bubble pops when your gaze has stayed in its zone long
   enough; there is no gaze dot. **Round complete** shows the pops per zone, a replay of where
   you looked, stars, your score and the best score for this set of zones.

The level track at the top of the screens between levels shows where you are in the game.

### Warm-up lengths

| Length | Levels | Approximate time |
|---|---|---|
| Quick | Pop the dots (9 bubbles), Test round (6) | 35 s |
| Standard (default) | Pop the dots (13), Follow the firefly, Turn your head (5), Test round (12) | 100 s |
| Thorough | Standard, then Lean in (13) before the Test round | 3 min |

The times are design values of the protocol, not measurements. Choose the length in Details →
Settings (or with `?preset=`).

### Re-aim and Quick warm-up

Over time your aim drifts. **Re-aim** shows two bubbles (the centre and one other place) and
measures the shift: "Your aim was fine", "Aim fixed", or, when the shift is too large to
correct, "Your aim moved a lot" with a **Quick warm-up** (5 bubbles, then a 6-bubble Test round)
that ends on Warm-up complete with new zones. Re-aim is offered in a round when fewer than half
of the last six bubbles popped, after a long pause, five minutes after the warm-up, and after a
round that went badly. It cannot be skipped after a camera, screen or tracker change, after the
tracker restarts, or after Skip warm-up.

### When something goes wrong

- **The position guard pauses the game** when you leave the oval's area for more than a moment
  or your face is lost. The card says what to do and the game carries on by itself once you are
  back. After 10 seconds it also offers to get ready (or warm up) again. If a level pauses three
  times, it suggests fixing the set-up first.
- **"The screen changed"**: leaving fullscreen, resizing the window, zooming or turning the
  phone ends the level or round, because the calibration holds only for the screen it was made
  on. *Warm up again* starts afresh from Level 1. After a turn of the phone, turning it back is
  enough to see the screen again; the warm-up still starts afresh.
- **"Camera blocked"** on the Title: allow the camera in the browser's settings and choose
  *Try again*. See [troubleshooting](troubleshooting.md).

## Keys and touch

| Key | Touch | Action |
|---|---|---|
| Space | *Start now*, or tap the card | Start a level or round, carry on after a pause; on Get ready, start the warm-up once it may |
| P | Pause (corner button) | Pause or carry on during a level or round |
| Esc | *Exit* in the Pause card | Leave a level (back to the Title) or a round (back to Free look); close Details |
| D | Re-aim | Re-aim in Free look |
| R | Record | Expert mode: start or stop a recording (`live-001`, …) in Free look |
| M | Marker | Expert mode: add a numbered marker to the recording |

Every control is at least 44 × 44 px, and every screen works by keyboard alone, with a visible
focus ring. With *reduce motion* set on the device, the bubbles do not shrink or burst, the
firefly has no trail, and the Follow card offers *Skip this level*.

## The Details sheet

The ⋯ Details button at the top right of every screen (and in the Pause card) opens the sheet
over the screen you are on, which keeps its state. It has five tabs, each paged rather than
scrolled:

- **Results**: one card per estimator (Combined first, then each engine) from the latest Test
  round, with accuracy in pixels and % of the screen first and degrees second, precision, data
  loss, rate and verdict, and a *Use this* switch; the target plot; how the stars and zones are
  judged; the challenge's statistics per zone; and the analyses of the earlier Results screen
  (own versus intersection, the data-loss funnel, cross-validation, paired differences, areas
  of interest, the fit's notes).
- **Settings**: warm-up length, engines (Auto, or chosen), glasses, sound, read instructions
  aloud, Limited head movement, theme, camera (with two or more cameras) and **Expert mode**
  (in Free look: the raw and per-engine dots, a trail, recording with markers, and the
  estimator switch).
- **Data**: the export (a zip; see [export format](export-format.md)), with per-frame features
  as an option; what is saved on this device; the participant and session IDs.
- **Device**: live readings (distance, face and eye size, head angles, phone tilt, light,
  glare, frame rate), *Measure screen and distance*, the advised distances, the browser's
  capabilities, the engines' timings (and any engine that could not load), and *Open
  diagnostics*.
- **About**: what the game does, privacy, the realistic expectations with their sources, and
  *Methods (long read)*.

"Delete all my data", at the foot of every tab, asks before it deletes.

`#/details/<tab>` opens the sheet over the Title (`results`, `settings`, `data`, `device`,
`about`), and `?page=<id>` a page of it.

## Engines

By default (**Auto**) every engine that is fast enough on the device is calibrated, and the
estimator used afterwards is chosen from the calibration data alone. The device check on Get
ready times each engine on 30 frames: BlazeGaze is kept if its median time is at most 25 ms per
frame and Peekr if it is at most 15 ms; while the whole frame takes longer than 45 ms the
slowest of the two is left out; the geometric and eye-pixel engines always run. These limits
are heuristic. Engines chosen in Details → Settings (or with `?engines=`) all run, however slow.
See [engines](engines.md).

## Stored warm-ups

When Free look or the challenge first opens after a scored warm-up, the calibration is stored
on the device (up to eight; the least recently used leaves first). **Skip warm-up** on the Title uses a stored warm-up made on this
screen: once the camera is open it must match the camera as well, and it is then checked with
a one-level Test round of 6 bubbles. At a verdict of at least "acceptable" a Re-aim follows and
then Warm-up complete; otherwise the stored warm-up is not used and a full warm-up is needed.
Some browsers change a camera's identifier between visits; a stored warm-up then also matches a
camera of the same name and frame size, and the Test round decides whether it still applies.

## Measuring screen and distance

Optional, from Details → Device. Without it, typical values are assumed, the game works the
same, and only the degree values in Details are approximate (marked "≈").

- **Screen:** hold a bank card (85.60 × 53.98 mm) against the screen and resize the outline
  until it covers the card, or enter the diagonal in inches, or skip. The result is remembered
  for the screen.
- **Distance:** the blind-spot test. Cover your right eye, look at the black square with your
  left eye, and press Space (or tap *It disappeared*) when the red dot vanishes, five times.
  Then look at the screen with both eyes open for two seconds (a little longer on a slow
  device) while the camera measures your irises. The result is remembered for the camera and
  its resolution.

Measuring after the warm-up does not invalidate anything: the pixel results stay the same and
the degree values are recomputed.

## Query parameters

Parameters may be placed before the hash or after it (`#/look?pid=P01`).

| Parameter | Values | Effect |
|---|---|---|
| `pid`, `session` | text (64 characters at most) | Labels for the export |
| `preset` | `quick`, `standard`, `thorough` | The warm-up length |
| `setup` | `propped`, `in-hand`, `webcam` | The set-up chooser's choice |
| `engines` | `auto`, `all`, or a comma-separated list | The engines |
| `select` | `auto` or an estimator id | The estimator used after the warm-up |
| `seed` | integer | The seed of every shuffled order (default: the clock) |
| `driftEveryMin` | number ≥ 0 | Minutes between timed Re-aim offers (0: off) |
| `theme` | `dark`, `light` | The theme for this visit |
| `sound`, `speech` | `0`, `1` | Sound off; read instructions aloud on |
| `expert` | `1` | Expert mode in Free look |
| `target` | `ring` | The §4.7 ring instead of the bubble (for the pilot comparison only) |
| `host` | `worker`, `inline` | The vision host |
| `force` | `cpu` | Run BlazeGaze on the CPU |
| `delegate` | `cpu`, `gpu` | The face landmarker's delegate |
| `e2e`, `speed`, `fixture` | test mode only | |

The addresses of the earlier interface still work: `#/welcome` opens the Title; `#/camera`,
`#/calibrate` and `#/validate` open Get ready; `#/results`, `#/data` and `#/about` open those
tabs of Details; `#/live` opens Free look.

See [methods](methods.md) for how everything is computed and [troubleshooting](troubleshooting.md)
if something does not work.
