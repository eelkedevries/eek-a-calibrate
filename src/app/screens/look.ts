// Free look (design §2.13; boards phone-free-look and desktop-free-look): immersive, the grey
// stage under the floating bar, every level done and the challenge unlocked. A frame until
// prompt 016 builds the screen.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { backToStart } from '../shell/appShell.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { topBar } from '../shell/topBar.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';

const screen: Screen = {
  mount(root) {
    const track = trackModel(getState().settings.preset, { screen: 'look' });
    root.append(
      topBar({ variant: 'bar', surface: 'chip', track, detailsTab: 'results' }),
      h(
        'main',
        { class: 'app__main' },
        h('section', { class: 'stage', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'dock' },
          h('div', { class: 'dock__status' }, h('h1', { class: 'dock__title' }, t('look.name')), h('p', { class: 'dock__body' }, t('shell.placeholder.body'))),
          h('div', { class: 'dock__actions' }, backToStart('chip')),
        ),
      ),
    );
  },
};

export default screen;
