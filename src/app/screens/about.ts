// #/about (specification §7 screen 9): the v1 About page. Its sections are Methods' (the long
// read, #/methods), which it shows until prompt 018 redirects this route to Details → About.
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { t } from '../strings.en-GB.ts';
import { methodsSections } from './methods.ts';
import { SETUP_CSS } from './welcome.ts';

const ABOUT_CSS = `
.about section { margin-top: var(--space-4); }
.about dl { display: grid; grid-template-columns: minmax(8rem, max-content) minmax(0, 1fr); gap: var(--space-1) var(--space-3); max-width: var(--measure); }
.about dt { font-weight: 600; }
.about dd { margin: 0; overflow-wrap: anywhere; }
.about .formula { font-family: var(--font-mono); font-size: 0.9rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); overflow-x: auto; max-width: var(--measure); white-space: pre; }
.about .engine { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); margin: var(--space-2) 0; max-width: var(--measure); }
.about .engine h3 { margin: 0 0 var(--space-1); }
.about .refs li { margin-bottom: var(--space-1); overflow-wrap: anywhere; }
@media (max-width: 30rem) { .about dl { grid-template-columns: minmax(0, 1fr); } }
`;

const screen: Screen = {
  mount(root) {
    root.append(
      h('style', null, SETUP_CSS + ABOUT_CSS),
      h(
        'div',
        { class: 'setup about' },
        h('h1', null, t('route.about')),
        h('p', { class: 'lead' }, t('about.lead')),
        ...methodsSections(),
        h('p', null, h('a', { href: '#/data' }, t('nav.data')), ' · ', h('a', { href: '#/lab' }, t('nav.lab'))),
      ),
    );
  },
};

export default screen;
