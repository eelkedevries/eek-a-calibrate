// The Title's hero (design §2.4; boards Main and desktop-title): the emblem of three bubbles
// (whole, small and mid-pop), drawn in light ink for the dark card, and the level map: one bubble
// node per warm-up level of the chosen length and the Challenge star, each with its pictogram,
// on a dotted line, named underneath. Phones get 48 px nodes in a 326 px map, wider heroes 64 px
// nodes in a 600 px map; CSS shows one of the two.
import type { Preset } from '../../core/types.ts';
import { h, svg } from '../dom.ts';
import { LEVEL_SETS, type LevelKey } from '../shell/levelTrack.ts';
import { t } from '../strings.en-GB.ts';

type Shape = readonly [tag: 'path' | 'circle', attrs: Readonly<Record<string, string | number>>, fill?: 'fill'];

const STAR = 'M12 3.6L14.3 9.6L20.7 10L15.7 14L17.4 20.2L12 16.7L6.6 20.2L8.3 14L3.3 10L9.7 9.6Z';

/** Level pictograms in a 24 box (design §6.1). "Lean in" (Thorough) is not in the kit: the Pop dot between two arrows. */
export const PICTOGRAMS: Readonly<Record<LevelKey | 'challenge', readonly Shape[]>> = {
  pop: [['circle', { cx: 12, cy: 12, r: 8 }], ['circle', { cx: 12, cy: 12, r: 2.2 }, 'fill'], ['path', { d: 'M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4' }]],
  follow: [['path', { d: 'M3 18c3-1 4-7 8-7s5 4 8-1', 'stroke-dasharray': '1.5 2.5' }], ['circle', { cx: 19.5, cy: 9.5, r: 2.5 }, 'fill']],
  turn: [['circle', { cx: 12, cy: 12, r: 2.2 }, 'fill'], ['path', { d: 'M5.1 16A8 8 0 0 1 5.1 8M18.9 8A8 8 0 0 1 18.9 16M8 5.1A8 8 0 0 1 16 5.1M16 18.9A8 8 0 0 1 8 18.9' }]],
  lean: [['circle', { cx: 12, cy: 12, r: 5.5 }], ['circle', { cx: 12, cy: 12, r: 1.8 }, 'fill'], ['path', { d: 'M1.5 12h3.5M3.5 10l2 2-2 2M22.5 12H19M20.5 10l-2 2 2 2' }]],
  test: [['circle', { cx: 11, cy: 11, r: 7 }], ['circle', { cx: 11, cy: 11, r: 2 }, 'fill'], ['path', { d: 'M15.5 18.5l2 2 4-4.5' }]],
  challenge: [['path', { d: STAR }]],
};

