# eek-a-gaze geometry reference

`geometry_reference.csv` is copied unchanged from the sibling repository
[eelkedevries/eek-a-gaze](https://github.com/eelkedevries/eek-a-gaze), file
`tests/data/geometry_reference.csv`.

| Field | Value |
|---|---|
| Source commit (repository head when copied) | `a58d5abdb23bb2d10b5507eccf7e12eff95f767f` |
| Last commit touching the file | `4ed138e3349fa60a54c3c9ae146c89c76d50982b` (3 May 2026) |
| sha256 | `ae1b5fe00b540612661513e0f02ec6d427a23da02890286be3cda25756b89584` |
| Copied | 1 November 2026, for prompt 003 (WP3) |

The expected values were computed by eek-a-gaze with NumPy
(`degrees(arctan2((px − screen_px/2)·screen_mm/screen_px, distance_mm))`, negated when
`flip_y` is true), as the comment lines at the top of the file state. eek-a-calibrate's
`pxToDeg` and `toExportDeg` (`src/core/geometry/angles.ts`) must reproduce every row to an
absolute tolerance of 1e-9 degrees (specification §10.1, WP3); `tests/unit/geometry-angles.test.ts`
checks this.

Do not edit the CSV. If eek-a-gaze changes its reference, copy the new file and update this note.
