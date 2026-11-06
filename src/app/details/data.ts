// Details → Data (design §2.17; spec §17.2.1, §4.15, §4.16, §17.10): the export zip (with the
// per-frame features of dataset.json as an option), what is saved on this device (stored
// warm-ups, session summaries and best scores, each with what it is), the participant and session
// IDs (editable before a warm-up), and the saving of a session summary. "Delete all my data" is
// in the sheet's footer.
//
// The export is built here. Challenge rounds (§17.10.1) join it as the trials game-<nnn> of
// samples.csv and targets.csv, the rows of game.csv and the game member of session.json.
// The zip is assembled file by file rather than with buildExport, which writes everything or nothing:
// geometry.yaml cannot be written without D_ref and events cannot be detected without a finite
// SD₂d, and the rest of the export must still be produced, with README.txt saying what was left
// out (§15.2.2) and when degree values are approximate (§14.1.6).
import type { ExportIdentity } from '../../core/export/csv.ts';
import { csvTable, fmtInt, fmtMs, relMs } from '../../core/export/csv.ts';
import { geometryYaml } from '../../core/export/geometryYaml.ts';
import { gameCsv } from '../../core/export/gameCsv.ts';
import { readmeText } from '../../core/export/readme.ts';
import { samplesCsv, trialName, type SampleRow } from '../../core/export/samplesCsv.ts';
import { datasetJson, sessionJson, type DatasetBlock, type SessionMeta } from '../../core/export/sessionJson.ts';
import { targetsCsv } from '../../core/export/targetsCsv.ts';
import { cvCsv, eventsCsv, validationCsv, type EventsBlock } from '../../core/export/validationCsv.ts';
import { EXPORT_FILES, exportZipName, zipFiles } from '../../core/export/zip.ts';
import { ESTIMATOR_NAMES } from '../../core/calibration/select.ts';
import { detectEvents, idtDispersionDeg, idtSd2dDeg } from '../../core/events/idt.ts';
import { OneEuroFilter2D } from '../../core/filters/oneEuro.ts';
import { degToPx } from '../../core/geometry/angles.ts';
import { layoutToPx } from '../../core/geometry/screen.ts';
import { pursuitTargetAt } from '../../core/protocol/pursuit.ts';
import { ENGINE_IDS, Flags, INVALID_MASK } from '../../core/types.ts';
import type { BackendId, EngineId, EstimatorId, FitResult, FrameMeta, GazeSample, RecordedFrame, Recording, SessionGeometry, Vec2 } from '../../core/types.ts';
import { frameBaseFlags, restoreEstimatorSet } from '../../fit/fitClient.ts';
import { listProfiles, listScores, listSessions, onDataDeleted, saveSession, storageStatus, type ProfileRecord, type ScoreRecord, type SessionRecord } from '../../platform/storage.ts';
import { announce, h } from '../dom.ts';
import { currentValidationRun, gameRecord } from '../session.ts';
import { registerDetailsTab, type DetailsPage, type PageContext } from '../shell/detailsSheet.ts';
import { getState, setState, type Settings } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { setupRecord } from '../game/setupRecord.ts';
import { assetHashes, sessionRecords, type GameBlock, type LiveBlock, type SessionBlock } from '../game/liveSession.ts';
import { warmupHistory } from '../game/gameState.ts';
import { actionRow, checkRow, note, para, reading, sheetPage } from './page.ts';
import { engineSpecs } from './settings.ts';

// ----- Export -----------------------------------------------------------------------------

/** One recording of the session as exported: its trial name, the fit and corrections in effect. */
interface ExportRecording {
  trial: string;
  recording: Recording;
  fit: FitResult;
  corrections: Partial<Record<EstimatorId, Vec2>>;
  irisPx: ReadonlyMap<number, number>;
}

interface ExportLive {
  block: LiveBlock;
}

interface ExportGame {
  game: GameBlock;
}

export interface Omission {
  file: string;
  reason: string;
}

