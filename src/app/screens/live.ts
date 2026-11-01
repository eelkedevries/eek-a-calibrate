// #/live (specification §7 screen 7, §4.10, §4.11, §4.13, §14): live gaze on the stimulus stage
// (fullscreen, or viewport mode where fullscreen is missing). The dot is One Euro filtered with
// blink hold (a toggle shows it unfiltered); optional per-engine dots; a confidence ring; the dot
// greys out while the head is outside the calibrated range; the estimator can be switched; an
// areas-of-interest demo uses the grid from the validation advice. R records (M adds a marker),
// D runs a drift check, which is also prompted every few minutes and forced after a camera,
// layout, backend or host change and after restoring a stored calibration. A drift that is too
// large leads to a quick recalibration (RECAL5, refit) and a VAL6 revalidation; a restored
// calibration is usable only once VAL6 gives at least "acceptable" (§4.15).
//
// Raw outputs are what is recorded; filtering is for display only (§4.11). The session's blocks
// (live recordings, drift checks, recalibrations and revalidations) stay in memory for export
// (#/data) and are never stored unless the person opts in there.
import manifestUrl from '../../../assets-manifest.json?url';
import {
  driftDecision,
  driftOffset,
  driftSchedule,
  forcedDriftReasons,
  nextDriftDueMs,
  recalibrationSchedule,
  type DriftContext,
  type DriftForceReason,
} from '../../core/calibration/drift.ts';
import { ESTIMATOR_NAMES } from '../../core/calibration/select.ts';
import { FIT_BUDGET_MS } from '../../core/constants.ts';
import type { DriftLogEntry } from '../../core/export/sessionJson.ts';
import { trialName } from '../../core/export/samplesCsv.ts';
import { BLINK_HOLD_INITIAL, blinkHold, type BlinkHoldState } from '../../core/filters/blinkHold.ts';
import { OneEuroFilter2D } from '../../core/filters/oneEuro.ts';
import { degToPx } from '../../core/geometry/angles.ts';
import { isDegreesApproximate, safeRect, viewportDiagonalPx } from '../../core/geometry/screen.ts';
import { applyBlinkMask } from '../../core/protocol/gating.ts';
import { FrameRecorder } from '../../core/protocol/labelling.ts';
import { minAcceptedFrames, validationSchedule } from '../../core/protocol/schedule.ts';
import { ENGINE_IDS, Flags } from '../../core/types.ts';
import type {
  EngineId,
  EstimatorId,
  FitResult,
  FrameMeta,
  FrameResult,
  GazeSample,
  RecordedFrame,
  Recording,
  Schedule,
  ScreenGeometry,
  SessionGeometry,
  ValidationReport,
  Vec2,
} from '../../core/types.ts';
import { fitRecording, frameBaseFlags, restoreEstimatorSet, scoreRecording, type EstimatorSet } from '../../fit/fitClient.ts';
import { loadManifest } from '../../platform/assets.ts';
import { isFullscreen } from '../../platform/fullscreen.ts';
import { holdWakeLock, startPresentation, viewportVerdict, type Invalidation, type Presentation as Block, type WakeLockHold } from '../../platform/presentation.ts';
import { onDataDeleted, profileKey, saveProfile, saveSession, touchProfile, type ProfileKeyParts, type ProfileRecord } from '../../platform/storage.ts';
import { BANNER_CSS, banner } from '../components/banner.ts';
import { aoiCell, drawAoiGrid, drawEngineDot, drawGazeDot } from '../components/gazeDot.ts';
import { accuracyText } from '../components/metricTable.ts';
import { acquireStage, BlockRunner, releaseStage, type StimulusStage } from '../components/stimulusCanvas.ts';
import { targetSizes } from '../components/target.ts';
import { announce, h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { currentValidationRun, ensureCapture, resetSessionResults, setValidationRun, type Capture, type ValidationRun } from '../session.ts';
import { getState, setState, subscribe } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerTestHook } from '../testHooks.ts';
import { CaptureLink, installProtocolHooks, invalidationText, measuredScale, publishProtocol, reducedMotion, runSchedule, SCREEN_CSS } from './calibrate.ts';
import { snapshotCapture } from './camera.ts';

// ----- Session blocks and records (read by #/data for the export) --------------------------

interface BlockBase {
  /** `trialName(...)`: live-<nnn>, drift-<n> (a check and the recalibration it led to), validation-<n>. */
  trial: string;
  /** The fit in effect while the block was recorded; its samples are computed with it. */
  fit: FitResult;
  geometry: SessionGeometry;
  estimator: EstimatorId;
  /** The drift correction (added to θ) of the estimator in use, or null before any. */
  correctionDeg: Vec2 | null;
  /** Every estimator's correction in effect while the block was recorded. */
  corrections: Partial<Record<EstimatorId, Vec2>>;
  /** Iris diameter by frame index, for the export's iris_px. */
  irisPx: Map<number, number>;
}

export interface LiveBlock extends BlockBase {
  kind: 'live';
  frames: RecordedFrame[];
  /** HIDDEN, NOT_FULLSCREEN and DROPPED by frame index (a live frame has no label to carry them). */
  extraFlags: Map<number, number>;
  markers: { tMs: number; n: number }[];
  startMs: number;
  endMs: number | null;
}

export interface CheckBlock extends BlockBase {
  kind: 'drift' | 'recalibration' | 'validation';
  recording: Recording;
  receivedMs: Map<number, number>;
  nominalFps: number;
}

export type SessionBlock = LiveBlock | CheckBlock;

export interface LiveRecords {
  /** The fits of this session's calibration: the first, then each quick-recalibration refit. */
  lineage: FitResult[];
  /** The calibration and its first validation, captured when Live first saw the fit. */
  base: { calibration: Recording | null; validation: ValidationRun | null; fit: FitResult } | null;
  blocks: SessionBlock[];
  driftLog: DriftLogEntry[];
  driftChecks: number;
  recalibrations: Recording[];
  liveCount: number;
  validationCount: number;
  corrections: Partial<Record<EstimatorId, Vec2>>;
  restored: { key: string; parts: ProfileKeyParts; cameraLabel: string; validated: boolean } | null;
  revalidationNeeded: boolean;
  forced: DriftForceReason[];
  lastCheckMs: number;
  context: DriftContext | null;
  saved: WeakSet<FitResult>;
  sessionId: string;
}

let records: LiveRecords | null = null;

function freshRecords(fit: FitResult, base: LiveRecords['base']): LiveRecords {
  return {
    lineage: [fit],
    base,
    blocks: [],
    driftLog: [],
    driftChecks: 0,
    recalibrations: [],
    liveCount: 0,
    validationCount: base?.validation ? 1 : 0,
    corrections: {},
    restored: null,
    revalidationNeeded: false,
    forced: [],
    lastCheckMs: performance.now(),
    context: null,
    saved: new WeakSet(),
    sessionId: `${getState().clock.startEpochMs}-${Math.round(performance.now())}`,
  };
}

/** The records of the fit in use, started afresh when a new calibration replaced the fit. */
function currentRecords(): LiveRecords | null {
  const { fit, calibration } = getState();
  if (!fit) return null;
  if (!records || !records.lineage.includes(fit)) records = freshRecords(fit, { calibration, validation: currentValidationRun(), fit });
  return records;
}

/** This session's records for the export, or null when there are none for the fit in use. */
export function sessionRecords(): Readonly<LiveRecords> | null {
  const fit = getState().fit;
  return records && fit && records.lineage.includes(fit) ? records : null;
}

onDataDeleted(() => {
  records = null;
});

/**
 * Makes a stored profile the session's calibration (§4.15): the fit and its geometry, Auto's
 * estimator, no validation. Live then requires a VAL6 check with a verdict of at least
 * "acceptable" before the gaze is shown, followed by a drift check.
 */
export function restoreProfile(p: ProfileRecord): void {
  const fit = p.fit;
  if (!fit.fitGeometry) throw new RangeError('This stored calibration has no geometry and cannot be restored.');
  resetSessionResults();
  setState({
    fit,
    calibration: null,
    validation: null,
    geometry: { ...fit.fitGeometry, refDistanceMm: fit.refDistanceMm },
    estimator: fit.selection.estimator,
  });
  records = freshRecords(fit, null);
  records.restored = { key: p.key, parts: p.parts, cameraLabel: p.cameraLabel ?? '', validated: false };
}

