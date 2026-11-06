// Persistence (specification §4.15, §17.10.3): IndexedDB `eek-a-calibrate`, version 2, with five
// object stores. `geometry` holds the card or diagonal scale per screen (`screen W×H@dpr`) and the
// blind-spot focal length per camera; `profiles` holds fitted mappings (FitResult) under the
// profile key, at most eight, least recently used out first; `sessions` holds session summaries
// and validation reports, with per-frame features only when the user opts in; `prefs` holds the
// settings of Details → Settings (one record); `scores` holds the best challenge score per zone
// set. Version 2 upgrades version 1 in place: its stores and records are kept. No image or video
// is ever stored.
//
// Where IndexedDB is missing, refuses to open, or a write fails (quota), the data is kept in
// memory for this page instead and a warning is published, so nothing fails silently.
// "Delete all my data" (the footer of the Details sheet) is registered here.
import type { FitResult, Preset, SessionGeometry, ValidationReport } from '../core/types.ts';
import { setDeleteAllHandler, setPrefsStore } from '../app/state.ts';

export const DB_NAME = 'eek-a-calibrate';
export const DB_VERSION = 2;
export const MAX_PROFILES = 8;
/** Some private modes never answer indexedDB.open; after this long the data stays in memory. */
const OPEN_TIMEOUT_MS = 5000;
const DELETE_TIMEOUT_MS = 3000;

export type StoreName = 'geometry' | 'profiles' | 'sessions' | 'prefs' | 'scores';
export const STORES: readonly StoreName[] = ['geometry', 'profiles', 'sessions', 'prefs', 'scores'];
const KEY_PATH: Readonly<Record<StoreName, string>> = { geometry: 'key', profiles: 'key', sessions: 'id', prefs: 'key', scores: 'key' };

/**
 * The stores an upgrade from `oldVersion` creates: every store the database lacks. Existing
 * stores and their records are never touched, so version 1 becomes version 2 in place.
 */
export function upgradePlan(oldVersion: number, existing: readonly string[]): StoreName[] {
  const have = new Set(oldVersion > 0 ? existing : []);
  return STORES.filter((name) => !have.has(name));
}

// ----- Records ----------------------------------------------------------------------------

export interface ScreenScaleRecord {
  kind: 'screen';
  /** `screen|` + screenKey (core/geometry/screen.ts): the long side first, so rotation keeps it. */
  key: string;
  pxPerMm: number;
  source: 'card' | 'diagonal';
  /** The card outline's width in CSS px, or the diagonal in inches. */
  input: number;
  savedAt: number;
}

export interface FocalRecord {
  kind: 'camera';
  /** `camera|<deviceIdHash>|<videoW>x<videoH>`: a focal length in px holds for one frame size only. */
  key: string;
  focalPx: number;
  blindSpotMm: number;
  blindSpotSdMm: number | null;
  irisMedianPx: number;
  savedAt: number;
}

export type GeometryRecord = ScreenScaleRecord | FocalRecord;

export function screenScaleKey(screenKeyText: string): string {
  return `screen|${screenKeyText}`;
}

export function focalKey(cameraHash: string | null, videoW: number, videoH: number): string {
  return `camera|${cameraHash ?? 'unknown'}|${videoW}x${videoH}`;
}

/** The parts of the profile key (§4.15); each engine part is `<engine>@<featureVersion>+<modelSha8>`. */
export interface ProfileKeyParts {
  origin: string;
  /** `<cssW>x<cssH>@<dpr>` of the calibration's viewport. */
  viewport: string;
  cameraHash: string;
  /** `<videoW>x<videoH>` the camera delivered during calibration. */
  video: string;
  /** The fitted engines' parts, in rank order, joined by commas. */
  engines: string;
}

export function profileKey(p: ProfileKeyParts): string {
  return `${p.origin}|${p.viewport}|${p.cameraHash}|${p.video}|${p.engines}`;
}

export interface ProfileRecord {
  key: string;
  parts: ProfileKeyParts;
  savedAt: number;
  lastUsedAt: number;
  participant: string;
  session: string;
  preset: Preset;
  /**
   * The camera's name. Some browsers change device ids between visits, so a stored calibration
   * also matches a camera of the same name and frame size; the required validation decides.
   */
  cameraLabel: string;
  /** The fit without its per-row out-of-fold arrays, which restoring does not need. */
  fit: FitResult;
  /** The validation summary at saving time, for the list on the Data screen. */
  summary: { estimator: string; verdict: string | null; accuracyPctDiag: number | null; accuracyDeg: number | null; degreesApproximate: boolean };
}

