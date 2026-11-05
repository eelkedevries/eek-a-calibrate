// The warm-up bubble's timeline (spec §17.6.3, design §2.6, §6.1), DOM-free. For a fixation,
// validation or drift item with onset t₀ the bubble scales in from 0.6× to its full size over the
// first 150 ms of the settle window, stays at full size to the window's end, shrinks linearly to
// the core's radius over the sample window and holds there during any extension. After the item
// it pops for 150 ms, outside every sampling window. Under reduced motion it is static at full
// size and has no pop. In test mode every duration, the scale-in and the pop included, is divided
// by the speed factor (the item's own settle and sample times already are).
export const BUBBLE = {
  /** Full diameter in degrees, from the geometry (assumed or measured). */
  fullDeg: 3,
  /** The full diameter is clamped to [minPx, maxShortFrac × the stage's short side]. */
  minPx: 64,
  maxShortFrac: 0.2,
  scaleInMs: 150,
  startScale: 0.6,
  popMs: 150,
  /** The static bubble of Level 3 (Turn your head): diameter on phones and on larger screens. */
  headPhonePx: 64,
  headDesktopPx: 80,
} as const;

export interface BubbleSizes {
  /** Full radius, CSS px. */
  fullR: number;
  /** The core's radius (half the ABC disc of §4.7), CSS px. */
  coreR: number;
}

export interface BubbleTiming {
  settleMs: number;
  sampleMs: number;
}

function checkSpeed(speed: number): number {
  if (!(Number.isFinite(speed) && speed >= 1)) throw new RangeError(`bubble: the speed factor must be ≥ 1, got ${speed}`);
  return speed;
}

/**
 * The full diameter: 3° at `pxPerDeg` (the scale the core is drawn at: measured, or the assumed
 * 24 px per 0.6° of §4.7), at least 64 px and at most 20 % of the stage's short side. On a stage
 * too small for both, the upper bound wins, so that an edge target's bubble still fits the screen.
 */
export function bubbleDiameterPx(pxPerDeg: number, shortSidePx: number): number {
  const deg = BUBBLE.fullDeg * pxPerDeg;
  const wanted = Number.isFinite(deg) && deg > 0 ? deg : BUBBLE.minPx;
  return Math.min(BUBBLE.maxShortFrac * shortSidePx, Math.max(BUBBLE.minPx, wanted));
}

/** The radius `tRelMs` after onset (the rAF timestamp of the first frame that shows the item). */
export function bubbleRadius(tRelMs: number, item: BubbleTiming, sizes: BubbleSizes, reducedMotion: boolean, speed = 1): number {
  checkSpeed(speed);
  if (reducedMotion) return sizes.fullR;
  const t = Math.max(0, tRelMs);
  const scaleIn = Math.min(BUBBLE.scaleInMs / speed, item.settleMs);
  if (t < scaleIn) return sizes.fullR * (BUBBLE.startScale + (1 - BUBBLE.startScale) * (t / scaleIn));
  if (t < item.settleMs) return sizes.fullR;
  const sampled = t - item.settleMs;
  if (sampled < item.sampleMs) return sizes.fullR + (sizes.coreR - sizes.fullR) * (sampled / item.sampleMs);
  return sizes.coreR;
}

/** The pop's length at `speed`. */
export function popMs(speed = 1): number {
  return BUBBLE.popMs / checkSpeed(speed);
}

/** How far the pop has run, 0–1, `sincePopMs` after the item ended; null once it is over. */
export function popProgress(sincePopMs: number, speed = 1): number | null {
  const length = popMs(speed);
  if (!(sincePopMs >= 0) || sincePopMs >= length) return null;
  return sincePopMs / length;
}
