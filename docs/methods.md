# Methods

This page describes how eek-a-calibrate measures gaze and how it reports quality. Every number
is either a design value of the app (the tunable defaults of `src/core/constants.ts`), a
formula, or a claim with its source. Values marked *heuristic* are defaults, not values derived
from evidence. **No accuracy figure for this app is given anywhere**: none will be published
until the manual checks with real cameras have been done.

## Realistic expectations

Webcam eye tracking in good conditions is about 2–4° of visual angle off target, and often 4–8°
or worse; it samples at 30 Hz or less and suits a few coarse areas of interest only. This is a
summary of published evaluations, among them Papoutsaki et al. (2016), Semmelmann and Weigelt
(2018), Yang and Krajbich (2021), Kaduk et al. (2024), Bogdan et al. (2024), Van der Cruyssen et
al. (2024) and Chen and Brat (2026). For comparison:

- The best browser figure in a laboratory comparison with an EyeLink is 1.45°, from a
  vendor-authored study with a 5-minute calibration over several head poses (Kaduk et al. 2024).
- WebGazer has been reported between 3.3° (Bogdan et al. 2024) and 13.6° (Psarra et al. 2026).
- Between runs, accuracy can vary by about 4.6° (Chen and Brat 2026), so one session cannot
  rank engines.

## Capture

The camera is opened with `facingMode: 'user'`, asking for 1280 × 720, then 960 × 540, then
640 × 480 (960 × 540 and 640 × 480 on phones and tablets), at most 30 frames per second.
Portrait frames are normal on phones; all code uses the frame size the camera delivers. Frames
are time-stamped with their capture time where the browser reports it
(`requestVideoFrameCallback`); stamping by capture time gives a median of 22–34 ms from capture
to result in one implementation (Chen and Brat 2026). The app reports its own latency in the
results.

## Face front end

One face landmarker runs for all engines: MediaPipe Face Landmarker
(`@mediapipe/tasks-vision` 0.10.35, Apache-2.0), in a Web Worker where possible. It gives 478
landmarks (including the irises), blendshapes and a transformation matrix, from which the head
pose (yaw, pitch, roll) is computed. The eyes count as open when both blink blendshapes are
below 0.5 and both lid openings (from a four-point eye aspect ratio, after Soukupová and Čech
2016) are above 0.2; the frame before and after a closed frame are masked too.

## Screen, distance and degrees

Screen scale (Li et al. 2020):

```
pxPerMm = card width in CSS px / 85.60            (ID-1 card, 85.60 × 53.98 mm)
pxPerMm = √(screenW² + screenH²) / (inches · 25.4) (diagonal; CSS px of the whole screen)
pxPerMm = 96 / 25.4 = 3.7795                       (not measured: assumed)
```

Viewing distance:

```
D_bs = d / tan(13.5°)          blind-spot test; d = median square-to-dot distance (mm) of 5 trials
f_px = D_bs · p̄ / 11.7         p̄ = median iris diameter (px) over 2 s with both eyes open (longer, up to 6 s, until 10 frames)
f_px = (max(videoW, videoH)/2) / tan(30°)    not measured: a 60° field of view across the long side
D_t  = f_px · 11.7 / median over the last 1000 ms of the iris diameter (open-eye frames)
D_ref = median of D_t over the accepted calibration frames
```

The blind-spot test is accepted only for 300 ≤ D_bs ≤ 1200 mm with an SD of at most 15 % of
D_bs, and is repeated once otherwise. Its error is about 3.25 cm according to a secondary source
(for the method of Li et al. 2020). The visible iris is taken as 11.7 ± 0.5 mm, which gives
distances with under 10 % error (Google Research 2020, MediaPipe Iris). Before the distance is
known the blind-spot dot moves at 1.5°/s at an assumed 600 mm (heuristic).

Without measurements degrees are **approximate**, and pixels and percentages of the screen
diagonal are reported first. Calibration does not need the measurements: distance compensation
depends on D_t / D_ref, in which f_px cancels. Measuring later re-scores the stored validation
from its unchanged pixel predictions.

Positions are CSS px of the fullscreen viewport (origin top left, y down). The eye is taken to
lie on the normal through the screen centre at distance D:

```
θx = atan2((x − W/2) / pxPerMm, D),   θy = atan2((y − H/2) / pxPerMm, D)
x  = W/2 + D · tan θx · pxPerMm,      y  = H/2 + D · tan θy · pxPerMm
ang(a, b) = atan2(‖u_a × u_b‖, u_a · u_b),   u(θ) = (tan θx, tan θy, 1)
```

Errors are computed with the exact angle `ang`, not with pixels per degree at the centre.
Exported angles are positive to the right and **upwards**.

On phones, layout coordinates map into the safe area of the screen (the viewport minus the
notch, camera cut-out and home indicator).

## Calibration protocol

| Preset | Blocks | Validation |
|---|---|---|
| Quick | A: 9 dots ({0.08, 0.5, 0.92}²) | 6 dots |
| Standard | A: 13 dots ({0.08, 0.5, 0.92}² ∪ {0.29, 0.71}²); B: moving dot; C: head movement at 5 locations | 12 dots, jittered by ±0.02 |
| Thorough | Standard, then A again about 10 cm closer | 12 dots |

