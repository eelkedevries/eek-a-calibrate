# Engines

Four gaze engines process the same camera frames of the same calibration and validation, so
they can be compared for the same person on the same device. Each gets its own personal
mapping, cross-validated on identical labels and folds, and is validated on identical targets
(see [methods](methods.md)). The engines are listed in their a-priori rank order, which breaks
near-ties when Auto chooses.

None of them has an independently validated accuracy for this use, and this app quotes none
until checks with real cameras have been done. What each engine's authors report is given with
its source. The same details, read from each engine's own description, appear on the app's
About page.

| Rank | Engine | Family | Runtime | Download | Licence |
|---|---|---|---|---|---|
| 1 | BlazeGaze (WebEyeTrack, `75fbd2f`) | Appearance, head-pose aware | TF.js 4.22.0 (WebGL, else WebAssembly) | 1.1 MB | MIT (code and weights) |
| 2 | Peekr 1.0.7 | Eye-crop CNN | ONNX Runtime Web 1.30.0 (WebAssembly, 1 thread) | 14.8 MB with the runtime | MIT |
| 3 | Geometric | Landmarks, iris and head pose | TypeScript | none | MIT |
| 4 | WebGazer method (re-implementation) | Eye-patch pixels | TypeScript | none | MIT |

Download sizes are those of the files the engine needs beyond the shared face landmarker
(3.8 MB, Apache-2.0); they come from the asset manifest.

## BlazeGaze (WebEyeTrack)

- **What it is:** WebEyeTrack's BlazeGaze network: a small encoder over an eye-region strip,
  with the head pose as input to its gaze head. Its training-time preprocessing is reproduced
  exactly; the personal mapping uses its 2-D estimate or its 512-dimensional embedding.
- **Evidence:** its authors report less drift than WebGazer over 20 minutes on the Eye of the
  Typer data, 7.24 → 8.72 cm against 7.79 → 11.62 cm (Davalos et al. 2025). There is no
  independent validation.
- **Licence:** MIT for code and weights, © 2025 Davalos, Zhang, Goodwin and Biswas. The
  weights were trained on research datasets, whose terms may limit use.
- **Citation:** Davalos, E., Zhang, Y., Goodwin, A. and Biswas, G. (2025). WebEyeTrack:
  scalable eye-tracking for the browser via on-device few-shot personalization.
  arXiv:2508.19544. <https://arxiv.org/abs/2508.19544>;
  source <https://github.com/RedForestAI/WebEyeTrack>.
- **Budget:** the device check keeps it when its median time is at most 25 ms per frame
  (heuristic).

## Peekr

- **What it is:** a small network on two eye crops plus eight landmark coordinates, run on
  single-threaded ONNX Runtime Web. The preprocessing of Peekr's own bundle is reproduced
  exactly.
- **Evidence:** its author reports 1.75° × 2.52° (1.53 cm horizontally, 2.20 cm vertically)
  after a 5-point calibration, in the package documentation; this is not peer-reviewed.
- **Licence:** MIT, © 2025 AryamanTaore.
- **Citation:** Taore, A. (2025). Peekr 1.0.7 (npm package).
  <https://www.npmjs.com/package/peekr>
- **Budget:** at most 15 ms per frame (heuristic). It needs WebAssembly SIMD.

## Geometric

- **What it is:** a port of gaze-lite's landmark features, with corrections: the position of
  each iris within its eye opening, a depth-correction term for the iris lying in front of
  the eye corners, the gaze blendshapes, the lid opening and the head pose. Always available;
  it also supplies the frame checks that all engines share.
- **Evidence:** no published accuracy figure exists for these features.
- **Licence:** MIT (part of eek-a-calibrate).

## WebGazer method (re-implementation)

- **What it is:** a clean-room re-implementation of the method of WebGazer: two 10 × 6
  greyscale eye patches with histogram equalisation, mapped by ridge regression. No WebGazer
  code is used, so it is never called "WebGazer"; it is a baseline that matches the
  literature.
- **Evidence:** WebGazer itself has been reported between 3.3° (Bogdan et al. 2024) and 13.6°
  (Psarra et al. 2026), depending on the study's conditions.
- **Licence:** MIT (part of eek-a-calibrate).
- **Citation of the method:** Papoutsaki, A., Sangkloy, P., Laskey, J., Daskalova, N., Huang,
  J. and Hays, J. (2016). WebGazer: scalable webcam eye tracking using user interactions.
  *Proceedings of IJCAI 2016*, 3839–3845. <https://www.ijcai.org/Abstract/16/540>

## Combined

Combined weights the engines' calibrated outputs per axis with non-negative weights that sum to
one, fitted and evaluated by nested cross-validation. When an engine has no output for a frame,
the weights are renormalised over the others. Auto chooses Combined when its cross-validated
error is at most 95 % of the best single engine's.

## Shared face landmarker

MediaPipe Face Landmarker, `@mediapipe/tasks-vision` 0.10.35 (Apache-2.0), with the model
`face_landmarker.task` (float16, version 1; Apache-2.0). The version is pinned exactly, because version
1.x sends usage metrics to Google. Every runtime and model file is served from this
website under a versioned path, with its sha256 recorded in `assets-manifest.json` and in every
export.

## References

See [methods](methods.md#references) for Bogdan et al. (2024) and Psarra et al. (2026).
