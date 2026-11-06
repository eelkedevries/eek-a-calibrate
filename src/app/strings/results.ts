// The per-estimator results (spec §4.12, §7 row 6), shown in Details → Results.

export const strings: Readonly<Record<string, string>> = {
  'results.optimism': 'Auto chooses from the calibration data alone, never from validation. If you switch to whichever estimator validates best, you have used the validation data to choose, so its validation figures become optimistic.',
  'results.verdict.good': 'good',
  'results.verdict.acceptable': 'acceptable',
  'results.verdict.poor': 'poor',
  'results.verdict.not-tracking': 'not tracking',
  'results.plot.label': 'Plot of the validation targets and the gaze samples of {names}',
  'results.funnel.title': 'Where the frames went (data-loss funnel)',
  'results.funnel.for': 'For {name}, over every validation target.',
  'results.funnel.expected': 'Expected at the camera’s frame rate',
  'results.funnel.delivered': 'Delivered by the camera',
  'results.funnel.processed': 'Processed (not dropped)',
  'results.funnel.face': 'With a face',
  'results.funnel.open': 'Eyes open',
  'results.funnel.inRange': 'Head within the calibrated range',
  'results.funnel.valid': 'Valid for the estimator',
  'results.funnel.note': 'Frames the camera did not deliver, or that this device had no time to analyse (delivered but not processed), lower the effective rate but do not count as data loss, which is measured against the frames the device could analyse.',
  'results.cv.note': 'Each engine’s mapping candidates, scored by leave-one-location-out cross-validation on the calibration data: lower is better. The chosen candidate is marked.',
  'results.aoi.n': 'With {name}, a grid of up to {n} × {n} equal areas can be told apart (heuristic rule).',
  'results.aoi.none': 'With {name}, not even a 2 × 2 grid of areas can be told apart reliably (heuristic rule).',
  'results.unit.diag': '{value} % of diagonal',
};
