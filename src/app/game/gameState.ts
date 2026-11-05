// The game's state across routes (spec §17.2.4, §17.6, §17.7): the presentation span started by
// Get ready's "Start warm-up" and kept through the warm-up, Warm-up complete, Free look and the
// challenge; the warm-up's mode (full, restore after "Skip warm-up", or the quick warm-up of
// §17.8.3); the levels played with their pauses; the quick recalibrations; and each Warm-up
// complete result (zones, stars, marks, cause). *home* stays in session.ts, where Get ready
// latches it. Nothing here is stored on the device.
import type { Mark } from '../../core/warmup/marks.ts';
import type { Cause } from '../../core/warmup/cause.ts';
import type { LevelKey, WarmupMode } from '../../core/warmup/levels.ts';
import type { Steadiness } from '../../core/warmup/steadiness.ts';
import type { Outcome, Verdict } from '../../core/warmup/stars.ts';
import type { EstimatorId, Preset, Recording, ScreenGeometry } from '../../core/types.ts';
import { exitFullscreen, fullscreenElement } from '../../platform/fullscreen.ts';
import { startPresentation, type Presentation } from '../../platform/presentation.ts';
import { setWarmupMode as setSessionWarmup, warmupMode as sessionWarmup } from '../session.ts';
import { registerTestHook } from '../testHooks.ts';

export type { WarmupMode };

// ----- The presentation span (spec §17.2.4) -------------------------------------------------------

/** The routes inside the span; leaving them ends it. */
const SPAN_PATHS = new Set(['/warmup', '/complete', '/look', '/challenge']);

let current: { handle: Presentation; el: HTMLElement } | null = null;
/** The element of a span ended with its fullscreen kept (releaseSpan, or startSpan until its new handle exists). */
let released: HTMLElement | null = null;
let watching = false;

function routePath(): string {
  const raw = location.hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  return q >= 0 ? raw.slice(0, q) : raw;
}

function watchRoutes(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('hashchange', () => {
    if (!SPAN_PATHS.has(routePath())) void endSpan();
  });
}

/**
 * Starts the span on `el` (the game shell, so that every screen inside it renders into the
 * fullscreen element): element fullscreen, or viewport mode on iPhone and in test mode. Call it
 * inside the tap that starts the warm-up, before any other await: fullscreen needs the gesture.
 * A span already running is replaced (its fullscreen kept, so no new request is made).
 */
export function startSpan(el: HTMLElement, scale?: { pxPerMm: number; pxPerMmSource: ScreenGeometry['pxPerMmSource'] }): Promise<Presentation> {
  watchRoutes();
  const old = current;
  current = null;
  // Until the new handle exists, endSpan still leaves the fullscreen the old one kept.
  if (old) released = old.el;
  // end() restores the element's style synchronously, before the new handle styles it again.
  if (old) void old.handle.end({ keepFullscreen: true });
  return startPresentation(el, { mode: 'auto', ...(scale ? { scale } : {}) }).then((handle) => {
    current = { handle, el };
    released = null;
    return handle;
  });
}

/** The running span, or null (never started, ended, or the page reloaded inside it). */
export function span(): Presentation | null {
  return current?.handle ?? null;
}

/** The element the span presents (the game shell). */
export function spanElement(): HTMLElement | null {
  return current?.el ?? null;
}

/**
 * Lets go of an invalidated span but keeps fullscreen, so that the screen lays out in the new
 * viewport at once; "Warm up again" starts the next one from its tap.
 */
export function releaseSpan(): void {
  const old = current;
  current = null;
  if (old) released = old.el;
  void old?.handle.end({ keepFullscreen: true });
}

/**
 * Ends the span: fullscreen is left, the element's style restored. A handle that took over
 * fullscreen from an earlier one (startSpan, or releaseSpan then startSpan) did not enter it and
 * would not leave it, so fullscreen on the span's element is left here.
 */
export async function endSpan(): Promise<void> {
  const old = current;
  const el = old?.el ?? released;
  current = null;
  released = null;
  await old?.handle.end();
  const fs = fullscreenElement();
  if (el && fs && (fs === el || fs.contains(el))) await exitFullscreen();
}

// ----- The warm-up's mode -------------------------------------------------------------------------

let quick: { n: number } | null = null;

/** full, restore ("Skip warm-up", set on the Title) or quick-warmup (016). */
export function warmupMode(): WarmupMode {
  return quick ? 'quick-warmup' : sessionWarmup();
}

export function setWarmupMode(mode: WarmupMode, recalibration = 1): void {
  quick = mode === 'quick-warmup' ? { n: recalibration } : null;
  if (mode !== 'quick-warmup') setSessionWarmup(mode);
}

/** The quick recalibration's number in this session (quick-warmup). */
export function recalibrationNumber(): number {
  return quick?.n ?? recalibrations.length + 1;
}

/** Quick-recalibration recordings of the current fit's lineage (§4.13), fitted at weight ×2. */
let recalibrations: Recording[] = [];

export function quickRecalibrations(): readonly Recording[] {
  return recalibrations;
}

export function addQuickRecalibration(rec: Recording): void {
  recalibrations = [...recalibrations, rec];
}

/** A new full warm-up starts a new lineage. */
export function clearQuickRecalibrations(): void {
  recalibrations = [];
}

// ----- The levels played and the results ------------------------------------------------------

export interface LevelPause {
  reason: 'out' | 'face-lost' | 'manual' | 'hidden';
  atMs: number;
}

/** One level as played: for the steadiness line and, from 016, session.json (§17.10). */
export interface LevelRecord {
  key: LevelKey;
  number: number;
  of: number;
  pauses: LevelPause[];
  steadiness: Steadiness | null;
  skipped: boolean;
  retried: number;
}

export interface WarmupResult {
  mode: WarmupMode;
  preset: Preset;
  /** The level keys of the set played, in order. */
  levels: LevelKey[];
  estimator: EstimatorId;
  verdict: Verdict;
  zones: { cols: number; rows: number };
  needDeg: number;
  stars: number;
  outcome: Outcome;
  cause: Cause | null;
  marks: Mark[];
  /** The Test round's viewport, CSS px, for the zone map's proportions. */
  viewport: { w: number; h: number };
  /** "Skip warm-up" below acceptable: the stored calibration is not used (§17.4.4). */
  restoreRejected: boolean;
  log: LevelRecord[];
  atMs: number;
}

let result: WarmupResult | null = null;
const history: WarmupResult[] = [];

export function setWarmupResult(r: WarmupResult): void {
  result = r;
  history.push(r);
}

/** The latest Warm-up complete result, or null before a scored Test round. */
export function warmupResult(): WarmupResult | null {
  return result;
}

/** Every Warm-up complete of this page load, in order (016 exports them). */
export function warmupHistory(): readonly WarmupResult[] {
  return history;
}

// `__eek.result()`: the latest Warm-up complete in test mode (zones, stars, marks, cause, outcome).
registerTestHook('result', () => (result ? structuredClone(result) : null));

/** A new warm-up replaces the result until its own Test round is scored. */
export function clearWarmupResult(): void {
  result = null;
}

// ----- The pilot's target (spec §17.2.5, §17.12) ----------------------------------------------

/** `?target=ring` keeps the §4.7 ring instead of the bubble (the pilot only). */
export function targetStyle(): 'bubble' | 'ring' {
  const params = new URLSearchParams(location.search);
  const q = location.hash.indexOf('?');
  if (q >= 0) for (const [k, v] of new URLSearchParams(location.hash.slice(q + 1))) params.set(k, v);
  return params.get('target') === 'ring' ? 'ring' : 'bubble';
}
