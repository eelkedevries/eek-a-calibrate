// The game's offer cards and chips on the grey (design §2.15, §2.16): "Aim drifting?" with Keep
// playing and Re-aim, "Your aim moved a lot" with the quick warm-up, and the short chips that
// report Re-aim ("Aim fixed", "Your aim was fine") and the challenge's corrections. A card is the
// warm-up's dark dialog card with one gold primary; a chip is a polite status pill.
import { h } from '../dom.ts';
import { cardDialog, type CardDialog } from './pauseCard.ts';

export interface OfferCardOptions {
  title: string;
  body: string;
  primary: { label: string; onSelect(): void };
  /** Absent when the offer cannot be declined (a forced Re-aim). */
  secondary?: { label: string; onSelect(): void } | null;
  role?: 'dialog' | 'alertdialog';
}

export interface OfferCard extends CardDialog {
  title: string;
}

export function offerCard(o: OfferCardOptions): OfferCard {
  const actions = [
    ...(o.secondary ? [{ label: o.secondary.label, kind: 'secondary' as const, onSelect: o.secondary.onSelect }] : []),
    { label: o.primary.label, kind: 'primary' as const, onSelect: o.primary.onSelect },
  ];
  const card = cardDialog({ title: o.title, body: o.body, role: o.role ?? 'dialog', actions, className: 'offer-card' });
  card.el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && o.secondary) {
      e.preventDefault();
      e.stopPropagation();
      o.secondary.onSelect();
    }
  });
  return { ...card, title: o.title };
}

export function statusChip(text: string): HTMLElement {
  return h('p', { class: 'status-chip', role: 'status' }, text);
}
