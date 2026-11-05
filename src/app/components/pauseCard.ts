// The warm-up's dark cards on the grey (design §2.6, §2.16): `cardDialog` builds one (title, an
// optional line, actions with at most one gold primary), and `pauseCard` is the manual Pause card:
// "Paused" with the Sound and Details buttons, Exit (the §4.7 abort, ghost) and Carry on
// (primary). Space, Enter on the card or Carry on continue; Esc exits.
import { h, type Child } from '../dom.ts';
import { icon } from '../shell/icons.ts';
import { t } from '../strings.en-GB.ts';

export interface CardAction {
  label: string;
  kind: 'primary' | 'secondary' | 'ghost';
  onSelect(): void;
}

export interface CardDialog {
  el: HTMLElement;
  /** Moves focus to the card's primary action (for keyboard users). */
  focus(): void;
  dispose(): void;
}

let ids = 0;

export function cardDialog(o: { title: string; body?: string | null; role?: 'dialog' | 'alertdialog'; actions: readonly CardAction[]; extra?: Child; className?: string }): CardDialog {
  const n = ++ids;
  const titleId = `stim-dialog-${n}`;
  const bodyId = `stim-dialog-body-${n}`;
  const buttons = o.actions.map((a) => {
    const b = h('button', { type: 'button', class: `btn ${a.kind === 'primary' ? 'btn--primary' : a.kind === 'secondary' ? 'btn--chip' : 'btn--ghost'}` }, a.label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      a.onSelect();
    });
    return b;
  });
  const el = h(
    'section',
    { class: `stim-card stim-dialog${o.className ? ` ${o.className}` : ''}`, role: o.role ?? 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-describedby': o.body ? bodyId : null },
    o.extra ?? null,
    h('h2', { class: 'stim-dialog__title', id: titleId }, o.title),
    o.body ? h('p', { class: 'stim-dialog__body', id: bodyId }, o.body) : null,
    buttons.length > 0 ? h('div', { class: 'stim-dialog__actions' }, ...buttons) : null,
  );
  return {
    el,
    focus() {
      const primary = buttons[o.actions.findIndex((a) => a.kind === 'primary')] ?? buttons[0];
      primary?.focus({ preventScroll: true });
    },
    dispose() {
      el.remove();
    },
  };
}

export interface PauseCardOptions {
  sound: boolean;
  onSound(on: boolean): void;
  onDetails(trigger: HTMLElement): void;
  onExit(): void;
  onCarryOn(): void;
}

export function pauseCard(o: PauseCardOptions): CardDialog {
  const sound = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('warmup.card.sound'), 'aria-pressed': String(o.sound) }, icon('sound'));
  sound.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = sound.getAttribute('aria-pressed') !== 'true';
    sound.setAttribute('aria-pressed', String(on));
    o.onSound(on);
  });
  const details = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('warmup.paused.details'), 'aria-haspopup': 'dialog' }, icon('more'));
  details.addEventListener('click', (e) => {
    e.stopPropagation();
    o.onDetails(details);
  });
  const card = cardDialog({
    title: t('warmup.paused.title'),
    className: 'pause-card',
    extra: h('div', { class: 'pause-card__tools' }, sound, details),
    actions: [
      { label: t('warmup.paused.exit'), kind: 'ghost', onSelect: o.onExit },
      { label: t('warmup.paused.carryOn'), kind: 'primary', onSelect: o.onCarryOn },
    ],
  });
  card.el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      o.onExit();
    }
  });
  return card;
}