- Each fixation dot: 600 ms settling (not used), then 1000 ms of sampling, extended up to
  2500 ms until 12 frames are accepted, and retried once at the end of its block.
- The moving dot follows a 2:3 Lissajous path, `x = 0.5 + 0.42 sin(2π·2t/T)`,
  `y = 0.5 + 0.42 sin(2π·3t/T + π/2)`, with T = 16 s, lengthened if it would exceed 15°/s.
  Each frame is labelled with the target at t − τ, where the lag τ is estimated per session
  (about 100 ms is typical; Chen and Brat 2026). Fixation dots combined with a moving dot
  calibrate best (Saxena, Lange and Fink 2022).
- Head movement: at each of 5 locations, look at the dot while turning the head left and
  right (about ±10° of yaw) and nodding (about ±7° of pitch).
- Validation targets never coincide with calibration targets (at least 0.05 apart). Orders
  are shuffled with a seeded generator; the seed is exported.

A frame is accepted only if a face is found, the eyes are open, the head is within ±25° yaw
and ±20° pitch (±32° and ±25° during head movement) and turns at most 60°/s, the outer eye
corners are at least 60 px apart, the screen is fullscreen (or in viewport mode) and visible,
and the frame was not dropped or inside a settling window. The decision is shared by all
engines.

## Personal mapping

Each engine's features are mapped to visual angle by weighted ridge regression with an
unpenalised intercept, physical spread floors and clipping to the calibrated range. The
penalty is chosen by exact leave-one-location-out cross-validation through the hat-matrix
identity: all frames of one calibration location are held out together, so nothing leaks
between folds. Two Huber reweighting passes and hard rejection make the fit robust. The
combined estimator weights the engines per axis with non-negative weights that sum to one,
evaluated by nested cross-validation.

**Auto** chooses the single engine with the lowest cross-validated error (preferring the
better a-priori rank within one standard error), or Combined when its error is at most 95 % of
that engine's. Validation is never used to choose; switching afterwards to whichever estimator
validates best makes its validation figures optimistic.

## Validation metrics

Metrics use the raw (unfiltered, uncorrected) predictions of valid frames.

- **Accuracy** = ang(T, Ḡ), the angle between a target and the mean gaze on it; mean, median
  and 90th percentile over targets, and central and peripheral separately. Also in px.
- **Precision:** RMS-S2S = √(mean ang(Gᵢ, Gᵢ₊₁)²) over consecutive valid samples at most
  1.5 median frame intervals apart; SD = √(σx² + σy²);
  **BCEA₆₈ = 2kπσxσy√(1 − ρ²)** with k = −ln(1 − 0.68) = 1.1394.
- **Data loss** = 1 − valid / expected, where expected = sampling time × the camera's frame
  rate (30 if unknown), shown as a funnel: expected, delivered, processed, face, eyes open,
  head in range, valid.
- **Effective rate** = valid samples per second of sampling time (capture clock).
- **Latency** = mean time from capture to result.
- **Constant baseline** = the accuracy of always predicting the centroid of the targets;
  **tracking gain** = baseline / mean accuracy.
- **Verdict (heuristic):** not tracking when the gain is below 1.5; good at ≤ 2.5° and ≤ 20 %
  data loss; acceptable at ≤ 4.0° and ≤ 35 %; poor otherwise. With approximate degrees the
  accuracy test uses the screen diagonal: good below 6 %, acceptable below 10 %.
- **Areas of interest (heuristic):** the largest n ∈ {2, 3, 4} for which half an n × n cell
  is at least the 75th-percentile accuracy plus twice the RMS-S2S. Published studies support at
  most about 4–6 areas (Yang and Krajbich 2021; Van der Cruyssen et al. 2024).
- Every report is computed for each estimator's own valid frames and for the frames valid for
  every estimator. Paired engine differences use a Wilcoxon signed-rank test within the session
  only.

## Live display

Raw output is always recorded; filtering is for display only. The One Euro filter (Casiez,
Roussel and Vogel 2012) runs on θx and θy with a minimum cut-off of 0.8 Hz, β = 0.3 Hz per °/s
and a derivative cut-off of 1.0 Hz, and resets after gaps over 200 ms. These values rescale
gaze-lite's tuning (0.8 Hz, 0.008 per px/s) at about 40 px per degree. Blink hold: the dot
holds its position while both blink blendshapes exceed 0.6 (until both fall below 0.4), for at
most 800 ms, and is hidden after 600 ms without valid data.

Confidence (advisory) = exp(−½(h/h95)²) · exp(−½(spread/2°)²), where h is the leverage of the
frame in the mapping and spread the RMS distance of the engines from the combined prediction.
Outside the head range seen during calibration (yaw and pitch widened by 4°, distance ratio by
0.10 in log units, eye position by 0.05) frames are flagged and the dot greys out.

## Drift and recalibration

A drift check shows the centre and one seeded validation location (settle 500 ms, sample
1000 ms each) and measures o, the mean over the two targets of (Ḡ − T), from raw predictions.

