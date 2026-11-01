# eek-a-calibrate

*Webcam eye-tracking calibration, validation and live gaze, running entirely in your browser.*

**Live (once deployed):** <https://eelkedevries.com/eek-a-calibrate/>

## What it does

eek-a-calibrate is a measurement harness for webcam eye tracking. Four gaze engines process
the same camera frames of the same calibration and validation run:

1. **BlazeGaze** (WebEyeTrack, MIT): a small appearance model that takes head pose into account.
2. **Peekr** (MIT): an eye-crop convolutional network.
3. **Geometric**: eye landmarks, iris and head pose (a corrected port of gaze-lite).
4. **WebGazer method (re-implementation)**: the eye-pixel regression of WebGazer, as a
   literature baseline.

Each engine gets a personal mapping, fitted and cross-validated on identical labels, and is then
validated on separate targets. The results report accuracy and precision in degrees and pixels,
data loss and the effective sampling rate, for every engine and for a combined estimator. "Auto"
picks the combined estimator or a single engine by cross-validation on calibration data only.

Realistic expectations: webcam eye tracking reaches about 2–4° of visual angle in good
conditions and is often worse, samples at 30 Hz at most, and separates only a few coarse areas
of the screen (sources in the specification, Appendix B).

## Status

Prompt 001 (scaffold and contracts) is in place: the build, the asset pipeline, the contracts,
the checks and an app shell with placeholder screens. The engines, calibration and screens
arrive with prompts 002–010 (`docs-dev/plan.md`).

## Privacy

Everything runs on your device. Nothing is uploaded, no images or video are stored, and the page
sends no requests to other sites: every runtime and model is served from this site, and the
Content Security Policy allows connections to this origin only.

## Development

Vite + TypeScript with no UI framework, built as a static site under `/eek-a-calibrate/`.
The binding design is [`docs-dev/reference/primary_authoritative/specification.md`](docs-dev/reference/primary_authoritative/specification.md);
the workflow is in [`AGENTS.md`](AGENTS.md) and [`docs-dev/`](docs-dev/).

```bash
npm ci               # install exact dependencies from the lockfile
npm run dev          # development server at http://localhost:5173/eek-a-calibrate/
npm run check        # build, unit tests, asset and URL checks, public-build check
npm run test:e2e     # Playwright end-to-end tests against the built site (needs ffmpeg)
npm run serve:dist   # serve dist/ with the production headers (E2E_PORT, default 4173)
npm run deploy       # publish what is on GitHub (see docs/deployment.md)
```

## Licence

MIT (`LICENSE`). Third-party software and models: `NOTICE.md`.
