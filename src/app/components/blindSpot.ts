// The blind-spot test (specification §4.4; Li et al. 2020, after jsPsych's virtual chinrest): with
// the right eye covered, the left eye fixates a black square at (0.85·W, 0.5·H) while a red dot
// moves left from it at 1.5°/s (at an assumed 600 mm until the distance is known); the person
// presses Space, or the large "It disappeared" button, when the dot vanishes. Each trial gives
// the square-to-dot distance in CSS px. A dot that reaches the edge unseen is a missed trial and
// is run again. The test fills the viewport; Esc or "Stop the test" cancels it.
import { BLIND_SPOT, MOBILE } from '../../core/constants.ts';
import { BLIND_SPOT_DIRECTION, blindSpotSquarePx, dotSpeedPxPerS } from '../../core/geometry/blindSpot.ts';
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export const BLIND_SPOT_CSS = `
.blind-spot { position: fixed; inset: 0; z-index: 2147483000; background: #ffffff; color: #000000; touch-action: none; user-select: none; -webkit-user-select: none; overscroll-behavior: none; }
.blind-spot canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.blind-spot .bs-text { position: absolute; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 0.75rem); width: min(40rem, calc(100% - 18rem)); margin: 0; text-align: center; font-size: 1rem; line-height: 1.4; }
.blind-spot .bs-count { font-weight: 600; }
.blind-spot button { font: inherit; border-radius: 0.5rem; border: 2px solid #000; background: #fff; color: #000; }
.blind-spot .bs-stop { position: absolute; right: calc(env(safe-area-inset-right, 0px) + 0.5rem); top: calc(env(safe-area-inset-top, 0px) + 0.5rem); min-width: ${MOBILE.minTouchPx}px; min-height: ${MOBILE.minTouchPx}px; padding: 0.25rem 0.75rem; font-size: 0.9rem; }
.blind-spot .bs-respond { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem); min-height: max(${MOBILE.minTouchPx}px, 4rem); width: min(26rem, calc(100% - 2rem)); font-size: 1.15rem; font-weight: 600; background: #000; color: #fff; }
.blind-spot :focus-visible { outline: 3px solid #0058a3; outline-offset: 2px; }
@media (max-width: 40rem) { .blind-spot .bs-text { top: calc(env(safe-area-inset-top, 0px) + ${MOBILE.minTouchPx}px + 1rem); width: calc(100% - 2rem); } }
`;

export interface BlindSpotOptions {
  pxPerMm: number;
  /** Trials wanted (5, §4.4). */
  trials?: number;
  /** Missed trials in a row before the test gives up. */
  maxMisses?: number;
}

export type BlindSpotOutcome = { kind: 'done'; offsetsPx: number[] } | { kind: 'cancelled' } | { kind: 'missed' };

/** Square side and dot diameter: about 4 mm and 3 mm, never under 12 and 10 CSS px. */
function sizes(pxPerMm: number): { square: number; dot: number } {
  return { square: Math.max(12, 4 * pxPerMm), dot: Math.max(10, 3 * pxPerMm) };
}

/**
 * Runs the trials on a full-viewport overlay appended to `container` and resolves with the
 * offsets. The overlay is removed whatever the outcome; `cancel()` ends it from outside.
 */
export function runBlindSpot(container: HTMLElement, opts: BlindSpotOptions): { done: Promise<BlindSpotOutcome>; cancel(): void } {
  const trials = opts.trials ?? BLIND_SPOT.trials;
  const maxMisses = opts.maxMisses ?? 3;
  const speed = dotSpeedPxPerS(opts.pxPerMm, null);
  const size = sizes(opts.pxPerMm);
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const count = h('span', { class: 'bs-count' });
  const text = h('span');
  const respond = h('button', { type: 'button', class: 'bs-respond' });
  const stop = h('button', { type: 'button', class: 'bs-stop' }, t('distance.bs.stop'));
  const el = h(
    'div',
    { class: 'blind-spot', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('distance.bs.title') },
    canvas,
    h('p', { class: 'bs-text', 'aria-live': 'polite' }, count, ' ', text),
    stop,
    respond,
  );
  container.append(el);
  const ctx = canvas.getContext('2d');

  const offsets: number[] = [];
  let misses = 0;
  let moving: { startMs: number } | null = null;
  let raf = 0;
  let finished = false;
  let resolveDone: (o: BlindSpotOutcome) => void = () => {};
  const done = new Promise<BlindSpotOutcome>((resolve) => {
    resolveDone = resolve;
  });

  const viewport = (): { w: number; h: number } => ({ w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight });

  const draw = (dotX: number | null): void => {
    if (!ctx) return;
    const { w, h: hgt } = viewport();
    const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, hgt);
    const [sx, sy] = blindSpotSquarePx(w, hgt);
    ctx.fillStyle = '#000000';
    ctx.fillRect(sx - size.square / 2, sy - size.square / 2, size.square, size.square);
    if (dotX !== null) {
      ctx.beginPath();
      ctx.arc(dotX, sy, size.dot / 2, 0, 2 * Math.PI);
      ctx.fillStyle = '#d00000';
      ctx.fill();
    }
  };

  const showIdle = (key: 'distance.bs.ready' | 'distance.bs.missed'): void => {
    count.textContent = t('distance.bs.count', { k: offsets.length + 1, n: trials });
    text.textContent = t(key);
    respond.textContent = t('distance.bs.start');
    draw(null);
  };

  const finish = (outcome: BlindSpotOutcome): void => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    el.remove();
    resolveDone(outcome);
  };

  const frame = (now: number): void => {
    if (!moving || finished) return;
    const { w, h: hgt } = viewport();
    const [sx] = blindSpotSquarePx(w, hgt);
    const elapsedS = Math.max(0, now - moving.startMs) / 1000;
    const x = sx + BLIND_SPOT_DIRECTION * speed * elapsedS;
    if (x < size.dot / 2) {
      // The dot reached the edge without a response: the trial is run again.
      moving = null;
      misses++;
      if (misses >= maxMisses) finish({ kind: 'missed' });
      else showIdle('distance.bs.missed');
      return;
    }
    draw(x);
    raf = requestAnimationFrame(frame);
  };

  const press = (): void => {
    if (finished) return;
    if (!moving) {
      moving = { startMs: performance.now() };
      text.textContent = t('distance.bs.watch');
      respond.textContent = t('distance.bs.disappeared');
      raf = requestAnimationFrame(frame);
      return;
    }
    const now = performance.now();
    const elapsedS = Math.max(0, now - moving.startMs) / 1000;
    moving = null;
    cancelAnimationFrame(raf);
    offsets.push(speed * elapsedS);
    misses = 0;
    if (offsets.length >= trials) finish({ kind: 'done', offsetsPx: [...offsets] });
    else showIdle('distance.bs.ready');
  };

  // Space and Enter anywhere respond (the moment matters, not the focus); the click that a
  // focused button fires for the same key is then ignored, so one key press is one response.
  let keyPressAt = Number.NEGATIVE_INFINITY;
  const onKey = (e: KeyboardEvent): void => {
    if (e.target === stop && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      keyPressAt = performance.now();
      press();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish({ kind: 'cancelled' });
    }
  };
  const onResize = (): void => {
    if (!moving) draw(null);
  };
  respond.addEventListener('click', () => {
    if (performance.now() - keyPressAt < 500) return;
    press();
  });
  stop.addEventListener('click', () => finish({ kind: 'cancelled' }));
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  showIdle('distance.bs.ready');
  respond.focus({ preventScroll: true });
  return { done, cancel: () => finish({ kind: 'cancelled' }) };
}
