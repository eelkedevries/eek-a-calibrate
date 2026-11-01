// The camera-setup meters (specification §7 screen 1, Appendix A SETUP; heuristic thresholds):
// face found; face width 15–60 % of the frame; centred (|dx| ≤ 0.2, |dy| ≤ 0.25); face luma
// 60–200; backlight ≥ 0.8; glare ≤ 2 %; frame rate ≥ 20 Hz; |yaw| and |pitch| ≤ 15°; and the
// 450–850 mm distance band only once the distance has been measured (§14.1.5). Continuing needs
// every meter green for 2 s. Each meter says in words whether it is fine, so colour is never the
// only cue, and what to change when it is not.
import { SETUP } from '../../core/constants.ts';
import { landmarkBounds } from '../../core/face/quality.ts';
import type { FaceObservation } from '../../core/types.ts';
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export type MeterId = 'face' | 'width' | 'centre' | 'luma' | 'backlight' | 'glare' | 'fps' | 'pose' | 'distance';

export interface MeterReading {
  id: MeterId;
  /** null while there is nothing to judge (no face yet, no frame rate yet). */
  ok: boolean | null;
  value: string;
  advice: string | null;
}

export interface SetupSample {
  face: FaceObservation | null;
  /** Frames per second the camera delivers, over the last two seconds; NaN until known. */
  fps: number;
  /** D_t in mm; shown only when `distanceMeasured`. */
  distanceMm: number | null;
  distanceMeasured: boolean;
  /** On a phone the desktop distance band does not apply (§14.2.8: about 30–40 cm). */
  mobile: boolean;
}

const pct = (v: number): string => `${Math.round(100 * v)} %`;
const fixed = (v: number, d = 0): string => (Number.isFinite(v) ? v.toFixed(d) : '—');

/** The readings in display order. Without a face only the face and frame-rate meters can be judged. */
export function evaluateSetup(s: SetupSample): MeterReading[] {
  const out: MeterReading[] = [];
  const f = s.face;
  out.push({ id: 'face', ok: f !== null, value: t(f ? 'meter.value.yes' : 'meter.value.no'), advice: f ? null : t('meter.advice.face') });
  const q = f?.quality;
  const unknown = (id: MeterId): MeterReading => ({ id, ok: null, value: '—', advice: null });
  if (!q || !f) {
    out.push(unknown('width'), unknown('centre'), unknown('luma'), unknown('backlight'), unknown('glare'));
  } else {
    const w = q.faceWidthFrac;
    out.push({
      id: 'width',
      ok: w >= SETUP.faceWidthMin && w <= SETUP.faceWidthMax,
      value: pct(w),
      advice: w < SETUP.faceWidthMin ? t('meter.advice.closer') : w > SETUP.faceWidthMax ? t('meter.advice.further') : null,
    });
    const [dx, dy] = q.centring;
    const okX = Math.abs(dx) <= SETUP.centreX;
    const okY = Math.abs(dy) <= SETUP.centreY;
    // centring is measured on the unmirrored frame: a face right of centre there is on the
    // person's left, so they move to their right to centre it (as in a mirror).
    const adviceX = okX ? null : t(dx > 0 ? 'meter.advice.moveRight' : 'meter.advice.moveLeft');
    const adviceY = okY ? null : t(dy > 0 ? 'meter.advice.moveUp' : 'meter.advice.moveDown');
    out.push({ id: 'centre', ok: okX && okY, value: `${fixed(-dx, 2)}, ${fixed(dy, 2)}`, advice: [adviceX, adviceY].filter(Boolean).join(' ') || null });
    const luma = q.lumaMean;
    out.push({
      id: 'luma',
      ok: luma >= SETUP.lumaMin && luma <= SETUP.lumaMax,
      value: fixed(luma),
      advice: luma < SETUP.lumaMin ? t('meter.advice.darker') : luma > SETUP.lumaMax ? t('meter.advice.brighter') : null,
    });
    out.push({ id: 'backlight', ok: q.backlight >= SETUP.backlightMin, value: fixed(q.backlight, 2), advice: q.backlight >= SETUP.backlightMin ? null : t('meter.advice.backlight') });
    const glareKnown = Number.isFinite(q.glare);
    out.push({ id: 'glare', ok: glareKnown ? q.glare <= SETUP.glareMax : null, value: glareKnown ? `${(100 * q.glare).toFixed(1)} %` : '—', advice: glareKnown && q.glare > SETUP.glareMax ? t('meter.advice.glare') : null });
  }
  const fpsKnown = Number.isFinite(s.fps);
  out.push({ id: 'fps', ok: fpsKnown ? s.fps >= SETUP.fpsMin : null, value: fpsKnown ? `${s.fps.toFixed(1)} Hz` : '—', advice: fpsKnown && s.fps < SETUP.fpsMin ? t('meter.advice.fps') : null });
  if (!f) {
    out.push(unknown('pose'));
  } else {
    const { yawDeg, pitchDeg } = f.pose;
    const ok = Math.abs(yawDeg) <= SETUP.poseMaxDeg && Math.abs(pitchDeg) <= SETUP.poseMaxDeg;
    out.push({ id: 'pose', ok, value: `${fixed(yawDeg)}°, ${fixed(pitchDeg)}°`, advice: ok ? null : t('meter.advice.pose') });
  }
  if (s.distanceMeasured && !s.mobile) {
    const d = s.distanceMm;
    if (d === null || !Number.isFinite(d)) out.push(unknown('distance'));
    else
      out.push({
        id: 'distance',
        ok: d >= SETUP.distMinMm && d <= SETUP.distMaxMm,
        value: `${Math.round(d / 10)} cm`,
        advice: d < SETUP.distMinMm ? t('meter.advice.further') : d > SETUP.distMaxMm ? t('meter.advice.closer') : null,
      });
  }
  return out;
}

