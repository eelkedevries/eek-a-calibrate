// The face guide of Get ready (design §3.5; boards phone-ready, desktop-ready and
// position-signals): the mirrored camera image under the grey veil with the target oval cut out
// of it, the live face outline and eye dots, one directional cue, the hold ring and the Ready
// badge, all in one SVG over the video. Every stroke is drawn twice, the --halo first and 3 px
// wider, so that it stays visible on any image and on the grey.
//
// Layout: the video is cover-fitted to the stage and centred; the oval's width is the class's
// target face fraction of the displayed frame's long side, its height 1.3 times that, centred on
// the frame and raised by 3 % of its height. When the oval would not fit the clear band between
// the cue and the dock, the preview is scaled down instead (contain rather than cover), with the
// veil filling the rest. No auto-pan or zoom: the true frame is shown.
import type { DirectionalCue } from '../../core/position/cues.ts';
import type { ReadyState } from '../../core/position/guard.ts';
import { OVAL_RAISE, type Ellipse, type FaceGeometry, type VisibleRegion } from '../../core/position/signals.ts';
import { svg } from '../dom.ts';
import { holdRing, type Oval } from './holdRing.ts';

/** The oval's height over its width (design §3.5). */
export const OVAL_ASPECT = 1.3;
/** Space kept between the oval and the band's edges, px. */
const BAND_MARGIN = 8;

export interface GuideLayout {
  /** The displayed frame: offset and size in stage px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The uniform scale from frame px to stage px. */
  scale: number;
  mode: 'cover' | 'contain';
  oval: Oval;
  /** The part of the (unmirrored) frame on screen, as frame fractions. */
  visible: VisibleRegion;
}

export interface GuideInput {
  stageW: number;
  stageH: number;
  videoW: number;
  videoH: number;
  /** The clear band between the cue and the dock, stage px. */
  bandTop: number;
  bandBottom: number;
  /** The class's target face width over the frame's long side. */
  target: number;
}

/** Where the preview and the oval go (pure). */
export function guideLayout(o: GuideInput): GuideLayout {
  const { stageW: W, stageH: H, videoW: vw, videoH: vh } = o;
  const long = Math.max(vw, vh);
  const cover = Math.max(W / vw, H / vh);
  const ovalFits = (s: number, cy: number) => {
    const rx = (o.target * long * s) / 2;
    const ry = OVAL_ASPECT * rx;
    return cy - ry >= o.bandTop + BAND_MARGIN - 0.5 && cy + ry <= o.bandBottom - BAND_MARGIN + 0.5 && 2 * rx <= W - 2 * BAND_MARGIN;
  };
  let scale = cover;
  let w = vw * scale;
  let h = vh * scale;
  let x = (W - w) / 2;
  let y = (H - h) / 2;
  let mode: GuideLayout['mode'] = 'cover';
  if (!ovalFits(scale, y + h / 2 - OVAL_RAISE * h)) {
    const bandH = Math.max(1, o.bandBottom - o.bandTop - 2 * BAND_MARGIN);
    scale = Math.min(cover, bandH / (OVAL_ASPECT * o.target * long), (W - 2 * BAND_MARGIN) / (o.target * long));
    w = vw * scale;
    h = vh * scale;
    // The oval sits in the middle of the band; the frame's centre is OVAL_RAISE below it.
    const ovalCy = (o.bandTop + o.bandBottom) / 2;
    x = (W - w) / 2;
    y = ovalCy + OVAL_RAISE * h - h / 2;
    mode = 'contain';
  }
  const rx = (o.target * long * scale) / 2;
  const oval = { cx: x + w / 2, cy: y + h / 2 - OVAL_RAISE * h, rx, ry: OVAL_ASPECT * rx };
  // The preview is mirrored: stage x maps to frame fraction 1 − (x − offset) / width.
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const visible = {
    x0: clamp(1 - (W - x) / w),
    x1: clamp(1 - (0 - x) / w),
    y0: clamp((0 - y) / h),
    y1: clamp((H - y) / h),
  };
  return { x, y, w, h, scale, mode, oval, visible };
}

/**
 * Whether a layout's oval still lies inside the clear band (1 px of slack), so that a cue that
 * has grown since the layout was made (a headline on two lines, a longer tip) never covers it.
 */
export function ovalInBand(l: GuideLayout, bandTop: number, bandBottom: number): boolean {
  return l.oval.cy - l.oval.ry >= bandTop + BAND_MARGIN - 1 && l.oval.cy + l.oval.ry <= bandBottom - BAND_MARGIN + 1;
}

