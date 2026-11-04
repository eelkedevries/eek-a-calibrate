// The credit-card match (specification §4.4, after Li et al. 2020): an outline in the 85.60 ×
// 53.98 mm proportions of an ID-1 card, resized with a slider (arrow keys move it by one step,
// Page Up and Page Down by more) or the − and + buttons until a real card held against the
// screen covers it exactly; pxPerMm = long side in CSS px / 85.60.
//
// The outline lies in the page's stage, at true CSS size, so the page never scrolls: across when
// the largest card a screen can show (7 CSS px per mm) fits the stage, otherwise upright; and
// when an upright card is taller than the stage, only its top part shows, and the player matches
// its width (the card's short side, so pxPerMm = width / 53.98, the same scale).
import { CARD_MM } from '../../core/constants.ts';
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

/** Long side ÷ short side of the ID-1 card. */
const ASPECT = CARD_MM.w / CARD_MM.h;
const MIN_LONG_PX = 120;
const STEP_PX = 0.5;
/**
 * The outline must be able to grow to a real card on the densest screens in common use: phones
 * reach about 6.6 CSS px per mm, far above the 3.78 of 96 px per inch (heuristic bound).
 */
const MAX_PX_PER_MM = 7;
/** Space kept free around the outline in the stage, CSS px. */
const MARGIN_PX = 16;

export type CardOrientation = 'across' | 'upright' | 'upright-partial';

export interface CardLayout {
  orientation: CardOrientation;
  /** The largest long side the slider reaches, CSS px. */
  maxLongPx: number;
}

/**
 * How the outline lies in a stage of `width` × `height` CSS px (pure): across when the largest
 * card fits, else upright, cut at the stage's foot when it is taller than the stage.
 */
export function cardLayout(width: number, height: number): CardLayout {
  const w = Math.max(0, width - 2 * MARGIN_PX);
  const hgt = Math.max(0, height - 2 * MARGIN_PX);
  const largest = MAX_PX_PER_MM * CARD_MM.w;
  if (largest <= w && largest / ASPECT <= hgt) return { orientation: 'across', maxLongPx: Math.floor(largest) };
  const maxLong = Math.max(MIN_LONG_PX + 10, Math.floor(Math.min(largest, w * ASPECT)));
  return { orientation: maxLong <= hgt ? 'upright' : 'upright-partial', maxLongPx: maxLong };
}

/** True when an outline of `longPx` fits across a viewport `widthPx` wide (with the page margins). */
export function fitsAcross(longPx: number, widthPx: number): boolean {
  return longPx <= widthPx - 48;
}

export interface CardMatch {
  /** The stage part: the outline and the readout. */
  readonly stage: HTMLElement;
  /** The slider with its − and + buttons. */
  readonly controls: HTMLElement;
  /** The outline's long side, CSS px. */
  longSidePx(): number;
  pxPerMm(): number;
  orientation(): CardOrientation;
  onChange(cb: (pxPerMm: number) => void): void;
  /** Lays the outline out for a stage of this size (call on every resize of the stage). */
  fit(width: number, height: number): void;
}

export function cardMatch(initialLongPx: number): CardMatch {
  const outline = h('div', { class: 'card-outline', role: 'img', 'aria-label': t('screen.card.outline') });
  const readout = h('p', { class: 'card-readout', 'aria-hidden': 'true' });
  const slider = h('input', { type: 'range', min: MIN_LONG_PX, step: STEP_PX, 'aria-label': t('screen.card.slider') });
  const stage = h('div', { class: 'card-stage', 'data-orientation': 'across' }, outline, readout);
  const listeners: ((pxPerMm: number) => void)[] = [];
  let layout: CardLayout = { orientation: 'across', maxLongPx: Math.floor(MAX_PX_PER_MM * CARD_MM.w) };
  let longPx = Math.max(MIN_LONG_PX, initialLongPx);

  const render = (): void => {
    const upright = layout.orientation !== 'across';
    const shortPx = longPx / ASPECT;
    outline.style.width = `${upright ? shortPx : longPx}px`;
    outline.style.height = `${upright ? longPx : shortPx}px`;
    stage.dataset.orientation = layout.orientation;
    slider.max = String(layout.maxLongPx);
    slider.value = String(longPx);
    slider.setAttribute('aria-valuetext', t('screen.card.valueText', { px: longPx.toFixed(1) }));
    readout.textContent = t('screen.card.readout', { scale: (longPx / CARD_MM.w).toFixed(3) });
  };
  const set = (px: number): void => {
    const next = Math.min(layout.maxLongPx, Math.max(MIN_LONG_PX, Math.round(px / STEP_PX) * STEP_PX));
    if (next === longPx) return;
    longPx = next;
    render();
    for (const cb of listeners) cb(longPx / CARD_MM.w);
  };
  slider.addEventListener('input', () => set(Number(slider.value)));
  const nudge = (delta: number, label: string) => h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, onclick: () => set(longPx + delta) }, delta < 0 ? '−' : '+');
  const controls = h('div', { class: 'card-controls' }, nudge(-STEP_PX, t('screen.card.smaller')), slider, nudge(STEP_PX, t('screen.card.larger')));
  render();

  return {
    stage,
    controls,
    longSidePx: () => longPx,
    pxPerMm: () => longPx / CARD_MM.w,
    orientation: () => layout.orientation,
    onChange: (cb) => listeners.push(cb),
    fit(width, height) {
      const next = cardLayout(width, height);
      if (next.orientation === layout.orientation && next.maxLongPx === layout.maxLongPx) return;
      layout = next;
      longPx = Math.min(layout.maxLongPx, Math.max(MIN_LONG_PX, longPx));
      render();
    },
  };
}