export interface SessionRecord {
  id: string;
  savedAt: number;
  updatedAt: number;
  participant: string;
  session: string;
  preset: Preset;
  estimator: string | null;
  geometry: SessionGeometry | null;
  reports: ValidationReport[];
  driftLog: unknown[];
  /** Anything else the summary carries (selection, seeds, engines). */
  summary: unknown;
  /** Per-frame features and labels, kept only when the user opted in. */
  dataset?: unknown;
}

/** The one record of `prefs`: the settings as the app wrote them (app/state.ts checks them on reading). */
export interface PrefsRecord {
  key: typeof PREFS_KEY;
  savedAt: number;
  prefs: Record<string, unknown>;
}

export const PREFS_KEY = 'prefs';

/** The best challenge score of one zone set (§17.9.5): a 1 × 2 board is never compared with a 3 × 2 board. */
export interface ScoreRecord {
  /** `zones|<cols>x<rows>`, with `|<variant>` when the caller keeps scores apart further. */
  key: string;
  cols: number;
  rows: number;
  variant: string | null;
  score: number;
  stars: number;
  /** The round the best score was made in, as the caller names it. */
  round: string | null;
  savedAt: number;
}

export function scoreKey(cols: number, rows: number, variant: string | null = null): string {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) throw new RangeError(`scoreKey: a zone set needs whole columns and rows of at least 1 (got ${cols} × ${rows})`);
  return variant ? `zones|${cols}x${rows}|${variant}` : `zones|${cols}x${rows}`;
}

/** A score replaces the stored best only when it is strictly higher (a tie keeps the earlier one). */
export function beatsBest(best: Pick<ScoreRecord, 'score'> | null, score: number): boolean {
  if (!Number.isFinite(score) || score < 0) return false;
  return best === null || !Number.isFinite(best.score) || score > best.score;
}

// ----- Status -----------------------------------------------------------------------------

export interface StorageStatus {
  /** 'indexeddb' once the database opened; 'memory' after a failure; 'unknown' before first use. */
  mode: 'unknown' | 'indexeddb' | 'memory';
  /** Why something is kept in memory only; null while everything is stored. */
  warning: string | null;
}

let status: StorageStatus = { mode: 'unknown', warning: null };
const statusListeners = new Set<(s: StorageStatus) => void>();
const deletionListeners = new Set<() => void>();

export function storageStatus(): StorageStatus {
  return { ...status };
}

/** Called whenever the status changes (a fallback to memory, say). Returns the unsubscribe. */
export function onStorageStatus(listener: (s: StorageStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** In-memory session data of the screens, cleared by "Delete all my data" as well. */
export function onDataDeleted(listener: () => void): () => void {
  deletionListeners.add(listener);
  return () => deletionListeners.delete(listener);
}

function setStatus(next: StorageStatus): void {
  status = next;
  for (const listener of statusListeners) {
    try {
      listener({ ...status });
    } catch (error) {
      console.error('A storage status listener failed', error);
    }
  }
}

function errorText(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function fallBack(reason: string): void {
  console.warn(`Storage: ${reason}; keeping data in memory for this page only.`);
  setStatus({ mode: 'memory', warning: reason });
}

// ----- IndexedDB plumbing -----------------------------------------------------------------

/** Writes that IndexedDB refused (or every write, without it), read back over the database. */
const memory: Record<StoreName, Map<string, unknown>> = { geometry: new Map(), profiles: new Map(), sessions: new Map(), prefs: new Map(), scores: new Map() };
let dbPromise: Promise<IDBDatabase | null> | null = null;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(t: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null, failure?: string): void => {
      if (settled) {
        db?.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (db) {
        // Another tab deleting or upgrading the database: let it, and reopen on the next use.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        if (status.mode !== 'memory') setStatus({ mode: 'indexeddb', warning: null });
      } else {
        fallBack(failure ?? 'the browser storage could not be opened');
      }
      resolve(db);
    };
    const timer = setTimeout(() => finish(null, 'the browser storage did not answer'), OPEN_TIMEOUT_MS);
    if (typeof indexedDB === 'undefined') {
      finish(null, 'this browser offers no storage (IndexedDB)');
      return;
    }
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      finish(null, `the browser storage is blocked (${errorText(error)})`);
      return;
    }
    open.onupgradeneeded = (event) => {
      const db = open.result;
      for (const name of upgradePlan(event.oldVersion, [...db.objectStoreNames])) db.createObjectStore(name, { keyPath: KEY_PATH[name] });
    };
    open.onsuccess = () => finish(open.result);
    open.onerror = () => finish(null, `the browser storage could not be opened (${errorText(open.error)})`);
  });
  return dbPromise;
}

