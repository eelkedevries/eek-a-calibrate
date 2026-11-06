// App state: the settings pre-filled from the query string (spec §7), the preferences of
// Details → Settings (design §2.17) kept on the device (spec §17.10.3), and the session's
// results as they arrive. Leaving mid-flow is allowed; everything a screen needs from an earlier
// one lives here.
import { DRIFT } from '../core/constants.ts';
import { SETUPS, type Setup } from '../core/position/thresholds.ts';
import { ENGINE_IDS } from '../core/types.ts';
import type {
  EngineId,
  EstimatorId,
  FitResult,
  Preset,
  Recording,
  SessionGeometry,
  ValidationReport,
} from '../core/types.ts';

export interface Settings {
  pid: string;
  session: string;
  preset: Preset;
  /** `auto`: the device probe decides the run set; a list: exactly these engines (`engines=all` gives all four). */
  engines: 'auto' | readonly EngineId[];
  select: 'auto' | EstimatorId;
  seed: number;
  seedSource: 'query' | 'clock';
  /** Minutes between timed Re-aim prompts in Free look and the challenge; 0 turns them off. */
  driftEveryMin: number;
  host: 'worker' | 'inline' | null;
  force: 'cpu' | null;
  /** `?delegate=cpu|gpu`: the face landmarker's delegate; null = the device default. */
  delegate?: 'GPU' | 'CPU' | null;
  /** Test mode (`e2e=1`): read-only `window.__eek`, injected geometry, no fullscreen. */
  e2e: boolean;
  /** Divides every protocol duration; honoured only in test mode. */
  speed: number;
  /**
   * The Title's set-up chooser (spec §17.4.1): copy and position thresholds only. null until the
   * player chooses; the chooser then starts from the device class. `?setup=` presets it.
   */
  setup: Setup | null;
  /** Sound effects, on by default at a low volume (design §3.10); `?sound=0` turns them off. */
  sound: boolean;
  /** "Read instructions aloud", off by default; `?speech=1` turns it on (Settings in 017). */
  speech: boolean;
}

export interface SessionClock {
  /** Main-thread `performance.now()` at session start; every timestamp shares this domain (spec §4.1). */
  startPerfMs: number;
  timeOrigin: number;
  startEpochMs: number;
}

export type Theme = 'dark' | 'light';
export type Glasses = 'none' | 'glasses' | 'contacts' | 'undisclosed';

/**
 * The settings of Details → Settings (design §2.17) and the set-up chooser, stored in the `prefs`
 * store (§17.10.3). The warm-up length, the engines, sound, speech and the set-up choice are
 * mirrored into `Settings` (`preset`, `engines`, `sound`, `speech`, `setup`), which the pipeline
 * and the game read, unless the address set them.
 */
export interface Prefs {
  warmup: Preset;
  engines: 'auto' | readonly EngineId[];
  glasses: Glasses | null;
  sound: boolean;
  /** Read instructions aloud, with a local voice only (§17.5.5). */
  speech: boolean;
  /** Halves the head block's sector targets (§17.6.5). */
  limitedHead: boolean;
  theme: Theme;
  /** The camera chosen in Settings; matched again by id or name, because ids can change. */
  camera: { deviceId: string; label: string } | null;
  /** Free look's extras: raw and per-engine dots, trail, recording and markers (§17.8.1). */
  expert: boolean;
  setup: Setup | null;
}

export const DEFAULT_PREFS: Readonly<Prefs> = {
  warmup: 'standard',
  engines: 'auto',
  glasses: null,
  sound: true,
  speech: false,
  limitedHead: false,
  theme: 'dark',
  camera: null,
  expert: false,
  setup: null,
};

const GLASSES: readonly Glasses[] = ['none', 'glasses', 'contacts', 'undisclosed'];

/** Stored preferences as read back: anything missing or malformed takes its default. */
export function normalisePrefs(raw: unknown): Prefs {
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (key: keyof Prefs): boolean => (typeof r[key] === 'boolean' ? (r[key] as boolean) : (DEFAULT_PREFS[key] as boolean));
  let engines: Prefs['engines'] = 'auto';
  if (Array.isArray(r.engines)) {
    const list = ENGINE_IDS.filter((id) => (r.engines as unknown[]).includes(id));
    if (list.length > 0) engines = list;
  }
  const camera = r.camera as Record<string, unknown> | null | undefined;
  return {
    warmup: oneOf(typeof r.warmup === 'string' ? r.warmup : null, PRESETS) ?? DEFAULT_PREFS.warmup,
    engines,
    glasses: oneOf(typeof r.glasses === 'string' ? r.glasses : null, GLASSES),
    sound: bool('sound'),
    speech: bool('speech'),
    limitedHead: bool('limitedHead'),
    theme: r.theme === 'light' ? 'light' : 'dark',
    camera: camera && typeof camera.deviceId === 'string' && camera.deviceId !== '' ? { deviceId: camera.deviceId, label: typeof camera.label === 'string' ? camera.label : '' } : null,
    expert: bool('expert'),
    setup: oneOf(typeof r.setup === 'string' ? r.setup : null, SETUPS),
  };
}

