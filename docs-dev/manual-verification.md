# Manual verification checklist

Checks that need a real camera, a real device or a person, and so cannot run in the headless
test environment (specification §10.6, §14.2.12, §15.2.3, §17.12.4; interface design §10). Under
the house deferral rule they fall to the owner. Everything else (build, unit, simulation, parity
and end-to-end tests with a fake camera, the no-scroll check at every size, the keyboard-only run
and the contrast test) runs in `npm run check:all` and in CI.

**No accuracy figure for this app may appear in the UI or the docs until these checks have been
done and recorded** (anti-fabrication; the app's own validation on each user's device is the only
source of figures). The ranges the app quotes come from published evaluations (specification
Appendix B) and are labelled as such. The game's stars, zones and scores are heuristic.

Run the checks against the live site, <https://eelkedevries.com/eek-a-calibrate/>, after a deploy
(see `docs/deployment.md`). Details → Device shows the live readings, the engine timings and the
run set; *Open diagnostics* there shows the host, delegate, backends and per-stage timings; the
export (Details → Data) records the rest in `session.json`.

## How to record a run

For every run, note in the table at the end (or attach the exported zip):

- device, operating system, browser and version; camera (built-in or USB, its resolution);
- the set-up chosen on the Title (Propped, In hand, Webcam) and the warm-up length;
- the vision host (worker or inline), the landmarker delegate (GPU or CPU) and the WebAssembly
  variant (Diagnostics);
- **frame rate per engine and backend:** the device check's per-engine median times (Details →
  Device → Engine timings), the effective rate (Details → Results), and each engine's backend
  (`tfjs-webgl`, `tfjs-wasm`, `ort-wasm`, `js`);
- the run set the device check chose, and what it left out and why;
- **validation per engine** and for Combined from the Test round: mean, median, central and
  peripheral accuracy, data loss and verdict (Details → Results, own and intersection), with "≈"
  noted where degrees were approximate;
- **Warm-up complete:** stars, zones (columns × rows), marks, the cause line;
- **the selected estimator** and Auto's reason;
- whether screen size and distance were measured, and the measured distance;
- anything that went wrong: messages, pauses (and their reasons in `session.json`), a stalled
  screen, a wrong instruction, a scrollbar.

## 1. Browsers and devices

Desktop, landscape, with a built-in webcam and, where available, a USB one:

- [ ] Chrome (current), Windows or macOS
- [ ] Edge (current), Windows
- [ ] Firefox (current)
- [ ] Safari (current), macOS

Phones and tablets, front camera (§14.2.12). Each in **portrait** and in **landscape**, once with
**Propped** chosen (on a stand or against something) and once with **In hand**:

- [ ] iPhone, Safari (iOS 17 or later, and iOS 26): portrait propped · portrait in hand ·
      landscape propped · landscape in hand
- [ ] Android phone, Chrome: portrait propped · portrait in hand · landscape propped · landscape
      in hand
- [ ] iPad or Android tablet (optional): one orientation, propped

On every phone run, also check:

- [ ] **No screen scrolls** in either direction, on any screen of the game, with the browser bars
      shown and hidden; nothing is cut off.
- [ ] **iOS 26 and `svh`:** the shell fits with the floating bars shown and hidden, nothing sits
      under them, and turning the phone gives "The screen changed" rather than a stretched page.
- [ ] iPhone has no element fullscreen: the warm-up runs in viewport mode, with no page
      scrolling, rubber-banding or text selection during the levels; the browser bars may move
      slightly without stopping a level.
- [ ] Android Chrome enters fullscreen at *Start warm-up* and keeps the orientation locked through
      the warm-up, Free look and the challenge.
- [ ] No bubble, firefly, pip line or corner button lies under the notch, camera cut-out or home
      indicator (the safe area).
- [ ] **Camera side in landscape** (design §4.4): with the camera on the left (`screen.orientation`
      90) the pip line runs along the left edge and the corner cluster sits bottom right, and the
      framed screens put their stage on the left; turned round (270) everything mirrors. Record
      which angle each platform reports for which side.
- [ ] Every action works by touch: tapping a level card starts it; Pause in the corner is easy to
      hit and fades while a bubble is near it; *Exit* in the Pause card leaves the level; "It
      disappeared" in the blind-spot test.
- [ ] The screen does not dim or lock from Play until the game is left.
- [ ] Turning the phone during a level, in Free look and in a round gives "The screen changed" with
      "Turn the phone back, or warm up again"; *Warm up again* starts at Level 1.
- [ ] The camera picture on Get ready is upright and mirrored in portrait and in landscape.
- [ ] iPhone and Android phones use the CPU delegate by default (Diagnostics); Details → Device
      shows plausible face size, centring and head angles; note the effective frame rate. Then
      repeat once with `?delegate=gpu` and record whether the GPU path returns plausible
      landmarks on this phone (the app should switch to the CPU on its own if it does not;
      specification v0.4 §16.1).
