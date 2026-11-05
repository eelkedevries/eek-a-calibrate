// The corner cluster of the stimulus HUD (design §2.6, §3.7, §4.3–§4.5; spec §17.6.6): the position
// glyph and Pause (a 44 px dark chip), 8 px apart, in the corner farthest from the camera. It fades
// out, and takes no pointer input, while a target is within 96 px of it, so that no control ever
// sits at a target position (§14.2.7). On level cards the glyph sits there alone.
import { h } from '../dom.ts';
import { icon } from '../shell/icons.ts';

/** A target nearer than this to the cluster hides it (design §2.6). */
export const CLEARANCE_PX = 96;

export interface AvoidTarget {
  x: number;
  y: number;
  r: number;
}

/** Whether any target comes within `clearance` px of the box. */
export function nearBox(box: DOMRect, target: AvoidTarget | readonly AvoidTarget[] | null, clearance: number = CLEARANCE_PX): boolean {
  const list: readonly AvoidTarget[] = target === null ? [] : Array.isArray(target) ? target : [target as AvoidTarget];
  return list.some((at) => {
    const dx = Math.max(box.left - at.x, 0, at.x - box.right);
    const dy = Math.max(box.top - at.y, 0, at.y - box.bottom);
    return Math.hypot(dx, dy) - at.r < clearance;
  });
}

export interface CornerCluster {
  el: HTMLElement;
  pause: HTMLButtonElement;
  /** Pause is shown only while a level is in play. */
  setPlaying(playing: boolean): void;
  /** The target or targets this frame (centre and radius, viewport px), or null. */
  avoid(target: AvoidTarget | readonly AvoidTarget[] | null): void;
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
        near = nearBox(box, target);
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
