// Test hooks, installed only with `?e2e=1` (spec §7). `window.__eek` exposes a
// read-only copy of the app state, lets a test inject the screen geometry, and
// tells the protocol to skip fullscreen. Work packages add their own hooks
// with registerTestHook (for example `crashWorker`, added by WP4 for WP10's
// failures.spec.ts).
import { ENGINE_IDS } from '../core/types.ts';
import type { EngineId, SessionGeometry } from '../core/types.ts';
import { ENGINE_LOADERS } from '../engines/registry.ts';
import { currentRoute } from './router.ts';
import { getState, setState } from './state.ts';

export interface EekTestApi {
  readonly version: string;
  readonly commit: string;
  /** Always true in test mode: screens must not request fullscreen. */
  readonly skipFullscreen: true;
  /** A structured clone of the app state, so a test can never change it. */
  state(): unknown;
  route(): string;
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

export function installTestHooks(): void {
  if (!testMode() || window.__eek) return;
  const api: Record<string, unknown> = {};
  Object.defineProperties(api, {
    version: { value: __APP_VERSION__, enumerable: true },
    commit: { value: __APP_COMMIT__, enumerable: true },
    skipFullscreen: { value: true, enumerable: true },
    state: { value: () => structuredClone(getState()), enumerable: true },
    route: { value: () => currentRoute(), enumerable: true },
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
