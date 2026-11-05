// Free look's soft gaze disc (spec §17.8.1, design §2.13, §6.1): a disc in --gaze-soft with a
// 1.5 px --gaze-outline edge at the filtered gaze point, its radius the 68th percentile of the
// player's Test-round error in px. It fades with the frame's confidence, and greys out with a
// dashed edge while the head is outside the calibrated range (OUT_OF_RANGE, §4.10).
import { svg } from '../dom.ts';

export interface DiscState {
  x: number;
  y: number;
  r: number;
  /** 0–1. */
  confidence: number;
  greyed: boolean;
  visible: boolean;
}

export interface GazeDisc {
  el: SVGCircleElement;
  update(s: DiscState): void;
}

/** The disc never fades below this, so that a low-confidence gaze is still seen. */
const MIN_OPACITY = 0.35;

export function gazeDisc(): GazeDisc {
  const el = svg('circle', { class: 'gaze-disc', r: 0, cx: -100, cy: -100 });
  return {
    el,
    update(s) {
      el.toggleAttribute('data-hidden', !s.visible);
      if (!s.visible) return;
      el.setAttribute('cx', s.x.toFixed(1));
      el.setAttribute('cy', s.y.toFixed(1));
      el.setAttribute('r', s.r.toFixed(1));
      el.toggleAttribute('data-greyed', s.greyed);
      const c = Number.isFinite(s.confidence) ? Math.min(1, Math.max(0, s.confidence)) : 1;
      el.style.opacity = (MIN_OPACITY + (1 - MIN_OPACITY) * c).toFixed(2);
    },
  };
}
