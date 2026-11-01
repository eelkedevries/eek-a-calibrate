# Troubleshooting

## The camera does not start

| Message | What to do |
|---|---|
| "The camera needs a secure connection" | Open the page over `https://`. |
| "Camera permission denied" | Allow the camera for this site in the browser's settings (the camera icon in the address bar), then try again. |
| "No camera found" | Connect a camera, then try again. |
| "Camera in use by another application" | Close the video-call or camera program, then try again. |
| "The selected camera is no longer available" | Choose another camera in the picker. |
| "The camera stopped" | The camera was disconnected or the permission withdrawn; start it again. |

If the camera offers no common resolution, the app asks for any picture the camera can give;
it never reports such a camera as missing.

## The camera checks do not all turn fine

The thresholds are heuristic. Typical remedies:

- **Face size:** move closer or further away. On a phone, about 30–40 cm (heuristic).
- **Face brightness and backlight:** light your face from the front; avoid a window or lamp
  behind you.
- **Glare:** tilt your glasses or the screen slightly, or move the light source.
- **Frame rate:** cameras lower their frame rate in poor light; add light, and close other
  programs that use the camera or the processor.
- **Facing the screen:** sit square to the screen, with the camera at about eye level.

If a check cannot be met, *Continue anyway* appears after 20 seconds. The results may then be
less accurate, and the validation will show by how much.

## The device check leaves out engines, or warns that the device is slow

The learned engines are left out when they need more than their time budget per frame
(BlazeGaze 25 ms, Peekr 15 ms; heuristic) or when the whole frame takes longer than 45 ms.
Fewer engines keep the frame rate high. Closing other tabs and programs helps; so does a
power supply on a laptop. To run engines regardless, choose them under *Advanced* on the
welcome page (or with `?engines=`). The Diagnostics page (`#/lab`) shows which backend and
delegate each part uses and how long each stage takes.

## Calibration stops

Calibration stops when the screen leaves fullscreen, the window changes size, the page is
zoomed, the display scaling changes, the device is rotated or the camera changes its picture
size. A calibration holds only for the screen layout it was made in, so start it again once
everything is as you want it. It pauses (and resumes by itself) when your face is not visible
for a moment, and when the page is hidden.

## The results say "not tracking" or "poor"

- Check the lighting and your position (see above), and keep your head still during the
  fixation dots.
- Use the Standard or Thorough preset; the moving dot and the head movement help the mapping.
- Try again: results vary from session to session (between runs, about 4.6° in one study;
  Chen and Brat 2026).
- Webcam eye tracking is limited: about 2–4° off target in good conditions, often worse (see
  [methods](methods.md)).

## Degree values show "≈"

The screen size or the viewing distance was not measured, so typical values are assumed.
Pixels and percentages of the screen diagonal are exact. Use "Measure screen and distance" on
the results or Your data page; nothing needs to be recalibrated.

## The blind-spot test fails

- Cover your **right** eye and look at the black square with your **left** eye, not at the
  moving dot.
- Answer the moment the dot vanishes; it reappears further left, which you can ignore.
- Results outside 30–120 cm, or answers that differ by more than 15 % of the distance, are
  rejected and the test is repeated once. You can always skip it.

## Live gaze greys out or pauses

- **Grey dot, "Move back to where you were during calibration":** your head is outside the
  range of pose, distance or position seen during calibration. Return to where you sat.
- **"Live gaze paused":** the screen layout changed (fullscreen left, window resized, device
  rotated). Restore it and choose *Resume*; a drift check follows.
- **The dot drifts away over time:** run a drift check (D). If the drift is too large, a quick
  recalibration is offered.

## A stored calibration is not offered, or is refused

A stored calibration is offered only for the same camera at the same resolution, on a screen
with the same pixel ratio and orientation. It must pass a validation on 6 dots with a verdict
of at least "acceptable"; otherwise calibrate again. If the browser reports that storage is not
available (some private modes), calibrations are kept for that visit only.

## The export says a file was left out

`README.txt` in the zip names every file that could not be written, with the reason. Events,
for example, need a validation with valid samples to set their threshold; geometry needs a
reference viewing distance from a calibration. The other files are complete.

## Nothing works in this browser

The welcome page lists what the browser offers. A secure connection and camera access are
required. Without WebAssembly SIMD, Peekr cannot run; without WebGL 2, BlazeGaze runs on the
slower WebAssembly backend; without module workers or OffscreenCanvas, the vision pipeline runs
on the page instead of in a worker; without fullscreen, calibration fills the browser window.
