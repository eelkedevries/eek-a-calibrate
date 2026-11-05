// Round complete (design §2.14; board desktop-challenge): framed and dark, inside the presentation.
// The stage card holds the round's zone map, a miniature of the screen in --stage split into the
// zones, each with its pops ("5 of 5", mono) and a mark (✓ 80 % or more, ~ from 50 %, ✗ below;
// heuristic), and Replay in its corner; the panel holds the eyebrow, the stars, the headline, one
// sentence and the score line. The screen adds the actions.
import type { Rect } from '../../core/game/board.ts';
import type { RoundSummary, ZoneMark } from '../../core/game/stats.ts';
import { h, svg } from '../dom.ts';
import { icon } from '../shell/icons.ts';
import { t } from '../strings.en-GB.ts';
import { replay } from './replay.ts';
import { stateBadge } from './statusRow.ts';

export interface RoundCompleteOptions {
  summary: RoundSummary;
  zoneRects: readonly Rect[];
  viewport: { w: number; h: number };
  trail: readonly { x: number; y: number }[];
  /** The zones' names for the map's label, by index. */
  zoneNames: readonly string[];
  eyebrow: string;
  headline: string;
  sentence: string;
  scoreLine: string;
  reducedMotion: boolean;
}

export interface RoundCompleteView {
  stage: HTMLElement;
  panel: HTMLElement;
  replayButton: HTMLButtonElement;
  dispose(): void;
}

/** The ~ badge: a wave on a --state-adjust disc (design board desktop-challenge). */
function waveBadge(size: number): SVGSVGElement {
  const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: 'badge' });
  el.append(
    svg('circle', { cx: 12, cy: 12, r: 11.25, fill: 'var(--state-adjust)', stroke: 'var(--stage-ink)', 'stroke-width': 1.5 }),
    svg('path', { d: 'M6.5 13c1.8-2.4 3.6-2.4 5.5 0s3.7 2.4 5.5 0', fill: 'none', stroke: 'var(--badge-ink)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
  );
  return el;
}

function markBadge(mark: ZoneMark, size: number): SVGSVGElement | null {
  if (mark === 'none') return null;
  if (mark === 'ok') return waveBadge(size);
  return stateBadge(mark === 'good' ? 'good' : 'lost', size, true);
}

function starsRow(n: number): HTMLElement {
  const STAR = 'M12 3.6L14.3 9.6L20.7 10L15.7 14L17.4 20.2L12 16.7L6.6 20.2L8.3 14L3.3 10L9.7 9.6Z';
  return h(
    'div',
    { class: 'stars', role: 'img', 'aria-label': n === 1 ? t('challenge.done.stars1') : t('challenge.done.stars', { n }) },
    ...[0, 1, 2].map((k) => svg('svg', { class: 'star', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', 'data-on': k < n ? '' : null, style: `--k:${k}` }, svg('path', { d: STAR, 'stroke-linejoin': 'round' }))),
  );
}

export function roundComplete(o: RoundCompleteOptions): RoundCompleteView {
  const { w: W, h: H } = o.viewport;
  const label = o.summary.zones.map((z) => t('challenge.done.mapZone', { zone: o.zoneNames[z.zone] ?? '', popped: z.popped, bubbles: z.bubbles })).join(', ');
  const map = svg('svg', { class: 'round-map__mini', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('challenge.done.map', { zones: label }), preserveAspectRatio: 'xMidYMid meet', style: `--ar: ${(W / H).toFixed(4)}` });
  const body = svg('g');
  let scale = 1;
  const trail = replay(o.trail, { reducedMotion: o.reducedMotion, strokeWidth: () => 1 / scale, onEnd: () => replayButton.removeAttribute('aria-pressed') });
  map.append(body, trail.el);
  const replayButton = h('button', { type: 'button', class: 'icon-btn round-map__replay', 'aria-label': t('challenge.done.replay') }, icon('play'));
  replayButton.addEventListener('click', () => {
    replayButton.setAttribute('aria-pressed', 'true');
    trail.play();
  });
  const stage = h(
    'section',
    { class: 'stage round-stage' },
    replayButton,
    h('div', { class: 'round-map' }, map, h('p', { class: 'round-map__caption' }, t('challenge.done.caption'))),
  );
  let drawn = 0;
  const draw = () => {
    const shown = map.getBoundingClientRect();
    if (!(shown.width > 0)) return;
    const s = shown.width / W;
    if (Math.abs(s - drawn) < 1e-3) return;
    drawn = s;
    scale = s;
    const u = (px: number) => px / s;
    const short = Math.min(shown.width, shown.height);
    const large = short >= 260;
    const parts: SVGElement[] = [svg('rect', { class: 'round-map__screen', x: 0, y: 0, width: W, height: H, rx: u(14) })];
    for (const z of o.summary.zones) {
      const r = o.zoneRects[z.zone];
      if (!r) continue;
      parts.push(svg('rect', { class: 'round-map__zone', x: r.x, y: r.y, width: r.w, height: r.h, rx: u(12), 'stroke-width': u(1.5), style: `--k:${z.zone}` }));
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const font = u(Math.max(12, Math.min(large ? 20 : 16, (0.16 * shown.width * r.w) / W)));
      parts.push(svg('text', { class: 'round-map__count', x: cx, y: cy, 'font-size': font, 'text-anchor': 'middle' }, t('challenge.done.count', { popped: z.popped, bubbles: z.bubbles })));
      const size = u(large ? 24 : 18);
      const badge = markBadge(z.mark, size);
      if (badge) {
        badge.setAttribute('x', String(cx - size / 2));
        badge.setAttribute('y', String(cy + u(14)));
        badge.setAttribute('class', 'round-map__mark');
        parts.push(badge);
      }
    }
    body.replaceChildren(...parts);
  };
  const observer = new ResizeObserver(draw);
  observer.observe(map);
  requestAnimationFrame(draw);
  const panel = h(
    'div',
    { class: 'panel round-panel' },
    h('p', { class: 'round-panel__eyebrow' }, o.eyebrow),
    starsRow(o.summary.stars),
    h('h1', { class: 'panel__title round-panel__headline' }, o.headline),
    h('p', { class: 'complete__sentence round-panel__sentence' }, o.sentence),
    h('p', { class: 'round-panel__score' }, o.scoreLine),
  );
  return {
    stage,
    panel,
    replayButton,
    dispose() {
      observer.disconnect();
      trail.stop();
    },
  };
}