/** The query parameters present before or after the hash, by name. */
export function queryKeys(location: Pick<Location, 'search' | 'hash'>): Set<string> {
  const keys = new Set(new URLSearchParams(location.search).keys());
  const q = location.hash.indexOf('?');
  if (q >= 0) for (const key of new URLSearchParams(location.hash.slice(q + 1)).keys()) keys.add(key);
  return keys;
}

/** The settings that stored preferences change: the address wins for each one it names. */
export function settingsFromPrefs(settings: Settings, prefs: Prefs, fromAddress: ReadonlySet<string>): Settings {
  return {
    ...settings,
    preset: fromAddress.has('preset') ? settings.preset : prefs.warmup,
    engines: fromAddress.has('engines') ? settings.engines : prefs.engines,
    sound: fromAddress.has('sound') ? settings.sound : prefs.sound,
    speech: fromAddress.has('speech') ? settings.speech : prefs.speech,
    setup: fromAddress.has('setup') ? settings.setup : prefs.setup,
  };
}

/** One zone's challenge statistics (§17.9.3, design §5.6), shown in Details → Results. */
export interface ZoneStats {
  col: number;
  row: number;
  bubbles: number;
  popped: number;
  /** Median time to pop, ms; null before a pop. */
  medianPopMs: number | null;
  /** Mean offset of the gaze from the bubbles' centres, CSS px; null without pops. */
  offsetPx: readonly [number, number] | null;
}

export interface ChallengeStats {
  cols: number;
  rows: number;
  /** Rounds the statistics cover. */
  rounds: number;
  zones: ZoneStats[];
}

export interface AppState {
  settings: Settings;
  prefs: Prefs;
  /** The challenge's per-zone statistics of this session (written by the challenge), or null. */
  challenge: ChallengeStats | null;
  clock: SessionClock;
  geometry: SessionGeometry | null;
  /** Engines chosen by the device probe (spec §7, screen 1). */
  runSet: EngineId[] | null;
  calibration: Recording | null;
  fit: FitResult | null;
  validation: ValidationReport[] | null;
  /** The estimator in use; switching needs no recalibration. */
  estimator: EstimatorId | null;
}

const PRESETS: readonly Preset[] = ['quick', 'standard', 'thorough'];
const ESTIMATORS: readonly EstimatorId[] = [...ENGINE_IDS, 'combined'];

function text(value: string | null, max = 64): string {
  return (value ?? '').trim().slice(0, max);
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Reads the settings from the query string, both before the hash and after it (`#/look?pid=…`). */
export function parseSettings(location: Pick<Location, 'search' | 'hash'>, nowMs = Date.now()): Settings {
  const params = new URLSearchParams(location.search);
  const hashQuery = location.hash.indexOf('?');
  if (hashQuery >= 0) {
    for (const [key, value] of new URLSearchParams(location.hash.slice(hashQuery + 1))) params.set(key, value);
  }

  let engines: Settings['engines'] = 'auto';
  const enginesParam = params.get('engines');
  if (enginesParam === 'all') {
    engines = [...ENGINE_IDS];
  } else if (enginesParam && enginesParam !== 'auto') {
    const list = enginesParam.split(',').filter((id): id is EngineId => (ENGINE_IDS as readonly string[]).includes(id));
    if (list.length > 0) engines = [...new Set(list)];
  }

  const seedParam = params.get('seed');
  const seedValue = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : null;

  const driftParam = Number(params.get('driftEveryMin'));
  const e2e = params.get('e2e') === '1';
  const speedParam = Number(params.get('speed'));

  const delegateParam = oneOf(params.get('delegate')?.toLowerCase() ?? null, ['cpu', 'gpu'] as const);
  return {
    pid: text(params.get('pid')),
    session: text(params.get('session')),
    preset: oneOf(params.get('preset'), PRESETS) ?? 'standard',
    engines,
    select: params.get('select') === 'auto' ? 'auto' : (oneOf(params.get('select'), ESTIMATORS) ?? 'auto'),
    seed: seedValue ?? nowMs >>> 0,
    seedSource: seedValue === null ? 'clock' : 'query',
    driftEveryMin: params.has('driftEveryMin') && Number.isFinite(driftParam) && driftParam >= 0 ? driftParam : DRIFT.everyMin,
    host: oneOf(params.get('host'), ['worker', 'inline'] as const),
    force: oneOf(params.get('force'), ['cpu'] as const),
    delegate: delegateParam === 'cpu' ? 'CPU' : delegateParam === 'gpu' ? 'GPU' : null,
    e2e,
    speed: e2e && Number.isFinite(speedParam) && speedParam >= 1 ? speedParam : 1,
    setup: oneOf(params.get('setup'), SETUPS),
    sound: params.get('sound') !== '0',
    speech: params.get('speech') === '1',
  };
}

type Listener = (state: Readonly<AppState>) => void;

let current: AppState | null = null;
const listeners = new Set<Listener>();

export function initState(settings: Settings): void {
  current = {
    settings,
    prefs: { ...DEFAULT_PREFS },
    challenge: null,
    clock: { startPerfMs: performance.now(), timeOrigin: performance.timeOrigin, startEpochMs: Date.now() },
    geometry: null,
    runSet: null,
    calibration: null,
    fit: null,
    validation: null,
    estimator: null,
  };
}

export function getState(): Readonly<AppState> {
  if (!current) throw new Error('App state used before initState().');
  return current;
}

export function setState(patch: Partial<AppState>): void {
  current = { ...getState(), ...patch };
  for (const listener of listeners) listener(current);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ----- Preferences on the device (§17.10.3) -------------------------------------------------

/** Where preferences are kept; storage.ts registers IndexedDB, so that this module imports no storage. */
export interface PrefsStore {
  load(): Promise<Record<string, unknown> | null>;
  save(prefs: Record<string, unknown>): Promise<void>;
}

let prefsStore: PrefsStore | null = null;
let prefsWrite: Promise<void> = Promise.resolve();
/** Set once a setting is changed or everything is deleted: a late read must not undo either. */
let prefsTouched = false;

export function setPrefsStore(store: PrefsStore): void {
  prefsStore = store;
}

/** The light or dark roles on the root; the grey stage is never themed (§17.3.1). */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  // The browser's toolbar follows the theme chosen here, not the system's colour scheme.
  const background = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && background) meta.content = background;
}

