// The SVG target plot (specification §7 screen 6): the validation targets, and for each shown
// estimator its valid samples, their centroid and the offset vector from the target, in CSS px
// of the screen the validation ran on.
import { targetWindows } from '../../core/metrics/validation.ts';
import { isValidSample } from '../../core/metrics/funnel.ts';
import type { EstimatorId, GazeSample, Recording, Vec2 } from '../../core/types.ts';
import { svg } from '../dom.ts';

export interface PlotSeries {
  estimator: EstimatorId;
  /** A CSS colour (the Okabe–Ito token of the engine). */
  colour: string;
  samples: readonly GazeSample[];
}

/** Valid samples of one estimator inside a target's sampling window, as px. */
function windowPoints(samples: readonly GazeSample[], startMs: number, endMs: number): Vec2[] {
  const out: Vec2[] = [];
  for (const s of samples) {
    if (s.tCaptureMs < startMs || s.tCaptureMs >= endMs || !isValidSample(s) || !s.rawPx) continue;
    if (Number.isFinite(s.rawPx[0]) && Number.isFinite(s.rawPx[1])) out.push(s.rawPx);
  }
  return out;
}

export function targetPlot(rec: Recording, series: readonly PlotSeries[], label: string): SVGSVGElement {
  const { viewportWpx: W, viewportHpx: H } = rec.geometry.screen;
  const unit = Math.max(W, H) / 200;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, class: 'target-plot', preserveAspectRatio: 'xMidYMid meet' });
  root.append(svg('rect', { x: 0, y: 0, width: W, height: H, class: 'plot-screen' }));
  const windows = targetWindows(rec);
  for (const w of windows) {
    const [tx, ty] = w.targetPx;
    for (const s of series) {
      const pts = windowPoints(s.samples, w.startMs, w.endMs);
      const g = svg('g', { 'data-estimator': s.estimator, style: `color: ${s.colour}` });
      for (const [x, y] of pts) g.append(svg('circle', { cx: x, cy: y, r: unit * 0.6, class: 'plot-sample' }));
      if (pts.length > 0) {
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        g.append(svg('line', { x1: tx, y1: ty, x2: cx, y2: cy, class: 'plot-offset', 'stroke-width': unit * 0.5 }));
        g.append(svg('circle', { cx, cy, r: unit * 1.6, class: 'plot-centroid' }));
      }
      root.append(g);
    }
    const arm = unit * 3;
    root.append(
      svg('path', { d: `M ${tx - arm} ${ty} H ${tx + arm} M ${tx} ${ty - arm} V ${ty + arm}`, class: 'plot-target', 'stroke-width': unit * 0.6 }),
    );
  }
  return root;
}
