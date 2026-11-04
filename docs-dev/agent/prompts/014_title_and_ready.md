# Task: Title, Get ready and the position guard (v0.5)

## Goal

Build the game's front door and its ready check: the Title with the set-up chooser and Play,
permission priming, face-model progress from the first byte, the position guard as a pure,
tested core with its on-screen forms (Get ready, the compact glyph, the auto-pause overlay),
the phone tilt check from device motion, and the optional haptics, sound and speech.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs after 013. The glyph and overlay are built and tested here; 015 and 016 place them
in the levels, Free look and the challenge.

## Owns

- `src/app/screens/{title,ready}.ts`, `src/app/strings/{title,ready,guard}.ts`.
- `src/core/position/{signals,thresholds,cues,guard,home,tilt}.ts` (new, DOM-free) and
  `tests/unit/position-*.test.ts`.
- `src/platform/motion.ts` and `src/platform/feedback.ts` (new), with unit tests for their pure
  parts.
- `src/app/components/{setupChooser,levelMap,faceGuide,cueCard,statusRow,holdRing,positionGlyph,pauseOverlay}.ts`
  (new).
- `src/app/session.ts` (host start at Title load, camera on Play, wake lock from Play, the
  `setup` choice and motion state for `session.json`), `src/app/state.ts` (`Settings.setup` and
  the sound and speech defaults).
- `src/vision/protocol.ts` and `src/vision/host.ts`: the additive `hooks` parameter of §17.11
  only.
- `src/core/types.ts`: the optional `RecordedFrame` tilt fields of §17.11 only;
  `src/core/protocol/labelling.ts` (stamping them in `FrameRecorder`);
  `src/core/export/samplesCsv.ts` and the two values' path through the export assembly in
  `src/app/screens/data.ts`; `tests/unit/export-samples.test.ts`; `docs/export-format.md` (the
  two columns).
- `tests/e2e/ready.spec.ts` (new) and the Title and Get ready rows of `tests/e2e/no-scroll.spec.ts`.

## Context

- `specification.md` v0.5 §17.2 (routes, guards, fullscreen span), §17.3, §17.4 (Title and Get
  ready), §17.5 (the position guard, device motion, haptics, sound, speech), §17.10.2 (tilt
  covariates), §17.11 (contracts); §4.2 (host start-up), §4.3 (face front end), §4.10 (head
  range), §4.15 (profiles), §7 row 1 (device probe and run set, unchanged), §14.2 (device class,
  wake lock, safe areas), §16.1, Appendix A (`SETUP`, `PROBE`, `MOBILE`).
- `interface-design-v2/design-spec.md`: §2.4 (Title), §2.5 (Get ready), §2.16 (failures), §3
  in full (signals, per-class ranges, home, priority order, visual language, cue card and status
  row, glyph, overlay, tilt, haptics, sound, speech, accessibility), §4.3–§4.6, §6.1 (icons,
  chooser icons, pictograms, badges, glyph), §7 (copy).
- Boards: `canvas/Main.dc.html`, `canvas/desktop-title.dc.html`, `canvas/phone-ready.dc.html`,
  `canvas/desktop-ready.dc.html`, `canvas/position-signals.dc.html` (every guard state), with
  their `png/` renderings and `briefs/`.
- Existing logic to reuse, not copy: `core/face/{quality,eyeMeasures,headPose,blink}.ts`,
  `components/qualityMeter.ts` (`HoldGate`), `screens/camera.ts` (`decideRunSet`,
  `matchesCurrentSetup`, `setupRecord`, the probe), `platform/presentation.ts`
  (`holdWakeLock`, `startPresentation`), `platform/storage.ts` (`listProfiles`).

## Deliverables (required changes)

