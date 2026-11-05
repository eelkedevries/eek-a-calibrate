// Turn your head (design §2.9, §6.1; spec §17.6.5): four 60° arcs (left 150–210°, right −30–30°,
// up 240–300°, down 60–120°) at the bubble's radius + 22 px around the static bubble. Each arc's
// track is dashed 4/4 in --arc-off, 4 px; its fill grows symmetrically from the arc's midpoint in
// solid --arc-on, in proportion to the largest head turn reached towards that side (full once the
// sector counts as reached, through the existing SectorTracker); the arc the head is turning
// towards is drawn 6 px. No pose dot: a moving mark next to the fixation point would pull the eyes.
import { HEAD_BLOCK } from '../../core/constants.ts';
import type { GameColours } from './bubble.ts';
import { REACH_FRACTION, SECTORS, type Sector, type SectorTracker } from './poseGuide.ts';

export const ARC_GAP_PX = 22;
const DEG = Math.PI / 180;
const MIDPOINT: Readonly<Record<Sector, number>> = { right: 0, down: 90, left: 180, up: 270 };
const HALF_SPAN = 30;

export type ArcFills = Record<Sector, number>;

/**
 * Keeps the largest turn towards each side in the phase that counts it (yaw while turning, pitch
 * while nodding), as SectorTracker does, and turns it into the arcs' fills.
 */
export class ArcProgress {
  private readonly max: ArcFills = { left: 0, right: 0, up: 0, down: 0 };
  current: Sector | null = null;

  /** After `tracker.add(…)` for a frame of the motion phase. */
  update(tracker: SectorTracker, phase: 'yaw' | 'pitch'): void {
    const { yaw, pitch } = tracker.current;
    if (phase === 'yaw') {
      // Positive yaw turns the face towards the subject's left (SectorTracker).
      this.max.left = Math.max(this.max.left, yaw);
      this.max.right = Math.max(this.max.right, -yaw);
      this.current = Math.abs(yaw) >= 1 ? (yaw > 0 ? 'left' : 'right') : null;
    } else {
      this.max.down = Math.max(this.max.down, pitch);
      this.max.up = Math.max(this.max.up, -pitch);
      this.current = Math.abs(pitch) >= 1 ? (pitch > 0 ? 'down' : 'up') : null;
    }
  }

  fills(tracker: SectorTracker): ArcFills {
    const reach = { yaw: REACH_FRACTION * HEAD_BLOCK.yawAmpDeg, pitch: REACH_FRACTION * HEAD_BLOCK.pitchAmpDeg };
    const f = (s: Sector) => (tracker.reached.has(s) ? 1 : Math.min(1, Math.max(0, this.max[s] / (s === 'left' || s === 'right' ? reach.yaw : reach.pitch))));
    return { left: f('left'), right: f('right'), up: f('up'), down: f('down') };
  }
}

export function drawHeadArcs(ctx: CanvasRenderingContext2D, x: number, y: number, bubbleR: number, fills: ArcFills, current: Sector | null, c: GameColours): void {
  const r = bubbleR + ARC_GAP_PX;
  ctx.save();
  ctx.lineCap = 'butt';
  for (const s of SECTORS) {
    const mid = MIDPOINT[s];
    const width = current === s && fills[s] < 1 ? 6 : 4;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = width;
    ctx.strokeStyle = c.arcOff;
    ctx.beginPath();
    ctx.arc(x, y, r, (mid - HALF_SPAN) * DEG, (mid + HALF_SPAN) * DEG);
    ctx.stroke();
    const fill = fills[s];
    if (fill > 0) {
      ctx.setLineDash([]);
      ctx.strokeStyle = c.arcOn;
      ctx.beginPath();
      ctx.arc(x, y, r, (mid - HALF_SPAN * fill) * DEG, (mid + HALF_SPAN * fill) * DEG);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** How far the arcs reach from the bubble's centre, for keeping controls and the caption clear. */
export function arcsExtent(bubbleR: number): number {
  return bubbleR + ARC_GAP_PX + 3;
}
