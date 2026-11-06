// #/screen (specification §7 screen 2, §4.4, §14.1, §17.2): the optional screen-size measurement,
// opened from Details → Device. Match an outline to a bank card, or enter the diagonal in inches,
// or skip (96 CSS px per inch assumed, degrees approximate). A measurement is remembered per
// screen (`screen W×H@dpr`, long side first). Measuring after calibration changes only the degree
// values: the fit keeps its own geometry and the stored validation is scored again (§14.1.3).
// The page fits one screen: the outline lies in the stage, the slider and actions beside it.
import './pages.css';
import { ASSUMED_PX_PER_MM, DISTANCE } from '../../core/constants.ts';
import { focalFromAssumedFov } from '../../core/geometry/distance.ts';
import { isDegreesApproximate, pxPerMmFromCard, pxPerMmFromDiagonal, screenKey } from '../../core/geometry/screen.ts';
import type { ScreenGeometry, SessionGeometry } from '../../core/types.ts';
import { scoreRecording } from '../../fit/fitClient.ts';
import { loadScreenScale, saveGeometry, screenScaleKey, storageStatus } from '../../platform/storage.ts';
import { cardMatch } from '../components/cardMatch.ts';
import { stateBadge, type BadgeState } from '../details/page.ts';
import { announce, h, type Child } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { currentValidationRun } from '../session.ts';
import { addCleanup } from '../shell/appShell.ts';
import { detailsReturnHash } from '../shell/detailsSheet.ts';
import { contentFits, pickTier } from '../shell/fitGuard.ts';
import { icon } from '../shell/icons.ts';
import { topBar } from '../shell/topBar.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';

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

/**
 * Where the measurement goes when it is finished or skipped: back to the screen Details was
 * opened over, with the sheet on Device (the measurement is opened from Details → Device only).
 */
export function returnHash(): string {
  return detailsReturnHash('device');
}

/** The `from` parameter to pass on to the next page of the measurement. */
export function fromQuery(params: URLSearchParams): string {
  return params.get('from') === 'details' ? '?from=details' : '';
}

/**
 * Scores the current validation again under the session's (new) geometry (§14.1.3), so that Free
 * look, the drift limit and the export use the new degree values without a visit to Results. Pixel
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

// ----- The tool pages' frame (Screen size, Viewing distance, Diagnostics) --------------------

export interface ToolFrame {
  stage: HTMLElement;
  body: HTMLParagraphElement;
  /** A status line (good, adjust, lost or plain), announced politely. */
  status: HTMLElement;
  /** Controls between the body and the status (the slider, a field). */
  extra: HTMLElement;
  actions: HTMLElement;
}

/**
 * The framed page of design §4.3–§4.5 for a page opened from Details: the top bar with Back and
 * Details, the stage, a panel with the title, one body line, extras and a status, and the
 * actions. A fit guard drops the panel's notes, then its body, before anything could overflow.
 */
export function toolFrame(root: HTMLElement, opts: { title: string; body: string; back: string }): ToolFrame {
  const bar = topBar({ variant: 'title', detailsTab: 'device' });
  const back = h('a', { class: 'btn btn--ghost tool-back', href: opts.back }, icon('back'), h('span', null, t('tool.back')));
  bar.querySelector('.topbar__end')?.prepend(back);
  const stage = h('section', { class: 'stage' });
  const body = h('p', { class: 'panel__body' }, opts.body);
  const extra = h('div', { class: 'tool-extra' });
  const status = h('p', { class: 'tool-status', role: 'status', 'aria-live': 'polite' });
  const panel = h('div', { class: 'panel' }, h('h1', { class: 'panel__title' }, opts.title), body, extra, status);
  const actions = h('div', { class: 'actions' });
  root.append(bar, h('main', { class: 'app__main' }, stage, h('div', { class: 'side' }, panel, actions)));
  return { stage, body, status, extra, actions };
}

/** Writes a status line: a state badge (glyph and colour) and the words, or clears it. */
export function setStatus(el: HTMLElement, kind: BadgeState | 'info' | null, ...content: Child[]): void {
  if (kind === null) {
    el.replaceChildren();
    return;
  }
  el.replaceChildren(...(kind === 'info' ? [] : [stateBadge(kind)]), h('span', null, ...content));
}

/** Keeps a stage-sized element laid out for its box: `onSize` runs on every resize. */
export function watchSize(el: HTMLElement, onSize: (width: number, height: number) => void): void {
  const observer = new ResizeObserver(() => onSize(el.clientWidth, el.clientHeight));
  observer.observe(el);
  addCleanup(() => observer.disconnect());
}

/**
 * The panel's fit guard (design §4.1 rule 11): drops its notes (tier 1), then its body (tier 2),
 * when the side column overflows or the stage would be left under `minStagePx` tall.
 */
