// WP3: the export bundle: targets, validation, cv and events tables, geometry.yaml, README.txt,
// session.json, and a zip that parses and is byte-identical for identical state.
import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import * as constants from '../../src/core/constants.ts';
import { detectEvents } from '../../src/core/events/idt.ts';
import { EEK_A_GAZE_COMMAND } from '../../src/core/export/readme.ts';
import { GEOMETRY_KEYS, geometryYaml } from '../../src/core/export/geometryYaml.ts';
import { canonicalJson, SESSION_SCHEMA, type SessionMeta } from '../../src/core/export/sessionJson.ts';
import { TARGETS_HEADER, targetsCsv } from '../../src/core/export/targetsCsv.ts';
import { CV_HEADER, EVENTS_HEADER, VALIDATION_HEADER, validationCsv } from '../../src/core/export/validationCsv.ts';
import { buildExport, EXPORT_FILES, exportZipName, zipFiles, type ExportInput } from '../../src/core/export/zip.ts';
import { trialName, type SampleRow } from '../../src/core/export/samplesCsv.ts';
import { degToPx, pxToDeg } from '../../src/core/geometry/angles.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { scoreValidation } from '../../src/core/metrics/validation.ts';
import { Flags } from '../../src/core/types.ts';
import type {
  CandidateScore,
  EngineFit,
  EstimatorId,
  FitResult,
  GazeSample,
  MappingState,
  Presentation,
  RecordedFrame,
  Recording,
  Schedule,
  SessionGeometry,
  TargetItem,
  Vec2,
} from '../../src/core/types.ts';

const DT = 1000 / 30;
const START = 10_000;
const GEOMETRY: SessionGeometry = {
  screen: { viewportWpx: 1920, viewportHpx: 1080, screenWpx: 1920, screenHpx: 1080, dpr: 1, fullscreen: true, pxPerMm: 1920 / 531, pxPerMmSource: 'card' },
  distance: { focalPx: 1100, focalSource: 'blind-spot', blindSpotMm: 610, blindSpotSdMm: 12, irisMm: 11.7 },
  refDistanceMm: 600,
  degreesApproximate: false,
};
const ID = { participant: 'P 01', session: 'S1', sessionStartMs: START };

function validationRecording(): Recording {
  const points: Vec2[] = [[0.15, 0.15], [0.85, 0.15], [0.38, 0.5], [0.62, 0.5], [0.15, 0.85], [0.85, 0.85]];
  const items: TargetItem[] = points.map(([xNorm, yNorm], k) => ({
    kind: 'target', id: `val-${k}`, phase: 'validation', block: 0, xNorm, yNorm, groupId: `val-${k}`, settleMs: 600, sampleMs: 1000, maxSampleMs: 1000,
  }));
  const presentations: Presentation[] = items.map((it, k) => ({ itemId: it.id, onsetMs: START + 2000 * k, offsetMs: START + 2000 * k + 1700, attempt: 1, frameIntervalMs: 16.667, aborted: false }));
  const frames: RecordedFrame[] = Array.from({ length: 360 }, (_, i) => ({
    meta: { index: i, tCaptureMs: START + i * DT, clock: 'captureTime', presentedFrames: i, cameraGap: 0, videoW: 1280, videoH: 720 },
    distanceMm: 600, yawDeg: 1, pitchDeg: -2, rollDeg: 0.5, eyeMidNorm: [0.5, 0.45], open: true, label: null,
    engines: { geometric: { engine: 'geometric', status: 'ok', x: Float32Array.from([0.1, 0.2]), prior: null, weight: 1, computeMs: 1.5 } },
  }));
  return { id: 'val-1', schedule: { seed: 7, preset: 'quick', kind: 'validation', items }, geometry: GEOMETRY, presentations, frames };
}

