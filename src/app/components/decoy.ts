// The decoy of round 2 (design §5.3, §5.4, §6.1): a dark 12-point spiky ball the size of the
// bubble, with no edge and no dot (nothing to look at). After a bonk it shakes for 200 ms.

/** The decoy at radius 30, centred on the origin (design §6.1). */
export const DECOY_PATH =
  'M0-30L6-22.2L15-26L16.3-16.3L26-15L22.2-6L30 0L22.2 6L26 15L16.3 16.3L15 26L6 22.2L0 30L-6 22.2L-15 26L-16.3 16.3L-26 15L-22.2 6L-30 0L-22.2-6L-26-15L-16.3-16.3L-15-26L-6-22.2Z';

let shape: Path2D | null = null;

export function decoyColour(el: Element): string {
  return getComputedStyle(el).getPropertyValue('--decoy').trim() || '#24242a';
}

/** One decoy of radius `r` at (x, y); `shake` is 0–1 through the 200 ms shake after a bonk, or null. */
export function drawDecoy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, shake: number | null): void {
  shape ??= new Path2D(DECOY_PATH);
  const dx = shake === null ? 0 : 0.12 * r * Math.sin(shake * 6 * Math.PI) * (1 - shake);
  ctx.save();
  ctx.translate(x + dx, y);
  ctx.scale(r / 30, r / 30);
  ctx.fillStyle = colour;
  ctx.fill(shape);
  ctx.restore();
}
