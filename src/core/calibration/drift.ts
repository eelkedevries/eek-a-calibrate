// Drift check and quick recalibration (specification §4.13). A drift check shows the centre and
// one seeded VAL12 location (settle 500 ms, sample 1000 ms each) and measures the offset
// o = mean over the two targets of (Ḡ − T), in degrees, from the raw (uncorrected) predictions.
// When |o| ≤ max(2°, 1.5 × validation accuracy) a translation correction is applied; otherwise a
// quick recalibration (RECAL5, rows ×2, refit) and a VAL6 revalidation are prompted.
//
// Sign. §4.10 adds the drift offset to the raw θ, so the correction that brings the mean gaze Ḡ
// onto the target T is T − Ḡ = −o. The log keeps o itself (DriftLogEntry.offsetDeg); the value
// added to θ, exported as drift_x_deg and drift_y_deg, is `correctionDeg` = −o.
import { DRIFT, FIXATION } from '../constants.ts';
import { fisherYates, mulberry32 } from '../maths/rng.ts';
import { RECAL5, val12, type LayoutPoint } from '../protocol/layouts.ts';
import { streamSeed } from '../protocol/schedule.ts';
import type { EngineId, Preset, Schedule, ScheduleItem, TargetItem, ValidationReport, Vec2 } from '../types.ts';

/** Instruction cards of the two schedules (keys in strings.en-GB.ts). */
export const DRIFT_INSTRUCTION_KEY = 'drift.instr.check';
export const RECALIBRATION_INSTRUCTION_KEY = 'drift.instr.recalibrate';

/** The group of the centre target of a drift check (it is not a VAL12 location). */
export const DRIFT_CENTRE_GROUP = 'drift-centre';

const GOLDEN = 0x9e3779b9;

function checkSpeed(speed: number): number {
  if (!(Number.isFinite(speed) && speed >= 1)) throw new RangeError(`drift: the speed factor must be ≥ 1, got ${speed}`);
  return speed;
}

function checkCount(name: string, n: number): void {
  if (!(Number.isSafeInteger(n) && n >= 1)) throw new RangeError(`drift: ${name} must be a positive integer, got ${n}`);
}

/**
 * The generator seed of the n-th schedule of a kind: the kind's stream seed (schedule.ts), moved
 * on by n − 1 golden-ratio steps, so that successive checks show different locations while the
 * first one uses the stream seed itself.
 */
export function nthStreamSeed(seed: number, kind: 'drift' | 'recalibration', n: number): number {
  checkCount('n', n);
  return (streamSeed(seed, kind) + Math.imul(n - 1, GOLDEN)) >>> 0;
}

function target(id: string, p: LayoutPoint, phase: TargetItem['phase'], ms: { settle: number; sample: number; max: number }, speed: number): TargetItem {
  return {
    kind: 'target',
    id,
    phase,
    block: 1,
    xNorm: p.xNorm,
    yNorm: p.yNorm,
    groupId: p.groupId,
    settleMs: ms.settle / speed,
    sampleMs: ms.sample / speed,
    maxSampleMs: ms.max / speed,
  };
}

/**
 * The n-th drift check of a session: an instruction card, then the centre and one VAL12
 * location (jittered as VAL12 is), both drawn from the drift stream, in a seeded order. Settle
 * 500 ms, sample 1000 ms, divided by the test-mode speed factor. Item ids are `D<n>-<group>`.
 */
export function driftSchedule(opts: { seed: number; check: number; preset: Preset; speed?: number }): Schedule {
  const speed = checkSpeed(opts.speed ?? 1);
  const rand = mulberry32(nthStreamSeed(opts.seed, 'drift', opts.check));
  const layout = val12(rand);
  const other = layout[Math.min(layout.length - 1, Math.floor(rand() * layout.length))] as LayoutPoint;
  const centre: LayoutPoint = { xNorm: 0.5, yNorm: 0.5, groupId: DRIFT_CENTRE_GROUP };
  const ms = { settle: DRIFT.settleMs, sample: DRIFT.sampleMs, max: DRIFT.sampleMs };
  const items: ScheduleItem[] = [{ kind: 'instruction', id: `I-drift-${opts.check}`, textKey: DRIFT_INSTRUCTION_KEY }];
  for (const p of fisherYates([centre, other], rand)) items.push(target(`D${opts.check}-${p.groupId}`, p, 'drift', ms, speed));
  return { seed: opts.seed >>> 0, preset: opts.preset, kind: 'drift', items };
}

/**
 * The n-th quick recalibration: RECAL5 (the centre and {0.29, 0.71}²) under the fixation rules
 * (settle 600 ms, sample 1000 ms, extended up to 2500 ms), in a seeded order. The labels are
 * fixation labels, so the rows enter the fit; the dataset gives them weight ×2 and the group of
 * the nearest calibration location because the schedule kind is 'recalibration'.
 */
export function recalibrationSchedule(opts: { seed: number; n: number; preset: Preset; speed?: number }): Schedule {
  const speed = checkSpeed(opts.speed ?? 1);
  const rand = mulberry32(nthStreamSeed(opts.seed, 'recalibration', opts.n));
  const ms = { settle: FIXATION.settleMs, sample: FIXATION.sampleMs, max: FIXATION.maxSampleMs };
  const items: ScheduleItem[] = [{ kind: 'instruction', id: `I-recal-${opts.n}`, textKey: RECALIBRATION_INSTRUCTION_KEY }];
  for (const p of fisherYates([...RECAL5], rand)) items.push(target(`R${opts.n}-${p.groupId}`, p, 'fixation', ms, speed));
  return { seed: opts.seed >>> 0, preset: opts.preset, kind: 'recalibration', items };
}

