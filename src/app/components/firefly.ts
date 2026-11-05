// Follow the firefly (design §2.8, §6.1; spec §17.6.4): the ABC core on a 44 px disc of
// --firefly-light, with a short, faint trail of the last 300 ms in three 3 px round-capped
// segments at 40 %, 25 % and 12 % (the token's 40 % at full, 0.625 and 0.3 opacity), newest
// first. No path ahead is ever drawn: a long or bright trail would pull the eyes backwards.
import type { Vec2 } from '../../core/types.ts';
import { drawCore, type GameColours } from './bubble.ts';
import type { TargetSizes } from './target.ts';

export const FIREFLY_R = 22;
export const TRAIL_MS = 300;
const SEGMENT_OPACITY = [1, 0.625, 0.3] as const;

/**
 * The trail's three segments, newest first, as polylines sampled from `at(t)` over the last
 * `trailMs` before `now`; `since` (the start of the motion) cuts it, so that no trail shows
 * while the firefly holds still.
 */
export function trailSegments(at: (tMs: number) => Vec2, now: number, since: number, trailMs = TRAIL_MS, steps = 4): Vec2[][] {
  const out: Vec2[][] = [];
  const part = trailMs / 3;
  for (let k = 0; k < 3; k++) {
    const end = now - k * part;
    const start = Math.max(since, end - part);
    if (end <= start) break;
    const line: Vec2[] = [];
    for (let i = 0; i <= steps; i++) line.push(at(end - ((end - start) * i) / steps));
    out.push(line);
  }
  return out;
}

export function drawFirefly(ctx: CanvasRenderingContext2D, x: number, y: number, trail: readonly Vec2[][], s: TargetSizes, c: GameColours): void {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c.fireflyTrail;
  trail.forEach((line, k) => {
    if (line.length < 2) return;
    ctx.globalAlpha = SEGMENT_OPACITY[k] ?? 0.3;
    ctx.beginPath();
    ctx.moveTo(line[0]![0], line[0]![1]);
    for (const [px, py] of line.slice(1)) ctx.lineTo(px, py);
    ctx.stroke();
  });
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, FIREFLY_R, 0, 2 * Math.PI);
  ctx.fillStyle = c.fireflyLight;
  ctx.fill();
  drawCore(ctx, x, y, s, c, c.fireflyLight);
}
