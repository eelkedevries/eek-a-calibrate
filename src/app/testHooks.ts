// Test hooks, installed only with `?e2e=1` (spec §7, §17.2.5). `window.__eek` exposes a
// read-only copy of the app state, lets a test inject the screen geometry, and
// tells the protocol to skip fullscreen. Work packages add their own hooks
// with registerTestHook (for example `crashWorker`, added by WP4 for WP10's
// failures.spec.ts), and their screens' test states with registerFixture.
import { ENGINE_IDS } from '../core/types.ts';
import type { EngineId, SessionGeometry } from '../core/types.ts';
import { ENGINE_LOADERS } from '../engines/registry.ts';
import { getState, setState } from './state.ts';

export interface EekTestApi {
  readonly version: string;
  readonly commit: string;
  /** Always true in test mode: screens must not request fullscreen. */
  readonly skipFullscreen: true;
  /** A structured clone of the app state, so a test can never change it. */
  state(): unknown;
  route(): string;
  /** The Details sheet: whether it is open, on which tab and page (0-based) of how many. */
  sheet(): unknown;
  /** The fixture named in the address, and whether it has been applied. */
  fixture(): { name: string | null; applied: boolean };
  injectGeometry(geometry: SessionGeometry): void;
  /** Loads every engine module through the registry and lists what each reports about itself. */
  engines(): Promise<{ id: EngineId; displayName: string; featureVersion: string; downloadBytes: number }[]>;
  readonly [hook: string]: unknown;
}

declare global {
  interface Window {
    __eek?: EekTestApi;
  }
}

export function testMode(): boolean {
  return getState().settings.e2e;
}

/** What the hooks read from the router and the shell, passed in so that neither imports this module. */
export interface TestHookSources {
  route(): string;
  sheet(): unknown;
}

export function installTestHooks(sources: TestHookSources): void {
  if (!testMode() || window.__eek) return;
  const api: Record<string, unknown> = {};
  Object.defineProperties(api, {
    version: { value: __APP_VERSION__, enumerable: true },
    commit: { value: __APP_COMMIT__, enumerable: true },
    skipFullscreen: { value: true, enumerable: true },
    state: { value: () => structuredClone(getState()), enumerable: true },
    route: { value: () => sources.route(), enumerable: true },
    sheet: { value: () => structuredClone(sources.sheet()), enumerable: true },
    fixture: { value: () => ({ name: fixtureName(location.search, location.hash), applied: fixtureApplied }), enumerable: true },
    injectGeometry: { value: (geometry: SessionGeometry) => setState({ geometry }), enumerable: true },
    engines: { value: listEngines, enumerable: true },
  });
  Object.defineProperty(window, '__eek', { value: api, enumerable: false, configurable: false, writable: false });
}

async function listEngines() {
  return Promise.all(
    ENGINE_IDS.map(async (id) => {
      const { spec } = await ENGINE_LOADERS[id]();
      return { id, displayName: spec.displayName, featureVersion: spec.featureVersion, downloadBytes: spec.downloadBytes };
    }),
  );
}

/** Adds `window.__eek[name]` in test mode; does nothing otherwise. Names are taken once. */
export function registerTestHook(name: string, fn: (...args: never[]) => unknown): void {
  const api = window.__eek;
  if (!api || name in api) return;
  Object.defineProperty(api, name, { value: fn, enumerable: true });
}

// Fixtures: `?e2e=1&fixture=<name>` puts a screen into a given state for a test without playing
// the warm-up. A screen module registers its fixtures when it loads; the router applies the
// named one once, after the module of the route being opened has loaded and before it mounts.

export interface FixtureContext {
  /** The query parameters before and after the hash, merged. */
  params: URLSearchParams;
}

export type FixtureApply = (ctx: FixtureContext) => void | Promise<void>;

const fixtures = new Map<string, FixtureApply>();
let fixtureApplied = false;

/** Registers a named fixture. The first registration of a name wins. */
export function registerFixture(name: string, apply: FixtureApply): void {
  if (!fixtures.has(name)) fixtures.set(name, apply);
}

/** The `fixture` parameter, after the hash (`#/complete?fixture=x`) or before it. */
export function fixtureName(search: string, hash: string): string | null {
  const q = hash.indexOf('?');
  const fromHash = q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('fixture') : null;
  const name = fromHash ?? new URLSearchParams(search).get('fixture');
  return name && name.trim() !== '' ? name.trim() : null;
}

/** Applies the fixture named in the address, once per page load, in test mode only. */
export async function applyPendingFixture(): Promise<void> {
  if (fixtureApplied || !testMode()) return;
  const name = fixtureName(location.search, location.hash);
  if (!name) return;
  const apply = fixtures.get(name);
  // Another route's module may register it; it is applied when that route opens.
  if (!apply) return;
  fixtureApplied = true;
  const params = new URLSearchParams(location.search);
  const q = location.hash.indexOf('?');
  if (q >= 0) for (const [key, value] of new URLSearchParams(location.hash.slice(q + 1))) params.set(key, value);
  await apply({ params });
}
