// The compact position glyph (design §3.7; board position-signals): a 40 px dark chip with a
// face oval, two eye dots drawn relative to home (offsets × 3, spacing by distance) and a 14 px
// state badge. Good is quiet (opacity 0.6); Drifting turns amber; Lost breaks the oval and
// drops the eyes. A symbol, not a video thumbnail. In Free look and the challenge an optional
// nudge pill beside it says what to change in two or three words; in the warm-up it stays silent.
import type { CopyRef, GradeView } from '../../core/position/guard.ts';
import { h, svg } from '../dom.ts';
import { t } from '../strings.en-GB.ts';
import { stateBadge } from './statusRow.ts';

export interface GlyphState {
  glyph: GradeView['glyph'];
  eyes: GradeView['eyes'];
  nudge: CopyRef | null;
}

export interface PositionGlyph {
  el: HTMLElement;
  update(state: GlyphState): void;
}

const tr = (ref: CopyRef) => t(ref.key, ref.vars);

/** The glyph and, with `nudges`, the pill beside it. */
export function positionGlyph(opts: { nudges?: boolean } = {}): PositionGlyph {
  const oval = svg('ellipse', { cx: 20, cy: 19, rx: 8, ry: 10.5, fill: 'none', 'stroke-width': 1.5 });
  const eyeL = svg('circle', { r: 1.6, fill: 'var(--gaze)' });
  const eyeR = svg('circle', { r: 1.6, fill: 'var(--gaze)' });
  const badgeDisc = svg('circle', { cx: 31, cy: 31, r: 7 });
  const badgeInk = svg('g', { fill: 'none', stroke: 'var(--badge-ink)', 'stroke-width': 2, 'stroke-linecap': 'round' });
  const icon = svg('svg', { viewBox: '0 0 40 40', width: 40, height: 40, 'aria-hidden': 'true', focusable: 'false' }, oval, eyeL, eyeR, badgeDisc, badgeInk);
  const glyph = h('div', { class: 'glyph', role: 'img' }, icon);
  const nudgeText = h('span', null);
  const nudge = h('span', { class: 'nudge', role: 'status', hidden: true }, stateBadge('adjust', 14), nudgeText);
  const el = h('div', { class: 'glyph-cluster' }, glyph, opts.nudges ? nudge : null);
  let last = '';

  return {
    el,
    update(s) {
      const key = JSON.stringify(s);
      if (key === last) return;
      last = key;
      glyph.dataset.state = s.glyph;
      const lost = s.glyph === 'lost';
      oval.setAttribute('stroke', s.glyph === 'good' ? 'var(--stage-chip-muted)' : s.glyph === 'drifting' ? 'var(--state-adjust)' : 'var(--state-lost)');
      if (lost) oval.setAttribute('stroke-dasharray', '3 3');
      else oval.removeAttribute('stroke-dasharray');
      eyeL.style.display = lost ? 'none' : '';
      eyeR.style.display = lost ? 'none' : '';
      const half = s.eyes.spacing / 2;
      eyeL.setAttribute('cx', (20 - half + s.eyes.dx).toFixed(2));
      eyeR.setAttribute('cx', (20 + half + s.eyes.dx).toFixed(2));
      for (const e of [eyeL, eyeR]) e.setAttribute('cy', (17.5 + s.eyes.dy).toFixed(2));
      badgeDisc.setAttribute('fill', `var(--state-${s.glyph === 'drifting' ? 'adjust' : s.glyph})`);
      badgeInk.replaceChildren(
        ...(s.glyph === 'good'
          ? [svg('path', { d: 'M27.8 31.2l2.2 2.2 4.2-4.6' })]
          : s.glyph === 'drifting'
            ? [svg('path', { d: 'M31 27.6v3.4' }), svg('circle', { cx: 31, cy: 34, r: 1.1, fill: 'var(--badge-ink)', stroke: 'none' })]
            : [svg('path', { d: 'M28.5 28.5l5 5M33.5 28.5l-5 5' })]),
      );
      const words = s.nudge ? tr(s.nudge) : null;
      glyph.setAttribute(
        'aria-label',
        s.glyph === 'good' ? t('guard.glyph.good') : lost ? t('guard.glyph.lost') : words ? t('guard.glyph.drifting', { nudge: words.toLowerCase() }) : t('guard.glyph.driftingPlain'),
      );
      if (opts.nudges) {
        nudge.hidden = words === null;
        nudgeText.textContent = words ?? '';
      }
    },
  };
}
