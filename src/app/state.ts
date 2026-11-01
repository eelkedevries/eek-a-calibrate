// App state: the settings pre-filled from the query string (spec §7) and the
// session's results as they arrive. Leaving mid-flow is allowed; everything a
// screen needs from an earlier one lives here.
import { DRIFT } from '../core/constants.ts';
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
  /** Minutes between timed drift prompts in Live; 0 turns them off. */
  driftEveryMin: number;
  host: 'worker' | 'inline' | null;
  force: 'cpu' | null;
  /** Test mode (`e2e=1`): read-only `window.__eek`, injected geometry, no fullscreen. */
  e2e: boolean;
  /** Divides every protocol duration; honoured only in test mode. */
  speed: number;
}

export interface SessionClock {
  /** Main-thread `performance.now()` at session start; every timestamp shares this domain (spec §4.1). */
  startPerfMs: number;
  timeOrigin: number;
  startEpochMs: number;
}

export interface AppState {
  settings: Settings;
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

/** Reads the settings from the query string, both before the hash and after it (`#/live?pid=…`). */
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
    e2e,
    speed: e2e && Number.isFinite(speedParam) && speedParam >= 1 ? speedParam : 1,
  };
}

type Listener = (state: Readonly<AppState>) => void;

let current: AppState | null = null;
const listeners = new Set<Listener>();

export function initState(settings: Settings): void {
  current = {
    settings,
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

// "Delete all my data" sits in every screen's footer (spec §4.15). Persistence
// (WP9, src/platform/storage.ts) registers the real handler; until then nothing
// is stored, so there is nothing to delete beyond the in-memory session.
type DeleteAllHandler = () => Promise<void>;
let deleteAllHandler: DeleteAllHandler = async () => {};

export function setDeleteAllHandler(handler: DeleteAllHandler): void {
  deleteAllHandler = handler;
}

export async function deleteAllData(): Promise<void> {
  await deleteAllHandler();
  setState({ geometry: null, runSet: null, calibration: null, fit: null, validation: null, estimator: null });
}
