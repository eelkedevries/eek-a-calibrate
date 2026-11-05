// The zone map of Warm-up complete (design §2.12, §6.1; boards phone-level-complete and
// desktop-level-complete): a miniature of the Test round's screen in --stage, split into the
// unlocked zones (rounded outlines in --stage-line), with a ✓ or ✗ badge where each Test-round
// bubble was, and the legend "✓ Hit · ✗ Missed" under it. The miniature keeps the screen's
// proportions and fits its card at any size; badges are 16 px (24 px on a large miniature).
import { h, svg } from '../dom.ts';
import { t } from '../strings.en-GB.ts';
import { stateBadge } from './statusRow.ts';

export interface ZoneMapMark {
  targetPx: readonly [number, number];
  hit: boolean;
}

export interface ZoneMapOptions {
  cols: number;
  rows: number;
  marks: readonly ZoneMapMark[];
  /** The Test round's viewport, CSS px. */
  viewport: { w: number; h: number };
}

/** The zones' names for the label: "top, middle and bottom", "left and right"; null for a 2-D grid. */
export function zoneNames(cols: number, rows: number): string[] | null {
  const names = (n: number, ends: [string, string]) => (n === 2 ? ends : n === 3 ? [ends[0], 'middle', ends[1]] : null);
  if (cols === 1 && rows >= 2) return names(rows, ['top', 'bottom']);
  if (rows === 1 && cols >= 2) return names(cols, ['left', 'right']);
  return null;
}

function mapLabel(o: ZoneMapOptions): string {
  const hits = o.marks.filter((m) => m.hit).length;
  const total = o.marks.length;
  const n = o.cols * o.rows;
  if (n < 1) return t('complete.map.labelNone', { hits, total });
  let zones: string;
  if (n === 1) zones = t('complete.map.zone1');
  else {
    const names = zoneNames(o.cols, o.rows)?.map((k) => t(`complete.zone.${k}`));
    const list = names ? t('complete.map.and', { list: names.slice(0, -1).join(', '), last: names[names.length - 1]! }) : t('complete.map.grid', { cols: o.cols, rows: o.rows });
    zones = t('complete.map.zones', { n, names: list });
  }
  return t('complete.map.label', { zones, hits, total });
}

export interface ZoneMap {
  el: HTMLElement;
  dispose(): void;
}

export function zoneMap(o: ZoneMapOptions): ZoneMap {
  const { w: W, h: H } = o.viewport;
  const map = svg('svg', { class: 'zone-map__mini', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': mapLabel(o), preserveAspectRatio: 'xMidYMid meet', style: `--ar: ${(W / H).toFixed(4)}` });
  const legend = h(
    'p',
    { class: 'zone-map__legend' },
    h('span', null, stateBadge('good', 16), t('complete.map.hit')),
    h('span', null, stateBadge('lost', 16), t('complete.map.missed')),
  );
  const el = h('div', { class: 'zone-map' }, map, legend);
  let drawnScale = 0;

  const draw = () => {
    const shown = map.getBoundingClientRect();
    if (!(shown.width > 0)) return;
    const scale = shown.width / W;
    if (Math.abs(scale - drawnScale) < 1e-3) return;
    drawnScale = scale;
    const u = (px: number) => px / scale;
    const short = Math.min(shown.width, shown.height);
    const large = short >= 300;
    const pad = Math.min(16, Math.max(8, 0.04 * short));
    const parts: SVGElement[] = [svg('rect', { class: 'zone-map__screen', x: 0, y: 0, width: W, height: H, rx: u(large ? 14 : 10) })];
    if (o.cols > 0 && o.rows > 0) {
      const cw = (W - u(pad) * (o.cols + 1)) / o.cols;
      const ch = (H - u(pad) * (o.rows + 1)) / o.rows;
      let k = 0;
      for (let r = 0; r < o.rows; r++) {
        for (let c = 0; c < o.cols; c++) {
          parts.push(
            svg('rect', {
              class: 'zone-map__zone',
              x: u(pad) + c * (cw + u(pad)),
              y: u(pad) + r * (ch + u(pad)),
              width: Math.max(0, cw),
              height: Math.max(0, ch),
              rx: u(large ? 12 : 8),
              'stroke-width': u(1.5),
              style: `--k:${k++}`,
            }),
          );
        }
      }
    }
    // A small miniature (a short phone) shrinks the badges so that neighbours do not overlap.
    const size = u(Math.max(10, Math.min(large ? 24 : 16, 0.16 * shown.width)));
    for (const m of o.marks) {
      const badge = stateBadge(m.hit ? 'good' : 'lost', size, true);
      badge.setAttribute('x', String(m.targetPx[0] - size / 2));
      badge.setAttribute('y', String(m.targetPx[1] - size / 2));
      badge.setAttribute('class', 'zone-map__mark');
      parts.push(badge);
    }
    map.replaceChildren(...parts);
  };
  const observer = new ResizeObserver(draw);
  observer.observe(map);
  requestAnimationFrame(draw);
  return {
    el,
    dispose() {
      observer.disconnect();
    },
  };
}
