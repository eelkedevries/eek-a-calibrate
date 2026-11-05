// The pip line of the stimulus HUD (design §2.6, §4.3–§4.5, §6.1): one 4 px pip per bubble on the
// camera edge (the top in portrait and on desktop, the camera side on a phone held sideways), done
// in --pip-on and to go in --pip-off, widths filling the line; a retried bubble adds a pip at the
// end. Follow the firefly has one continuous bar instead. role="progressbar", value = bubbles done.
import { h } from '../dom.ts';

export interface PipLine {
  el: HTMLElement;
  /** Bubbles done of `total` (a retry raises the total). */
  set(done: number, total: number): void;
  /** The continuous bar's fraction (pursuit). */
  setFraction(fraction: number): void;
  setLabel(label: string): void;
}

export function pipLine(label: string): PipLine {
  const el = h('div', { class: 'pips', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 0, 'aria-valuenow': 0 });
  let shape = '';

  const pips = (done: number, total: number) => {
    if (shape !== `pips:${total}`) {
      shape = `pips:${total}`;
      el.classList.remove('pips--bar');
      el.replaceChildren(...Array.from({ length: total }, () => h('span', { class: 'pip' })));
    }
    [...el.children].forEach((pip, k) => pip.toggleAttribute('data-on', k < done));
  };

  return {
    el,
    set(done, total) {
      pips(done, total);
      el.setAttribute('aria-valuemax', String(total));
      el.setAttribute('aria-valuenow', String(Math.min(done, total)));
      el.removeAttribute('aria-valuetext');
    },
    setFraction(fraction) {
      const f = Math.min(1, Math.max(0, fraction));
      if (shape !== 'bar') {
        shape = 'bar';
        el.classList.add('pips--bar');
        el.replaceChildren(h('span', { class: 'pips__fill' }));
      }
      (el.firstElementChild as HTMLElement).style.setProperty('--fill', String(f));
      el.setAttribute('aria-valuemax', '100');
      el.setAttribute('aria-valuenow', String(Math.round(100 * f)));
      el.setAttribute('aria-valuetext', `${Math.round(100 * f)} %`);
    },
    setLabel(text) {
      el.setAttribute('aria-label', text);
    },
  };
}
