// The status row of Get ready (design §3.6): Distance, Position and Light, each a 16 px badge
// (✓ good, ! adjust) and the word, with no pill or background so that it reads as status rather
// than as buttons; each says its state in words to assistive technology. No numbers. The state
// badges themselves (design §6.1) are shared with the cue card, the glyph and the overlay.
import type { StatusGroup, StatusRow } from '../../core/position/cues.ts';
import { h, svg } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export type BadgeKind = 'good' | 'adjust' | 'lost';

/**
 * A state badge in a 24 box drawn at `size` px: a disc in the state colour holding a check, an
 * alert or a cross in --badge-ink. `edge` adds the 1.5 px --stage-ink rim used on the grey.
 */
export function stateBadge(kind: BadgeKind, size = 16, edge = false): SVGSVGElement {
  const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: 'badge' });
  el.append(svg('circle', { cx: 12, cy: 12, r: edge ? 11.25 : 12, fill: `var(--state-${kind})`, stroke: edge ? 'var(--stage-ink)' : null, 'stroke-width': edge ? 1.5 : null }));
  const ink = { fill: 'none', stroke: 'var(--badge-ink)', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  if (kind === 'good') el.append(svg('path', { d: 'M6.5 12.5l3.5 3.5 6.5-7', ...ink }));
  else if (kind === 'adjust') el.append(svg('path', { d: 'M12 6.5v7', ...ink }), svg('circle', { cx: 12, cy: 17.5, r: 1.6, fill: 'var(--badge-ink)' }));
  else el.append(svg('path', { d: 'M7.5 7.5l9 9M16.5 7.5l-9 9', ...ink }));
  return el;
}

const GROUPS: readonly StatusGroup[] = ['distance', 'position', 'light'];

export interface StatusRowView {
  el: HTMLElement;
  update(row: StatusRow): void;
}

export function statusRow(): StatusRowView {
  const items = GROUPS.map((group) => {
    const word = t(`guard.status.${group}`);
    const item = h('span', { class: 'status-item', role: 'img', 'data-group': group }, h('span', { class: 'status-item__badge' }), h('span', null, word));
    return { group, word, item };
  });
  const el = h('div', { class: 'status-row', role: 'group', 'aria-label': t('guard.status.label') }, ...items.map((i) => i.item));
  let last = '';
  return {
    el,
    update(row) {
      const key = GROUPS.map((g) => row[g]).join();
      if (key === last) return;
      last = key;
      for (const { group, word, item } of items) {
        const value = row[group];
        item.dataset.state = value;
        item.setAttribute('aria-label', t(value === 'good' ? 'guard.status.good' : 'guard.status.adjust', { item: word }));
        item.firstElementChild!.replaceChildren(stateBadge(value));
      }
    },
  };
}
