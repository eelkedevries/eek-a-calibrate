// WP3: samples.csv: header order, time_ms, eek-a-gaze's synonym rule, the y sign convention,
// empty gaze columns for invalid frames, and byte-identical output. v0.5 (§17.10.2): the tilt
// covariates after the per-engine columns, stamped by FrameRecorder from the nearest reading.
import assert from 'node:assert/strict';
import test from 'node:test';
import { degToPx } from '../../src/core/geometry/angles.ts';
import { SAMPLES_HEADER, samplesCsv, trialName, type SampleRow } from '../../src/core/export/samplesCsv.ts';
import { FrameRecorder, setTiltLookup } from '../../src/core/protocol/labelling.ts';
import { calibrationSchedule } from '../../src/core/protocol/schedule.ts';
import { Flags } from '../../src/core/types.ts';
import type { FaceObservation, FrameResult, GazeSample, SessionGeometry, Vec2 } from '../../src/core/types.ts';

const GEOMETRY: SessionGeometry = {
  screen: { viewportWpx: 1920, viewportHpx: 1080, screenWpx: 1920, screenHpx: 1080, dpr: 1, fullscreen: true, pxPerMm: 1920 / 531, pxPerMmSource: 'card' },
  distance: { focalPx: 1000, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 10, irisMm: 11.7 },
  refDistanceMm: 600,
  degreesApproximate: false,
};
const ID = { participant: 'P01', session: 'S1', sessionStartMs: 5000 };

// Specification §4.16, verbatim, then the two columns of §17.10.2.
const V04_HEADER =
  'participant,session,trial,phase,item_id,time_ms,frame_index,estimator,gaze_x,gaze_y,gaze_x_filt,gaze_y_filt,' +
  'gaze_x_uncorrected,gaze_y_uncorrected,gaze_x_deg,gaze_y_deg,drift_x_deg,drift_y_deg,valid,flags,confidence,' +
  'target_x,target_y,head_yaw_deg,head_pitch_deg,head_roll_deg,distance_mm,iris_px,clock,' +
  'gaze_x_blazegaze,gaze_y_blazegaze,gaze_x_peekr,gaze_y_peekr,gaze_x_geometric,gaze_y_geometric,gaze_x_eyepixel,gaze_y_eyepixel';
const SPEC_HEADER = `${V04_HEADER},device_tilt_deg,device_roll_deg`;

// eek-a-gaze `data/columns.py` (SYNONYMS, normalise, find_column), re-implemented: the first
// header, in header order, whose normalised name is a synonym.
const SYNONYMS: Record<string, readonly string[]> = {
  participant: ['participant', 'participant_id', 'subject', 'subject_id', 'subj', 'sub', 'pp', 'id', 'observer', 'observer_id'],
  trial: ['trial', 'trial_id', 'trialid', 'trial_num', 'trialnum', 'trial_number', 'trialnumber', 'trial_index', 'trialindex', 'block_trial'],
  time: ['time', 't', 'timestamp', 'time_ms', 'time_s', 'time_sec', 'time_seconds', 'time_milliseconds', 'ttime', 'sample', 'sample_num', 'sample_number', 'sample_index', 'samplenum'],
  gaze_x: ['x', 'gaze_x', 'gazex', 'screen_x', 'screenx', 'xpos', 'x_pos', 'gazepoint_x', 'gaze_point_x', 'avg_x', 'average_x', 'mean_x', 'x_mean', 'point_of_regard_x', 'por_x'],
  gaze_y: ['y', 'gaze_y', 'gazey', 'screen_y', 'screeny', 'ypos', 'y_pos', 'gazepoint_y', 'gaze_point_y', 'avg_y', 'average_y', 'mean_y', 'y_mean', 'point_of_regard_y', 'por_y'],
  gaze_x_left: ['gaze_x_left', 'gaze_x_l', 'x_left', 'left_x', 'leftx', 'lx', 'l_x', 'gaze_left_x', 'gazeleft_x', 'left_gaze_x', 'x_l', 'xpos_left', 'screen_x_left', 'por_x_left', 'point_of_regard_x_left'],
  gaze_x_right: ['gaze_x_right', 'gaze_x_r', 'x_right', 'right_x', 'rightx', 'rx', 'r_x', 'gaze_right_x', 'gazeright_x', 'right_gaze_x', 'x_r', 'xpos_right', 'screen_x_right', 'por_x_right', 'point_of_regard_x_right'],
  pupil: ['pupil', 'pupil_size', 'pupilsize', 'pupil_diameter', 'pupildiameter', 'pupil_area', 'pupilarea', 'ps', 'pd', 'avg_pupil', 'average_pupil', 'mean_pupil', 'pupil_avg'],
};
const normalise = (name: string): string => name.trim().toLowerCase().replace(/[\s-]+/g, '_');
const findColumn = (columns: readonly string[], logical: string): string | null =>
  columns.find((c) => (SYNONYMS[logical] as readonly string[]).includes(normalise(c))) ?? null;

