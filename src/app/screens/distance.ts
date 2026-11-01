// #/distance (specification §7 screen 3, §4.4, §14.1): the optional viewing-distance measurement.
// The blind-spot test (5 trials; D_bs = d / tan 13.5°, accepted for 300–1200 mm with an SD of at
// most 15 %, repeated once otherwise), then 2 s with both eyes open for the median iris diameter
// p̄, giving f_px = D_bs · p̄ / 11.7. The focal length is remembered per camera and frame size.
// Skip keeps the assumed field of view. Measured after calibration, it changes only the degree
// values (§14.1.3): D_ref is rescaled with the focal length, the fit is untouched.
import { ASSUMED_PX_PER_MM, BLIND_SPOT, DISTANCE, SETUP } from '../../core/constants.ts';
import { assessBlindSpot, blindSpotDistanceMm, blindSpotSquarePx, type BlindSpotAssessment } from '../../core/geometry/blindSpot.ts';
import { focalFromIrisSamples } from '../../core/geometry/distance.ts';
import { isDegreesApproximate } from '../../core/geometry/screen.ts';
import type { DistanceModel, FrameResult } from '../../core/types.ts';
import { detectDeviceClass } from '../../platform/capabilities.ts';
import { holdWakeLock, type WakeLockHold } from '../../platform/presentation.ts';
import { focalKey, loadFocal, saveGeometry, storageStatus, type FocalRecord } from '../../platform/storage.ts';
import { BANNER_CSS, banner } from '../components/banner.ts';
import { BLIND_SPOT_CSS, runBlindSpot } from '../components/blindSpot.ts';
import { announce, h } from '../dom.ts';
import type { RouteId, Screen, ScreenContext } from '../router.ts';
import { activeCapture, ensureCapture, requestedEngines, type Capture } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { provisionalGeometry, rescoreValidation, returnRoute } from './screen.ts';
import { SETUP_CSS } from './welcome.ts';

/** The iris capture after the blind-spot test (§4.4). */
const IRIS_MS = 2000;
/** Fewer open-eye frames than this in the 2 s is no measurement. */
const MIN_IRIS_FRAMES = 10;

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

/** Where to go when the measurement is finished or skipped. */
function finalRoute(from: RouteId | null): RouteId {
  if (from) return from;
  return getState().fit ? 'results' : 'camera';
}

