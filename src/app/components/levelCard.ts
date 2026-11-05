// A level card (design §2.6; board desktop-level1-pop): a dark chip card centred on the grey with
// the previous level's steadiness line, the track (nodes only, this level current) and "Level n
// of N", the level's pictogram, name, rule and hint, the 3 s countdown ring that starts the level
// by itself (÷ speed in test mode; a static ring under reduced motion, the digit still counting),
// "Start now", the Sound toggle in its corner and, on the pursuit card under reduced motion,
// "Skip this level". A tap anywhere or Space starts the level at once. role="dialog". The
// challenge's round cards (design §2.14) are the same card with their own count line, pictogram
// and meta line (components/roundCard.ts).
import { compactTrack, type TrackModel } from '../shell/levelTrack.ts';
import { h, svg } from '../dom.ts';
import { icon } from '../shell/icons.ts';
import { t } from '../strings.en-GB.ts';
import { stateBadge } from './statusRow.ts';

export const COUNTDOWN_MS = 3000;
const RING_R = 17;
const RING_LENGTH = 2 * Math.PI * RING_R;

export type Pictogram = 'pop' | 'follow' | 'turn' | 'lean' | 'test';

type Shape = readonly [tag: 'path' | 'circle', attrs: Readonly<Record<string, string | number>>, fill?: 'fill'];

/** The level pictograms of design §6.1 (a 24 box drawn at 48 px, stroke 1.5). Lean in uses Pop's. */
const PICTOGRAMS: Readonly<Record<Pictogram, readonly Shape[]>> = {
  pop: [['circle', { cx: 12, cy: 12, r: 8 }], ['circle', { cx: 12, cy: 12, r: 2.2 }, 'fill'], ['path', { d: 'M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4' }]],
  follow: [['path', { d: 'M3 18c3-1 4-7 8-7s5 4 8-1', 'stroke-dasharray': '1.5 2.5' }], ['circle', { cx: 19.5, cy: 9.5, r: 2.5 }, 'fill']],
  turn: [['circle', { cx: 12, cy: 12, r: 2.2 }, 'fill'], ['path', { d: 'M5.1 16A8 8 0 0 1 5.1 8M18.9 8A8 8 0 0 1 18.9 16M8 5.1A8 8 0 0 1 16 5.1M16 18.9A8 8 0 0 1 8 18.9' }]],
  lean: [['circle', { cx: 12, cy: 12, r: 8 }], ['circle', { cx: 12, cy: 12, r: 2.2 }, 'fill'], ['path', { d: 'M7.6 9.2a5.2 5.2 0 0 1 2.6-2.4' }]],
  test: [['circle', { cx: 11, cy: 11, r: 7 }], ['circle', { cx: 11, cy: 11, r: 2 }, 'fill'], ['path', { d: 'M15.5 18.5l2 2 4-4.5' }]],
};

export function pictogram(name: Pictogram, size = 48): SVGSVGElement {
  const el = svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'level-card__picto',
  });
  for (const [tag, attrs, fill] of PICTOGRAMS[name]) el.append(svg(tag, fill ? { ...attrs, fill: 'currentColor', stroke: 'none' } : attrs));
  return el;
}

export interface LevelCardOptions {
  track: TrackModel;
  level: number;
  levels: number;
  pictogram: Pictogram;
  name: string;
  rule: string;
  hint: string;
  /** The previous level's steadiness line (cards 2 onwards). */
  clear: { level: number; line: string } | null;
  sound: boolean;
  onSound(on: boolean): void;
  /** Test-mode speed factor: the countdown is divided by it. */
  speed: number;
  reducedMotion: boolean;
  /** Offers "Skip this level" (the pursuit under reduced motion). */
  skippable: boolean;
  /** Where a tap anywhere starts the level (the screen's root). */
  tapArea: HTMLElement;
  /** A fixture shows the card frozen at its start. */
  frozen?: boolean;
  /** Round cards: "Round 1 of 3" in place of "Level n of N". */
  count?: string;
  /** Round cards: a drawn pictogram in place of a level's. */
  picto?: SVGSVGElement;
  /** Round cards: "16 bubbles · about 1 minute" under the hint. */
  meta?: string;
}

export interface LevelCard {
  el: HTMLElement;
  /** 'start' (by itself, Start now, a tap or Space) or 'skip'. */
  result: Promise<'start' | 'skip'>;
  /** Holds the countdown while the position guard has paused (it starts again from 3 s). */
  hold(on: boolean): void;
  dispose(): void;
}

let cards = 0;

