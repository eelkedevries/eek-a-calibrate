// Methods, the long read (#/methods): a document page, the one game route that may scroll.
// A placeholder until prompt 017 writes it; it points to the v1 About page meanwhile.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { brand } from '../shell/topBar.ts';
import { t } from '../strings.en-GB.ts';

const screen: Screen = {
  mount(root) {
    root.append(
      h(
        'div',
        { class: 'doc' },
        h('header', { class: 'doc__head' }, brand()),
        h(
          'main',
          { class: 'doc__main' },
          h('h1', { class: 'doc__title' }, t('methods.title')),
          h('p', { class: 'doc__lead' }, t('methods.lead')),
        ),
        h(
          'nav',
          { class: 'doc__actions', 'aria-label': t('methods.title') },
          h('a', { class: 'btn btn--secondary', href: '#/about' }, t('methods.toAbout')),
          h('a', { class: 'btn btn--ghost', href: '#/' }, t('methods.back')),
        ),
      ),
    );
  },
};

export default screen;