- If |o| ≤ max(2°, 1.5 × validation accuracy), the correction −o is added to every following
  gaze angle (it replaces any earlier correction) and logged.
- Otherwise a quick recalibration is offered: 5 dots (the centre and {0.29, 0.71}²) under the
  fixation rules, appended to the calibration with weight ×2, a refit of every engine, and a
  validation on 6 dots. Any recalibration invalidates the previous validation.

Checks are prompted every 5 minutes, because sessions of about 5 minutes are stable (Kaduk et
al. 2024; Yang and Krajbich 2021), and calibration points spread over a session work better than
front-loaded ones (Prescott et al. 2026). A check is forced after a camera or resolution change,
a screen layout or scaling change, a backend or delegate change, a worker restart and the
restoring of a stored calibration. Corrections are kept per estimator.

## Events

Events are detected on the selected estimator's corrected angles: gaps up to 75 ms are
bridged (longer gaps break segments), a 3-sample median is applied, and I-DT (Salvucci and
Goldberg 2000) finds fixations of at least 100 ms with a dispersion threshold
θ_D = clamp(4 × SD₂d, 1.5°, 6°), where SD₂d is the median validation SD. Saccades are the
intervals between fixations, with amplitude only (30 Hz cannot resolve saccade dynamics);
blinks are runs of blink flags lasting 50–500 ms, and longer invalid runs are bad data.

## References

- Bogdan, P. C. et al. (2024). Investigating the suitability of online eye tracking for
  psychological research. *Behavior Research Methods* 56, 2213–2226.
  <https://doi.org/10.3758/s13428-023-02143-z>
- Casiez, G., Roussel, N. and Vogel, D. (2012). 1 € filter: a simple speed-based low-pass
  filter for noisy input in interactive systems. *Proceedings of CHI 2012*.
  <https://doi.org/10.1145/2207676.2208639>
- Chen, C.-S. and Brat, G. A. (2026). Measuring browser webcam gaze honestly.
  arXiv:2608.11566. <https://arxiv.org/abs/2608.11566>
- Google Research (2020). MediaPipe Iris: real-time iris tracking and depth estimation.
  <https://research.google/blog/mediapipe-iris-real-time-iris-tracking-depth-estimation/>
- Kaduk, T., Goeke, C., Finger, H. and König, P. (2024). Webcam eye tracking close to
  laboratory standards: comparing a new webcam-based system and the EyeLink 1000. *Behavior
  Research Methods*. <https://doi.org/10.3758/s13428-023-02237-8>
- Li, Q., Joo, S. J., Yeatman, J. D. and Reinecke, K. (2020). Controlling for participants'
  viewing distance in large-scale, psychophysical online experiments using a virtual chinrest.
  *Scientific Reports* 10, 904. <https://doi.org/10.1038/s41598-019-57204-1>
- Papoutsaki, A., Sangkloy, P., Laskey, J., Daskalova, N., Huang, J. and Hays, J. (2016).
  WebGazer: scalable webcam eye tracking using user interactions. *Proceedings of IJCAI 2016*,
  3839–3845. <https://www.ijcai.org/Abstract/16/540>
- Prescott, J., Avramidis, K. and Narayanan, S. (2026). Adapting appearance-based gaze
  estimation to narrow-range, long-duration screen viewing. arXiv:2610.11036.
  <https://arxiv.org/abs/2610.11036>
- Psarra, E. et al. (2026). A systematic performance evaluation of WebGazer (title
  shortened). *Journal of Eye Movement Research*.
- Salvucci, D. D. and Goldberg, J. H. (2000). Identifying fixations and saccades in
  eye-tracking protocols. *Proceedings of ETRA 2000*, 71–78.
  <https://doi.org/10.1145/355017.355028>
- Saxena, S., Lange, E. and Fink, L. (2022). Towards efficient calibration for webcam
  eye-tracking in online experiments. *Proceedings of ETRA 2022*.
  <https://doi.org/10.1145/3517031.3529645>
- Semmelmann, K. and Weigelt, S. (2018). Online webcam-based eye tracking in cognitive
  science: a first look. *Behavior Research Methods* 50, 451–465.
  <https://doi.org/10.3758/s13428-017-0913-7>
- Soukupová, T. and Čech, J. (2016). Real-time eye blink detection using facial landmarks.
  *21st Computer Vision Winter Workshop*.
- Van der Cruyssen, I. et al. (2024). The validation of online webcam-based eye-tracking: the
  replication of the cascade effect, the novelty preference, and the visual world paradigm.
  *Behavior Research Methods* 56, 4836–4849. <https://doi.org/10.3758/s13428-023-02221-2>
- Yang, X. and Krajbich, I. (2021). Webcam-based online eye-tracking for behavioral research.
  *Judgment and Decision Making* 16, 1485–1505. <https://doi.org/10.1017/S1930297500008512>
- Zhang, X., Sugano, Y. and Bulling, A. (2019). Evaluation of appearance-based methods and
  implications for gaze-based applications. *Proceedings of CHI 2019*. arXiv:1901.10906.
  <https://arxiv.org/abs/1901.10906>
