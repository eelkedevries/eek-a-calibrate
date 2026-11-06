// Hash routes only: the host returns its 404 page for unknown paths (spec §7).
// Each screen lives in src/app/screens/<id>.ts and default-exports a Screen,
// loaded on demand so the calibration code stays out of the first download.
//
// The routes of spec §17.2 render into the game shell (`.app`). Each route declares its layout and
// may declare a guard that sends the player to the nearest screen that can run (§17.2.3). The v1
// routes redirect to the screens that replaced them (§17.2.2).
import { announce, h } from './dom.ts';
import { prepareShell, setLayout, type ShellLayout, type ShellMode } from './shell/appShell.ts';
import { closeDetails, isDetailsOpen, isDetailsTab, openDetails, type DetailsTabId } from './shell/detailsSheet.ts';
import { brand, detailsButton } from './shell/topBar.ts';
import { t } from './strings.en-GB.ts';

export type RouteId = 'title' | 'ready' | 'warmup' | 'complete' | 'look' | 'challenge' | 'details' | 'methods' | 'screen' | 'distance' | 'lab';

export interface ScreenContext {
  navigate(id: RouteId): void;
  /** Query parameters written after the hash (`#/look?x=1`). */
  params: URLSearchParams;
  /** The route being shown (`details` shows the Title with the sheet open). */
  route: RouteId;
}

/** Cleanup returned by `mount`; the router calls it before the next screen mounts. */
export type Unmount = () => void;

export interface Screen {
  mount(root: HTMLElement, ctx: ScreenContext): void | Unmount | Promise<void | Unmount>;
}

/** A route's guard: the route to show instead when this one's state is missing, or null. */
export type Guard = (ctx: { params: URLSearchParams }) => RouteId | null;

export interface Route {
  id: RouteId;
  path: string;
  layout: ShellLayout;
  /** The shell mode a game or document route starts in (design §2.2). */
  mode?: ShellMode;
  /** The screen shown, when it is another route's (`details` shows the Title). */
  screen?: RouteId;
  guard?: Guard;
  load: () => Promise<{ default: Screen }>;
}

const loadTitle = () => import('./screens/title.ts');

export const ROUTES: readonly Route[] = [
  { id: 'title', path: '/', layout: 'game', mode: 'framed', load: loadTitle },
  { id: 'ready', path: '/ready', layout: 'game', mode: 'immersive', load: () => import('./screens/ready.ts') },
  { id: 'warmup', path: '/warmup', layout: 'game', mode: 'stimulus', load: () => import('./screens/warmup.ts') },
  { id: 'complete', path: '/complete', layout: 'game', mode: 'framed', load: () => import('./screens/complete.ts') },
  { id: 'look', path: '/look', layout: 'game', mode: 'immersive', load: () => import('./screens/look.ts') },
  { id: 'challenge', path: '/challenge', layout: 'game', mode: 'stimulus', load: () => import('./screens/challenge.ts') },
  { id: 'details', path: '/details', layout: 'game', mode: 'framed', screen: 'title', load: loadTitle },
  { id: 'methods', path: '/methods', layout: 'document', mode: 'document', load: () => import('./screens/methods.ts') },
  // Opened from Details → Device, in the game's shell (§17.2).
  { id: 'screen', path: '/screen', layout: 'game', mode: 'framed', load: () => import('./screens/screen.ts') },
  { id: 'distance', path: '/distance', layout: 'game', mode: 'framed', load: () => import('./screens/distance.ts') },
  { id: 'lab', path: '/lab', layout: 'game', mode: 'framed', load: () => import('./screens/lab.ts') },
];

/** The v1 routes and the screens that replaced them (spec §17.2.2); a query after the hash is kept. */
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/welcome': '#/',
  '/camera': '#/ready',
  '/calibrate': '#/ready',
  '/validate': '#/ready',
  '/results': '#/details/results',
  '/live': '#/look',
  '/data': '#/details/data',
  '/about': '#/details/about',
};

/** The tab `#/details` opens on without one, as the Title's Details button does (design §2.4). */
export const DEFAULT_DETAILS_TAB: DetailsTabId = 'about';

export function hrefFor(id: RouteId, tab?: DetailsTabId): string {
  if (id === 'details') return `#/details/${tab ?? DEFAULT_DETAILS_TAB}`;
  const route = ROUTES.find((r) => r.id === id);
  return `#${route ? route.path : '/'}`;
}

export function parseHash(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  return { path: path === '' ? '/' : path, params: new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '') };
}

export type Resolution =
  | { kind: 'route'; route: Route; tab: DetailsTabId | null }
  | { kind: 'redirect'; to: string }
  | { kind: 'not-found' };

/** Resolves a path to a route, applying the route's guard and the details tab. Pure. */
export function resolveRoute(path: string, params: URLSearchParams, routes: readonly Route[] = ROUTES): Resolution {
  const legacy = Object.hasOwn(LEGACY_REDIRECTS, path) ? LEGACY_REDIRECTS[path] : undefined;
  if (legacy !== undefined) {
    const query = params.toString();
    return { kind: 'redirect', to: query ? `${legacy}?${query}` : legacy };
  }
  let route = routes.find((r) => r.path === path) ?? null;
  let tab: DetailsTabId | null = null;
  if (!route && path.startsWith('/details/')) route = routes.find((r) => r.id === 'details') ?? null;
  if (route?.id === 'details') {
    const name = path.slice('/details/'.length);
    if (!isDetailsTab(name)) return { kind: 'redirect', to: hrefFor('details') };
    tab = name;
  }
  if (!route) return { kind: 'not-found' };
  const instead = route.guard?.({ params }) ?? null;
  if (instead && instead !== route.id) return { kind: 'redirect', to: hrefFor(instead) };
  return { kind: 'route', route, tab };
}

