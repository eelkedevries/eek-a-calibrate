// What the set-up learned (spec §7 row 1, §17.4.5): the device class and capabilities, the camera
// and vision host in use, the engines' status, and the device probe with its run set. Get ready
// records them; session.json (Details → Data) and Details → Device read them.
import { PROBE } from '../../core/constants.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId } from '../../core/types.ts';
import { detectCapabilities, detectDeviceClass, type CapabilityReport, type DeviceClass } from '../../platform/capabilities.ts';
import type { ProfileRecord } from '../../platform/storage.ts';
import type { ProbeResult } from '../../vision/protocol.ts';
import type { Capture } from '../session.ts';

export type Eyewear = 'none' | 'glasses' | 'contacts' | 'undisclosed';

/** What the setup learned, kept for session.json (export) and for later screens. */
export interface SetupRecord {
  eyewear: Eyewear | null;
  deviceClass: DeviceClass | null;
  capabilities: CapabilityReport | null;
  probe: ProbeResult | null;
  runSet: RunSetDecision | null;
  camera: { label: string; deviceIdHash: string | null; width: number; height: number; frameRate: number | null; ladder: string; rung: number } | null;
  host: { kind: 'worker' | 'inline'; reason: string; delegate: 'GPU' | 'CPU' | null; wasmVariant: string | null; initMs: number | null; restarts: number } | null;
  engines: { id: EngineId; ok: boolean; backend: string | null; reason: string | null; loadMs: number | null }[];
}

const record: SetupRecord = { eyewear: null, deviceClass: null, capabilities: null, probe: null, runSet: null, camera: null, host: null, engines: [] };

export function setupRecord(): Readonly<SetupRecord> {
  return record;
}

/** Records the device probe and its run set when Get ready runs them (spec §17.4.5). */
export function recordProbe(probe: ProbeResult, decision: RunSetDecision): void {
  record.probe = probe;
  record.runSet = decision;
}

/** Copies what the export needs to know about the running camera and vision host. */
export function snapshotCapture(c: Capture): void {
  const info = c.camera.info;
  const s = c.camera.settings;
  record.camera = { label: info.label, deviceIdHash: info.deviceIdHash, width: s.width || info.width, height: s.height || info.height, frameRate: s.frameRate ?? info.frameRate, ladder: info.ladder, rung: info.rung };
  const hi = c.host.info;
  record.host = { kind: c.host.kind, reason: c.host.selection.reason, delegate: hi?.delegate ?? null, wasmVariant: hi?.wasmVariant ?? null, initMs: hi?.initMs ?? null, restarts: c.host.stats().restarts };
  record.engines = c.status.map((e) => ({ id: e.id, ok: e.ok, backend: e.backend ?? null, reason: e.reason ?? null, loadMs: e.loadMs ?? null }));
  record.deviceClass ??= detectDeviceClass();
  record.capabilities ??= detectCapabilities();
}

export interface RunSetDecision {
  runSet: EngineId[];
  dropped: { engine: EngineId; reason: 'budget' | 'total' | 'no-data'; p50Ms: number }[];
  /** landmarker + preparation + the run set's engines (p50s), ms. */
  totalP50Ms: number;
  /** The total exceeds the warning threshold (66 ms; 80 ms on mobile). */
  warn: boolean;
  warnMs: number;
  /** False when the engines were chosen by hand and only reported on. */
  applied: boolean;
}

const LEARNED: readonly EngineId[] = ['blazegaze', 'peekr'];

function p50Of(probe: ProbeResult, e: EngineId): number {
  const r = probe.engines[e];
  return r && r.okFrames > 0 && Number.isFinite(r.p50Ms) ? r.p50Ms : Number.NaN;
}

function totalOf(probe: ProbeResult, set: readonly EngineId[]): number {
  return probe.landmarkerP50Ms + probe.prepP50Ms + set.reduce((s, e) => s + (Number.isFinite(p50Of(probe, e)) ? p50Of(probe, e) : 0), 0);
}

/**
 * The run set (§7 row 1): each learned engine is kept if its p50 is within its budget
 * (BlazeGaze 25 ms, Peekr 15 ms); then, while the total p50 (landmarker + preparation + engines)
 * exceeds 45 ms, the slowest learned engine is dropped. Geometric and eye-pixel are never timed
 * out (eye-pixel only when it loaded). `candidates` are the engines that loaded. With `applyRule`
 * false (engines chosen by hand) the candidates are kept and the timings only reported.
 */
export function decideRunSet(probe: ProbeResult, candidates: readonly EngineId[], warnMs: number, applyRule = true): RunSetDecision {
  const dropped: RunSetDecision['dropped'] = [];
  let set: EngineId[];
  if (!applyRule) {
    set = ENGINE_IDS.filter((e) => candidates.includes(e) || e === 'geometric');
  } else {
    set = ENGINE_IDS.filter((e) => !LEARNED.includes(e) && (candidates.includes(e) || e === 'geometric'));
    for (const e of LEARNED) {
      if (!candidates.includes(e)) continue;
      const p50 = p50Of(probe, e);
      if (!Number.isFinite(p50)) dropped.push({ engine: e, reason: 'no-data', p50Ms: p50 });
      else if (p50 > PROBE.budgetMs[e as keyof typeof PROBE.budgetMs]) dropped.push({ engine: e, reason: 'budget', p50Ms: p50 });
      else set.push(e);
    }
    for (;;) {
      const total = totalOf(probe, set);
      const learned = set.filter((e) => LEARNED.includes(e));
      if (!(total > PROBE.totalMs) || learned.length === 0) break;
      const slowest = learned.reduce((a, b) => (p50Of(probe, b) > p50Of(probe, a) ? b : a));
      set = set.filter((e) => e !== slowest);
      dropped.push({ engine: slowest, reason: 'total', p50Ms: p50Of(probe, slowest) });
    }
    set = ENGINE_IDS.filter((e) => set.includes(e));
  }
  const totalP50Ms = totalOf(probe, set);
  return { runSet: set, dropped, totalP50Ms, warn: totalP50Ms > warnMs, warnMs, applied: applyRule };
}

/**
 * The profile-key parts that are known before calibrating: origin, camera (by id, or by name where
 * the browser changed the id), video size, pixel ratio and orientation.
 */
export function matchesCurrentSetup(p: ProfileRecord, c: Capture): boolean {
  const s = c.camera.settings;
  const [size, dpr] = p.parts.viewport.split('@');
  const [w, hgt] = (size ?? '').split('x').map(Number);
  const portraitNow = window.innerHeight >= window.innerWidth;
  const camera = p.parts.cameraHash === (c.camera.info.deviceIdHash ?? 'unknown') || (Boolean(p.cameraLabel) && p.cameraLabel === c.camera.info.label);
  return (
    p.parts.origin === location.origin &&
    camera &&
    p.parts.video === `${s.width}x${s.height}` &&
    Number(dpr) === window.devicePixelRatio &&
    Number.isFinite(w) &&
    Number.isFinite(hgt) &&
    (hgt as number) >= (w as number) === portraitNow
  );
}
