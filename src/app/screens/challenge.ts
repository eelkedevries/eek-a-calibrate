// The challenge (design §2.14, §5; boards phone-challenge, desktop-challenge and
// phone-landscape-challenge): stimulus mode, a dark card in the round-card form with every level
// done and the star current. A frame until prompt 016 builds the game.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { backToStart } from '../shell/appShell.ts';
import { compactTrack, trackModel } from '../shell/levelTrack.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';

const screen: Screen = {
  mount(root) {
    const track = trackModel(getState().settings.preset, { screen: 'challenge' });
    root.append(
      h(
        'main',
        { class: 'app__main' },
        h('section', { class: 'stage', 'aria-hidden': 'true' }),
        h(
          'section',
          { class: 'stim-card', 'aria-labelledby': 'challenge-title' },
          h('div', { class: 'stim-card__progress' }, compactTrack(track), h('p', { class: 'sr-only' }, track.srText)),
          h('h1', { class: 'stim-card__title', id: 'challenge-title' }, t('challenge.name')),
          h('p', { class: 'stim-card__body' }, t('shell.placeholder.body')),
          backToStart('chip'),
        ),
      ),
    );
  },
};

export default screen;
