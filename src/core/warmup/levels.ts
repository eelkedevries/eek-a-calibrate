// The warm-up's level sets (spec §17.6.1, §17.4.4; design §2.7–§2.11, §2.15), DOM-free. The
// levels are the protocol's blocks shown as a game: their items come from the existing
// calibrationSchedule, validationSchedule and the drift module's recalibrationSchedule, with
// layouts, seeds, order and timings unchanged.
//
// - full: Quick = Pop the dots (CAL9), Test round (VAL6); Standard = Pop the dots (CAL13), Follow
//   the firefly (pursuit), Turn your head (HEAD5), Test round (VAL12); Thorough = Standard with
//   "Lean in" (block A′, which re-latches home) before the Test round.
// - restore ("Skip warm-up" with a stored calibration): one Test round on VAL6.
// - quick-warmup (the quick recalibration of §4.13, 016): Pop the dots on RECAL5, Test round on VAL6.
import { recalibrationSchedule } from '../calibration/drift.ts';
import { BLOCK, calibrationSchedule, scheduleBlocks, validationSchedule } from '../protocol/schedule.ts';
import type { Preset, PursuitItem, Schedule, TargetItem } from '../types.ts';

export type LevelKey = 'pop' | 'follow' | 'turn' | 'lean' | 'test';
export type WarmupMode = 'full' | 'restore' | 'quick-warmup';

export interface WarmupLevel {
  key: LevelKey;
  /** 1-based position in the set, and the set's length ("Level 2 of 4"). */
  number: number;
  of: number;
  /** The recording the level's frames go to. */
  recording: 'calibration' | 'validation';
  items: (TargetItem | PursuitItem)[];
  /** Copy keys: name, rule, and the hint's base key (`.phone` or `.webcam` is appended). */
  nameKey: string;
  ruleKey: string;
  hintKey: string;
  /** "Lean in" re-latches home at its start (design §2.11). */
  rehome: boolean;
  /** The pursuit level may be skipped under reduced motion (spec §7, design §2.8). */
  skippable: boolean;
}

export interface WarmupPlan {
  mode: WarmupMode;
  preset: Preset;
  levels: WarmupLevel[];
  /** The calibration (or recalibration) schedule; null for `restore`. */
  calibration: Schedule | null;
  validation: Schedule;
}

export interface WarmupPlanOptions {
  mode: WarmupMode;
  preset: Preset;
  seed: number;
  speed?: number;
  /** The pursuit period for this screen and distance (pursuitPeriodMs), PURSUIT.periodMs by default. */
  pursuitPeriodMs?: number;
  /** The n-th quick recalibration of the session (quick-warmup). */
  recalibration?: number;
  /** prefers-reduced-motion: the pursuit level offers "Skip this level". */
  reducedMotion?: boolean;
}

const BLOCK_LEVEL: Readonly<Record<number, LevelKey>> = {
  [BLOCK.fixation]: 'pop',
  [BLOCK.pursuit]: 'follow',
  [BLOCK.head]: 'turn',
  [BLOCK.closer]: 'lean',
};

function level(key: LevelKey, recording: WarmupLevel['recording'], items: (TargetItem | PursuitItem)[], reducedMotion: boolean): Omit<WarmupLevel, 'number' | 'of'> {
  return {
    key,
    recording,
    items,
    nameKey: `warmup.level.${key}.name`,
    ruleKey: `warmup.level.${key}.rule`,
    hintKey: `warmup.level.${key}.hint`,
    rehome: key === 'lean',
    skippable: key === 'follow' && reducedMotion,
  };
}

function itemsOf(schedule: Schedule): (TargetItem | PursuitItem)[] {
  return schedule.items.filter((i): i is TargetItem | PursuitItem => i.kind !== 'instruction');
}

export function warmupPlan(opts: WarmupPlanOptions): WarmupPlan {
  const speed = opts.speed ?? 1;
  const reduced = opts.reducedMotion ?? false;
  const parts: Omit<WarmupLevel, 'number' | 'of'>[] = [];
  let calibration: Schedule | null = null;
  let validation: Schedule;
  if (opts.mode === 'full') {
    const cal = calibrationSchedule({ preset: opts.preset, seed: opts.seed, speed, ...(opts.pursuitPeriodMs !== undefined ? { pursuitPeriodMs: opts.pursuitPeriodMs } : {}) });
    calibration = cal;
    for (const b of scheduleBlocks(cal)) {
      const key = BLOCK_LEVEL[b.block];
      if (!key) throw new RangeError(`warmupPlan: no level for calibration block ${b.block}`);
      parts.push(level(key, 'calibration', b.items, reduced));
    }
    validation = validationSchedule({ preset: opts.preset, seed: opts.seed, speed });
  } else if (opts.mode === 'quick-warmup') {
    const recal = recalibrationSchedule({ seed: opts.seed, n: opts.recalibration ?? 1, preset: opts.preset, speed });
    calibration = recal;
    parts.push(level('pop', 'calibration', itemsOf(recal), reduced));
    validation = validationSchedule({ preset: 'quick', seed: opts.seed, speed });
  } else {
    validation = validationSchedule({ preset: 'quick', seed: opts.seed, speed });
  }
  parts.push(level('test', 'validation', itemsOf(validation), reduced));
  const of = parts.length;
  return { mode: opts.mode, preset: opts.preset, calibration, validation, levels: parts.map((p, i) => ({ ...p, number: i + 1, of })) };
}

/** The level keys of a full warm-up of each length, as the level track draws them. */
export function levelKeys(preset: Preset): LevelKey[] {
  return warmupPlan({ mode: 'full', preset, seed: 0 }).levels.map((l) => l.key);
}

/**
 * A schedule without the items of a skipped level (the pursuit under reduced motion): the same
 * schedule calibrationSchedule gives with skipPursuit, because the pursuit draws nothing from the
 * seeded generator, so the later blocks keep their order.
 */
export function withoutItems(schedule: Schedule, ids: ReadonlySet<string>, instructions: ReadonlySet<string> = new Set()): Schedule {
  return { ...schedule, items: schedule.items.filter((i) => !ids.has(i.id) && !instructions.has(i.id)) };
}