function sample(frameIndex: number, deg: Vec2 | null, flags = 0, perEngineDeg: GazeSample['perEngineDeg'] = {}): GazeSample {
  const px = deg === null ? null : degToPx(deg, GEOMETRY.screen, 600);
  return {
    frameIndex, tCaptureMs: 5000 + frameIndex * (1000 / 30), estimator: 'combined', rawDeg: deg, correctedDeg: deg,
    rawPx: px, correctedPx: px, filteredPx: px, perEngineDeg, flags, confidence: 0.87654321, distanceMm: 600,
  };
}

function rows(): SampleRow[] {
  const base = { trial: trialName('validation', 1), phase: 'validation', itemId: 'val-3', clock: 'captureTime' as const, headDeg: [1.5, -2.25, 0.125] as const, irisPx: 23.456, targetPx: [729.6, 540] as const, driftDeg: null };
  return [
    { ...base, deviceTiltDeg: 82.123456, deviceRollDeg: -3.5, sample: sample(0, [2, -3], 0, { blazegaze: [2.1, -3.1], geometric: [1.9, -2.9] }) },
    { ...base, sample: sample(1, [2, -3], Flags.EXTRAPOLATED) },
    { ...base, sample: sample(2, [2, -3], Flags.BLINK, { peekr: [2, -3] }) },
    { ...base, trial: trialName('live', 7), phase: 'live', itemId: null, targetPx: null, driftDeg: [0.5, 0.25], sample: sample(3, null, Flags.NO_FACE) },
  ];
}

const parse = (csv: string): string[][] => csv.trimEnd().split('\n').map((l) => l.split(','));

test('the header is the specification’s, in its order, and starts with no byte-order mark', () => {
  assert.equal(SAMPLES_HEADER.join(','), SPEC_HEADER);
  // The v0.4 columns keep their places: the tilt covariates only follow them.
  assert.ok(SAMPLES_HEADER.join(',').startsWith(`${V04_HEADER},`));
  const csv = samplesCsv(ID, rows(), GEOMETRY);
  assert.equal(csv.split('\n')[0], SPEC_HEADER);
  assert.ok(csv.startsWith('participant,'));
  assert.ok(SAMPLES_HEADER.includes('time_ms'));
  assert.ok(!csv.includes('\r'));
  assert.ok(csv.endsWith('\n'));
});

test("eek-a-gaze's first-match synonym rule finds the intended columns", () => {
  const header = [...SAMPLES_HEADER];
  assert.equal(findColumn(header, 'participant'), 'participant');
  assert.equal(findColumn(header, 'trial'), 'trial');
  assert.equal(findColumn(header, 'time'), 'time_ms');
  assert.equal(findColumn(header, 'gaze_x'), 'gaze_x');
  assert.equal(findColumn(header, 'gaze_y'), 'gaze_y');
  assert.equal(findColumn(header, 'gaze_x_left'), null);
  assert.equal(findColumn(header, 'gaze_x_right'), null);
  assert.equal(findColumn(header, 'pupil'), null);
  // The rule really is first-match: a synonym earlier in the header would win.
  assert.equal(findColumn(['sample', ...header], 'time'), 'sample');
});

test('times relative to session start; fixed decimals; degrees positive up', () => {
  const [header, valid] = parse(samplesCsv(ID, rows(), GEOMETRY)) as [string[], string[]];
  const col = (name: string): string => valid[header.indexOf(name)] as string;
  assert.equal(col('time_ms'), '0.000');
  assert.equal(col('frame_index'), '0');
  assert.equal(col('trial'), 'validation-1');
  assert.equal(col('estimator'), 'combined');
  const px = degToPx([2, -3], GEOMETRY.screen, 600);
  assert.equal(col('gaze_x'), px[0].toFixed(2));
  assert.equal(col('gaze_y'), px[1].toFixed(2));
  assert.ok(Number(col('gaze_y')) < 540, 'above the centre in px (y down)');
  assert.equal(col('gaze_x_deg'), '2.0000');
  assert.equal(col('gaze_y_deg'), '3.0000', 'positive up, as in eek-a-gaze');
  assert.equal(col('valid'), '1');
  assert.equal(col('flags'), '0');
  assert.equal(col('confidence'), '0.876543');
  assert.equal(col('target_x'), '729.60');
  assert.equal(col('head_pitch_deg'), '-2.2500');
  assert.equal(col('distance_mm'), '600.0');
  assert.equal(col('iris_px'), '23.46');
  assert.equal(col('clock'), 'captureTime');
  assert.equal(col('gaze_x_blazegaze'), degToPx([2.1, -3.1], GEOMETRY.screen, 600)[0].toFixed(2));
  assert.equal(col('gaze_y_geometric'), degToPx([1.9, -2.9], GEOMETRY.screen, 600)[1].toFixed(2));
  assert.equal(col('gaze_x_peekr'), '');
});

