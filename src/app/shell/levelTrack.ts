// The level track (design §2.3, spec §17.3.5): one node per warm-up level of the chosen length
// and a star node for the challenge. `trackModel` is pure; the renderers draw it as the 134 × 22
// SVG of bars under 640 px, the labelled `<ol>` of wider bars, and the dot form of the fit
// guard's last tier. The top bar shows whichever its width calls for. Never gold, never pulsing.
import type { Preset } from '../../core/types.ts';
import { h, svg } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export type LevelKey = 'pop' | 'follow' | 'turn' | 'lean' | 'test';

/** The warm-up's levels for each length (design §2.11). */
export const LEVEL_SETS: Readonly<Record<Preset, readonly LevelKey[]>> = {
  quick: ['pop', 'test'],
  standard: ['pop', 'follow', 'turn', 'test'],
  thorough: ['pop', 'follow', 'turn', 'lean', 'test'],
};

/** Where in the game the track is shown (design §2.3, "Where it shows"). */
export type TrackPlace =
  | { screen: 'title' }
  | { screen: 'ready' }
  | { screen: 'level'; level: number }
  | { screen: 'stimulus' }
  | { screen: 'complete'; unlocked: boolean }
  | { screen: 'look' }
  | { screen: 'challenge' };

export type NodeState = 'future' | 'current' | 'done' | 'locked' | 'unlocked' | 'star-current';

export interface TrackNode {
  kind: 'level' | 'star';
  key: LevelKey | 'challenge';
  /** 1-based level number; null for the star. */
  number: number | null;
  name: string;
  state: NodeState;
  /** Visually hidden text before and after the name in the labelled form. */
  srBefore: string;
  srAfter: string;
}

export interface TrackModel {
  /** False on the Title and on stimulus screens: the track is not drawn there. */
  visible: boolean;
  nodes: TrackNode[];
  levels: number;
  /** The phase label left of the nodes, or null (level cards carry "Level 2 of 4" instead). */
  phase: string | null;
  /** True when a node is current: the labelled form then drops the phase label. */
  hasCurrent: boolean;
  /** What a screen reader hears for the compact forms. */
  srText: string;
}

export function trackModel(length: Preset, place: TrackPlace): TrackModel {
  const keys = LEVEL_SETS[length];
  const levels = keys.length;
  const visible = place.screen !== 'title' && place.screen !== 'stimulus';
  const allDone = place.screen === 'complete' || place.screen === 'look' || place.screen === 'challenge';
  const currentLevel = place.screen === 'level' ? Math.min(Math.max(1, Math.round(place.level)), levels) : null;

  const nodes: TrackNode[] = keys.map((key, i) => {
    const number = i + 1;
    let state: NodeState = 'future';
    if (allDone || (currentLevel !== null && number < currentLevel)) state = 'done';
    else if (number === currentLevel) state = 'current';
    const next = place.screen === 'ready' && number === 1;
    return {
      kind: 'level',
      key,
      number,
      name: t(`track.level.${key}`),
      state,
      srBefore: state === 'done' ? '' : t(next ? 'track.item.next' : 'track.item.level', { level: number }),
      srAfter: state === 'done' ? t('track.item.done') : '',
    };
  });

  let star: NodeState = 'locked';
  if (place.screen === 'challenge') star = 'star-current';
  else if (place.screen === 'look' || (place.screen === 'complete' && place.unlocked)) star = 'unlocked';
  nodes.push({
    kind: 'star',
    key: 'challenge',
    number: null,
    name: t('track.star'),
    state: star,
    srBefore: '',
    srAfter: star === 'locked' ? t('track.item.locked') : star === 'unlocked' ? t('track.item.unlocked') : '',
  });

  const phaseKey: Partial<Record<TrackPlace['screen'], string>> = {
    ready: 'track.phase.ready',
    complete: 'track.phase.complete',
    look: 'track.phase.look',
    challenge: 'track.phase.challenge',
  };
  const phase = phaseKey[place.screen] ? t(phaseKey[place.screen]!) : null;

  let srText = '';
  if (place.screen === 'ready') srText = t('track.sr.next', { phase: phase!, levels });
  else if (place.screen === 'level') srText = t('track.levelOf', { level: currentLevel!, levels });
  else if (place.screen === 'complete' || place.screen === 'look') srText = t(star === 'unlocked' ? 'track.sr.unlocked' : 'track.sr.locked', { phase: phase! });
  else if (place.screen === 'challenge') srText = t('track.sr.challenge');

  return { visible, nodes, levels, phase, hasCurrent: nodes.some((n) => n.state === 'current' || n.state === 'star-current'), srText };
}

/** Width of the compact SVG: 22 px nodes 28 px apart (134 px for five nodes). */
export function compactWidth(nodeCount: number): number {
  return nodeCount <= 0 ? 0 : 22 + 28 * (nodeCount - 1);
}

const STAR_22 = 'M11 5.1L12.6 9.3L17.1 9.5L13.6 12.3L14.8 16.7L11 14.2L7.2 16.7L8.4 12.3L4.9 9.5L9.4 9.3Z';
const STAR_24 = 'M12 5.5L13.7 10.1L18.7 10.3L14.8 13.4L16.1 18.2L12 15.4L7.9 18.2L9.2 13.4L5.3 10.3L10.3 10.1Z';

