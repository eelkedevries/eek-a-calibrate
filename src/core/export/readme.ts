// README.txt of the export (specification §4.16): the file list, the eek-a-gaze command and the
// conventions. It holds no time stamp, so identical state gives identical bytes.
import { Flags, INVALID_MASK } from '../types.ts';

export const EEK_A_GAZE_COMMAND = 'eek-a-gaze samples.csv --time-units ms --geometry geometry.yaml --units pixels';

export const FILE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'README.txt': 'this file',
  'samples.csv': 'one row per camera frame and session phase: the selected estimator, then one column pair per engine',
  'targets.csv': 'every target presentation: position, onset and offset, attempt, pursuit parameters',
  'validation.csv': 'validation metrics per estimator, mode (own or intersection) and target, then one summary row each',
  'cv.csv': 'cross-validated error of every engine, mapper and relative ridge penalty',
  'events.csv': 'fixations, saccades, blinks and bad data of the selected estimator',
  'geometry.yaml': 'viewport size, viewing distance and coordinate conventions, for eek-a-gaze',
  'session.json': 'versions, assets, settings, geometry, schedules, fitted mappings, validations, drift log, thresholds',
  'dataset.json': 'derived per-frame features and labels for offline refitting (no images, no landmarks)',
};

const FLAG_NAMES: Readonly<Record<keyof typeof Flags, string>> = {
  NO_FACE: 'no face',
  BLINK: 'blink',
  OUT_OF_RANGE: 'head out of the calibrated range',
  EXTRAPOLATED: 'extrapolated',
  OFFSCREEN: 'off screen',
  DROPPED: 'frame dropped',
  ENGINE_ERROR: 'engine error',
  NOT_FULLSCREEN: 'not fullscreen',
  HIDDEN: 'page hidden',
};

export interface ReadmeInput {
  participant: string;
  session: string;
  appVersion: string;
  appCommit: string;
  /** The files in the zip, in zip order. */
  files: readonly string[];
}

export function readmeText(r: ReadmeInput): string {
  const width = Math.max(...r.files.map((f) => f.length));
  const flags = (Object.keys(Flags) as (keyof typeof Flags)[]).map((k) => `${Flags[k]} ${FLAG_NAMES[k]}`).join(', ');
  const invalid = (Object.values(Flags) as number[]).filter((bit) => (INVALID_MASK & bit) !== 0).join(', ');
  const lines = [
    'eek-a-calibrate export',
    '======================',
    '',
    `Participant: ${r.participant}`,
    `Session: ${r.session}`,
    `App: eek-a-calibrate ${r.appVersion} (${r.appCommit})`,
    '',
    'Files',
    '-----',
    ...r.files.map((f) => `${f.padEnd(width)}  ${FILE_DESCRIPTIONS[f] ?? ''}`.trimEnd()),
    '',
    'Opening the samples in eek-a-gaze',
    '---------------------------------',
    `  ${EEK_A_GAZE_COMMAND}`,
    '',
    'Conventions',
    '-----------',
    '- Text is UTF-8 with \\n line endings. An empty field means not a number, or not applicable.',
    '- Time stamps (time_ms, onset_ms, offset_ms, and timeMs in the JSON files) are milliseconds from',
    '  the start of the session; the other *_ms columns are durations. Milliseconds have 3 decimals.',
    '- Pixel columns are CSS pixels of the fullscreen viewport, origin top left, y down, with 2 decimals.',
    '- Gaze angles (gaze_x_deg, gaze_y_deg, centroid_*_deg) are visual angles from the screen-centre',
    '  normal. They and the gaze offsets (drift_*_deg, offset_*_deg) are positive to the right and',
    '  upwards, as in eek-a-gaze. Degrees have 4 decimals, millimetres 1; other numbers have',
    '  6 significant figures.',
    '- The JSON files hold the internal state, in which vertical gaze angles are positive downwards.',
    '- gaze_x and gaze_y are raw (unfiltered), drift-corrected positions. Every gaze column is empty',
    '  when the frame is not valid; valid and flags say why.',
    `- flags is a bit mask: ${flags}.`,
    `  A frame is valid when none of ${invalid} is set.`,
    '- Verdicts in validation.csv are heuristic. Results from one session do not generalise.',
    '',
  ];
  return lines.join('\n');
}
