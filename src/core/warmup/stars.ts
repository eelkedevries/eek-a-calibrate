// Stars and the outcome of a warm-up (spec §17.7.3, §17.7.6; design §2.12), heuristic and shown
// under "Rule of thumb": the verdict of §4.12 (VERDICT, Appendix A) gives 3, 2 or 1 stars, and
// "not tracking" or fewer than two zones give none. The outcome picks the headline, sentence, tip
// and actions of Warm-up complete.
import type { ValidationReport } from '../types.ts';
import { MIN_ZONES } from '../game/zones.ts';

export type Verdict = ValidationReport['verdict'];
export type Outcome = 'great' | 'good' | 'rough' | 'failed';

const STARS: Readonly<Record<Verdict, number>> = { good: 3, acceptable: 2, poor: 1, 'not-tracking': 0 };

export function starsFor(verdict: Verdict, zones: number): number {
  return zones < MIN_ZONES ? 0 : STARS[verdict];
}

export function outcomeFor(verdict: Verdict, zones: number): Outcome {
  if (verdict === 'not-tracking' || zones < MIN_ZONES) return 'failed';
  if (verdict === 'good') return 'great';
  return verdict === 'acceptable' ? 'good' : 'rough';
}

/** At least two zones unlock the challenge (the star node on the track). */
export function challengeUnlocked(zones: number): boolean {
  return zones >= MIN_ZONES;
}
