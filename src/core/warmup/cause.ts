// The one cause line of Warm-up complete (spec §17.7.5, design §2.12): from the warm-up's frame
// log and the position guard's light readings, the first that applies of: face often lost,
// backlit, too dark, much head movement, glare, too far. Every threshold is heuristic. The light
// limits are the ready check's (SETUP, Appendix A); the shares are of the labelled frames outside
// the settle windows.
import { SETUP } from '../constants.ts';
import type { RejectCode } from '../types.ts';
import type { LevelFrame } from './steadiness.ts';

export type Cause = 'face-lost' | 'backlit' | 'dark' | 'motion' | 'glare' | 'far';

/** The order in which causes are named (design §2.12). */
export const CAUSE_ORDER: readonly Cause[] = ['face-lost', 'backlit', 'dark', 'motion', 'glare', 'far'];

/** A frame-log cause counts from this share of the frames (heuristic). */
export const CAUSE_SHARE = 0.2;

export interface LightReadings {
  /** Medians over the warm-up of the guard's face luma (0–255), backlight ratio and glare fraction; NaN when unknown. */
  lumaMean: number;
  backlight: number;
  glare: number;
}

export interface CauseInput {
  /** Every labelled frame of the warm-up's levels. */
  frames: readonly LevelFrame[];
  light: LightReadings;
}

function share(frames: readonly LevelFrame[], codes: readonly RejectCode[]): number {
  return frames.length === 0 ? 0 : frames.filter((f) => !f.accepted && f.reject !== null && codes.includes(f.reject)).length / frames.length;
}

/** Every cause that applies, in the order of design §2.12. */
export function causes(input: CauseInput): Cause[] {
  const frames = input.frames.filter((f) => f.reject !== 'settle');
  const { lumaMean, backlight, glare } = input.light;
  const applies: Record<Cause, boolean> = {
    'face-lost': share(frames, ['no-face']) >= CAUSE_SHARE,
    backlit: Number.isFinite(backlight) && backlight < SETUP.backlightMin,
    dark: Number.isFinite(lumaMean) && lumaMean < SETUP.lumaMin,
    motion: share(frames, ['motion', 'pose']) >= CAUSE_SHARE,
    glare: Number.isFinite(glare) && glare > SETUP.glareMax,
    far: share(frames, ['small-face']) >= CAUSE_SHARE,
  };
  return CAUSE_ORDER.filter((c) => applies[c]);
}

/** The cause line's cause: the first that applies, or null when none does. */
export function causeFor(input: CauseInput): Cause | null {
  return causes(input)[0] ?? null;
}
