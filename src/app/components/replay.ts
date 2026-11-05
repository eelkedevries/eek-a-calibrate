// Replay on Round complete (design §2.14): the round's smoothed gaze trail drawn over the zone map
// in 6 s, with a dot at its head; under reduced motion the whole trail appears at once.
import { REPLAY_MS } from '../../core/game/params.ts';
import { svg } from '../dom.ts';

export interface Replay {
  el: SVGGElement;
  play(): void;
  stop(): void;
  readonly playing: boolean;
}

/** At most this many points are drawn; a longer trail is thinned evenly. */
const MAX_POINTS = 600;

export function replay(trail: readonly { x: number; y: number }[], opts: { reducedMotion: boolean; strokeWidth: () => number; onEnd(): void }): Replay {
  const step = Math.max(1, Math.ceil(trail.length / MAX_POINTS));
  const points = trail.filter((_, k) => k % step === 0);
  const line = svg('polyline', { class: 'replay__trail', fill: 'none', points: '' });
  const head = svg('circle', { class: 'replay__head', r: 0, cx: -100, cy: -100 });
  const el = svg('g', { class: 'replay', hidden: true }, line, head);
  let raf = 0;
  let playing = false;

  const draw = (n: number) => {
    const shown = points.slice(0, Math.max(1, n));
    const w = opts.strokeWidth();
    line.setAttribute('points', shown.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
    line.setAttribute('stroke-width', String(3 * w));
    const last = shown[shown.length - 1];
    if (last) {
      head.setAttribute('cx', last.x.toFixed(1));
      head.setAttribute('cy', last.y.toFixed(1));
      head.setAttribute('r', String(7 * w));
      head.setAttribute('stroke-width', String(1.5 * w));
    }
  };

  return {
    el,
    play() {
      cancelAnimationFrame(raf);
      el.removeAttribute('hidden');
      if (points.length === 0) {
        opts.onEnd();
        return;
      }
      if (opts.reducedMotion) {
        draw(points.length);
        opts.onEnd();
        return;
      }
      playing = true;
      const start = performance.now();
      const frame = (now: number) => {
        const p = Math.min(1, (now - start) / REPLAY_MS);
        draw(Math.round(p * points.length));
        if (p < 1) raf = requestAnimationFrame(frame);
        else {
          playing = false;
          opts.onEnd();
        }
      };
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      playing = false;
    },
    get playing() {
      return playing;
    },
  };
}
