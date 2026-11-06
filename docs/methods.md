# Methods

This page describes how eek-a-calibrate measures gaze and how it reports quality, and how the
game "Pop with your eyes" presents the measurement. Every number is either a design value of the
app (the tunable defaults of `src/core/constants.ts`, `src/core/position/thresholds.ts` and
`src/core/game/params.ts`), a formula, or a claim with its source. Values marked *heuristic* are
defaults, not values derived from evidence; every value of the position guard and of the
challenge is heuristic. **No accuracy figure for this app is given anywhere**: none will be
published until the manual checks with real cameras have been done. The game's stars, zones and
scores are rules of thumb over the measured values below, not accuracy figures.

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

## The position guard

Before the warm-up, Get ready checks the camera picture and, on phones, the motion sensors
against target ranges per device class (phone upright, phone on its side, webcam; all
heuristic): the face's width as a fraction of the frame's long side (for example 0.28–0.42 on a
phone held upright, 0.16–0.30 with a webcam), the iris diameter, the face's margins and centring,
the head's yaw, pitch and roll around the pose expected when looking at the window's centre, the
phone's upright angle (60–100°) and roll (±10°) from gravity, the face's brightness (60–200),
backlight and glare (the thresholds of `SETUP` in Appendix A), the eyes, and steadiness (head
under 30°/s; phone under 20°/s, or 30°/s with *In hand*). Conditions are checked in a fixed
priority order and only the first is shown, with hysteresis: a new cue must persist 300 ms, a
shown cue stays at least 1 s, and *Ready* needs 2 s with everything in range (`SETUP.holdMs`).
*Ready* stores *home*, the pose and position at that moment.

During the game the guard grades every frame against home (and, after the fit, against the
calibrated head range): *good*, *drifting* (a warning glyph) or *out*. Out for more than 0.5 s,
or the face lost for more than 0.4 s, pauses a warm-up level or Re-aim (1 s and 0.7 s in Free
look and the challenge); everything back in range for 1 s resumes it. The guard is presentation
only: it pauses and resumes the presentation, and never changes which frames are accepted, how
they are labelled or weighted. A level paused by the guard shows the interrupted bubble again
with its full settling window.

## Calibration protocol

The game presents the protocol as its warm-up levels (below); the blocks, layouts, durations,
order and frame rules are those of this section.

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
  (about 100 ms is typical; Chen and Brat 2026). The default of 100 ms is used when fewer than
  half of the processed pursuit frames were accepted. Fixation dots combined with a moving dot
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

## The warm-up levels

| Warm-up length | Levels |
|---|---|
| Quick | Pop the dots (block A, 9 dots), Test round (6 dots) |
| Standard | Pop the dots (block A, 13 dots), Follow the firefly (B), Turn your head (C), Test round (12 dots) |
| Thorough | Standard, with Lean in (A again, closer) before the Test round; *home* is stored again at its start |

- **The bubble** replaces the shrinking ring of a fixation, validation or drift target. With
  onset t₀, it scales in from 0.6 to 1 times its full size over the first 150 ms of the settling
  window and stays still to the window's end; over the sampling window its radius shrinks
  linearly from full to the core's radius, and holds at the core's while sampling is extended;
  when the item ends, it pops (a 150 ms burst) outside every sampling window, and the next onset
  follows. Its full diameter is 3° from the geometry, clamped to [64 px, 20 % of the stage's
  short side]; the core is the same target as before, 0.6° (at least 14 px; 24 px when the
  geometry is unknown). Under reduced motion the bubble is static at full size and simply
  disappears. Whether the bubble keeps as many frames per target and as good an accuracy as the
  ring is still to be piloted (`?target=ring` shows the ring); until then no figure compares
  them.
- **The firefly** of Follow the firefly is the same core on a 44 px light disc, with a faint
  300 ms trail and no path drawn ahead.
- **Turn your head** shows a still bubble (64 px on phones, 80 px on larger screens) inside
  four arcs whose fill grows with the measured head turn towards each side; a location is done
  when 3 of the 4 sectors are reached (at 70 % of ±10° yaw and ±7° pitch, heuristic), or after
  6 s. *Limited head movement* (Settings) halves the targets.
