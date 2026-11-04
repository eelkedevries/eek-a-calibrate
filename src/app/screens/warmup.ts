// The warm-up levels (design §2.6–§2.11; boards phone-level1-pop, phone-level2-follow,
// desktop-level1-pop, desktop-level3-turn and phone-landscape-level1): stimulus mode, the grey
// stage with a dark card in the level-card form, the first level current. A frame until prompt
// 015 runs the levels over the calibration protocol.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { backToStart } from '../shell/appShell.ts';
import { compactTrack, trackModel } from '../shell/levelTrack.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';

const screen: Screen = {
  mount(root) {
    const track = trackModel(getState().settings.preset, { screen: 'level', level: 1 });
    root.append(
      h(
        'main',
        { class: 'app__main' },
        h('section', { class: 'stage', 'aria-hidden': 'true' }),
        h(
          'section',
          { class: 'stim-card', 'aria-labelledby': 'warmup-title' },
          h('div', { class: 'stim-card__progress' }, compactTrack(track), h('p', { class: 'stim-card__count' }, track.srText)),
          h('h1', { class: 'stim-card__title', id: 'warmup-title' }, t('warmup.name')),
          h('p', { class: 'stim-card__body' }, t('shell.placeholder.body')),
          backToStart('chip'),
        ),
      ),
    );
  },
};

export default screen;