export interface SessionExport {
  name: string;
  zip: Uint8Array;
  files: { name: string; text: string }[];
  omitted: Omission[];
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Drops the header line of a CSV written by csvTable, so blocks written one by one can be joined. */
function bodyOf(csv: string): string {
  const nl = csv.indexOf('\n');
  return nl < 0 ? '' : csv.slice(nl + 1);
}

function headerOf(csv: string): string {
  const nl = csv.indexOf('\n');
  return nl < 0 ? csv : csv.slice(0, nl + 1);
}

/**
 * The export geometry of one block: the block's own viewport (the pixels refer to it), the
 * current screen scale and distance model, and the current D_ref (§14.1.3).
 */
function blockGeometry(blockScreen: SessionGeometry['screen'], now: SessionGeometry): SessionGeometry {
  return {
    screen: { ...blockScreen, pxPerMm: now.screen.pxPerMm, pxPerMmSource: now.screen.pxPerMmSource },
    distance: { ...now.distance },
    refDistanceMm: now.refDistanceMm,
    degreesApproximate: now.degreesApproximate,
  };
}

/** f_now / f_then: D_t was computed with the focal length of its time and scales with it. */
function focalRatio(now: SessionGeometry, then: SessionGeometry): number {
  const r = now.distance.focalPx / then.distance.focalPx;
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/** Frames in capture order with D_t rescaled to the current focal length. */
function rescaled(frames: readonly RecordedFrame[], ratio: number): RecordedFrame[] {
  const sorted = [...frames].sort((a, b) => a.meta.index - b.meta.index);
  if (ratio === 1) return sorted;
  return sorted.map((f) => ({ ...f, distanceMm: positive(f.distanceMm) ? f.distanceMm * ratio : f.distanceMm }));
}

/** The estimator a block is exported for: the one in use now, where the block's fit has it. */
function exportEstimator(fit: FitResult, wanted: EstimatorId): EstimatorId {
  if (wanted === 'combined') return fit.combined ? 'combined' : fit.selection.estimator;
  return fit.fits[wanted] ? wanted : fit.selection.estimator;
}

function targetAt(rec: Recording, f: RecordedFrame): Vec2 | null {
  const label = f.label;
  if (!label) return null;
  const item = rec.schedule.items.find((i) => i.id === label.itemId);
  if (!item || item.kind === 'instruction') return null;
  if (item.kind === 'target') return layoutToPx(item.xNorm, item.yNorm, rec.geometry.screen);
  const t0 = f.meta.tCaptureMs - label.tRelMs;
  const p = pursuitTargetAt(item, t0, f.meta.tCaptureMs);
  return layoutToPx(p[0], p[1], rec.geometry.screen);
}

interface BlockOut {
  trial: string;
  samples: GazeSample[];
  rows: SampleRow[];
  geometry: SessionGeometry;
  estimator: EstimatorId;
}

function recordingRows(r: ExportRecording, now: SessionGeometry, wanted: EstimatorId): BlockOut {
  const g = blockGeometry(r.recording.geometry.screen, now);
  const frames = rescaled(r.recording.frames, focalRatio(now, r.recording.geometry));
  const id = exportEstimator(r.fit, wanted);
  const set = restoreEstimatorSet(r.fit, g);
  const correction = r.corrections[id] ?? null;
  if (correction) set.setDrift(correction);
  const est = set.estimator(id);
  const samples: GazeSample[] = [];
  const rows: SampleRow[] = frames.map((f) => {
    const s = est.estimate(f, frameBaseFlags(f));
    samples.push(s);
    return {
      trial: r.trial,
      phase: f.label?.phase ?? null,
      itemId: f.label?.itemId ?? null,
      sample: s,
      clock: f.meta.clock,
      headDeg: f.yawDeg !== null && f.pitchDeg !== null && f.rollDeg !== null ? [f.yawDeg, f.pitchDeg, f.rollDeg] : null,
      irisPx: r.irisPx.get(f.meta.index) ?? null,
      targetPx: targetAt(r.recording, f),
      driftDeg: correction,
      deviceTiltDeg: f.deviceTiltDeg ?? null,
      deviceRollDeg: f.deviceRollDeg ?? null,
    };
  });
  return { trial: r.trial, samples, rows, geometry: g, estimator: id };
}

/** Live rows, with the One Euro stream of §4.11 run again over the valid samples (deterministic). */
function liveRows(b: LiveBlock, now: SessionGeometry, wanted: EstimatorId): BlockOut {
  const g = blockGeometry(b.geometry.screen, now);
  const frames = rescaled(b.frames, focalRatio(now, b.geometry));
  const id = exportEstimator(b.fit, wanted);
  const set = restoreEstimatorSet(b.fit, g);
  const correction = b.corrections[id] ?? null;
  if (correction) set.setDrift(correction);
  const est = set.estimator(id);
  const filter = new OneEuroFilter2D();
  const samples: GazeSample[] = [];
  const rows: SampleRow[] = frames.map((f) => {
    const extra = b.extraFlags.get(f.meta.index) ?? 0;
    const base = (extra & Flags.DROPPED) !== 0 ? extra : frameBaseFlags(f) | extra;
    const raw = est.estimate(f, base);
    let filteredPx: Vec2 | null = null;
    if ((raw.flags & INVALID_MASK) === 0 && raw.correctedDeg) {
      const d = positive(raw.distanceMm) ? raw.distanceMm : (g.refDistanceMm as number);
      filteredPx = degToPx(filter.filter(raw.correctedDeg[0], raw.correctedDeg[1], raw.tCaptureMs), g.screen, d);
    }
    const s: GazeSample = { ...raw, filteredPx };
    samples.push(s);
    return {
      trial: b.trial,
      phase: 'live',
      itemId: null,
      sample: s,
      clock: f.meta.clock,
      headDeg: f.yawDeg !== null && f.pitchDeg !== null && f.rollDeg !== null ? [f.yawDeg, f.pitchDeg, f.rollDeg] : null,
      irisPx: b.irisPx.get(f.meta.index) ?? null,
      targetPx: null,
      driftDeg: correction,
      deviceTiltDeg: f.deviceTiltDeg ?? null,
      deviceRollDeg: f.deviceRollDeg ?? null,
    };
  });
  return { trial: b.trial, samples, rows, geometry: g, estimator: id };
}

/** The bubble on screen at a capture time (the last track point at or before it), for samples.csv. */
function trackAt(track: GameBlock['track'], tMs: number): GameBlock['track'][number] | null {
  let lo = 0;
  let hi = track.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((track[mid] as GameBlock['track'][number]).tMs <= tMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? (track[found] as GameBlock['track'][number]) : null;
}

/** A challenge round's rows (phase game): as Live's, with the bubble's id and its centre at each frame. */
function gameRows(b: GameBlock, now: SessionGeometry, wanted: EstimatorId): BlockOut {
  const frames = [...b.frames].sort((x, y) => x.meta.index - y.meta.index);
  // Each stretch between Re-aims is computed with the corrections it was played with.
  const cuts = [{ fromIndex: Number.NEGATIVE_INFINITY, corrections: b.corrections }, ...b.segments];
  const parts = cuts.map((c, k) => {
    const until = cuts[k + 1]?.fromIndex ?? Number.POSITIVE_INFINITY;
    return liveRows({ ...b, kind: 'live', markers: [], corrections: c.corrections, frames: frames.filter((f) => f.meta.index >= c.fromIndex && f.meta.index < until) }, now, wanted);
  });
  const out: BlockOut = { ...(parts[0] as BlockOut), samples: parts.flatMap((p) => p.samples), rows: parts.flatMap((p) => p.rows) };
  const rows = out.rows.map((r, k) => {
    const at = trackAt(b.track, (frames[k] as RecordedFrame).meta.tCaptureMs);
    const shown = at && at.itemId !== null ? at : null;
    return { ...r, phase: 'game', itemId: shown?.itemId ?? null, targetPx: shown ? ([shown.x, shown.y] as Vec2) : null };
  });
  return { ...out, rows };
}

/** Samples in strictly increasing capture time, as event detection requires. */
function increasing(samples: readonly GazeSample[]): GazeSample[] {
  const out: GazeSample[] = [];
  for (const s of [...samples].sort((a, b) => a.tCaptureMs - b.tCaptureMs)) {
    const last = out[out.length - 1];
    if (!last || s.tCaptureMs > last.tCaptureMs) out.push(s);
  }
  return out;
}

export interface ExportOptions {
  includeDataset: boolean;
  exportedAt?: Date;
}

/** Whether there is anything to export, and why not. */
export function exportAvailability(): { ok: true } | { ok: false; reason: string } {
  const { geometry, fit } = getState();
  if (!fit) return { ok: false, reason: t('data.export.noFit') };
  if (!geometry || !positive(geometry.refDistanceMm)) return { ok: false, reason: t('data.export.noRef') };
  return { ok: true };
}

/**
 * Builds the session's export: samples, targets, validation, CV, events and markers, geometry,
 * session.json and README.txt (and dataset.json when asked). A file that cannot be written is
 * left out and named in README.txt with the reason; the others are still written.
 */
export async function buildSessionExport(opts: ExportOptions): Promise<SessionExport> {
  const state = getState();
  const fitNow = state.fit;
  const now = state.geometry;
  if (!fitNow || !now) throw new Error(t('data.export.noFit'));
  const records = sessionRecords();
  const identity: ExportIdentity = { participant: state.settings.pid, session: state.settings.session, sessionStartMs: state.clock.startPerfMs };
  const exportedAt = opts.exportedAt ?? new Date();
  const wanted: EstimatorId = state.estimator ?? fitNow.selection.estimator;
  const omitted: Omission[] = [];
  const notes: string[] = [];

  // The session's recordings, in the order they were made.
  const baseFit = records?.lineage[0] ?? fitNow;
  const calibration = records ? (records.base?.calibration ?? null) : state.calibration;
  const firstValidation = records ? (records.base?.validation ?? null) : currentValidationRun();
  const protocol: ExportRecording[] = [];
  if (calibration) protocol.push({ trial: trialName('calibration'), recording: calibration, fit: baseFit, corrections: {}, irisPx: new Map() });
  if (firstValidation) protocol.push({ trial: trialName('validation', 1), recording: firstValidation.recording, fit: baseFit, corrections: {}, irisPx: new Map() });
  const blocks: SessionBlock[] = records ? [...records.blocks] : [];
  const ordered: (ExportRecording | ExportLive | ExportGame)[] = [...protocol];
  for (const b of blocks) {
    if (b.kind === 'live') ordered.push({ block: b });
    else if (b.kind === 'game') ordered.push({ game: b });
    else ordered.push({ trial: b.trial, recording: b.recording, fit: b.fit, corrections: b.corrections, irisPx: b.irisPx });
  }
  const outs: BlockOut[] = ordered.map((o) => ('block' in o ? liveRows(o.block, now, wanted) : 'game' in o ? gameRows(o.game, now, wanted) : recordingRows(o, now, wanted)));
  const recordingsOnly = ordered.filter((o): o is ExportRecording => 'recording' in o);
  const games = blocks.filter((b): b is GameBlock => b.kind === 'game');
  const geometryForFile: SessionGeometry = blockGeometry(fitNow.fitGeometry?.screen ?? now.screen, now);

  const files: { name: string; text: string }[] = [];
  const add = (name: string, make: () => string): void => {
    try {
      files.push({ name, text: make() });
    } catch (error) {
      omitted.push({ file: name, reason: errorText(error) });
    }
  };

  add('samples.csv', () => {
    const parts = outs.map((o) => samplesCsv(identity, o.rows, o.geometry));
    const header = parts.length > 0 ? headerOf(parts[0] as string) : samplesCsv(identity, [], geometryForFile);
    return header + parts.map(bodyOf).join('');
  });
  add('targets.csv', () => {
    const parts = ordered.flatMap((o) => {
      if ('recording' in o) return [targetsCsv(identity, [{ trial: o.trial, schedule: o.recording.schedule, presentations: o.recording.presentations }], o.recording.geometry.screen)];
      if (!('game' in o)) return [];
      const g = o.game;
      const presentations = g.presentations.map((p) => ({ itemId: p.itemId, onsetMs: p.onsetMs, offsetMs: p.offsetMs, attempt: 1, frameIntervalMs: Number.NaN, aborted: false }));
      return [targetsCsv(identity, [{ trial: g.trial, schedule: { items: g.items }, presentations }], g.geometry.screen)];
    });
    const header = headerOf(targetsCsv(identity, [], geometryForFile.screen));
    return header + parts.map(bodyOf).join('');
  });
  add('validation.csv', () => validationCsv(state.validation ?? []));
  add('cv.csv', () => cvCsv(fitNow));

  // Events: θ_D needs SD₂d from the latest validation of the estimator in use (§4.14).
  let sd2d = Number.NaN;
  const validationRun = currentValidationRun();
  if (validationRun) {
    try {
      const g = blockGeometry(validationRun.recording.geometry.screen, now);
      const id = exportEstimator(fitNow, wanted);
      const est = restoreEstimatorSet(fitNow, g).estimator(id);
      const samples = rescaled(validationRun.recording.frames, focalRatio(now, validationRun.recording.geometry)).map((f) => est.estimate(f, frameBaseFlags(f)));
      sd2d = idtSd2dDeg(validationRun.recording, samples);
    } catch (error) {
      console.warn('SD₂d could not be computed', error);
    }
  }
  const eventBlocks: EventsBlock[] = [];
  if (Number.isFinite(sd2d)) {
    for (const o of outs) {
      try {
        eventBlocks.push({ trial: o.trial, estimator: o.estimator, detection: detectEvents(increasing(o.samples), o.geometry, sd2d) });
      } catch (error) {
        notes.push(t('data.readme.eventsBlock', { trial: o.trial, reason: errorText(error) }));
      }
    }
    add('events.csv', () => eventsCsv(identity, eventBlocks));
  } else {
    omitted.push({ file: 'events.csv', reason: t('data.readme.noSd2d') });
  }

  if (games.length > 0) add('game.csv', () => gameCsv(identity, games.map((g) => ({ trial: g.trial, round: g.round.round, key: g.round.key, records: g.records }))));

  const markerRows = blocks.flatMap((b) => (b.kind === 'live' ? b.markers.map((m) => [identity.participant, identity.session, b.trial, fmtInt(m.n), fmtMs(relMs(identity, m.tMs))]) : []));
  if (markerRows.length > 0) add('markers.csv', () => csvTable(['participant', 'session', 'trial', 'marker', 'time_ms'], markerRows));

  // geometry.yaml takes whole CSS px; the visual viewport of viewport mode (phones) can be fractional.
  const yamlScreen = { ...geometryForFile.screen, viewportWpx: Math.round(geometryForFile.screen.viewportWpx), viewportHpx: Math.round(geometryForFile.screen.viewportHpx) };
  add('geometry.yaml', () => geometryYaml({ ...geometryForFile, screen: yamlScreen }));

  const setup = setupRecord();
  const specs = await engineSpecs();
  const assets = await assetHashes().catch((error: unknown) => {
    notes.push(t('data.readme.noAssets', { reason: errorText(error) }));
    return {} as Record<string, string>;
  });
  const clocks = new Set<FrameMeta['clock']>(outs.flatMap((o) => o.rows.map((r) => r.clock)));
  const backends: Partial<Record<EngineId, BackendId>> = {};
  for (const e of setup.engines) if (e.ok && e.backend) backends[e.id] = e.backend as BackendId;
  const schedules = recordingsOnly.map((r) => r.recording.schedule);
  const hadPursuit = calibration?.schedule.items.some((i) => i.kind === 'pursuit') ?? false;
  const meta: SessionMeta = {
    app: { version: __APP_VERSION__, commit: __APP_COMMIT__ },
    assets,
    environment: {
      userAgent: navigator.userAgent,
      // `game`: the Title's set-up choice and the motion sensor's permission state (§17.4).
      capabilities: { report: setup.capabilities, deviceClass: setup.deviceClass, eyewear: state.prefs.glasses ?? setup.eyewear, probe: setup.probe, runSet: setup.runSet, game: gameRecord() },
    },
    // An unknown delegate is written as null rather than guessed.
    host: { kind: setup.host?.kind ?? 'worker', delegate: (setup.host?.delegate ?? null) as 'GPU' | 'CPU', backends, info: { ...setup.host, engines: setup.engines } },
    camera: { settings: setup.camera, clock: clocks.size === 1 ? ([...clocks][0] as FrameMeta['clock']) : 'mixed' },
    geometryUncertainty: {
      pxPerMmSource: now.screen.pxPerMmSource,
      focalSource: now.distance.focalSource,
      blindSpotMm: now.distance.blindSpotMm,
      blindSpotSdMm: now.distance.blindSpotSdMm,
      degreesApproximate: now.degreesApproximate,
      fitGeometry: fitNow.fitGeometry ?? null,
    },
    protocol: { preset: state.settings.preset, seeds: { session: state.settings.seed }, schedules },
    pursuitLagMs: hadPursuit ? fitNow.pursuitLagMs : null,
    driftLog: records?.driftLog ?? [],
    thresholds: {
      eventsSd2dDeg: Number.isFinite(sd2d) ? sd2d : null,
      eventsDispersionDeg: Number.isFinite(sd2d) ? idtDispersionDeg(sd2d) : null,
      driftEveryMin: state.settings.driftEveryMin,
      restoredProfile: records?.restored ? { key: records.restored.key, validated: records.restored.validated } : null,
      liveRecordings: blocks.filter((b): b is LiveBlock => b.kind === 'live').map((b) => ({ trial: b.trial, estimator: b.estimator, startMs: relMs(identity, b.startMs), endMs: relMs(identity, b.endMs ?? undefined), markers: b.markers.length })),
    },
    game: {
      ...gameRecord(),
      warmupLength: state.settings.preset,
      warmups: warmupHistory().map((w) => ({
        mode: w.mode,
        preset: w.preset,
        levels: w.log.map((l) => ({ key: l.key, number: l.number, of: l.of, skipped: l.skipped, retried: l.retried, steadiness: l.steadiness, pauses: l.pauses.map((x) => ({ reason: x.reason, timeMs: relMs(identity, x.atMs) })) })),
        estimator: w.estimator,
        verdict: w.verdict,
        zones: w.zones,
        needDeg: w.needDeg,
        stars: w.stars,
        outcome: w.outcome,
        cause: w.cause,
        marks: w.marks,
        viewport: w.viewport,
        restoreRejected: w.restoreRejected,
        timeMs: relMs(identity, w.atMs),
      })),
      rounds: games.map((g) => ({ ...g.round, startMs: relMs(identity, g.startMs), endMs: relMs(identity, g.endMs ?? undefined) })),
      offsetCorrections: (records?.driftLog ?? []).filter((e) => e.source === 'game').map((e) => ({ timeMs: relMs(identity, e.tMs), offsetDeg: e.offsetDeg, applied: e.applied })),
    },
    licences: {
      app: 'MIT',
      faceLandmarker: { package: '@mediapipe/tasks-vision 0.10.35', code: 'Apache-2.0', model: 'Apache-2.0' },
      engines: Object.fromEntries(ENGINE_IDS.filter((e) => specs[e]).map((e) => [e, { name: specs[e]!.displayName, version: specs[e]!.version, licence: specs[e]!.licence, citation: specs[e]!.citation, source: specs[e]!.sourceUrl }])),
    },
  };
  add('session.json', () => sessionJson({ ...meta, identity, exportedAt, geometry: geometryForFile, fit: fitNow, validations: state.validation ?? [] }));
  if (opts.includeDataset) {
    const dataset: DatasetBlock[] = recordingsOnly.map((r) => ({ trial: r.trial, recording: r.recording }));
    add('dataset.json', () => datasetJson(identity, dataset));
  }

  // README.txt: the export module's text, then what this export adds or leaves out.
  const order = [...EXPORT_FILES.slice(0, 6), 'markers.csv', ...EXPORT_FILES.slice(6)];
  const written = order.filter((n) => n === 'README.txt' || files.some((f) => f.name === n));
  const extra: string[] = [];
  if (geometryForFile.degreesApproximate) extra.push(t('data.readme.approximate'));
  if (files.some((f) => f.name === 'markers.csv')) extra.push(t('data.readme.markers'));
  extra.push(t('data.readme.filtered'));
  for (const o of omitted) extra.push(t('data.readme.omitted', { file: o.file, reason: o.reason }));
  extra.push(...notes);
  const readme =
    readmeText({ participant: identity.participant, session: identity.session, appVersion: __APP_VERSION__, appCommit: __APP_COMMIT__, files: written }) +
    ['', t('data.readme.title'), '-'.repeat(t('data.readme.title').length), ...extra.map((line) => `- ${line}`), ''].join('\n');
  const all = [{ name: 'README.txt', text: readme }, ...files];
  const sorted = written.map((n) => all.find((f) => f.name === n) as { name: string; text: string });
  return { name: exportZipName(identity.participant, identity.session, exportedAt), zip: zipFiles(sorted.map((f) => ({ name: f.name, data: f.text }))), files: sorted, omitted };
}

/** Hands the zip to the browser as a download (nothing leaves the device). */
export function download(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  // The browser has taken the download by the next task; the URL is released a little later.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}


// ----- Stored records ---------------------------------------------------------------------

function accuracyOf(s: { accuracyPctDiag: number | null; accuracyDeg: number | null; degreesApproximate: boolean }): string {
  const diag = s.accuracyPctDiag !== null && Number.isFinite(s.accuracyPctDiag) ? t('results.unit.diag', { value: s.accuracyPctDiag.toFixed(1) }) : t('details.none');
  const deg = s.accuracyDeg !== null && Number.isFinite(s.accuracyDeg) ? `${s.degreesApproximate ? '≈' : ''}${s.accuracyDeg.toFixed(2)}°` : t('details.none');
  return s.degreesApproximate ? `${diag} · ${deg}` : `${deg} · ${diag}`;
}

/** A stored calibration's validation in one line: estimator, accuracy and verdict. */
export function profileSummary(p: ProfileRecord): string {
  const s = p.summary;
  const name = ESTIMATOR_NAMES[s.estimator as EstimatorId] ?? s.estimator;
  return t('data.profile.summary', { name, accuracy: accuracyOf(s), verdict: s.verdict ? t(`results.verdict.${s.verdict}`) : t('details.none') });
}

/** Stores this session's summary on the device, with its per-frame features when asked (opt-in, §4.15). */
export async function storeSessionSummary(includeDataset: boolean): Promise<void> {
  const state = getState();
  const records = sessionRecords();
  const id = records?.sessionId ?? `${state.clock.startEpochMs}`;
  const identity: ExportIdentity = { participant: state.settings.pid, session: state.settings.session, sessionStartMs: state.clock.startPerfMs };
  const existing = (await listSessions()).find((s) => s.id === id);
  const recordings: DatasetBlock[] = [];
  if (includeDataset) {
    const calibration = records?.base?.calibration ?? state.calibration;
    if (calibration) recordings.push({ trial: trialName('calibration'), recording: calibration });
    const v = records?.base?.validation ?? currentValidationRun();
    if (v) recordings.push({ trial: trialName('validation', 1), recording: v.recording });
    for (const b of records?.blocks ?? []) if (b.kind !== 'live' && b.kind !== 'game') recordings.push({ trial: b.trial, recording: b.recording });
  }
  const now = Date.now();
  const record: SessionRecord = {
    id,
    savedAt: existing?.savedAt ?? state.clock.startEpochMs,
    updatedAt: now,
    participant: state.settings.pid,
    session: state.settings.session,
    preset: state.settings.preset,
    estimator: state.estimator,
    geometry: state.geometry,
    reports: state.validation ?? [],
    driftLog: records?.driftLog.map((e) => ({ ...e })) ?? [],
    summary: existing?.summary ?? { seed: state.settings.seed, selection: state.fit?.selection ?? null },
    ...(includeDataset ? { dataset: datasetJson(identity, recordings) } : {}),
  };
  await saveSession(record);
}

// ----- The tab ------------------------------------------------------------------------------

/** The dataset option, kept while the page is rebuilt. */
let includeDataset = false;

interface Saved {
  profiles: ProfileRecord[];
  sessions: SessionRecord[];
  scores: ScoreRecord[];
}

let saved: Saved | null = null;
let listing: Promise<void> | null = null;
onDataDeleted(() => {
  saved = null;
});

/** Lists what the device holds; a change rebuilds the tab through `refresh`. */
function updateSaved(refresh: () => void): void {
  listing ??= Promise.all([listProfiles(), listSessions(), listScores()])
    .then(([profiles, sessions, scores]) => {
      const next: Saved = { profiles, sessions, scores };
      const key = (x: Saved | null) => (x ? JSON.stringify([x.profiles.map((p) => [p.key, p.lastUsedAt]), x.sessions.map((q) => [q.id, q.updatedAt]), x.scores.map((q) => [q.key, q.score])]) : '');
      const changed = key(next) !== key(saved);
      saved = next;
      if (changed) refresh();
    })
    .catch((error: unknown) => console.warn('Stored data could not be listed', error))
    .finally(() => {
      listing = null;
    });
}

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function exportPage(): DetailsPage {
  return {
    id: 'export',
    build: () => {
      const available = exportAvailability();
      const reason = available.ok ? '' : getState().fit ? available.reason : t('details.data.export.noFit');
      const status = h('p', { class: 'sheet-note sheet-status', role: 'status' }, reason);
      const exportButton = h('button', { type: 'button', class: 'btn btn--secondary', id: 'data-export', disabled: !available.ok }, t('details.data.export.button'));
      const saveButton = h('button', { type: 'button', class: 'btn btn--ghost', id: 'data-save', disabled: !getState().fit }, t('details.data.save.button'));
      exportButton.addEventListener('click', () => {
        exportButton.disabled = true;
        status.textContent = t('details.data.export.working');
        void buildSessionExport({ includeDataset })
          .then((out) => {
            download(out.name, out.zip);
            const done = t('details.data.export.done', { n: out.files.length });
            const left = out.omitted.length > 0 ? ` ${t('details.data.export.omitted', { files: out.omitted.map((o) => o.file).join(', ') })}` : '';
            status.textContent = done + left;
            announce(done + left);
          })
          .catch((error: unknown) => {
            console.error('The export failed', error);
            status.textContent = t('data.export.failed', { message: errorText(error) });
          })
          .finally(() => {
            exportButton.disabled = false;
          });
      });
      saveButton.addEventListener('click', () => {
        saveButton.disabled = true;
        void storeSessionSummary(includeDataset)
          .then(() => {
            status.textContent = t('data.sessions.stored');
            announce(t('data.sessions.stored'));
            saved = null;
          })
          .catch((error: unknown) => {
            status.textContent = t('data.sessions.storeFailed', { message: errorText(error) });
          })
          .finally(() => {
            saveButton.disabled = false;
          });
      });
      return sheetPage(
        t('details.data.export.title'),
        {},
        para(t('details.data.export.body')),
        checkRow({ id: 'data-dataset', label: t('details.data.export.dataset'), detail: t('details.data.export.datasetNote'), checked: includeDataset, onChange: (on) => (includeDataset = on) }),
        actionRow(exportButton, saveButton),
        status,
      );
    },
  };
}

function savedPage(): DetailsPage {
  return {
    id: 'saved',
    build: (ctx: PageContext) => {
      updateSaved(ctx.refresh);
      const warning = storageStatus().warning;
      const items: HTMLElement[] = [];
      for (const p of saved?.profiles ?? []) {
        items.push(reading(t('details.data.saved.warmup', { date: when(p.savedAt) }), [h('span', { class: 'kv__line' }, profileSummary(p)), h('span', { class: 'kv__line kv__line--second' }, t('details.data.saved.who', { pid: p.participant || t('details.none'), session: p.session || t('details.none') }))]));
      }
      for (const q of saved?.sessions ?? []) {
        const r = q.reports.find((x) => x.mode === 'own' && x.estimator === q.estimator);
        items.push(reading(t('details.data.saved.session', { date: when(q.updatedAt) }), [h('span', { class: 'kv__line' }, t('details.data.saved.sessionWhat', { name: q.estimator ? (ESTIMATOR_NAMES[q.estimator as EstimatorId] ?? q.estimator) : t('details.none'), verdict: r ? t(`results.verdict.${r.verdict}`) : t('details.none') })), h('span', { class: 'kv__line kv__line--second' }, t(q.dataset ? 'details.data.saved.withDataset' : 'details.data.saved.summaryOnly'))]));
      }
      for (const q of saved?.scores ?? []) {
        items.push(reading(t('details.data.saved.score', { cols: q.cols, rows: q.rows }), t('details.data.saved.scoreWhat', { score: q.score.toLocaleString('en-GB'), stars: q.stars, date: when(q.savedAt) })));
      }
      return sheetPage(
        t('details.data.saved.title'),
        {},
        warning ? note([t('storage.memory'), ' ', warning]) : null,
        ...(saved === null ? [para(t('details.loading'))] : items.length === 0 ? [para(t('details.data.saved.none'))] : items),
        note(t('details.data.saved.note')),
      );
    },
  };
}

function identityField(key: 'pid' | 'session', locked: boolean): HTMLElement {
  const id = `details-${key}`;
  const input = h('input', { id, class: 'field__input', type: 'text', maxlength: 64, autocomplete: 'off', spellcheck: 'false', value: getState().settings[key], disabled: locked });
  input.addEventListener('input', () => {
    const settings: Settings = { ...getState().settings, [key]: input.value.trim().slice(0, 64) };
    setState({ settings });
  });
  return h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, t(`details.data.ids.${key}`)), input);
}

function idsPage(): DetailsPage {
  return {
    id: 'ids',
    build: () => {
      const { fit, calibration } = getState();
      const locked = Boolean(fit || calibration);
      return sheetPage(t('details.data.ids.title'), {}, identityField('pid', locked), identityField('session', locked), note(t(locked ? 'details.data.ids.locked' : 'details.data.ids.note')));
    },
  };
}

registerDetailsTab('data', () => [exportPage(), savedPage(), idsPage()]);