1. **Title** (design §2.4; boards `Main`, `desktop-title`): wordmark and Details in the top bar;
   "Pop with your eyes" and its pitch; the hero card with the emblem and the level map (Pop ·
   Follow · Turn · Test · Challenge, following the warm-up length); the set-up chooser (§17.4.1:
   a radio group of three `.choice` tiles with arrow-key navigation and accessible names,
   pre-selected from the device class); **Play** (primary, play icon); the meta line (time by
   warm-up length, "Nothing is uploaded"). The fit guard drops the emblem when the hero is under
   160 px, then the map's names. **Skip warm-up** (secondary) appears only when a stored
   calibration exists for this screen; whether it matches the camera is checked after Play, and
   a mismatch falls back to the full warm-up with one line of explanation. The Skip path itself
   is run by 015 and 016; here it sets the session's warm-up mode to `restore`.
2. **Play** (§17.4.2): camera permission after the tap (priming); on iOS
   `DeviceMotionEvent.requestPermission()` second, in the same gesture; refusal of motion changes
   nothing visible (record `granted`, `denied` or `unavailable`). "Camera blocked" with the
   browser-settings guidance and "Try again" when the camera is refused (design §2.16). The wake
   lock from Play until the player leaves the game; Web Audio resumed on this tap.
3. **Model progress from the first byte** (§17.4.3, §17.11): `createVisionHost(cfg, prefer,
   hooks)` registers `hooks.onProgress` before `init` starts (worker and inline paths, and the
   inline fallback after a worker failure); `session.ts` starts the vision host when the Title
   loads, without the camera, and opens the camera on Play. The Title shows a slim determinate
   progress bar on the hero card (an accessible label, no extra words); Get ready shows
   "Getting ready… 62 %" (cue rank 0) while the model and engines load. This fixes the known
   issue that no download progress was shown.
4. **The position core** (`src/core/position/*`, §17.5.1, design §3.1–§3.4, §3.7, §3.8): signals
   from `FrameResult` and the face front end (face scale as inter-ocular distance ÷ cos(yaw)
   cross-checked with the iris, divided by the frame's long side; iris diameter; box margins to
   the visible region; centring; yaw, pitch, roll; face luma, backlight, glare; eyes open with
   the 1.5 s rule; head speed; frame black; frame rate) with the stated smoothing; the per-class
   ranges in `thresholds.ts` (phone portrait, phone landscape, tablet, webcam; In hand
   relaxations; every value marked heuristic); hysteresis and timing; the priority order of
   design §3.4 with the single-instruction rule and the status-row grouping; the hold timer
   (`SETUP.holdMs`, ÷ speed in test mode); *home* (medians over the hold, re-latchable); the
   tolerances around home; the calibrated-head-range check of §4.10 after a fit; the grades
   *drifting* and *out* with the thresholds per context (§17.5.3); the nudge words and the
   overlay headline relative to home. "Several faces" (rank 5) is active only if the landmarker
   already reports more than one face; do not change its configuration. Unit tests cover the
   priority order, hysteresis, timing, home, grades and each class's ranges.
5. **Device motion** (`platform/motion.ts`, pure maths in `core/position/tilt.ts`, §17.5.4,
   design §3.9): gravity → θ = acos(|g_z|/|g|) and roll = atan2(g_x, g_y) corrected by
   `screen.orientation.angle`, a 300 ms low-pass; rotation-rate steadiness and the hand-held
   detection (Propped only, a tip once); `DeviceOrientationEvent` as a fallback; nothing when
   unavailable. Unit tests for the maths, including the upright gimbal case.
6. **Get ready** (`#/ready`, design §2.5, §3.5, §3.6; boards `phone-ready`, `desktop-ready`,
   `position-signals`): the mirrored, cover-fitted preview (contain when the oval would not fit,
   design §3.5) under the grey veil with the oval hole; the target oval sized from the class's
   target face fraction; the live outline and eye dots; one directional cue; halos on every
   stroke; the oval states (searching, adjust, holding with the ring, ready with the badge); the
   cue card (`role="status"`, tip after 4 s); the status row; the dock with its action slot
   (Start warm-up disabled, then enabled; "Start anyway" with "You may unlock fewer zones" after
   20 s with a face; "Make the window larger to play" under a 280 px short side); the slow-device
   chip below 15 Hz; the 20 ms haptic and *home* on *Ready*. The engines load and the device probe
   with the run-set rule of §7 row 1 runs silently once a face is present; **Start warm-up** needs
   *Ready* (or "Start anyway"), the engines and the probe. Its tap starts the presentation
   (`startPresentation`, §17.2.4) and goes to `#/warmup`; until 015 lands it goes to the legacy
   `#/calibrate` instead. Layouts for phone portrait, phone landscape (cue on the camera side) and
   desktop (bottom-centre dock).
