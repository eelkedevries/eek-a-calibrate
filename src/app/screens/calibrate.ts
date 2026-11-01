// #/calibrate (specification §7 screen 4, §4.7, §14): instruction cards, blocks A, B and C on the
// stimulus stage (fullscreen, or viewport mode where fullscreen is missing), pause overlays and
// aborts, then the fit starts in the fit worker and the app moves straight on to validation.
// Screen size and viewing distance are optional: without them typical values are assumed.
import { DISTANCE, FIT_BUDGET_MS } from '../../core/constants.ts';
import { referenceDistanceMm } from '../../core/calibration/dataset.ts';
import { BLIND_SPOT_ASSUMED_DISTANCE_MM } from '../../core/geometry/blindSpot.ts';
import { DistanceTracker, focalFromAssumedFov } from '../../core/geometry/distance.ts';
import { isDegreesApproximate } from '../../core/geometry/screen.ts';
import { FrameRecorder } from '../../core/protocol/labelling.ts';
import { pursuitPeriodMs } from '../../core/protocol/pursuit.ts';
import { calibrationSchedule, minAcceptedFrames, scheduleBlocks } from '../../core/protocol/schedule.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId, FrameMeta, FrameResult, Recording, Schedule, ScreenGeometry, SessionGeometry } from '../../core/types.ts';
import { fitRecording } from '../../fit/fitClient.ts';
import { detectDeviceClass } from '../../platform/capabilities.ts';
import { isFullscreen } from '../../platform/fullscreen.ts';
import { startPresentation, type Invalidation, type Presentation as Block } from '../../platform/presentation.ts';
import type { EngineStatus } from '../../vision/protocol.ts';
import { acquireStage, BlockRunner, releaseStage, type RunOutcome } from '../components/stimulusCanvas.ts';
import { targetSizes } from '../components/target.ts';
import { announce, h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { ensureCapture, requestedEngines, resetSessionResults, setPendingFit, type Capture } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerTestHook } from '../testHooks.ts';

/** No face in the results for longer than this (capture clock) pauses the block (§7). */
export const FACE_LOST_MS = 400;
/** No result at all for this long (a stalled host) counts as a lost face. */
const STALL_MS = 3000;
/** The longest wait at the end of a run for frames still being processed. */
const DRAIN_MS = 2000;

export const SCREEN_CSS = `
.protocol-intro { max-width: 46rem; margin: 0 auto; padding: var(--space-4) var(--space-3); background: var(--surface); color: var(--fg); border-radius: var(--radius); }
.protocol-intro h1 { margin-top: 0; }
.protocol-intro .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin-top: var(--space-4); }
.protocol-intro button, .protocol-intro .button { min-height: 44px; }
.protocol-intro ul.engine-status { padding-left: 1.2rem; }
.protocol-intro [role='alert']:empty, .protocol-intro [role='status']:empty { display: none; }
.protocol-intro [role='alert'] { color: var(--danger); }
body.immersive main { padding: var(--space-3); }
`;

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
      this.drainWaiter = { untilMs, resolve: () => {
        this.drainWaiter = null;
        done();
      } };
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

/** What a test can see of the protocol in progress (`__eek.protocol()`). */
export interface ProtocolSnapshot {
  screen: 'calibrate' | 'validate';
  phase: 'loading' | 'ready' | 'running' | 'finishing' | 'scoring' | 'done' | 'stopped' | 'error';
  item: string | null;
  itemPhase: string | null;
  done: number;
  total: number;
  mode: Block['mode'] | null;
  presentations: number;
  frames: number;
  message: string | null;
}

let activeRunner: BlockRunner | null = null;
let snapshot: () => ProtocolSnapshot | null = () => null;

/** Lets the validate screen publish its own state to the same test hooks. */
export function publishProtocol(runner: BlockRunner | null, snap: () => ProtocolSnapshot | null): void {
  activeRunner = runner;
  snapshot = snap;
}