function samplesOf(rec: Recording, estimator: EstimatorId, biasDeg: Vec2, seed: number): GazeSample[] {
  const g = gaussian(mulberry32(seed));
  return rec.frames.map((f) => {
    const p = rec.presentations.find((q) => f.meta.tCaptureMs >= q.onsetMs && f.meta.tCaptureMs < q.offsetMs);
    const item = rec.schedule.items.find((it) => it.id === p?.itemId) as TargetItem | undefined;
    const t = item === undefined ? ([0, 0] as Vec2) : pxToDeg([item.xNorm * 1920, item.yNorm * 1080], GEOMETRY.screen, 600);
    const deg: Vec2 = [t[0] + biasDeg[0] + 0.3 * g(), t[1] + biasDeg[1] + 0.3 * g()];
    const px = degToPx(deg, GEOMETRY.screen, 600);
    return {
      frameIndex: f.meta.index, tCaptureMs: f.meta.tCaptureMs, estimator, rawDeg: deg, correctedDeg: deg, rawPx: px, correctedPx: px, filteredPx: px,
      perEngineDeg: { geometric: deg }, flags: f.meta.index % 50 === 7 ? Flags.BLINK : 0, confidence: 0.9, distanceMm: 600,
    };
  });
}

function mapping(engine: 'geometric' | 'blazegaze', lambdaRel: number): MappingState {
  return {
    schema: 'eek-a-calibrate/mapping@1', engine, mapper: engine === 'geometric' ? 'geo-linear' : 'prior-affine', featureVersion: 'v1', lambdaRel,
    mu: [0.1, -0.2], scale: [1, 2], zMin: [-3, -3], zMax: [3, 3], pca: null, B: [1, 0, 0, 1, 0.5, -0.5], A: [0.25, 0, 0, 0.25], h95: 0.12,
  };
}

function fit(order: 'forward' | 'reverse'): FitResult {
  const cv = { meanDeg: 2.1, seDeg: 0.3, perGroupMedianDeg: { 'loc-1': 1.9, 'loc-0': 2.2 }, nRows: 400, nGroups: 13, coverage: 0.97 };
  const candidates = (engine: 'geometric' | 'blazegaze'): CandidateScore[] =>
    [0.01, 0.1, 1].map((lambdaRel, k) => ({ mapper: mapping(engine, lambdaRel).mapper, lambdaRel, cv: { ...cv, meanDeg: 2 + k * 0.1 } }));
  const engineFit = (engine: 'geometric' | 'blazegaze'): EngineFit => ({
    engine, chosen: mapping(engine, 0.1), cv, candidates: candidates(engine), oofDeg: [1.5, 2.5], rowFrameIndex: [3, 4], nPruned: 2,
  });
  const fits: FitResult['fits'] = {};
  for (const e of order === 'forward' ? (['geometric', 'blazegaze'] as const) : (['blazegaze', 'geometric'] as const)) fits[e] = engineFit(e);
  return {
    schema: 'eek-a-calibrate/fit@1', seed: 7, pursuitLagMs: 99, refDistanceMm: 600, fits, combined: null,
    headRange: { yawDeg: [-10, 10], pitchDeg: [-8, 8], lnDistRatio: [-0.1, 0.1], eyeMidX: [0.4, 0.6], eyeMidY: [0.4, 0.6] },
    selection: { estimator: 'blazegaze', reason: 'lowest CV error', ranking: [{ estimator: 'blazegaze', meanDeg: 2, seDeg: 0.3 }] }, fitMs: 1234, warnings: [],
  };
}

function calibrationSchedule(): Schedule {
  return {
    seed: 7, preset: 'standard', kind: 'calibration',
    items: [
      { kind: 'instruction', id: 'intro', textKey: 'calibrate.intro' },
      { kind: 'target', id: 'cal-0', phase: 'fixation', block: 0, xNorm: 0.08, yNorm: 0.5, groupId: 'loc-0', settleMs: 600, sampleMs: 1000, maxSampleMs: 2500 },
      { kind: 'pursuit', id: 'pursuit', phase: 'pursuit', block: 1, periodMs: 16000, holdMs: 1000, discardMs: 500, ax: 0.42, ay: 0.42, phiX: 0, phiY: Math.PI / 2 },
    ],
  };
}