- [ ] The game never asks for the screen size or the distance; Details → Device → *Measure screen
      and distance* works if chosen (the blind-spot test asks to turn the phone sideways when the
      screen is too narrow).

## 2. Title, Get ready and the position guard (§17.4, §17.5; design §3)

- [ ] The Title shows a thin bar on the hero card while the face model downloads on a slow
      connection (throttle the network); on a repeat visit, from the cache, it goes almost at
      once, and Get ready shows "Getting ready… n %" while anything is still loading.
- [ ] The chooser starts on Propped on a phone and on Webcam on a computer.
- [ ] **Motion permission (iOS):** Play asks for the camera first and then for motion and
      orientation access; refusing motion changes nothing on screen, and `session.json` records
      `denied`. On Android no prompt appears and the tilt cues work.
- [ ] Refusing the camera shows "Camera blocked" with "Try again" on the Title; allowing it in the
      browser settings and choosing *Try again* opens Get ready.
- [ ] **Thresholds, phone Propped:** Get ready reaches *Ready* at a comfortable distance; the cues
      (closer, back, raise or lower the phone, stand it more upright, tilt it back, hold it
      straight) each appear when provoked and point the right way in the mirrored picture; record
      the distance at which "Move a little closer" stops (every range is heuristic, §17.12.4).
- [ ] **Thresholds, phone In hand:** the steadiness cue tolerates normal hand movement; with the
      phone hand-held and **Propped** chosen, the tip "Prop it on books or a mug" appears once.
- [ ] **Thresholds, webcam:** tilting the laptop lid back and forward gives "Tilt the screen back a
      little" and "Tilt the screen towards you"; sitting too close or far gives the distance cues;
      record the distances.
- [ ] **Hysteresis and timing:** cues do not flicker at a threshold; a new cue waits about 300 ms
      and stays at least a second; *Ready* needs two seconds of everything in range.
- [ ] The phone's tilt reads correctly on both platforms: leaning the top towards you past upright
      gives "Tilt the phone back slightly", lying it back gives "Stand the phone more upright"; in
      landscape the in-plane roll reads level when held level, with the camera on either side.
- [ ] **Auto-pause:** leaving the oval's area, or looking away, during a level pauses it with the
      right headline and "Carries on by itself"; coming back resumes after about a second with
      "Back in place"; after 10 s *Get ready again* (levels) or *Warm up again* (Free look, rounds)
      appears; three pauses in one level give "Let's fix the set-up first".
- [ ] **Steadiness lines** on the level cards ("Nice and steady", "Try to keep your head still",
      "Try to stay in view") match how the previous level went (heuristic).
- [ ] *Ready* gives a short vibration on Android.
- [ ] On a slow device the chip "This device is slow. Close other apps." appears and does not
      block the start.
- [ ] Exported `samples.csv` from a phone has `device_tilt_deg` and `device_roll_deg` filled in;
      from a desktop they are empty.

## 3. The warm-up, Warm-up complete, Free look and the challenge (§17.6–§17.9)

- [ ] **Pilot: the bubble against the ring** (§17.12.4, design §10): on at least one phone and one
      laptop, with the same person, set-up and warm-up length, play the warm-up with the bubble
      (default) and with `?target=ring`, alternating the order over at least three pairs of runs.
      Record accepted frames per target (`targets.csv` and `samples.csv`) and the Test round's
      accuracy for each. **No accuracy figure is published before this pilot; if the bubble is
      worse, a later amendment restores the ring.**
- [ ] Each level card starts by itself after 3 s, on *Start now*, on Space and on a tap anywhere.
- [ ] Pop the dots: the bubble grows in, stays, shrinks to the dot over the sampling window and
      pops between dots; nothing pops early on a slow device (the sampling extends).
- [ ] Follow the firefly: the firefly is easy to follow, with a faint trail and no path ahead.
- [ ] Turn your head: the four arcs fill as the head turns and nods; "Slowly turn your head" and
      "Now nod slowly" appear; with *Limited head movement* (Settings) half the turn fills them.
- [ ] Thorough: "Lean in" comes before the Test round and stores home again.
- [ ] Checking your aim… takes a few seconds, adding "Almost there" after 3 s.
- [ ] Warm-up complete: stars, zones and marks look right for how the Test round went; the cause
      line names a real problem when one was provoked (backlight, darkness, distance, glare, head
      movement); "Rule of thumb · How we judge this" opens Details on that page.
- [ ] Free look: the lit zone follows the gaze; the disc's size looks like the Test round's error;
      it greys out with a dashed edge when the head leaves the warm-up's range; bar and dock fade
      after 3 s and come back on any input.
- [ ] Re-aim (D, or the button): two bubbles; "Your aim was fine" or "Aim fixed"; provoke a large
      shift (move the laptop) and check "Your aim moved a lot" offers *Quick warm-up*, which ends
      on Warm-up complete with new zones.
