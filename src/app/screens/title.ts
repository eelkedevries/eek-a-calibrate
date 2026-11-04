// The Title (design §2.4; boards Main and desktop-title): framed, dark. The frame only: the top
// bar with the mark and wordmark, "Pop with your eyes" and its pitch, the hero card and Play.
// Prompt 014 adds the hero's emblem and level map, the set-up chooser, the meta line and the
// camera on Play; until then Play opens the v1 flow at #/welcome.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { icon } from '../shell/icons.ts';
import { topBar } from '../shell/topBar.ts';
import { t } from '../strings.en-GB.ts';

const screen: Screen = {
  mount(root, ctx) {
    root.append(
      topBar({ variant: 'title', detailsTab: 'about' }),
      h(
        'main',
        { class: 'app__main' },
        h(
          'div',
          { class: 'side' },
          h('div', { class: 'panel' }, h('h1', { class: 'panel__title' }, t('title.name')), h('p', { class: 'panel__body' }, t('title.pitch'))),
          h(
            'div',
            { class: 'actions' },
            h('button', { type: 'button', class: 'btn btn--primary', onclick: () => ctx.navigate('welcome') }, icon('play'), h('span', null, t('title.play'))),
          ),
        ),
        h('section', { class: 'stage hero', 'aria-hidden': 'true' }),
      ),
    );
  },
};

export default screen;
