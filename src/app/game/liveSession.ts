// The live machinery after a calibration (spec §4.10, §4.11, §4.13, §4.15, §17.8, §17.9.3), shared
// by Free look, Re-aim and the challenge: the session's records (the lineage of fits, the recorded
// blocks, the drift log and the corrections, a restored profile, the forced-check reasons), the
// estimator set and the One Euro display stream with the blink hold, the drift check's scoring
// and decision, the quick warm-up's refit with its required revalidation, and Re-aim, the drift
// check as the game presents it (two bubbles over the screen that offered it).
//
// Raw outputs are what is recorded; filtering is for display and the game only (§4.11).
import manifestUrl from '../../../assets-manifest.json?url';
import { driftDecision, driftLimitDeg, driftOffset, driftSchedule, forcedDriftReasons, type DriftContext, type DriftForceReason } from '../../core/calibration/drift.ts';
import { SETUP } from '../../core/constants.ts';
import type { DriftLogEntry } from '../../core/export/sessionJson.ts';
import { trialName } from '../../core/export/samplesCsv.ts';
import { BLINK_HOLD_INITIAL, blinkHold, type BlinkHoldState } from '../../core/filters/blinkHold.ts';
import { OneEuroFilter2D } from '../../core/filters/oneEuro.ts';
import { addCorrection } from '../../core/game/offset.ts';
import type { RoundKey } from '../../core/game/params.ts';
import type { ItemRecord, ZoneStat } from '../../core/game/stats.ts';
import { reaimResult, type ReaimResult } from '../../core/game/reaim.ts';
import { degToPx } from '../../core/geometry/angles.ts';
import { isDegreesApproximate } from '../../core/geometry/screen.ts';
import { FrameRecorder } from '../../core/protocol/labelling.ts';
import { minAcceptedFrames } from '../../core/protocol/schedule.ts';
import { createPositionGuard, type PositionGuard } from '../../core/position/guard.ts';
import type { Home } from '../../core/position/home.ts';
import { bubbleDiameterPx } from '../../core/warmup/bubble.ts';
import { ENGINE_IDS, Flags } from '../../core/types.ts';
import type { EngineId, EstimatorId, FitResult, FrameResult, GazeSample, RecordedFrame, Recording, ScreenGeometry, SessionGeometry, TargetItem, ValidationReport, Vec2 } from '../../core/types.ts';
import { frameBaseFlags, restoreEstimatorSet, scoreRecording, type EstimatorSet } from '../../fit/fitClient.ts';
import { loadManifest } from '../../platform/assets.ts';
import { HAPTICS, playSound, vibrate } from '../../platform/feedback.ts';
import type { Presentation as Block, Invalidation } from '../../platform/presentation.ts';
import { onDataDeleted, profileKey, saveProfile, saveSession, touchProfile, type ProfileKeyParts, type ProfileRecord } from '../../platform/storage.ts';
import { gameColours } from '../components/bubble.ts';
import { cornerCluster } from '../components/cornerCluster.ts';
import { attachPositionGuard, type AttachedGuard } from '../components/pauseOverlay.ts';
import { offerCard, statusChip } from '../components/offerCard.ts';
import { pauseCard } from '../components/pauseCard.ts';
import { pipLine } from '../components/pipLine.ts';
import { positionGlyph } from '../components/positionGlyph.ts';
import { BlockRunner, StimulusStage, type PauseReason, type RunOutcome } from '../components/stimulusCanvas.ts';
import { targetSizes } from '../components/target.ts';
import { announce, h } from '../dom.ts';
import { openDetails } from '../shell/detailsSheet.ts';
import { isFullscreen } from '../../platform/fullscreen.ts';
import { activeMotionSource, currentValidationRun, ensureCapture, readyHome, requestedEngines, resetSessionResults, type Capture, type ValidationRun } from '../session.ts';
import { endSpan, playableZones, recalibrationNumber, setWarmupMode, span, startSpan } from './gameState.ts';
import { getState, setPrefs, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { CaptureLink, measuredScale, reducedMotion } from './warmupRunner.ts';

// ----- Session blocks and records (read by Details → Data for the export) --------------------

interface BlockBase {
  /** `trialName(...)`: live-<nnn>, drift-<n>, validation-<n>, game-<nnn>. */
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

/** Frames recorded without labels: Live and Free look (Expert mode), and the challenge's rounds. */
interface FramesBlock extends BlockBase {
  frames: RecordedFrame[];
  /** HIDDEN, NOT_FULLSCREEN and DROPPED by frame index (a live frame has no label to carry them). */
  extraFlags: Map<number, number>;
  startMs: number;
  endMs: number | null;
}

export interface LiveBlock extends FramesBlock {
  kind: 'live';
  markers: { tMs: number; n: number }[];
}

export interface CheckBlock extends BlockBase {
  kind: 'drift' | 'recalibration' | 'validation';
  recording: Recording;
  receivedMs: Map<number, number>;
  nominalFps: number;
}

/** Where a round's bubble was at a moment of the round (a drifter moves), for samples.csv. */
export interface TrackPoint {
  tMs: number;
  itemId: string | null;
  x: number;
  y: number;
}

/** One challenge round as session.json records it (spec §17.10.1). */
export interface GameRoundRecord {
  trial: string;
  round: number;
  key: RoundKey;
  seed: number;
  cols: number;
  rows: number;
  score: number;
  stars: number;
  popped: number;
  total: number;
  zones: ZoneStat[];
  /** The round was cut short (a screen change, Exit). */
  ended: 'complete' | 'aborted';
}

export interface GameBlock extends FramesBlock {
  kind: 'game';
  /** The bubbles as target items with phase `game`, in onset order, at their onset centre. */
  items: TargetItem[];
  presentations: { itemId: string; onsetMs: number; offsetMs: number }[];
  track: TrackPoint[];
  records: ItemRecord[];
  round: GameRoundRecord;
  /**
   * A Re-aim between bubbles changes the corrections in use: from frame index `fromIndex` on, the
   * round's frames were shown (and are exported) with these; earlier frames with `corrections`.
   */
  segments: { fromIndex: number; corrections: Partial<Record<EstimatorId, Vec2>> }[];
}

export type SessionBlock = LiveBlock | CheckBlock | GameBlock;

export interface LiveRecords {
  /** The fits of this session's calibration: the first, then each quick-recalibration refit. */
  lineage: FitResult[];
  /** The calibration and its first validation, captured when the records began. */
  base: { calibration: Recording | null; validation: ValidationRun | null; fit: FitResult } | null;
  blocks: SessionBlock[];
  driftLog: DriftLogEntry[];
  driftChecks: number;
  recalibrations: Recording[];
  liveCount: number;
  validationCount: number;
  gameCount: number;
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
    gameCount: 0,
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
export function currentRecords(): LiveRecords | null {
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
 * estimator, no validation. A VAL6 check of at least "acceptable" is then required before the
 * gaze is used, followed by a drift check.
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

// ----- Asset hashes and stored profiles (§4.15) --------------------------------------------

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

export function ownReport(reports: readonly ValidationReport[] | null, id: EstimatorId): ValidationReport | null {
  return reports?.find((r) => r.mode === 'own' && r.estimator === id) ?? null;
}

export function isGood(verdict: ValidationReport['verdict'] | undefined): boolean {
  return verdict === 'good' || verdict === 'acceptable';
}

/** The estimator in use, where the fit has it; else Auto's choice. */
export function estimatorInUse(fit: FitResult): EstimatorId {
  const e = getState().estimator ?? fit.selection.estimator;
  return e === 'combined' ? (fit.combined ? e : fit.selection.estimator) : fit.fits[e] ? e : fit.selection.estimator;
}

/** Stores the calibration as a profile once per fit, when it has been validated in this session. True when stored now. */
export async function saveProfileOnce(rec: LiveRecords, c: Capture): Promise<boolean> {
  const state = getState();
  const fit = state.fit;
  if (!fit || rec.saved.has(fit) || !state.validation || rec.revalidationNeeded || rec.restored) return false;
  rec.saved.add(fit);
  const firstFrame = rec.base?.calibration?.frames[0]?.meta;
  const video = firstFrame ? { w: firstFrame.videoW, h: firstFrame.videoH } : { w: c.camera.settings.width, h: c.camera.settings.height };
  const parts = await profileParts(fit, c.camera.info.deviceIdHash, video);
  const id = estimatorInUse(fit);
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
    return true;
  } catch (error) {
    console.warn('The calibration could not be stored', error);
    return false;
  }
}

export function saveSessionSummary(rec: LiveRecords): void {
  const state = getState();
  const fit = state.fit;
  if (!fit || (!state.validation && rec.driftLog.length === 0)) return;
  const now = Date.now();
  void saveSession({
    id: rec.sessionId,
    savedAt: state.clock.startEpochMs,
    updatedAt: now,
    participant: state.settings.pid,
    session: state.settings.session,
    preset: state.settings.preset,
    estimator: estimatorInUse(fit),
    geometry: state.geometry,
    reports: state.validation ?? [],
    driftLog: rec.driftLog.map((e) => ({ ...e })),
    summary: {
      seed: state.settings.seed,
      selection: fit.selection,
      engines: Object.keys(fit.fits),
      restored: rec.restored?.key ?? null,
      blocks: rec.blocks.map((b) => b.trial),
    },
  }).catch((error: unknown) => console.warn('The session summary could not be stored', error));
}

// ----- Geometry, forced checks -------------------------------------------------------------

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** The session geometry for the estimators: the calibration's viewport, or `screen` when given. */
export function liveGeometry(fit: FitResult, screen?: ScreenGeometry): SessionGeometry {
  const g = getState().geometry ?? (fit.fitGeometry as SessionGeometry);
  const fitFocal = fit.fitGeometry?.distance.focalPx ?? g.distance.focalPx;
  const ref = positive(g.refDistanceMm) ? g.refDistanceMm : (fit.refDistanceMm * g.distance.focalPx) / fitFocal;
  const base = fit.fitGeometry ? { ...fit.fitGeometry.screen, pxPerMm: g.screen.pxPerMm, pxPerMmSource: g.screen.pxPerMmSource } : g.screen;
  const s = screen ?? base;
  return { screen: s, distance: { ...g.distance }, refDistanceMm: ref, degreesApproximate: isDegreesApproximate(s, g.distance) };
}

/** What a forced drift check compares (§4.13), for the capture and the geometry now. */
export function driftContextOf(c: Capture | null, g: SessionGeometry | null): DriftContext | null {
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

export function noteForced(rec: LiveRecords, reason: DriftForceReason): void {
  if (!rec.forced.includes(reason)) rec.forced.push(reason);
}

/** Adds the reasons a check is forced since the context of the last check (or keeps this one as the first). */
export function collectForced(rec: LiveRecords, ctx: DriftContext | null): void {
  if (!ctx) return;
  if (!rec.context) {
    rec.context = ctx;
    return;
  }
  for (const reason of forcedDriftReasons(rec.context, ctx)) noteForced(rec, reason);
}

// ----- The display stream (§4.11) ----------------------------------------------------------

/** Flags that hide the gaze (blinks are left to the blink hold; OUT_OF_RANGE only greys it). */
export const HIDE_FLAGS = Flags.NO_FACE | Flags.DROPPED | Flags.ENGINE_ERROR | Flags.HIDDEN | Flags.NOT_FULLSCREEN;

export interface GazeDisplay {
  /** Drift-corrected position, unfiltered and filtered (CSS px), or null. */
  raw: Vec2 | null;
  filtered: Vec2 | null;
  perEngine: Partial<Record<EngineId, Vec2>>;
  confidence: number;
  greyed: boolean;
  /** A gaze is shown (false while hidden by an invalid frame or a long blink). */
  visible: boolean;
  /** The blink hold is holding the last position: the game's dwell pauses. */
  held: boolean;
}

export const NO_DISPLAY: GazeDisplay = { raw: null, filtered: null, perEngine: {}, confidence: 0, greyed: false, visible: false, held: false };

/** A FrameResult as a live frame (no label). */
export function liveFrame(r: FrameResult, distanceMm: number | null): RecordedFrame {
  const face = r.face;
  return {
    meta: r.meta,
    distanceMm,
    yawDeg: face ? face.pose.yawDeg : null,
    pitchDeg: face ? face.pose.pitchDeg : null,
    rollDeg: face ? face.pose.rollDeg : null,
    eyeMidNorm: face ? face.eyes.eyeMidNorm : null,
    open: face !== null && face.eyes.open,
    label: null,
    engines: r.engines,
  };
}

/**
 * The selected estimator's gaze for display: raw predictions, the drift correction in use, the
 * One Euro filter of §4.11 on valid samples, and the blink hold, which holds the last position
 * through a blink and hides it when the eyes stay closed or the frame is invalid.
 */
export class GazeStream {
  private set: EstimatorSet;
  private geometry: SessionGeometry;
  private readonly corrections: () => Partial<Record<EstimatorId, Vec2>>;
  private filter = new OneEuroFilter2D();
  private hold: BlinkHoldState = { ...BLINK_HOLD_INITIAL };
  display: GazeDisplay = { ...NO_DISPLAY };

  constructor(fit: FitResult, geometry: SessionGeometry, corrections: () => Partial<Record<EstimatorId, Vec2>>) {
    this.set = restoreEstimatorSet(fit, geometry);
    this.geometry = geometry;
    this.corrections = corrections;
  }

  /** A new fit or geometry (a recalibration, a new presentation). */
  rebuild(fit: FitResult, geometry: SessionGeometry): void {
    this.set = restoreEstimatorSet(fit, geometry);
    this.geometry = geometry;
    this.reset();
  }

  setDrift(correction: Vec2): void {
    this.set.setDrift(correction);
    this.reset();
  }

  reset(): void {
    this.filter.reset();
    this.hold = { ...BLINK_HOLD_INITIAL };
    this.display = { ...NO_DISPLAY };
  }

  get screen(): ScreenGeometry {
    return this.geometry.screen;
  }

  /** One frame: the estimator's sample (what is recorded) and the display after it. */
  push(f: RecordedFrame, r: FrameResult, extraFlags: number, id: EstimatorId): GazeSample {
    const s = this.set.estimator(id).estimate(f, frameBaseFlags(f) | extraFlags);
    const showable = s.correctedDeg !== null && s.correctedPx !== null && (s.flags & HIDE_FLAGS) === 0;
    const gazeValid = showable && (s.flags & Flags.BLINK) === 0;
    const decision = blinkHold(this.hold, { tMs: r.meta.tCaptureMs, blinkL: r.face ? r.face.eyes.blinkL : null, blinkR: r.face ? r.face.eyes.blinkR : null, gazeValid });
    this.hold = decision.state;
    if (decision.display === 'hide') {
      this.display = { ...this.display, visible: false, held: false };
      return s;
    }
    if (decision.display === 'hold') {
      this.display = { ...this.display, held: true };
      return s;
    }
    const g = this.geometry;
    const d = positive(s.distanceMm) ? s.distanceMm : (g.refDistanceMm as number);
    const corrected = s.correctedDeg as Vec2;
    const filtDeg = this.filter.filter(corrected[0], corrected[1], s.tCaptureMs);
    const perEngine: Partial<Record<EngineId, Vec2>> = {};
    const corrections = this.corrections();
    for (const [e, deg] of Object.entries(s.perEngineDeg) as [EngineId, Vec2][]) {
      const c = corrections[e] ?? [0, 0];
      perEngine[e] = degToPx([deg[0] + c[0], deg[1] + c[1]], g.screen, d);
    }
    this.display = { raw: s.correctedPx, filtered: degToPx(filtDeg, g.screen, d), perEngine, confidence: s.confidence, greyed: (s.flags & Flags.OUT_OF_RANGE) !== 0, visible: true, held: false };
    return s;
  }
}

// ----- Checks: drift, recalibration, revalidation (§4.13, §4.15) ----------------------------

export type CheckDone = { kind: 'done'; rec: Recording; receivedMs: Map<number, number>; irisPx: Map<number, number> };
export type CheckRun = CheckDone | { kind: 'aborted' } | { kind: 'invalid'; invalidation?: Invalidation };

export function checkBlock(rec: LiveRecords, kind: CheckBlock['kind'], trial: string, run: CheckDone, fit: FitResult, geometry: SessionGeometry, estimator: EstimatorId, nominalFps: number): CheckBlock {
  return {
    kind,
    trial,
    fit,
    geometry,
    estimator,
    correctionDeg: rec.corrections[estimator] ?? null,
    corrections: { ...rec.corrections },
    irisPx: run.irisPx,
    recording: run.rec,
    receivedMs: run.receivedMs,
    nominalFps,
  };
}

export interface DriftInUse {
  /** o = mean(Ḡ − T), degrees. */
  o: Vec2;
  action: 'apply' | 'recalibrate';
  correction: Vec2;
  limit: number;
  magnitude: number;
}

/**
 * Scores the n-th drift check (§4.13) and records it: the block, each estimator's correction
 * where it applies (measured on the same frames), and the drift log entry of the estimator in
 * use, whose decision is returned (null when it had no valid sample on a target).
 */
export function applyDriftCheck(rec: LiveRecords, n: number, run: CheckDone, fit: FitResult, geometry: SessionGeometry, estimator: EstimatorId, nominalFps: number): DriftInUse | null {
  rec.driftChecks = n;
  const scored = scoreRecording(fit, run.rec, geometry, { nominalFps, receivedMs: run.receivedMs });
  rec.blocks.push(checkBlock(rec, 'drift', trialName('drift', n), run, fit, geometry, estimator, nominalFps));
  rec.lastCheckMs = performance.now();
  rec.forced = [];
  const state = getState();
  let inUse: DriftInUse | null = null;
  for (const r of scored.own) {
    const m = driftOffset(r);
    if (!m.offsetDeg) continue;
    const acc = ownReport(state.validation, r.estimator)?.accuracyMeanDeg ?? Number.NaN;
    const d = driftDecision(m.offsetDeg, acc);
    if (d.action === 'apply') rec.corrections[r.estimator] = d.correctionDeg;
    if (r.estimator === estimator) inUse = { o: m.offsetDeg, action: d.action, correction: d.correctionDeg, limit: d.limitDeg, magnitude: d.magnitudeDeg };
  }
  if (inUse) rec.driftLog.push({ tMs: run.rec.presentations[0]?.onsetMs ?? performance.now(), offsetDeg: inUse.o, applied: inUse.action === 'apply', source: 'check' });
  saveSessionSummary(rec);
  return inUse;
}

/**
 * The challenge's offset correction (§17.9.3), added to the estimator's correction in use; logged
 * in the drift log with source `game` whether or not it was applied.
 */
export function applyGameOffset(rec: LiveRecords, estimator: EstimatorId, offsetDeg: Vec2, tMs: number): { applied: boolean; correction: Vec2 } {
  const acc = ownReport(getState().validation, estimator)?.accuracyMeanDeg ?? Number.NaN;
  const out = addCorrection(rec.corrections[estimator] ?? null, offsetDeg, driftLimitDeg(acc));
  if (out.applied) rec.corrections[estimator] = out.correctionDeg;
  rec.driftLog.push({ tMs, offsetDeg, applied: out.applied, source: 'game' });
  saveSessionSummary(rec);
  return { applied: out.applied, correction: out.correctionDeg };
}

/** A restored calibration's VAL6 has been judged: usable at "acceptable" or better, and a drift check is forced. */
export function settleRestore(rec: LiveRecords, verdict: ValidationReport['verdict']): boolean {
  const restored = rec.restored;
  if (!restored) return true;
  const passed = isGood(verdict);
  restored.validated = passed;
  if (passed) {
    void touchProfile(restored.key).catch(() => undefined);
    noteForced(rec, 'restore');
  }
  saveSessionSummary(rec);
  return passed;
}

/**
 * The game's quick warm-up (§17.8.3) ran in the warm-up screen: its RECAL5 and the refit at weight
 * ×2 replace the fit, and its VAL6 is the new validation. Called with the old fit still in use.
 */
export function adoptQuickWarmup(o: { oldFit: FitResult; fit: FitResult; recalibration: Recording; test: { rec: Recording; receivedMs: Map<number, number>; nominalFps: number } }): void {
  const rec = currentRecords();
  if (!rec || !rec.lineage.includes(o.oldFit)) return;
  const estimator = estimatorInUse(o.oldFit);
  const geometry = o.test.rec.geometry;
  const empty = new Map<number, number>();
  rec.recalibrations.push(o.recalibration);
  rec.blocks.push(checkBlock(rec, 'recalibration', trialName('drift', Math.max(1, rec.driftChecks)), { kind: 'done', rec: o.recalibration, receivedMs: empty, irisPx: empty }, o.oldFit, o.recalibration.geometry, estimator, o.test.nominalFps));
  rec.lineage.push(o.fit);
  rec.corrections = {};
  rec.revalidationNeeded = false;
  rec.validationCount += 1;
  rec.blocks.push(checkBlock(rec, 'validation', trialName('validation', rec.validationCount), { kind: 'done', rec: o.test.rec, receivedMs: o.test.receivedMs, irisPx: empty }, o.fit, geometry, estimator, o.test.nominalFps));
}

/** The restored calibration's Test round (§17.4.4) as the records' first validation block. */
export function adoptRestoreTestRound(o: { fit: FitResult; test: { rec: Recording; receivedMs: Map<number, number>; nominalFps: number }; verdict: ValidationReport['verdict'] }): boolean {
  const rec = currentRecords();
  if (!rec) return false;
  const empty = new Map<number, number>();
  rec.validationCount += 1;
  rec.blocks.push(checkBlock(rec, 'validation', trialName('validation', rec.validationCount), { kind: 'done', rec: o.test.rec, receivedMs: o.test.receivedMs, irisPx: empty }, o.fit, o.test.rec.geometry, estimatorInUse(o.fit), o.test.nominalFps));
  return settleRestore(rec, o.verdict);
}

/** Starts the n-th game block (a round): the frames, the bubbles and the bubble track follow. */
export function startGameBlock(rec: LiveRecords, o: { fit: FitResult; geometry: SessionGeometry; estimator: EstimatorId; round: Omit<GameRoundRecord, 'trial' | 'score' | 'stars' | 'popped' | 'total' | 'zones' | 'ended'> }): GameBlock {
  rec.gameCount += 1;
  const trial = trialName('game', rec.gameCount);
  const block: GameBlock = {
    kind: 'game',
    trial,
    fit: o.fit,
    geometry: o.geometry,
    estimator: o.estimator,
    correctionDeg: rec.corrections[o.estimator] ?? null,
    corrections: { ...rec.corrections },
    irisPx: new Map(),
    frames: [],
    extraFlags: new Map(),
    startMs: performance.now(),
    endMs: null,
    items: [],
    presentations: [],
    track: [],
    records: [],
    round: { ...o.round, trial, score: 0, stars: 0, popped: 0, total: 0, zones: [], ended: 'aborted' },
    segments: [],
  };
  rec.blocks.push(block);
  return block;
}

// ----- Re-aim: the drift check as a two-bubble mini-level (§17.8.2, design §2.15) ----------------

export type ReaimChoice = 'quick' | 'full' | 'keep' | 'again';

export interface ReaimOutcome {
  result: ReaimResult | 'aborted' | 'invalid';
  /** What the player chose on the "moved a lot" or "no data" card. */
  choice: ReaimChoice | null;
  inUse: DriftInUse | null;
  invalidation?: Invalidation;
}

export interface ReaimOptions {
  /** The screen it runs over (the `.app`); the route does not change. */
  root: HTMLElement;
  capture: Capture;
  link: CaptureLink;
  guard: PositionGuard | null;
  block: Block;
  fit: FitResult;
  geometry: SessionGeometry;
  estimator: EstimatorId;
  /** A check forced by §4.13 cannot be skipped: Exit is not offered. */
  forced: boolean;
  /** Exit from the Pause card. */
  onExit(): void;
}

let reaimRunning = false;
let cancelRunning: (() => void) | null = null;

export function reaimActive(): boolean {
  return reaimRunning;
}

/**
 * Stops a Re-aim in progress because the screen under it is going: the run aborts, a card waiting
 * for an answer gets "Keep playing", and a later Re-aim can run.
 */
export function cancelReaim(): void {
  cancelRunning?.();
}

/**
 * Runs Re-aim over `root`: the existing drift schedule (the centre and one seeded VAL12 location,
 * settle 500 ms, sample 1000 ms) as two warm-up bubbles on the grey with a two-pip line and the
 * corner cluster, no card; the outcome as a chip ("Aim fixed", "Your aim was fine") or a card
 * ("Your aim moved a lot" with the quick warm-up). The position guard pauses it as it pauses a level.
 */
export async function runReaim(o: ReaimOptions): Promise<ReaimOutcome> {
  const rec = currentRecords();
  if (!rec || reaimRunning) return { result: 'aborted', choice: null, inUse: null };
  reaimRunning = true;
  let cancelled = false;
  let answer: ((choice: ReaimChoice) => void) | null = null;
  const { settings } = getState();
  const n = rec.driftChecks + 1;
  const schedule = driftSchedule({ seed: settings.seed, check: n, preset: settings.preset, speed: settings.speed });
  const items = schedule.items.filter((i): i is TargetItem => i.kind === 'target');
  const glyph = positionGlyph();
  const stage = new StimulusStage();
  const pips = pipLine(t('reaim.progress'));
  const layer = h('div', { class: 'stim-layer reaim__layer' });
  let runner: BlockRunner | null = null;
  cancelRunning = () => {
    cancelled = true;
    runner?.abort();
    answer?.('keep');
  };
  const corner = cornerCluster(glyph.el, t('warmup.pause'), () => runner?.pause('manual'));
  const el = h('div', { class: 'reaim', role: 'region', 'aria-label': t('reaim.name') }, h('h1', { class: 'sr-only' }, t('reaim.name')), h('div', { class: 'reaim__stage', 'aria-hidden': 'true' }, stage.el), pips.el, corner.el, layer);
  o.root.append(el);
  o.root.dataset.reaim = '';
  const offs: (() => void)[] = [];
  if (o.guard) {
    const g = o.guard;
    const before = g.state().context;
    g.setContext('reaim');
    offs.push(
      () => g.setContext(before),
      g.onChange((s) => glyph.update({ glyph: s.view.glyph, eyes: s.view.eyes, nudge: null })),
      g.onPause(() => runner?.pause('guard')),
      g.onResume(() => runner?.resume('guard')),
    );
    const s = g.state();
    glyph.update({ glyph: s.view.glyph, eyes: s.view.eyes, nudge: null });
  }
  const finish = () => {
    for (const off of offs.splice(0)) off();
    stage.destroy();
    el.remove();
    delete o.root.dataset.reaim;
    reaimRunning = false;
    cancelRunning = null;
  };
  try {
    const run = await presentReaim(o, rec, schedule, items, stage, pips, corner, layer, (r) => {
      runner = r;
      if (cancelled) r.abort();
    });
    if (cancelled) return { result: 'aborted', choice: null, inUse: null };
    if (run.kind === 'invalid') return { result: 'invalid', choice: null, inUse: null, ...(run.invalidation ? { invalidation: run.invalidation } : {}) };
    if (run.kind === 'aborted') return { result: 'aborted', choice: null, inUse: null };
    const inUse = applyDriftCheck(rec, n, run, o.fit, o.geometry, o.estimator, o.capture.nominalFps());
    rec.context = driftContextOf(o.capture, o.geometry);
    const result = reaimResult(inUse?.magnitude ?? null, inUse?.action ?? null);
    corner.setPlaying(false);
    pips.el.hidden = true;
    if (result === 'fine' || result === 'fixed') {
      const key = result === 'fine' ? 'reaim.fine' : 'reaim.fixed';
      announce(t(key));
      await showChip(layer, t(key), settings.speed);
      return { result, choice: null, inUse };
    }
    const choice = await new Promise<ReaimChoice>((resolve) => {
      answer = resolve;
      if (cancelled) {
        resolve('keep');
        return;
      }
      const quick = Boolean(rec.base?.calibration);
      const card =
        result === 'large'
          ? offerCard({
              title: t('reaim.large.title'),
              body: t(quick ? 'reaim.large.body' : 'reaim.large.bodyFull'),
              primary: { label: t(quick ? 'reaim.large.quick' : 'reaim.large.full'), onSelect: () => resolve(quick ? 'quick' : 'full') },
              secondary: { label: t('reaim.keep'), onSelect: () => resolve('keep') },
            })
          : offerCard({
              title: t('reaim.noData.title'),
              body: t('reaim.noData.body'),
              primary: { label: t('reaim.noData.again'), onSelect: () => resolve('again') },
              secondary: { label: t('reaim.keep'), onSelect: () => resolve('keep') },
            });
      layer.replaceChildren(card.el);
      card.focus();
      announce(card.title);
    });
    return { result, choice, inUse };
  } finally {
    finish();
  }
}

async function presentReaim(
  o: ReaimOptions,
  rec: LiveRecords,
  schedule: ReturnType<typeof driftSchedule>,
  items: TargetItem[],
  stage: StimulusStage,
  pips: ReturnType<typeof pipLine>,
  corner: ReturnType<typeof cornerCluster>,
  layer: HTMLElement,
  setRunner: (r: BlockRunner) => void,
): Promise<CheckRun> {
  const { settings, prefs } = getState();
  const g = o.geometry;
  const distance = o.link.distanceMm ?? g.refDistanceMm ?? 600;
  const sizes = targetSizes(!g.degreesApproximate, g.screen.pxPerMm, distance);
  const fullR = bubbleDiameterPx(sizes.discPx / 0.6, Math.min(g.screen.viewportWpx, g.screen.viewportHpx)) / 2;
  const colours = gameColours(o.root);
  const recorder = new FrameRecorder(`drift-${schedule.seed}-${rec.blocks.length + 1}`, schedule, g);
  const iris = new Map<number, number>();
  const offIris = o.capture.onResult((r) => {
    if (r.face) iris.set(r.meta.index, r.face.eyes.irisDiamPx);
  });
  let pauseCardEl: { el: HTMLElement; dispose(): void } | null = null;
  const runner = new BlockRunner({
    stage,
    block: o.block,
    geometry: g.screen,
    recorder,
    sizes,
    reducedMotion: reducedMotion(),
    speed: settings.speed,
    minFrames: minAcceptedFrames(settings.speed),
    retry: false,
    extend: false,
    faceLost: () => false,
    pose: () => o.link.pose(),
    game: {
      style: 'bubble',
      bubble: { fullR, coreR: sizes.discPx / 2 },
      headR: fullR,
      colours,
      limitedHead: prefs.limitedHead,
      paused: (reason: PauseReason) => {
        if (reason === 'guard') return;
        const card = pauseCard({
          sound: getState().settings.sound,
          onSound: (on) => void setPrefs({ sound: on }),
          onDetails: (trigger) => openDetails({ tab: 'settings', trigger }),
          onExit: () => {
            runner.abort();
            if (!o.forced) return;
            o.onExit();
          },
          onCarryOn: () => runner.resume(reason),
        });
        pauseCardEl = card;
        layer.replaceChildren(card.el);
        card.focus();
      },
      resumed: () => {
        pauseCardEl?.dispose();
        pauseCardEl = null;
        if (o.guard && o.guard.state().view.phase !== 'running') runner.pause('guard');
      },
      progress: (done, total) => pips.set(done, total),
      target: (at) => corner.avoid(at),
      pop: () => {
        if (getState().settings.sound) playSound('pop');
        vibrate(HAPTICS.pop);
      },
      caption: () => undefined,
    },
  });
  setRunner(runner);
  runner.total = items.length;
  pips.set(0, items.length);
  corner.setPlaying(true);
  if (o.guard && o.guard.state().view.phase !== 'running') runner.pause('guard');
  o.link.arm(recorder, o.block);
  let outcome: RunOutcome;
  try {
    outcome = await runner.runBlock(items);
  } catch (error) {
    console.error('Re-aim stopped:', error);
    outcome = { kind: 'aborted' };
  } finally {
    runner.dispose();
    offIris();
  }
  if (outcome.kind === 'done') {
    const last = recorder.recording.presentations[recorder.recording.presentations.length - 1];
    if (last) await o.link.drain(last.offsetMs);
  }
  o.link.disarm();
  if (outcome.kind === 'invalid') return { kind: 'invalid', invalidation: outcome.invalidation };
  if (outcome.kind !== 'done') return { kind: 'aborted' };
  return { kind: 'done', rec: recorder.finish(), receivedMs: recorder.receivedMs, irisPx: iris };
}

/** A 1.5 s chip on the grey (÷ speed in test mode). */
function showChip(layer: HTMLElement, text: string, speed: number): Promise<void> {
  const chip = statusChip(text);
  layer.replaceChildren(chip);
  return new Promise((resolve) =>
    setTimeout(() => {
      chip.remove();
      resolve();
    }, 1500 / Math.max(1, speed)),
  );
}

// ----- A screen inside the span: Free look and the challenge ---------------------------------

/** A home that grades nothing but light, steadiness and a lost face (no Ready on Get ready). */
const NEUTRAL_HOME: Home = { centring: [Number.NaN, Number.NaN], scale: Number.NaN, yawDeg: Number.NaN, pitchDeg: Number.NaN, rollDeg: Number.NaN, tiltDeg: Number.NaN, phoneRollDeg: Number.NaN, irisPx: Number.NaN, geometry: null };

export interface LivePlayOptions {
  root: HTMLElement;
  context: 'look' | 'challenge';
  /** The span was invalidated (fullscreen left, a resize or a turn of the phone). */
  onScreenChanged(inv: Invalidation | null): void;
  /** The overlay's Exit. */
  onExit(): void;
  /** The overlay's "Warm up again" after 10 s (its tap starts the new span). */
  onWarmUp(): void;
  /** The camera stopped. */
  onCameraEnded(): void;
}

export type FrameListener = (r: FrameResult, f: RecordedFrame, extraFlags: number, sample: GazeSample) => void;

/**
 * The live machinery for Free look and the challenge (spec §17.8, §17.9): the capture inside the
 * span, the position guard with its overlay and glyph (graded against home and, after the fit,
 * the calibrated head range), the session's records, the estimator in use with its correction and
 * the display stream, and Re-aim. `open` returns null after sending the player to the nearest
 * screen that can run (§17.2.3).
 */
export class LivePlay {
  readonly rec: LiveRecords;
  readonly capture: Capture;
  readonly link: CaptureLink;
  readonly guard: PositionGuard;
  readonly attached: AttachedGuard;
  readonly stream: GazeStream;
  readonly block: Block;
  readonly fit: FitResult;
  readonly geometry: SessionGeometry;
  private readonly o: LivePlayOptions;
  private readonly listeners = new Set<FrameListener>();
  private readonly offs: (() => void)[] = [];
  private disposed = false;

  private constructor(o: LivePlayOptions, parts: { rec: LiveRecords; capture: Capture; block: Block; fit: FitResult }) {
    this.o = o;
    this.rec = parts.rec;
    this.capture = parts.capture;
    this.block = parts.block;
    this.fit = parts.fit;
    this.geometry = liveGeometry(parts.fit, parts.block.geometry());
    this.link = new CaptureLink(parts.capture, this.geometry.distance.focalPx, (event) => {
      if (event === 'ended') o.onCameraEnded();
      else noteForced(this.rec, 'camera');
    });
    this.stream = new GazeStream(parts.fit, this.geometry, () => this.rec.corrections);
    this.stream.setDrift(this.rec.corrections[this.estimator()] ?? [0, 0]);
    const { settings } = getState();
    const home = readyHome()?.home ?? null;
    this.guard = createPositionGuard(parts.capture, o.context, { home: home ?? NEUTRAL_HOME, motion: activeMotionSource(), holdMs: SETUP.holdMs / settings.speed });
    if (!home) this.guard.rehome();
    const fg = parts.fit.fitGeometry;
    this.guard.setFit({ headRange: parts.fit.headRange, focalPx: fg?.distance.focalPx ?? this.geometry.distance.focalPx, refDistanceMm: parts.fit.refDistanceMm });
    const v = parts.capture.camera.settings;
    this.attached = attachPositionGuard(this.guard, {
      host: o.root,
      camera: parts.capture.camera,
      context: o.context,
      sound: settings.sound,
      videoW: v.width || 640,
      videoH: v.height || 480,
      onExit: () => o.onExit(),
      onExtra: () => o.onWarmUp(),
    });
    this.offs.push(
      parts.capture.onResult((r) => this.onResult(r)),
      parts.capture.onFrame((meta, submitted) => {
        if (submitted) return;
        const f: RecordedFrame = { meta, distanceMm: null, yawDeg: null, pitchDeg: null, rollDeg: null, eyeMidNorm: null, open: false, label: null, engines: {} };
        for (const cb of this.listeners) cb({ meta, face: null, engines: {}, workerMs: 0, receivedMs: performance.now() }, f, Flags.DROPPED | this.extraFlags(), { frameIndex: meta.index, tCaptureMs: meta.tCaptureMs, estimator: this.estimator(), rawDeg: null, correctedDeg: null, rawPx: null, correctedPx: null, filteredPx: null, perEngineDeg: {}, flags: Flags.DROPPED, confidence: 0, distanceMm: null });
      }),
      parts.block.onInvalidate((inv) => {
        if (!reaimActive()) o.onScreenChanged(inv);
      }),
    );
    collectForced(this.rec, driftContextOf(parts.capture, this.geometry));
    void saveProfileOnce(this.rec, parts.capture);
  }

  /** Checks the route's state (§17.2.3), then starts the capture inside the span. */
  static async open(o: LivePlayOptions): Promise<LivePlay | null> {
    const fit = getState().fit;
    if (!fit) {
      location.replace('#/');
      return null;
    }
    if (!playableZones()) {
      location.replace('#/complete');
      return null;
    }
    const block = span();
    if (!block || block.invalidation) {
      location.replace('#/ready');
      return null;
    }
    const rec = currentRecords();
    if (!rec || (rec.restored && !rec.restored.validated)) {
      location.replace('#/complete');
      return null;
    }
    const capture = await ensureCapture(requestedEngines());
    return new LivePlay(o, { rec, capture, block, fit });
  }

  estimator(): EstimatorId {
    return estimatorInUse(this.fit);
  }

  /** The correction of the estimator in use moved (a Re-aim, the challenge's offset). */
  syncCorrection(): void {
    this.stream.setDrift(this.rec.corrections[this.estimator()] ?? [0, 0]);
  }

  /** The estimator in use changed (Expert mode's switch). */
  useEstimator(id: EstimatorId): void {
    setState({ estimator: id });
    this.syncCorrection();
  }

  onFrame(cb: FrameListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  extraFlags(): number {
    let flags = 0;
    if (document.visibilityState === 'hidden') flags |= Flags.HIDDEN;
    if (this.block.mode === 'fullscreen' && !isFullscreen()) flags |= Flags.NOT_FULLSCREEN;
    return flags;
  }

  private onResult(r: FrameResult): void {
    if (this.disposed) return;
    const f = liveFrame(r, this.link.distanceMm);
    const extra = this.extraFlags();
    const sample = this.stream.push(f, r, extra, this.estimator());
    for (const cb of this.listeners) cb(r, f, extra, sample);
  }

  /** The guard holds play (its overlay is up). */
  paused(): boolean {
    return this.guard.state().view.phase !== 'running';
  }

  /** The reasons a drift check is forced now (§4.13), gathered since the last one. */
  forcedReasons(): DriftForceReason[] {
    collectForced(this.rec, driftContextOf(this.capture, this.geometry));
    return [...this.rec.forced];
  }

  /** Re-aim over the screen; the correction it applies reaches the display stream. */
  async reaim(forced: boolean): Promise<ReaimOutcome> {
    const out = await runReaim({
      root: this.o.root,
      capture: this.capture,
      link: this.link,
      guard: this.guard,
      block: this.block,
      fit: this.fit,
      geometry: this.geometry,
      estimator: this.estimator(),
      forced,
      onExit: () => this.o.onExit(),
    });
    this.syncCorrection();
    if (out.result === 'invalid') this.o.onScreenChanged(out.invalidation ?? null);
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelReaim();
    for (const off of this.offs.splice(0)) off();
    this.listeners.clear();
    this.attached.dispose();
    this.guard.dispose();
    this.link.dispose();
  }
}

/**
 * The quick warm-up of §17.8.3 (RECAL5, the refit at weight ×2, VAL6) on #/warmup, inside the
 * running span; without the session's calibration (a restored one) the full warm-up instead.
 */
export function startQuickWarmup(navigate: (id: 'warmup') => void): void {
  const rec = currentRecords();
  if (rec?.base?.calibration && getState().calibration) setWarmupMode('quick-warmup', recalibrationNumber());
  else setWarmupMode('full');
  navigate('warmup');
}

/** "Warm up again" from a card's tap: a new span from that gesture, then the Level 1 card. */
export function warmUpAgain(root: HTMLElement, navigate: (id: 'warmup' | 'ready') => void): void {
  setWarmupMode('full');
  startSpan(root, measuredScale(getState().geometry)).then(
    () => navigate('warmup'),
    () => void endSpan().then(() => navigate('ready')),
  );
}
