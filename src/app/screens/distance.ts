// #/distance (specification §7 screen 3, §4.4, §14.1, §17.2): the optional viewing-distance
// measurement, opened from Details → Device after the screen size. The blind-spot test (5 trials;
// D_bs = d / tan 13.5°, accepted for 300–1200 mm with an SD of at most 15 %, repeated once
// otherwise) with its large "It disappeared" button, then 2 s with both eyes open for the median
// iris diameter p̄, giving f_px = D_bs · p̄ / 11.7. The focal length is remembered per camera and
// frame size. Skip keeps the assumed field of view. Measured after calibration, it changes only
// the degree values (§14.1.3): D_ref is rescaled with the focal length, the fit is untouched.
import './pages.css';
import { ASSUMED_PX_PER_MM, BLIND_SPOT, DISTANCE, SETUP } from '../../core/constants.ts';
import { assessBlindSpot, blindSpotDistanceMm, blindSpotSquarePx, type BlindSpotAssessment } from '../../core/geometry/blindSpot.ts';
import { focalFromIrisSamples } from '../../core/geometry/distance.ts';
import { isDegreesApproximate } from '../../core/geometry/screen.ts';
import type { DistanceModel, FrameResult } from '../../core/types.ts';
import { detectDeviceClass } from '../../platform/capabilities.ts';
import { holdWakeLock, type WakeLockHold } from '../../platform/presentation.ts';
import { focalKey, loadFocal, saveGeometry, storageStatus, type FocalRecord } from '../../platform/storage.ts';
import { runBlindSpot } from '../components/blindSpot.ts';
import { announce, h, svg } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { activeCapture, ensureCapture, requestedEngines, type Capture } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { fromQuery, guardPanel, provisionalGeometry, rescoreValidation, returnHash, setStatus, toolFrame, type ToolFrame } from './screen.ts';

/** The iris capture after the blind-spot test (§4.4). */
const IRIS_MS = 2000;
/** Fewer open-eye frames than this is no measurement. */
const MIN_IRIS_FRAMES = 10;
/**
 * A slow device (a phone on the CPU delegate) may process fewer than MIN_IRIS_FRAMES frames in
 * 2 s, so the capture continues past IRIS_MS until it has them, up to this long (heuristic).
 */
const IRIS_MAX_MS = 6000;

/**
 * Puts a measured distance model into the session geometry. With a fit, D_ref is rescaled from
 * the fit's focal length to the new one (D_t is proportional to f_px), so geometry.yaml and the
 * reports use the distance the person actually sat at.
 */
export function applyDistance(model: DistanceModel): void {
  const state = getState();
  const g = state.geometry ?? provisionalGeometry({ pxPerMm: ASSUMED_PX_PER_MM, pxPerMmSource: 'assumed' }, model);
  const fit = state.fit;
  const fitFocal = fit?.fitGeometry?.distance.focalPx;
  const refDistanceMm = fit && fitFocal && fitFocal > 0 ? (fit.refDistanceMm * model.focalPx) / fitFocal : g.refDistanceMm;
  setState({ geometry: { ...g, distance: { ...model }, refDistanceMm, degreesApproximate: isDegreesApproximate(g.screen, model) } });
  rescoreValidation();
}