/**
 * Whether the database exists, without creating it: reading must not leave an empty database on
 * the device of someone who never stores anything. Unknown (true) where the browser cannot list
 * its databases.
 */
async function databaseMayExist(): Promise<boolean> {
  if (dbPromise) return true;
  if (typeof indexedDB === 'undefined') return false;
  const list = (indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> }).databases;
  if (typeof list !== 'function') return true;
  try {
    return (await list.call(indexedDB)).some((d) => d.name === DB_NAME);
  } catch {
    return true;
  }
}

/** The database for reading: null, without creating it, when nothing has been stored yet. */
async function openForRead(): Promise<IDBDatabase | null> {
  return (await databaseMayExist()) ? openDb() : null;
}

function keyOf(store: StoreName, value: unknown): string {
  const key = (value as Record<string, unknown>)[KEY_PATH[store]];
  if (typeof key !== 'string' || key === '') throw new TypeError(`storage: a ${store} record needs a string ${KEY_PATH[store]}`);
  return key;
}

async function put(store: StoreName, value: unknown): Promise<void> {
  const key = keyOf(store, value);
  const db = await openDb();
  if (db) {
    try {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(value);
      await transactionDone(t);
      memory[store].delete(key);
      return;
    } catch (error) {
      fallBack(`a record could not be stored (${errorText(error)})`);
    }
  }
  memory[store].set(key, structuredClone(value));
}

async function getOne<T>(store: StoreName, key: string): Promise<T | null> {
  if (memory[store].has(key)) return structuredClone(memory[store].get(key)) as T;
  const db = await openForRead();
  if (!db) return null;
  try {
    const value = await request(db.transaction(store, 'readonly').objectStore(store).get(key));
    return (value ?? null) as T | null;
  } catch (error) {
    console.warn(`Storage: reading ${store} failed (${errorText(error)})`);
    return null;
  }
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const out = new Map<string, unknown>();
  const db = await openForRead();
  if (db) {
    try {
      for (const value of await request(db.transaction(store, 'readonly').objectStore(store).getAll())) out.set(keyOf(store, value), value);
    } catch (error) {
      console.warn(`Storage: listing ${store} failed (${errorText(error)})`);
    }
  }
  for (const [key, value] of memory[store]) out.set(key, structuredClone(value));
  return [...out.values()] as T[];
}

async function remove(store: StoreName, key: string): Promise<void> {
  memory[store].delete(key);
  const db = await openForRead();
  if (!db) return;
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).delete(key);
  await transactionDone(t);
}

// ----- Geometry ---------------------------------------------------------------------------

export function saveGeometry(record: GeometryRecord): Promise<void> {
  return put('geometry', record);
}

export async function loadScreenScale(screenKeyText: string): Promise<ScreenScaleRecord | null> {
  const r = await getOne<GeometryRecord>('geometry', screenScaleKey(screenKeyText));
  return r && r.kind === 'screen' && Number.isFinite(r.pxPerMm) && r.pxPerMm > 0 ? r : null;
}

export async function loadFocal(cameraHash: string | null, videoW: number, videoH: number): Promise<FocalRecord | null> {
  const r = await getOne<GeometryRecord>('geometry', focalKey(cameraHash, videoW, videoH));
  return r && r.kind === 'camera' && Number.isFinite(r.focalPx) && r.focalPx > 0 ? r : null;
}

// ----- Profiles ---------------------------------------------------------------------------

/** The fit as stored: the per-row out-of-fold predictions and row indices are dropped. */
export function storableFit(fit: FitResult): FitResult {
  const fits: FitResult['fits'] = {};
  for (const [engine, f] of Object.entries(fit.fits)) {
    if (f) fits[engine as keyof FitResult['fits']] = { ...f, oofDeg: [], rowFrameIndex: [] };
  }
  return structuredClone({ ...fit, fits });
}

/** Stores a profile (replacing one with the same key), then keeps the eight most recently used. */
export async function saveProfile(record: ProfileRecord): Promise<void> {
  await put('profiles', { ...record, fit: storableFit(record.fit) });
  const all = await listProfiles();
  for (const old of all.slice(MAX_PROFILES)) await remove('profiles', old.key);
}

/** Every stored profile, most recently used first. */
export async function listProfiles(): Promise<ProfileRecord[]> {
  const all = await getAll<ProfileRecord>('profiles');
  return all.filter((p) => p && typeof p.key === 'string' && p.fit).sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.savedAt - a.savedAt);
}

export function getProfile(key: string): Promise<ProfileRecord | null> {
  return getOne<ProfileRecord>('profiles', key);
}