7. **Glyph and overlay** (`positionGlyph.ts`, `pauseOverlay.ts`; design §3.7, §3.8; board
   `position-signals`): the 40 px glyph in Good, Drifting and Lost (eye dots relative to home,
   amplified × 3), with its `aria-label`; the optional nudge pill; the overlay with the scrim, the
   card at the camera edge, the small mirrored preview with the dashed ghost of home and the live
   outline, one headline, "Carries on by itself", Exit, and the extra secondary after 10 s;
   `role="alertdialog"`, focus moved to it, the first headline assertive and later ones polite;
   the resume rule ("Back in place"). A controller (`createPositionGuard(capture, context)`)
   gives 015 and 016 one source of guard state, pause and resume events. Test hook:
   `__eek.guard()` (state) and, in test mode, forcing a state for layout tests.
8. **Haptics, sound, speech** (`platform/feedback.ts`, §17.5.5, design §3.10): `vibrate` patterns
   (20 ms Ready, [30, 60, 30] pause, 15 ms pop) where supported; Web Audio tones made in the page
   (pop, pause two-tone, chime), low volume, off on Get ready; speech through `speechSynthesis`
   with `en-GB` and only `localService` voices, at most once per 2.5 s, unavailable without such
   a voice. Defaults in `state.ts` (sound on, speech off); the Settings UI comes in 017.
9. **Tilt covariates** (§17.10.2, §17.11): `RecordedFrame.deviceTiltDeg` and `.deviceRollDeg`
   stamped by `FrameRecorder` from the motion reading nearest the capture time (null without
   one); `samples.csv` gains `device_tilt_deg,device_roll_deg` after the per-engine columns;
   byte-identical output still holds; `docs/export-format.md` documents them. `session.json`
   records `setup` and the motion permission state.
10. **Tests.** `ready.spec.ts`: the Title renders and its chooser works by keyboard; Play opens the
    camera and `#/ready`; download progress was reported (counted through a test hook in a fresh
    context); the cue and the status row appear with the fake camera; Start warm-up or Start
    anyway becomes available within the (speed-divided) time limit; a refused camera shows
    "Camera blocked" and "Try again" (in its own context, as `failures.spec.ts` does).
    `no-scroll.spec.ts` gains the Title (first run, with Skip warm-up) and the Get ready states
    (loading, searching, adjust, holding, ready, start anyway) and the overlay, through
    fixtures.

## Do not implement

- The warm-up levels, the HUD placement of the glyph, and Warm-up complete (015); Free look,
  Re-aim and the challenge (016); the Settings UI and IndexedDB v2 (017); removal of the legacy
  camera screen (018).
- Any change to frame acceptance, labels or gating (§17.5.2), to the landmarker's
  configuration, to `constants.ts` or `package.json`, or to contracts beyond §17.11's tilt fields
  and host hooks.

## Acceptance criteria

The task is complete when:
- Title and Get ready match their boards in layout, copy and states, and pass `no-scroll.spec.ts`
  at the five sizes;
- download progress is visible from the start of the model download, before and after Play;
- the position core's unit tests pass and cover every rank of design §3.4;
- device motion is optional, never blocks, and the tilt values reach `samples.csv`;
- `ready.spec.ts` and every existing e2e spec pass; `npm run check` passes;
- the report notes the two additive contract changes (§17.11).

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