// ----- Asset hashes (profile key, session.json) -------------------------------------------

let manifest: Promise<Record<string, string>> | null = null;

/** sha256 of every runtime and model file, by asset id, from the asset manifest. */
export function assetHashes(): Promise<Record<string, string>> {
  manifest ??= loadManifest(manifestUrl).then(
    (m) => Object.fromEntries([...m.entries.values()].map((e) => [e.id, e.sha256])),
    (error: unknown) => {
      manifest = null;
      throw error;
    },
  );
  return manifest;
}

const MODEL_ASSET: Partial<Record<EngineId, string>> = { blazegaze: 'blazegaze-weights', peekr: 'peekr-model' };

/** The profile key parts of a fit made with this camera (§4.15). */
export async function profileParts(fit: FitResult, cameraHash: string | null, video: { w: number; h: number }): Promise<ProfileKeyParts> {
  const hashes = await assetHashes().catch(() => ({}) as Record<string, string>);
  const s = fit.fitGeometry?.screen;
  const engines = ENGINE_IDS.filter((e) => fit.fits[e]).map((e) => {
    const asset = MODEL_ASSET[e];
    const sha = asset ? (hashes[asset] ?? 'unknown').slice(0, 8) : 'none';
    return `${e}@${fit.fits[e]!.chosen.featureVersion}+${sha}`;
  });
  return {
    origin: location.origin,
    viewport: s ? `${Math.round(s.viewportWpx)}x${Math.round(s.viewportHpx)}@${s.dpr}` : 'unknown',
    cameraHash: cameraHash ?? 'unknown',
    video: `${video.w}x${video.h}`,
    engines: engines.join(','),
  };
}

// ----- Helpers ----------------------------------------------------------------------------

/** Frames counted in the effective rate shown in Live (§14.2.9). */
const RATE_WINDOW_MS = 2000;
/** How often Live looks for a forced or timed drift check. */
const WATCH_MS = 1000;
/** Flags that hide the dot (blinks are left to the blink hold, OUT_OF_RANGE only greys it). */
const HIDE_FLAGS = Flags.NO_FACE | Flags.DROPPED | Flags.ENGINE_ERROR | Flags.HIDDEN | Flags.NOT_FULLSCREEN;

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** True when a block's viewport is the calibration's, within the viewport-mode tolerance (as validation checks it). */
function sameLayout(a: ScreenGeometry, b: ScreenGeometry): boolean {
  if ((a.viewportWpx >= a.viewportHpx) !== (b.viewportWpx >= b.viewportHpx)) return false;
  const tolerance = a.presentationMode === 'viewport' || b.presentationMode === 'viewport' ? undefined : 0;
  return viewportVerdict({ w: a.viewportWpx, h: a.viewportHpx }, { w: b.viewportWpx, h: b.viewportHpx }, tolerance) !== 'abort';
}

/**
 * The stored calibration was made with this camera at this frame size. Some browsers change device
 * ids between visits, so a camera of the same name also counts; the VAL6 check then decides.
 */
export function sameCamera(p: { parts: ProfileKeyParts; cameraLabel: string }, hash: string | null, label: string, video: { width: number; height: number }): boolean {
  const camera = p.parts.cameraHash === (hash ?? 'unknown') || (p.cameraLabel !== '' && p.cameraLabel === label);
  return camera && p.parts.video === `${video.width}x${video.height}`;
}

function liveEngines(fit: FitResult): EngineId[] {
  return ENGINE_IDS.filter((e) => fit.fits[e] !== undefined || e === 'geometric');
}

function ownReport(reports: readonly ValidationReport[] | null, id: EstimatorId): ValidationReport | null {
  return reports?.find((r) => r.mode === 'own' && r.estimator === id) ?? null;
}

/** An offset in degrees as text: px (and % of the diagonal) first while degrees are approximate. */
function offsetText(deg: Vec2, g: SessionGeometry): string {
  const d = g.refDistanceMm ?? 600;
  const centre: Vec2 = [g.screen.viewportWpx / 2, g.screen.viewportHpx / 2];
  const p = degToPx(deg, g.screen, d);
  const px = Math.hypot(p[0] - centre[0], p[1] - centre[1]);
  const pct = (100 * px) / viewportDiagonalPx(g.screen);
  const degText = `${g.degreesApproximate ? '≈' : ''}${Math.hypot(deg[0], deg[1]).toFixed(2)}°`;
  const pxText = t('live.offset.px', { px: px.toFixed(0), pct: pct.toFixed(1) });
  return g.degreesApproximate ? `${pxText} · ${degText}` : `${degText} · ${pxText}`;
}

function isGood(verdict: ValidationReport['verdict'] | undefined): boolean {
  return verdict === 'good' || verdict === 'acceptable';
}

const LIVE_CSS = `
.live-page .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin-top: var(--space-3); }
.live-page .actions button, .live-page .actions .button { min-height: 44px; }
.live-page a.button { display: inline-flex; align-items: center; text-decoration: none; }
.live-page a.button.secondary { background: transparent; color: var(--fg); border-color: var(--border); }
.live-page .options { display: grid; gap: var(--space-2); max-width: var(--measure); }
.live-page .options label { display: flex; gap: var(--space-2); align-items: center; min-height: 44px; }
.live-page .options input[type='checkbox'] { width: 1.4rem; height: 1.4rem; }
.live-page select { font: inherit; min-height: 44px; }
.live-toolbar { position: absolute; left: calc(env(safe-area-inset-left, 0px) + 8px); bottom: calc(env(safe-area-inset-bottom, 0px) + 8px); right: calc(env(safe-area-inset-right, 0px) + 8px); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; pointer-events: none; }
.live-toolbar > * { pointer-events: auto; }
.live-toolbar button, .live-toolbar select, .live-toolbar label { min-height: 44px; min-width: 44px; font: inherit; font-size: 0.85rem; padding: 0.2rem 0.6rem; background: rgba(255, 255, 255, 0.82); color: #000; border: 1px solid rgba(0, 0, 0, 0.4); border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.3rem; }
.live-toolbar button[aria-pressed='true'] { background: #000; color: #fff; }
.live-toolbar button:disabled { opacity: 0.5; }
.live-toolbar input[type='checkbox'] { width: 1.1rem; height: 1.1rem; }
.live-toolbar .live-status { background: rgba(255, 255, 255, 0.82); color: #000; border-radius: 0.4rem; padding: 0.25rem 0.6rem; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.live-toolbar.collapsed > :not(.live-toggle) { display: none; }
.live-message { position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 12px); transform: translateX(-50%); max-width: min(34rem, 92%); margin: 0; padding: 0.4rem 0.8rem; background: rgba(255, 255, 255, 0.88); color: #000; border-radius: 0.4rem; text-align: center; pointer-events: none; }
.live-message:empty { display: none; }
`;

interface Display {
  /** Drift-corrected position, unfiltered and filtered (CSS px), or null. */
  raw: Vec2 | null;
  filtered: Vec2 | null;
  perEngine: Partial<Record<EngineId, Vec2>>;
  confidence: number;
  greyed: boolean;
  visible: boolean;
}

interface Snapshot {
  mode: string;
  results: number;
  dots: number;
  lastDot: { x: number; y: number; greyed: boolean } | null;
  recording: boolean;
  estimator: EstimatorId | null;
  blocks: { trial: string; kind: string; frames: number; markers: number }[];
  driftLog: DriftLogEntry[];
  restored: { key: string; validated: boolean } | null;
  revalidationNeeded: boolean;
  lastCheck: { kind: string; targets: number; verdict: string | null; action: string | null } | null;
  message: string | null;
}

let snapshotFn: () => Snapshot | null = () => null;

type CheckDone = { kind: 'done'; rec: Recording; receivedMs: Map<number, number>; irisPx: Map<number, number> };
type CheckRun = CheckDone | { kind: 'aborted' } | { kind: 'invalid' };

