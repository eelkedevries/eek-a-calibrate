// #/screen (specification §7 screen 2, §4.4, §14.1): the optional screen-size measurement. Match an
// outline to a bank card, or enter the diagonal in inches, or skip (96 CSS px per inch assumed,
// degrees approximate). A measurement is remembered per screen (`screen W×H@dpr`, long side
// first). Measuring after calibration changes only the degree values: the fit keeps its own
// geometry and the stored validation is scored again (§14.1.3).
import { ASSUMED_PX_PER_MM, DISTANCE } from '../../core/constants.ts';
import { focalFromAssumedFov } from '../../core/geometry/distance.ts';
import { isDegreesApproximate, pxPerMmFromCard, pxPerMmFromDiagonal, screenKey } from '../../core/geometry/screen.ts';
import type { ScreenGeometry, SessionGeometry } from '../../core/types.ts';
import { scoreRecording } from '../../fit/fitClient.ts';
import { loadScreenScale, saveGeometry, screenScaleKey, storageStatus } from '../../platform/storage.ts';
import { BANNER_CSS, banner } from '../components/banner.ts';
import { CARD_CSS, cardMatch } from '../components/cardMatch.ts';
import { announce, h } from '../dom.ts';
import type { RouteId, Screen, ScreenContext } from '../router.ts';
import { currentValidationRun } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { SETUP_CSS } from './welcome.ts';

/** The CSS-px screen size and pixel ratio the measurement is stored under. */
export function currentScreen(): Pick<ScreenGeometry, 'screenWpx' | 'screenHpx' | 'dpr'> {
  return { screenWpx: screen.width, screenHpx: screen.height, dpr: window.devicePixelRatio };
}

/**
 * A session geometry for screens that run before calibration: the current window, the given
 * scale, and an assumed distance model (calibration replaces both viewport and focal length
 * with what it measures; an assumed focal length is never carried over).
 */
export function provisionalGeometry(scale: { pxPerMm: number; pxPerMmSource: ScreenGeometry['pxPerMmSource'] }, distance?: SessionGeometry['distance']): SessionGeometry {
  const s = currentScreen();
  const screenGeometry: ScreenGeometry = {
    viewportWpx: window.innerWidth,
    viewportHpx: window.innerHeight,
    screenWpx: s.screenWpx,
    screenHpx: s.screenHpx,
    dpr: s.dpr,
    fullscreen: false,
    pxPerMm: scale.pxPerMm,
    pxPerMmSource: scale.pxPerMmSource,
  };
  const d = distance ?? { focalPx: focalFromAssumedFov(640, 480), focalSource: 'assumed-fov' as const, blindSpotMm: null, blindSpotSdMm: null, irisMm: DISTANCE.irisMm };
  return { screen: screenGeometry, distance: { ...d }, refDistanceMm: null, degreesApproximate: isDegreesApproximate(screenGeometry, d) };
}

/** Where the optional measurement returns to (`?from=`): the screen it was started from. */
const RETURN_ROUTES: readonly RouteId[] = ['welcome', 'camera', 'results', 'live', 'data'];

export function returnRoute(params: URLSearchParams): RouteId | null {
  const from = params.get('from');
  return from !== null && (RETURN_ROUTES as readonly string[]).includes(from) ? (from as RouteId) : null;
}

/**
 * Scores the current validation again under the session's (new) geometry (§14.1.3), so that Live,
 * the drift limit and the export use the new degree values without a visit to Results. Pixel
 * results do not change. Nothing happens while the fit has no validation (after a recalibration).
 */
export function rescoreValidation(): void {
  const { fit, geometry, validation } = getState();
  const run = currentValidationRun();
  if (!fit?.fitGeometry || !geometry || !validation || !run) return;
  try {
    const scored = scoreRecording(fit, run.recording, geometry, { nominalFps: run.nominalFps, receivedMs: run.receivedMs });
    setState({ validation: [...scored.own, ...scored.intersection] });
  } catch (error) {
    console.warn('The validation could not be scored under the new geometry', error);
  }
}

/** Puts a screen scale into the session geometry, keeping everything else (the calibration's viewport and distance). */
export function applyScale(pxPerMm: number, source: ScreenGeometry['pxPerMmSource']): void {
  const g = getState().geometry;
  if (!g) {
    setState({ geometry: provisionalGeometry({ pxPerMm, pxPerMmSource: source }) });
    return;
  }
  const screenGeometry = { ...g.screen, pxPerMm, pxPerMmSource: source };
  setState({ geometry: { ...g, screen: screenGeometry, degreesApproximate: isDegreesApproximate(screenGeometry, g.distance) } });
  rescoreValidation();
}

