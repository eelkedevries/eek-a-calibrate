# Manual verification checklist

Checks that need a real camera, a real device or a person, and so cannot run in the headless
test environment (specification §10.6, §14.2.12, §15.2.3). Under the house deferral rule they fall
to the owner. Everything else — build, unit, simulation, parity and end-to-end tests with a fake
camera — runs in `npm run check:all` and in CI.

**No accuracy figure for this app may appear in the UI or the docs until these checks have been
done and recorded** (anti-fabrication; the app's own validation on each user's device is the only
source of figures). The ranges the app quotes come from published evaluations (specification
Appendix B) and are labelled as such.

Run the checks against the live site, <https://eelkedevries.com/eek-a-calibrate/>, after a deploy
(see `docs/deployment.md`). The Diagnostics page (`#/lab`) shows the host, delegate, backends and
per-stage timings; the export (`#/data`) records the rest in `session.json`.

## How to record a run

For every run, note in the table at the end (or attach the exported zip):

- device, operating system, browser and version; camera (built-in or USB, its resolution);
- the vision host (worker or inline), the landmarker delegate (GPU or CPU) and the WebAssembly
  variant (Diagnostics);
- **frame rate per engine and backend:** the device check's per-engine median times on the
  Camera screen, the effective rate in Live, and each engine's backend (`tfjs-webgl`,
  `tfjs-wasm`, `ort-wasm`, `js`);
- the run set the device check chose, and what it left out and why;
- **validation per engine** and for Combined: mean, median, central and peripheral accuracy, data
  loss and verdict (Results, both tabs), with "≈" noted where degrees were approximate;
- **the selected estimator** and Auto's reason;
- whether screen size and distance were measured, and the measured distance;
- anything that went wrong: messages, pauses, a stalled screen, a wrong instruction.

## 1. Browsers and devices

Desktop, landscape, with a built-in webcam and, where available, a USB one:

- [ ] Chrome (current), Windows or macOS
- [ ] Edge (current), Windows
- [ ] Firefox (current)
- [ ] Safari (current), macOS

Phones and tablets, front camera (§14.2.12). Each in **portrait** and in **landscape**, once
**propped** (on a stand or against something) and once **hand-held**:

- [ ] iPhone, Safari (iOS 17 or later): portrait propped · portrait hand-held · landscape propped
      · landscape hand-held
- [ ] Android phone, Chrome: portrait propped · portrait hand-held · landscape propped ·
      landscape hand-held
- [ ] iPad or Android tablet (optional): one orientation, propped

On every phone run, also check:

- [ ] iPhone has no element fullscreen: calibration runs in viewport mode, with no page
      scrolling, rubber-banding or text selection during the blocks; the browser bars may move
      slightly without stopping the block.
- [ ] Android Chrome enters fullscreen and keeps the orientation locked during the blocks.
- [ ] No target, moving dot or corner button lies under the notch, camera cut-out or home
      indicator (the safe area).
- [ ] Every action works by touch: tapping a card continues; the Pause and Abort buttons in the top
      corners are easy to hit and never cover a dot; "It disappeared" in the blind-spot test.
- [ ] The screen does not dim or lock during camera setup, calibration, validation or Live.
- [ ] Turning the phone during a block stops it with the rotation message; turning it during Live
      pauses the dot with "Rotate back to the orientation you calibrated in, or recalibrate";
      turning back and resuming forces a drift check.
- [ ] The camera picture is upright and mirrored in portrait and in landscape, and the face meters
      behave as on the desktop.
- [ ] iPhone uses the CPU delegate (Diagnostics); note the effective frame rate in Live.
- [ ] Android phones use the CPU delegate by default (Diagnostics); the camera checks show plausible
      face size, centring and head angles; note the effective frame rate. Then repeat once with
      `?delegate=gpu` and record whether the GPU path returns plausible landmarks on this phone
      (the app should switch to the CPU on its own if it does not; specification v0.4 §16.1).
- [ ] The default flow (Welcome → Camera → Calibrate → Validate → Results → Live) never asks for
      the screen size or the distance; the optional measurement works if chosen (the blind-spot
      test asks to turn the phone sideways when the screen is too narrow).

## 2. Participants and conditions

With a real participant (the owner is enough) on one desktop and one phone:

- [ ] without glasses, and with glasses (note glare advice and data loss)
- [ ] lighting: even daylight · a bright window behind · dim evening light · one lamp from the
      side (do the backlight and brightness meters react sensibly?)
- [ ] distance on the desktop: about **40 cm**, **60 cm** and **80 cm** (one calibration each;
      measure screen and distance once, then compare the reported distance with a tape measure)
- [ ] head movement: sit still for one run; move and turn the head naturally during Live in
      another (does the head-range greying appear when it should, and does a drift check help?)
- [ ] a Thorough run at two distances
- [ ] a session of at least 10 minutes in Live, accepting the timed drift checks

## 3. Performance and engines

- [ ] **A low-end laptop** (for example four years old, integrated graphics): the device check's
      run set, the warning when a frame takes longer than 66 ms, the frame rate in Live.
- [ ] **On a real GPU, BlazeGaze reports `tfjs-webgl`** (Diagnostics; headless tests can only show
      `tfjs-wasm`), **its median time is within its 25 ms budget**, and **the lab's eye strip shows
      both eyes**, upright and not mirrored the wrong way (§15.2.3).
- [ ] **Peekr's per-frame time against its 15 ms budget** (Diagnostics, "Run each engine on 10
      frames"), and both of its eye crops show an eye.
- [ ] `?force=cpu` on a desktop: BlazeGaze on `tfjs-cpu` finishes "Run each engine on 10 frames"
      (about 1.5 s a frame) without the run being given up.
- [ ] Each engine's validation result on the same session (Results), and Combined; note which
      engine Auto selected and whether that matches the best validated one (it need not: Auto
      chooses from the calibration alone).

## 4. Things only a person can judge

- [ ] The instructions are clear and in formal British English; nothing asks the camera to be
      above the screen on a phone or tablet.
- [ ] Keyboard only: the whole flow works with Tab, Space, Enter, P and Esc, with a visible focus.
- [ ] A screen reader (VoiceOver or NVDA) announces the screen titles, status messages, errors
      and the cards.
- [ ] Light and dark themes are both legible; the engine colours can be told apart without colour
      vision (the legend also names them).
- [ ] With "reduce motion" switched on, the target does not pulse and the moving dot is skipped,
      with a note.
- [ ] Refusing the camera permission shows how to allow it; withdrawing it during Live stops
      cleanly with a message.
- [ ] "Delete all my data" removes the stored calibrations and sessions (Your data shows none
      afterwards, also after a reload).
- [ ] The exported zip opens in eek-a-gaze with the command in its README.txt.

## Results

| Date | Device · OS · browser | Camera | Host · delegate | Run set (backends) | Live Hz | Validation mean / median per estimator | Selected (reason) | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

Until this table has rows from real devices, the app and its documentation quote no accuracy
figure of their own.