test('invalid frames have every gaze column empty; flags and drift remain', () => {
  const [header, , extrapolated, blink, live] = parse(samplesCsv(ID, rows(), GEOMETRY)) as string[][];
  const at = (row: string[] | undefined, name: string): string => (row as string[])[(header as string[]).indexOf(name)] as string;
  assert.equal(at(extrapolated, 'valid'), '1', 'EXTRAPOLATED alone does not invalidate');
  assert.equal(at(extrapolated, 'flags'), String(Flags.EXTRAPOLATED));
  assert.equal(at(blink, 'valid'), '0');
  assert.equal(at(blink, 'flags'), String(Flags.BLINK));
  for (const name of (header as string[]).filter((h) => h.startsWith('gaze_'))) assert.equal(at(blink, name), '', name);
  assert.equal(at(live, 'trial'), 'live-007');
  assert.equal(at(live, 'item_id'), '');
  assert.equal(at(live, 'drift_x_deg'), '0.5000');
  assert.equal(at(live, 'drift_y_deg'), '-0.2500', 'drift in the export convention too');
  assert.equal(at(live, 'target_x'), '');
});

test('the tilt covariates: degrees with four decimals, empty without a reading, never invalidated', () => {
  const [header, first, extrapolated, blink] = parse(samplesCsv(ID, rows(), GEOMETRY)) as string[][];
  const at = (row: string[] | undefined, name: string): string => (row as string[])[(header as string[]).indexOf(name)] as string;
  assert.deepEqual((header as string[]).slice(-2), ['device_tilt_deg', 'device_roll_deg']);
  assert.equal(at(first, 'device_tilt_deg'), '82.1235');
  assert.equal(at(first, 'device_roll_deg'), '-3.5000');
  assert.equal(at(extrapolated, 'device_tilt_deg'), '');
  assert.equal(at(blink, 'device_roll_deg'), '');
});

test('FrameRecorder stamps θ and roll from the reading nearest each capture, or null', () => {
  const schedule = calibrationSchedule({ preset: 'quick', seed: 3 });
  const readings = [
    { t: 100, tiltDeg: 80, rollDeg: 1 },
    { t: 140, tiltDeg: 81, rollDeg: 2 },
  ];
  const lookup = (t: number) => {
    const near = readings.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    return Math.abs(near.t - t) <= 500 ? near : null;
  };
  const meta = (index: number, tCaptureMs: number) => ({ index, tCaptureMs, clock: 'captureTime' as const, presentedFrames: index, cameraGap: 0, videoW: 640, videoH: 480 });
  const result = (index: number, t: number): FrameResult => ({ meta: meta(index, t), face: null as FaceObservation | null, engines: {}, workerMs: 1, receivedMs: t });
  const state = { hidden: false, notFullscreen: false, distanceMm: null };
  const own = new FrameRecorder('rec', schedule, GEOMETRY, { tilt: lookup });
  assert.deepEqual([own.addResult(result(0, 130), state).deviceTiltDeg, own.addResult(result(1, 130), state).deviceRollDeg], [81, 2]);
  assert.equal(own.addDropped(meta(2, 1000)).deviceTiltDeg, null, 'no reading within 500 ms');
  // The app sets one lookup for every recorder; without one the fields are null.
  setTiltLookup(lookup);
  try {
    assert.equal(new FrameRecorder('rec', schedule, GEOMETRY).addResult(result(0, 95), state).deviceTiltDeg, 80);
    assert.equal(new FrameRecorder('rec', schedule, GEOMETRY, { tilt: null }).addResult(result(0, 95), state).deviceTiltDeg, null);
  } finally {
    setTiltLookup(null);
  }
  assert.equal(new FrameRecorder('rec', schedule, GEOMETRY).addResult(result(0, 95), state).deviceRollDeg, null);
});

test('identical state gives byte-identical output; strings are quoted and UTF-8', () => {
  const a = samplesCsv(ID, rows(), GEOMETRY);
  const b = samplesCsv({ ...ID }, structuredClone(rows()), structuredClone(GEOMETRY));
  assert.deepEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
  const quoted = samplesCsv({ ...ID, participant: 'Zoë, "Z"' }, rows().slice(0, 1), GEOMETRY);
  assert.ok(quoted.split('\n')[1]?.startsWith('"Zoë, ""Z""",S1,'));
});

test('trial names', () => {
  assert.equal(trialName('calibration'), 'calibration');
  assert.equal(trialName('validation', 2), 'validation-2');
  assert.equal(trialName('drift', 3), 'drift-3');
  assert.equal(trialName('live', 12), 'live-012');
  assert.throws(() => trialName('drift', 0), RangeError);
});
