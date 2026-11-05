// The warm-up's orchestration without its interface (spec §17.6, §17.7; §4.7–§4.12): connecting
// the capture to a block, the session geometry, finishing a calibration recording into the
// pending fit, scoring a Test round into the session's results, and the game's result from it.
// The v1 calibrate and validate screens call the same functions until prompt 018 removes them;
// the warm-up screen drives WarmupSession, level by level.
import { DISTANCE, FIT_BUDGET_MS } from '../../core/constants.ts';
import { referenceDistanceMm } from '../../core/calibration/dataset.ts';
import { zoneCount, zoneGrid } from '../../core/game/zones.ts';
import { BLIND_SPOT_ASSUMED_DISTANCE_MM } from '../../core/geometry/blindSpot.ts';
import { DistanceTracker, focalFromAssumedFov } from '../../core/geometry/distance.ts';
import { isDegreesApproximate } from '../../core/geometry/screen.ts';
import { percentile } from '../../core/maths/stats.ts';
import { FrameRecorder } from '../../core/protocol/labelling.ts';
import { pursuitPeriodMs } from '../../core/protocol/pursuit.ts';
import { causeFor, type LightReadings } from '../../core/warmup/cause.ts';
import { warmupPlan, withoutItems, type WarmupLevel, type WarmupMode, type WarmupPlan } from '../../core/warmup/levels.ts';
import { meanGazeTargets, testMarks } from '../../core/warmup/marks.ts';
import { outcomeFor, starsFor } from '../../core/warmup/stars.ts';
import type { LevelFrame } from '../../core/warmup/steadiness.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId, EstimatorId, FitResult, FrameMeta, FrameResult, Preset, Recording, ScreenGeometry, SessionGeometry } from '../../core/types.ts';
import { fitRecording, scoreRecording, type ScoredRecording } from '../../fit/fitClient.ts';
import { isFullscreen } from '../../platform/fullscreen.ts';
import { viewportVerdict, type Presentation as Block } from '../../platform/presentation.ts';
import type { EngineStatus } from '../../vision/protocol.ts';
import { targetSizes, type TargetSizes } from '../components/target.ts';
import { resetSessionResults, setPendingFit, setValidationRun, type Capture, type PendingFit } from '../session.ts';
import { getState, setState } from '../state.ts';
import { quickRecalibrations, type LevelRecord, type WarmupResult } from './gameState.ts';

/** No face in the results for longer than this (capture clock) pauses the block (§7). */
export const FACE_LOST_MS = 400;
/** No result at all for this long (a stalled host) counts as a lost face. */
const STALL_MS = 3000;
/** The longest wait at the end of a run for frames still being processed. */
const DRAIN_MS = 2000;

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** A measured distance model (blind spot), or null when the session's focal length is only assumed. */
function measuredDistance(g: SessionGeometry | null): SessionGeometry['distance'] | null {
  return g && g.distance.focalSource !== 'assumed-fov' && positive(g.distance.focalPx) ? g.distance : null;
}

/**
 * The focal length for D_t: the measured one, else that of an assumed 60° field of view across
 * the long side of the video the camera delivers now. An assumed value is never carried over from
 * an earlier calibration, whose camera may have delivered another frame size.
 */
export function focalFor(g: SessionGeometry | null, videoW: number, videoH: number): number {
  return measuredDistance(g)?.focalPx ?? focalFromAssumedFov(videoW || 640, videoH || 480);
}

/**
 * The session geometry of a block: its measured viewport and safe area, the measured screen
 * scale and distance model when there are any (§14.1), else 96 CSS px per inch and the focal
 * length of an assumed 60° field of view across the long side of the delivered video.
 */
export function sessionGeometry(screen: ScreenGeometry, videoW: number, videoH: number, measured: SessionGeometry | null): SessionGeometry {
  const distance = measuredDistance(measured) ?? {
    focalPx: focalFor(null, videoW, videoH),
    focalSource: 'assumed-fov' as const,
    blindSpotMm: null,
    blindSpotSdMm: null,
    irisMm: DISTANCE.irisMm,
  };
  return { screen, distance: { ...distance }, refDistanceMm: null, degreesApproximate: isDegreesApproximate(screen, distance) };
}

/** The screen scale to measure blocks with: the measured one, or none (assumed). */
export function measuredScale(g: SessionGeometry | null): { pxPerMm: number; pxPerMmSource: ScreenGeometry['pxPerMmSource'] } | undefined {
  return g && g.screen.pxPerMmSource !== 'assumed' && positive(g.screen.pxPerMm) ? { pxPerMm: g.screen.pxPerMm, pxPerMmSource: g.screen.pxPerMmSource } : undefined;
}

