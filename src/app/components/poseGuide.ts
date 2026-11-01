// The pose guide of the head-motion block (specification §4.7 block C): a ring around the target
// with the current yaw and pitch, relative to the pose while settling, against four sectors
// (left, right, up, down). A sector counts as reached at REACH_FRACTION of the aimed amplitude
// (heuristic).
import { HEAD_BLOCK } from '../../core/constants.ts';

export type Sector = 'left' | 'right' | 'up' | 'down';
export const SECTORS: readonly Sector[] = ['left', 'right', 'up', 'down'];
/** A turn of 70 % of the aimed ±10° yaw or ±7° pitch reaches its sector (heuristic). */
export const REACH_FRACTION = 0.7;

export class SectorTracker {
  private baseYaw: number[] = [];
  private basePitch: number[] = [];
  private base: { yaw: number; pitch: number } | null = null;
  readonly reached = new Set<Sector>();
  /** The latest pose relative to the baseline, degrees. */
  current: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 };

  /** Frames while settling: their median pose becomes the baseline. */
  addBaseline(yawDeg: number, pitchDeg: number): void {
    this.baseYaw.push(yawDeg);
    this.basePitch.push(pitchDeg);
  }

  /** A frame of the motion phase. Yaw counts while `phase` is 'yaw', pitch while it is 'pitch'. */
  add(yawDeg: number, pitchDeg: number, phase: 'yaw' | 'pitch'): void {
    if (!this.base) {
      const med = (v: number[]) => {
        if (v.length === 0) return 0;
        const s = [...v].sort((a, b) => a - b);
        const m = s.length >> 1;
        return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
      };
      this.base = { yaw: med(this.baseYaw), pitch: med(this.basePitch) };
    }
    const yaw = yawDeg - this.base.yaw;
    const pitch = pitchDeg - this.base.pitch;
    this.current = { yaw, pitch };
    const y = REACH_FRACTION * HEAD_BLOCK.yawAmpDeg;
    const p = REACH_FRACTION * HEAD_BLOCK.pitchAmpDeg;
    if (phase === 'yaw') {
      // Positive yaw turns the face towards the subject's left, which is the left of the screen as they see it.
      if (yaw >= y) this.reached.add('left');
      if (yaw <= -y) this.reached.add('right');
    } else {
      // Positive pitch tilts the face down.
      if (pitch >= p) this.reached.add('down');
      if (pitch <= -p) this.reached.add('up');
    }
  }

  get done(): boolean {
    return this.reached.size >= HEAD_BLOCK.sectorsNeeded;
  }
}

/**
 * Draws the guide centred on (x, y) with radius r: four sector arcs (filled when reached) and a
 * dot at the current pose, scaled so that the aimed amplitude reaches the ring.
 */
export function drawPoseGuide(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: SectorTracker, colours: { fg: string; done: string; dim: string }): void {
  const arcs: Record<Sector, [number, number]> = {
    right: [-Math.PI / 4, Math.PI / 4],
    down: [Math.PI / 4, (3 * Math.PI) / 4],
    left: [(3 * Math.PI) / 4, (5 * Math.PI) / 4],
    up: [(5 * Math.PI) / 4, (7 * Math.PI) / 4],
  };
  ctx.lineWidth = Math.max(4, r / 8);
  for (const s of SECTORS) {
    const [a, b] = arcs[s];
    ctx.beginPath();
    ctx.arc(x, y, r, a + 0.08, b - 0.08);
    ctx.strokeStyle = t.reached.has(s) ? colours.done : colours.dim;
    ctx.stroke();
  }
  const dx = Math.max(-1.2, Math.min(1.2, -t.current.yaw / HEAD_BLOCK.yawAmpDeg));
  const dy = Math.max(-1.2, Math.min(1.2, t.current.pitch / HEAD_BLOCK.pitchAmpDeg));
  ctx.beginPath();
  ctx.arc(x + dx * r, y + dy * r, Math.max(4, r / 10), 0, 2 * Math.PI);
  ctx.fillStyle = colours.fg;
  ctx.fill();
}
