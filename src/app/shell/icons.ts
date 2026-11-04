// The drawing kit's icons (design §6.1): a 24 box drawn at 20 px, stroked in currentColor at
// 1.75 px with round caps and joins, aria-hidden. Shapes marked `fill` are the kit's "F"
// (filled with currentColor, no stroke).
import { svg } from '../dom.ts';

type Shape = readonly [tag: 'path' | 'circle' | 'rect', attrs: Readonly<Record<string, string | number>>, fill?: 'fill'];

const ICONS = {
  mark: [['path', { d: 'M2 12c2.6-4.2 6-6.3 10-6.3s7.4 2.1 10 6.3c-2.6 4.2-6 6.3-10 6.3S4.6 16.2 2 12z' }], ['circle', { cx: 12, cy: 12, r: 3.2 }, 'fill']],
  more: [['circle', { cx: 5, cy: 12, r: 1.6 }, 'fill'], ['circle', { cx: 12, cy: 12, r: 1.6 }, 'fill'], ['circle', { cx: 19, cy: 12, r: 1.6 }, 'fill']],
  pause: [['rect', { x: 7, y: 5, width: 3.2, height: 14, rx: 1 }, 'fill'], ['rect', { x: 13.8, y: 5, width: 3.2, height: 14, rx: 1 }, 'fill']],
  play: [['path', { d: 'M8 5.5v13l10.5-6.5z' }, 'fill']],
  sound: [['path', { d: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z' }], ['path', { d: 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11' }]],
  crosshair: [['circle', { cx: 12, cy: 12, r: 7 }], ['path', { d: 'M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4' }]],
  back: [['path', { d: 'M19 12H5M11 6l-6 6 6 6' }]],
  clock: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
  lock: [['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }], ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }]],
  sun: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  alert: [['path', { d: 'M12 6.5v7' }], ['circle', { cx: 12, cy: 17.5, r: 1.2 }, 'fill']],
  cross: [['path', { d: 'M7 7l10 10M17 7L7 17' }]],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v5' }], ['circle', { cx: 12, cy: 7.8, r: 1.1 }, 'fill']],
  propped: [['rect', { x: 8, y: 3, width: 8, height: 14, rx: 1.5 }], ['path', { d: 'M6 21l6-4 6 4' }]],
  inHand: [['rect', { x: 9, y: 2.5, width: 7, height: 12, rx: 1.5 }], ['path', { d: 'M6 12v3.5a5 5 0 0 0 5 5h2.5a4 4 0 0 0 4-4V14' }]],
  webcam: [['rect', { x: 4, y: 5, width: 16, height: 11, rx: 1.5 }], ['path', { d: 'M2 19h20' }], ['circle', { cx: 12, cy: 7.2, r: 0.9 }, 'fill']],
  // Not in the kit: the pager's ‹ › and the bin of "Delete all my data" (design §2.17), drawn in its style.
  chevronLeft: [['path', { d: 'M14.5 6l-6 6 6 6' }]],
  chevronRight: [['path', { d: 'M9.5 6l6 6-6 6' }]],
  bin: [['path', { d: 'M4.5 7h15M10 11v5.5M14 11v5.5M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V4.5h5V7' }]],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

/** One kit icon as an inline SVG, `size` px square (20 by default). */
export function icon(name: IconName, size = 20): SVGSVGElement {
  const el = svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.75,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  for (const [tag, attrs, fill] of ICONS[name] as readonly Shape[]) {
    el.append(svg(tag, fill ? { ...attrs, fill: 'currentColor', stroke: 'none' } : attrs));
  }
  return el;
}