export function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Connects the running capture to a block: D_t from every result (DistanceTracker), the
 * face-lost and pose signals for the runner, and, while a recorder is armed, every result and
 * every refused frame whose capture time falls inside a presentation.
 */
export class CaptureLink {
  private readonly capture: Capture;
  private tracker: DistanceTracker;
  private recorder: FrameRecorder | null = null;
  private block: Block | null = null;
  private readonly offs: (() => void)[] = [];
  private lastFaceCaptureMs = Number.NEGATIVE_INFINITY;
  private lastResultCaptureMs = Number.NEGATIVE_INFINITY;
  private lastPose: { yawDeg: number; pitchDeg: number } | null = null;
  private drainWaiter: { untilMs: number; resolve: () => void } | null = null;

  constructor(capture: Capture, focalPx: number, onCamera: (event: 'changed' | 'ended') => void) {
    this.capture = capture;
    this.tracker = new DistanceTracker({ focalPx, irisMm: DISTANCE.irisMm });
    this.offs.push(
      capture.onResult((r) => this.onResult(r)),
      capture.onFrame((meta, submitted) => this.onFrame(meta, submitted)),
      capture.camera.onChange(() => onCamera('changed')),
      capture.camera.onEnded(() => onCamera('ended')),
    );
  }

  setFocal(focalPx: number): void {
    if (this.tracker.focalPx !== focalPx) this.tracker = new DistanceTracker({ focalPx, irisMm: DISTANCE.irisMm });
  }

  private onResult(r: FrameResult): void {
    const t = r.meta.tCaptureMs;
    let d: number | null = null;
    try {
      d = this.tracker.push(t, r.face ? r.face.eyes.irisDiamPx : Number.NaN, r.face ? r.face.eyes.open : false);
    } catch {
      // A camera restart resets the capture clock: start the window again.
      this.tracker.reset();
      d = this.tracker.push(t, r.face ? r.face.eyes.irisDiamPx : Number.NaN, r.face ? r.face.eyes.open : false);
    }
    this.lastResultCaptureMs = t;
    if (r.face) {
      this.lastFaceCaptureMs = t;
      this.lastPose = { yawDeg: r.face.pose.yawDeg, pitchDeg: r.face.pose.pitchDeg };
    }
    const rec = this.recorder;
    if (rec && rec.labeller.find(t)) {
      rec.addResult(r, {
        hidden: document.visibilityState === 'hidden',
        notFullscreen: this.block?.mode === 'fullscreen' && !isFullscreen(),
        distanceMm: d,
      });
    }
    if (this.drainWaiter && t >= this.drainWaiter.untilMs) this.drainWaiter.resolve();
  }

  private onFrame(meta: FrameMeta, submitted: boolean): void {
    const rec = this.recorder;
    if (!submitted && rec && rec.labeller.find(meta.tCaptureMs)) rec.addDropped(meta);
  }

  arm(recorder: FrameRecorder, block: Block): void {
    this.recorder = recorder;
    this.block = block;
  }

  disarm(): void {
    this.recorder = null;
    this.block = null;
  }

  /** Waits until a frame captured at or after `untilMs` has been processed, for at most DRAIN_MS. */
  drain(untilMs: number): Promise<void> {
    if (this.lastResultCaptureMs >= untilMs) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, DRAIN_MS);
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
      this.drainWaiter = {
        untilMs,
        resolve: () => {
          this.drainWaiter = null;
          done();
        },
      };
    });
  }

  faceLost(): boolean {
    return this.lastResultCaptureMs - this.lastFaceCaptureMs > FACE_LOST_MS || performance.now() - this.capture.lastResultMs > STALL_MS;
  }

  faceVisible(): boolean {
    return Number.isFinite(this.lastFaceCaptureMs) && !this.faceLost();
  }

  pose(): { yawDeg: number; pitchDeg: number } | null {
    return this.lastPose;
  }

  get distanceMm(): number | null {
    return this.tracker.distanceMm;
  }

  dispose(): void {
    this.disarm();
    this.drainWaiter?.resolve();
    for (const off of this.offs.splice(0)) off();
  }
}

