# Using eek-a-calibrate

eek-a-calibrate calibrates and validates webcam eye tracking in the browser, at
<https://eelkedevries.com/eek-a-calibrate/>. Everything runs on your device: the camera picture
never leaves the browser tab, and no image or video is ever stored (see [privacy](privacy.md)).

It works on desktop and laptop computers and on current phones and tablets (Android Chrome,
iOS and iPadOS Safari 17 or later), with the front camera, in portrait or landscape.

## The default flow

1. **Welcome.** Read what to expect, check that the browser has what the app needs, choose a
   preset and, optionally, enter a participant and a session label for the export.
2. **Camera.** Allow the camera. Adjust your position and lighting until every check is fine
   for two seconds. The gaze engines load in the background, and a short device check times
   them on 30 frames.
3. **Calibration.** Look at the dots. The screen goes fullscreen (on an iPhone the page fills
   the browser window instead).
4. **Validation.** Look at a second set of dots, which are never used for calibration.
5. **Results.** Accuracy, precision and data loss for every engine and for their combination.
6. **Live gaze.** Your gaze as a dot on the screen, with recording and drift checks.
7. **Your data.** Export the session as a zip file, and manage what is stored on the device.

Screen size and viewing distance are **not** steps of this flow. Calibration needs neither;
measuring them only turns the degree values from approximate into exact. They are offered as
one optional action, "Measure screen and distance (optional; makes degree values exact)", under
*Advanced* on the welcome page, on the results page and on the Your data page. Measuring them
after calibration does not invalidate anything: the pixel results stay the same and the degree
values are recomputed.

## Presets

| Preset | Calibration | Validation | Approximate time |
|---|---|---|---|
| Quick | 9 dots | 6 dots | 35 s |
| Standard (default) | 13 dots, a 16 s moving dot, guided head movement at 5 locations | 12 dots | 100 s |
| Thorough | Standard, then the 13 dots again about 10 cm closer | 12 dots | 3 min |

The times are design values of the protocol, not measurements.

## Engines

By default (**Auto**) every engine that is fast enough on the device is calibrated, and the
estimator used afterwards is chosen from the calibration data alone. Under *Advanced* you can
choose the engines yourself; they then all run, however slow, and the device check only
reports their timings. See [engines](engines.md).

## The camera checks

The checks use heuristic thresholds (Appendix A of the specification): a face is found; the
face is 15–60 % of the picture wide; it is centred; its brightness is 60–200 (of 255); it is
not darker than the background; there is little glare near the eyes (at most 2 % of the eye
area); the camera delivers at least 20 frames per second; and you face the screen (yaw and
pitch within 15°). Once the distance has been measured on a desktop or laptop, it should lie
between 45 and 85 cm (heuristic). Every check must be fine for two seconds before *Continue to
calibration* is enabled. If a check cannot be satisfied (a dark room, say), *Continue anyway*
appears after 20 seconds; the results may then be less accurate.

Say whether you wear glasses or contact lenses. Reflections in glasses reduce accuracy
(Zhang, Sugano and Bulling 2019); tilting the glasses or the screen slightly often removes
them.

## The device check

Each engine is timed on 30 frames. With Auto, BlazeGaze is kept if its median time is at most
25 ms per frame and Peekr if it is at most 15 ms. While the whole frame (face landmarker,
preparation and engines) still takes longer than 45 ms, the slowest of these two is left out.
The geometric and eye-pixel engines always run. If a frame takes longer than 66 ms (80 ms on a
phone or tablet), a warning appears. These limits are heuristic.

## On a phone or tablet

Prop the phone up, or hold it steadily at eye level, about 30–40 cm from your face
(heuristic), and keep the same orientation throughout. The camera may be at the top or at the
side of the screen. Every key has a touch equivalent: tap an instruction card to continue; use
the small *Pause* and *Abort* buttons in the top corners during the dots; tap *It disappeared*
in the blind-spot test; use the buttons along the bottom in Live. The screen is kept awake
during camera setup, calibration, validation and Live where the browser allows it.

A calibration holds only for the orientation and window size it was made in. Rotating the
device stops a calibration, and in Live it pauses the gaze until you rotate back (or
recalibrate).

## Live gaze

| Key | Touch | Action |
|---|---|---|
| R | Record | Start or stop a recording (`live-001`, `live-002`, …) |
| M | Marker | Add a numbered marker to the recording |
| D | Drift check | Run a drift check |
| Esc | Exit | Leave live gaze |

The dot is smoothed for display (One Euro filter, with a short hold during blinks); recorded
and exported data are not. *Unfiltered* shows the unsmoothed position, *Engines* adds a small
dot per engine, and *Areas* shows the areas-of-interest demo with the grid size advised by your
validation. The ring around the dot shows the advisory confidence. The dot turns grey, with
the message "Move back to where you were during calibration", while your head is outside the
range seen during calibration. The estimator can be switched at any time.

### Drift checks and quick recalibration

A drift check shows two dots (the centre and one other location) and measures how far the
gaze has shifted. If the shift is at most 2°, or 1.5 times the validation accuracy if that is
larger, it is corrected; otherwise a quick recalibration is offered (5 dots, then a validation
on 6 dots). A drift check is prompted every 5 minutes (change it with `?driftEveryMin=`; 0
turns the prompts off) and is forced after a camera, screen or backend change, after a
restart of the vision pipeline and after restoring a stored calibration.

## Stored calibrations

When you start Live after a validated calibration, the calibration is stored on the device
(up to eight; the least recently used leaves first). The camera page and the Your data page
offer a stored calibration made with the same camera on the same screen. It can be used only
after a validation on 6 dots gives a verdict of at least "acceptable". Some browsers change the
identifier of a camera between visits; a stored calibration then also matches a camera of the
same name and frame size, and the validation decides whether it still applies.

## Query parameters

Parameters pre-fill the settings; they may be placed before the hash or after it
(`#/live?pid=P01`).

| Parameter | Values | Effect |
|---|---|---|
| `pid`, `session` | text (64 characters at most) | Labels for the export |
| `preset` | `quick`, `standard`, `thorough` | The preset |
| `engines` | `auto`, `all`, or a comma-separated list | The engines |
| `select` | `auto` or an estimator id | The estimator used after validation |
| `seed` | integer | The seed of every shuffled order (default: the clock) |
| `driftEveryMin` | number ≥ 0 | Minutes between drift prompts (0: off) |
| `host` | `worker`, `inline` | The vision host |
| `force` | `cpu` | Run BlazeGaze on the CPU |
| `e2e`, `speed` | `1`, number ≥ 1 | Test mode only |

## Measuring screen and distance

- **Screen:** hold a bank card (85.60 × 53.98 mm) against the screen and resize the outline
  until it covers the card, or enter the diagonal in inches, or skip. The result is
  remembered for the screen.
- **Distance:** the blind-spot test. Cover your right eye, look at the black square with your
  left eye, and press Space (or tap *It disappeared*) when the red dot vanishes, five times.
  Then look at the screen with both eyes open for two seconds (a little longer on a slow
  device, until ten frames have been measured) while the camera measures your irises. The result is remembered for the camera and its resolution.

See [methods](methods.md) for the formulae and [troubleshooting](troubleshooting.md) if
something does not work.