class ScreenSize {
  private readonly status = h('div', { 'aria-live': 'polite' });
  private readonly diagonal = h('input', { id: 'screen-diagonal', type: 'number', inputmode: 'decimal', min: 3, max: 120, step: 0.1 });
  private mounted = true;
  private readonly from: RouteId | null;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    const g = getState().geometry;
    this.from = returnRoute(ctx.params);
    const initial = g && g.screen.pxPerMmSource !== 'assumed' ? g.screen.pxPerMm : ASSUMED_PX_PER_MM;
    const card = cardMatch(initial * 85.6);
    const useCard = h('button', { type: 'button', onclick: () => void this.save('card', card.longSidePx()) }, t('screen.card.use'));
    const useDiagonal = h('button', { type: 'button', onclick: () => this.fromDiagonal() }, t('screen.diagonal.use'));
    root.append(
      h('style', null, SETUP_CSS + BANNER_CSS + CARD_CSS),
      h(
        'div',
        { class: 'setup' },
        h('h1', null, t('route.screen')),
        h('p', { class: 'lead' }, t('screen.lead')),
        h('p', null, t('screen.optional')),
        this.status,
        h('section', null, h('h2', null, t('screen.card.title')), card.el, h('div', { class: 'actions' }, useCard)),
        h(
          'section',
          null,
          h('h2', null, t('screen.diagonal.title')),
          h('p', null, t('screen.diagonal.body')),
          h('div', { class: 'field' }, h('label', { for: 'screen-diagonal' }, t('screen.diagonal.label')), this.diagonal),
          h('div', { class: 'actions' }, useDiagonal),
        ),
        h(
          'section',
          null,
          h('h2', null, t('screen.skip.title')),
          h('p', null, t('screen.skip.body')),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'secondary', onclick: () => this.skip() }, t('screen.skip.button'))),
        ),
      ),
    );
    void this.showStored();
  }

  private async showStored(): Promise<void> {
    const key = screenKey(currentScreen());
    const stored = await loadScreenScale(key).catch(() => null);
    if (!this.mounted) return;
    const g = getState().geometry;
    if (stored) {
      if (!g || g.screen.pxPerMmSource === 'assumed') applyScale(stored.pxPerMm, stored.source);
      this.status.replaceChildren(
        banner('ok', [
          t('screen.stored', { scale: stored.pxPerMm.toFixed(3), source: t(`screen.source.${stored.source}`), date: new Date(stored.savedAt).toLocaleDateString('en-GB') }),
          ' ',
          h('button', { type: 'button', class: 'secondary', onclick: () => this.done() }, t('screen.keep')),
        ]),
      );
    } else if (g && g.screen.pxPerMmSource !== 'assumed') {
      this.status.replaceChildren(banner('ok', t('screen.current', { scale: g.screen.pxPerMm.toFixed(3), source: t(`screen.source.${g.screen.pxPerMmSource}`) })));
    }
  }

  private fromDiagonal(): void {
    const inches = Number(this.diagonal.value);
    const s = currentScreen();
    if (!(inches >= 3 && inches <= 120 && s.screenWpx > 0 && s.screenHpx > 0)) {
      this.status.replaceChildren(banner('error', t('screen.diagonal.invalid')));
      this.diagonal.focus();
      return;
    }
    void this.save('diagonal', inches);
  }

  /** `input` is the card outline's long side in CSS px, or the diagonal in inches. */
  private async save(source: 'card' | 'diagonal', input: number): Promise<void> {
    const s = currentScreen();
    const pxPerMm = source === 'card' ? pxPerMmFromCard(input) : pxPerMmFromDiagonal(s.screenWpx, s.screenHpx, input);
    applyScale(pxPerMm, source);
    try {
      await saveGeometry({ kind: 'screen', key: screenScaleKey(screenKey(currentScreen())), pxPerMm, source, input, savedAt: Date.now() });
    } catch (error) {
      console.warn('The screen scale could not be stored', error);
    }
    if (!this.mounted) return;
    const memoryOnly = storageStatus().mode === 'memory';
    announce(t('screen.saved', { scale: pxPerMm.toFixed(3) }));
    if (memoryOnly) this.status.replaceChildren(banner('warn', t('storage.memory')));
    this.done();
  }

  private skip(): void {
    const g = getState().geometry;
    if (!g) applyScale(ASSUMED_PX_PER_MM, 'assumed');
    this.done();
  }

  /** On to the distance measurement, which then returns to where this started. */
  private done(): void {
    location.hash = this.from ? `#/distance?from=${this.from}` : '#/distance';
  }

  unmount(): void {
    this.mounted = false;
  }
}

const view: Screen = {
  mount(root, ctx) {
    const s = new ScreenSize(root, ctx);
    return () => s.unmount();
  },
};

export default view;