/** The engines to fit: those wanted by the settings or the run set that loaded. */
export function fittedEngines(status: readonly EngineStatus[]): EngineId[] {
  const { runSet, settings } = getState();
  const wanted = runSet ?? (settings.engines === 'auto' ? [...ENGINE_IDS] : [...settings.engines]);
  const ok = new Set(status.filter((s) => s.ok).map((s) => s.id));
  return ENGINE_IDS.filter((id) => wanted.includes(id) && ok.has(id));
}

/** The estimator in use after a Test round: the one asked for with ?select=, when it was fitted, else Auto's choice. */
export function chosenEstimator(fit: FitResult): EstimatorId {
  const select = getState().settings.select;
  if (select === 'auto') return fit.selection.estimator;
  if (select === 'combined') return fit.combined ? 'combined' : fit.selection.estimator;
  return fit.fits[select] ? select : fit.selection.estimator;
}

/** True when a block's viewport is the calibration's, within the viewport-mode tolerance. */
export function sameLayout(a: ScreenGeometry, b: ScreenGeometry): boolean {
  if ((a.viewportWpx >= a.viewportHpx) !== (b.viewportWpx >= b.viewportHpx)) return false;
  const tolerance = a.presentationMode === 'viewport' || b.presentationMode === 'viewport' ? undefined : 0;
  return viewportVerdict({ w: a.viewportWpx, h: a.viewportHpx }, { w: b.viewportWpx, h: b.viewportHpx }, tolerance) !== 'abort';
}

/**
 * Ends a calibration recording: waits for the frames still being processed, sorts and masks it,
 * gives it the reference distance and starts the fit in the fit worker (the pending fit that the
 * Test round waits for). The session's earlier results are discarded. Null, with nothing changed,
 * when no frame was accepted or no distance is known, or when `alive()` turns false during the
 * wait (the screen was left: the session keeps its earlier results).
 */
export async function finishCalibration(recorder: FrameRecorder, geometry: SessionGeometry, link: CaptureLink, engines: EngineId[], seed: number, alive: () => boolean = () => true): Promise<Recording | null> {
  const last = recorder.recording.presentations[recorder.recording.presentations.length - 1];
  if (last) await link.drain(last.offsetMs);
  if (!alive()) return null;
  link.disarm();
  const rec = recorder.finish();
  const ref = referenceDistanceMm([rec]);
  if (!rec.frames.some((f) => f.label?.accepted) || ref === null) return null;
  rec.geometry = { ...geometry, refDistanceMm: ref };
  resetSessionResults();
  setState({ calibration: rec, geometry: rec.geometry, fit: null, validation: null, estimator: null });
  setPendingFit((onProgress) => fitRecording(rec, { seed, engines, maxMs: FIT_BUDGET_MS }, onProgress));
  return rec;
}

/**
 * Scores a Test round with every estimator of the fit in both modes (§4.12) and makes it the
 * session's validation: the run kept for re-scoring and export, the fit, the reports and the
 * estimator in use.
 */
export function applyTestRound(fit: FitResult, rec: Recording, receivedMs: Map<number, number>, nominalFps: number): ScoredRecording {
  const geometry = getState().geometry as SessionGeometry;
  const scored = scoreRecording(fit, rec, geometry, { nominalFps, receivedMs });
  setValidationRun({ recording: rec, receivedMs, nominalFps });
  setState({ fit, validation: [...scored.own, ...scored.intersection], estimator: chosenEstimator(fit) });
  return scored;
}

// ----- The game's warm-up ---------------------------------------------------------------------

export interface WarmupSessionOptions {
  capture: Capture;
  mode: WarmupMode;
  preset: Preset;
  seed: number;
  speed: number;
  reducedMotion: boolean;
  recalibration?: number;
  onCamera(event: 'changed' | 'ended'): void;
}

/** What the Test round left: the scored reports and the game's result inputs. */
export interface TestRoundOutcome {
  fit: FitResult;
  scored: ScoredRecording;
  rec: Recording;
}

/**
 * One warm-up run over one presentation: the plan of levels, the session geometry measured from
 * the presentation, the calibration and Test-round recorders (armed on the capture in turn), and
 * the frames of each level for its steadiness line and the cause.
 */
export class WarmupSession {
  plan: WarmupPlan;
  readonly link: CaptureLink;
  private readonly opts: WarmupSessionOptions;
  private block: Block | null = null;
  private geo: SessionGeometry | null = null;
  private recorders: Partial<Record<WarmupLevel['recording'], FrameRecorder>> = {};
  private readonly skipped = new Set<string>();
  private readonly skippedInstructions = new Set<string>();
  private calibrationRec: Recording | null = null;

