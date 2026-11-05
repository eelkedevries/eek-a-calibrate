// The challenge's score chip (design §2.14; boards phone-challenge, phone-landscape-challenge): a
// 40 px dark pill at the camera end of the camera edge with the score in mono 20 medium, the
// streak tag "×1.5" after four pops in a row, and "−50" for 600 ms after a bonk. The score counts
// up over 200 ms after a pop (at once under reduced motion). It fades while a target is near.
import { HUD } from '../../core/game/params.ts';
import { h } from '../dom.ts';
import { nearBox, type AvoidTarget } from './cornerCluster.ts';
import { t } from '../strings.en-GB.ts';

/** Thousands grouped with a no-break space, as the boards write them ("1 820"). */
export function formatScore(n: number): string {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export interface ScoreChip {
  el: HTMLElement;
  set(score: number, streak: boolean): void;
  bonk(): void;
  /** The targets this frame (centre and radius), or null; the chip fades within 96 px of any. */
  avoid(target: AvoidTarget | readonly AvoidTarget[] | null): void;
  readonly shown: number;
  dispose(): void;
}

export function scoreChip(opts: { reducedMotion: boolean; speed: number }): ScoreChip {
  const value = h('span', { class: 'score-chip__value' }, '0');
  const streak = h('span', { class: 'score-chip__streak', hidden: true, 'aria-label': t('challenge.streakLabel') }, t('challenge.streak'));
  const minus = h('span', { class: 'score-chip__bonk', hidden: true }, t('challenge.bonk'));
  const live = h('span', { class: 'sr-only', role: 'status' });
  const el = h('div', { class: 'score-chip' }, value, streak, minus, live);
  let shown = 0;
  let target = 0;
  let raf = 0;
  let bonkTimer: ReturnType<typeof setTimeout> | null = null;
  let box: DOMRect | null = null;
  let faded = false;

  const paint = (v: number) => {
    shown = v;
    value.textContent = formatScore(v);
  };
  const countUp = (from: number, to: number) => {
    cancelAnimationFrame(raf);
    if (opts.reducedMotion || to <= from) {
      paint(to);
      return;
    }
    const start = performance.now();
    const ms = HUD.countUpMs / Math.max(1, opts.speed);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      paint(Math.round(from + (to - from) * p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  return {
    el,
    set(score, active) {
      if (score !== target) {
        const from = shown;
        target = score;
        countUp(from, score);
        live.textContent = t('challenge.score', { score: formatScore(score) });
      }
      streak.hidden = !active;
    },
    bonk() {
      minus.hidden = false;
      if (bonkTimer !== null) clearTimeout(bonkTimer);
      bonkTimer = setTimeout(() => (minus.hidden = true), HUD.bonkFlashMs / Math.max(1, opts.speed));
    },
    avoid(at) {
      let near = false;
      if (at) {
        box ??= el.getBoundingClientRect();
        near = nearBox(box, at, HUD.clearancePx);
      }
      if (near === faded) return;
      faded = near;
      el.toggleAttribute('data-faded', near);
    },
    get shown() {
      return shown;
    },
    dispose() {
      cancelAnimationFrame(raf);
      if (bonkTimer !== null) clearTimeout(bonkTimer);
    },
  };
}
