// The auto-pause overlay (design §3.8; board position-signals): a --stage-scrim over the frozen
// stage and a dark card at the camera edge (top-centre in portrait and on desktop, the camera
// side on a phone held sideways) with the eyebrow "Paused", a small mirrored live preview with
// the dashed ghost of home and the live outline and eye dots, one headline relative to home,
// "Carries on by itself", Exit, and after 10 s a second action. role="alertdialog"; focus moves
// to it, so its first headline is announced at once; later headlines go to a polite region.
//
// attachPositionGuard wires a guard (core/position/guard.ts) to the overlay, the compact glyph,
// the haptics and the sounds, for the levels, Free look and the challenge (015, 016).
import type { CopyRef, GradeView, PositionGuard } from '../../core/position/guard.ts';
import type { Home } from '../../core/position/home.ts';
import type { FaceGeometry } from '../../core/position/signals.ts';
import type { GuardContext } from '../../core/position/thresholds.ts';
import type { CameraSession } from '../../platform/camera.ts';
import { HAPTICS, playSound, vibrate } from '../../platform/feedback.ts';
import { h, svg } from '../dom.ts';
import { t } from '../strings.en-GB.ts';
import { positionGlyph, type PositionGlyph } from './positionGlyph.ts';

export interface PauseOverlayOptions {
  /** Where the overlay is mounted (the stage or the app shell). */
  host: HTMLElement;
  /** The live camera for the small preview; null shows the ghost alone. */
  camera: CameraSession | null;
  /** The warm-up offers "Get ready again" after 10 s; Free look and the challenge "Warm up again". */
  context: GuardContext;
  onExit(): void;
  onExtra(): void;
}

export interface PauseFrame {
  view: GradeView;
  /** The face now and at home, in frame px (unmirrored), for the preview. */
  live: FaceGeometry | null;
  home: Home | null;
  /** The camera's frame size when no face says it. */
  videoW: number;
  videoH: number;
}

export interface PauseOverlay {
  readonly shown: boolean;
  update(frame: PauseFrame): void;
  hide(): void;
  dispose(): void;
}

let ids = 0;
const tr = (ref: CopyRef | null) => (ref ? t(ref.key, ref.vars) : '');

/**
 * Frame px → preview px for a mirrored preview of `pw` × `ph` that covers the box and is zoomed
 * on home, so that home's outline fills about two thirds of a portrait preview (half of a
 * landscape one), as on the board; the frame always covers the whole box.
 */
export function previewMap(vw: number, vh: number, pw: number, ph: number, home: FaceGeometry | null) {
  const cover = Math.max(pw / vw, ph / vh);
  let s = cover;
  let ox = (pw - vw * s) / 2;
  let oy = (ph - vh * s) / 2;
  if (home && home.outline.ry > 0) {
    const share = ph > pw ? 0.68 : 0.5;
    s = cover * Math.min(2.5, Math.max(1, (share * ph) / (2 * home.outline.ry * cover)));
    const clamp = (v: number, lo: number) => Math.min(0, Math.max(lo, v));
    ox = clamp(pw / 2 - (vw - home.outline.cx) * s, pw - vw * s);
    oy = clamp(ph / 2 - home.outline.cy * s, ph - vh * s);
  }
  return { s, ox, oy, w: vw * s, h: vh * s, x: (px: number) => ox + (vw - px) * s, y: (py: number) => oy + py * s };
}

