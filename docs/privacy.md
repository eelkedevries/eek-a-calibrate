# Privacy

**Everything runs on your device; nothing is uploaded; no images are stored.**

## The camera picture

- The camera picture is analysed inside the browser tab: face landmarks, iris positions and the
  engines' features are computed on the device, in a Web Worker or on the page itself.
- No image or video is ever stored, exported or sent anywhere. What is kept are numbers derived
  from the picture (head pose, iris diameter, the engines' features), and only in memory unless
  you choose otherwise (below).

## No network traffic

- Every runtime and model file is served from this website under a versioned path; nothing is
  fetched from a content-delivery network or a model host.
- The server sends a Content Security Policy with `connect-src 'self'`, so the page cannot open a
  connection to any other site, and the app sends nothing to this site either: it only
  downloads its own files.
- The face landmarker is pinned to `@mediapipe/tasks-vision` 0.10.35, because version 1.x
  sends usage metrics to Google.
- The build is checked for URLs of other hosts (`scripts/verify-assets.mjs`), and the
  end-to-end tests check that every request stays on this origin.

## What is stored on the device

The browser's IndexedDB database `eek-a-calibrate` can hold three kinds of data:

| Store | Contents | When |
|---|---|---|
| `geometry` | The screen scale per screen (`screen W×H@dpr`), and the blind-spot focal length per camera and frame size | When you measure them |
| `profiles` | Up to eight calibrations: the fitted mappings (numbers), the head range, versions, the camera's name, and a validation summary | When you start live gaze after a validated calibration |
| `sessions` | Session summaries and validation reports; per-frame features only if you choose to store them | From live gaze, or when you choose to store a session |

The camera is identified by the first 12 hexadecimal characters of the sha256 of the browser's
device identifier, and by its name. Participant and session labels are stored with profiles and
summaries.

If the browser does not allow storage (some private modes) or runs out of space, the app says
so and keeps the data in memory for that visit only.

The database belongs to the origin `https://eelkedevries.com`; the address with `www.` is a
different origin with its own storage.

## Deleting your data

"Delete all my data", at the foot of every page and on the Your data page, empties and deletes
the database and clears the session in memory. Single calibrations and session summaries can be
deleted on the Your data page.

## Exports

An export is a zip file you download (see [export format](export-format.md)). It contains no
images and no face landmarks. The optional `dataset.json`, off by default, holds the derived
per-frame features and labels for offline refitting. What happens to an export after the
download is up to you.
