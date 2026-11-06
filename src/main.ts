import './app/style.css';
// The Details sheet's pages (after the shell's styles, which they refine).
import './app/details.css';
import { h } from './app/dom.ts';
import { currentRoute, startRouter } from './app/router.ts';
import { detailsState } from './app/shell/detailsSheet.ts';
import { applyTheme, initState, loadPreferences, parseSettings, queryKeys } from './app/state.ts';
import { applyPendingFixture, installTestHooks } from './app/testHooks.ts';
// Registers the real "Delete all my data" handler before any screen loads (spec §4.15).
import './platform/storage.ts';

// Dark is the default identity; Details → Settings chooses the theme, and `?theme=light|dark`
// overrides it for one visit. The grey stage is never themed.
function themeFromAddress(): 'light' | 'dark' | null {
  const q = location.hash.indexOf('?');
  const value = (q >= 0 ? new URLSearchParams(location.hash.slice(q + 1)).get('theme') : null) ?? new URLSearchParams(location.search).get('theme');
  return value === 'light' || value === 'dark' ? value : null;
}
const theme = themeFromAddress();
if (theme) applyTheme(theme);

initState(parseSettings(window.location));
installTestHooks({ route: currentRoute, sheet: detailsState });

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app');

// The game shell of the routes of spec §17.2, and the one polite status region.
const gameRoot = h('div', { class: 'app' });
app.replaceChildren(gameRoot, h('div', { id: 'announcer', class: 'sr-only', 'aria-live': 'polite', role: 'status' }));

// The stored preferences (theme, warm-up length, engines) apply before the first screen renders;
// the stored camera, once this browser has listed it, becomes the one Play asks for.
void loadPreferences(queryKeys(window.location)).then((prefs) => {
  applyTheme(theme ?? prefs.theme);
  startRouter({ gameOutlet: gameRoot, beforeMount: () => applyPendingFixture() });
  void import('./app/session.ts').then((m) => m.preferStoredCamera()).catch(() => undefined);
});
