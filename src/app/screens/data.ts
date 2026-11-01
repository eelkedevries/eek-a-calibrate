// #/data (specification §7 screen 8, §4.15, §4.16, §14.1.6, §15.2.2): the export zip over the
// export module (003); the stored calibrations (profiles) and session summaries; restoring a
// profile, which forces a VAL6 check in Live; "Delete all my data"; and the optional screen and
// distance measurement.
//
// The zip is assembled here rather than with buildExport, which writes everything or nothing:
// geometry.yaml cannot be written without D_ref and events cannot be detected without a finite
// SD₂d, and the rest of the export must still be produced, with README.txt saying what was left
// out (§15.2.2) and when degree values are approximate (§14.1.6).
import type { ExportIdentity } from '../../core/export/csv.ts';
import { csvTable, fmtInt, fmtMs, relMs } from '../../core/export/csv.ts';
import { geometryYaml } from '../../core/export/geometryYaml.ts';
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
import { layoutToPx, viewportDiagonalPx } from '../../core/geometry/screen.ts';
import { pursuitTargetAt } from '../../core/protocol/pursuit.ts';
import { ENGINE_IDS, Flags, INVALID_MASK } from '../../core/types.ts';
import type { BackendId, EngineId, EstimatorId, FitResult, FrameMeta, GazeSample, RecordedFrame, Recording, SessionGeometry, Vec2 } from '../../core/types.ts';
import { frameBaseFlags, restoreEstimatorSet } from '../../fit/fitClient.ts';
import { deleteProfile, deleteSession, listProfiles, listSessions, onDataDeleted, onStorageStatus, saveSession, storageStatus, type ProfileRecord, type SessionRecord } from '../../platform/storage.ts';
import { BANNER_CSS, banner } from '../components/banner.ts';
import { announce, h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { currentValidationRun } from '../session.ts';
import { deleteAllData, getState, subscribe } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { setupRecord } from './camera.ts';
import { assetHashes, restoreProfile, sessionRecords, type LiveBlock, type SessionBlock } from './live.ts';
import { engineSpecs, SETUP_CSS } from './welcome.ts';

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
    };
  });
  return { trial: b.trial, samples, rows, geometry: g, estimator: id };
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
  const ordered: (ExportRecording | ExportLive)[] = [...protocol];
  for (const b of blocks) {
    if (b.kind === 'live') ordered.push({ block: b });
    else ordered.push({ trial: b.trial, recording: b.recording, fit: b.fit, corrections: b.corrections, irisPx: b.irisPx });
  }
  const outs: BlockOut[] = ordered.map((o) => ('block' in o ? liveRows(o.block, now, wanted) : recordingRows(o, now, wanted)));
  const recordingsOnly = ordered.filter((o): o is ExportRecording => !('block' in o));
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
    const parts = recordingsOnly.map((r) => targetsCsv(identity, [{ trial: r.trial, schedule: r.recording.schedule, presentations: r.recording.presentations }], r.recording.geometry.screen));
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
      capabilities: { report: setup.capabilities, deviceClass: setup.deviceClass, eyewear: setup.eyewear, probe: setup.probe, runSet: setup.runSet },
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

