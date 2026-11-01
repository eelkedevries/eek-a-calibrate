// #/validate (specification §7 screen 5, §4.12): VAL12 or VAL6 in seeded order, settle 600 ms and
// sample 1000 ms with no retries, recorded while the fit worker runs; then "Scoring…", the
// reports of every estimator in both modes, and on to the results.
import { focalFromAssumedFov } from '../../core/geometry/distance.ts';
import { FrameRecorder } from '../../core/protocol/labelling.ts';
import { minAcceptedFrames, validationSchedule } from '../../core/protocol/schedule.ts';
import type { EstimatorId, FitResult, Recording, SessionGeometry } from '../../core/types.ts';
import { scoreRecording } from '../../fit/fitClient.ts';
import { exitFullscreen } from '../../platform/fullscreen.ts';
import { startPresentation, viewportVerdict, type Presentation as Block } from '../../platform/presentation.ts';
import { acquireStage, BlockRunner, currentStage, releaseStage, type RunOutcome, type StimulusStage } from '../components/stimulusCanvas.ts';
import { targetSizes } from '../components/target.ts';
import { announce, h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { currentFit, ensureCapture, requestedEngines, setValidationRun, type Capture, type PendingFit } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { CaptureLink, installProtocolHooks, invalidationText, measuredScale, publishProtocol, reducedMotion, runSchedule, SCREEN_CSS, type ProtocolSnapshot } from './calibrate.ts';

/** The estimator in use after validation: the one asked for with ?select=, when it was fitted, else Auto's choice. */
export function chosenEstimator(fit: FitResult): EstimatorId {
  const select = getState().settings.select;
  if (select === 'auto') return fit.selection.estimator;
  if (select === 'combined') return fit.combined ? 'combined' : fit.selection.estimator;
  return fit.fits[select] ? select : fit.selection.estimator;
}

/** True when the block's viewport is the calibration's, within the viewport-mode tolerance. */
function sameLayout(a: SessionGeometry['screen'], b: SessionGeometry['screen']): boolean {
  if ((a.viewportWpx >= a.viewportHpx) !== (b.viewportWpx >= b.viewportHpx)) return false;
  const tolerance = a.presentationMode === 'viewport' || b.presentationMode === 'viewport' ? undefined : 0;
  return viewportVerdict({ w: a.viewportWpx, h: a.viewportHpx }, { w: b.viewportWpx, h: b.viewportHpx }, tolerance) !== 'abort';
}

class Validation {
  private readonly ctx: ScreenContext;
  private readonly status: HTMLParagraphElement;
  private readonly alert: HTMLParagraphElement;
  private readonly startButton: HTMLButtonElement;
  private readonly fit: PendingFit | null;
  private capture: Capture | null = null;
  private link: CaptureLink | null = null;
  private runner: BlockRunner | null = null;
  private block: Block | null = null;
  private recorder: FrameRecorder | null = null;
  private phase: ProtocolSnapshot['phase'] = 'loading';
  private message: string | null = null;
  private mounted = true;
  private starting = false;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.ctx = ctx;
    this.fit = currentFit();
    this.status = h('p', { role: 'status', 'aria-live': 'polite' });
    this.alert = h('p', { role: 'alert' });
    this.startButton = h('button', { type: 'button', disabled: true, onclick: () => void this.run() }, t('validate.start'));
    const { calibration } = getState();
    const actions = h('div', { class: 'actions' }, this.startButton, h('a', { href: '#/calibrate' }, t('validate.recalibrate')));
    root.append(h('style', null, SCREEN_CSS), h('section', { class: 'protocol-intro' }, h('h1', null, t('route.validate')), h('p', { class: 'lead' }, t('validate.lead')), this.status, this.alert, actions));
    installProtocolHooks();
    publishProtocol(null, () => this.snapshot());
    if (!calibration || !this.fit) {
      this.phase = 'error';
      releaseStage();
      this.fail(t('validate.noCalibration'));
      actions.replaceChildren(h('a', { href: '#/calibrate', class: 'button' }, t('validate.toCalibrate')));
      return;
    }
    if (this.fit.error) {
      this.phase = 'error';
      releaseStage();
      this.fail(t('validate.fitFailed', { message: this.fit.error }));
      return;
    }
    void this.prepare();
  }

  private snapshot(): ProtocolSnapshot {
    return {
      screen: 'validate',
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
      this.capture = await ensureCapture(requestedEngines(), { onStatus: (key) => this.setStatus(t(`calibrate.status.${key}`)) });
    } catch (error) {
      if (!this.mounted) return;
      this.phase = 'error';
      releaseStage();
      this.fail(t('calibrate.error.capture', { message: error instanceof Error ? error.message : String(error) }));
      return;
    }
    if (!this.mounted) return;
    const g = getState().geometry;
    const v = this.capture.camera.settings;
    this.link = new CaptureLink(this.capture, g?.distance.focalPx ?? focalFromAssumedFov(v.width || 640, v.height || 480), (event) => {
      this.message = invalidationText(event);
      if (this.runner) this.runner.abort();
      else if (event === 'ended') {
        this.startButton.disabled = true;
        this.fail(this.message);
      }
    });
    this.phase = 'ready';
    this.setStatus('');
    // Straight on from calibration: the stage is still presented, so no new gesture is needed.
    const handed = currentStage();
    if (handed) void this.run(handed);
    else this.startButton.disabled = false;
  }

  /** From the Start button's click, or straight after calibration with the stage it handed over. */
  private async run(handed?: StimulusStage): Promise<void> {
    if (!this.capture || !this.link || this.runner || !this.fit || this.starting) return;
    // A second activation of Start while the presentation starts must not start a second run.
    this.starting = true;
    this.startButton.disabled = true;
    const link = this.link;
    const stage = handed ?? acquireStage();
    const state = getState();
    const fitGeometry = state.calibration?.geometry;
    let block: Block;
    try {
      block = await startPresentation(stage.el, { mode: 'auto', scale: measuredScale(state.geometry) });
    } catch (error) {
      this.starting = false;
      releaseStage();
      this.fail(t('calibrate.error.start', { message: error instanceof Error ? error.message : String(error) }));
      this.startButton.disabled = false;
      return;
    }
    if (!this.mounted) {
      await block.end();
      releaseStage();
      return;
    }
    this.block = block;
    this.startButton.disabled = true;
    this.alert.textContent = '';
    this.message = null;
    const geometry: SessionGeometry = { ...(state.geometry as SessionGeometry), screen: block.geometry() };
    if (!fitGeometry || !sameLayout(fitGeometry.screen, geometry.screen)) {
      await this.end(block);
      this.starting = false;
      this.phase = 'error';
      this.fail(t('validate.screenChanged'));
      return;
    }
    this.phase = 'running';
    const { settings } = state;
    const schedule = validationSchedule({ preset: settings.preset, seed: settings.seed, speed: settings.speed });
    const recorder = new FrameRecorder(`validation-${settings.seed}`, schedule, geometry);
    this.recorder = recorder;
    const distance = link.distanceMm ?? geometry.refDistanceMm ?? 600;
    const runner = new BlockRunner({
      stage,
      block,
      geometry: geometry.screen,
      recorder,
      sizes: targetSizes(!geometry.degreesApproximate, geometry.screen.pxPerMm, distance),
      reducedMotion: reducedMotion(),
      speed: settings.speed,
      minFrames: minAcceptedFrames(settings.speed),
      retry: false,
      extend: false,
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
      this.message = t('calibrate.error.start', { message: error instanceof Error ? error.message : String(error) });
      outcome = { kind: 'aborted' };
    }
    if (!this.mounted) return;
    runner.dispose();
    this.runner = null;
    publishProtocol(null, () => this.snapshot());
    if (outcome.kind !== 'done') {
      link.disarm();
      await this.end(block);
      this.phase = 'stopped';
      this.fail(this.message ?? (outcome.kind === 'invalid' ? t('validate.invalid', { reason: invalidationText(outcome.invalidation) }) : t('validate.aborted')));
      this.startButton.disabled = false;
      this.startButton.focus();
      return;
    }
    const last = recorder.recording.presentations[recorder.recording.presentations.length - 1];
    if (last) await link.drain(last.offsetMs);
    link.disarm();
    await this.score(recorder.finish(), recorder.receivedMs, stage, block);
  }

  private async score(rec: Recording, receivedMs: Map<number, number>, stage: StimulusStage, block: Block): Promise<void> {
    this.phase = 'scoring';
    const pending = this.fit as PendingFit;
    stage.setCaption(t('validate.scoring'));
    this.setStatus(t('validate.scoring'));
    const timer = setInterval(() => {
      if (!pending.result) stage.setCaption(t('validate.fitProgress', { percent: Math.round(100 * pending.fraction) }));
    }, 200);
    let fit: FitResult;
    try {
      fit = await pending.promise;
    } catch (error) {
      await this.end(block);
      this.phase = 'error';
      this.fail(t('validate.fitFailed', { message: error instanceof Error ? error.message : String(error) }));
      return;
    } finally {
      clearInterval(timer);
    }
    if (!this.mounted) return;
    console.info(`Fit: ${Math.round(fit.fitMs)} ms; τ = ${fit.pursuitLagMs} ms; ${fit.selection.reason}`);
    try {
      const state = getState();
      const geometry = state.geometry as SessionGeometry;
      const nominalFps = (this.capture as Capture).nominalFps();
      const scored = scoreRecording(fit, rec, geometry, { nominalFps, receivedMs });
      setValidationRun({ recording: rec, receivedMs, nominalFps });
      setState({ fit, validation: [...scored.own, ...scored.intersection], estimator: chosenEstimator(fit) });
    } catch (error) {
      await this.end(block);
      this.phase = 'error';
      this.fail(t('validate.error', { message: error instanceof Error ? error.message : String(error) }));
      return;
    }
    await this.end(block);
    this.phase = 'done';
    this.ctx.navigate('results');
  }

  /** Ends the block, leaves fullscreen (calibration may have entered it) and removes the stage. */
  private async end(block: Block): Promise<void> {
    await block.end();
    if (this.block === block) this.block = null;
    await exitFullscreen();
    releaseStage();
  }

  unmount(): void {
    this.mounted = false;
    this.link?.dispose();
    publishProtocol(null, () => null);
    this.runner?.abort();
    this.runner?.dispose();
    const block = this.block;
    if (block) void block.end().then(() => exitFullscreen());
    else void exitFullscreen();
    releaseStage();
  }
}

const screen: Screen = {
  mount(root, ctx) {
    const v = new Validation(root, ctx);
    return () => v.unmount();
  },
};

export default screen;
