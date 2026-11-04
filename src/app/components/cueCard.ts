// The cue card of Get ready (design §3.6): a dark chip near the camera edge with one headline
// (20 px medium) and, after 4 s, a faint tip (14 px). Only the headline is in the polite status
// region, so that a tip appearing is not read out again. For the phone's tilt and height cues a
// 24 px pictogram of the phone sits beside the instruction (design §3.5).
import type { DirectionalCue } from '../../core/position/cues.ts';
import { h, svg } from '../dom.ts';

type PhoneIcon = Extract<DirectionalCue, { kind: 'phone' }>['icon'];

/** Phone pictograms in the drawing kit's style (24 box): side views with a curved arrow, or up and down arrows. */
const PHONE_ICONS: Readonly<Record<PhoneIcon, readonly { d?: string; rect?: Record<string, string | number> }[]>> = {
  upright: [{ rect: { x: 9, y: 3, width: 6, height: 18, rx: 1.5, transform: 'rotate(25 12 12)' } }, { d: 'M17 6.5a7 7 0 0 1 1.5 6M19.8 10.6l-1.3 2.2-2.2-1.2' }],
  back: [{ rect: { x: 9, y: 3, width: 6, height: 18, rx: 1.5, transform: 'rotate(-25 12 12)' } }, { d: 'M7 6.5a7 7 0 0 0-1.5 6M4.2 10.6l1.3 2.2 2.2-1.2' }],
  raise: [{ rect: { x: 9, y: 7.5, width: 6, height: 14, rx: 1.5 } }, { d: 'M12 1.5v4M10 3.5l2-2 2 2' }],
  lower: [{ rect: { x: 9, y: 2.5, width: 6, height: 14, rx: 1.5 } }, { d: 'M12 22.5v-4M10 20.5l2 2 2-2' }],
  straight: [{ rect: { x: 8, y: 4, width: 8, height: 16, rx: 1.5, transform: 'rotate(20 12 12)' } }, { d: 'M19.5 7a9 9 0 0 1 1 6M21.2 10.9l-.7 2.2-2.2-.6' }],
};

export function phoneIcon(kind: PhoneIcon, size = 24): SVGSVGElement {
  const el = svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'var(--state-adjust)',
    'stroke-width': 1.75,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  for (const part of PHONE_ICONS[kind]) el.append(part.rect ? svg('rect', part.rect) : svg('path', { d: part.d! }));
  return el;
}

export interface CueCardView {
  el: HTMLElement;
  /**
   * Shows a headline. `key` names the instruction behind it: a new text under the same key (the
   * live percentage of "Getting ready… 62 %") is shown but not announced again.
   */
  update(headline: string, tip: string | null, cue: DirectionalCue, key?: string): void;
}

export function cueCard(): CueCardView {
  const pictogram = h('span', { class: 'cue__icon', hidden: true });
  const title = h('p', { class: 'cue__title', role: 'status', 'aria-live': 'polite' });
  const body = h('p', { class: 'cue__body', hidden: true });
  const el = h('div', { class: 'cue' }, pictogram, h('div', { class: 'cue__text' }, title, body));
  let lastIcon: PhoneIcon | null = null;
  let lastKey: string | undefined;
  return {
    el,
    update(headline, tip, cue, key = headline) {
      if (title.textContent !== headline) {
        // aria-busy holds the polite region's announcement while only the number changes.
        title.setAttribute('aria-busy', String(key === lastKey));
        title.textContent = headline;
      }
      lastKey = key;
      body.hidden = tip === null;
      if (tip !== null && body.textContent !== tip) body.textContent = tip;
      const icon = cue && cue.kind === 'phone' ? cue.icon : null;
      if (icon !== lastIcon) {
        lastIcon = icon;
        pictogram.hidden = icon === null;
        pictogram.replaceChildren(...(icon ? [phoneIcon(icon)] : []));
        el.classList.toggle('cue--icon', icon !== null);
      }
    },
  };
}