  constructor(opts: WarmupSessionOptions) {
    this.opts = opts;
    const v = opts.capture.camera.settings;
    this.link = new CaptureLink(opts.capture, focalFor(getState().geometry, v.width, v.height), opts.onCamera);
    this.plan = this.makePlan();
  }

  private makePlan(periodMs?: number): WarmupPlan {
    const o = this.opts;
    return warmupPlan({
      mode: o.mode,
      preset: o.preset,
      seed: o.seed,
      speed: o.speed,
      reducedMotion: o.reducedMotion,
      ...(periodMs !== undefined ? { pursuitPeriodMs: periodMs } : {}),
      ...(o.recalibration !== undefined ? { recalibration: o.recalibration } : {}),
    });
  }

  /** The viewing distance now: D_t from the iris, else the session's reference, else the assumed one. */
  distanceMm(): number {
    const ref = this.geo?.refDistanceMm ?? getState().geometry?.refDistanceMm;
    return this.link.distanceMm ?? (positive(ref) ? ref : BLIND_SPOT_ASSUMED_DISTANCE_MM);
  }

  /**
   * Measures the presentation's geometry for the run (once, at the start of Level 1) and fixes the
   * pursuit period for this screen and distance. A restored calibration keeps its own distance
   * model and refers to the new viewport.
   */
  begin(block: Block): SessionGeometry {
    this.block = block;
    const state = getState();
    const v = this.opts.capture.camera.settings;
    if (this.opts.mode === 'restore' && state.geometry) {
      this.geo = { ...state.geometry, screen: block.geometry() };
    } else {
      this.geo = sessionGeometry(block.geometry(), v.width || 640, v.height || 480, state.geometry);
      this.link.setFocal(this.geo.distance.focalPx);
    }
    this.plan = this.makePlan(pursuitPeriodMs(this.geo.screen, this.distanceMm()));
    return this.geo;
  }

  get geometry(): SessionGeometry {
    if (!this.geo) throw new Error('WarmupSession: begin() first');
    return this.geo;
  }

  /** The target sizes of §4.7 at the current distance (24 px when the geometry is assumed). */
  sizes(): TargetSizes {
    const g = this.geometry;
    return targetSizes(!g.degreesApproximate, g.screen.pxPerMm, this.distanceMm());
  }

  /** The recorder a level's frames go to, armed on the capture. */
  recorder(level: WarmupLevel): FrameRecorder {
    const kind = level.recording;
    let rec = this.recorders[kind];
    if (!rec) {
      const schedule = kind === 'calibration' ? this.plan.calibration : this.plan.validation;
      if (!schedule) throw new Error(`WarmupSession: no ${kind} schedule in the ${this.plan.mode} set`);
      rec = new FrameRecorder(`${schedule.kind}-${this.opts.seed}`, schedule, this.geometry);
      this.recorders[kind] = rec;
    }
    this.link.arm(rec, this.block as Block);
    return rec;
  }

  /** A level skipped under reduced motion: its items leave the recording's schedule. */
  skip(level: WarmupLevel): void {
    for (const item of level.items) this.skipped.add(item.id);
    const instruction = this.plan.calibration?.items.find((i, k, all) => i.kind === 'instruction' && all[k + 1]?.id === level.items[0]?.id);
    if (instruction) this.skippedInstructions.add(instruction.id);
  }

  /** The labelled frames of a level so far (its steadiness line and the cause). */
  levelFrames(level: WarmupLevel): LevelFrame[] {
    const rec = this.recorders[level.recording];
    if (!rec) return [];
    const ids = new Set(level.items.map((i) => i.id));
    return rec.recording.frames.filter((f) => f.label !== null && ids.has(f.label.itemId)).map((f) => ({ accepted: (f.label as NonNullable<typeof f.label>).accepted, reject: (f.label as NonNullable<typeof f.label>).reject }));
  }

  /** Every labelled frame of the warm-up's levels. */
  allFrames(): LevelFrame[] {
    return this.plan.levels.flatMap((l) => this.levelFrames(l));
  }