// ----- The screen -------------------------------------------------------------------------

class LiveScreen {
  private readonly ctx: ScreenContext;
  private readonly rec: LiveRecords;
  private readonly status = h('p', { role: 'status', 'aria-live': 'polite' });
  private readonly alerts = h('div');
  private readonly summary = h('div');
  private readonly blocksList = h('ul');
  private readonly startButton: HTMLButtonElement;
  private readonly estimatorSelect = h('select', { id: 'live-estimator' });
  private readonly options = { raw: false, engines: false, aoi: false, prompts: true };
  private aoiN = 2;
  private capture: Capture | null = null;
  private link: CaptureLink | null = null;
  private set: EstimatorSet | null = null;
  private geometry: SessionGeometry | null = null;
  private stage: StimulusStage | null = null;
  private block: Block | null = null;
  private toolbar: HTMLDivElement | null = null;
  private message: HTMLParagraphElement | null = null;
  private statusLine: HTMLSpanElement | null = null;
  private recordButton: HTMLButtonElement | null = null;
  private markerButton: HTMLButtonElement | null = null;
  private mode: 'idle' | 'starting' | 'live' | 'check' | 'paused' = 'idle';
  private filter = new OneEuroFilter2D();
  private hold: BlinkHoldState = { ...BLINK_HOLD_INITIAL };
  private display: Display = { raw: null, filtered: null, perEngine: {}, confidence: 0, greyed: false, visible: false };
  private recording: LiveBlock | null = null;
  private checkIris: Map<number, number> | null = null;
  private readonly resultTimes: number[] = [];
  private results = 0;
  private dots = 0;
  private lastDot: Snapshot['lastDot'] = null;
  private lastCheck: Snapshot['lastCheck'] = null;
  private raf = 0;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private offs: (() => void)[] = [];
  private blockOffs: (() => void)[] = [];
  private wake: WakeLockHold | null = null;
  private mounted = true;
  /** The presentation was invalidated; nothing may resume live gaze until a new one starts. */
  private invalid = false;
  private lastMessage: string | null = null;
  private readonly onKey = (e: KeyboardEvent): void => this.key(e);

  constructor(root: HTMLElement, ctx: ScreenContext, rec: LiveRecords) {
    this.ctx = ctx;
    this.rec = rec;
    const state = getState();
    const fit = state.fit as FitResult;
    this.startButton = h('button', { type: 'button', disabled: true, onclick: () => void this.start() }, t('live.start'));
    this.estimatorSelect.addEventListener('change', () => this.useEstimator(this.estimatorSelect.value as EstimatorId));
    const optionBox = (key: keyof LiveScreen['options'], label: string) => {
      const box = h('input', { type: 'checkbox', onchange: () => (this.options[key] = box.checked) });
      box.checked = this.options[key];
      return h('label', null, box, label);
    };
    const report = ownReport(state.validation, state.estimator ?? fit.selection.estimator);
    const advised = report?.aoiGrid ?? 0;
    this.aoiN = advised >= 2 ? advised : 2;
    const aoiSelect = h('select', { id: 'live-aoi', onchange: () => (this.aoiN = Number(aoiSelect.value)) }, ...[2, 3, 4].map((n) => h('option', { value: n }, t(n === advised ? 'live.aoi.advised' : 'live.aoi.n', { n }))));
    aoiSelect.value = String(this.aoiN);
    const driftBox = h('input', { type: 'checkbox', onchange: () => (this.options.prompts = driftBox.checked) });
    driftBox.checked = state.settings.driftEveryMin > 0;
    this.options.prompts = driftBox.checked;
    root.append(
      h('style', null, SCREEN_CSS + BANNER_CSS + LIVE_CSS),
      h(
        'div',
        { class: 'live-page' },
        h('h1', null, t('route.live')),
        h('p', { class: 'lead' }, t('live.lead')),
        this.alerts,
        this.summary,
        this.status,
        h(
          'section',
          null,
          h('h2', null, t('live.options')),
          h(
            'div',
            { class: 'options' },
            h('label', { for: 'live-estimator' }, t('live.estimator')),
            this.estimatorSelect,
            optionBox('raw', t('live.raw')),
            optionBox('engines', t('live.engines')),
            optionBox('aoi', t('live.aoi')),
            h('label', { for: 'live-aoi' }, t('live.aoi.grid')),
            aoiSelect,
            advised === 0 ? h('p', { class: 'note' }, t('live.aoi.none')) : null,
            h('label', null, driftBox, state.settings.driftEveryMin > 0 ? t('live.prompts', { min: state.settings.driftEveryMin }) : t('live.promptsOff')),
          ),
          h('p', { class: 'note' }, t('live.keys')),
        ),
        h('div', { class: 'actions' }, this.startButton, h('a', { href: '#/data', class: 'button secondary' }, t('live.toData')), h('a', { href: '#/results', class: 'button secondary' }, t('live.toResults'))),
        h('section', null, h('h2', null, t('live.blocks')), this.blocksList),
      ),
    );
    installProtocolHooks();
    snapshotFn = () => this.snapshot();
    registerTestHook('live', () => snapshotFn());
    // "Delete all my data" (footer) or a new calibration takes the fit away: stop at once and show the page afresh.
    this.offs.push(
      subscribe((s) => {
        if (!this.mounted || (s.fit && this.rec.lineage.includes(s.fit))) return;
        this.unmount();
        ctx.navigate('live');
      }),
    );
    this.renderSummary();
    this.renderBlocks();
    this.fillEstimators();
    void this.prepare();
  }

  // ----- Page ---------------------------------------------------------------------------

  private fit(): FitResult {
    return getState().fit as FitResult;
  }

  private estimator(): EstimatorId {
    const state = getState();
    const fit = this.fit();
    const e = state.estimator ?? fit.selection.estimator;
    return e === 'combined' ? (fit.combined ? e : fit.selection.estimator) : fit.fits[e] ? e : fit.selection.estimator;
  }

  private fillEstimators(): void {
    const fit = this.fit();
    const ids: EstimatorId[] = [...(fit.combined ? (['combined'] as EstimatorId[]) : []), ...ENGINE_IDS.filter((e) => fit.fits[e])];
    this.estimatorSelect.replaceChildren(...ids.map((id) => h('option', { value: id }, id === fit.selection.estimator ? t('live.estimator.auto', { name: ESTIMATOR_NAMES[id] }) : ESTIMATOR_NAMES[id])));
    this.estimatorSelect.value = this.estimator();
  }

  private renderSummary(): void {
    const state = getState();
    const id = this.estimator();
    const r = ownReport(state.validation, id);
    const parts: Node[] = [];
    if (this.rec.restored && !this.rec.restored.validated) parts.push(banner('warn', t('live.restored.pending')));
    else if (this.rec.revalidationNeeded) parts.push(banner('warn', t('live.revalidate.pending')));
    if (r && state.geometry) {
      parts.push(h('p', null, t('live.accuracy', { name: ESTIMATOR_NAMES[id], value: accuracyText(r, viewportDiagonalPx(state.geometry.screen)), verdict: t(`results.verdict.${r.verdict}`) })));
      if (r.degreesApproximate) parts.push(h('p', { class: 'note' }, t('results.approx.note'), ' ', h('a', { href: '#/screen?from=live' }, t('results.approx.measure'))));
    } else if (!this.rec.restored) {
      parts.push(h('p', { class: 'note' }, t('live.noValidation')));
    }
    const c = this.rec.corrections[id];
    if (c && this.geometry) parts.push(h('p', null, t('live.correction', { value: offsetText(c, this.geometry) })));
    this.summary.replaceChildren(...parts);
    this.startButton.textContent = t(this.rec.restored && !this.rec.restored.validated ? 'live.restored.validate' : this.rec.revalidationNeeded ? 'live.revalidate.start' : 'live.start');
  }

