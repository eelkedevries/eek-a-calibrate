# Third-party notices

eek-a-calibrate's own code is MIT-licensed (`LICENSE`). It ships or depends on the following
third-party software and models. No GPL, AGPL or non-commercial-only code is shipped.

## Models committed to this repository (`public/models/`)

| Model | Licence | Notes |
|---|---|---|
| MediaPipe Face Landmarker, float16 v1 (`face-landmarker-f16-v1/`) | Apache-2.0, © Google LLC | `LICENSE` and `PROVENANCE.md` in the folder |
| BlazeGaze weights from WebEyeTrack, commit `75fbd2f` (`blazegaze-75fbd2f/`) | MIT, © 2025 Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas | Trained on research eye-tracking datasets whose own terms may restrict use |
| Peekr eye model 1.0.7 (`peekr-1.0.7/`) | MIT, © 2025 AryamanTaore | Training-data provenance not stated by the author |

Because of these caveats, eek-a-calibrate is offered for non-commercial research use.

## Fonts (`public/fonts/`)

| Font | Licence | Notes |
|---|---|---|
| Spectral 600 (`spectral/`) | SIL Open Font License 1.1, © 2017 The Spectral Project Authors | Latin subset in WOFF2; `OFL.txt` and `PROVENANCE.md` in the folder |
| Lexend 400 and 500 (`lexend/`) | SIL Open Font License 1.1, © 2018 The Lexend Project Authors | Latin subsets in WOFF2; `OFL.txt` and `PROVENANCE.md` in the folder |
| JetBrains Mono 400 and 500 (`jetbrains-mono/`) | SIL Open Font License 1.1, © 2020 The JetBrains Mono Project Authors | Latin subsets in WOFF2; `OFL.txt` and `PROVENANCE.md` in the folder |

## Runtime libraries (npm, exact versions in `package.json`)

| Package | Version | Licence | Use |
|---|---|---|---|
| `@mediapipe/tasks-vision` | 0.10.35 | Apache-2.0 | Face landmarks, blendshapes and head pose (WebAssembly files self-hosted under `vendor/`) |
| `@tensorflow/tfjs-core`, `-layers`, `-backend-webgl`, `-backend-wasm`, `-backend-cpu` | 4.22.0 | Apache-2.0 | Runs BlazeGaze |
| `ml-matrix` | 6.12.1 | MIT | Linear algebra for the vendored WebEyeTrack geometry |
| `onnxruntime-web` | 1.30.0 | MIT | Runs Peekr |
| `fflate` | 0.8.2 | MIT | Zip export |

Development only: `vite` 8.3.4 (MIT), `typescript` 6.0.3 (Apache-2.0), `@playwright/test`
1.63.0 (Apache-2.0), `@types/node` 22.20.4 (MIT).

## Code reproduced from MIT-licensed sources

- **WebEyeTrack** (commit `75fbd2f`, MIT, © 2025 Eduardo Davalos, Yike Zhang, Amanda Goodwin,
  Gautam Biswas): `mathUtils.ts` and `safeSVD.ts` are vendored under
  `src/engines/blazegaze/vendor/` with the upstream `LICENSE`; every change is listed in
  `UPSTREAM.md` there.
- **Peekr 1.0.7** (npm package `peekr`, MIT, © 2025 AryamanTaore): the preprocessing in
  `src/engines/peekr/preprocess.ts` (the eye boxes of its `convertToYolo`, the landmarks of its
  `collectCoordinates`, `kps`, the crop rectangles and the BGR tensor of its `preprocess`) is
  reproduced from the package's MIT bundle (`dist/index.js`). The parity tests compare it with
  bundle code copied, with its MIT notice, into `tests/reference/peekr-boxes.js`, which is never
  shipped.

## Methods re-implemented, no code copied

- The eye-pixel engine re-implements the published method of WebGazer (Papoutsaki et al.,
  2016). WebGazer's code (GPL) is not used.
- The geometric engine ports features from gaze-lite (the owner's own project).

## Test fixture

`tests/fixtures/face/portrait.jpg` is an official NASA portrait of Sally Ride (1984), in the
public domain as a work of the US government (`{{PD-USGov-NASA}}`); see
`tests/fixtures/face/PROVENANCE.md`. It is used only as a synthetic camera input in automated
tests.