const META: SessionMeta = {
  app: { version: '0.1.0', commit: 'abc1234' },
  assets: { 'face-landmarker': '64184e22c9ff', 'peekr-model': '0123abcd' },
  environment: { userAgent: 'test', capabilities: { webgl2: true, wasmSimd: true } },
  host: { kind: 'worker', delegate: 'GPU', backends: { geometric: 'js', blazegaze: 'tfjs-webgl' } },
  camera: { settings: { width: 1280, height: 720, frameRate: 30 }, clock: 'captureTime' },
  protocol: { preset: 'quick', seeds: { calibration: 7, validation: 7 }, schedules: [calibrationSchedule()] },
  pursuitLagMs: 99,
  driftLog: [{ tMs: START + 60_000, offsetDeg: [0.4, -0.2], applied: true }],
  thresholds: { idtDispersionDeg: 1.5 },
  licences: { geometric: 'MIT' },
};

function input(exportedAt = new Date(Date.UTC(2026, 10, 1, 9, 30, 15)), order: 'forward' | 'reverse' = 'forward'): ExportInput {
  const rec = validationRecording();
  const combined = samplesOf(rec, 'combined', [0.5, 0.2], 1);
  const samples = new Map<EstimatorId, GazeSample[]>([['combined', combined], ['geometric', samplesOf(rec, 'geometric', [1, -0.5], 2)]]);
  const validations = [...scoreValidation(rec, samples, GEOMETRY, 'own', 30), ...scoreValidation(rec, samples, GEOMETRY, 'intersection', 30)];
  const rows: SampleRow[] = combined.map((s) => ({
    trial: trialName('validation', 1), phase: 'validation', itemId: null, sample: s, clock: 'captureTime', headDeg: [1, -2, 0.5], irisPx: 24, targetPx: null, driftDeg: null,
  }));
  const calibrationPresentations: Presentation[] = [
    { itemId: 'intro', onsetMs: START - 9000, offsetMs: START - 8000, attempt: 1, frameIntervalMs: 16.667, aborted: false },
    { itemId: 'cal-0', onsetMs: START - 8000, offsetMs: START - 6400, attempt: 1, frameIntervalMs: 16.667, aborted: false },
    { itemId: 'pursuit', onsetMs: START - 6000, offsetMs: START + 0, attempt: 1, frameIntervalMs: 16.667, aborted: true },
  ];
  return {
    identity: ID,
    exportedAt,
    geometry: GEOMETRY,
    samples: rows,
    targets: [
      { trial: 'calibration', schedule: calibrationSchedule(), presentations: calibrationPresentations },
      { trial: 'validation-1', schedule: rec.schedule, presentations: rec.presentations },
    ],
    validations,
    fit: fit(order),
    events: [{ trial: 'validation-1', estimator: 'combined', detection: detectEvents(combined, GEOMETRY, 0.3) }],
    session: META,
  };
}

const table = (csv: string): string[][] => csv.trimEnd().split('\n').map((l) => l.split(','));

test('the zip parses and holds every file, flat and in a fixed order', () => {
  const bundle = buildExport(input());
  assert.deepEqual(bundle.files.map((f) => f.name), EXPORT_FILES.filter((n) => n !== 'dataset.json' && n !== 'game.csv'));
  const unzipped = unzipSync(bundle.zip);
  assert.deepEqual(Object.keys(unzipped), bundle.files.map((f) => f.name));
  for (const f of bundle.files) assert.equal(strFromU8(unzipped[f.name] as Uint8Array), f.text, f.name);
  assert.equal(bundle.name, exportZipName('P 01', 'S1', new Date(Date.UTC(2026, 10, 1, 9, 30, 15))));
  const withDataset = buildExport({ ...input(), dataset: [{ trial: 'validation-1', recording: validationRecording() }] });
  assert.deepEqual(withDataset.files.map((f) => f.name), EXPORT_FILES.filter((n) => n !== 'game.csv'));
  const dataset = JSON.parse(strFromU8(unzipSync(withDataset.zip)['dataset.json'] as Uint8Array));
  assert.equal(dataset.schema, 'eek-a-calibrate/dataset@1');
  assert.equal(dataset.blocks[0].frames.length, 360);
  assert.equal(dataset.blocks[0].frames[0].timeMs, 0);
  assert.equal(dataset.blocks[0].frames[0].engines.geometric.x.length, 2);
  assert.ok(!('landmarks' in dataset.blocks[0].frames[0]));
});

