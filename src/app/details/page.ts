// The building blocks of the Details sheet's pages (design §2.17): a page is one section whose
// children are blocks (the sheet cuts a page that does not fit between blocks, repeating its
// title), so each helper here returns one block: a paragraph, a reading, a switch, a choice row.
// Colour comes only from the role tokens of style.css and details.css.
import { h, svg, type Child } from '../dom.ts';
import { icon } from '../shell/icons.ts';
import { t } from '../strings.en-GB.ts';

/** A page: its title (repeated on every piece), then its blocks. */
export function sheetPage(title: string, opts: { cls?: string; head?: Child[] } = {}, ...blocks: Child[]): HTMLElement {
  return h(
    'section',
    { class: `sheet-page${opts.cls ? ` ${opts.cls}` : ''}` },
    h('div', { class: 'sheet-page__head' }, h('h3', { class: 'sheet-page__title' }, title), ...(opts.head ?? [])),
    ...blocks,
  );
}

export function para(content: Child | readonly Child[], cls = ''): HTMLParagraphElement {
  return h('p', { class: `sheet-page__body${cls ? ` ${cls}` : ''}` }, ...(Array.isArray(content) ? content : [content]));
}

/** A short note in the faint 14 px style (sources, "heuristic", what applies when). */
export function note(content: Child | readonly Child[]): HTMLParagraphElement {
  return h('p', { class: 'sheet-note' }, ...(Array.isArray(content) ? content : [content]));
}

/** One reading: a label and its value in mono, on one line where they fit. */
export function reading(label: string, value: Child | readonly Child[], opts: { id?: string; cls?: string } = {}): HTMLElement {
  return h(
    'div',
    { class: `kv${opts.cls ? ` ${opts.cls}` : ''}` },
    h('span', { class: 'kv__k' }, label),
    h('span', { class: 'kv__v', id: opts.id ?? null }, ...(Array.isArray(value) ? value : [value])),
  );
}

export interface SwitchOptions {
  id: string;
  label: string;
  /** A line under the label (what the setting does, or why it is unavailable). */
  detail?: string | null;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}