/** Marks a profile as used now (it then leaves last). */
export async function touchProfile(key: string, nowMs = Date.now()): Promise<void> {
  const p = await getProfile(key);
  if (p) await put('profiles', { ...p, lastUsedAt: nowMs });
}

export function deleteProfile(key: string): Promise<void> {
  return remove('profiles', key);
}

// ----- Sessions ---------------------------------------------------------------------------

export function saveSession(record: SessionRecord): Promise<void> {
  return put('sessions', record);
}

/** Every stored session summary, newest first. */
export async function listSessions(): Promise<SessionRecord[]> {
  const all = await getAll<SessionRecord>('sessions');
  return all.filter((s) => s && typeof s.id === 'string').sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(id: string): Promise<void> {
  return remove('sessions', id);
}

// ----- Preferences ------------------------------------------------------------------------

/** The stored settings, or null when none are stored (reading never creates the database). */
export async function loadPrefs(): Promise<Record<string, unknown> | null> {
  const r = await getOne<PrefsRecord>('prefs', PREFS_KEY);
  return r && typeof r.prefs === 'object' && r.prefs !== null ? r.prefs : null;
}

export function savePrefs(prefs: Record<string, unknown>, nowMs = Date.now()): Promise<void> {
  return put('prefs', { key: PREFS_KEY, savedAt: nowMs, prefs: structuredClone(prefs) } satisfies PrefsRecord);
}

// ----- Best scores ------------------------------------------------------------------------

function validScore(r: unknown): r is ScoreRecord {
  const s = r as ScoreRecord | null;
  return Boolean(s) && typeof s!.key === 'string' && Number.isFinite(s!.score) && Number.isInteger(s!.cols) && Number.isInteger(s!.rows);
}

/** Every stored best score, highest first. */
export async function listScores(): Promise<ScoreRecord[]> {
  return (await getAll<ScoreRecord>('scores')).filter(validScore).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export async function bestScore(cols: number, rows: number, variant: string | null = null): Promise<ScoreRecord | null> {
  const r = await getOne<ScoreRecord>('scores', scoreKey(cols, rows, variant));
  return validScore(r) ? r : null;
}

export interface ScoreEntry {
  cols: number;
  rows: number;
  variant?: string | null;
  score: number;
  stars: number;
  round?: string | null;
}

/** Keeps `entry` when it beats the zone set's best; returns the best after it and whether it is new. */
export async function recordScore(entry: ScoreEntry, nowMs = Date.now()): Promise<{ best: ScoreRecord | null; isNew: boolean }> {
  const variant = entry.variant ?? null;
  const previous = await bestScore(entry.cols, entry.rows, variant);
  if (!beatsBest(previous, entry.score)) return { best: previous, isNew: false };
  const best: ScoreRecord = { key: scoreKey(entry.cols, entry.rows, variant), cols: entry.cols, rows: entry.rows, variant, score: entry.score, stars: entry.stars, round: entry.round ?? null, savedAt: nowMs };
  await put('scores', best);
  return { best, isNew: true };
}

// ----- Delete all -------------------------------------------------------------------------

function deleteDatabase(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    // The stores are already empty; a deletion blocked by another open tab finishes when it closes.
    const timer = setTimeout(resolve, DELETE_TIMEOUT_MS);
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    try {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = done;
      r.onerror = done;
      r.onblocked = done;
    } catch {
      done();
    }
  });
}

/**
 * Empties every store (also data from earlier visits, so the database is opened if needed),
 * closes and deletes the database, forgets what was kept in memory and tells the screens to drop
 * their in-memory session data. Throws when the stores could not be emptied.
 */
export async function deleteAllStoredData(): Promise<void> {
  for (const store of STORES) memory[store].clear();
  let failure: unknown = null;
  const db = await openForRead();
  if (db) {
    try {
      const t = db.transaction([...STORES], 'readwrite');
      for (const store of STORES) t.objectStore(store).clear();
      await transactionDone(t);
    } catch (error) {
      failure = error;
    }
    db.close();
  }
  dbPromise = null;
  await deleteDatabase();
  for (const listener of deletionListeners) {
    try {
      listener();
    } catch (error) {
      console.error('A data-deletion listener failed', error);
    }
  }
  if (failure !== null) {
    const message = `The stored data could not be deleted: ${errorText(failure)}`;
    setStatus({ mode: status.mode, warning: message });
    throw new Error(message);
  }
}

setDeleteAllHandler(deleteAllStoredData);
setPrefsStore({ load: loadPrefs, save: (prefs) => savePrefs(prefs) });
