import './app/style.css';
import { announce, h } from './app/dom.ts';
import { hrefFor, startRouter } from './app/router.ts';
import { deleteAllData, initState, parseSettings } from './app/state.ts';
import { t } from './app/strings.en-GB.ts';
import { installTestHooks } from './app/testHooks.ts';

initState(parseSettings(window.location));
installTestHooks();

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app');

async function onDeleteAll(): Promise<void> {
  if (!window.confirm(t('footer.deleteConfirm'))) return;
  await deleteAllData();
  deleteStatus.textContent = t('footer.deleted');
  announce(t('footer.deleted'));
}

const main = h('main', { id: 'main', tabindex: '-1' });
const deleteStatus = h('p', { class: 'delete-status' });

app.replaceChildren(
  h('a', { class: 'skip-link', href: '#main', onclick: (e: Event) => { e.preventDefault(); main.focus(); } }, t('app.skip')),
  h(
    'header',
    { class: 'site-header' },
    h('div', null, h('a', { class: 'brand', href: hrefFor('welcome') }, t('app.name')), h('p', { class: 'tagline' }, t('app.tagline'))),
    h(
      'nav',
      { class: 'site-nav', 'aria-label': t('nav.label') },
      h(
        'ul',
        null,
        h('li', null, h('a', { href: hrefFor('welcome') }, t('nav.start'))),
        h('li', null, h('a', { href: hrefFor('about') }, t('nav.about'))),
        h('li', null, h('a', { href: hrefFor('data') }, t('nav.data'))),
      ),
    ),
  ),
  main,
  h(
    'footer',
    { class: 'site-footer' },
    h('p', null, t('app.privacy')),
    h(
      'ul',
      null,
      h('li', null, h('a', { href: hrefFor('about') }, t('nav.about'))),
      h('li', null, h('a', { href: hrefFor('lab') }, t('nav.lab'))),
      h('li', null, h('a', { href: hrefFor('data') }, t('nav.data'))),
      h('li', null, h('a', { href: 'https://eelkedevries.com/' }, t('footer.site'))),
    ),
    h('button', { type: 'button', class: 'secondary', onclick: () => void onDeleteAll() }, t('footer.deleteAll')),
    deleteStatus,
    h('p', null, t('app.version', { version: __APP_VERSION__, commit: __APP_COMMIT__, date: __BUILD_DATE__ })),
  ),
  h('div', { id: 'announcer', class: 'visually-hidden', 'aria-live': 'polite', role: 'status' }),
);

startRouter(main);
