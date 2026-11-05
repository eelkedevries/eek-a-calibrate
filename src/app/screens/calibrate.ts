// #/calibrate (specification §7 screen 4, §4.7, §14): instruction cards, blocks A, B and C on the
// stimulus stage (fullscreen, or viewport mode where fullscreen is missing), pause overlays and
// aborts, then the fit starts in the fit worker and the app moves straight on to validation.
// Screen size and viewing distance are optional: without them typical values are assumed. The
// protocol's orchestration lives in game/warmupRunner.ts, which the warm-up levels share; this
// v1 screen stays until prompt 018.
import { BLIND_SPOT_ASSUMED_DISTANCE_MM } from '../../core/geometry/blindSpot.ts';
import { FrameRecorder } from '../../core/protocol/labelling.ts';
import { pursuitPeriodMs } from '../../core/protocol/pursuit.ts';
import { calibrationSchedule, minAcceptedFrames, scheduleBlocks } from '../../core/protocol/schedule.ts';
import type { EngineId, Schedule, SessionGeometry } from '../../core/types.ts';
import { detectDeviceClass } from '../../platform/capabilities.ts';
import { startPresentation, type Invalidation, type Presentation as Block } from '../../platform/presentation.ts';
import type { EngineStatus } from '../../vision/protocol.ts';
import { acquireStage, BlockRunner, releaseStage, type RunOutcome } from '../components/stimulusCanvas.ts';
import { targetSizes } from '../components/target.ts';
import { announce, h } from '../dom.ts';
import { CaptureLink, finishCalibration, fittedEngines, focalFor, measuredScale, reducedMotion, sessionGeometry } from '../game/warmupRunner.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { ensureCapture, requestedEngines, type Capture } from '../session.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerTestHook } from '../testHooks.ts';

// Moved to game/warmupRunner.ts; re-exported for the v1 screens that import them from here.
export { CaptureLink, FACE_LOST_MS, fittedEngines, focalFor, measuredScale, reducedMotion, sessionGeometry } from '../game/warmupRunner.ts';

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

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

/** The cause alone ("The device was rotated."), for screens other than calibration. */
export function invalidationReason(inv: Invalidation | 'changed' | 'ended'): string {
  if (inv === 'ended') return t('camera.ended');
  return t(`invalid.${inv === 'changed' ? 'camera' : inv.reason}`);
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
    const link = this.link as CaptureLink;
    const rec = await finishCalibration(recorder, geometry, link, fittedEngines(capture.status), getState().settings.seed, () => this.mounted);
    if (!this.mounted) return;
    if (!rec) {
      await this.stop({ kind: 'aborted' }, t('calibrate.error.noFrames'));
      return;
    }
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