export function guardPanel(root: HTMLElement, minStagePx = 140): void {
  queueMicrotask(() => {
    const panel = root.querySelector<HTMLElement>('.panel');
    const side = root.querySelector<HTMLElement>('.side');
    const stage = root.querySelector<HTMLElement>('.stage');
    if (!panel?.isConnected || !side || !stage) return;
    const bar = root.querySelector<HTMLElement>('.topbar');
    const actions = root.querySelector<HTMLElement>('.actions');
    // In a phone held sideways the panel is centred in its row and can grow over the bar or the
    // actions without overflowing anything, so overlap counts as not fitting.
    const clear = (a: HTMLElement | null) => {
      if (!a) return true;
      const p = panel.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      const sideBySide = p.right <= r.left + 0.5 || p.left >= r.right - 0.5;
      return sideBySide || p.bottom <= r.top + 0.5 || p.top >= r.bottom - 0.5;
    };
    const fits = () => contentFits(panel) && contentFits(side) && stage.clientHeight >= minStagePx && clear(bar) && clear(actions);
    const check = () => {
      if (!panel.isConnected) return;
      const tier = pickTier(2, (candidate) => {
        panel.dataset.fit = String(candidate);
        return fits();
      });
      panel.dataset.fit = String(tier);
    };
    const observer = new ResizeObserver(check);
    observer.observe(stage);
    observer.observe(side);
    observer.observe(panel);
    observer.observe(root);
    void document.fonts?.ready.then(check);
    addCleanup(() => observer.disconnect());
    check();
  });
}

class ScreenSize {
  private readonly frame: ToolFrame;
  private readonly params: URLSearchParams;
  private readonly card;
  private readonly diagonal = h('input', { id: 'screen-diagonal', type: 'number', inputmode: 'decimal', min: 3, max: 120, step: 0.1 });
  private mode: 'card' | 'diagonal' = 'card';
  private stored = false;
  private mounted = true;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.params = ctx.params;
    const g = getState().geometry;
    const initial = g && g.screen.pxPerMmSource !== 'assumed' ? g.screen.pxPerMm : ASSUMED_PX_PER_MM;
    this.card = cardMatch(initial * 85.6);
    this.frame = toolFrame(root, { title: t('route.screen'), body: t('screen.body.across'), back: returnHash() });
    this.frame.stage.append(this.card.stage);
    watchSize(this.frame.stage, (w, hgt) => {
      this.card.fit(w, hgt);
      if (this.mode === 'card') this.frame.body.textContent = t(`screen.body.${this.card.orientation()}`);
    });
    guardPanel(root);
    this.render();
    void this.showStored();
  }

  private render(): void {
    const { extra, actions, body } = this.frame;
    if (this.mode === 'card') {
      body.textContent = t(`screen.body.${this.card.orientation()}`);
      extra.replaceChildren(this.card.controls, h('div', { class: 'tool-inline' }, h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => this.switchMode('diagonal') }, t('screen.toDiagonal'))));
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => this.skip() }, t(this.stored ? 'screen.keep' : 'screen.skip')),
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => void this.save('card', this.card.longSidePx()) }, t('screen.use')),
      );
    } else {
      body.textContent = t('screen.diagonal.body');
      extra.replaceChildren(h('div', { class: 'screen-diagonal' }, h('label', { class: 'field__label', for: 'screen-diagonal' }, t('screen.diagonal.label')), this.diagonal));
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => this.switchMode('card') }, t('screen.toCard')),
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => this.fromDiagonal() }, t('screen.diagonal.use')),
      );
    }
  }

  private switchMode(mode: 'card' | 'diagonal'): void {
    this.mode = mode;
    this.render();
    if (mode === 'diagonal') this.diagonal.focus();
    else this.card.controls.querySelector('input')?.focus();
  }

  private async showStored(): Promise<void> {
    const key = screenKey(currentScreen());
    const stored = await loadScreenScale(key).catch(() => null);
    if (!this.mounted) return;
    const g = getState().geometry;
    if (stored) {
      if (!g || g.screen.pxPerMmSource === 'assumed') applyScale(stored.pxPerMm, stored.source);
      this.stored = true;
      setStatus(this.frame.status, 'good', t('screen.stored', { scale: stored.pxPerMm.toFixed(3), source: t(`screen.source.${stored.source}`), date: new Date(stored.savedAt).toLocaleDateString('en-GB') }));
      this.render();
    } else if (g && g.screen.pxPerMmSource !== 'assumed') {
      setStatus(this.frame.status, 'good', t('screen.current', { scale: g.screen.pxPerMm.toFixed(3), source: t(`screen.source.${g.screen.pxPerMmSource}`) }));
    }
  }

  private fromDiagonal(): void {
    const inches = Number(this.diagonal.value);
    const s = currentScreen();
    if (!(inches >= 3 && inches <= 120 && s.screenWpx > 0 && s.screenHpx > 0)) {
      setStatus(this.frame.status, 'lost', t('screen.diagonal.invalid'));
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
    announce(t('screen.saved', { scale: pxPerMm.toFixed(3) }));
    if (storageStatus().mode === 'memory') setStatus(this.frame.status, 'adjust', t('storage.memory'));
    this.done();
  }

  private skip(): void {
    const g = getState().geometry;
    if (!g) applyScale(ASSUMED_PX_PER_MM, 'assumed');
    this.done();
  }

  /** On to the distance measurement, which then returns to where this started. */
  private done(): void {
    location.hash = `#/distance${fromQuery(this.params)}`;
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
