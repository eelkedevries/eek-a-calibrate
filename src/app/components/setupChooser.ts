// The set-up chooser of the Title (design §2.4, spec §17.4.1): "How are you playing?" over a
// radio group of three tiles (Propped, In hand, Webcam). Arrow keys move the choice and the
// focus together, Home and End jump, and only the chosen tile is in the tab order (the ARIA
// radio-group pattern). Each tile has an accessible name that says what it means.
import type { Setup } from '../../core/position/thresholds.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../shell/icons.ts';
import { t } from '../strings.en-GB.ts';

const TILES: readonly { value: Setup; icon: IconName; key: string }[] = [
  { value: 'propped', icon: 'propped', key: 'propped' },
  { value: 'in-hand', icon: 'inHand', key: 'inHand' },
  { value: 'webcam', icon: 'webcam', key: 'webcam' },
];

export interface SetupChooser {
  el: HTMLElement;
  value(): Setup;
  set(value: Setup): void;
}

export function setupChooser(opts: { value: Setup; onChange(value: Setup): void }): SetupChooser {
  let current = opts.value;
  const label = h('p', { class: 'chooser__label', id: 'setup-label' }, t('title.chooser.label'));
  const buttons = TILES.map((tile) =>
    h(
      'button',
      { type: 'button', class: 'choice', role: 'radio', 'aria-label': t(`title.chooser.${tile.key}.name`), 'data-setup': tile.value },
      icon(tile.icon, 24),
      h('span', { class: 'choice__label' }, t(`title.chooser.${tile.key}`)),
    ),
  );
  const group = h('div', { class: 'chooser__tiles', role: 'radiogroup', 'aria-labelledby': 'setup-label' }, ...buttons);

  const render = () => {
    for (const [i, b] of buttons.entries()) {
      const on = TILES[i]!.value === current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  const choose = (value: Setup, focus: boolean) => {
    const changed = value !== current;
    current = value;
    render();
    if (focus) buttons[TILES.findIndex((tile) => tile.value === value)]!.focus();
    if (changed) opts.onChange(value);
  };

  for (const [i, b] of buttons.entries()) {
    b.addEventListener('click', () => choose(TILES[i]!.value, false));
    b.addEventListener('keydown', (e: KeyboardEvent) => {
      const n = TILES.length;
      let next: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = n - 1;
      if (next === null) return;
      e.preventDefault();
      choose(TILES[next]!.value, true);
    });
  }
  render();
  return {
    el: h('div', { class: 'chooser' }, label, group),
    value: () => current,
    set: (value) => {
      current = value;
      render();
    },
  };
}
