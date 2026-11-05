// "Checking your aim…" (design §2.10; spec §17.6.8): a dark chip card centred on the grey over a
// 4 px progress bar fed by the fit worker's progress and then the scoring; after 3 s (÷ speed in
// test mode) the line "Almost there" appears. FIT_BUDGET_MS is unchanged.
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export const LATE_MS = 3000;

export interface CheckingCard {
  el: HTMLElement;
  /** 0–1. */
  set(fraction: number): void;
  dispose(): void;
}

export function checkingCard(opts: { speed: number; frozen?: { fraction: number; late: boolean } }): CheckingCard {
  const fill = h('span', { class: 'checking__fill' });
  const bar = h('div', { class: 'checking__bar', role: 'progressbar', 'aria-label': t('warmup.checking.progress'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, fill);
  const late = h('p', { class: 'checking__late', hidden: true, role: 'status' }, t('warmup.checking.late'));
  const el = h('section', { class: 'stim-card checking', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'checking-title' }, h('h2', { class: 'checking__title', id: 'checking-title' }, t('warmup.checking.title')), bar, late);
  const timer = opts.frozen ? null : setTimeout(() => (late.hidden = false), LATE_MS / Math.max(1, opts.speed));
  const card: CheckingCard = {
    el,
    set(fraction) {
      const f = Math.min(1, Math.max(0, fraction));
      fill.style.setProperty('--fill', String(f));
      bar.setAttribute('aria-valuenow', String(Math.round(100 * f)));
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      el.remove();
    },
  };
  if (opts.frozen) {
    card.set(opts.frozen.fraction);
    late.hidden = !opts.frozen.late;
  }
  return card;
}