test('identical state gives a byte-identical zip, whatever the build order or time zone', () => {
  const a = buildExport(input());
  const b = buildExport(structuredClone(input()));
  assert.deepEqual(a.zip, b.zip);
  const reversed = buildExport(input(undefined, 'reverse'));
  assert.deepEqual(reversed.zip, a.zip, 'fits inserted in another order serialise identically');
  const tz = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Auckland';
    const auckland = buildExport(input()).zip;
    process.env.TZ = 'America/Los_Angeles';
    assert.deepEqual(buildExport(input()).zip, auckland);
    assert.deepEqual(auckland, a.zip);
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});

test('a later export of the same state differs only in session.json exportedAt', () => {
  const a = buildExport(input());
  const later = buildExport(input(new Date(Date.UTC(2026, 10, 2, 14, 5, 0))));
  for (const [i, f] of a.files.entries()) {
    const g = later.files[i] as { name: string; text: string };
    if (f.name === 'session.json') {
      assert.notEqual(g.text, f.text);
      assert.equal(g.text.replace(/"exportedAt": "[^"]*"/, ''), f.text.replace(/"exportedAt": "[^"]*"/, ''));
    } else {
      assert.equal(g.text, f.text, f.name);
    }
  }
  assert.notEqual(later.name, a.name);
});

test('geometry.yaml: eek-a-gaze keys, origin top_left, units pixels', () => {
  const yaml = geometryYaml(GEOMETRY);
  assert.equal(
    yaml,
    'screen_width_px: 1920\nscreen_height_px: 1080\nscreen_width_mm: 531.0\nscreen_height_mm: 298.7\nviewing_distance_mm: 600.0\norigin: top_left\nunits: pixels\n',
  );
  assert.deepEqual(yaml.trimEnd().split('\n').map((l) => l.split(':')[0]), [...GEOMETRY_KEYS]);
  assert.throws(() => geometryYaml({ ...GEOMETRY, refDistanceMm: null }), RangeError);
  assert.throws(() => geometryYaml({ ...GEOMETRY, screen: { ...GEOMETRY.screen, viewportWpx: 1919.5 } }), RangeError);
});

test('README.txt lists the files and gives the eek-a-gaze command with --time-units ms', () => {
  const bundle = buildExport(input());
  const readme = bundle.files[0]?.text as string;
  assert.equal(EEK_A_GAZE_COMMAND, 'eek-a-gaze samples.csv --time-units ms --geometry geometry.yaml --units pixels');
  assert.ok(readme.includes(`  ${EEK_A_GAZE_COMMAND}\n`));
  for (const f of bundle.files) assert.ok(readme.includes(`\n${f.name} `), f.name);
  assert.ok(!readme.includes('dataset.json'));
  assert.ok(readme.includes('Participant: P 01'));
  assert.ok(!readme.includes('2026'), 'no time stamp');
  assert.ok(!readme.includes('\r'));
  assert.ok(readme.includes('the other *_ms columns are durations'));
  assert.ok(readme.includes('vertical gaze angles are positive downwards'));
});

test('session.json: schema, exportedAt, the fit, validations, paired differences and every threshold', () => {
  const bundle = buildExport(input());
  const text = bundle.files.find((f) => f.name === 'session.json')?.text as string;
  const s = JSON.parse(text);
  assert.equal(Object.keys(s)[0], 'schema');
  assert.equal(s.schema, SESSION_SCHEMA);
  assert.equal(s.exportedAt, '2026-11-01T09:30:15.000Z');
  assert.equal(s.participant, 'P 01');
  assert.equal(s.fit.schema, 'eek-a-calibrate/fit@1');
  assert.deepEqual(Object.keys(s.fit.fits), ['blazegaze', 'geometric']);
  assert.equal(s.selection.estimator, 'blazegaze');
  assert.equal(s.validations.length, 4);
  assert.equal(s.pairedDifferences.length, 2);
  assert.match(s.pairedDifferences[0].caveat, /4\.6°/);
  assert.deepEqual(s.thresholds.appendixA.EVENTS, constants.EVENTS);
  assert.deepEqual(s.thresholds.appendixA.VERDICT, constants.VERDICT);
  assert.equal(s.thresholds.session.idtDispersionDeg, 1.5);
  assert.deepEqual(s.weights, constants.WEIGHTS);
  assert.equal(s.geometry.uncertainty, null);
  assert.equal(s.validations[0].latencyMs, null, 'NaN is written as null');
  assert.deepEqual(s.driftLog, [{ applied: true, offsetDeg: [0.4, -0.2], source: 'check', timeMs: 60_000 }], 'drift times relative to session start; a check by default');
  assert.ok(text.endsWith('}\n'));
});

