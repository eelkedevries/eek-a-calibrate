// Hash routes only: the host returns its 404 page for unknown paths (spec §7).
// Each screen lives in src/app/screens/<id>.ts and default-exports a Screen,
// loaded on demand so the calibration code stays out of the first download.
import { announce, clear, h } from './dom.ts';
import { t } from './strings.en-GB.ts';

export type RouteId =
  | 'welcome'
  | 'camera'
  | 'screen'
  | 'distance'
  | 'calibrate'
  | 'validate'
  | 'results'
  | 'live'
  | 'data'
  | 'about'
  | 'lab';

export interface ScreenContext {
  navigate(id: RouteId): void;
  /** Query parameters written after the hash (`#/live?x=1`). */
  params: URLSearchParams;
}

/** Cleanup returned by `mount`; the router calls it before the next screen mounts. */
export type Unmount = () => void;

export interface Screen {
  mount(root: HTMLElement, ctx: ScreenContext): void | Unmount | Promise<void | Unmount>;
}

interface Route {
  id: RouteId;
  path: string;
  /** Screens that take the whole viewport hide the header and footer. */
  immersive: boolean;
  load: () => Promise<{ default: Screen }>;
}

export const ROUTES: readonly Route[] = [
  { id: 'welcome', path: '/', immersive: false, load: () => import('./screens/welcome.ts') },
  { id: 'camera', path: '/camera', immersive: false, load: () => import('./screens/camera.ts') },
  { id: 'screen', path: '/screen', immersive: false, load: () => import('./screens/screen.ts') },
  { id: 'distance', path: '/distance', immersive: false, load: () => import('./screens/distance.ts') },
  { id: 'calibrate', path: '/calibrate', immersive: true, load: () => import('./screens/calibrate.ts') },
  { id: 'validate', path: '/validate', immersive: true, load: () => import('./screens/validate.ts') },
  { id: 'results', path: '/results', immersive: false, load: () => import('./screens/results.ts') },
  { id: 'live', path: '/live', immersive: false, load: () => import('./screens/live.ts') },
  { id: 'data', path: '/data', immersive: false, load: () => import('./screens/data.ts') },
  { id: 'about', path: '/about', immersive: false, load: () => import('./screens/about.ts') },
  { id: 'lab', path: '/lab', immersive: false, load: () => import('./screens/lab.ts') },
];

/** The default flow (spec §14.1.1): screen size and viewing distance are an optional detour, not steps. */
export const FLOW: readonly RouteId[] = ['welcome', 'camera', 'calibrate', 'validate', 'results', 'live', 'data'];

export function hrefFor(id: RouteId): string {
  const route = ROUTES.find((r) => r.id === id);
  return `#${route ? route.path : '/'}`;
}

function parseHash(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  return { path: path === '' ? '/' : path, params: new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '') };
}

let outlet: HTMLElement | null = null;
let unmount: Unmount | null = null;
let generation = 0;
let currentId: RouteId | 'not-found' = 'welcome';

export function currentRoute(): RouteId | 'not-found' {
  return currentId;
}

export function navigate(id: RouteId): void {
  const target = hrefFor(id);
  if (location.hash === target) void render();
  else location.hash = target;
}

async function render(): Promise<void> {
  if (!outlet) return;
  const token = ++generation;
  const { path, params } = parseHash(location.hash);
  const route = ROUTES.find((r) => r.path === path);

  if (unmount) {
    try {
      unmount();
    } catch (error) {
      console.warn('Screen cleanup failed', error);
    }
    unmount = null;
  }
  clear(outlet);
  currentId = route ? route.id : 'not-found';
  document.body.dataset.route = currentId;
  document.body.classList.toggle('immersive', Boolean(route?.immersive));

  if (!route) {
    document.title = `${t('route.notFound')} · ${t('app.name')}`;
    outlet.append(
      h('h1', { tabindex: '-1' }, t('route.notFound')),
      h('p', null, t('route.notFoundBody')),
      h('p', null, h('a', { href: hrefFor('welcome') }, t('route.home'))),
    );
    focusHeading(outlet);
    return;
  }

  document.title = route.id === 'welcome' ? t('app.name') : `${t(`route.${route.id}`)} · ${t('app.name')}`;
  try {
    const screen = (await route.load()).default;
    if (token !== generation) return;
    const cleanup = await screen.mount(outlet, { navigate, params });
    if (token !== generation) {
      if (cleanup) cleanup();
      return;
    }
    unmount = cleanup ?? null;
  } catch (error) {
    if (token !== generation) return;
    const message = error instanceof Error ? error.message : String(error);
    console.error('Screen failed to load', error);
    outlet.append(h('p', { role: 'alert' }, t('route.loadError', { message })));
  }
  focusHeading(outlet);
  announce(document.title);
}

function focusHeading(root: HTMLElement): void {
  const heading = root.querySelector<HTMLElement>('h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

export function startRouter(target: HTMLElement): void {
  outlet = target;
  window.addEventListener('hashchange', () => void render());
  void render();
}

/** A stand-in screen for routes whose work package has not landed yet. */
export function placeholder(id: RouteId, wp: string): Screen {
  return {
    mount(root, ctx) {
      const step = FLOW.indexOf(id);
      const next = step >= 0 && step < FLOW.length - 1 ? FLOW[step + 1] : null;
      root.append(
        h('h1', null, t(`route.${id}`)),
        h('p', { class: 'lead' }, t(`placeholder.${id}`)),
        h('p', { class: 'note' }, t('placeholder.notBuilt', { wp })),
      );
      if (next) {
        const label = t('placeholder.continue', { next: t(`route.${next}`) });
        root.append(h('p', null, h('button', { type: 'button', onclick: () => ctx.navigate(next) }, label)));
      }
    },
  };
}