/** Every meter green (a meter that cannot be judged is not green). */
export function allGreen(readings: readonly MeterReading[]): boolean {
  return readings.length > 0 && readings.every((r) => r.ok === true);
}

/**
 * "Green for 2 s to continue": true once every meter has been green without a break for
 * SETUP.holdMs. It then stays true (latched), so a later wobble does not take the button away.
 */
export class HoldGate {
  private since: number | null = null;
  ready = false;

  update(green: boolean, nowMs: number, holdMs: number = SETUP.holdMs): boolean {
    if (this.ready) return true;
    if (!green) this.since = null;
    else if (this.since === null) this.since = nowMs;
    if (this.since !== null && nowMs - this.since >= holdMs) this.ready = true;
    return this.ready;
  }

  /** How much of the hold has passed, 0–1. */
  progress(nowMs: number, holdMs: number = SETUP.holdMs): number {
    if (this.ready) return 1;
    return this.since === null ? 0 : Math.min(1, (nowMs - this.since) / holdMs);
  }
}

export const METER_CSS = `
.meters { list-style: none; padding: 0; margin: var(--space-3) 0; display: grid; gap: var(--space-1); max-width: var(--measure); }
.meters li { display: grid; grid-template-columns: 5.5rem 1fr auto; gap: var(--space-2); align-items: baseline; padding: var(--space-1) var(--space-2); border-radius: var(--radius); background: var(--surface); border-left: 4px solid var(--border); }
.meters li.ok { border-left-color: var(--ok); }
.meters li.bad { border-left-color: var(--danger); }
.meters .meter-state { font-weight: 600; font-size: 0.85rem; }
.meters li.ok .meter-state { color: var(--ok); }
.meters li.bad .meter-state { color: var(--danger); }
.meters .meter-value { font-variant-numeric: tabular-nums; color: var(--muted); }
.meters .meter-advice { grid-column: 2 / 4; font-size: 0.9rem; }
.preview-wrap { position: relative; width: min(100%, 32rem); border-radius: var(--radius); overflow: hidden; background: #000; }
.preview-wrap video { display: block; width: 100%; height: auto; }
.preview-wrap .face-box { position: absolute; border: 3px solid var(--ok); border-radius: 0.4rem; pointer-events: none; display: none; }
.preview-wrap .face-box.bad { border-color: var(--warn); border-style: dashed; }
`;

/** Renders the readings as a list. */
export function renderMeters(list: HTMLUListElement, readings: readonly MeterReading[]): void {
  list.replaceChildren(
    ...readings.map((r) =>
      h(
        'li',
        { class: r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'unknown', 'data-meter': r.id },
        h('span', { class: 'meter-state' }, t(r.ok === true ? 'meter.state.ok' : r.ok === false ? 'meter.state.bad' : 'meter.state.unknown')),
        h('span', null, t(`meter.${r.id}`)),
        h('span', { class: 'meter-value' }, r.value),
        r.advice ? h('span', { class: 'meter-advice' }, r.advice) : null,
      ),
    ),
  );
}

/**
 * Places the face box over the mirrored preview: the landmark bounding box with x mirrored
 * (1 − x), in percent of the preview, hidden without a face.
 */
export function placeFaceBox(box: HTMLElement, face: FaceObservation | null, good: boolean): void {
  if (!face) {
    box.style.display = 'none';
    return;
  }
  const b = landmarkBounds(face.landmarks);
  if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  box.style.left = `${(100 * (1 - b.maxX)).toFixed(2)}%`;
  box.style.top = `${(100 * b.minY).toFixed(2)}%`;
  box.style.width = `${(100 * (b.maxX - b.minX)).toFixed(2)}%`;
  box.style.height = `${(100 * (b.maxY - b.minY)).toFixed(2)}%`;
  box.classList.toggle('bad', !good);
}
