// The zones on the grey (design §2.13, §5.4, §6.1; boards phone-free-look, desktop-free-look,
// phone-challenge): one full-size SVG over the stage with the zones as faint rounded outlines
// (radius 14, 1.5 px --stage-line) and the zone the gaze falls in lit (--stage-lit fill, 2 px
// --halo outline). Its label names the zones and the lit one.
import type { Board } from '../../core/game/board.ts';
import { svg } from '../dom.ts';

export interface ZoneBoard {
  el: SVGSVGElement;
  /** Where Free look's disc and the expert marks are drawn (above the zones). */
  marks: SVGGElement;
  setBoard(board: Board, viewport: { w: number; h: number }): void;
  setLit(index: number | null): void;
  setLabel(text: string): void;
  readonly lit: number | null;
}

export function zoneBoard(label: string): ZoneBoard {
  const zones = svg('g', { class: 'zone-board__zones' });
  const marks = svg('g', { class: 'zone-board__marks' });
  const el = svg('svg', { class: 'zone-board', role: 'img', 'aria-label': label, preserveAspectRatio: 'none' }, zones, marks);
  let rects: SVGRectElement[] = [];
  let lit: number | null = null;
  return {
    el,
    marks,
    setBoard(board, viewport) {
      el.setAttribute('viewBox', `0 0 ${viewport.w} ${viewport.h}`);
      rects = board.zones.map((z) => svg('rect', { class: 'zone-board__zone', x: z.rect.x, y: z.rect.y, width: z.rect.w, height: z.rect.h, rx: 14 }));
      zones.replaceChildren(...rects);
      const was = lit;
      lit = null;
      this.setLit(was);
    },
    setLit(index) {
      if (index === lit) return;
      if (lit !== null) rects[lit]?.removeAttribute('data-lit');
      lit = index;
      if (lit !== null) rects[lit]?.setAttribute('data-lit', '');
    },
    setLabel(text) {
      if (el.getAttribute('aria-label') !== text) el.setAttribute('aria-label', text);
    },
    get lit() {
      return lit;
    },
  };
}