export function installProtocolHooks(): void {
  registerTestHook('protocol', () => snapshot());
  // failures.spec.ts (WP10): an exit from fullscreen, as the presentation would report it.
  registerTestHook('simulateFullscreenExit', () => {
    if (!activeRunner) return false;
    const size = { w: window.innerWidth, h: window.innerHeight };
    activeRunner.invalidate({ reason: 'fullscreen-exit', atMs: performance.now(), from: size, to: size, detail: 'simulated by the test hook' });
    return true;
  });
}

export function invalidationText(inv: Invalidation | 'changed' | 'ended'): string {
  if (inv === 'ended') return t('camera.ended');
  return t(`calibrate.invalid.${inv === 'changed' ? 'camera' : inv.reason}`);
}

/** Every block of a schedule in order, each after its instruction card; stops at the first block that does not finish. */
export async function runSchedule(runner: BlockRunner, schedule: Schedule): Promise<RunOutcome> {
  for (const b of scheduleBlocks(schedule)) {
    if (b.instruction && !(await runner.instruction(t(`${b.instruction.textKey}.title`), [t(`${b.instruction.textKey}.body`)]))) {
      return runner.outcome() ?? { kind: 'aborted' };
    }
    const outcome = await runner.runBlock(b.items);
    if (outcome.kind !== 'done') return outcome;
  }
  return { kind: 'done' };
}