test('canonical JSON: sorted keys, typed arrays, and loud failures', () => {
  assert.equal(canonicalJson({ b: 1, a: [Float32Array.from([0.5]), -0], c: undefined, d: Number.NaN }), '{\n  "a": [\n    [\n      0.5\n    ],\n    0\n  ],\n  "b": 1,\n  "d": null\n}\n');
  assert.equal(canonicalJson({ z: 1, a: 2 }, true), '{\n  "z": 1,\n  "a": 2\n}\n');
  assert.throws(() => canonicalJson({ m: new Map() }), TypeError);
  assert.throws(() => canonicalJson({ f: () => 1 }), TypeError);
  assert.throws(() => canonicalJson([1, undefined]), TypeError);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), TypeError);
  const shared = { x: 1 };
  assert.doesNotThrow(() => canonicalJson({ a: shared, b: shared }), 'a shared object is not a cycle');
});

test('targets.csv: one row per presentation, positions or pursuit parameters, instructions skipped', () => {
  const t = table(targetsCsv(ID, input().targets, GEOMETRY.screen));
  assert.deepEqual(t[0], [...TARGETS_HEADER]);
  assert.equal(t.length, 1 + 2 + 6);
  const col = (row: string[], name: string): string => row[TARGETS_HEADER.indexOf(name as (typeof TARGETS_HEADER)[number])] as string;
  const [cal, pursuit, val0] = [t[1], t[2], t[3]] as string[][];
  assert.deepEqual([col(cal, 'trial'), col(cal, 'id'), col(cal, 'phase'), col(cal, 'x_px'), col(cal, 'y_px')], ['calibration', 'cal-0', 'fixation', '153.60', '540.00']);
  assert.equal(col(cal, 'onset_ms'), '-8000.000');
  assert.equal(col(cal, 'frame_uncertainty_ms'), '16.667');
  assert.equal(col(cal, 'pursuit_period_ms'), '');
  assert.deepEqual([col(pursuit, 'x_px'), col(pursuit, 'pursuit_period_ms'), col(pursuit, 'pursuit_ax'), col(pursuit, 'pursuit_phi_y_rad'), col(pursuit, 'aborted')], ['', '16000.000', '0.42', '1.5708', '1']);
  assert.deepEqual([col(val0, 'trial'), col(val0, 'onset_ms'), col(val0, 'offset_ms'), col(val0, 'attempt')], ['validation-1', '0.000', '1700.000', '1']);
  const broken = { trial: 'x', schedule: calibrationSchedule(), presentations: [{ itemId: 'nope', onsetMs: 0, offsetMs: 1, attempt: 1, frameIntervalMs: 16, aborted: false }] };
  assert.throws(() => targetsCsv(ID, [broken], GEOMETRY.screen), RangeError);
});

