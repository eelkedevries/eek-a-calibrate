// Warm-up complete (design §2.12; boards phone-level-complete and desktop-level-complete):
// framed, dark, the track with every level done. A frame until prompt 015 builds the screen.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { backToStart } from '../shell/appShell.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { topBar } from '../shell/topBar.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';

const screen: Screen = {
  mount(root) {
    const track = trackModel(getState().settings.preset, { screen: 'complete', unlocked: true });
    root.append(
      topBar({ variant: 'bar', track, detailsTab: 'results' }),
      h(
        'main',
        { class: 'app__main' },
        h('section', { class: 'stage', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'side' },
          h('div', { class: 'panel' }, h('h1', { class: 'panel__title' }, t('complete.name')), h('p', { class: 'panel__body' }, t('shell.placeholder.body'))),
          h('div', { class: 'actions' }, backToStart('dark')),
        ),
      ),
    );
  },
};

export default screen;
