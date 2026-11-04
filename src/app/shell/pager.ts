// The Details sheet's pager (design §2.17): one page at a time, ‹ and › buttons of 44 px and
// "2 of 5" in mono, so that no tab ever scrolls; hidden for a tab of one page. `pageAfter` and
// `pagerView` are pure.
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';
import { icon } from './icons.ts';

/** The page index after a step of `delta`, kept inside [0, pages − 1]. */
export function pageAfter(page: number, delta: number, pages: number): number {
  if (pages <= 0) return 0;
  return Math.min(Math.max(Math.trunc(page) + Math.trunc(delta), 0), pages - 1);
}

export interface PagerView {
  label: string;
  canPrev: boolean;
  canNext: boolean;
}

export function pagerView(page: number, pages: number): PagerView {
  const count = Math.max(1, pages);
  const index = pageAfter(page, 0, count);
  return { label: t('details.page.position', { page: index + 1, pages: count }), canPrev: index > 0, canNext: index < count - 1 };
}

export interface Pager {
  readonly el: HTMLElement;
  /** Shows page `page` of `pages` (0-based). */
  set(page: number, pages: number): void;
}

// The buttons are marked aria-disabled rather than disabled at either end, so that a focused
// button keeps the focus when the last page is reached.
export function createPager(onStep: (delta: -1 | 1) => void): Pager {
  const step = (button: HTMLButtonElement, delta: -1 | 1) => () => {
    if (button.getAttribute('aria-disabled') !== 'true') onStep(delta);
  };
  const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('details.page.prev') }, icon('chevronLeft'));
  const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('details.page.next') }, icon('chevronRight'));
  prev.addEventListener('click', step(prev, -1));
  next.addEventListener('click', step(next, 1));
  const label = h('span', { class: 'pager__label', 'aria-live': 'polite' });
  const el = h('nav', { class: 'pager', 'aria-label': t('details.pages') }, prev, label, next);
  return {
    el,
    set(page, pages) {
      el.hidden = pages <= 1;
      const view = pagerView(page, pages);
      label.textContent = view.label;
      prev.setAttribute('aria-disabled', String(!view.canPrev));
      next.setAttribute('aria-disabled', String(!view.canNext));
    },
  };
}