/** One node drawn in a box of `size` (22 compact, 24 labelled) centred at (cx, cy). */
function drawNode(node: TrackNode, cx: number, cy: number, size: 22 | 24): SVGElement[] {
  const r = size / 2;
  const ring = r - 0.75;
  const out: SVGElement[] = [];
  const numberY = cy + 5;
  const star = (fill: string, stroke: string) =>
    svg('path', {
      d: size === 22 ? STAR_22 : STAR_24,
      transform: `translate(${cx - r} ${cy - r})`,
      fill,
      stroke,
      'stroke-width': stroke === 'none' ? null : 1.5,
      'stroke-linejoin': 'round',
    });
  switch (node.state) {
    case 'future':
      out.push(svg('circle', { cx, cy, r: ring, fill: 'none', stroke: 'var(--node-line)', 'stroke-width': 1.5 }));
      out.push(svg('text', { x: cx, y: numberY, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 500, fill: 'var(--color-muted-text)' }, String(node.number)));
      break;
    case 'current':
      out.push(svg('circle', { cx, cy, r, fill: 'var(--color-text)' }));
      out.push(svg('text', { x: cx, y: numberY, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 500, fill: 'var(--color-background)' }, String(node.number)));
      break;
    case 'done':
      out.push(svg('circle', { cx, cy, r, fill: 'var(--node-done)' }));
      out.push(svg('path', { d: `M${cx - 4.5} ${cy + 0.5}l3 3 6-6.5`, fill: 'none', stroke: 'var(--color-text)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      break;
    case 'locked':
      out.push(svg('circle', { cx, cy, r: ring, fill: 'none', stroke: 'var(--node-line)', 'stroke-width': 1.5 }));
      out.push(star('none', 'var(--color-muted-text)'));
      break;
    case 'unlocked':
      out.push(svg('circle', { cx, cy, r: ring, fill: 'none', stroke: 'var(--color-text)', 'stroke-width': 1.5 }));
      out.push(star('none', 'var(--color-text)'));
      break;
    case 'star-current':
      out.push(svg('circle', { cx, cy, r, fill: 'var(--color-text)' }));
      out.push(star('var(--color-background)', 'none'));
      break;
  }
  return out;
}

/** The compact form: nodes only, 22 px tall (bars under 640 px, level and round cards). */
export function compactTrack(model: TrackModel): SVGSVGElement {
  const width = compactWidth(model.nodes.length);
  const el = svg('svg', { width, height: 22, viewBox: `0 0 ${width} 22`, 'aria-hidden': 'true', focusable: 'false' });
  const connectors = model.nodes.slice(1).map((_, i) => `M${22 + 28 * i} 11h6`).join('');
  if (connectors) el.append(svg('path', { d: connectors, stroke: 'var(--node-line)', 'stroke-width': 1.5 }));
  model.nodes.forEach((node, i) => el.append(...drawNode(node, 11 + 28 * i, 11, 22)));
  return el;
}

/** The fit guard's last tier: 8 px dots, the current node a 16 × 8 pill, no numbers. */
export function dotTrack(model: TrackModel): SVGSVGElement {
  const widths = model.nodes.map((n) => (n.state === 'current' || n.state === 'star-current' ? 16 : 8));
  const width = widths.reduce((a, b) => a + b, 0) + 6 * (widths.length - 1);
  const el = svg('svg', { width, height: 8, viewBox: `0 0 ${width} 8`, 'aria-hidden': 'true', focusable: 'false' });
  let x = 0;
  model.nodes.forEach((node, i) => {
    const w = widths[i]!;
    if (w === 16) el.append(svg('rect', { x, y: 0, width: 16, height: 8, rx: 4, fill: 'var(--color-text)' }));
    else if (node.state === 'done' || node.state === 'unlocked') el.append(svg('circle', { cx: x + 4, cy: 4, r: 4, fill: 'var(--color-muted-text)' }));
    else el.append(svg('circle', { cx: x + 4, cy: 4, r: 3.25, fill: 'none', stroke: 'var(--node-line)', 'stroke-width': 1.5 }));
    x += w + 6;
  });
  return el;
}

/** The labelled form for bars of 640 px and more: `<ol aria-label="Game progress">`. */
export function labelledTrack(model: TrackModel): HTMLOListElement {
  const list = h('ol', { class: 'track__list', 'aria-label': t('track.label') });
  model.nodes.forEach((node, i) => {
    const node24 = svg('svg', { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, ...drawNode(node, 12, 12, 24));
    const current = node.state === 'current' || node.state === 'star-current';
    list.append(
      h(
        'li',
        { class: 'track__item', 'aria-current': current ? 'step' : null },
        i > 0 ? h('span', { class: 'track__connector', 'aria-hidden': 'true' }) : null,
        node24,
        h(
          'span',
          { class: 'track__name' },
          node.srBefore ? h('span', { class: 'sr-only' }, node.srBefore) : null,
          node.name,
          node.srAfter ? h('span', { class: 'sr-only' }, node.srAfter) : null,
        ),
      ),
    );
  });
  return list;
}

/**
 * The track as the top bar shows it: the phase label (hidden from screen readers, which hear the
 * position text instead), then the compact, labelled and dot forms, of which CSS shows one.
 */
export function trackElement(model: TrackModel): HTMLElement {
  return h(
    'div',
    { class: 'track', 'data-current': model.hasCurrent ? '' : null },
    model.phase ? h('span', { class: 'track__phase', 'aria-hidden': 'true' }, model.phase) : null,
    model.phase ? h('span', { class: 'track__divider', 'aria-hidden': 'true' }) : null,
    h('div', { class: 'track__compact' }, compactTrack(model), h('span', { class: 'sr-only' }, model.srText)),
    h('div', { class: 'track__wide' }, model.phase && !model.hasCurrent ? h('span', { class: 'sr-only' }, `${model.phase}.`) : null, labelledTrack(model)),
    h('div', { class: 'track__dots' }, dotTrack(model), h('span', { class: 'sr-only' }, model.srText)),
  );
}