class Distance {
  private readonly ctx: ScreenContext;
  private readonly from: RouteId | null;
  private readonly status = h('div', { 'aria-live': 'polite' });
  private readonly result = h('div');
  private readonly startButton: HTMLButtonElement;
  private readonly stored = h('div');
  private readonly narrow = h('div');
  private readonly onResize = (): void => this.checkWidth();
  private attempts = 0;
  private mounted = true;
  private cancelTest: (() => void) | null = null;
  private wake: WakeLockHold | null = null;
  private stopIris: (() => void) | null = null;
  private readonly mobile = detectDeviceClass().mobile;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.ctx = ctx;
    this.from = returnRoute(ctx.params);
    const g = getState().geometry;
    const scaleAssumed = !g || g.screen.pxPerMmSource === 'assumed';
    this.startButton = h('button', { type: 'button', onclick: () => void this.runTest() }, t('distance.start'));
    root.append(
      h('style', null, SETUP_CSS + BANNER_CSS + BLIND_SPOT_CSS),
      h(
        'div',
        { class: 'setup' },
        h('h1', null, t('route.distance')),
        h('p', { class: 'lead' }, t('distance.lead')),
        h('p', null, t('screen.optional')),
        scaleAssumed ? banner('warn', [t('distance.scaleAssumed'), ' ', h('a', { href: this.from ? `#/screen?from=${this.from}` : '#/screen' }, t('distance.measureScreen'))]) : null,
        this.stored,
        this.narrow,
        h(
          'section',
          null,
          h('h2', null, t('distance.howTitle')),
          h('ol', null, h('li', null, t('distance.step1')), h('li', null, t('distance.step2')), h('li', null, t('distance.step3')), h('li', null, t('distance.step4'))),
          h('p', { class: 'note' }, t(this.mobile ? 'distance.bandMobile' : 'distance.band')),
          h('p', { class: 'note' }, t('distance.source')),
        ),
        this.status,
        this.result,
        h(
          'div',
          { class: 'actions' },
          this.startButton,
          h('button', { type: 'button', class: 'secondary', onclick: () => ctx.navigate(finalRoute(this.from)) }, t('distance.skip')),
        ),
      ),
    );
    void this.offerStored();
    this.checkWidth();
    window.addEventListener('resize', this.onResize);
  }

  /**
   * The dot must be able to travel d = D·tan 13.5° left of the square (at 0.85·W) for D down to
   * 300 mm. A phone held upright is too narrow for that, so it is asked to be turned sideways.
   */
  private checkWidth(): void {
    const reachMm = blindSpotDistanceMm(blindSpotSquarePx(window.innerWidth, window.innerHeight)[0] / this.pxPerMm());
    const tooNarrow = reachMm < BLIND_SPOT.minMm || (this.mobile && window.innerHeight > window.innerWidth);
    this.narrow.replaceChildren(...(tooNarrow ? [banner('warn', t('distance.narrow'))] : []));
  }

  private async offerStored(): Promise<void> {
    const c = activeCapture();
    if (!c) return;
    const s = c.camera.settings;
    const rec = await loadFocal(c.camera.info.deviceIdHash, s.width, s.height).catch(() => null);
    if (!rec || !this.mounted) return;
    this.stored.replaceChildren(
      banner('ok', [
        t('distance.stored', { cm: (rec.blindSpotMm / 10).toFixed(0), date: new Date(rec.savedAt).toLocaleDateString('en-GB') }),
        ' ',
        h('button', { type: 'button', class: 'secondary', onclick: () => this.useStored(rec) }, t('distance.useStored')),
      ]),
    );
  }

  private useStored(rec: FocalRecord): void {
    applyDistance({ focalPx: rec.focalPx, focalSource: 'blind-spot', blindSpotMm: rec.blindSpotMm, blindSpotSdMm: rec.blindSpotSdMm, irisMm: DISTANCE.irisMm });
    announce(t('distance.applied'));
    this.ctx.navigate(finalRoute(this.from));
  }

  private pxPerMm(): number {
    const g = getState().geometry;
    return g && g.screen.pxPerMm > 0 ? g.screen.pxPerMm : ASSUMED_PX_PER_MM;
  }

  private async runTest(): Promise<void> {
    this.startButton.disabled = true;
    this.result.replaceChildren();
    this.wake ??= holdWakeLock();
    const run = runBlindSpot(document.body, { pxPerMm: this.pxPerMm(), trials: BLIND_SPOT.trials });
    this.cancelTest = run.cancel;
    const outcome = await run.done;
    this.cancelTest = null;
    if (!this.mounted) return;
    this.startButton.disabled = false;
    this.startButton.focus();
    if (outcome.kind === 'cancelled') {
      this.status.replaceChildren(banner('info', t('distance.cancelled')));
      return;
    }
    if (outcome.kind === 'missed') {
      this.status.replaceChildren(banner('warn', t('distance.missed')));
      return;
    }
    const a = assessBlindSpot(outcome.offsetsPx, this.pxPerMm());
    this.attempts++;
    if (!a.accepted) {
      const again = this.attempts < 2;
      this.status.replaceChildren(banner(again ? 'warn' : 'error', [t(`distance.reject.${a.reason}`, { cm: Number.isFinite(a.distanceMm) ? (a.distanceMm / 10).toFixed(0) : '—', sd: Number.isFinite(a.relSd) ? (100 * a.relSd).toFixed(0) : '—' }), ' ', t(again ? 'distance.again' : 'distance.giveUp')]));
      this.startButton.textContent = t('distance.restart');
      return;
    }
    await this.measureIris(a);
  }

  private async measureIris(a: BlindSpotAssessment): Promise<void> {
    this.startButton.disabled = true;
    this.status.replaceChildren(banner('info', t('distance.bsResult', { cm: (a.distanceMm / 10).toFixed(1), sd: (a.sdMm / 10).toFixed(1) })));
    this.result.replaceChildren(h('p', { role: 'status' }, t('distance.iris.camera')));
    let c: Capture;
    try {
      c = await ensureCapture(requestedEngines(), { onStatus: (key) => this.result.replaceChildren(h('p', { role: 'status' }, t(`calibrate.status.${key}`))) });
    } catch (error) {
      if (!this.mounted) return;
      this.result.replaceChildren(banner('error', t('distance.iris.noCamera', { message: error instanceof Error ? error.message : String(error) })));
      this.startButton.disabled = false;
      return;
    }
    if (!this.mounted) return;
    this.result.replaceChildren(h('p', { role: 'status', class: 'lead' }, t('distance.iris.look')));
    const samples: number[] = [];
    let startMs: number | null = null;
    const done = new Promise<void>((resolve) => {
      const off = c.onResult((r: FrameResult) => {
        const tMs = r.meta.tCaptureMs;
        startMs ??= tMs;
        if (r.face && r.face.eyes.open && Number.isFinite(r.face.eyes.irisDiamPx) && r.face.eyes.irisDiamPx > 0) samples.push(r.face.eyes.irisDiamPx);
        if (tMs - startMs >= IRIS_MS) finish();
      });
      // Without frames the measurement still ends, with too few samples.
      const timer = setTimeout(finish, IRIS_MS + 3000);
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
      this.result.replaceChildren(banner('error', t('distance.iris.tooFew', { n: samples.length })));
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
    this.result.replaceChildren(
      banner(this.mobile || inBand ? 'ok' : 'warn', [
        t('distance.done', { cm: (a.distanceMm / 10).toFixed(0) }),
        ' ',
        this.mobile ? '' : t(inBand ? 'distance.inBand' : a.distanceMm < SETUP.distMinMm ? 'distance.tooClose' : 'distance.tooFar'),
      ]),
      storageStatus().mode === 'memory' ? banner('warn', t('storage.memory')) : '',
      h('div', { class: 'actions' }, h('button', { type: 'button', onclick: () => this.ctx.navigate(finalRoute(this.from)) }, t('distance.continue'))),
    );
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