class Calibration {
  private readonly ctx: ScreenContext;
  private readonly status: HTMLParagraphElement;
  private readonly alert: HTMLParagraphElement;
  private readonly engineList: HTMLUListElement;
  private readonly startButton: HTMLButtonElement;
  private capture: Capture | null = null;
  private link: CaptureLink | null = null;
  private runner: BlockRunner | null = null;
  private block: Block | null = null;
  private recorder: FrameRecorder | null = null;
  private phase: ProtocolSnapshot['phase'] = 'loading';
  private message: string | null = null;
  private handedOver = false;
  private mounted = true;
  private starting = false;
  private faceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.ctx = ctx;
    const { settings, geometry } = getState();
    const mobile = detectDeviceClass().mobile;
    this.status = h('p', { role: 'status', 'aria-live': 'polite' });
    this.alert = h('p', { role: 'alert' });
    this.engineList = h('ul', { class: 'engine-status', 'aria-label': t('calibrate.engines') });
    this.startButton = h('button', { type: 'button', disabled: true, onclick: () => void this.start() }, t('calibrate.start'));
    root.append(
      h('style', null, SCREEN_CSS),
      h(
        'section',
        { class: 'protocol-intro' },
        h('h1', null, t('route.calibrate')),
        h('p', { class: 'lead' }, t('calibrate.lead')),
        h('p', null, t(mobile ? 'calibrate.steps.mobile' : 'calibrate.steps.desktop')),
        h('p', null, t(`calibrate.preset.${settings.preset}`)),
        reducedMotion() ? h('p', { class: 'note' }, t('calibrate.reducedMotion')) : null,
        !geometry || geometry.degreesApproximate ? h('p', { class: 'note' }, t('calibrate.geometryAssumed')) : null,
        this.engineList,
        this.status,
        this.alert,
        h('div', { class: 'actions' }, this.startButton, h('a', { href: '#/', class: 'secondary' }, t('calibrate.back'))),
      ),
    );
    installProtocolHooks();
    publishProtocol(null, () => this.snapshot());
    void this.prepare();
  }

  private snapshot(): ProtocolSnapshot {
    return {
      screen: 'calibrate',
      phase: this.phase,
      item: this.runner?.current?.itemId ?? null,
      itemPhase: this.runner?.current?.phase ?? null,
      done: this.runner?.done ?? 0,
      total: this.runner?.total ?? 0,
      mode: this.block?.mode ?? null,
      presentations: this.recorder?.recording.presentations.length ?? 0,
      frames: this.recorder?.recording.frames.length ?? 0,
      message: this.message,
    };
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private fail(text: string): void {
    this.message = text;
    this.alert.textContent = text;
    announce(text);
  }

  private async prepare(): Promise<void> {
    try {
      const capture = await ensureCapture(requestedEngines(), {
        onStatus: (key) => this.setStatus(t(`calibrate.status.${key}`)),
        onAsset: (asset, loaded, total) => this.setStatus(t('calibrate.status.asset', { asset, percent: total > 0 ? Math.round((100 * loaded) / total) : 0 })),
      });
      if (!this.mounted) return;
      this.capture = capture;
      this.showEngines(capture.status);
      if (fittedEngines(capture.status).length === 0) {
        this.phase = 'error';
        this.fail(t('calibrate.error.noEngine'));
        return;
      }
      const v = capture.camera.settings;
      this.link = new CaptureLink(capture, focalFor(getState().geometry, v.width, v.height), (event) => this.cameraEvent(event));
      this.setStatus(t('calibrate.status.face'));
      this.faceTimer = setInterval(() => this.updateReady(), 250);
      this.updateReady();
    } catch (error) {
      if (!this.mounted) return;
      this.phase = 'error';
      this.fail(t('calibrate.error.capture', { message: error instanceof Error ? error.message : String(error) }));
      this.setStatus('');
    }
  }

  private showEngines(status: readonly EngineStatus[]): void {
    const names: Record<EngineId, string> = { blazegaze: 'BlazeGaze', peekr: 'Peekr', geometric: 'Geometric', eyepixel: 'Eye-pixel (WebGazer method)' };
    this.engineList.replaceChildren(
      ...status.map((s) =>
        h('li', null, s.ok ? t('calibrate.engine.ok', { name: names[s.id] }) : t('calibrate.engine.unavailable', { name: names[s.id], reason: s.reason ?? '—' })),
      ),
    );
  }

  private updateReady(): void {
    if (!this.link || this.runner || this.phase === 'running' || this.phase === 'finishing' || this.phase === 'error' || this.phase === 'done') return;
    const visible = this.link.faceVisible();
    this.startButton.disabled = !visible;
    if (this.phase === 'loading' || this.phase === 'ready') {
      this.phase = visible ? 'ready' : 'loading';
      this.setStatus(t(visible ? 'calibrate.status.ready' : 'calibrate.status.face'));
    }
  }

  private cameraEvent(event: 'changed' | 'ended'): void {
    if (this.runner) {
      this.message = invalidationText(event);
      this.runner.abort();
    } else if (event === 'ended') {
      this.phase = 'error';
      this.startButton.disabled = true;
      this.fail(invalidationText(event));
    }
    const v = this.capture?.camera.settings;
    if (v && v.width > 0 && v.height > 0) this.link?.setFocal(focalFor(getState().geometry, v.width, v.height));
  }

  /** From the Start button's click: the presentation must be requested inside the gesture. */
  private async start(): Promise<void> {
    if (!this.capture || !this.link || this.runner || this.starting) return;
    // A second Enter or Space on the focused button must not start a second run while this one starts.
    this.starting = true;
    this.startButton.disabled = true;
    const capture = this.capture;
    const link = this.link;
    const stage = acquireStage();
    let block: Block;
    try {
      block = await startPresentation(stage.el, { mode: 'auto', scale: measuredScale(getState().geometry) });
    } catch (error) {
      this.starting = false;
      releaseStage();
      this.fail(t('calibrate.error.start', { message: error instanceof Error ? error.message : String(error) }));
      this.updateReady();
      return;
    }
    if (!this.mounted) {
      await block.end();
      releaseStage();
      return;
    }
    this.block = block;
    this.alert.textContent = '';
    this.message = null;
    this.phase = 'running';
    this.startButton.disabled = true;
    this.setStatus(t('calibrate.status.running'));

    const { settings, geometry: measured } = getState();
    const video = capture.camera.settings;
    const geometry = sessionGeometry(block.geometry(), video.width || 640, video.height || 480, measured);
    link.setFocal(geometry.distance.focalPx);
    const distance = link.distanceMm ?? (positive(measured?.refDistanceMm) ? measured.refDistanceMm : BLIND_SPOT_ASSUMED_DISTANCE_MM);
    const motionReduced = reducedMotion();
    const schedule = calibrationSchedule({
      preset: settings.preset,
      seed: settings.seed,
      speed: settings.speed,
      pursuitPeriodMs: pursuitPeriodMs(geometry.screen, distance),
      skipPursuit: motionReduced,
    });
    const recorder = new FrameRecorder(`calibration-${settings.seed}`, schedule, geometry);
    this.recorder = recorder;
    const runner = new BlockRunner({
      stage,
      block,
      geometry: geometry.screen,
      recorder,
      sizes: targetSizes(!geometry.degreesApproximate, geometry.screen.pxPerMm, distance),
      reducedMotion: motionReduced,
      speed: settings.speed,
      minFrames: minAcceptedFrames(settings.speed),
      retry: true,
      extend: true,
      faceLost: () => link.faceLost(),
      pose: () => link.pose(),
    });
    runner.total = schedule.items.filter((i) => i.kind !== 'instruction').length;
    this.runner = runner;
    this.starting = false;
    publishProtocol(runner, () => this.snapshot());
    link.arm(recorder, block);

    let outcome: RunOutcome;
    try {
      outcome = await runSchedule(runner, schedule);
    } catch (error) {
      if (!this.mounted) return;
      await this.stop({ kind: 'aborted' }, t('calibrate.error.start', { message: error instanceof Error ? error.message : String(error) }));
      return;
    }
    if (!this.mounted) return;
    if (outcome.kind === 'done') await this.finish(recorder, geometry, capture);
    else await this.stop(outcome);
  }

  private async finish(recorder: FrameRecorder, geometry: SessionGeometry, capture: Capture): Promise<void> {
    this.phase = 'finishing';
    const last = recorder.recording.presentations[recorder.recording.presentations.length - 1];
    if (last && this.link) await this.link.drain(last.offsetMs);
    if (!this.mounted) return;
    this.link?.disarm();
    const rec: Recording = recorder.finish();
    const ref = referenceDistanceMm([rec]);
    const accepted = rec.frames.some((f) => f.label?.accepted);
    if (!accepted || ref === null) {
      await this.stop({ kind: 'aborted' }, t('calibrate.error.noFrames'));
      return;
    }
    rec.geometry = { ...geometry, refDistanceMm: ref };
    const { settings } = getState();
    const engines = fittedEngines(capture.status);
    resetSessionResults();
    setState({ calibration: rec, geometry: rec.geometry, fit: null, validation: null, estimator: null });
    setPendingFit((onProgress) => fitRecording(rec, { seed: settings.seed, engines, maxMs: FIT_BUDGET_MS }, onProgress));
    this.setStatus(t('calibrate.status.fitting'));
    this.runner?.dispose();
    this.runner = null;
    publishProtocol(null, () => this.snapshot());
    // The stage stays fullscreen (or fixed) and on screen for validation, which needs no new gesture.
    this.handedOver = true;
    await this.block?.end({ keepFullscreen: true });
    this.block = null;
    this.phase = 'done';
    this.ctx.navigate('validate');
  }

  private async stop(outcome: RunOutcome, text?: string): Promise<void> {
    this.link?.disarm();
    this.runner?.dispose();
    this.runner = null;
    publishProtocol(null, () => this.snapshot());
    await this.block?.end();
    this.block = null;
    releaseStage();
    this.recorder = null;
    this.phase = 'stopped';
    const reason = text ?? this.message ?? (outcome.kind === 'invalid' ? `${invalidationText(outcome.invalidation)} ${t('calibrate.invalid.after')}` : t('calibrate.aborted'));
    this.fail(reason);
    this.setStatus('');
    this.startButton.textContent = t('calibrate.startAgain');
    this.updateReady();
    this.startButton.focus();
  }

  unmount(): void {
    this.mounted = false;
    if (this.faceTimer !== null) clearInterval(this.faceTimer);
    this.link?.dispose();
    publishProtocol(null, () => null);
    if (this.handedOver) return;
    this.runner?.abort();
    this.runner?.dispose();
    void this.block?.end();
    releaseStage();
  }
}

const screen: Screen = {
  mount(root, ctx) {
    const c = new Calibration(root, ctx);
    return () => c.unmount();
  },
};

export default screen;
