# Export format

The Your data page exports the session as `eek-a-calibrate_<pid>_<session>_<yyyymmdd-hhmm>.zip`
(local time; characters other than letters, digits, `.`, `_` and `-` become `-`, and an empty
label becomes `none`). Export is offered once a calibration has set the reference viewing
distance D_ref; assumed geometry still gives one.

## General rules

- UTF-8 without a byte-order mark, `\n` line endings, comma-separated values with RFC 4180
  quoting where needed.
- An empty field means not a number, or not applicable.
- Fixed decimals: milliseconds 3, pixels 2, degrees 4, millimetres 1; everything else 6
  significant figures.
- Time stamps (`time_ms`, `onset_ms`, `offset_ms`, and `timeMs` in the JSON files) are
  milliseconds from the start of the session, on the main thread's `performance.now()` clock.
- Pixels are CSS px of the fullscreen viewport (or of the browser window in viewport mode),
  origin top left, y down.
- Exported angles are visual angles from the normal through the screen centre, **positive to
  the right and upwards** (as in eek-a-gaze). The JSON files hold the internal state, in which
  vertical angles are positive downwards.
- Identical state gives identical bytes, apart from `exportedAt` in `session.json`.
- When the screen size or the viewing distance was not measured, degree values are approximate
  (96 CSS px per inch and a 60° camera field of view across the long side of the video are
  assumed); `README.txt` then says so, and `session.json` records the sources.

## Files

The files appear in this order; a file that cannot be written is left out and named, with the
reason, in `README.txt`.

| File | Contents |
|---|---|
| `README.txt` | The file list, the eek-a-gaze command, the conventions, and notes on this export |
| `samples.csv` | One row per camera frame per recording, for the selected estimator, plus one column pair per engine |
| `targets.csv` | Every target presentation |
| `validation.csv` | Validation metrics per estimator × mode × target, then one summary row each |
| `cv.csv` | Cross-validated error of every engine, mapper and relative ridge penalty |
| `events.csv` | Fixations, saccades, blinks and bad data of the selected estimator |
| `markers.csv` | Markers set during live recordings (only when there are any) |
| `geometry.yaml` | Viewport size, viewing distance and conventions, for eek-a-gaze |
| `session.json` | Versions, assets, settings, geometry, schedules, fitted mappings, validations, drift log, thresholds, licences |
| `dataset.json` | Optional, off by default: derived per-frame features and labels for offline refitting |

### samples.csv

The header order matters, because eek-a-gaze takes the first column whose name matches a
synonym:

```
participant,session,trial,phase,item_id,time_ms,frame_index,estimator,gaze_x,gaze_y,gaze_x_filt,gaze_y_filt,
gaze_x_uncorrected,gaze_y_uncorrected,gaze_x_deg,gaze_y_deg,drift_x_deg,drift_y_deg,valid,flags,confidence,
target_x,target_y,head_yaw_deg,head_pitch_deg,head_roll_deg,distance_mm,iris_px,clock,
gaze_x_blazegaze,gaze_y_blazegaze,gaze_x_peekr,gaze_y_peekr,gaze_x_geometric,gaze_y_geometric,gaze_x_eyepixel,gaze_y_eyepixel
```

- `trial`: `calibration`, `validation-1`, `validation-2`, … (validations after a quick
  recalibration or a restore), `drift-<n>` (a drift check and the quick recalibration it led
  to), `live-001`, `live-002`, … (live recordings).
- `phase`: the item's phase (`fixation`, `pursuit`, `head`, `validation`, `drift`), `live` in
  live recordings, empty between items.
- `estimator`: the estimator in use when exported, where the recording's fit has it.
- `gaze_x`, `gaze_y`: raw (unfiltered), drift-corrected position in px. `gaze_x_uncorrected`,
  `gaze_y_uncorrected`: the same before the drift correction. `gaze_x_deg`, `gaze_y_deg`: the
  corrected position in degrees. `drift_x_deg`, `drift_y_deg`: the correction in effect (added
  to the uncorrected angle), empty before any drift check.
- `gaze_x_filt`, `gaze_y_filt`: the One Euro filtered position, as shown in Live; only on rows
  of live recordings.
- Every gaze column is empty when the frame is not valid; `valid` (1 or 0) and `flags` say why.
- `flags` is a bit mask: 1 no face, 2 blink, 4 head out of the calibrated range,
  8 extrapolated, 16 off screen, 32 frame dropped, 64 engine error, 128 not fullscreen,
  256 page hidden. A frame is valid when none of 1, 2, 4, 32, 64, 128 and 256 is set.
- `confidence`: advisory, 0–1.
- `target_x`, `target_y`: the target shown at that frame, in px.
- `distance_mm`: D_t, the per-frame viewing distance; `iris_px`: the iris diameter, where it
  was recorded (drift checks, revalidations and live recordings).
- `clock`: how the frame was time-stamped (`captureTime`, `expectedDisplayTime`, `callback` or
  `poll`).
- The per-engine columns give each engine's own uncorrected estimate in px.

### targets.csv

`trial,id,phase,block,x_px,y_px,onset_ms,offset_ms,frame_uncertainty_ms,attempt,aborted,`
`pursuit_period_ms,pursuit_hold_ms,pursuit_discard_ms,pursuit_ax,pursuit_ay,pursuit_phi_x_rad,pursuit_phi_y_rad`

`onset_ms` and `offset_ms` are the animation-frame times of the first frame with and without the
item; `frame_uncertainty_ms` is the median frame interval of that presentation.

### validation.csv, cv.csv and events.csv

`validation.csv` holds one row per estimator × mode (`own`: each estimator's valid frames;
`intersection`: frames valid for every estimator) × target, then one summary row each, with the
funnel, accuracy, offsets, precision, BCEA, data loss, rate, latency, baseline, gain, % of the
diagonal, areas-of-interest grid and the heuristic verdict. `cv.csv` lists every engine ×
mapper × relative λ with its cross-validated error and standard error. `events.csv` lists the
events per recording with their onset, offset, centroid, amplitude, number of samples and the
thresholds used; it is left out when no validation with valid samples was available to set the
I-DT dispersion threshold.

### geometry.yaml

```
screen_width_px: 1280
screen_height_px: 720
screen_width_mm: 338.7
screen_height_mm: 190.5
viewing_distance_mm: 600.0
origin: top_left
units: pixels
```

The values above are an example. The size in mm is the viewport divided by the screen scale,
and the viewing distance is D_ref. With assumed geometry the keys stay, with the assumed values.

### session.json

Schema `eek-a-calibrate/session@1`, written with sorted keys: the app version and commit, the
sha256 of every runtime and model file, the user agent, capabilities, device class, eyewear
answer and device check, the vision host, delegate and backends, the camera settings and clock,
the geometry with its sources and uncertainty, the preset, seeds and schedules, the pursuit lag
τ, the row weights, the full fit (mapping states), Auto's selection and reason, the validation
reports with paired engine differences, the drift log (the measured offset o = mean(Ḡ − T) and
whether it was applied), the thresholds (every constant of the app, plus the session's event
thresholds and a summary of the live recordings) and the licences.

## Opening the samples in eek-a-gaze

```
eek-a-gaze samples.csv --time-units ms --geometry geometry.yaml --units pixels
```

`--time-units ms` is needed: without it, eek-a-gaze reads a median time step of about 33 as a
sample count of unknown rate.