  private renderBlocks(): void {
    const items = this.rec.blocks.map((b) =>
      h('li', null, t(`live.block.${b.kind}`, { trial: b.trial, n: b.kind === 'live' ? b.frames.length : b.recording.frames.length, markers: b.kind === 'live' ? b.markers.length : 0 })),
    );
    this.blocksList.replaceChildren(...(items.length > 0 ? items : [h('li', { class: 'note' }, t('live.block.none'))]));
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private alert(kind: 'warn' | 'error' | 'info' | 'ok', text: string): void {
    this.alerts.replaceChildren(banner(kind, text));
    this.lastMessage = text;
    announce(text);
  }

  private async prepare(): Promise<void> {
    const fit = this.fit();
    try {
      this.capture = await ensureCapture(liveEngines(fit), {
        onStatus: (key) => this.setStatus(t(`calibrate.status.${key}`)),
        onAsset: (asset, loaded, total) => this.setStatus(t('calibrate.status.asset', { asset, percent: total > 0 ? Math.round((100 * loaded) / total) : 0 })),
      });
    } catch (error) {
      if (!this.mounted) return;
      this.alert('error', t('calibrate.error.capture', { message: error instanceof Error ? error.message : String(error) }));
      this.setStatus('');
      return;
    }
    if (!this.mounted) return;
    const c = this.capture;
    snapshotCapture(c);
    this.wake = holdWakeLock();
    const g = this.baseGeometry();
    this.link = new CaptureLink(c, g.distance.focalPx, (event) => this.cameraEvent(event));
    this.set = restoreEstimatorSet(fit, g);
    this.geometry = g;
    this.offs.push(
      c.onResult((r) => this.onResult(r)),
      c.onFrame((meta, submitted) => {
        if (!submitted) this.onDropped(meta);
      }),
    );
    const missing = Object.keys(fit.fits).filter((e) => !c.status.some((s) => s.id === e && s.ok));
    if (missing.length > 0) this.alert('warn', t('live.enginesMissing', { list: missing.map((e) => ESTIMATOR_NAMES[e as EngineId]).join(', ') }));
    const restored = this.rec.restored;
    if (restored) {
      const s = c.camera.settings;
      if (!sameCamera(restored, c.camera.info.deviceIdHash, c.camera.info.label, s)) {
        this.alert('error', t('live.restored.otherCamera'));
        this.setStatus('');
        return;
      }
    } else {
      void this.saveProfileOnce(c);
    }
    this.saveSessionSummary();
    this.setStatus(t('live.ready'));
    this.startButton.disabled = false;
  }

  /** The session geometry for the estimators before a block starts (the calibration's viewport). */
  private baseGeometry(): SessionGeometry {
    const fit = this.fit();
    const g = getState().geometry ?? (fit.fitGeometry as SessionGeometry);
    const fitFocal = fit.fitGeometry?.distance.focalPx ?? g.distance.focalPx;
    const ref = positive(g.refDistanceMm) ? g.refDistanceMm : (fit.refDistanceMm * g.distance.focalPx) / fitFocal;
    const screen = fit.fitGeometry ? { ...fit.fitGeometry.screen, pxPerMm: g.screen.pxPerMm, pxPerMmSource: g.screen.pxPerMmSource } : g.screen;
    return { screen, distance: { ...g.distance }, refDistanceMm: ref, degreesApproximate: isDegreesApproximate(screen, g.distance) };
  }

  /** Stores the calibration as a profile once per fit, when it has been validated in this session. */
  private async saveProfileOnce(c: Capture): Promise<void> {
    const state = getState();
    const fit = this.fit();
    if (this.rec.saved.has(fit) || !state.validation || this.rec.revalidationNeeded) return;
    this.rec.saved.add(fit);
    const firstFrame = this.rec.base?.calibration?.frames[0]?.meta;
    const video = firstFrame ? { w: firstFrame.videoW, h: firstFrame.videoH } : { w: c.camera.settings.width, h: c.camera.settings.height };
    const parts = await profileParts(fit, c.camera.info.deviceIdHash, video);
    const id = this.estimator();
    const r = ownReport(state.validation, id);
    const now = Date.now();
    const profile: ProfileRecord = {
      key: profileKey(parts),
      parts,
      savedAt: now,
      lastUsedAt: now,
      participant: state.settings.pid,
      session: state.settings.session,
      preset: state.settings.preset,
      cameraLabel: c.camera.info.label,
      fit,
      summary: { estimator: id, verdict: r?.verdict ?? null, accuracyPctDiag: r ? r.accuracyPctDiag : null, accuracyDeg: r ? r.accuracyMeanDeg : null, degreesApproximate: r?.degreesApproximate ?? true },
    };
    try {
      await saveProfile(profile);
      if (this.mounted) this.status.after(h('p', { class: 'note' }, t('live.saved')));
    } catch (error) {
      console.warn('The calibration could not be stored', error);
    }
  }

  private saveSessionSummary(): void {
    const state = getState();
    if (!state.validation && this.rec.driftLog.length === 0) return;
    const now = Date.now();
    void saveSession({
      id: this.rec.sessionId,
      savedAt: state.clock.startEpochMs,
      updatedAt: now,
      participant: state.settings.pid,
      session: state.settings.session,
      preset: state.settings.preset,
      estimator: this.estimator(),
      geometry: state.geometry,
      reports: state.validation ?? [],
      driftLog: this.rec.driftLog.map((e) => ({ ...e })),
      summary: {
        seed: state.settings.seed,
        selection: this.fit().selection,
        engines: Object.keys(this.fit().fits),
        restored: this.rec.restored?.key ?? null,
        blocks: this.rec.blocks.map((b) => b.trial),
      },
    }).catch((error: unknown) => console.warn('The session summary could not be stored', error));
  }

  private useEstimator(id: EstimatorId): void {
    setState({ estimator: id });
    this.set?.setDrift(this.rec.corrections[id] ?? [0, 0]);
    this.filter.reset();
    this.hold = { ...BLINK_HOLD_INITIAL };
    this.renderSummary();
    if (this.toolbar) {
      const select = this.toolbar.querySelector('select');
      if (select && select.value !== id) select.value = id;
    }
    if (this.estimatorSelect.value !== id) this.estimatorSelect.value = id;
  }

  private cameraEvent(event: 'changed' | 'ended'): void {
    if (event === 'ended') {
      this.stopLive();
      this.alert('error', t('camera.ended'));
      this.startButton.disabled = true;
      return;
    }
    // A camera change (resolution or frame rate) forces a drift check (§4.13).
    if (!this.rec.forced.includes('camera')) this.rec.forced.push('camera');
    const s = this.capture?.camera.settings;
    if (s && this.capture) snapshotCapture(this.capture);
    if (s && s.width > 0) this.link?.setFocal(this.geometry?.distance.focalPx ?? this.baseGeometry().distance.focalPx);
  }

  private context(): DriftContext | null {
    const c = this.capture;
    const g = this.geometry;
    if (!c || !g) return null;
    const s = c.camera.settings;
    const backends: Partial<Record<EngineId, string>> = {};
    for (const e of c.host.engineStatus) if (e.ok && e.backend) backends[e.id] = e.backend;
    return {
      videoW: s.width,
      videoH: s.height,
      frameRate: s.frameRate,
      deviceIdHash: c.camera.info.deviceIdHash,
      viewportWpx: g.screen.viewportWpx,
      viewportHpx: g.screen.viewportHpx,
      dpr: g.screen.dpr,
      hostKind: c.host.kind,
      delegate: c.host.info?.delegate ?? null,
      backends,
      workerRestarts: c.host.stats().restarts,
    };
  }

  // ----- Frames -------------------------------------------------------------------------

  private liveFrame(r: FrameResult): RecordedFrame {
    const face = r.face;
    return {
      meta: r.meta,
      distanceMm: this.link?.distanceMm ?? null,
      yawDeg: face ? face.pose.yawDeg : null,
      pitchDeg: face ? face.pose.pitchDeg : null,
      rollDeg: face ? face.pose.rollDeg : null,
      eyeMidNorm: face ? face.eyes.eyeMidNorm : null,
      open: face !== null && face.eyes.open,
      label: null,
      engines: r.engines,
    };
  }

  private extraFlags(): number {
    let flags = 0;
    if (document.visibilityState === 'hidden') flags |= Flags.HIDDEN;
    if (this.block?.mode === 'fullscreen' && !isFullscreen()) flags |= Flags.NOT_FULLSCREEN;
    return flags;
  }

  private onResult(r: FrameResult): void {
    if (this.checkIris && r.face) this.checkIris.set(r.meta.index, r.face.eyes.irisDiamPx);
    if (this.mode !== 'live' || !this.set || !this.geometry) return;
    const now = performance.now();
    this.results++;
    this.resultTimes.push(now);
    while (this.resultTimes.length > 0 && (this.resultTimes[0] as number) < now - RATE_WINDOW_MS) this.resultTimes.shift();
    const f = this.liveFrame(r);
    const extra = this.extraFlags();
    const id = this.estimator();
    const sample = this.set.estimator(id).estimate(f, frameBaseFlags(f) | extra);
    if (this.recording) {
      this.recording.frames.push(f);
      if (extra !== 0) this.recording.extraFlags.set(f.meta.index, extra);
      if (r.face) this.recording.irisPx.set(f.meta.index, r.face.eyes.irisDiamPx);
    }
    this.updateDisplay(sample, r);
  }

  private onDropped(meta: FrameMeta): void {
    if (this.mode !== 'live' || !this.recording) return;
    this.recording.frames.push({ meta, distanceMm: null, yawDeg: null, pitchDeg: null, rollDeg: null, eyeMidNorm: null, open: false, label: null, engines: {} });
    this.recording.extraFlags.set(meta.index, Flags.DROPPED | this.extraFlags());
  }

  private distanceOf(s: GazeSample): number {
    const g = this.geometry as SessionGeometry;
    return positive(s.distanceMm) ? s.distanceMm : (g.refDistanceMm as number);
  }

  private updateDisplay(s: GazeSample, r: FrameResult): void {
    const g = this.geometry as SessionGeometry;
    const showable = s.correctedDeg !== null && s.correctedPx !== null && (s.flags & HIDE_FLAGS) === 0;
    const gazeValid = showable && (s.flags & Flags.BLINK) === 0;
    const decision = blinkHold(this.hold, {
      tMs: r.meta.tCaptureMs,
      blinkL: r.face ? r.face.eyes.blinkL : null,
      blinkR: r.face ? r.face.eyes.blinkR : null,
      gazeValid,
    });
    this.hold = decision.state;
    if (decision.display === 'hide') {
      this.display = { ...this.display, visible: false };
      return;
    }
    if (decision.display === 'hold') return;
    const d = this.distanceOf(s);
    const corrected = s.correctedDeg as Vec2;
    const filtDeg = this.filter.filter(corrected[0], corrected[1], s.tCaptureMs);
    const perEngine: Partial<Record<EngineId, Vec2>> = {};
    for (const [e, deg] of Object.entries(s.perEngineDeg) as [EngineId, Vec2][]) {
      const c = this.rec.corrections[e] ?? [0, 0];
      perEngine[e] = degToPx([deg[0] + c[0], deg[1] + c[1]], g.screen, d);
    }
    this.display = {
      raw: s.correctedPx,
      filtered: degToPx(filtDeg, g.screen, d),
      perEngine,
      confidence: s.confidence,
      greyed: (s.flags & Flags.OUT_OF_RANGE) !== 0,
      visible: true,
    };
  }

  // ----- Presentation -------------------------------------------------------------------

  /** From the Start button's click: the presentation must be requested inside the gesture. */
  private async start(): Promise<void> {
    if (this.mode !== 'idle' || !this.capture || !this.link) return;
    this.mode = 'starting';
    this.startButton.disabled = true;
    this.stage = acquireStage();
    if (await this.present()) await this.proceed();
  }

  /** After a presentation starts: any validation that is still owed, then live gaze. */
  private async proceed(): Promise<void> {
    if (this.rec.restored && !this.rec.restored.validated) {
      if (!(await this.revalidate('restore'))) return;
    } else if (this.rec.revalidationNeeded) {
      if (!(await this.revalidate('recalibration'))) return;
    }
    this.enterLive();
  }

  /** Starts a presentation on the stage and checks it against the calibration's layout. */
  private async present(): Promise<boolean> {
    const stage = this.stage as StimulusStage;
    const fit = this.fit();
    let block: Block;
    try {
      block = await startPresentation(stage.el, { mode: 'auto', scale: measuredScale(getState().geometry) });
    } catch (error) {
      this.endStage();
      this.alert('error', t('calibrate.error.start', { message: error instanceof Error ? error.message : String(error) }));
      return false;
    }
    if (!this.mounted) {
      await block.end();
      return false;
    }
    const restoredDpr = this.rec.restored ? Number(this.rec.restored.parts.viewport.split('@')[1]) : null;
    const dprChanged = restoredDpr !== null && Number.isFinite(restoredDpr) && restoredDpr !== block.geometry().dpr;
    if ((fit.fitGeometry && !sameLayout(fit.fitGeometry.screen, block.geometry())) || dprChanged) {
      await block.end();
      this.endStage();
      this.alert('error', t('validate.screenChanged'));
      return false;
    }
    this.block = block;
    this.invalid = false;
    const base = this.baseGeometry();
    const screen = block.geometry();
    this.geometry = { ...base, screen, degreesApproximate: isDegreesApproximate(screen, base.distance) };
    this.set = restoreEstimatorSet(fit, this.geometry);
    this.set.setDrift(this.rec.corrections[this.estimator()] ?? [0, 0]);
    this.link?.setFocal(this.geometry.distance.focalPx);
    stage.configure(screen);
    // During a check the block runner reports the invalidation through its outcome instead.
    this.blockOffs.push(block.onInvalidate((inv) => (this.mode === 'check' ? undefined : this.onInvalidate(inv))));
    document.addEventListener('keydown', this.onKey);
    this.blockOffs.push(() => document.removeEventListener('keydown', this.onKey));
    const now = this.context();
    if (now && this.rec.context) {
      for (const reason of forcedDriftReasons(this.rec.context, now)) if (!this.rec.forced.includes(reason)) this.rec.forced.push(reason);
    } else if (now) {
      this.rec.context = now;
    }
    return true;
  }

  private enterLive(): void {
    if (!this.stage || !this.block) return;
    this.mode = 'live';
    this.colours = {};
    this.buildToolbar();
    this.filter.reset();
    this.hold = { ...BLINK_HOLD_INITIAL };
    this.display = { ...this.display, visible: false };
    this.raf = requestAnimationFrame((ts) => this.draw(ts));
    if (this.watchTimer === null) this.watchTimer = setInterval(() => this.watch(), WATCH_MS);
    this.renderSummary();
    if (this.rec.forced.length > 0) void this.driftCheck('forced');
  }

  private buildToolbar(): void {
    const stage = this.stage as StimulusStage;
    this.toolbar?.remove();
    this.message?.remove();
    const button = (label: string, onclick: () => void, extra: Record<string, string> = {}) => h('button', { type: 'button', onclick, ...extra }, label);
    this.recordButton = button(t('live.tool.record'), () => this.toggleRecord(), { 'aria-pressed': this.recording ? 'true' : 'false' });
    this.markerButton = button(t('live.tool.marker'), () => this.marker());
    this.markerButton.disabled = !this.recording;
    const select = h('select', { 'aria-label': t('live.estimator') }, ...[...this.estimatorSelect.options].map((o) => h('option', { value: o.value }, o.textContent ?? o.value)));
    select.value = this.estimator();
    select.addEventListener('change', () => this.useEstimator(select.value as EstimatorId));
    const toggle = (key: 'raw' | 'engines' | 'aoi', label: string) => {
      const box = h('input', { type: 'checkbox', onchange: () => (this.options[key] = box.checked) });
      box.checked = this.options[key];
      return h('label', null, box, label);
    };
    this.statusLine = h('span', { class: 'live-status' });
    const collapse = button(t('live.tool.hide'), () => {
      const collapsed = !toolbar.classList.contains('collapsed');
      toolbar.classList.toggle('collapsed', collapsed);
      collapse.textContent = t(collapsed ? 'live.tool.show' : 'live.tool.hide');
    });
    collapse.classList.add('live-toggle');
    const toolbar = h(
      'div',
      { class: 'live-toolbar', role: 'toolbar', 'aria-label': t('live.tool.label') },
      button(t('live.tool.exit'), () => void this.exit()),
      this.recordButton,
      this.markerButton,
      button(t('live.tool.drift'), () => void this.driftCheck('manual')),
      select,
      toggle('raw', t('live.tool.raw')),
      toggle('engines', t('live.tool.engines')),
      toggle('aoi', t('live.tool.aoi')),
      this.statusLine,
      collapse,
    );
    this.toolbar = toolbar;
    this.message = h('p', { class: 'live-message', 'aria-live': 'polite' });
    stage.el.append(this.message, toolbar);
  }

  private showToolbar(visible: boolean): void {
    if (this.toolbar) this.toolbar.hidden = !visible;
    if (this.message) this.message.hidden = !visible;
  }

  /** The estimators' palette colours (CSS tokens), read once per live run. */
  private colours: Partial<Record<EstimatorId, string>> = {};

  private colour(id: EstimatorId): string {
    let c = this.colours[id];
    if (c === undefined) {
      c = getComputedStyle(document.documentElement).getPropertyValue(`--c-${id}`).trim() || '#000000';
      this.colours[id] = c;
    }
    return c;
  }

  private draw(ts: number): void {
    if (this.mode !== 'live' || !this.stage || !this.geometry) return;
    const stage = this.stage;
    const g = this.geometry;
    const ctx = stage.context;
    const W = g.screen.viewportWpx;
    const H = g.screen.viewportHpx;
    stage.clear();
    const d = this.display;
    const point = this.options.raw ? d.raw : d.filtered;
    if (this.options.aoi) drawAoiGrid(ctx, safeRect(g.screen), this.aoiN, d.visible && point && !d.greyed ? aoiCell(point, safeRect(g.screen), this.aoiN) : null);
    if (d.visible && this.options.engines) {
      for (const [e, p] of Object.entries(d.perEngine) as [EngineId, Vec2][]) drawEngineDot(ctx, p, W, H, this.colour(e), 6);
    }
    if (d.visible && point) {
      drawGazeDot(ctx, point, W, H, { radiusPx: 11, colour: this.colour(this.estimator()), greyed: d.greyed, confidence: d.confidence });
      this.dots++;
      this.lastDot = { x: point[0], y: point[1], greyed: d.greyed };
    }
    if (this.message) {
      const text = d.visible && d.greyed ? t('live.outOfRange') : '';
      if (this.message.textContent !== text) this.message.textContent = text;
    }
    if (this.statusLine) {
      const rate = this.resultTimes.length >= 2 ? ((this.resultTimes.length - 1) * 1000) / ((this.resultTimes[this.resultTimes.length - 1] as number) - (this.resultTimes[0] as number)) : Number.NaN;
      const rec = this.recording ? t('live.tool.recording', { trial: this.recording.trial, s: ((ts - this.recording.startMs) / 1000).toFixed(0) }) : '';
      const text = [t('live.tool.rate', { hz: Number.isFinite(rate) ? rate.toFixed(0) : '—' }), rec].filter(Boolean).join(' · ');
      if (this.statusLine.textContent !== text) this.statusLine.textContent = text;
    }
    this.raf = requestAnimationFrame((next) => this.draw(next));
  }

  /** Forced and timed drift checks, while the gaze is shown. */
  private watch(): void {
    if (this.mode !== 'live') return;
    const ctx = this.context();
    if (ctx && this.rec.context) for (const reason of forcedDriftReasons(this.rec.context, ctx)) if (!this.rec.forced.includes(reason)) this.rec.forced.push(reason);
    if (this.rec.forced.length > 0) {
      void this.driftCheck('forced');
      return;
    }
    const every = getState().settings.driftEveryMin;
    if (this.options.prompts && every > 0 && performance.now() >= nextDriftDueMs(this.rec.lastCheckMs, every)) void this.timedPrompt();
  }

  private async timedPrompt(): Promise<void> {
    if (!this.stage || this.mode !== 'live') return;
    this.mode = 'paused';
    this.showToolbar(false);
    const value = await this.stage.card({
      title: t('live.timed.title'),
      body: [t('live.timed.body', { min: getState().settings.driftEveryMin })],
      actions: [
        { label: t('live.timed.check'), value: 'check' },
        { label: t('live.timed.later'), value: 'later', secondary: true },
        { label: t('live.timed.off'), value: 'off', secondary: true },
      ],
    });
    if (this.mode !== 'paused' || !this.mounted || this.invalid) return;
    this.mode = 'live';
    this.showToolbar(true);
    if (value === 'check') {
      void this.driftCheck('timed');
      return;
    }
    if (value === 'off') this.options.prompts = false;
    this.rec.lastCheckMs = performance.now();
    this.raf = requestAnimationFrame((ts) => this.draw(ts));
  }

  private key(e: KeyboardEvent): void {
    if (this.mode !== 'live' || !this.stage || this.stage.cardOpen || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'SELECT' || target.tagName === 'INPUT')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') {
      e.preventDefault();
      this.toggleRecord();
    } else if (k === 'm') {
      e.preventDefault();
      this.marker();
    } else if (k === 'd') {
      e.preventDefault();
      void this.driftCheck('manual');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      void this.exit();
    }
  }