/** Frame px → stage px through the mirrored layout. */
export function toStage(l: GuideLayout, videoW: number, videoH: number, px: number, py: number): readonly [number, number] {
  return [l.x + (1 - px / videoW) * l.w, l.y + (py / videoH) * l.h];
}

/** A face outline and eyes in stage px. */
export interface StageFace {
  outline: Ellipse;
  eyes: readonly (readonly [number, number])[];
}

export function faceOnStage(l: GuideLayout, g: FaceGeometry): StageFace {
  const [cx, cy] = toStage(l, g.videoW, g.videoH, g.outline.cx, g.outline.cy);
  return {
    outline: { cx, cy, rx: g.outline.rx * l.scale, ry: g.outline.ry * l.scale, angleDeg: -g.outline.angleDeg },
    eyes: g.eyes.map(([x, y]) => toStage(l, g.videoW, g.videoH, x, y)),
  };
}

/**
 * A stand-in face for the layout fixtures (test mode, no camera): the boards' proportions, an
 * outline 0.88 of the oval (`k` scales it), eyes a third of its half-width either side.
 */
export function syntheticFace(oval: Oval, k = 1, dx = 0, dy = 0): StageFace {
  const rx = 0.88 * oval.rx * k;
  const ry = 0.88 * oval.ry * k;
  const cx = oval.cx + dx;
  const cy = oval.cy + 3 * k + dy;
  return {
    outline: { cx, cy, rx, ry, angleDeg: 0 },
    eyes: [
      [cx - 0.385 * rx, cy - 0.175 * ry],
      [cx + 0.385 * rx, cy - 0.175 * ry],
    ],
  };
}

function ellipsePath(e: Ellipse | Oval): string {
  return `M${e.cx - e.rx} ${e.cy}a${e.rx} ${e.ry} 0 1 0 ${2 * e.rx} 0a${e.rx} ${e.ry} 0 1 0 ${-2 * e.rx} 0Z`;
}

/** A chevron with arms `a` pointing in `angleDeg` (0 = right, 90 = down), its tip at (x, y). */
function chevron(x: number, y: number, a: number, angleDeg: number): string {
  const r = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(r);
  const uy = Math.sin(r);
  // The two arms go back from the tip at ±45°.
  const p1 = [x - a * (ux + uy) * Math.SQRT1_2, y - a * (uy - ux) * Math.SQRT1_2];
  const p2 = [x - a * (ux - uy) * Math.SQRT1_2, y - a * (uy + ux) * Math.SQRT1_2];
  return `M${p1[0]!.toFixed(1)} ${p1[1]!.toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}L${p2[0]!.toFixed(1)} ${p2[1]!.toFixed(1)}`;
}

/** The directional cue's path (design §3.5): four chevrons for distance, one towards the oval for centring. */
export function cuePath(cue: DirectionalCue, oval: Oval, face: StageFace | null): string {
  if (!cue || cue.kind === 'phone') return '';
  if (cue.kind === 'chevrons') {
    const o = face?.outline ?? { cx: oval.cx, cy: oval.cy, rx: oval.rx * 0.6, ry: oval.ry * 0.6 };
    const a = Math.max(12, Math.min(20, 0.12 * oval.rx));
    const out = cue.direction === 'out';
    const midX = (oval.rx + o.rx) / 2;
    const midY = (oval.ry + o.ry) / 2;
    // Each chevron's tip sits half way between the outline and the oval, pointing out or in.
    return [
      chevron(oval.cx - midX, oval.cy, a, out ? 180 : 0),
      chevron(oval.cx + midX, oval.cy, a, out ? 0 : 180),
      chevron(oval.cx, oval.cy - midY, a, out ? 270 : 90),
      chevron(oval.cx, oval.cy + midY, a, out ? 90 : 270),
    ].join('');
  }
  if (!face) return '';
  const o = face.outline;
  const dx = oval.cx - o.cx;
  const dy = oval.cy - o.cy;
  const len = Math.hypot(dx, dy);
  if (len < 1) return '';
  const ux = dx / len;
  const uy = dy / len;
  // Just beyond the outline's edge in the direction of the oval's centre.
  const edge = 1 / Math.hypot(ux / o.rx, uy / o.ry);
  const a = Math.max(16, Math.min(57, 0.34 * oval.rx));
  const reach = edge + 28 + a * Math.SQRT1_2;
  const tipX = o.cx + ux * reach;
  const tipY = o.cy + uy * reach;
  return chevron(tipX, tipY, a, (Math.atan2(uy, ux) * 180) / Math.PI);
}