/**
 * Reads the stored preferences into the state, at most `timeoutMs` late (a browser that never
 * answers keeps the defaults), and puts them into the settings unless the address chose them.
 * Returns the preferences in use.
 */
export async function loadPreferences(fromAddress: ReadonlySet<string>, timeoutMs = 400): Promise<Prefs> {
  let raw: Record<string, unknown> | null = null;
  if (prefsStore) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, timeoutMs);
    });
    const load = prefsStore.load().catch((error: unknown) => (console.warn('Stored preferences could not be read', error), null));
    raw = await Promise.race([load, late]);
    clearTimeout(timer);
    // A late answer still applies unless a setting changed meanwhile; otherwise the next change
    // would store the defaults over the preferences kept on the device.
    if (timedOut) {
      void load.then((stored) => {
        if (stored === null || prefsTouched) return;
        const prefs = normalisePrefs(stored);
        if (!fromAddress.has('theme')) applyTheme(prefs.theme);
        setState({ prefs, settings: settingsFromPrefs(getState().settings, prefs, fromAddress) });
      });
    }
  }
  const prefs = normalisePrefs(raw);
  const state = getState();
  setState({ prefs, settings: settingsFromPrefs(state.settings, prefs, fromAddress) });
  return prefs;
}

/**
 * Changes preferences at once (the theme is applied, the warm-up length and engines reach the
 * settings) and stores them; a write that fails is kept in memory by storage.ts, with a warning.
 */
export function setPrefs(patch: Partial<Prefs>): Promise<void> {
  prefsTouched = true;
  const state = getState();
  const prefs: Prefs = { ...state.prefs, ...patch };
  const settings: Settings = {
    ...state.settings,
    ...(patch.warmup !== undefined ? { preset: patch.warmup } : {}),
    ...(patch.engines !== undefined ? { engines: patch.engines } : {}),
    ...(patch.sound !== undefined ? { sound: patch.sound } : {}),
    ...(patch.speech !== undefined ? { speech: patch.speech } : {}),
    ...(patch.setup !== undefined ? { setup: patch.setup } : {}),
  };
  if (patch.theme !== undefined) applyTheme(patch.theme);
  setState({ prefs, settings });
  const store = prefsStore;
  if (!store) return Promise.resolve();
  const plain = JSON.parse(JSON.stringify(prefs)) as Record<string, unknown>;
  // Writes go in order, so the last change is the one kept.
  prefsWrite = prefsWrite.then(() => store.save(plain)).catch((error: unknown) => console.warn('Preferences could not be stored', error));
  return prefsWrite;
}

// "Delete all my data" sits in the Details sheet's footer (spec §17.2.1). Persistence
// (src/platform/storage.ts) registers the real handler; until then nothing is stored, so there
// is nothing to delete beyond the in-memory session.
type DeleteAllHandler = () => Promise<void>;
let deleteAllHandler: DeleteAllHandler = async () => {};

export function setDeleteAllHandler(handler: DeleteAllHandler): void {
  deleteAllHandler = handler;
}

export async function deleteAllData(): Promise<void> {
  prefsTouched = true;
  await prefsWrite;
  await deleteAllHandler();
  // The stored preferences are gone, so the defaults apply again; the address's choices stay.
  applyTheme(DEFAULT_PREFS.theme);
  setState({ prefs: { ...DEFAULT_PREFS }, challenge: null, geometry: null, runSet: null, calibration: null, fit: null, validation: null, estimator: null });
}
