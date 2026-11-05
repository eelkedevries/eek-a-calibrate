// A round's stars (spec §17.9.5, design §5.5), heuristic: 1 at 50 % popped or more, 2 at 75 %, 3 at
// 90 % when the median time to pop is 1.6 s or less (else 2).
import { STARS } from './params.ts';

export function roundStars(popped: number, total: number, medianPopMs: number | null): number {
  if (!(total > 0)) return 0;
  const rate = popped / total;
  if (rate >= STARS.three && medianPopMs !== null && medianPopMs <= STARS.threeMedianMs) return 3;
  if (rate >= STARS.two) return 2;
  return rate >= STARS.one ? 1 : 0;
}
