// The top bar (design §2.3, §4.3–§4.5). On the Title: the mark and wordmark left, Details right.
// Elsewhere: the phase label and the level track left on bars under 640 px, or the wordmark left
// and the labelled track centred on wider bars; Details right (the icon on phones, the icon and
// the word on wider bars). Immersive screens use the stage-chip pill form. The width checks are
// container queries on the bar; the fit guard degrades it when its content would not fit.
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';
import { addCleanup } from './appShell.ts';
import { openDetails, type DetailsTabId } from './detailsSheet.ts';
import { childrenFitInRow, fitGuard } from './fitGuard.ts';
import { icon } from './icons.ts';
import { trackElement, type TrackModel } from './levelTrack.ts';

export interface TopBarOptions {
  /** `title`: mark and wordmark, no track. `bar`: the track (and the wordmark on wide bars). */
  variant: 'title' | 'bar';
  /** `chip`: the stage-chip pill of immersive screens. */
  surface?: 'dark' | 'chip';
  track?: TrackModel;
  /** The tab the Details button opens on. */
  detailsTab?: DetailsTabId;
}

export function brand(): HTMLElement {
  return h('div', { class: 'topbar__brand' }, icon('mark', 24), h('span', { class: 'topbar__wordmark' }, t('shell.wordmark')));
}

/** The Details trigger: opens the sheet over the screen without changing the route. */
export function detailsButton(tab: DetailsTabId): HTMLButtonElement {
  const button = h(
    'button',
    { type: 'button', class: 'topbar__details', 'aria-label': t('shell.details'), 'aria-haspopup': 'dialog' },
    icon('more'),
    h('span', { class: 'topbar__details-word', 'aria-hidden': 'true' }, t('shell.details')),
  );
  button.addEventListener('click', () => openDetails({ tab, trigger: button }));
  return button;
}

export function topBar(opts: TopBarOptions): HTMLElement {
  const inner = h(
    'div',
    { class: 'topbar__inner' },
    brand(),
    opts.variant === 'bar' && opts.track ? h('div', { class: 'topbar__centre' }, trackElement(opts.track)) : null,
    h('div', { class: 'topbar__end' }, detailsButton(opts.detailsTab ?? 'about')),
  );
  const bar = h('header', { class: `topbar${opts.surface === 'chip' ? ' topbar--chip' : ''}`, 'data-variant': opts.variant }, inner);
  // The guard starts once the screen has put the bar in the document, where it can be measured.
  const start = () => {
    if (bar.isConnected) addCleanup(fitGuard(bar, { maxTier: opts.variant === 'bar' ? 3 : 1, fits: () => childrenFitInRow(inner, 4) }));
  };
  queueMicrotask(() => (bar.isConnected ? start() : requestAnimationFrame(start)));
  return bar;
}
