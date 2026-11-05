// The steadiness line on the next level card (design §2.6), from the frame-acceptance log of the
// level just played and nothing else (no gaze is involved). The thresholds are heuristic:
// at least 80 % of the frames accepted and no retried bubble is "Nice and steady"; otherwise, when
// most rejections were head motion or pose, "Try to keep your head still"; when most were a lost
// or small face, "Try to stay in view"; otherwise "Nice work". Frames inside a settle window are
// left out: the protocol excludes them by design, not because of the player.
import type { RejectCode } from '../types.ts';

export type Steadiness = 'steady' | 'still' | 'view' | 'nice';

/** Accepted frames at or above this share, with no retried bubble, are "Nice and steady" (heuristic). */
export const STEADY_ACCEPT = 0.8;
/** A group of rejection codes is "most" of the rejections above this share (heuristic). */
export const MOST = 0.5;

const HEAD: ReadonlySet<RejectCode> = new Set(['motion', 'pose']);
const VIEW: ReadonlySet<RejectCode> = new Set(['no-face', 'small-face']);

export interface LevelFrame {
  accepted: boolean;
  reject: RejectCode | null;
}

export function steadiness(frames: readonly LevelFrame[], retried: boolean): Steadiness {
  const counted = frames.filter((f) => f.reject !== 'settle');
  const accepted = counted.filter((f) => f.accepted).length;
  if (counted.length > 0 && accepted / counted.length >= STEADY_ACCEPT && !retried) return 'steady';
  const rejections = counted.filter((f) => !f.accepted && f.reject !== null);
  if (rejections.length === 0) return 'nice';
  const share = (codes: ReadonlySet<RejectCode>) => rejections.filter((f) => codes.has(f.reject as RejectCode)).length / rejections.length;
  if (share(HEAD) > MOST) return 'still';
  if (share(VIEW) > MOST) return 'view';
  return 'nice';
}