  // ----- Recording ----------------------------------------------------------------------

  private toggleRecord(): void {
    if (this.recording) this.stopRecording();
    else if (this.mode === 'live') this.startRecording();
  }

  private startRecording(): void {
    const n = this.rec.liveCount + 1;
    this.rec.liveCount = n;
    const id = this.estimator();
    this.recording = {
      kind: 'live',
      trial: trialName('live', n),
      fit: this.fit(),
      geometry: this.geometry as SessionGeometry,
      estimator: id,
      correctionDeg: this.rec.corrections[id] ?? null,
      corrections: { ...this.rec.corrections },
      irisPx: new Map(),
      frames: [],
      extraFlags: new Map(),
      markers: [],
      startMs: performance.now(),
      endMs: null,
    };
    this.rec.blocks.push(this.recording);
    this.recordButton?.setAttribute('aria-pressed', 'true');
    if (this.recordButton) this.recordButton.textContent = t('live.tool.stop');
    if (this.markerButton) this.markerButton.disabled = false;
    announce(t('live.recordStarted', { trial: this.recording.trial }));
    this.renderBlocks();
  }

  private stopRecording(): void {
    const r = this.recording;
    if (!r) return;
    this.recording = null;
    r.endMs = performance.now();
    r.frames.sort((a, b) => a.meta.index - b.meta.index);
    applyBlinkMask(r.frames);
    this.recordButton?.setAttribute('aria-pressed', 'false');
    if (this.recordButton) this.recordButton.textContent = t('live.tool.record');
    if (this.markerButton) this.markerButton.disabled = true;
    announce(t('live.recordStopped', { trial: r.trial, n: r.frames.length }));
    this.renderBlocks();
  }

