# Privacy

**Everything runs on your device; nothing is uploaded; no images are stored.**

## The camera picture

- The camera picture is analysed inside the browser tab: face landmarks, iris positions and the
  engines' features are computed on the device, in a Web Worker or on the page itself.
- No image or video is ever stored, exported or sent anywhere. What is kept are numbers derived
  from the picture (head pose, iris diameter, the engines' features), and only in memory unless
  you choose otherwise (below).

## Device motion and speech

- On phones and tablets the app reads the motion sensors (gravity and rotation rate) to tell
  how upright and how steady the phone is, for the position guard's advice. On an iPhone it asks
  for permission after the camera; refusing it changes nothing else. The readings stay in the
  browser tab. They are exported only as two columns of `samples.csv` (`device_tilt_deg`,
  `device_roll_deg`) when you export a session, and the permission's state goes into
  `session.json`.
- "Read instructions aloud" uses the browser's speech synthesis with **only voices that run on
  the device** (`localService`), so that no text is sent to a speech service. Without such a
  voice the setting is unavailable.
- Sounds are generated in the page; no audio file is fetched.

## No network traffic

- Every runtime, model and font file is served from this website under a versioned path;
  nothing is fetched from a content-delivery network, a model host or a font service.
- The server sends a Content Security Policy with `connect-src 'self'`, so the page cannot open a
  connection to any other site, and the app sends nothing to this site either: it only
  downloads its own files.
- The face landmarker is pinned to `@mediapipe/tasks-vision` 0.10.35, because version 1.x
  sends usage metrics to Google.
- The build is checked for URLs of other hosts (`scripts/verify-assets.mjs`), and the
  end-to-end tests check that every request stays on this origin.

## What is stored on the device

The browser's IndexedDB database `eek-a-calibrate` (version 2) can hold five kinds of data:

| Store | Contents | When |
|---|---|---|
| `geometry` | The screen scale per screen (`screen W×H@dpr`), and the blind-spot focal length per camera and frame size | When you measure them |
| `profiles` | Up to eight warm-ups: the fitted mappings (numbers), the head range, versions, the camera's name, and a validation summary | When Free look or the challenge first opens after a scored warm-up |
| `sessions` | Session summaries and validation reports; per-frame features only if you choose to store them | From Free look and the challenge, or when you choose to store a session |
| `prefs` | Your settings: theme, sound, read aloud, warm-up length, set-up choice, Limited head movement, Expert mode, engines, glasses, camera | When you change a setting |
| `scores` | The best challenge score for each set of zones (a 1 × 2 board is never compared with a 3 × 2 one) | After a round |

The camera is identified by the first 12 hexadecimal characters of the sha256 of the browser's
device identifier, and by its name. Participant and session labels are stored with profiles and
summaries.

If the browser does not allow storage (some private modes) or runs out of space, the app says
so and keeps the data in memory for that visit only.

The database belongs to the origin `https://eelkedevries.com`; the address with `www.` is a
different origin with its own storage.

## Deleting your data

"Delete all my data", at the foot of every tab of the Details sheet, asks for confirmation, then
empties and deletes the database (every store above, settings and best scores included) and
clears the session in memory. Details → Data lists what is saved on this device.

## Exports

An export is a zip file you download (see [export format](export-format.md)). It contains no
images and no face landmarks. The optional `dataset.json`, off by default, holds the derived
per-frame features and labels for offline refitting. What happens to an export after the
download is up to you.
