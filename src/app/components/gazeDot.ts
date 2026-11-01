// Drawing for Live gaze (specification §7 screen 7, §4.10): the gaze dot (filtered or raw) with
// a confidence ring whose arc is the advisory confidence, greyed while the head is outside the
// calibrated range; smaller per-engine dots in the engines' colours; and the areas-of-interest
// demo grid with the cell under the gaze highlighted. Everything is drawn on the stage canvas in
// CSS px. A position off the viewport is drawn at the edge, hollow, so it is never lost silently.
import type { SafeRect } from '../../core/geometry/screen.ts';
import type { Vec2 } from '../../core/types.ts';

export interface DotStyle {
  radiusPx: number;
  colour: string;
  /** Head outside the calibrated range, or the screen no longer as calibrated. */
  greyed: boolean;
  /** 0–1, drawn as the arc of the ring; null draws no ring. */
  confidence: number | null;
}

const GREY = 'rgba(70, 70, 70, 0.55)';
const OUTLINE = '#ffffff';

/** Clamps a point into the viewport (inset by `margin`) and says whether it had to move. */
export function clampToViewport(p: Vec2, w: number, hgt: number, margin: number): { p: Vec2; clamped: boolean } {
  const x = Math.min(w - margin, Math.max(margin, p[0]));
  const y = Math.min(hgt - margin, Math.max(margin, p[1]));
  return { p: [x, y], clamped: x !== p[0] || y !== p[1] };
}

export function drawGazeDot(ctx: CanvasRenderingContext2D, p: Vec2, w: number, hgt: number, s: DotStyle): void {
  const ringR = s.radiusPx * 1.9;
  const { p: q, clamped } = clampToViewport(p, w, hgt, ringR + 2);
  const [x, y] = q;
  const fill = s.greyed ? GREY : s.colour;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, s.radiusPx, 0, 2 * Math.PI);
  if (clamped) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  if (s.greyed) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, s.radiusPx + 3, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (s.confidence !== null && Number.isFinite(s.confidence)) {
    const c = Math.min(1, Math.max(0, s.confidence));
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, 2 * Math.PI);
    ctx.stroke();
    if (c > 0) {
      ctx.strokeStyle = s.greyed ? GREY : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * c);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A small dot for one engine's own estimate. */
export function drawEngineDot(ctx: CanvasRenderingContext2D, p: Vec2, w: number, hgt: number, colour: string, radiusPx: number): void {
  const { p: q, clamped } = clampToViewport(p, w, hgt, radiusPx + 1);
  ctx.save();
  ctx.beginPath();
  ctx.arc(q[0], q[1], radiusPx, 0, 2 * Math.PI);
  if (clamped) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/** The cell (column, row) of an n × n grid over the safe rectangle that contains `p`, or null outside it. */
export function aoiCell(p: Vec2, r: SafeRect, n: number): [number, number] | null {
  if (!(n >= 1) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  const u = (p[0] - r.x) / r.w;
  const v = (p[1] - r.y) / r.h;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return [Math.floor(u * n), Math.floor(v * n)];
}

/** The grid lines and the highlighted cell. */
export function drawAoiGrid(ctx: CanvasRenderingContext2D, r: SafeRect, n: number, active: [number, number] | null): void {
  ctx.save();
  if (active) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(r.x + (active[0] * r.w) / n, r.y + (active[1] * r.h) / n, r.w / n, r.h / n);
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const x = r.x + (k * r.w) / n;
    const y = r.y + (k * r.h) / n;
    ctx.moveTo(x, r.y);
    ctx.lineTo(x, r.y + r.h);
    ctx.moveTo(r.x, y);
    ctx.lineTo(r.x + r.w, y);
  }
  ctx.stroke();
  ctx.restore();
}