/** The picture of the test in the stage: the white screen, the black square, the red dot moving left. */
function testPicture(): SVGSVGElement {
  return svg(
    'svg',
    { class: 'bs-picture', viewBox: '0 0 320 180', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' },
    svg('rect', { class: 'bs-screen', x: 16, y: 20, width: 288, height: 140, rx: 12 }),
    svg('rect', { class: 'bs-square', x: 249, y: 83, width: 14, height: 14 }),
    svg('path', { class: 'bs-path', d: 'M236 90H96' }),
    svg('path', { class: 'bs-path', d: 'M104 82l-9 8 9 8' }),
    svg('circle', { class: 'bs-dot', cx: 150, cy: 90, r: 6 }),
  );
}

class Distance {
  private readonly frame: ToolFrame;
  private readonly startButton: HTMLButtonElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly onResize = (): void => this.checkWidth();
  private attempts = 0;
  private measured = false;
  private stored: FocalRecord | null = null;
  private mounted = true;
  private narrow = false;
  private cancelTest: (() => void) | null = null;
  private wake: WakeLockHold | null = null;
  private stopIris: (() => void) | null = null;
  private readonly mobile = detectDeviceClass().mobile;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.frame = toolFrame(root, { title: t('route.distance'), body: t('distance.body'), back: returnHash() });
    this.frame.stage.append(testPicture(), h('p', { class: 'bs-caption' }, t('distance.caption')));
    this.startButton = h('button', { type: 'button', class: 'btn btn--primary', onclick: () => (this.measured ? this.finish() : void this.runTest()) }, t('distance.start'));
    this.skipButton = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => (this.stored ? this.useStored(this.stored) : this.finish()) }, t('distance.skip'));
    this.frame.actions.append(this.skipButton, this.startButton);
    const g = getState().geometry;
    const scaleAssumed = !g || g.screen.pxPerMmSource === 'assumed';
    this.frame.extra.append(
      h('p', { class: 'tool-note' }, t(this.mobile ? 'distance.bandMobile' : 'distance.band'), ' ', t('distance.sourceShort')),
      scaleAssumed ? h('div', { class: 'tool-inline' }, h('a', { class: 'btn btn--ghost', href: `#/screen${fromQuery(ctx.params)}` }, t('distance.measureScreen'))) : '',
    );
    if (scaleAssumed) setStatus(this.frame.status, 'adjust', t('distance.scaleAssumed'));
    guardPanel(root);
    void this.offerStored();
    this.checkWidth();
    window.addEventListener('resize', this.onResize);
  }

  private finish(): void {
    location.hash = returnHash();
  }

  /**
   * The dot must be able to travel d = D·tan 13.5° left of the square (at 0.85·W) for D down to
   * 300 mm. A phone held upright is too narrow for that, so it is asked to be turned sideways.
   */
  private checkWidth(): void {
    const reachMm = blindSpotDistanceMm(blindSpotSquarePx(window.innerWidth, window.innerHeight)[0] / this.pxPerMm());
    const tooNarrow = reachMm < BLIND_SPOT.minMm || (this.mobile && window.innerHeight > window.innerWidth);
    if (tooNarrow) setStatus(this.frame.status, 'adjust', t('distance.narrow'));
    else if (this.narrow) setStatus(this.frame.status, null);
    this.narrow = tooNarrow;
  }

  private async offerStored(): Promise<void> {
    const c = activeCapture();
    if (!c) return;
    const s = c.camera.settings;
    const rec = await loadFocal(c.camera.info.deviceIdHash, s.width, s.height).catch(() => null);
    if (!rec || !this.mounted) return;
    setStatus(this.frame.status, 'good', t('distance.stored', { cm: (rec.blindSpotMm / 10).toFixed(0), date: new Date(rec.savedAt).toLocaleDateString('en-GB') }));
    this.stored = rec;
    this.skipButton.textContent = t('distance.useStored');
  }

  private useStored(rec: FocalRecord): void {
    applyDistance({ focalPx: rec.focalPx, focalSource: 'blind-spot', blindSpotMm: rec.blindSpotMm, blindSpotSdMm: rec.blindSpotSdMm, irisMm: DISTANCE.irisMm });
    announce(t('distance.applied'));
    this.finish();
  }

  private pxPerMm(): number {
    const g = getState().geometry;
    return g && g.screen.pxPerMm > 0 ? g.screen.pxPerMm : ASSUMED_PX_PER_MM;
  }

  private async runTest(): Promise<void> {
    this.startButton.disabled = true;
    this.wake ??= holdWakeLock();
    const run = runBlindSpot(document.body, { pxPerMm: this.pxPerMm(), trials: BLIND_SPOT.trials });
    this.cancelTest = run.cancel;
    const outcome = await run.done;
    this.cancelTest = null;
    if (!this.mounted) return;
    this.startButton.disabled = false;
    this.startButton.focus();
    if (outcome.kind === 'cancelled') {
      setStatus(this.frame.status, 'info', t('distance.cancelled'));
      return;
    }
    if (outcome.kind === 'missed') {
      setStatus(this.frame.status, 'adjust', t('distance.missed'));
      return;
    }
    const a = assessBlindSpot(outcome.offsetsPx, this.pxPerMm());
    this.attempts++;
    if (!a.accepted) {
      const again = this.attempts < 2;
      setStatus(this.frame.status, again ? 'adjust' : 'lost', t(`distance.reject.${a.reason}`, { cm: Number.isFinite(a.distanceMm) ? (a.distanceMm / 10).toFixed(0) : '–', sd: Number.isFinite(a.relSd) ? (100 * a.relSd).toFixed(0) : '–' }), ' ', t(again ? 'distance.again' : 'distance.giveUp'));
      this.startButton.textContent = t('distance.restart');
      return;
    }
    await this.measureIris(a);
  }

  private async measureIris(a: BlindSpotAssessment): Promise<void> {
    this.startButton.disabled = true;
    setStatus(this.frame.status, 'info', t('distance.bsResult', { cm: (a.distanceMm / 10).toFixed(1), sd: (a.sdMm / 10).toFixed(1) }), ' ', t('distance.iris.camera'));
    let c: Capture;
    try {
      c = await ensureCapture(requestedEngines(), { onStatus: (key) => setStatus(this.frame.status, 'info', t(`capture.status.${key}`)) });
    } catch (error) {
      if (!this.mounted) return;
      setStatus(this.frame.status, 'lost', t('distance.iris.noCamera', { message: error instanceof Error ? error.message : String(error) }));
      this.startButton.disabled = false;
      return;
    }
    if (!this.mounted) return;
    setStatus(this.frame.status, 'info', t('distance.iris.look'));
    announce(t('distance.iris.look'));
    const samples: number[] = [];
    let startMs: number | null = null;
    const done = new Promise<void>((resolve) => {
      const off = c.onResult((r: FrameResult) => {
        const tMs = r.meta.tCaptureMs;
        startMs ??= tMs;
        if (r.face && r.face.eyes.open && Number.isFinite(r.face.eyes.irisDiamPx) && r.face.eyes.irisDiamPx > 0) samples.push(r.face.eyes.irisDiamPx);
        const elapsed = tMs - startMs;
        if ((elapsed >= IRIS_MS && samples.length >= MIN_IRIS_FRAMES) || elapsed >= IRIS_MAX_MS) finish();
      });
      // Without frames the measurement still ends, with too few samples.
      const timer = setTimeout(finish, IRIS_MAX_MS + 3000);
      function finish(): void {
        clearTimeout(timer);
        off();
        resolve();
      }
      this.stopIris = finish;
    });
    await done;
    this.stopIris = null;
    if (!this.mounted) return;
    this.startButton.disabled = false;
    if (samples.length < MIN_IRIS_FRAMES) {
      setStatus(this.frame.status, 'lost', t('distance.iris.tooFew', { n: samples.length }));
      return;
    }
    const focalPx = focalFromIrisSamples(a.distanceMm, samples);
    const model: DistanceModel = { focalPx, focalSource: 'blind-spot', blindSpotMm: a.distanceMm, blindSpotSdMm: a.sdMm, irisMm: DISTANCE.irisMm };
    applyDistance(model);
    const s = c.camera.settings;
    const sorted = [...samples].sort((x, y) => x - y);
    const irisMedianPx = sorted.length % 2 ? (sorted[sorted.length >> 1] as number) : ((sorted[(sorted.length >> 1) - 1] as number) + (sorted[sorted.length >> 1] as number)) / 2;
    try {
      await saveGeometry({ kind: 'camera', key: focalKey(c.camera.info.deviceIdHash, s.width, s.height), focalPx, blindSpotMm: a.distanceMm, blindSpotSdMm: a.sdMm, irisMedianPx, savedAt: Date.now() });
    } catch (error) {
      console.warn('The distance measurement could not be stored', error);
    }
    if (!this.mounted) return;
    const inBand = a.distanceMm >= SETUP.distMinMm && a.distanceMm <= SETUP.distMaxMm;
    const advice = this.mobile ? '' : t(inBand ? 'distance.inBand' : a.distanceMm < SETUP.distMinMm ? 'distance.tooClose' : 'distance.tooFar');
    setStatus(this.frame.status, this.mobile || inBand ? 'good' : 'adjust', t('distance.done', { cm: (a.distanceMm / 10).toFixed(0) }), advice ? ` ${advice}` : '', storageStatus().mode === 'memory' ? ` ${t('storage.memory')}` : '');
    this.measured = true;
    this.startButton.textContent = t('distance.continue');
    this.skipButton.hidden = true;
    announce(t('distance.done', { cm: (a.distanceMm / 10).toFixed(0) }));
  }

  unmount(): void {
    this.mounted = false;
    window.removeEventListener('resize', this.onResize);
    this.cancelTest?.();
    this.stopIris?.();
    void this.wake?.release();
  }
}

const view: Screen = {
  mount(root, ctx) {
    const d = new Distance(root, ctx);
    return () => d.unmount();
  },
};

export default view;
