import './app/style.css';
import legacyCss from './app/legacy.css?inline';
import { announce, h } from './app/dom.ts';
import { currentRoute, hrefFor, startRouter } from './app/router.ts';
import type { ShellLayout } from './app/shell/appShell.ts';
import { detailsState } from './app/shell/detailsSheet.ts';
import { deleteAllData, initState, parseSettings } from './app/state.ts';
import { t } from './app/strings.en-GB.ts';
import { applyPendingFixture, installTestHooks } from './app/testHooks.ts';
// Registers the real "Delete all my data" handler before any screen loads (spec §4.15).
import './platform/storage.ts';

// Dark is the default identity; `?theme=light` chooses the light roles until Details → Settings
// offers the choice (prompt 017). The grey stage is never themed.
function themeFromAddress(): 'light' | 'dark' | null {
  const q = location.hash.indexOf('?');
  const value = (q >= 0 ? new URLSearchParams(location.hash.slice(q + 1)).get('theme') : null) ?? new URLSearchParams(location.search).get('theme');
  return value === 'light' || value === 'dark' ? value : null;
}
const theme = themeFromAddress();
if (theme) document.documentElement.dataset.theme = theme;

initState(parseSettings(window.location));
installTestHooks({ route: currentRoute, sheet: detailsState });

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app');

async function onDeleteAll(): Promise<void> {
  if (!window.confirm(t('footer.deleteConfirm'))) return;
  await deleteAllData();
  deleteStatus.textContent = t('footer.deleted');
  announce(t('footer.deleted'));
}

// The v1 page (header, main and footer) of the legacy routes, until prompt 018.
const main = h('main', { id: 'main', tabindex: '-1' });
const deleteStatus = h('p', { class: 'delete-status' });
const legacyShell = h(
  'div',
  { class: 'legacy-shell', hidden: true },
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
);

// The game shell of the routes of spec §17.2.
const gameRoot = h('div', { class: 'app' });

app.replaceChildren(legacyShell, gameRoot, h('div', { id: 'announcer', class: 'sr-only', 'aria-live': 'polite', role: 'status' }));

// legacy.css is enabled only while a legacy route is shown, after style.css in the cascade.
const legacyStyle = h('style', { id: 'legacy-style', media: 'not all' }, legacyCss);
document.head.append(legacyStyle);

function onLayout(layout: ShellLayout): void {
  const legacy = layout === 'legacy';
  legacyShell.hidden = !legacy;
  gameRoot.hidden = legacy;
  legacyStyle.media = legacy ? 'all' : 'not all';
}

startRouter({ legacyOutlet: main, gameOutlet: gameRoot, onLayout, beforeMount: () => applyPendingFixture() });