export interface GuideView {
  state: ReadyState;
  cue: DirectionalCue;
  holdFraction: number;
  face: StageFace | null;
}

export interface FaceGuide {
  svg: SVGSVGElement;
  render(layout: GuideLayout, stageW: number, stageH: number, view: GuideView): void;
}

/** The overlay SVG; `render` redraws it for a layout and a view. */
export function faceGuide(): FaceGuide {
  const veil = svg('path', { class: 'guide__veil', 'fill-rule': 'evenodd', fill: 'var(--stage-veil)' });
  const ovalHalo = svg('path', { fill: 'none', stroke: 'var(--halo)' });
  const ovalLine = svg('path', { fill: 'none' });
  const ring = holdRing();
  const outlineHalo = svg('ellipse', { fill: 'none', stroke: 'var(--halo)', 'stroke-width': 5 });
  const outline = svg('ellipse', { fill: 'none', stroke: 'var(--color-text)', 'stroke-width': 2 });
  const eyes = svg('g', { class: 'guide__eyes' });
  const cueHalo = svg('path', { fill: 'none', stroke: 'var(--halo)', 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const cueLine = svg('path', { fill: 'none', stroke: 'var(--state-adjust)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const badge = svg(
    'g',
    { class: 'guide__badge' },
    svg('circle', { r: 12, fill: 'var(--state-good)', stroke: 'var(--stage-ink)', 'stroke-width': 1.5 }),
    svg('path', { d: 'M-5.5 0.5l3.5 3.5 6.5-7', fill: 'none', stroke: 'var(--badge-ink)', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  );
  const el = svg('svg', { class: 'guide', 'aria-hidden': 'true', focusable: 'false' }, veil, ovalHalo, ovalLine, ring.el, outlineHalo, outline, eyes, cueHalo, cueLine, badge);

  return {
    svg: el,
    render(l, W, H, view) {
      el.setAttribute('viewBox', `0 0 ${W} ${H}`);
      el.setAttribute('width', String(W));
      el.setAttribute('height', String(H));
      const o = l.oval;
      veil.setAttribute('d', `M0 0H${W}V${H}H0Z${ellipsePath(o)}`);
      const d = ellipsePath(o);
      for (const p of [ovalHalo, ovalLine]) p.setAttribute('d', d);

      // Oval states (design §3.5): searching dashed at half strength, adjust amber, holding and ready green.
      const searching = view.state === 'searching' || view.state === 'loading';
      const good = view.state === 'holding' || view.state === 'ready';
      const ready = view.state === 'ready';
      ovalLine.setAttribute('stroke', searching ? 'var(--color-text)' : good ? 'var(--state-good)' : 'var(--state-adjust)');
      ovalLine.setAttribute('stroke-opacity', searching ? '0.5' : '1');
      ovalLine.setAttribute('stroke-width', ready ? '5' : searching ? '2' : '3');
      ovalHalo.setAttribute('stroke-width', ready ? '8' : searching ? '5' : '6');
      for (const p of [ovalHalo, ovalLine]) {
        if (searching) p.setAttribute('stroke-dasharray', '8 6');
        else p.removeAttribute('stroke-dasharray');
      }
      ring.update(o, view.state === 'holding' ? view.holdFraction : 0);

      const face = view.face;
      outline.style.display = face ? '' : 'none';
      outlineHalo.style.display = face ? '' : 'none';
      eyes.replaceChildren();
      if (face) {
        const f = face.outline;
        for (const e of [outlineHalo, outline]) {
          e.setAttribute('cx', f.cx.toFixed(1));
          e.setAttribute('cy', f.cy.toFixed(1));
          e.setAttribute('rx', f.rx.toFixed(1));
          e.setAttribute('ry', f.ry.toFixed(1));
          e.setAttribute('transform', f.angleDeg ? `rotate(${f.angleDeg.toFixed(1)} ${f.cx.toFixed(1)} ${f.cy.toFixed(1)})` : '');
        }
        for (const [x, y] of face.eyes) eyes.append(svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 6, fill: 'var(--gaze)', stroke: 'var(--gaze-outline)', 'stroke-width': 1.5 }));
      }

      const cue = view.state === 'adjust' ? cuePath(view.cue, o, face) : '';
      cueHalo.setAttribute('d', cue);
      cueLine.setAttribute('d', cue);

      badge.style.display = ready ? '' : 'none';
      badge.setAttribute('transform', `translate(${o.cx.toFixed(1)} ${(o.cy - o.ry).toFixed(1)})`);
    },
  };
}