  private marker(): void {
    const r = this.recording;
    if (!r) return;
    r.markers.push({ tMs: performance.now(), n: r.markers.length + 1 });
    announce(t('live.markerAdded', { n: r.markers.length }));
  }

  // ----- Checks -------------------------------------------------------------------------

  /**
   * Runs one schedule (drift check, RECAL5 or VAL6) on the live stage and returns its recording,
   * or null when it was aborted or invalidated (then the block is ended or paused).
   */
  private async runCheck(kind: CheckBlock['kind'], schedule: Schedule): Promise<CheckRun> {
    const stage = this.stage;
    const block = this.block;
    const link = this.link;
    const g = this.geometry;
    if (!stage || !block || !link || !g) return { kind: 'aborted' };
    if (this.recording) this.stopRecording();
    this.mode = 'check';
    cancelAnimationFrame(this.raf);
    this.showToolbar(false);
    const { settings } = getState();
    const recorder = new FrameRecorder(`${kind}-${schedule.seed}-${this.rec.blocks.length + 1}`, schedule, g);
    const distance = link.distanceMm ?? g.refDistanceMm ?? 600;
    const runner = new BlockRunner({
      stage,
      block,
      geometry: g.screen,
      recorder,
      sizes: targetSizes(!g.degreesApproximate, g.screen.pxPerMm, distance),
      reducedMotion: reducedMotion(),
      speed: settings.speed,
      minFrames: minAcceptedFrames(settings.speed),
      retry: kind === 'recalibration',
      extend: kind === 'recalibration',
      faceLost: () => link.faceLost(),
      pose: () => link.pose(),
    });
    runner.total = schedule.items.filter((i) => i.kind !== 'instruction').length;
    publishProtocol(runner, () => null);
    const iris = new Map<number, number>();
    this.checkIris = iris;
    link.arm(recorder, block);
    let outcome;
    try {
      outcome = await runSchedule(runner, schedule);
    } catch (error) {
      console.error('The check failed', error);
      outcome = { kind: 'aborted' as const };
    }
    runner.dispose();
    publishProtocol(null, () => null);
    if (!this.mounted) return { kind: 'aborted' };
    if (outcome.kind === 'done') {
      const last = recorder.recording.presentations[recorder.recording.presentations.length - 1];
      if (last) await link.drain(last.offsetMs);
    }
    link.disarm();
    this.checkIris = null;
    stage.configure(g.screen);
    if (outcome.kind === 'invalid') {
      this.onInvalidate(outcome.invalidation);
      return { kind: 'invalid' };
    }
    if (outcome.kind !== 'done') return { kind: 'aborted' };
    return { kind: 'done', rec: recorder.finish(), receivedMs: recorder.receivedMs, irisPx: iris };
  }