export interface DriftMeasurement {
  /** o = mean over the targets of (Ḡ − T), internal degrees (y down); null when it cannot be measured. */
  offsetDeg: Vec2 | null;
  /** Each target's Ḡ − T, in schedule order of the report. */
  perTargetDeg: Vec2[];
  /** 'no-data' when a target had no valid sample, or the report has no target. */
  reason: 'ok' | 'no-data';
}

const finiteVec = (v: Vec2): boolean => Number.isFinite(v[0]) && Number.isFinite(v[1]);

/**
 * The drift offset from a drift check's report (scoreValidation on the check's recording, which
 * uses raw predictions). Every target must have been measured: an offset from one target alone
 * would mix a translation with the local error at that location.
 */
export function driftOffset(report: Pick<ValidationReport, 'targets'>): DriftMeasurement {
  const perTargetDeg = report.targets.map((t) => t.offsetDeg);
  if (perTargetDeg.length === 0 || !perTargetDeg.every(finiteVec)) return { offsetDeg: null, perTargetDeg, reason: 'no-data' };
  const n = perTargetDeg.length;
  const sx = perTargetDeg.reduce((s, v) => s + v[0], 0);
  const sy = perTargetDeg.reduce((s, v) => s + v[1], 0);
  return { offsetDeg: [sx / n, sy / n], perTargetDeg, reason: 'ok' };
}

/** max(2°, 1.5 × validation accuracy); 2° when there is no finite validation accuracy. */
export function driftLimitDeg(validationAccuracyDeg: number): number {
  const scaled = Number.isFinite(validationAccuracyDeg) && validationAccuracyDeg > 0 ? DRIFT.applyAccFactor * validationAccuracyDeg : 0;
  return Math.max(DRIFT.applyMinDeg, scaled);
}

export interface DriftDecision {
  action: 'apply' | 'recalibrate';
  /** |o|, degrees. */
  magnitudeDeg: number;
  limitDeg: number;
  /** The translation added to θ when applied: −o. */
  correctionDeg: Vec2;
}

/** Apply the correction when |o| ≤ max(2°, 1.5 × validation accuracy), else recalibrate (§4.13). */
export function driftDecision(offsetDeg: Vec2, validationAccuracyDeg: number): DriftDecision {
  if (!finiteVec(offsetDeg)) throw new RangeError('driftDecision: the offset must be finite');
  const magnitudeDeg = Math.hypot(offsetDeg[0], offsetDeg[1]);
  const limitDeg = driftLimitDeg(validationAccuracyDeg);
  return {
    action: magnitudeDeg <= limitDeg ? 'apply' : 'recalibrate',
    magnitudeDeg,
    limitDeg,
    correctionDeg: [offsetDeg[0] === 0 ? 0 : -offsetDeg[0], offsetDeg[1] === 0 ? 0 : -offsetDeg[1]],
  };
}

/** When the next timed drift prompt is due: `everyMin` minutes after the last check; never when 0. */
export function nextDriftDueMs(lastCheckMs: number, everyMin: number): number {
  if (!Number.isFinite(lastCheckMs)) throw new RangeError(`nextDriftDueMs: non-finite time ${lastCheckMs}`);
  if (!(Number.isFinite(everyMin) && everyMin >= 0)) throw new RangeError(`nextDriftDueMs: invalid interval ${everyMin}`);
  return everyMin === 0 ? Number.POSITIVE_INFINITY : lastCheckMs + everyMin * 60_000;
}

/** What a forced drift check compares (§4.13): the camera, the layout, the backends and the host. */
export interface DriftContext {
  videoW: number;
  videoH: number;
  frameRate: number | null;
  deviceIdHash: string | null;
  viewportWpx: number;
  viewportHpx: number;
  dpr: number;
  hostKind: 'worker' | 'inline';
  delegate: 'GPU' | 'CPU' | null;
  backends: Partial<Record<EngineId, string>>;
  workerRestarts: number;
}

export type DriftForceReason = 'camera' | 'viewport' | 'backend' | 'worker' | 'restore';

/** Frame rates within this many frames per second are the same (the camera module's tolerance). */
const FPS_TOLERANCE = 0.5;
/** Viewport sizes within this many CSS px are the same (browsers report fractional sizes). */
const SIZE_TOLERANCE_PX = 0.5;

/**
 * The reasons a drift check is forced between two contexts, in a fixed order: a camera or
 * resolution change, a viewport or pixel-ratio change, a backend or delegate change (including a
 * change of vision host), and a worker restart. Restoring a stored calibration is the caller's.
 */
export function forcedDriftReasons(before: DriftContext, now: DriftContext): DriftForceReason[] {
  const out: DriftForceReason[] = [];
  const fpsChanged = before.frameRate !== null && now.frameRate !== null && Math.abs(before.frameRate - now.frameRate) > FPS_TOLERANCE;
  if (before.videoW !== now.videoW || before.videoH !== now.videoH || before.deviceIdHash !== now.deviceIdHash || fpsChanged) out.push('camera');
  if (Math.abs(before.viewportWpx - now.viewportWpx) > SIZE_TOLERANCE_PX || Math.abs(before.viewportHpx - now.viewportHpx) > SIZE_TOLERANCE_PX || before.dpr !== now.dpr) {
    out.push('viewport');
  }
  const engines = new Set([...Object.keys(before.backends), ...Object.keys(now.backends)]) as Set<EngineId>;
  const backendChanged = [...engines].some((e) => before.backends[e] !== now.backends[e]);
  if (before.hostKind !== now.hostKind || before.delegate !== now.delegate || backendChanged) out.push('backend');
  if (now.workerRestarts > before.workerRestarts) out.push('worker');
  return out;
}