  /**
   * Ends the calibration levels: the recording goes to the fit (a full warm-up), or is refitted
   * with the calibration at weight ×2 (the quick warm-up, §4.13). False when nothing usable was
   * recorded, or when `alive()` turns false while the last frames are awaited (nothing changes).
   */
  async endCalibration(engines: EngineId[], alive: () => boolean = () => true): Promise<boolean> {
    const recorder = this.recorders.calibration;
    if (!recorder) return this.plan.calibration === null;
    if (this.skipped.size > 0) recorder.recording.schedule = withoutItems(recorder.recording.schedule, this.skipped, this.skippedInstructions);
    if (this.plan.mode === 'quick-warmup') {
      const base = getState().calibration;
      const last = recorder.recording.presentations[recorder.recording.presentations.length - 1];
      if (last) await this.link.drain(last.offsetMs);
      if (!alive()) return false;
      this.link.disarm();
      const rec = recorder.finish();
      if (!base || !rec.frames.some((f) => f.label?.accepted)) return false;
      const recs = [...quickRecalibrations(), rec];
      this.calibrationRec = rec;
      setValidationRun(null);
      setState({ validation: null });
      setPendingFit((onProgress) => fitRecording(base, { seed: this.opts.seed, engines, maxMs: FIT_BUDGET_MS, recalibration: recs }, onProgress));
      return true;
    }
    const rec = await finishCalibration(recorder, this.geometry, this.link, engines, this.opts.seed, alive);
    this.calibrationRec = rec;
    return rec !== null;
  }

  /** The quick warm-up's recording, once ended (016 keeps it in the lineage). */
  get recalibrationRecording(): Recording | null {
    return this.plan.mode === 'quick-warmup' ? this.calibrationRec : null;
  }

  /** Ends the Test round's recording: the frames still being processed are waited for. */
  async endTestRound(): Promise<{ rec: Recording; receivedMs: Map<number, number> }> {
    const recorder = this.recorders.validation;
    if (!recorder) throw new Error('WarmupSession: the Test round did not run');
    const last = recorder.recording.presentations[recorder.recording.presentations.length - 1];
    if (last) await this.link.drain(last.offsetMs);
    this.link.disarm();
    return { rec: recorder.finish(), receivedMs: recorder.receivedMs };
  }

  dispose(): void {
    this.link.dispose();
  }
}

/** Waits for the pending fit, reporting its fraction; the restored fit when there is none (restore). */
export async function awaitFit(pending: PendingFit | null): Promise<FitResult> {
  if (pending) return pending.promise;
  const fit = getState().fit;
  if (!fit) throw new Error('There is no calibration to check.');
  return fit;
}

export interface ResultInputs {
  mode: WarmupMode;
  preset: Preset;
  plan: WarmupPlan;
  scored: ScoredRecording;
  rec: Recording;
  estimator: EstimatorId;
  frames: readonly LevelFrame[];
  light: LightReadings;
  log: LevelRecord[];
}

/**
 * The game's reading of a scored Test round (spec §17.7), for the selected estimator in mode
 * 'own': the zone grid from p75 accuracy and RMS-S2S at the reference distance, the stars and
 * outcome from the verdict, the marks from Ḡ, and the cause from the frame log and the light.
 */
export function warmupResultFrom(i: ResultInputs): WarmupResult {
  const report = i.scored.own.find((r) => r.estimator === i.estimator) ?? i.scored.own[0];
  const g = i.scored.geometry;
  const screen = g.screen;
  const distance = positive(g.refDistanceMm) ? g.refDistanceMm : BLIND_SPOT_ASSUMED_DISTANCE_MM;
  const accs = report ? report.targets.map((t) => t.accuracyDeg).filter(Number.isFinite) : [];
  const grid = report ? zoneGrid(percentile(accs, 75), report.rmsS2SDeg, screen, distance) : { cols: 0, rows: 0, needDeg: Number.NaN };
  const verdict = report?.verdict ?? 'not-tracking';
  const n = zoneCount(grid);
  const samples = i.scored.samples.get(report?.estimator ?? i.estimator) ?? [];
  const viewport = { w: screen.viewportWpx, h: screen.viewportHpx };
  const marks = testMarks(meanGazeTargets(i.rec, samples, g), grid, viewport);
  const restoreRejected = i.mode === 'restore' && verdict !== 'good' && verdict !== 'acceptable';
  return {
    mode: i.mode,
    preset: i.preset,
    levels: i.plan.levels.map((l) => l.key),
    estimator: report?.estimator ?? i.estimator,
    verdict,
    zones: { cols: grid.cols, rows: grid.rows },
    needDeg: grid.needDeg,
    stars: starsFor(verdict, n),
    outcome: outcomeFor(verdict, n),
    cause: causeFor({ frames: i.frames, light: i.light }),
    marks,
    viewport,
    restoreRejected,
    log: i.log,
    atMs: performance.now(),
  };
}