- A level card shows how steady the previous level was ("Nice and steady", "Try to keep your
  head still", "Try to stay in view"), from that level's frame-acceptance log alone (heuristic).

## Warm-up complete: zones, stars, marks

Everything comes from the Test round and the fit, for the selected estimator, on its own valid
frames.

- **Zones (heuristic).** For each axis separately, the largest n ∈ {1, 2, 3, 4} whose smallest
  half-cell along that axis is at least need = the 75th-percentile accuracy + 2 × RMS-S2S
  (0 when even n = 1 fails); the zones are columns × rows. At least two zones unlock the
  challenge. The square areas-of-interest advice below is unchanged and stays in Details.
- **Stars (heuristic, "rule of thumb"):** verdict good 3, acceptable 2, poor 1; not tracking or
  fewer than two zones 0.
- **Marks:** a Test-round bubble is a hit when the mean gaze on it lies in the zone that
  contains its target, a miss otherwise or when it had no valid sample.
- **Cause (heuristic):** from the warm-up's frame log and the guard's light readings, the first
  that applies of: face often lost, backlit, too dark, much head movement, glare, too far.

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
  1.5 median intervals between processed frames apart (frames the device had no time to analyse
  do not break a pair); SD = √(σx² + σy²);
  **BCEA₆₈ = 2kπσxσy√(1 − ρ²)** with k = −ln(1 − 0.68) = 1.1394, from at least 3 valid samples
  (two samples always lie on a line, so ρ = ±1 and the area would read as 0).
- **Data loss** = 1 − valid / basis, where basis = sampling time × the rate at which the device
  processed frames (the median over targets of processed frames per second, at most the camera's
  frame rate, 30 if unknown): the frames the device could analyse. A device slower than its
  camera therefore has a lower effective rate, not more data loss; a stall within one target
  still counts as loss there. The funnel shows every stage from the camera's rate: expected
  (sampling time × the camera's frame rate, so not the basis), delivered, processed, face, eyes
  open, head in range, valid.
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

## Free look and the display

Raw output is always recorded; filtering is for display and the game only. The One Euro filter (Casiez,
Roussel and Vogel 2012) runs on θx and θy with a minimum cut-off of 0.8 Hz, β = 0.3 Hz per °/s
and a derivative cut-off of 1.0 Hz, and resets after gaps over 200 ms. These values rescale
gaze-lite's tuning (0.8 Hz, 0.008 per px/s) at about 40 px per degree. Blink hold: the dot
holds its position while both blink blendshapes exceed 0.6 (until both fall below 0.4), for at
most 800 ms, and is hidden after 600 ms without valid data.

Confidence (advisory) = exp(−½(h/h95)²) · exp(−½(spread/2°)²), where h is the leverage of the
frame in the mapping and spread the RMS distance of the engines from the combined prediction.
Outside the head range seen during calibration (yaw and pitch widened by 4°, distance ratio by
0.10 in log units, eye position by 0.05) frames are flagged and the disc greys out.

Free look lights the zone that contains the filtered, drift-corrected gaze of the selected
estimator, and draws a soft disc there whose radius is the 68th percentile of that estimator's
per-target Test-round accuracy in pixels; the disc fades with the frame's confidence. Expert
mode adds the raw dot, a dot per engine and a trail, as the earlier Live screen did.

## Drift and recalibration (Re-aim and Quick warm-up)

The game calls the drift check **Re-aim** and the quick recalibration **Quick warm-up**. A drift
check shows the centre and one seeded validation location (settle 500 ms, sample
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
restoring of a stored calibration. Corrections are kept per estimator. In the game a check is
also offered when fewer than half of the last six challenge bubbles popped, after more than 10 s
in the auto-pause overlay, and after a round that went badly (all heuristic). The chip after
Re-aim reads "Your aim was fine" when |o| < 0.5° (heuristic) and "Aim fixed" otherwise.

## The challenge

All values here are heuristic, to be tuned in pilot play.

- **Board:** the safe rectangle less 4 % of each axis on each side, split into the zones of
  Warm-up complete with 16 px between them. The gaze input is the selected estimator's filtered,
  drift-corrected gaze, snapped to a zone; no gaze dot is drawn.
- **Bubbles:** 16 a round, diameter clamp(72 px, 40 % of the zone's short side, 20 % of the
  screen's short side), at the zone's centre ± 10 %, never twice in a row in the same zone,
  balanced over the zones, and every fifth in the centre zone when there is one. A bubble lives
  4 s; 500 ms pass between bubbles. Placement is seeded, so a round is reproducible from its seed.
- **Leaky dwell:** while the lit zone is the bubble's, its dwell fills at 1/dwell per second;
  outside it drains twice as fast and resets after 300 ms continuously outside; frames held by
  the blink hold or flagged invalid pause it. A full dwell pops the bubble. The dwell is 1000 ms
  in round 1 (Pop!), 800 ms in round 2 (Mind the spikes: a spiky decoy in another zone that
  "bonks" after 600 ms of looking, −50) and 700 ms in round 3 (Drifters: the bubble drifts at up
  to 3°/s).
- **Score:** +100 a pop plus 50 × (1 − time to pop / 4 s); × 1.5 on every pop after four in a
  row. **Stars per round:** 1 at ≥ 50 % popped, 2 at ≥ 75 %, 3 at ≥ 90 % with a median time to
  pop ≤ 1.6 s. A zone is marked ✓ at ≥ 80 % popped, ~ from 50 %, ✗ below. The best score is kept
  per set of zones.
- **The challenge as a quality check:** each pop stores the target, zone, time to pop and the
  median filtered gaze over its last 400 ms. Offsets that agree in at least three zones
  (resultant length ≥ 0.6) and whose mean exceeds a quarter of a zone give a global offset
  correction for the next round. That gaze is already drift-corrected, so the offset is **added**
  to the correction in use (never put in its place), and it is not applied when the result would
  exceed the drift limit above. It is logged in the drift log with source `game`.

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