test('validation.csv: target rows for every estimator × mode, then the summary rows', () => {
  const ex = input();
  const v = table(buildExport(ex).files.find((f) => f.name === 'validation.csv')?.text as string);
  assert.deepEqual(v[0], [...VALIDATION_HEADER]);
  const body = v.slice(1);
  const kinds = body.map((r) => r[2]);
  assert.equal(kinds.filter((k) => k === 'target').length, 4 * 6);
  assert.deepEqual(kinds.slice(24), ['summary', 'summary', 'summary', 'summary']);
  assert.ok(kinds.slice(0, 24).every((k) => k === 'target'));
  const col = (row: string[], name: string): string => row[VALIDATION_HEADER.indexOf(name as (typeof VALIDATION_HEADER)[number])] as string;
  const first = body[0] as string[];
  const report = ex.validations[0];
  assert.ok(report !== undefined);
  assert.deepEqual([col(first, 'estimator'), col(first, 'mode'), col(first, 'item_id')], ['combined', 'own', 'val-0']);
  assert.equal(col(first, 'offset_y_deg'), (-(report.targets[0]?.offsetDeg[1] as number)).toFixed(4), 'offsets positive up');
  assert.equal(col(first, 'accuracy_mean_deg'), '');
  const summary = body[24] as string[];
  assert.equal(col(summary, 'accuracy_mean_deg'), report.accuracyMeanDeg.toFixed(4));
  assert.equal(col(summary, 'verdict'), report.verdict);
  assert.equal(col(summary, 'latency_ms'), '', 'NaN latency is empty');
  assert.equal(col(summary, 'valid'), String(report.targets.reduce((a, t) => a + t.funnel.valid, 0)));
  assert.equal(col(summary, 'item_id'), '');
  const timed = table(validationCsv([{ ...report, latencyMs: 27.1234567 }]));
  assert.equal(col(timed[timed.length - 1] as string[], 'latency_ms'), '27.123', 'milliseconds have 3 decimals');
});

test('cv.csv and events.csv', () => {
  const bundle = buildExport(input());
  const cv = table(bundle.files.find((f) => f.name === 'cv.csv')?.text as string);
  assert.deepEqual(cv[0], [...CV_HEADER]);
  assert.deepEqual(cv.slice(1).map((r) => [r[0], r[1], r[2], r[8]]), [
    ['blazegaze', 'prior-affine', '0.01', '0'], ['blazegaze', 'prior-affine', '0.1', '1'], ['blazegaze', 'prior-affine', '1', '0'],
    ['geometric', 'geo-linear', '0.01', '0'], ['geometric', 'geo-linear', '0.1', '1'], ['geometric', 'geo-linear', '1', '0'],
  ]);
  const ev = table(bundle.files.find((f) => f.name === 'events.csv')?.text as string);
  assert.deepEqual(ev[0], [...EVENTS_HEADER]);
  const fixations = ev.slice(1).filter((r) => r[4] === 'fixation');
  assert.ok(fixations.length >= 6, `${fixations.length} fixations`);
  assert.ok(ev.slice(1).every((r) => ['fixation', 'saccade', 'blink', 'bad_data'].includes(r[4] as string)));
  const top = fixations[0] as string[];
  assert.ok(Number(top[EVENTS_HEADER.indexOf('centroid_y_deg')]) > 0, 'a target in the top row is positive up');
  assert.ok(Number(top[EVENTS_HEADER.indexOf('centroid_y')]) < 540, 'and above the centre in px');
  assert.equal(top[EVENTS_HEADER.indexOf('dispersion_threshold_deg')], '1.5000');
});

test('zip names and entry checks', () => {
  assert.equal(exportZipName('P 01/x', 'S1', new Date(2026, 10, 1, 9, 5)), 'eek-a-calibrate_P-01-x_S1_20261101-0905.zip');
  assert.equal(exportZipName('', '../..', new Date(2026, 0, 2, 23, 59)), 'eek-a-calibrate_none_none_20260102-2359.zip');
  assert.throws(() => zipFiles([{ name: '../evil.txt', data: 'x' }]), RangeError);
  assert.throws(() => zipFiles([{ name: 'a.txt', data: 'x' }, { name: 'a.txt', data: 'y' }]), RangeError);
  const zipped = zipFiles([{ name: 'a.txt', data: 'Zoë\n' }, { name: 'b.bin', data: Uint8Array.from([1, 2, 3]) }]);
  // The first local header's DOS time and date: 00:00:00 on 1980-01-01, never the export time.
  assert.deepEqual([...zipped.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...zipped.slice(10, 14)], [0x00, 0x00, 0x21, 0x00]);
  const z = unzipSync(zipped);
  assert.equal(strFromU8(z['a.txt'] as Uint8Array), 'Zoë\n');
  assert.deepEqual([...(z['b.bin'] as Uint8Array)], [1, 2, 3]);
});
