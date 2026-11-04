// Get ready, the ready check (design §2.5, §3; boards phone-ready, desktop-ready and
// position-signals): immersive, the stage under the floating bar with every level still to
// come. A frame until prompt 014 builds the screen and the position guard.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { backToStart } from '../shell/appShell.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { topBar } from '../shell/topBar.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';

const screen: Screen = {
  mount(root) {
    const track = trackModel(getState().settings.preset, { screen: 'ready' });
    root.append(
      topBar({ variant: 'bar', surface: 'chip', track, detailsTab: 'device' }),
      h(
        'main',
        { class: 'app__main' },
        h('section', { class: 'stage', 'aria-hidden': 'true' }),
        h('div', { class: 'cue' }, h('h1', { class: 'cue__title' }, t('ready.name')), h('p', { class: 'cue__body' }, t('shell.placeholder.body'))),
        h('div', { class: 'dock' }, h('div', { class: 'dock__actions' }, backToStart('chip'))),
      ),
    );
  },
};

export default screen;
