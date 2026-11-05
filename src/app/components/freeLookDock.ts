// Free look's dock (design §2.13, §4.3–§4.5; boards phone-free-look and desktop-free-look): the
// live dot and "Tracking" (with the position glyph at the row's end on phones), one sentence,
// Re-aim (secondary, crosshair) and Play the challenge (primary). Full width at the bottom on
// phones, one 760 px row at the bottom centre on larger screens.
import { h } from '../dom.ts';
import { icon } from '../shell/icons.ts';
import { t } from '../strings.en-GB.ts';

export interface FreeLookDock {
  el: HTMLElement;
  reaim: HTMLButtonElement;
  play: HTMLButtonElement;
}

export function freeLookDock(glyph: HTMLElement, onReaim: () => void, onPlay: () => void): FreeLookDock {
  const reaim = h('button', { type: 'button', class: 'btn btn--chip look-dock__reaim' }, icon('crosshair'), h('span', null, t('look.reaim')));
  const play = h('button', { type: 'button', class: 'btn btn--primary look-dock__play' }, t('look.play'));
  reaim.addEventListener('click', (e) => {
    e.stopPropagation();
    onReaim();
  });
  play.addEventListener('click', (e) => {
    e.stopPropagation();
    onPlay();
  });
  const el = h(
    'div',
    { class: 'dock look-dock' },
    h(
      'div',
      { class: 'dock__status look-dock__status' },
      h('p', { class: 'look-dock__tracking' }, h('span', { class: 'look-dock__live ek-live', 'aria-hidden': 'true' }), h('span', null, t('look.tracking'))),
      h('div', { class: 'look-dock__glyph' }, glyph),
    ),
    h('p', { class: 'look-dock__sentence' }, t('look.sentence')),
    h('div', { class: 'dock__actions look-dock__actions' }, reaim, play),
  );
  return { el, reaim, play };
}