  private checkBlock(kind: CheckBlock['kind'], trial: string, run: CheckDone, fit: FitResult): CheckBlock {
    const id = this.estimator();
    return {
      kind,
      trial,
      fit,
      geometry: this.geometry as SessionGeometry,
      estimator: id,
      correctionDeg: this.rec.corrections[id] ?? null,
      corrections: { ...this.rec.corrections },
      irisPx: run.irisPx,
      recording: run.rec,
      receivedMs: run.receivedMs,
      nominalFps: this.capture?.nominalFps() ?? 30,
    };
  }

  private async driftCheck(why: 'manual' | 'timed' | 'forced'): Promise<void> {
    if (this.mode !== 'live' || !this.stage) return;
    const { settings } = getState();
    const n = this.rec.driftChecks + 1;
    const schedule = driftSchedule({ seed: settings.seed, check: n, preset: settings.preset, speed: settings.speed });
    if (why === 'forced') {
      this.mode = 'paused';
      this.showToolbar(false);
      await this.stage.card({ title: t('live.forced.title'), body: [this.rec.forced.map((r) => t(`live.forced.${r}`)).join(' ')], actions: [{ label: t('stimulus.continue'), value: 'go' }] });
      if (!this.mounted || this.mode !== 'paused' || this.invalid) return;
      this.mode = 'live';
    }
    const fit = this.fit();
    const run = await this.runCheck('drift', schedule);
    if (run.kind === 'aborted') this.resumeLive();
    if (run.kind !== 'done') return;
    this.rec.driftChecks = n;
    const trial = trialName('drift', n);
    const g = this.geometry as SessionGeometry;
    const nominalFps = this.capture?.nominalFps() ?? 30;
    const scored = scoreRecording(fit, run.rec, g, { nominalFps, receivedMs: run.receivedMs });
    this.rec.blocks.push(this.checkBlock('drift', trial, run, fit));
    this.rec.lastCheckMs = performance.now();
    this.rec.forced = [];
    this.rec.context = this.context();
    const state = getState();
    const id = this.estimator();
    // Each estimator keeps its own correction, measured on the same frames; the one in use decides what happens next.
    let inUse: { o: Vec2; action: 'apply' | 'recalibrate'; correction: Vec2; limit: number } | null = null;
    for (const r of scored.own) {
      const m = driftOffset(r);
      if (!m.offsetDeg) continue;
      const acc = ownReport(state.validation, r.estimator)?.accuracyMeanDeg ?? Number.NaN;
      const d = driftDecision(m.offsetDeg, acc);
      if (d.action === 'apply') this.rec.corrections[r.estimator] = d.correctionDeg;
      if (r.estimator === id) inUse = { o: m.offsetDeg, action: d.action, correction: d.correctionDeg, limit: d.limitDeg };
    }
    const onset = run.rec.presentations[0]?.onsetMs ?? performance.now();
    const stage = this.stage as StimulusStage;
    this.mode = 'paused';
    if (!inUse) {
      this.lastCheck = { kind: 'drift', targets: 2, verdict: null, action: 'no-data' };
      const v = await stage.card({ title: t('live.drift.noData.title'), body: [t('live.drift.noData.body')], actions: [{ label: t('live.drift.again'), value: 'again' }, { label: t('stimulus.continue'), value: 'go', secondary: true }] });
      this.resumeLive();
      if (v === 'again') void this.driftCheck('manual');
      return;
    }
    this.rec.driftLog.push({ tMs: onset, offsetDeg: inUse.o, applied: inUse.action === 'apply' });
    this.lastCheck = { kind: 'drift', targets: 2, verdict: null, action: inUse.action };
    this.saveSessionSummary();
    if (inUse.action === 'apply') {
      this.set?.setDrift(inUse.correction);
      this.filter.reset();
      announce(t('live.drift.applied.title'));
      await stage.card({ title: t('live.drift.applied.title'), body: [t('live.drift.applied.body', { value: offsetText(inUse.o, g) })], actions: [{ label: t('stimulus.continue'), value: 'go' }] });
      this.resumeLive();
      return;
    }
    const canRecalibrate = Boolean(this.rec.base?.calibration);
    const v = await stage.card({
      title: t('live.drift.large.title'),
      body: [t('live.drift.large.body', { value: offsetText(inUse.o, g), limit: `${g.degreesApproximate ? '≈' : ''}${inUse.limit.toFixed(1)}°` }), t(canRecalibrate ? 'live.drift.large.recal' : 'live.drift.large.full')],
      actions: [
        { label: t(canRecalibrate ? 'live.drift.recalibrate' : 'live.drift.calibrate'), value: 'recal' },
        { label: t('live.drift.notNow'), value: 'later', secondary: true },
      ],
    });
    if (!this.mounted) return;
    if (v !== 'recal') {
      this.resumeLive();
      return;
    }
    if (!canRecalibrate) {
      await this.exit();
      this.ctx.navigate('calibrate');
      return;
    }
    this.mode = 'live';
    await this.quickRecalibration(n);
  }

  private resumeLive(): void {
    if (!this.mounted || !this.block || this.invalid) return;
    this.mode = 'live';
    this.showToolbar(true);
    this.renderSummary();
    this.renderBlocks();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((ts) => this.draw(ts));
  }

  /** RECAL5 → refit with the new rows at weight ×2 → VAL6 (§4.13). */
  private async quickRecalibration(driftN: number): Promise<void> {
    const base = this.rec.base?.calibration;
    if (!base) return;
    const { settings } = getState();
    const oldFit = this.fit();
    const n = this.rec.recalibrations.length + 1;
    const run = await this.runCheck('recalibration', recalibrationSchedule({ seed: settings.seed, n, preset: settings.preset, speed: settings.speed }));
    if (run.kind === 'aborted') this.resumeLive();
    if (run.kind !== 'done') return;
    const stage = this.stage as StimulusStage;
    this.mode = 'paused';
    stage.setCaption(t('live.recal.fitting', { percent: 0 }));
    const ok = new Set(this.capture?.status.filter((s) => s.ok).map((s) => s.id) ?? []);
    const engines = ENGINE_IDS.filter((e) => oldFit.fits[e] && ok.has(e));
    let fit: FitResult;
    try {
      fit = await fitRecording(base, { seed: settings.seed, engines, maxMs: FIT_BUDGET_MS, recalibration: [...this.rec.recalibrations, run.rec] }, (_stage, fraction) =>
        stage.setCaption(t('live.recal.fitting', { percent: Math.round(100 * fraction) })),
      );
    } catch (error) {
      stage.setCaption('');
      if (!this.mounted) return;
      await stage.card({ title: t('live.recal.failed.title'), body: [t('validate.fitFailed', { message: error instanceof Error ? error.message : String(error) })], actions: [{ label: t('stimulus.continue'), value: 'go' }] });
      this.resumeLive();
      return;
    }
    stage.setCaption('');
    if (!this.mounted) return;
    this.rec.recalibrations.push(run.rec);
    this.rec.blocks.push(this.checkBlock('recalibration', trialName('drift', driftN), run, oldFit));
    this.rec.lineage.push(fit);
    this.rec.corrections = {};
    this.rec.revalidationNeeded = true;
    setState({ fit, validation: null });
    this.set = restoreEstimatorSet(fit, this.geometry);
    this.set.setDrift([0, 0]);
    this.fillEstimators();
    this.mode = 'live';
    if (await this.revalidate('recalibration')) this.resumeLive();
  }

