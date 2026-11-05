// The corner cluster of the stimulus HUD (design §2.6, §3.7, §4.3–§4.5; spec §17.6.6): the position
// glyph and Pause (a 44 px dark chip), 8 px apart, in the corner farthest from the camera. It fades
// out, and takes no pointer input, while a target is within 96 px of it, so that no control ever
// sits at a target position (§14.2.7). On level cards the glyph sits there alone.
import { h } from '../dom.ts';
import { icon } from '../shell/icons.ts';

/** A target nearer than this to the cluster hides it (design §2.6). */
export const CLEARANCE_PX = 96;

export interface CornerCluster {
  el: HTMLElement;
  pause: HTMLButtonElement;
  /** Pause is shown only while a level is in play. */
  setPlaying(playing: boolean): void;
  /** The target this frame (centre and radius, viewport px), or null. */
  avoid(target: { x: number; y: number; r: number } | null): void;
  /** Forgets the measured box (after a resize). */
  remeasure(): void;
}

export function cornerCluster(glyph: HTMLElement, label: string, onPause: () => void): CornerCluster {
  const pause = h('button', { type: 'button', class: 'corner__pause', 'aria-label': label }, icon('pause'));
  pause.addEventListener('click', (e) => {
    e.stopPropagation();
    onPause();
  });
  const el = h('div', { class: 'corner' }, glyph, pause);
  let box: DOMRect | null = null;
  let faded = false;

  return {
    el,
    pause,
    setPlaying(playing) {
      pause.hidden = !playing;
      box = null;
      if (!playing) this.avoid(null);
    },
    avoid(target) {
      let near = false;
      if (target) {
        box ??= el.getBoundingClientRect();
        const dx = Math.max(box.left - target.x, 0, target.x - box.right);
        const dy = Math.max(box.top - target.y, 0, target.y - box.bottom);
        near = Math.hypot(dx, dy) - target.r < CLEARANCE_PX;
      }
      if (near === faded) return;
      faded = near;
      el.toggleAttribute('data-faded', near);
      el.toggleAttribute('inert', near);
    },
    remeasure() {
      box = null;
    },
  };
}
