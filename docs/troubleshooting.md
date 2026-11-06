# Troubleshooting

## "Camera blocked" on the Title

The browser refused the camera. Allow it for this site in the browser's settings (the camera
icon in the address bar, or the site settings on a phone), then choose *Try again*. Nothing is
started and nothing leaves the device until you do.

Other camera messages, on Get ready or in Diagnostics:

| Message | What to do |
|---|---|
| "The camera needs a secure connection" | Open the page over `https://`. |
| "No camera found" | Connect a camera, then try again. |
| "Camera in use by another application" | Close the video-call or camera program, then try again. |
| "The selected camera is no longer available" | Choose another camera in Details → Settings. |
| "The camera stopped" | The camera was disconnected or the permission withdrawn; start it again. |

If the camera offers no common resolution, the app asks for any picture the camera can give;
it never reports such a camera as missing. If the browser cannot run the game at all, the Title
says so in place of Play: try Chrome, Edge or Safari 17 or later.

## Get ready does not reach *Ready*

Get ready shows one instruction at a time, the most important first, and the row at the bottom
says which of *Distance*, *Position* and *Light* still needs work. Every range behind them is
heuristic (design §3.2 in the specification's background). The usual remedies:

| Cue | What to do |
|---|---|
| "Getting ready… n %" | The face model is downloading (first time only). |
| "Uncover the camera" / "Too dark. Add some light" | The picture is black or very dark. |
| "Point the camera at your face" / "Sit facing the camera" | No face is found. |
| "Only one face, please" | A second face is in view. |
| "Move into the oval" / "Centre your face in the oval" | Part of the face is outside the picture, or off centre. |
| "Move a little closer" / "Move back a little" | The face is too small or too large in the picture. On a phone held upright about 30–40 cm is typical; on its side 40–50 cm; with a webcam about an arm's length (all heuristic). |
| "Stand the phone more upright" / "Tilt the phone back slightly" | The phone is too flat, or leaning forward (from the motion sensors). |
| "Raise the phone to eye level" / "Lower the phone slightly" | The camera looks up or down at you; with a webcam, tilt the screen. |
| "Hold the phone straight" / "Keep your head level" | The phone or your head is rotated. |
| "Turn to face the screen", "Lower (Raise) your chin a little" | Your head is turned or tilted. |
| "Add light in front of you" / "Avoid bright light behind you" / "Soften the light on your face" | Face too dark, backlit, or too bright. |
| "Tilt your glasses down slightly" | Glare on glasses near the eyes. |
| "Make sure we can see your eyes" / "Keep your eyes open" | Hair, a cap or closed eyes hide the eyes. |
| "Hold the phone steady" / "Hold still for a moment" | The phone or your head is moving. |

If *Ready* cannot be reached, **Start anyway** appears after 20 seconds while your face is in
view; you may then unlock fewer zones. "Make the window larger to play" replaces the action
when the window is too small to show the bubbles (its short side under 280 px).

## The game pauses by itself

The position guard pauses a level, Re-aim or a round when you move out of position or your face
is lost for a moment (in the warm-up after half a second; in Free look and the challenge after
a second). The card says what to do ("Move back into view", "Look back at the screen", "The
phone has moved", …) and the game **carries on by itself** once you have been back in place for
a second. The dashed oval in the card's camera preview marks where you were at *Ready*. After 10
seconds the card also offers to get ready, or to warm up, again. A level that pauses three times
suggests fixing the set-up first, on Get ready.

The small sign in the corner (and, in Free look and the challenge, a short word beside it such
as "A little closer") warns before it comes to a pause.

## "The screen changed"

A level, Re-aim or a round ends when the screen leaves fullscreen, the window changes size, the
page is zoomed, the display scaling changes, the phone is turned or the camera changes its
picture size. The calibration holds only for the screen layout it was made on, so *Warm up
again* starts afresh from Level 1. After a turn of the phone the card says "Turn the phone back,
or warm up again".

## Warm-up complete says "Warm-up didn't work", or unlocks one zone

- Follow the tip on the screen: it names the first problem found in the warm-up (the face often
  lost, light behind you, too dark, much head movement, glare, too far; heuristic).
- Use the Standard or Thorough warm-up (Details → Settings): the firefly and the head turns help
  the mapping.
- Warm up again: results vary from one session to the next (between runs, about 4.6° in one
  study; Chen and Brat 2026).
- Webcam eye tracking is limited: about 2–4° off target in good conditions, often worse (see
  [methods](methods.md)). One or two zones may be all a set-up gives.

## The lit zone or the bubbles do not follow your eyes

Your aim drifts as you move. Choose **Re-aim** (D) in Free look. If the shift is too large to
correct, a **Quick warm-up** is offered. In Free look the disc greys out, with a dashed edge,
while your head is outside the range seen during the warm-up: return to where you sat.

## A slow device

The device check on Get ready leaves out the learned engines when they need more than their
time per frame (BlazeGaze 25 ms, Peekr 15 ms; heuristic) or when the whole frame takes longer
than 45 ms. Details → Device → Engine timings shows what ran, what was left out and why, and
any engine that could not load. Closing other tabs and programs helps, and so does a power
supply on a laptop. To run engines regardless, choose them in Details → Settings (or with
`?engines=`). On a slow device the warm-up's levels take a little longer: a bubble's sampling
is extended until enough frames have been seen.

## Device motion on a phone

On an iPhone, *Play* asks for the motion sensors after the camera. They let the guard say
"Stand the phone more upright"; refusing them changes nothing else, and the camera picture still
covers the phone's height and angle. To allow them later, reload the page and choose Play again.
The readings stay on the device; they are only exported, as `device_tilt_deg` and
`device_roll_deg`, when you export a session.

## Absurd readings, or the face outline jumps

Some phone graphics chips run MediaPipe's GPU path without reporting an error but return
corrupt face landmarks: the readings in Details → Device then show impossible face sizes or
wildly changing head angles. Phones and tablets therefore use the CPU path by default, and the
app discards implausible landmark frames and switches to the CPU path on its own after a few of
them. If it still happens, add `?delegate=cpu` to the address (for example
`https://eelkedevries.com/eek-a-calibrate/?delegate=cpu`). `?delegate=gpu` forces the GPU path,
for comparison. Diagnostics (Details → Device → *Open diagnostics*) shows which path runs.

## Degree values show "≈"

The screen size or the viewing distance was not measured, so typical values are assumed.
Pixels and percentages of the screen are exact, and the game does not depend on degrees. Use
Details → Device → *Measure screen and distance*; nothing needs to be warmed up again.

## The blind-spot test fails

- Cover your **right** eye and look at the black square with your **left** eye, not at the
  moving dot.
- Answer the moment the dot vanishes; it reappears further left, which you can ignore.
- Results outside 30–120 cm, or answers that differ by more than 15 % of the distance, are
  rejected and the test is repeated once. You can always skip it.

## Skip warm-up is not offered, or the saved warm-up is refused

A stored warm-up is offered only on a screen with the same size, pixel ratio and orientation,
and once the camera is open it must also match the camera at the same resolution. It must pass a
6-bubble Test round with a verdict of at least "acceptable"; otherwise Warm-up complete says
"Your saved warm-up no longer fits" and a full warm-up is needed. If the browser does not allow
storage (some private modes), warm-ups are kept for that visit only.

## The export says a file was left out

`README.txt` in the zip names every file that could not be written, with the reason. Events,
for example, need a validation with valid samples to set their threshold; geometry needs a
reference viewing distance from a warm-up. The other files are complete.

## Read instructions aloud is greyed out

It uses only voices that run on the device (`localService`), in British English, so that no text
is sent to a speech service. Without such a voice the setting is unavailable.