export function levelCard(o: LevelCardOptions): LevelCard {
  const n = ++cards;
  const total = COUNTDOWN_MS / Math.max(1, o.speed);
  const digit = svg('text', { x: 20, y: 25.5, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 500, fill: 'currentColor', class: 'level-card__digit' }, '3');
  const arc = svg('circle', {
    cx: 20,
    cy: 20,
    r: RING_R,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 3,
    'stroke-linecap': 'round',
    'stroke-dasharray': RING_LENGTH.toFixed(1),
    'stroke-dashoffset': 0,
    transform: 'rotate(-90 20 20)',
  });
  const timer = h(
    'div',
    { class: 'level-card__timer', role: 'timer', 'aria-label': t('warmup.card.startsIn', { seconds: 3 }) },
    svg('svg', { viewBox: '0 0 40 40', width: 40, height: 40, 'aria-hidden': 'true', focusable: 'false' }, svg('circle', { cx: 20, cy: 20, r: RING_R, fill: 'none', stroke: 'var(--node-line)', 'stroke-width': 3 }), arc, digit),
  );
  const startNow = h('button', { type: 'button', class: 'btn btn--ghost level-card__start' }, t('warmup.card.startNow'));
  const skip = o.skippable ? h('button', { type: 'button', class: 'btn btn--chip level-card__skip' }, t('warmup.card.skip')) : null;
  const sound = h('button', { type: 'button', class: 'icon-btn level-card__sound', 'aria-label': t('warmup.card.sound'), 'aria-pressed': String(o.sound) }, icon('sound'));
  const titleId = `level-card-title-${n}`;
  const ruleId = `level-card-rule-${n}`;
  const el = h(
    'section',
    { class: 'stim-card level-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-describedby': ruleId },
    sound,
    o.clear ? h('p', { class: 'level-card__clear' }, stateBadge('good', 16), t('warmup.card.clear', { level: o.clear.level, line: o.clear.line })) : null,
    h('div', { class: 'stim-card__progress' }, compactTrack(o.track), h('p', { class: 'stim-card__count' }, o.count ?? t('warmup.card.levelOf', { level: o.level, levels: o.levels }))),
    o.picto ?? pictogram(o.pictogram),
    h('h2', { class: 'stim-card__title', id: titleId }, o.name),
    h('p', { class: 'level-card__rule', id: ruleId }, o.rule),
    h('p', { class: 'level-card__hint' }, o.hint),
    o.meta ? h('p', { class: 'level-card__hint level-card__meta' }, o.meta) : null,
    h('div', { class: 'level-card__go' }, timer, startNow),
    skip,
  );

  let resolve: (v: 'start' | 'skip') => void = () => {};
  const result = new Promise<'start' | 'skip'>((r) => (resolve = r));
  let done = false;
  let held = false;
  let started = performance.now();
  let raf = 0;
  let lastSecond = 3;
  const finish = (v: 'start' | 'skip') => {
    if (done) return;
    done = true;
    cleanup();
    resolve(v);
  };
  const tick = () => {
    if (done) return;
    const now = performance.now();
    if (held) started = now;
    const left = Math.max(0, total - (now - started));
    const second = Math.max(1, Math.ceil((left / total) * 3));
    if (second !== lastSecond) {
      lastSecond = second;
      digit.textContent = String(second);
      timer.setAttribute('aria-label', second === 1 ? t('warmup.card.startsIn1') : t('warmup.card.startsIn', { seconds: second }));
    }
    if (!o.reducedMotion) arc.setAttribute('stroke-dashoffset', (RING_LENGTH * (1 - left / total)).toFixed(2));
    if (left <= 0) finish('start');
    else raf = requestAnimationFrame(tick);
  };

  startNow.addEventListener('click', (e) => {
    e.stopPropagation();
    finish('start');
  });
  skip?.addEventListener('click', (e) => {
    e.stopPropagation();
    finish('skip');
  });
  sound.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = sound.getAttribute('aria-pressed') !== 'true';
    sound.setAttribute('aria-pressed', String(on));
    o.onSound(on);
  });
  const onTap = (e: Event) => {
    if (held) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, dialog, .pause')) return;
    finish('start');
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== ' ' || e.repeat || held) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('dialog') || (target?.closest('button') && target !== startNow)) return;
    e.preventDefault();
    finish('start');
  };
  o.tapArea.addEventListener('click', onTap);
  document.addEventListener('keydown', onKey);
  const cleanup = () => {
    cancelAnimationFrame(raf);
    o.tapArea.removeEventListener('click', onTap);
    document.removeEventListener('keydown', onKey);
  };
  if (!o.frozen) raf = requestAnimationFrame(tick);

  return {
    el,
    result,
    hold(on) {
      if (held === on) return;
      held = on;
      if (!on) started = performance.now();
    },
    dispose() {
      if (!done) {
        done = true;
        cleanup();
      }
      el.remove();
    },
  };
}