  /** VAL6 (§4.13 after a recalibration, §4.15 after restoring); true when live gaze may go on. */
  private async revalidate(why: 'restore' | 'recalibration'): Promise<boolean> {
    const { settings } = getState();
    const n = this.rec.validationCount + 1;
    const schedule = validationSchedule({ preset: 'quick', seed: settings.seed, speed: settings.speed });
    const fit = this.fit();
    const run = await this.runCheck('validation', schedule);
    // Without the validation there is no live gaze: an abort returns to the page (an invalidated block pauses instead).
    if (run.kind === 'aborted') await this.exit();
    if (run.kind !== 'done') return false;
    this.rec.validationCount = n;
    const g = this.geometry as SessionGeometry;
    const nominalFps = this.capture?.nominalFps() ?? 30;
    const scored = scoreRecording(fit, run.rec, g, { nominalFps, receivedMs: run.receivedMs });
    setState({ validation: [...scored.own, ...scored.intersection] });
    setValidationRun({ recording: run.rec, receivedMs: run.receivedMs, nominalFps });
    this.rec.blocks.push(this.checkBlock('validation', trialName('validation', n), run, fit));
    const r = ownReport(scored.own, this.estimator());
    const verdict = r?.verdict ?? 'not-tracking';
    const stage = this.stage as StimulusStage;
    const value = r ? accuracyText(r, viewportDiagonalPx(g.screen)) : t('results.none.value');
    this.lastCheck = { kind: 'validation', targets: run.rec.schedule.items.filter((i) => i.kind === 'target').length, verdict, action: null };
    this.mode = 'paused';
    if (why === 'restore') {
      const restored = this.rec.restored as NonNullable<LiveRecords['restored']>;
      const passed = isGood(verdict);
      restored.validated = passed;
      this.saveSessionSummary();
      if (!passed) {
        await stage.card({ title: t('live.restored.failed.title'), body: [t('live.restored.failed.body', { value, verdict: t(`results.verdict.${verdict}`) })], actions: [{ label: t('stimulus.continue'), value: 'go' }] });
        await this.exit();
        this.alert('error', t('live.restored.failed.page', { verdict: t(`results.verdict.${verdict}`) }));
        this.renderSummary();
        return false;
      }
      void touchProfile(restored.key).catch(() => undefined);
      if (!this.rec.forced.includes('restore')) this.rec.forced.push('restore');
      await stage.card({ title: t('live.restored.passed.title'), body: [t('live.restored.passed.body', { value, verdict: t(`results.verdict.${verdict}`) })], actions: [{ label: t('stimulus.continue'), value: 'go' }] });
    } else {
      this.rec.revalidationNeeded = false;
      this.saveSessionSummary();
      if (this.capture) void this.saveProfileOnce(this.capture);
      await stage.card({ title: t('live.revalidate.done.title'), body: [t('live.revalidate.done.body', { value, verdict: t(`results.verdict.${verdict}`) })], actions: [{ label: t('stimulus.continue'), value: 'go' }] });
    }
    if (!this.mounted || this.invalid) return false;
    this.mode = 'live';
    this.renderSummary();
    return true;
  }

  // ----- Pausing and leaving -------------------------------------------------------------

  private onInvalidate(inv: Invalidation): void {
    if (!this.stage || this.mode === 'idle') return;
    this.invalid = true;
    if (this.recording) this.stopRecording();
    if (!this.rec.forced.includes('viewport')) this.rec.forced.push('viewport');
    this.mode = 'paused';
    cancelAnimationFrame(this.raf);
    this.showToolbar(false);
    const stage = this.stage;
    stage.clear();
    const body = [invalidationText(inv), t(inv.reason === 'orientation' ? 'live.paused.rotate' : 'live.paused.layout')];
    void stage
      .card({ title: t('live.paused.title'), body, role: 'alertdialog', actions: [{ label: t('live.paused.resume'), value: 'resume' }, { label: t('live.tool.exit'), value: 'exit', secondary: true }] })
      .then(async (value) => {
        if (!this.mounted || this.mode !== 'paused') return;
        if (value !== 'resume') {
          await this.exit();
          return;
        }
        await this.endBlock();
        this.mode = 'starting';
        if (await this.present()) await this.proceed();
      });
  }

  private async endBlock(): Promise<void> {
    for (const off of this.blockOffs.splice(0)) off();
    const block = this.block;
    this.block = null;
    if (block) await block.end();
  }

  private endStage(): void {
    this.toolbar?.remove();
    this.message?.remove();
    this.toolbar = null;
    this.message = null;
    this.statusLine = null;
    releaseStage();
    this.stage = null;
    this.mode = 'idle';
    this.startButton.disabled = !this.capture;
  }

  /** Leaves live gaze: stops any recording, ends the presentation and returns to the page. */
  private async exit(): Promise<void> {
    if (this.recording) this.stopRecording();
    cancelAnimationFrame(this.raf);
    if (this.watchTimer !== null) clearInterval(this.watchTimer);
    this.watchTimer = null;
    this.stage?.dismissCard('closed');
    await this.endBlock();
    this.endStage();
    this.renderSummary();
    this.renderBlocks();
    this.startButton.focus();
  }

  private stopLive(): void {
    void this.exit();
  }

  private snapshot(): Snapshot {
    return {
      mode: this.mode,
      results: this.results,
      dots: this.dots,
      lastDot: this.lastDot,
      recording: this.recording !== null,
      estimator: getState().fit ? this.estimator() : null,
      blocks: this.rec.blocks.map((b) => ({ trial: b.trial, kind: b.kind, frames: b.kind === 'live' ? b.frames.length : b.recording.frames.length, markers: b.kind === 'live' ? b.markers.length : 0 })),
      driftLog: this.rec.driftLog.map((e) => ({ ...e })),
      restored: this.rec.restored ? { key: this.rec.restored.key, validated: this.rec.restored.validated } : null,
      revalidationNeeded: this.rec.revalidationNeeded,
      lastCheck: this.lastCheck,
      message: this.lastMessage,
    };
  }

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    snapshotFn = () => null;
    if (this.recording) this.stopRecording();
    cancelAnimationFrame(this.raf);
    if (this.watchTimer !== null) clearInterval(this.watchTimer);
    for (const off of this.offs.splice(0)) off();
    this.stage?.dismissCard('closed');
    void this.endBlock();
    this.toolbar?.remove();
    this.message?.remove();
    releaseStage();
    this.link?.dispose();
    publishProtocol(null, () => null);
    void this.wake?.release();
  }
}

const view: Screen = {
  mount(root, ctx) {
    const rec = currentRecords();
    if (!rec) {
      root.append(
        h('style', null, BANNER_CSS + LIVE_CSS),
        h(
          'div',
          { class: 'live-page' },
          h('h1', null, t('route.live')),
          h('p', { class: 'lead' }, t('live.none')),
          h('div', { class: 'actions' }, h('a', { href: '#/camera', class: 'button' }, t('live.toCalibrate')), h('a', { href: '#/data', class: 'button secondary' }, t('live.toStored'))),
        ),
      );
      return;
    }
    const s = new LiveScreen(root, ctx, rec);
    return () => s.unmount();
  },
};

export default view;
