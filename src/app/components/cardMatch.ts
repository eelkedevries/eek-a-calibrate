// The credit-card match (specification §4.4, after Li et al. 2020): an outline in the 85.60 ×
// 53.98 mm proportions of an ID-1 card, resized with a slider (arrow keys move it by one step,
// Page Up and Page Down by ten) or the − and + buttons until a real card held against the screen
// covers it exactly; pxPerMm = long side in CSS px / 85.60. Where the long side does not fit
// across the screen (a phone held upright) the outline stands on its short edge.
import { CARD_MM } from '../../core/constants.ts';
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export const CARD_CSS = `
.card-match { margin: var(--space-3) 0; }
.card-stage { display: flex; justify-content: center; align-items: center; padding: var(--space-3) 0; overflow: hidden; }
.card-outline { border: 2px solid var(--fg); border-radius: 3.2% / 5%; background: color-mix(in srgb, var(--accent) 10%, transparent); box-sizing: border-box; flex: none; }
.card-controls { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.card-controls input[type='range'] { flex: 1 1 14rem; min-height: 44px; accent-color: var(--accent); }
.card-controls button { min-width: 44px; min-height: 44px; }
.card-readout { font-variant-numeric: tabular-nums; }
`;

/** Long side ÷ short side of the ID-1 card. */
const ASPECT = CARD_MM.w / CARD_MM.h;
const MIN_LONG_PX = 120;
const STEP_PX = 0.5;
/**
 * The outline must be able to grow to a real card on the densest screens in common use: phones
 * reach about 6.6 CSS px per mm, far above the 3.78 of 96 px per inch (heuristic bound).
 */
const MAX_PX_PER_MM = 7;

export interface CardMatch {
  readonly el: HTMLElement;
  /** The outline's long side, CSS px. */
  longSidePx(): number;
  pxPerMm(): number;
  onChange(cb: (pxPerMm: number) => void): void;
}

/** True when an outline of `longPx` fits across a viewport `widthPx` wide (with the page margins). */
export function fitsAcross(longPx: number, widthPx: number): boolean {
  return longPx <= widthPx - 48;
}

export function cardMatch(initialLongPx: number): CardMatch {
  const vw = Math.max(320, window.innerWidth);
  const vh = Math.max(320, window.innerHeight);
  // On a narrow screen the card stands upright, so its long side runs down the screen.
  const upright = !fitsAcross(Math.max(initialLongPx, MAX_PX_PER_MM * CARD_MM.w), vw);
  const maxLong = Math.max(MIN_LONG_PX + 10, Math.floor(upright ? 0.85 * vh : vw - 48));
  const outline = h('div', { class: 'card-outline', role: 'img', 'aria-label': t('screen.card.outline') });
  const readout = h('p', { class: 'card-readout', 'aria-live': 'polite' });
  const slider = h('input', {
    type: 'range',
    min: MIN_LONG_PX,
    max: maxLong,
    step: STEP_PX,
    'aria-label': t('screen.card.slider'),
  });
  const listeners: ((pxPerMm: number) => void)[] = [];
  let longPx = Math.min(maxLong, Math.max(MIN_LONG_PX, initialLongPx));

  const render = (): void => {
    const shortPx = longPx / ASPECT;
    outline.style.width = `${upright ? shortPx : longPx}px`;
    outline.style.height = `${upright ? longPx : shortPx}px`;
    slider.value = String(longPx);
    slider.setAttribute('aria-valuetext', t('screen.card.valueText', { px: longPx.toFixed(1) }));
    readout.textContent = t('screen.card.readout', { px: longPx.toFixed(1), scale: (longPx / CARD_MM.w).toFixed(3) });
  };
  const set = (px: number): void => {
    const next = Math.min(maxLong, Math.max(MIN_LONG_PX, Math.round(px / STEP_PX) * STEP_PX));
    if (next === longPx) return;
    longPx = next;
    render();
    for (const cb of listeners) cb(longPx / CARD_MM.w);
  };
  slider.addEventListener('input', () => set(Number(slider.value)));
  const nudge = (delta: number, label: string) => h('button', { type: 'button', class: 'secondary', 'aria-label': label, onclick: () => set(longPx + delta) }, delta < 0 ? '−' : '+');
  render();

  const el = h(
    'div',
    { class: 'card-match' },
    h('p', null, t(upright ? 'screen.card.instructionsUpright' : 'screen.card.instructions')),
    h('div', { class: 'card-stage' }, outline),
    h('div', { class: 'card-controls' }, nudge(-STEP_PX, t('screen.card.smaller')), slider, nudge(STEP_PX, t('screen.card.larger'))),
    readout,
  );
  return {
    el,
    longSidePx: () => longPx,
    pxPerMm: () => longPx / CARD_MM.w,
    onChange: (cb) => listeners.push(cb),
  };
}