export function pauseOverlay(opts: PauseOverlayOptions): PauseOverlay {
  const n = ++ids;
  const video = opts.camera ? opts.camera.createPreview('pause__video') : null;
  const overlaySvg = svg('svg', { class: 'pause__marks', 'aria-hidden': 'true', focusable: 'false' });
  const preview = h('div', { class: 'pause__preview', role: 'img', 'aria-label': t('guard.pause.preview') }, video, overlaySvg);
  const title = h('h2', { class: 'pause__title', id: `pause-title-${n}` });
  const body = h('p', { class: 'pause__body', id: `pause-body-${n}` }, t('guard.pause.byItself'));
  const polite = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const exit = h('button', { type: 'button', class: 'btn btn--ghost' }, t('guard.pause.exit'));
  const warmup = opts.context === 'warmup' || opts.context === 'warmup-head' || opts.context === 'reaim';
  const extra = h('button', { type: 'button', class: 'btn btn--chip', hidden: true }, t(warmup ? 'guard.pause.getReady' : 'guard.pause.warmUp'));
  exit.addEventListener('click', () => opts.onExit());
  extra.addEventListener('click', () => opts.onExtra());
  const card = h(
    'section',
    { class: 'pause__card', role: 'alertdialog', 'aria-modal': 'false', 'aria-labelledby': title.id, 'aria-describedby': body.id, tabindex: '-1' },
    h('p', { class: 'pause__eyebrow' }, t('guard.pause.eyebrow')),
    preview,
    title,
    body,
    h('div', { class: 'pause__actions' }, exit, extra),
    polite,
  );
  card.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onExit();
    }
  });
  const el = h('div', { class: 'pause', hidden: true }, h('div', { class: 'pause__scrim', 'aria-hidden': 'true' }), card);
  opts.host.append(el);
  let shown = false;
  let lastTitle = '';

  const drawMarks = (frame: PauseFrame) => {
    const pw = preview.clientWidth || 180;
    const ph = preview.clientHeight || 240;
    overlaySvg.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
    const vw = frame.live?.videoW ?? frame.home?.geometry?.videoW ?? frame.videoW;
    const vh = frame.live?.videoH ?? frame.home?.geometry?.videoH ?? frame.videoH;
    const m = previewMap(vw, vh, pw, ph, frame.home?.geometry ?? null);
    if (video) Object.assign(video.style, { left: `${m.ox}px`, top: `${m.oy}px`, width: `${m.w}px`, height: `${m.h}px` });
    const parts: SVGElement[] = [];
    const ellipse = (g: FaceGeometry, attrs: Record<string, string | number>) =>
      svg('ellipse', { cx: m.x(g.outline.cx), cy: m.y(g.outline.cy), rx: g.outline.rx * m.s, ry: g.outline.ry * m.s, transform: `rotate(${-g.outline.angleDeg} ${m.x(g.outline.cx)} ${m.y(g.outline.cy)})`, fill: 'none', ...attrs });
    if (frame.home?.geometry) parts.push(ellipse(frame.home.geometry, { stroke: 'var(--color-text)', 'stroke-opacity': 0.7, 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
    if (frame.live) {
      parts.push(ellipse(frame.live, { stroke: 'var(--halo)', 'stroke-width': 4 }), ellipse(frame.live, { stroke: 'var(--color-text)', 'stroke-width': 2 }));
      for (const [x, y] of frame.live.eyes) parts.push(svg('circle', { cx: m.x(x), cy: m.y(y), r: 5, fill: 'var(--gaze)', stroke: 'var(--gaze-outline)', 'stroke-width': 1 }));
    }
    overlaySvg.replaceChildren(...parts);
  };

  return {
    get shown() {
      return shown;
    },
    update(frame) {
      const headline = tr(frame.view.headline) || t('guard.pause.intoView');
      // "The phone has moved" carries its own tip in the body line (design §3.9).
      const tip = t(frame.view.headline?.key === 'guard.pause.phone' ? 'guard.pause.phoneTip' : 'guard.pause.byItself');
      if (body.textContent !== tip) body.textContent = tip;
      if (headline !== lastTitle) {
        title.textContent = headline;
        // The first headline is read with the dialog when focus moves to it; later ones politely.
        if (shown) polite.textContent = headline;
        lastTitle = headline;
      }
      extra.hidden = !frame.view.extra;
      drawMarks(frame);
      if (!shown) {
        shown = true;
        el.hidden = false;
        card.focus({ preventScroll: true });
        drawMarks(frame);
      }
    },
    hide() {
      if (!shown) return;
      shown = false;
      el.hidden = true;
      polite.textContent = '';
      lastTitle = '';
    },
    dispose() {
      if (video && opts.camera) opts.camera.releasePreview(video);
      el.remove();
    },
  };
}

export interface AttachedGuard {
  glyph: PositionGlyph;
  overlay: PauseOverlay;
  dispose(): void;
}

/**
 * One guard drives the glyph and the overlay (spec §17.5.3): a pause shows the overlay with a
 * [30, 60, 30] vibration and the two-tone sound (when sound is on); resuming hides it with the
 * chime. The screen pauses and resumes its own stimulus through guard.onPause and guard.onResume.
 */
export function attachPositionGuard(guard: PositionGuard, opts: PauseOverlayOptions & { sound: boolean; videoW: number; videoH: number }): AttachedGuard {
  const glyph = positionGlyph({ nudges: opts.context === 'look' || opts.context === 'challenge' });
  const overlay = pauseOverlay(opts);
  const offs = [
    guard.onChange((s) => {
      glyph.update({ glyph: s.view.glyph, eyes: s.view.eyes, nudge: s.view.nudge });
      if (s.view.phase === 'running') overlay.hide();
      else overlay.update({ view: s.view, live: s.signals?.geometry ?? null, home: s.home, videoW: opts.videoW, videoH: opts.videoH });
    }),
    guard.onPause(() => {
      vibrate(HAPTICS.pause);
      if (opts.sound) playSound('pause');
    }),
    guard.onResume(() => {
      if (opts.sound) playSound('chime');
    }),
  ];
  return {
    glyph,
    overlay,
    dispose() {
      for (const off of offs) off();
      overlay.dispose();
      glyph.el.remove();
    },
  };
}