- [ ] **Challenge tuning** (design §10): play the three rounds several times on a phone and a
      webcam; record pops per zone, median time to pop and whether the dwell per round (1000,
      800, 700 ms), the leaky dwell, the decoy's 600 ms bonk, the drift speed, the Re-aim offer
      (below 50 % over six bubbles), the zone marks (80 % / 50 %) and the star thresholds feel fair.
- [ ] Round complete: the replay shows the gaze trail; "We corrected a small shift." appears only
      after a consistent shift; the best score is kept per zone set across reloads.
- [ ] Leaving fullscreen (Esc twice on a desktop, or the browser's button) during a level and during
      a round gives "The screen changed"; *Warm up again* starts afresh.
- [ ] Skip warm-up: after a reload on the same device and camera, Skip warm-up runs the one-level
      Test round, then a Re-aim, then Warm-up complete; on another camera it explains and warms up
      in full.

## 4. Participants and conditions

With a real participant (the owner is enough) on one desktop and one phone:

- [ ] without glasses, and with glasses (note the glare cue and data loss)
- [ ] lighting: even daylight · a bright window behind · dim evening light · one lamp from the
      side (do the light cues react sensibly?)
- [ ] distance on the desktop: about **40 cm**, **60 cm** and **80 cm** (one warm-up each;
      measure screen and distance once, then compare the reported distance with a tape measure)
- [ ] head movement: sit still for one run; move and turn the head naturally in Free look in
      another (does the disc grey out when it should, and does Re-aim help?)
- [ ] a Thorough warm-up at two distances
- [ ] a session of at least 10 minutes of Free look and challenge rounds, accepting the timed
      Re-aim offers

## 5. Performance and engines

- [ ] **A low-end laptop** (for example four years old, integrated graphics): the device check's
      run set, the slow-device chip, the frame rate (Details → Results).
- [ ] **On a real GPU, BlazeGaze reports `tfjs-webgl`** (Diagnostics; headless tests can only show
      `tfjs-wasm`), **its median time is within its 25 ms budget**, and **the lab's eye strip shows
      both eyes**, upright and not mirrored the wrong way (§15.2.3).
- [ ] **Peekr's per-frame time against its 15 ms budget** (Diagnostics, "Run each engine on 10
      frames"), and both of its eye crops show an eye.
- [ ] `?force=cpu` on a desktop: BlazeGaze on `tfjs-cpu` finishes "Run each engine on 10 frames"
      (about 1.5 s a frame) without the run being given up.
- [ ] Each engine's validation result on the same session (Details → Results), and Combined; note
      which engine Auto selected and whether that matches the best validated one (it need not:
      Auto chooses from the calibration alone).

## 6. Things only a person can judge

- [ ] The copy is clear, in formal British English, without em dashes, and never says or implies
      that looking pops anything during the warm-up (design §7); nothing asks the camera to be
      above the screen on a phone or tablet.
- [ ] **Contrast on the grey** (design §10): on real screens, in a light and in a dark room, the
      pips, arcs, zone outlines, the lit zone, the bubble's edge, the chips and the cards are easy
      to see. The token pairs are checked in `tests/unit/a11y-contrast.test.ts`; the marks it lists
      under 3 : 1 (the remaining pips, unlit zone outlines, the bubble's ghost ring, the lit zone's
      fill, the firefly's light) each sit beside a stronger cue, and this is where to judge whether
      that is enough.
- [ ] Light and dark themes (Details → Settings) are both legible; the grey stage is the same in
      both; the engine colours in Details can be told apart without colour vision.
- [ ] A screen reader (VoiceOver or NVDA) announces the screen titles, the level and round cards,
      the cue on Get ready (once, politely), the auto-pause (assertively), the stars and the zone
      maps.
- [ ] **Reduced motion** end to end: with "reduce motion" switched on, the bubbles do not grow,
      shrink or burst, the firefly has no trail, the Follow card offers *Skip this level*, and
      nothing pulses.
- [ ] **Read instructions aloud** end to end (Details → Settings): each new instruction on Get
      ready and each card is spoken in a British voice only where the device has one locally,
      never more than once every 2.5 s, and *Ready* adds "Tap anywhere to start"; without a local
      voice the setting is unavailable.
- [ ] Withdrawing the camera permission during Free look stops cleanly with a message.
- [ ] "Delete all my data" (the foot of every Details tab) asks first, then removes the stored
      warm-ups, sessions, settings and best scores (Details → Data shows none afterwards, also
      after a reload).
- [ ] The exported zip opens in eek-a-gaze with the command in its README.txt.

## Results

| Date | Device · OS · browser | Camera | Set-up · length | Host · delegate | Run set (backends) | Hz | Test round mean / median per estimator | Stars · zones | Selected (reason) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

Until this table has rows from real devices, the app and its documentation quote no accuracy
figure of their own.
