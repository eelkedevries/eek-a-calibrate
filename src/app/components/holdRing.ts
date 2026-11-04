// The hold ring of Get ready (design §2.5, §3.5): while every check is clear, a 5 px ring in
// --state-good traces the target oval clockwise from its top over SETUP.holdMs; a break restarts
// it, and when it completes Ready latches. Drawn halo first (--halo, 3 px wider) so that it stays
// at least 3:1 on any video (WCAG 1.4.11).
import { svg } from '../dom.ts';

export interface Oval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A closed path round the oval, starting at its top and running clockwise (y down). */
export function ringPath(o: Oval): string {
  const top = `${o.cx} ${o.cy - o.ry}`;
  // Two half arcs keep the path's start at the top; sweep-flag 1 is clockwise on screen.
  return `M${top}A${o.rx} ${o.ry} 0 1 1 ${o.cx} ${o.cy + o.ry}A${o.rx} ${o.ry} 0 1 1 ${top}`;
}

export interface HoldRing {
  el: SVGGElement;
  /** Places the ring on the oval and shows `fraction` (0–1) of it. */
  update(o: Oval, fraction: number): void;
}

export function holdRing(): HoldRing {
  const halo = svg('path', { fill: 'none', stroke: 'var(--halo)', 'stroke-width': 8, pathLength: 100, 'stroke-linecap': 'butt' });
  const ring = svg('path', { fill: 'none', stroke: 'var(--state-good)', 'stroke-width': 5, pathLength: 100, 'stroke-linecap': 'butt' });
  const el = svg('g', { class: 'hold-ring' }, halo, ring);
  return {
    el,
    update(o, fraction) {
      const f = Math.max(0, Math.min(1, fraction));
      el.style.display = f > 0 ? '' : 'none';
      const d = ringPath(o);
      const dash = f >= 1 ? 'none' : `${(100 * f).toFixed(2)} 100`;
      for (const p of [halo, ring]) {
        if (p.getAttribute('d') !== d) p.setAttribute('d', d);
        // A style rather than the attribute, so that the CSS transition fills the gaps between ticks.
        p.style.strokeDasharray = dash;
      }
    },
  };
}
