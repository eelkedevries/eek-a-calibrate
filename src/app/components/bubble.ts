// The warm-up bubble on the stimulus canvas (design §2.6, §6.1; spec §17.6.3): the dashed ghost
// ring at full size, the disc in --bubble-fill with its 2 px edge and the short shine arc at its
// upper left, and the core at its centre, the ABC target of §4.7 (disc, a cross cut in the colour
// beneath, centre dot) at its unchanged size. The pop is six short strokes bursting outwards. The
// radius over time comes from core/warmup/bubble.ts.
import type { TargetSizes } from './target.ts';

/** The stage and game roles as canvas colours, read once per run from the computed style. */
export interface GameColours {
  stage: string;
  bubbleFill: string;
  bubbleEdge: string;
  bubbleShine: string;
  bubbleCore: string;
  bubbleGhost: string;
  fireflyLight: string;
  fireflyTrail: string;
  arcOn: string;
  arcOff: string;
}

const FALLBACK: GameColours = {
  stage: '#808080',
  bubbleFill: 'rgba(255, 255, 255, 0.3)',
  bubbleEdge: '#000000',
  bubbleShine: '#ffffff',
  bubbleCore: '#000000',
  bubbleGhost: 'rgba(0, 0, 0, 0.3)',
  fireflyLight: 'rgba(255, 255, 255, 0.45)',
  fireflyTrail: 'rgba(255, 255, 255, 0.4)',
  arcOn: '#000000',
  arcOff: 'rgba(0, 0, 0, 0.6)',
};

const TOKENS: Readonly<Record<keyof GameColours, string>> = {
  stage: '--stage',
  bubbleFill: '--bubble-fill',
  bubbleEdge: '--bubble-edge',
  bubbleShine: '--bubble-shine',
  bubbleCore: '--bubble-core',
  bubbleGhost: '--bubble-ghost',
  fireflyLight: '--firefly-light',
  fireflyTrail: '--firefly-trail',
  arcOn: '--arc-on',
  arcOff: '--arc-off',
};

export function gameColours(el: Element): GameColours {
  const cs = getComputedStyle(el);
  const out = { ...FALLBACK };
  for (const key of Object.keys(TOKENS) as (keyof GameColours)[]) {
    const value = cs.getPropertyValue(TOKENS[key]).trim();
    if (value) out[key] = value;
  }
  return out;
}

/** The ABC core of §4.7 centred on (x, y): the cross is cut in `beneath`, then in `over` when it lies on a disc. */
export function drawCore(ctx: CanvasRenderingContext2D, x: number, y: number, s: TargetSizes, c: GameColours, over: string | null): void {
  const half = s.discPx / 2;
  ctx.beginPath();
  ctx.arc(x, y, half, 0, 2 * Math.PI);
  ctx.fillStyle = c.bubbleCore;
  ctx.fill();
  for (const fill of over ? [c.stage, over] : [c.stage]) {
    ctx.fillStyle = fill;
    ctx.fillRect(x - half, y - s.crossPx / 2, s.discPx, s.crossPx);
    ctx.fillRect(x - s.crossPx / 2, y - half, s.crossPx, s.discPx);
  }
  ctx.beginPath();
  ctx.arc(x, y, s.dotPx / 2, 0, 2 * Math.PI);
  ctx.fillStyle = c.bubbleCore;
  ctx.fill();
}

export interface BubbleDraw {
  /** The radius now and the full radius (the ghost ring). */
  r: number;
  fullR: number;
  /** The dashed ghost ring at full size (not on the static bubble of Level 3). */
  ghost: boolean;
}

/** One bubble centred on (x, y), with its core. */
export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, b: BubbleDraw, s: TargetSizes, c: GameColours): void {
  if (b.ghost) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = c.bubbleGhost;
    ctx.beginPath();
    ctx.arc(x, y, b.fullR, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }
  const r = Math.max(b.r, s.discPx / 2);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = c.bubbleFill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.bubbleEdge;
  ctx.stroke();
  // The shine: an arc of radius 0.7 R from (−0.587 R, −0.381 R) to (−0.228 R, −0.662 R) (design §6.1).
  if (r > s.discPx / 2 + 4) {
    const a0 = Math.atan2(-0.381, -0.587);
    const a1 = Math.atan2(-0.662, -0.228);
    ctx.beginPath();
    ctx.arc(x, y, 0.7 * r, a0, a1);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = c.bubbleShine;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  drawCore(ctx, x, y, s, c, c.bubbleFill);
}

/** The six-stroke burst at progress p (0–1) of the pop, scaled with the bubble's radius when it ended. */
export function drawBurst(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: number, c: GameColours): void {
  const inner = r * (1.5 + 0.6 * p);
  const outer = r * (2.17 + 0.6 * p);
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = c.bubbleEdge;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    ctx.moveTo(x + inner * Math.cos(a), y + inner * Math.sin(a));
    ctx.lineTo(x + outer * Math.cos(a), y + outer * Math.sin(a));
  }
  ctx.stroke();
  ctx.restore();
}
