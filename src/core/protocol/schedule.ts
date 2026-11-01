// Calibration and validation schedules (specification §4.7, §4.12): blocks of items in a seeded
// order (mulberry32 then Fisher–Yates within each block), with every duration divided by the
// test-mode speed factor.
import { FIXATION, HEAD_BLOCK, PURSUIT, VALIDATION } from '../constants.ts';
import { fisherYates, mulberry32 } from '../maths/rng.ts';
import type { InstructionItem, Preset, PursuitItem, Schedule, ScheduleItem, TargetItem } from '../types.ts';
import { CAL13, CAL9, HEAD5, VAL6, val12, type LayoutPoint } from './layouts.ts';

/** Block numbers, in protocol order: A, B (pursuit), C (head motion), A′ (Thorough, closer). */
export const BLOCK = { fixation: 1, pursuit: 2, head: 3, closer: 4, validation: 1 } as const;

/**
 * Each schedule kind draws from its own generator, mulberry32(seed XOR salt), so that the
 * validation order and jitter do not repeat the calibration's draws. Calibration uses the seed
 * itself.
 */
const STREAM_SALT: Record<Schedule['kind'], number> = {
  calibration: 0,
  validation: 0x56414c31,
  drift: 0x44524654,
  recalibration: 0x52434c35,
};

export function streamSeed(seed: number, kind: Schedule['kind']): number {
  if (!Number.isInteger(seed)) throw new RangeError(`streamSeed: the seed must be an integer, got ${seed}`);
  return (seed ^ STREAM_SALT[kind]) >>> 0;
}

function checkSpeed(speed: number): number {
  if (!(Number.isFinite(speed) && speed >= 1)) throw new RangeError(`schedule: the speed factor must be ≥ 1, got ${speed}`);
  return speed;
}

/** The fewest accepted frames a fixation item needs: 12, or max(3, ⌈12/N⌉) at speed N. */
export function minAcceptedFrames(speed = 1): number {
  checkSpeed(speed);
  return speed === 1 ? FIXATION.minFrames : Math.max(3, Math.ceil(FIXATION.minFrames / speed));
}

function instruction(id: string, textKey: string): InstructionItem {
  return { kind: 'instruction', id, textKey };
}

function target(prefix: string, p: LayoutPoint, phase: TargetItem['phase'], block: number, ms: { settle: number; sample: number; max: number }, speed: number, headMotion = false): TargetItem {
  const item: TargetItem = {
    kind: 'target',
    id: `${prefix}-${p.groupId}`,
    phase,
    block,
    xNorm: p.xNorm,
    yNorm: p.yNorm,
    groupId: p.groupId,
    settleMs: ms.settle / speed,
    sampleMs: ms.sample / speed,
    maxSampleMs: ms.max / speed,
  };
  if (headMotion) item.headMotion = true;
  return item;
}

const FIX_MS = { settle: FIXATION.settleMs, sample: FIXATION.sampleMs, max: FIXATION.maxSampleMs };
const HEAD_MS = { settle: HEAD_BLOCK.settleMs, sample: HEAD_BLOCK.yawMs + HEAD_BLOCK.pitchMs, max: HEAD_BLOCK.maxMs };
const VAL_MS = { settle: VALIDATION.settleMs, sample: VALIDATION.sampleMs, max: VALIDATION.sampleMs };

export interface CalibrationScheduleOptions {
  preset: Preset;
  seed: number;
  /** Test-mode speed factor N ≥ 1 (`?e2e=1&speed=N`). */
  speed?: number;
  /** The real-time pursuit period from `pursuitPeriodMs`; PURSUIT.periodMs by default. */
  pursuitPeriodMs?: number;
  /** Leaves out the pursuit block (prefers-reduced-motion, §7). */
  skipPursuit?: boolean;
}

