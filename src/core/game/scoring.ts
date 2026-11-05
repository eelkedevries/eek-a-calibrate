// Points and streaks (spec §17.9.1, design §5.5): a pop is worth 100 plus a speed bonus of
// 50 × (1 − time to pop / lifetime), × 1.5 on every pop after four in a row; a miss or a bonk ends
// the streak; a bonk costs 50, and the score never goes below 0.
import { DECOY, SCORE, TIMING } from './params.ts';

export function speedBonus(timeToPopMs: number, lifetimeMs: number = TIMING.lifetimeMs): number {
  if (!Number.isFinite(timeToPopMs) || !(lifetimeMs > 0)) return 0;
  return SCORE.speedBonus * Math.min(1, Math.max(0, 1 - timeToPopMs / lifetimeMs));
}

/** The streak tag ×1.5 shows, and the next pop is multiplied, after four pops in a row. */
export function streakActive(streak: number): boolean {
  return streak >= SCORE.streakAfter;
}

/** The points of a pop, whole, given the pops in a row before it. */
export function popPoints(timeToPopMs: number, streakBefore: number, lifetimeMs: number = TIMING.lifetimeMs): number {
  const base = SCORE.pop + speedBonus(timeToPopMs, lifetimeMs);
  return Math.round(streakActive(streakBefore) ? SCORE.streakFactor * base : base);
}

/** A bonk: the change actually applied (at most −50, never below 0) and the score after it. */
export function bonk(score: number): { score: number; change: number } {
  const after = Math.max(0, score - DECOY.penalty);
  return { score: after, change: after - score };
}