export interface RouterOptions {
  /** The `.app` element of the game shell. */
  gameOutlet: HTMLElement;
  /** Called after a screen's module has loaded and before it mounts (test fixtures, §17.2.5). */
  beforeMount?(id: RouteId): void | Promise<void>;
}

let options: RouterOptions | null = null;
let unmount: Unmount | null = null;
let generation = 0;
let currentId: RouteId | 'not-found' = 'title';
/** The screen module mounted now, which the Title and its deep link share. */
let mountedScreen: RouteId | 'not-found' | null = null;

export function currentRoute(): RouteId | 'not-found' {
  return currentId;
}

export function navigate(id: RouteId): void {
  const target = hrefFor(id);
  if (location.hash === target) void render();
  else location.hash = target;
}

function setCurrent(id: RouteId | 'not-found'): void {
  currentId = id;
  document.body.dataset.route = id;
  if (id === 'not-found') document.title = `${t('shell.notFound.title')} · ${t('app.name')}`;
  else if (id === 'title') document.title = t('app.name');
  else document.title = `${t(`route.${id}`)} · ${t('app.name')}`;
}

/** The sheet opened by `#/details/<tab>` (`?page=<id>` names a page) leaves the Title at `#/` when it closes. */
function openDeepLinkedSheet(tab: DetailsTabId, page: string | null): void {
  openDetails({
    tab,
    page: page ?? 0,
    onClose: () => {
      if (!parseHash(location.hash).path.startsWith('/details')) return;
      history.replaceState(history.state, '', '#/');
      setCurrent('title');
    },
  });
}

async function render(): Promise<void> {
  if (!options) return;
  const { gameOutlet } = options;
  const token = ++generation;
  const { path, params } = parseHash(location.hash);
  const resolved = resolveRoute(path, params);
  if (resolved.kind === 'redirect') {
    location.replace(resolved.to);
    return;
  }
  const route = resolved.kind === 'route' ? resolved.route : null;
  const screenId = route ? (route.screen ?? route.id) : 'not-found';

  // The Title and its deep link are one screen: moving between them only opens or closes the sheet.
  if (route && screenId === 'title' && mountedScreen === 'title' && (currentId === 'title' || currentId === 'details')) {
    setCurrent(route.id);
    if (resolved.kind === 'route' && resolved.tab) openDeepLinkedSheet(resolved.tab, params.get('page'));
    else closeDetails();
    return;
  }

  if (isDetailsOpen()) closeDetails({ restoreFocus: false });
  if (unmount) {
    try {
      unmount();
    } catch (error) {
      console.warn('Screen cleanup failed', error);
    }
    unmount = null;
  }
  mountedScreen = null;
  setLayout(route?.layout ?? 'game');
  prepareShell(gameOutlet, screenId, route?.mode ?? 'framed');
  setCurrent(route ? route.id : 'not-found');

  if (!route) {
    renderNotFound(gameOutlet);
    mountedScreen = 'not-found';
    focusHeading(gameOutlet);
    announce(document.title);
    return;
  }

  try {
    const screen = (await route.load()).default;
    if (token !== generation) return;
    await options.beforeMount?.(route.id);
    if (token !== generation) return;
    const cleanup = await screen.mount(gameOutlet, { navigate, params, route: route.id });
    if (token !== generation) {
      if (cleanup) cleanup();
      return;
    }
    unmount = cleanup ?? null;
    mountedScreen = screenId;
  } catch (error) {
    if (token !== generation) return;
    const message = error instanceof Error ? error.message : String(error);
    console.error('Screen failed to load', error);
    gameOutlet.append(h('p', { role: 'alert' }, t('shell.loadError', { message })));
  }
  if (resolved.kind === 'route' && resolved.tab) openDeepLinkedSheet(resolved.tab, params.get('page'));
  else focusHeading(gameOutlet);
  announce(document.title);
}

function renderNotFound(app: HTMLElement): void {
  app.append(
    h('header', { class: 'topbar', 'data-variant': 'title' }, h('div', { class: 'topbar__inner' }, brand(), h('div', { class: 'topbar__end' }, detailsButton(DEFAULT_DETAILS_TAB)))),
    h(
      'main',
      { class: 'app__main' },
      h(
        'div',
        { class: 'side' },
        h('div', { class: 'panel' }, h('h1', { class: 'panel__title' }, t('shell.notFound.title')), h('p', { class: 'panel__body' }, t('shell.notFound.body'))),
        h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: '#/' }, t('shell.notFound.home'))),
      ),
      h('div', { class: 'stage', 'aria-hidden': 'true' }),
    ),
  );
}

function focusHeading(root: HTMLElement): void {
  const heading = root.querySelector<HTMLElement>('h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

export function startRouter(opts: RouterOptions): void {
  options = opts;
  window.addEventListener('hashchange', () => void render());
  void render();
}