/** A switch row (`role="switch"`), 48 px tall: the label at the left, the switch at the right. */
export function switchRow(o: SwitchOptions): HTMLElement {
  const labelId = `${o.id}-label`;
  const detailId = o.detail ? `${o.id}-detail` : null;
  const button = h(
    'button',
    {
      type: 'button',
      id: o.id,
      class: 'switch',
      role: 'switch',
      'aria-checked': String(o.checked),
      'aria-labelledby': labelId,
      'aria-describedby': detailId,
      'aria-disabled': o.disabled ? 'true' : null,
    },
    h('span', { class: 'switch__knob', 'aria-hidden': 'true' }),
  );
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    o.onChange(next);
  });
  return h(
    'div',
    { class: 'setting' },
    h('span', { class: 'setting__text' }, h('span', { class: 'setting__label', id: labelId }, o.label), detailId ? h('span', { class: 'setting__detail', id: detailId }, o.detail ?? '') : null),
    button,
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A choice of one (native radio buttons drawn as a segmented row, or as a grid of tiles when the
 * labels are long), named by `legend`. Arrow keys move between the options, as for any radio group.
 */
export function choiceRow<T extends string>(o: { name: string; legend: string; options: readonly ChoiceOption<T>[]; value: T | null; grid?: boolean; onChange(value: T): void }): HTMLFieldSetElement {
  return h(
    'fieldset',
    { class: `segmented${o.grid ? ' segmented--grid' : ''}` },
    h('legend', { class: 'sr-only' }, o.legend),
    ...o.options.map((option) => {
      const input = h('input', { type: 'radio', name: o.name, value: option.value, id: `${o.name}-${option.value}`, class: 'segmented__input' });
      input.checked = option.value === o.value;
      input.addEventListener('change', () => {
        if (input.checked) o.onChange(option.value);
      });
      return h('label', { class: 'segmented__option', for: input.id }, input, h('span', null, option.label));
    }),
  );
}

/** A checkbox row of 48 px, for lists whose items stand alone (engines, plot series). */
export function checkRow(o: { id: string; label: string; detail?: string; checked: boolean; disabled?: boolean; swatch?: string; onChange(checked: boolean): void }): HTMLElement {
  const input = h('input', { type: 'checkbox', id: o.id, class: 'check__input', disabled: o.disabled ?? false });
  input.checked = o.checked;
  input.addEventListener('change', () => o.onChange(input.checked));
  return h(
    'label',
    { class: 'check', for: o.id },
    input,
    h('span', { class: 'check__box', 'aria-hidden': 'true' }, icon('check', 16)),
    o.swatch ? h('span', { class: `swatch swatch--${o.swatch}`, 'aria-hidden': 'true' }) : null,
    h('span', { class: 'check__text' }, h('span', { class: 'check__label' }, o.label), o.detail ? h('span', { class: 'check__detail' }, o.detail) : null),
  );
}

/** A row of actions inside a page: buttons or links of 48 px (44 px for ghost links). */
export function actionRow(...items: Child[]): HTMLElement {
  return h('div', { class: 'sheet-actions' }, ...items);
}

export function linkButton(label: string, opts: { href?: string; onClick?: () => void; kind?: 'secondary' | 'ghost'; iconName?: Parameters<typeof icon>[0] }): HTMLElement {
  const cls = `btn btn--${opts.kind ?? 'secondary'}`;
  const content = [opts.iconName ? icon(opts.iconName) : null, h('span', null, label)];
  if (opts.href && !opts.onClick) return h('a', { class: cls, href: opts.href }, ...content);
  const button = h('button', { type: 'button', class: cls }, ...content);
  button.addEventListener('click', (event) => {
    if (opts.onClick) opts.onClick();
    else if (opts.href) location.hash = opts.href;
    event.stopPropagation();
  });
  return button;
}

export type BadgeState = 'good' | 'adjust' | 'lost';

/** The state badge of spec-core (16 px circle in the state colour with its glyph): never colour alone. */
export function stateBadge(state: BadgeState, size = 16): SVGSVGElement {
  const glyph = state === 'good' ? 'M5.2 8.2l1.9 1.9 3.7-4' : state === 'adjust' ? 'M8 4.6v3.6M8 11.1v.1' : 'M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8';
  return svg(
    'svg',
    { class: `state-badge state-badge--${state}`, viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { cx: 8, cy: 8, r: 8, class: 'state-badge__disc' }),
    svg('path', { d: glyph, fill: 'none', 'stroke-width': 1.9, 'stroke-linecap': 'round', class: 'state-badge__glyph' }),
  );
}

/** A row of stars (design §5.5; on: filled, off: outline), named for a screen reader. */
export function starRow(on: number, of = 3, size = 20): SVGSVGElement {
  const path = 'M12 3.6L14.3 9.6L20.7 10L15.7 14L17.4 20.2L12 16.7L6.6 20.2L8.3 14L3.3 10L9.7 9.6Z';
  const gap = Math.round(size / 3);
  const el = svg('svg', { class: 'stars', viewBox: `0 0 ${of * 24 + (of - 1) * (gap * (24 / size))} 24`, width: of * size + (of - 1) * gap, height: size, role: 'img', 'aria-label': t('details.stars', { n: on, of }) });
  for (let i = 0; i < of; i++) {
    const g = svg('g', { transform: `translate(${i * (24 + gap * (24 / size))} 0)` }, svg('path', { d: path, class: i < on ? 'star star--on' : 'star star--off' }));
    el.append(g);
  }
  return el;
}

/** A number for display, or the dash for a missing value. */
export function num(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined || !Number.isFinite(value) ? t('details.none') : value.toFixed(digits);
}