function download(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  // The browser has taken the download by the next task; the URL is released a little later.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ----- The screen -------------------------------------------------------------------------

const DATA_CSS = `
.data-page .item-list { list-style: none; padding: 0; display: grid; gap: var(--space-2); max-width: var(--measure); }
.data-page .item-list li { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); }
.data-page .item-list .key { font-family: var(--font-mono); font-size: 0.75rem; color: var(--muted); overflow-wrap: anywhere; }
.data-page .item-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.data-page .item-actions button { min-height: 44px; }
.data-page .file-list { font-size: 0.9rem; }
`;

function profileSummary(p: ProfileRecord): string {
  const s = p.summary;
  const name = ESTIMATOR_NAMES[s.estimator as EstimatorId] ?? s.estimator;
  const diag = s.accuracyPctDiag !== null && Number.isFinite(s.accuracyPctDiag) ? t('results.unit.diag', { value: s.accuracyPctDiag.toFixed(1) }) : '—';
  const deg = s.accuracyDeg !== null && Number.isFinite(s.accuracyDeg) ? `${s.degreesApproximate ? '≈' : ''}${s.accuracyDeg.toFixed(2)}°` : '—';
  const accuracy = s.degreesApproximate ? `${diag} · ${deg}` : `${deg} · ${diag}`;
  return t('data.profile.summary', { name, accuracy, verdict: s.verdict ? t(`results.verdict.${s.verdict}`) : '—' });
}

class DataScreen {
  private readonly ctx: ScreenContext;
  private readonly storage = h('div');
  private readonly exportBox = h('div');
  private readonly profiles = h('ul', { class: 'item-list' });
  private readonly sessions = h('ul', { class: 'item-list' });
  private readonly datasetBox: HTMLInputElement;
  private readonly offs: (() => void)[] = [];
  private mounted = true;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.ctx = ctx;
    this.datasetBox = h('input', { type: 'checkbox', id: 'data-dataset' });
    root.append(
      h('style', null, SETUP_CSS + BANNER_CSS + DATA_CSS),
      h(
        'div',
        { class: 'setup data-page' },
        h('h1', null, t('route.data')),
        h('p', { class: 'lead' }, t('data.lead')),
        this.storage,
        h(
          'section',
          null,
          h('h2', null, t('data.export.title')),
          h('p', null, t('data.export.body')),
          h('label', { class: 'choice', for: 'data-dataset' }, this.datasetBox, h('span', null, t('data.export.dataset'), h('small', null, t('data.export.datasetNote')))),
          this.exportBox,
        ),
        h(
          'section',
          null,
          h('h2', null, t('data.geometry.title')),
          h('p', null, t('data.geometry.body')),
          h('p', null, h('a', { href: '#/screen?from=data', class: 'button secondary' }, t('results.approx.measure'))),
        ),
        h('section', null, h('h2', null, t('data.profiles.title')), h('p', null, t('data.profiles.body')), this.profiles),
        h('section', null, h('h2', null, t('data.sessions.title')), h('p', null, t('data.sessions.body')), this.sessions),
        h(
          'section',
          null,
          h('h2', null, t('data.delete.title')),
          h('p', null, t('data.delete.body')),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'secondary', onclick: () => void this.deleteAll() }, t('footer.deleteAll'))),
        ),
      ),
    );
    // The footer's "Delete all my data" also empties this page's lists and its export.
    this.offs.push(
      onStorageStatus(() => this.renderStorage()),
      onDataDeleted(() => void this.refresh()),
      subscribe((s) => {
        if (!s.fit) this.renderExport();
      }),
    );
    this.renderStorage();
    this.renderExport();
    void this.refresh();
  }

  private renderStorage(): void {
    const s = storageStatus();
    this.storage.replaceChildren(...(s.warning ? [banner('warn', [t('storage.memory'), ' ', s.warning])] : []));
  }

  private renderExport(message?: Node): void {
    const available = exportAvailability();
    if (!available.ok) {
      this.exportBox.replaceChildren(h('p', { class: 'note' }, available.reason), message ?? '');
      return;
    }
    const button = h('button', { type: 'button', onclick: () => void this.export(button) }, t('data.export.button'));
    const records = sessionRecords();
    const items = [
      getState().calibration || records?.base?.calibration ? t('data.export.has.calibration') : null,
      (records?.base?.validation ?? currentValidationRun()) ? t('data.export.has.validation') : null,
      records && records.blocks.length > 0 ? t('data.export.has.blocks', { n: records.blocks.length }) : null,
    ].filter((x): x is string => x !== null);
    const g = getState().geometry;
    this.exportBox.replaceChildren(
      items.length > 0 ? h('ul', null, ...items.map((x) => h('li', null, x))) : '',
      g?.degreesApproximate ? h('p', { class: 'note' }, t('data.export.approximate')) : '',
      h('div', { class: 'actions' }, button, records && this.storeSessionButton()),
      message ?? '',
    );
  }

  private storeSessionButton(): HTMLButtonElement {
    return h(
      'button',
      {
        type: 'button',
        class: 'secondary',
        onclick: async () => {
          try {
            await this.storeSession();
            this.renderExport(banner('ok', t('data.sessions.stored')));
            await this.refresh();
          } catch (error) {
            this.renderExport(banner('error', t('data.sessions.storeFailed', { message: errorText(error) })));
          }
        },
      },
      t('data.sessions.store'),
    );
  }

  /** Stores this session's summary, with its per-frame features when the box is ticked (opt-in, §4.15). */
  private async storeSession(): Promise<void> {
    const state = getState();
    const records = sessionRecords();
    const id = records?.sessionId ?? `${state.clock.startEpochMs}`;
    const identity: ExportIdentity = { participant: state.settings.pid, session: state.settings.session, sessionStartMs: state.clock.startPerfMs };
    const existing = (await listSessions()).find((s) => s.id === id);
    const recordings: DatasetBlock[] = [];
    if (this.datasetBox.checked) {
      const calibration = records?.base?.calibration ?? state.calibration;
      if (calibration) recordings.push({ trial: trialName('calibration'), recording: calibration });
      const v = records?.base?.validation ?? currentValidationRun();
      if (v) recordings.push({ trial: trialName('validation', 1), recording: v.recording });
      for (const b of records?.blocks ?? []) if (b.kind !== 'live') recordings.push({ trial: b.trial, recording: b.recording });
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
      ...(this.datasetBox.checked ? { dataset: datasetJson(identity, recordings) } : {}),
    };
    await saveSession(record);
  }

  private async export(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const out = await buildSessionExport({ includeDataset: this.datasetBox.checked });
      if (!this.mounted) return;
      download(out.name, out.zip);
      const summary = [
        h('p', null, t('data.export.done', { name: out.name, n: out.files.length })),
        h('ul', { class: 'file-list' }, ...out.files.map((f) => h('li', null, f.name))),
        ...out.omitted.map((o) => h('p', null, t('data.export.omitted', { file: o.file, reason: o.reason }))),
      ];
      this.renderExport(banner(out.omitted.length > 0 ? 'warn' : 'ok', summary));
      announce(t('data.export.done', { name: out.name, n: out.files.length }));
    } catch (error) {
      console.error('The export failed', error);
      if (this.mounted) this.renderExport(banner('error', t('data.export.failed', { message: errorText(error) })));
    } finally {
      button.disabled = false;
    }
  }

  private async refresh(): Promise<void> {
    let profiles: ProfileRecord[] = [];
    let sessions: SessionRecord[] = [];
    try {
      [profiles, sessions] = await Promise.all([listProfiles(), listSessions()]);
    } catch (error) {
      console.warn('Stored data could not be listed', error);
    }
    if (!this.mounted) return;
    this.profiles.replaceChildren(
      ...(profiles.length === 0
        ? [h('li', { class: 'note' }, t('data.profiles.none'))]
        : profiles.map((p) =>
            h(
              'li',
              { 'data-profile': p.key },
              h('strong', null, t('data.profile.title', { date: new Date(p.savedAt).toLocaleString('en-GB'), pid: p.participant || '—', session: p.session || '—' })),
              h('p', null, profileSummary(p)),
              h('p', null, t('data.profile.engines', { list: ENGINE_IDS.filter((e) => p.fit.fits[e]).map((e) => ESTIMATOR_NAMES[e]).join(', '), used: new Date(p.lastUsedAt).toLocaleString('en-GB') })),
              h('p', { class: 'key' }, p.key),
              h(
                'div',
                { class: 'item-actions' },
                h('button', { type: 'button', onclick: () => this.restore(p) }, t('data.profile.use')),
                h('button', { type: 'button', class: 'secondary', onclick: () => void this.removeProfile(p) }, t('data.delete.one')),
              ),
            ),
          )),
    );
    this.sessions.replaceChildren(
      ...(sessions.length === 0
        ? [h('li', { class: 'note' }, t('data.sessions.none'))]
        : sessions.map((s) => {
            const r = s.reports.find((x) => x.mode === 'own' && x.estimator === s.estimator);
            const diag = s.geometry ? viewportDiagonalPx(s.geometry.screen) : Number.NaN;
            const accuracy = r && Number.isFinite(diag) ? `${((r.accuracyPctDiag / 100) * diag).toFixed(0)} px · ${r.accuracyPctDiag.toFixed(1)} %` : '—';
            return h(
              'li',
              null,
              h('strong', null, t('data.session.title', { date: new Date(s.updatedAt).toLocaleString('en-GB'), pid: s.participant || '—', session: s.session || '—' })),
              h('p', null, t('data.session.summary', { name: s.estimator ? (ESTIMATOR_NAMES[s.estimator as EstimatorId] ?? s.estimator) : '—', accuracy, verdict: r ? t(`results.verdict.${r.verdict}`) : '—', checks: s.driftLog.length })),
              s.dataset ? h('p', { class: 'note' }, t('data.session.dataset')) : '',
              h('div', { class: 'item-actions' }, h('button', { type: 'button', class: 'secondary', onclick: () => void this.removeSession(s) }, t('data.delete.one'))),
            );
          })),
    );
  }

  private restore(p: ProfileRecord): void {
    try {
      restoreProfile(p);
    } catch (error) {
      this.renderExport(banner('error', errorText(error)));
      return;
    }
    this.ctx.navigate('live');
  }

  private async removeProfile(p: ProfileRecord): Promise<void> {
    if (!window.confirm(t('data.profile.deleteConfirm'))) return;
    await deleteProfile(p.key).catch((error: unknown) => console.warn(error));
    await this.refresh();
    announce(t('data.deleted'));
  }

  private async removeSession(s: SessionRecord): Promise<void> {
    if (!window.confirm(t('data.session.deleteConfirm'))) return;
    await deleteSession(s.id).catch((error: unknown) => console.warn(error));
    await this.refresh();
    announce(t('data.deleted'));
  }

  private async deleteAll(): Promise<void> {
    if (!window.confirm(t('footer.deleteConfirm'))) return;
    try {
      await deleteAllData();
      announce(t('footer.deleted'));
      this.renderExport(banner('ok', t('footer.deleted')));
    } catch (error) {
      this.renderExport(banner('error', errorText(error)));
    }
    await this.refresh();
  }

  unmount(): void {
    this.mounted = false;
    for (const off of this.offs.splice(0)) off();
  }
}

const view: Screen = {
  mount(root, ctx) {
    const s = new DataScreen(root, ctx);
    return () => s.unmount();
  },
};

export default view;
