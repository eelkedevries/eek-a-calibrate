// The no-scroll app shell (design §4.1–§4.5, spec §17.3). The router renders every game route
// into one `.app` element: 100svh in normal flow, clipped, padded by the safe areas, with exactly
// one flexible region. A screen's mode (design §2.2) picks the grid: framed (a stage card and a
// panel), immersive (an edge-to-edge stage under a floating bar, cue and dock) or stimulus (the
// grey stage alone). CSS switches layouts by aspect ratio (5/4) and height (480 px), never by
// orientation or user agent; the only orientation read here is the camera side of a phone held
// sideways (design §4.4).
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

/** Game routes use the shell; legacy routes keep the v1 page until 018; document pages scroll. */
export type ShellLayout = 'game' | 'legacy' | 'document';
export type ShellMode = 'framed' | 'immersive' | 'stimulus' | 'document';
export type LayoutClass = 'portrait' | 'compact' | 'regular';

/** The template a window gets (design §4.3–§4.5). */
export function layoutClass(width: number, height: number): LayoutClass {
  if (width < (5 / 4) * height) return 'portrait';
  return height < 480 ? 'compact' : 'regular';
}

/**
 * Which side the camera is on when a phone is held sideways: `screen.orientation.angle` 90 puts
 * it on the left, 270 on the right (design §4.4; still to be checked on devices, §17.12).
 */
export function cameraSideFromAngle(angle: number): 'left' | 'right' {
  const a = ((angle % 360) + 360) % 360;
  return a === 270 ? 'right' : 'left';
}

export function cameraSide(): 'left' | 'right' {
  const angle = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 90;
  return cameraSideFromAngle(angle);
}

/** Marks the document for the layout shown, which decides whether html and body may scroll. */
export function setLayout(layout: ShellLayout): void {
  document.documentElement.dataset.layout = layout;
}

let cleanups: (() => void)[] = [];
let watchingCamera = false;

/** Registers work to undo when the current screen goes (fit guards, listeners). */
export function addCleanup(fn: () => void): void {
  cleanups.push(fn);
}

export function runCleanups(): void {
  const pending = cleanups;
  cleanups = [];
  for (const fn of pending) {
    try {
      fn();
    } catch (error) {
      console.warn('Shell cleanup failed', error);
    }
  }
}

/** Empties `.app` and sets the screen and mode it is about to show. */
export function prepareShell(app: HTMLElement, screenId: string, mode: ShellMode): void {
  runCleanups();
  app.replaceChildren();
  app.dataset.screen = screenId;
  setMode(app, mode);
  app.dataset.camera = cameraSide();
  if (!watchingCamera) {
    watchingCamera = true;
    const update = () => {
      for (const el of document.querySelectorAll<HTMLElement>('.app')) el.dataset.camera = cameraSide();
    };
    screen.orientation?.addEventListener('change', update);
    window.addEventListener('resize', update);
  }
}

/** Switches a screen's mode in place (a challenge round ends on the framed Round complete). */
export function setMode(app: HTMLElement, mode: ShellMode): void {
  app.dataset.mode = mode;
  app.classList.toggle('on-stage', mode === 'immersive' || mode === 'stimulus');
}

/** Clears `.app` when a legacy route takes over. */
export function resetShell(app: HTMLElement): void {
  runCleanups();
  app.replaceChildren();
  delete app.dataset.screen;
  delete app.dataset.mode;
}

/** The placeholder frames' way back to the Title (secondary on dark, chip style on the grey). */
export function backToStart(surface: 'dark' | 'chip'): HTMLAnchorElement {
  return h('a', { class: `btn ${surface === 'chip' ? 'btn--chip' : 'btn--secondary'}`, href: '#/' }, t('shell.placeholder.back'));
}
