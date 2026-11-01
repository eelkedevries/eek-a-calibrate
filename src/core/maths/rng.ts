// Seeded random numbers (specification §4.7 order, §4.8.2 PCA sketch).

/**
 * mulberry32 (Tommy Ettinger, public domain): a 32-bit generator returning uniform values in
 * [0, 1). The seed is reduced modulo 2^32, so `-1` and `0xffffffff` give the same sequence.
 */
export function mulberry32(seed: number): () => number {
  if (!Number.isInteger(seed)) throw new RangeError(`mulberry32: seed must be an integer, got ${seed}`);
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates (Durstenfeld) shuffle, in place; returns the same array. */
export function fisherYates<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

/** Standard normal deviates by the Box–Muller transform, drawing two uniforms per pair. */
export function gaussian(rand: () => number): () => number {
  let spare = 0;
  let hasSpare = false;
  return () => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    // 1 − u lies in (0, 1], so the logarithm is finite.
    const radius = Math.sqrt(-2 * Math.log(1 - rand()));
    const angle = 2 * Math.PI * rand();
    spare = radius * Math.sin(angle);
    hasSpare = true;
    return radius * Math.cos(angle);
  };
}
