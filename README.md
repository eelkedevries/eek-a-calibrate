# eek-a-calibrate

*Pop with your eyes: webcam and smartphone eye tracking as a game, running entirely in your
browser.*

**Live:** <https://eelkedevries.com/eek-a-calibrate/>

## What it does

eek-a-calibrate calibrates and validates webcam eye tracking, and presents it as a game. The
calibration is the game's warm-up: a few short levels in which you look at bubbles, follow a
firefly and turn your head. A Test round then measures how well the tracker follows your eyes,
and Warm-up complete turns that into stars and **zones**: the parts of the screen the tracker
can tell apart for you. In Free look the zone you look at lights up, and in the challenge you
pop bubbles in those zones just by looking at them. The game works with a computer's webcam and
with a phone's front camera, upright or on its side, and a position guard tells you, one
instruction at a time, how to place the camera, your face and the light.

Under the game is a measurement harness. Four gaze engines process the same camera frames of
the same warm-up:

1. **BlazeGaze** (WebEyeTrack, MIT): a small appearance model that takes head pose into account.
2. **Peekr** (MIT): an eye-crop convolutional network.
3. **Geometric**: eye landmarks, iris and head pose (a corrected port of gaze-lite).
4. **WebGazer method (re-implementation)**: the eye-pixel regression of WebGazer, as a
   literature baseline.

Each engine gets a personal mapping, fitted and cross-validated on identical labels, and is then
validated on the Test round's separate targets. The Details sheet reports accuracy and precision
in pixels, % of the screen and degrees, data loss and the effective sampling rate, for every
engine and for a combined estimator; "Auto" picks the combined estimator or a single engine by
cross-validation on calibration data only. Details also holds the settings, the export (a zip
that eek-a-gaze reads), the device readings and the methods.

Realistic expectations: webcam eye tracking reaches about 2–4° of visual angle in good
conditions and is often worse, samples at 30 Hz at most, and separates only a few coarse areas
of the screen (sources in the specification, Appendix B). The game's zones, stars and challenge
scores are heuristic rules of thumb, not accuracy figures.

## Status

The game-first interface of specification v0.5 §17 is built (prompts 013–018) over the v1
pipeline (prompts 001–012). See [`docs/usage.md`](docs/usage.md) for how to play and
[`docs-dev/manual-verification.md`](docs-dev/manual-verification.md) for the checks on real
devices that are still owed; no accuracy figure for this app is published until they are done.

## Privacy

Everything runs on your device. Nothing is uploaded, no images or video are stored, and the page
sends no requests to other sites: every runtime, model and font is served from this site, and the
Content Security Policy allows connections to this origin only. See
[`docs/privacy.md`](docs/privacy.md).

## Development

Vite + TypeScript with no UI framework, built as a static site under `/eek-a-calibrate/`.
The binding design is [`docs-dev/reference/primary_authoritative/specification.md`](docs-dev/reference/primary_authoritative/specification.md);
the workflow is in [`AGENTS.md`](AGENTS.md) and [`docs-dev/`](docs-dev/).

```bash
npm ci               # install exact dependencies from the lockfile
npm run dev          # development server at http://localhost:5173/eek-a-calibrate/
npm run check        # build, unit tests, asset and URL checks, public-build check
npm run test:e2e     # Playwright end-to-end tests against the built site (needs ffmpeg)
npm run check:all    # both
npm run serve:dist   # serve dist/ with the production headers (E2E_PORT, default 4173)
npm run deploy       # publish what is on GitHub (see docs/deployment.md)
```

## Licence

MIT (`LICENSE`). Third-party software and models: `NOTICE.md`.