/** A pictogram drawn into an SVG group: `scale` from the 24 box, stroked in `colour`. */
function pictogram(key: LevelKey | 'challenge', x: number, y: number, scale: number, strokeWidth: number, colour: string): SVGGElement {
  const g = svg('g', {
    transform: `translate(${x} ${y}) scale(${scale})`,
    fill: 'none',
    stroke: colour,
    'stroke-width': strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  for (const [tag, attrs, fill] of PICTOGRAMS[key]) g.append(svg(tag, fill ? { ...attrs, fill: colour, stroke: 'none' } : attrs));
  return g;
}

/** The emblem: one whole bubble with the ABC dot, a smaller one, one mid-pop. Decorative. */
export function heroEmblem(): SVGSVGElement {
  const dot = (x: number, y: number, k: number) =>
    svg(
      'g',
      { transform: `translate(${x} ${y}) scale(${k})` },
      svg('circle', { r: 12, fill: 'var(--color-text)' }),
      svg('path', { d: 'M-12-1.5h24v3h-24zM-1.5-12h3v24h-3z', fill: 'var(--color-surface)' }),
      svg('path', { d: 'M-12-1.5h24v3h-24zM-1.5-12h3v24h-3z', fill: 'var(--node-done)' }),
      svg('circle', { r: 4, fill: 'var(--color-text)' }),
    );
  return svg(
    'svg',
    { class: 'hero__emblem', viewBox: '0 0 358 184', 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { cx: 130, cy: 104, r: 64, fill: 'var(--node-done)', stroke: 'var(--color-text)', 'stroke-width': 2 }),
    svg('path', { d: 'M92.4 79.6A44.8 44.8 0 0 1 115.4 61.6', fill: 'none', stroke: 'var(--color-text)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    dot(130, 104, 1.5),
    svg('circle', { cx: 232, cy: 62, r: 30, fill: 'var(--node-done)', stroke: 'var(--color-text)', 'stroke-width': 2 }),
    svg('path', { d: 'M214.4 50.6A21 21 0 0 1 225.2 42.1', fill: 'none', stroke: 'var(--color-text)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    dot(232, 62, 0.75),
    svg('circle', { cx: 252, cy: 150, r: 14, fill: 'none', stroke: 'var(--node-line)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }),
    svg('path', {
      d: 'M252 136L252 126M264.1 143L272.8 138M264.1 157L272.8 162M252 164L252 174M239.9 157L231.2 162M239.9 143L231.2 138',
      fill: 'none',
      stroke: 'var(--color-text)',
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
  );
}

/** The map's nodes for a warm-up length: its levels, then the Challenge. */
export function mapKeys(length: Preset): (LevelKey | 'challenge')[] {
  return [...LEVEL_SETS[length], 'challenge'];
}

const SIZES = {
  // Phone: 326 × 48, 48 px nodes, 28 px pictograms (Main board).
  phone: { width: 326, height: 48, r: 23.25, glyph: 28, glyphScale: 1.1667, glyphStroke: 1.3 },
  // Wider heroes: 600 × 64, 64 px nodes, 36 px pictograms (desktop-title board).
  desktop: { width: 600, height: 64, r: 31.25, glyph: 36, glyphScale: 1.5, glyphStroke: 1 },
} as const;

function mapSvg(keys: readonly (LevelKey | 'challenge')[], size: keyof typeof SIZES): SVGSVGElement {
  const s = SIZES[size];
  const step = s.width / keys.length;
  const cy = s.height / 2;
  const xs = keys.map((_, i) => step * (i + 0.5));
  const el = svg('svg', { class: `hero__map-svg hero__map-svg--${size}`, viewBox: `0 0 ${s.width} ${s.height}`, 'aria-hidden': 'true', focusable: 'false' });
  el.append(svg('path', { d: `M${xs[0]} ${cy}H${xs[xs.length - 1]}`, fill: 'none', stroke: 'var(--node-line)', 'stroke-width': 1.5, 'stroke-dasharray': '2 4' }));
  keys.forEach((key, i) => {
    const locked = key === 'challenge';
    el.append(svg('circle', { cx: xs[i]!, cy, r: s.r, fill: 'var(--color-surface)', stroke: locked ? 'var(--node-line)' : 'var(--color-text)', 'stroke-width': 1.5 }));
    const off = s.glyph / 2;
    // The 24 box's pictograms are drawn at 1.1667 or 1.5 and placed 10 or 14 px from the top.
    el.append(pictogram(key, xs[i]! - off, (s.height - s.glyph) / 2, s.glyphScale, s.glyphStroke, locked ? 'var(--color-muted-text)' : 'var(--color-text)'));
  });
  return el;
}

/** The level map with its names: `<ol aria-label="The game">` (the SVG is decorative). */
export function levelMap(length: Preset): HTMLElement {
  const keys = mapKeys(length);
  return h(
    'div',
    { class: 'hero__map', style: `--map-nodes: ${keys.length}` },
    mapSvg(keys, 'phone'),
    mapSvg(keys, 'desktop'),
    h(
      'ol',
      { class: 'hero__names', 'aria-label': t('title.map.label') },
      ...keys.map((key) =>
        h(
          'li',
          null,
          key === 'challenge' ? t('track.star') : t(`track.level.${key}`),
          key === 'challenge' ? h('span', { class: 'sr-only' }, t('title.map.locked')) : null,
        ),
      ),
    ),
  );
}