/**
 * The calibration schedule of a preset. Quick: CAL9. Standard: CAL13, the pursuit, HEAD5.
 * Thorough: Standard, then CAL13 again after the "lean closer" card, with the same group ids.
 * Each block starts with its instruction card. Shuffles are drawn in block order.
 */
export function calibrationSchedule(opts: CalibrationScheduleOptions): Schedule {
  const speed = checkSpeed(opts.speed ?? 1);
  const rand = mulberry32(streamSeed(opts.seed, 'calibration'));
  const items: ScheduleItem[] = [];
  const shuffled = (points: readonly LayoutPoint[]) => fisherYates([...points], rand);

  const fixation = opts.preset === 'quick' ? CAL9 : CAL13;
  items.push(instruction('I-fixation', 'protocol.instr.fixation'));
  for (const p of shuffled(fixation)) items.push(target('A', p, 'fixation', BLOCK.fixation, FIX_MS, speed));
  if (opts.preset === 'quick') return { seed: opts.seed >>> 0, preset: opts.preset, kind: 'calibration', items };

  if (!opts.skipPursuit) {
    const periodMs = opts.pursuitPeriodMs ?? PURSUIT.periodMs;
    if (!(Number.isFinite(periodMs) && periodMs >= PURSUIT.periodMs)) throw new RangeError(`calibrationSchedule: invalid pursuit period ${periodMs}`);
    items.push(instruction('I-pursuit', 'protocol.instr.pursuit'));
    const pursuit: PursuitItem = {
      kind: 'pursuit',
      id: 'B-pursuit',
      phase: 'pursuit',
      block: BLOCK.pursuit,
      periodMs: periodMs / speed,
      holdMs: PURSUIT.holdMs / speed,
      discardMs: PURSUIT.discardMs / speed,
      ax: PURSUIT.ax,
      ay: PURSUIT.ay,
      phiX: PURSUIT.phiX,
      phiY: PURSUIT.phiY,
    };
    items.push(pursuit);
  }

  items.push(instruction('I-head', 'protocol.instr.head'));
  for (const p of shuffled(HEAD5)) items.push(target('C', p, 'head', BLOCK.head, HEAD_MS, speed, true));

  if (opts.preset === 'thorough') {
    items.push(instruction('I-closer', 'protocol.instr.closer'));
    for (const p of shuffled(CAL13)) items.push(target('D', p, 'fixation', BLOCK.closer, FIX_MS, speed));
  }
  return { seed: opts.seed >>> 0, preset: opts.preset, kind: 'calibration', items };
}

/**
 * The validation schedule (§4.12): VAL12 (Standard, Thorough; jittered, then shuffled) or VAL6
 * (Quick; shuffled), settle 600 ms and sample 1000 ms, no retries and no extension.
 */
export function validationSchedule(opts: { preset: Preset; seed: number; speed?: number }): Schedule {
  const speed = checkSpeed(opts.speed ?? 1);
  const rand = mulberry32(streamSeed(opts.seed, 'validation'));
  const points = opts.preset === 'quick' ? [...VAL6] : val12(rand);
  const items: ScheduleItem[] = [instruction('I-validation', 'protocol.instr.validation')];
  for (const p of fisherYates(points, rand)) items.push(target('V', p, 'validation', BLOCK.validation, VAL_MS, speed));
  return { seed: opts.seed >>> 0, preset: opts.preset, kind: 'validation', items };
}

/** The blocks of a schedule in order: consecutive non-instruction items with the same block number. */
export function scheduleBlocks(schedule: Schedule): { block: number; instruction: InstructionItem | null; items: (TargetItem | PursuitItem)[] }[] {
  const out: { block: number; instruction: InstructionItem | null; items: (TargetItem | PursuitItem)[] }[] = [];
  let pending: InstructionItem | null = null;
  for (const item of schedule.items) {
    if (item.kind === 'instruction') {
      pending = item;
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.block === item.block && pending === null) last.items.push(item);
    else out.push({ block: item.block, instruction: pending, items: [item] });
    pending = null;
  }
  return out;
}
