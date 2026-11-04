// The v1 validation screen (#/validate).

export const strings: Readonly<Record<string, string>> = {
  // Validation screen (WP8; spec §7 screen 5)
  'validate.lead': 'Validation measures how accurate and precise each gaze engine is for you, on dots that were not used for calibration.',
  'validate.noCalibration': 'There is no calibration in this session yet.',
  'validate.toCalibrate': 'Go to calibration',
  'validate.start': 'Start validation',
  'validate.recalibrate': 'Calibrate again',
  'validate.scoring': 'Scoring…',
  'validate.fitProgress': 'Fitting the gaze engines: {percent} %',
  'validate.fitFailed': 'The calibration could not be fitted: {message}',
  'validate.screenChanged': 'The screen has changed since calibration (size or orientation), so the calibration no longer applies. Calibrate again.',
  'validate.aborted': 'Validation abandoned. Start it again when you are ready.',
  'validate.invalid': 'Validation stopped. {reason} Start it again when everything is as it was during calibration.',
  'validate.error': 'Validation could not be scored: {message}',
};
