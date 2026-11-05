// The stimulus (specification §4.7, §14.2): one full-viewport stage with a canvas drawn in
// requestAnimationFrame, instruction cards, pause overlays, the progress bar and the corner
// Pause and Abort buttons; and the block runner that presents the items of a schedule. An item's
// onsetMs is the rAF timestamp of the first frame that shows it, and its offsetMs that of the
// first frame without it.
//
// The v1 stage lives on <body>, outside the router's outlet, so that calibration can hand a
// fullscreen stage straight to validation without a new user gesture. The warm-up levels (spec
// §17.6) embed a stage in the game shell instead and run the same runner with game hooks: the
// bubble, the firefly and the head arcs in place of the ring and the pose guide (`?target=ring`
// keeps the ring), a 150 ms pop between items, pauses waited out by the screen's own cards and
// the position guard, and progress reported to the pip line rather than drawn.
import { FIXATION, HEAD_BLOCK } from '../../core/constants.ts';
import { layoutToPx } from '../../core/geometry/screen.ts';
import type { FrameRecorder } from '../../core/protocol/labelling.ts';
import { pursuitTargetAt } from '../../core/protocol/pursuit.ts';
import type { Presentation, PursuitItem, ScreenGeometry, TargetItem } from '../../core/types.ts';
import { bubbleRadius, popProgress, type BubbleSizes } from '../../core/warmup/bubble.ts';
import type { Invalidation, Presentation as Block } from '../../platform/presentation.ts';
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';
import { drawBubble, drawBurst, type GameColours } from './bubble.ts';
import { drawFirefly, FIREFLY_R, trailSegments, TRAIL_MS } from './firefly.ts';
import { ArcProgress, arcsExtent, drawHeadArcs } from './headArcs.ts';
import { drawPoseGuide, SectorTracker } from './poseGuide.ts';
import { drawTarget, ringDiameterPx, type TargetSizes } from './target.ts';

const STAGE_CSS = `
.stimulus-stage { position: fixed; inset: 0; z-index: 2147483000; background: var(--stimulus-bg); color: #000; overflow: hidden; display: none; }
.stimulus-stage.active { display: block; }
.stimulus-stage canvas { position: absolute; left: 0; top: 0; display: block; }
.stimulus-progress { position: absolute; left: 0; top: 0; height: 4px; background: rgba(0, 0, 0, 0.45); width: 0; pointer-events: none; }
.stimulus-caption { position: absolute; left: 50%; bottom: max(12%, calc(env(safe-area-inset-bottom, 0px) + 1rem)); transform: translateX(-50%); margin: 0; max-width: min(36rem, 90%); padding: 0.4rem 0.8rem; text-align: center; background: rgba(255, 255, 255, 0.75); color: #000; border-radius: 0.4rem; font-size: 1.05rem; pointer-events: none; }
.stimulus-caption.top { top: calc(env(safe-area-inset-top, 0px) + 60px); bottom: auto; }
.stimulus-caption:empty { display: none; }
.stimulus-controls { position: absolute; inset: 0; pointer-events: none; }
.stimulus-controls button { pointer-events: auto; position: absolute; min-width: 44px; min-height: 44px; padding: 0.25rem 0.6rem; font-size: 0.85rem; background: rgba(255, 255, 255, 0.55); color: #000; border: 1px solid rgba(0, 0, 0, 0.35); border-radius: 0.4rem; }
.stimulus-controls .stimulus-pause { left: calc(env(safe-area-inset-left, 0px) + 8px); top: calc(env(safe-area-inset-top, 0px) + 8px); }
.stimulus-controls .stimulus-abort { right: calc(env(safe-area-inset-right, 0px) + 8px); top: calc(env(safe-area-inset-top, 0px) + 8px); }
.stimulus-controls[hidden] { display: none; }
.stimulus-layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.stimulus-layer:empty { display: none; }
.stimulus-card { max-width: 34rem; width: 100%; max-height: 100%; overflow: auto; background: var(--surface); color: var(--fg); border-radius: var(--radius); padding: 1.25rem 1.5rem; box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.35); cursor: pointer; }
.stimulus-card h2 { margin-top: 0; }
.stimulus-card .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
.stimulus-card button { min-height: 44px; min-width: 44px; }
.stimulus-card .hint { color: var(--muted); font-size: 0.9rem; }
.stimulus-stage.stimulus-stage--game { position: absolute; z-index: auto; display: block; background: var(--stage); }
.stimulus-stage--game .stimulus-controls, .stimulus-stage--game .stimulus-progress, .stimulus-stage--game .stimulus-caption { display: none; }
`;

function injectStyle(): void {
  if (document.getElementById('stimulus-style')) return;
  document.head.append(h('style', { id: 'stimulus-style' }, STAGE_CSS));
}

let cardCount = 0;

export interface CardAction {
  label: string;
  value: string;
  secondary?: boolean;
}

export interface CardOptions {
  title: string;
  body: readonly string[];
  /** The first action is the default: Space, Enter, or a tap anywhere on the card. */
  actions: readonly CardAction[];
  hint?: string;
  role?: 'dialog' | 'alertdialog';
}

/** The stage: canvas, caption, progress bar, corner controls and a layer for cards. */
export class StimulusStage {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layer: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;
  private readonly caption: HTMLParagraphElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly abortButton: HTMLButtonElement;
  /** The corner buttons' boxes in stage px, measured once per label change. */
  private buttonBoxes: { b: HTMLButtonElement; left: number; top: number; right: number; bottom: number }[] | null = null;
  private geometry: ScreenGeometry | null = null;
  private closeCard: ((value: string) => void) | null = null;
  onPause: () => void = () => {};
  onAbort: () => void = () => {};

  /** `game`: embedded in the game shell by the warm-up screen, which draws its own HUD. */
  constructor(opts: { game?: boolean } = {}) {
    injectStyle();
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw on a canvas.');
    this.ctx = ctx;
    this.progressBar = h('div', { class: 'stimulus-progress', role: 'progressbar', 'aria-label': t('stimulus.progress'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 });
    this.caption = h('p', { class: 'stimulus-caption', 'aria-live': 'polite' });
    this.pauseButton = h('button', { type: 'button', class: 'stimulus-pause', onclick: () => this.onPause() }, t('stimulus.pause'));
    this.abortButton = h('button', { type: 'button', class: 'stimulus-abort', onclick: () => this.onAbort() }, t('stimulus.abort'));
    this.controls = h('div', { class: 'stimulus-controls', hidden: true }, this.pauseButton, this.abortButton);
    this.layer = h('div', { class: 'stimulus-layer' });
    this.el = h(
      'div',
      { class: `stimulus-stage${opts.game ? ' stimulus-stage--game' : ''}`, role: opts.game ? null : 'region', 'aria-label': opts.game ? null : t('stimulus.label'), 'aria-hidden': opts.game ? 'true' : null },
      this.canvas,
      this.progressBar,
      this.caption,
      this.controls,
      this.layer,
    );
  }

  show(): void {
    this.el.classList.add('active');
  }

  /** Sizes the canvas to the block's viewport (CSS px) at the device pixel ratio. */
  configure(g: ScreenGeometry): void {
    this.geometry = g;
    const dpr = g.dpr > 0 ? g.dpr : 1;
    this.canvas.style.width = `${g.viewportWpx}px`;
    this.canvas.style.height = `${g.viewportHpx}px`;
    this.canvas.width = Math.max(1, Math.round(g.viewportWpx * dpr));
    this.canvas.height = Math.max(1, Math.round(g.viewportHpx * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clear();
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  colours(): { bg: string; fg: string } {
    const cs = getComputedStyle(this.el);
    return { bg: cs.getPropertyValue('--stimulus-bg').trim() || '#808080', fg: cs.getPropertyValue('--stimulus-fg').trim() || '#000000' };
  }

  /** Overrides the background `clear()` paints (the game's --stage). */
  background: string | null = null;

  clear(): void {
    const g = this.geometry;
    if (!g) return;
    this.ctx.fillStyle = this.background ?? this.colours().bg;
    this.ctx.fillRect(0, 0, g.viewportWpx, g.viewportHpx);
  }

  /** The next animation frame's timestamp (performance.now() domain). */
  frame(): Promise<number> {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  setControls(visible: boolean, paused = false): void {
    this.controls.hidden = !visible;
    this.pauseButton.textContent = t(paused ? 'stimulus.resume' : 'stimulus.pause');
    this.buttonBoxes = null;
    for (const b of [this.pauseButton, this.abortButton]) b.style.removeProperty('visibility');
  }

  /**
   * Hides a corner button for as long as it would cover the target disc of radius `radiusPx`
   * centred on (x, y), so that no button is ever at a target position (§14.2.7). On a phone in
   * landscape the corner targets sit under the corner buttons otherwise.
   */
  avoidTarget(x: number, y: number, radiusPx: number): void {
    if (this.controls.hidden) return;
    this.buttonBoxes ??= [this.pauseButton, this.abortButton].map((b) => ({
      b,
      left: b.offsetLeft,
      top: b.offsetTop,
      right: b.offsetLeft + b.offsetWidth,
      bottom: b.offsetTop + b.offsetHeight,
    }));
    for (const box of this.buttonBoxes) {
      const dx = Math.max(box.left - x, 0, x - box.right);
      const dy = Math.max(box.top - y, 0, y - box.bottom);
      const covers = dx * dx + dy * dy < radiusPx * radiusPx;
      if ((box.b.style.visibility === 'hidden') !== covers) box.b.style.visibility = covers ? 'hidden' : '';
    }
  }

  /** The caption sits at the bottom, or at the top when the target is in the lower half, so that it never covers it. */
  setCaption(text: string, place: 'top' | 'bottom' = 'bottom'): void {
    if (this.caption.textContent !== text) this.caption.textContent = text;
    this.caption.classList.toggle('top', place === 'top');
  }

  setProgress(fraction: number): void {
    const pct = Math.round(100 * Math.min(1, Math.max(0, fraction)));
    this.progressBar.style.width = `${pct}%`;
    this.progressBar.setAttribute('aria-valuenow', String(pct));
  }

  /**
   * Shows a card and resolves with the chosen action's value: the default action on Space, Enter,
   * or a tap or click anywhere on the card outside its buttons. Escape chooses an action whose
   * value is 'abort', if there is one. `dismissCard` closes it from outside.
   */
  card(opts: CardOptions): Promise<string> {
    this.dismissCard('superseded');
    return new Promise<string>((resolve) => {
      const first = opts.actions[0];
      if (!first) throw new Error('card: at least one action is needed');
      const titleId = `stimulus-card-${++cardCount}`;
      const buttons = opts.actions.map((a) =>
        h('button', { type: 'button', class: a.secondary ? 'secondary' : null, 'data-value': a.value, onclick: (e: Event) => { e.stopPropagation(); finish(a.value); } }, a.label),
      );
      const card = h(
        'div',
        { class: 'stimulus-card', role: opts.role ?? 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, onclick: () => finish(first.value) },
        h('h2', { id: titleId }, opts.title),
        ...opts.body.map((p) => h('p', null, p)),
        opts.hint ? h('p', { class: 'hint' }, opts.hint) : null,
        h('div', { class: 'actions' }, ...buttons),
      );
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === ' ' || e.key === 'Enter') {
          // Enter on a focused button activates that button instead.
          if (e.key === 'Enter' && e.target instanceof HTMLButtonElement && buttons.includes(e.target)) return;
          e.preventDefault();
          finish(first.value);
        } else if (e.key === 'Escape' && opts.actions.some((a) => a.value === 'abort')) {
          e.preventDefault();
          finish('abort');
        }
      };
      const finish = (value: string): void => {
        if (this.closeCard !== finish) return;
        this.closeCard = null;
        document.removeEventListener('keydown', onKey, true);
        card.remove();
        resolve(value);
      };
      this.closeCard = finish;
      document.addEventListener('keydown', onKey, true);
      this.layer.replaceChildren(card);
      (buttons[0] as HTMLButtonElement).focus({ preventScroll: true });
    });
  }

  dismissCard(value: string): void {
    this.closeCard?.(value);
  }

  get cardOpen(): boolean {
    return this.closeCard !== null;
  }

  destroy(): void {
    this.dismissCard('closed');
    this.el.remove();
  }
}

let shared: StimulusStage | null = null;

/** The stage, created and attached to <body> if needed, and shown. */
export function acquireStage(): StimulusStage {
  if (!shared || !shared.el.isConnected) {
    shared = new StimulusStage();
    document.body.append(shared.el);
  }
  shared.show();
  return shared;
}

export function currentStage(): StimulusStage | null {
  return shared && shared.el.isConnected ? shared : null;
}

export function releaseStage(): void {
  shared?.destroy();
  shared = null;
}

// ----- The block runner ------------------------------------------------------------------

export type PauseReason = 'manual' | 'face' | 'hidden' | 'guard';

/** How the warm-up levels draw and pause (spec §17.6); absent for the v1 screens. */
export interface GameHooks {
  /** The bubble (default) or the §4.7 ring (`?target=ring`, the pilot of §17.12). */
  style: 'bubble' | 'ring';
  bubble: BubbleSizes;
  /** The static bubble's radius in Turn your head (32 px on phones, 40 px on larger screens). */
  headR: number;
  colours: GameColours;
  /** Limited head movement halves the head block's sector targets (§17.6.5). */
  limitedHead: boolean;
  /** A pause began; the screen shows its card (manual, hidden page) or the guard's overlay. */
  paused(reason: PauseReason): void;
  /** The pause ended (Carry on, P again, the guard's resume, or an abort or invalidation). */
  resumed(): void;
  /** Items done of this level's total (a retried bubble adds one), and the pursuit's fraction. */
  progress(done: number, total: number, fraction: number | null): void;
  /** The target this frame (centre and the radius it reaches), or null between items. */
  target(at: { x: number; y: number; r: number } | null): void;
  /** A bubble popped (the soft pop and the 15 ms haptic). */
  pop(): void;
  /** Turn your head's caption chip under the arcs: a string key, or null to hide it. */
  caption(key: string | null, at: { x: number; y: number; r: number } | null): void;
}

export interface RunContext {
  stage: StimulusStage;
  block: Block;
  geometry: ScreenGeometry;
  recorder: FrameRecorder;
  sizes: TargetSizes;
  reducedMotion: boolean;
  /** Test-mode speed factor: every duration, the ring's included, is divided by it. */
  speed: number;
  /** Fewer accepted frames than this, or an acceptance rate below 50 %, fails a fixation item. */
  minFrames: number;
  /** Retry a failed fixation item once at the end of its block (calibration). */
  retry: boolean;
  /** Extend sampling up to maxSampleMs until minFrames frames are accepted (calibration). */
  extend: boolean;
  /** True when no face has been seen for more than 400 ms of capture time. */
  faceLost(): boolean;
  /** The latest head pose, for the pose guide. */
  pose(): { yawDeg: number; pitchDeg: number } | null;
  /** The warm-up levels' drawing and pausing; the v1 ring, pose guide and cards without it. */
  game?: GameHooks;
}

export type RunOutcome = { kind: 'done' } | { kind: 'aborted' } | { kind: 'invalid'; invalidation: Invalidation };

type ItemOutcome = { kind: 'complete'; accepted: number; labelled: number } | { kind: 'interrupted' } | { kind: 'aborted' } | { kind: 'invalid'; invalidation: Invalidation };

/** How long a face must be back before a face-lost pause ends by itself. */
const FACE_BACK_MS = 500;

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/**
 * Presents blocks of items on the stage and records their presentations through the recorder's
 * labeller. A pause (the Pause button or P, a face lost for more than 400 ms, a hidden page; in
 * the warm-up levels also the position guard) interrupts the item on screen; it is shown again
 * from its start once the pause ends. An invalidation of the block (fullscreen left, an
 * orientation, size, pixel-ratio or zoom change) or Abort (the button or Esc) ends the run.
 */
export class BlockRunner {
  private readonly c: RunContext;
  private paused: PauseReason | null = null;
  private abortRequested = false;
  private invalidation: Invalidation | null = null;
  private readonly attempts = new Map<string, number>();
  private readonly offs: (() => void)[] = [];
  /** While a game-mode pause is waited out: ends it with 'resume', 'abort' or 'invalid'. */
  private release: ((value: string) => void) | null = null;
  /** The item on screen, for the test hooks. */
  current: { itemId: string; phase: string } | null = null;
  done = 0;
  total = 0;
  /** Bubbles shown again at the end of their block (the steadiness line counts them). */
  retried = 0;

  constructor(c: RunContext) {
    this.c = c;
    c.stage.configure(c.geometry);
    if (c.game) c.stage.background = c.game.colours.stage;
    c.stage.onPause = () => (this.paused === 'manual' ? this.resume() : this.pause('manual'));
    c.stage.onAbort = () => this.abort();
    this.offs.push(c.block.onInvalidate((inv) => this.invalidate(inv)));
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') this.pause('hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.offs.push(() => document.removeEventListener('visibilitychange', onVisibility));
    const onKey = (e: KeyboardEvent): void => {
      if (this.c.stage.cardOpen) return;
      // Keys in a dialog (the Details sheet over a paused level) belong to it: Esc closes the sheet.
      if (e.target instanceof Element && e.target.closest('dialog')) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (this.paused === 'manual') this.resume();
        else this.pause('manual');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.abort();
      }
    };
    document.addEventListener('keydown', onKey);
    this.offs.push(() => document.removeEventListener('keydown', onKey));
  }

  /** The pause in effect, if any. */
  get pauseReason(): PauseReason | null {
    return this.paused;
  }

  pause(reason: PauseReason): void {
    if (this.paused === null) this.paused = reason;
  }

  /**
   * Ends a pause. With a reason, only a pause of that reason ends (the guard's resume never ends
   * the player's own pause). A pause that the item loop has not reached yet is simply cancelled.
   */
  resume(reason?: PauseReason): void {
    if (reason && this.paused !== reason) return;
    if (this.release) this.release('resume');
    else if (this.c.game) this.paused = null;
    else this.c.stage.dismissCard('resume');
  }

  abort(): void {
    this.abortRequested = true;
    this.release?.('abort');
    this.c.stage.dismissCard('abort');
  }

  invalidate(inv: Invalidation): void {
    if (this.invalidation) return;
    this.invalidation = inv;
    this.release?.('invalid');
    this.c.stage.dismissCard('invalid');
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.c.stage.setControls(false);
    this.c.stage.setCaption('');
    this.c.game?.target(null);
    this.c.game?.caption(null, null);
  }

  /** Shows an instruction card between blocks; resolves false when the run was aborted or invalidated. */
  async instruction(title: string, body: readonly string[]): Promise<boolean> {
    this.c.stage.setControls(false);
    this.c.stage.clear();
    const value = await this.c.stage.card({
      title,
      body,
      hint: t('stimulus.continueHint'),
      actions: [
        { label: t('stimulus.continue'), value: 'continue' },
        { label: t('stimulus.abort'), value: 'abort', secondary: true },
      ],
    });
    if (value === 'abort') this.abortRequested = true;
    return !this.abortRequested && this.invalidation === null;
  }

  outcome(): RunOutcome | null {
    if (this.invalidation) return { kind: 'invalid', invalidation: this.invalidation };
    if (this.abortRequested) return { kind: 'aborted' };
    return null;
  }

  private reportProgress(fraction: number | null = null): void {
    if (this.c.game) this.c.game.progress(this.done, this.total, fraction);
    else this.c.stage.setProgress(this.total > 0 ? this.done / this.total : 1);
  }

  /** Presents the items of one block in order, then the failed fixation items once more (when `retry`). */
  async runBlock(items: readonly (TargetItem | PursuitItem)[]): Promise<RunOutcome> {
    const queue = [...items];
    const retried = new Set<string>();
    if (!this.c.game) this.c.stage.setControls(true);
    else this.reportProgress();
    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i] as TargetItem | PursuitItem;
        let result: ItemOutcome;
        for (;;) {
          const attempt = (this.attempts.get(item.id) ?? 0) + 1;
          this.attempts.set(item.id, attempt);
          result = await this.present(item, attempt);
          if (result.kind !== 'interrupted') break;
          const resumed = await this.waitForResume();
          if (resumed !== null) return resumed;
        }
        if (result.kind !== 'complete') return result.kind === 'invalid' ? { kind: 'invalid', invalidation: result.invalidation } : { kind: 'aborted' };
        if (this.c.retry && item.kind === 'target' && item.phase === 'fixation' && !retried.has(item.id)) {
          const rate = result.labelled > 0 ? result.accepted / result.labelled : 0;
          if (result.accepted < this.c.minFrames || rate < FIXATION.minAcceptRate) {
            retried.add(item.id);
            queue.push(item);
            this.total++;
            this.retried++;
          }
        }
        this.done++;
        this.reportProgress();
      }
      return this.outcome() ?? { kind: 'done' };
    } finally {
      this.current = null;
      this.c.stage.setCaption('');
      this.c.game?.target(null);
      this.c.game?.caption(null, null);
      this.c.stage.clear();
    }
  }

  /** Waits out a pause on its overlay; null to carry on, or the outcome that ends the run. */
  private async waitForResume(): Promise<RunOutcome | null> {
    const reason = this.paused ?? 'manual';
    this.c.stage.clear();
    const game = this.c.game;
    if (game) {
      game.target(null);
      game.caption(null, null);
      const ended = this.outcome();
      if (ended) return ended;
      const value = await new Promise<string>((resolve) => {
        this.release = (v) => {
          this.release = null;
          resolve(v);
        };
        game.paused(reason);
      });
      this.paused = null;
      if (value === 'abort') this.abortRequested = true;
      game.resumed();
      return this.outcome();
    }
    this.c.stage.setControls(true, true);
    this.c.stage.setCaption('');
    let faceBack: number | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    if (reason === 'face') {
      timer = setInterval(() => {
        if (this.c.faceLost()) faceBack = null;
        else if (faceBack === null) faceBack = performance.now();
        else if (performance.now() - faceBack >= FACE_BACK_MS) this.c.stage.dismissCard('resume');
      }, 100);
    }
    const value = await this.c.stage.card({
      title: t(`stimulus.paused.${reason}.title`),
      body: [t(`stimulus.paused.${reason}.body`)],
      role: 'alertdialog',
      actions: [
        { label: t('stimulus.resume'), value: 'resume' },
        { label: t('stimulus.abort'), value: 'abort', secondary: true },
      ],
    });
    if (timer !== null) clearInterval(timer);
    this.paused = null;
    this.c.stage.setControls(true, false);
    if (value === 'abort') this.abortRequested = true;
    return this.outcome();
  }

  private close(p: Presentation | null, ts: number, intervals: number[], aborted: boolean): void {
    if (p) this.c.recorder.labeller.close(p, ts, median(intervals), aborted);
  }

  /** One presentation of an item, frame by frame. */
  private async present(item: TargetItem | PursuitItem, attempt: number): Promise<ItemOutcome> {
    const c = this.c;
    const { stage, recorder, geometry, sizes } = c;
    const game = c.game;
    const colours = stage.colours();
    const guide = item.kind === 'target' && item.headMotion ? new SectorTracker() : null;
    const arcs = guide && game ? new ArcProgress() : null;
    // Limited head movement: twice the measured turn reaches the same sectors (±5° yaw, ±3.5° pitch).
    const headScale = game?.limitedHead ? 2 : 1;
    const yawMs = item.kind === 'target' ? (item.sampleMs * HEAD_BLOCK.yawMs) / (HEAD_BLOCK.yawMs + HEAD_BLOCK.pitchMs) : 0;
    let onset: number | null = null;
    let p: Presentation | null = null;
    let last = 0;
    let lastDrawn: { x: number; y: number; r: number } | null = null;
    const intervals: number[] = [];
    this.current = { itemId: item.id, phase: item.phase };
    for (;;) {
      const ts = await stage.frame();
      const inv = this.invalidation ?? c.block.check();
      if (inv) {
        this.invalidate(inv);
        this.close(p, ts, intervals, true);
        return { kind: 'invalid', invalidation: inv };
      }
      if (this.abortRequested) {
        this.close(p, ts, intervals, true);
        return { kind: 'aborted' };
      }
      if (this.paused === null && c.faceLost()) this.pause('face');
      if (this.paused !== null) {
        this.close(p, ts, intervals, true);
        return { kind: 'interrupted' };
      }
      if (onset === null) {
        onset = ts;
        p = recorder.labeller.open(item.id, ts, attempt);
      } else {
        intervals.push(ts - last);
      }
      last = ts;
      const elapsed = ts - onset;

      let finished: boolean;
      let yawPhase = true;
      if (item.kind === 'pursuit') {
        finished = elapsed >= item.holdMs + item.periodMs;
      } else if (guide) {
        const pose = c.pose();
        const motion = elapsed - item.settleMs;
        yawPhase = motion < yawMs || (motion >= item.sampleMs && !(guide.reached.has('left') && guide.reached.has('right')));
        if (pose) {
          if (motion < 0) guide.addBaseline(headScale * pose.yawDeg, headScale * pose.pitchDeg);
          else {
            guide.add(headScale * pose.yawDeg, headScale * pose.pitchDeg, yawPhase ? 'yaw' : 'pitch');
            arcs?.update(guide, yawPhase ? 'yaw' : 'pitch');
          }
        }
        finished = (motion >= item.sampleMs && guide.done) || motion >= item.maxSampleMs;
        if (!game) stage.setCaption(motion < 0 ? t('stimulus.head.look') : t(yawPhase ? 'stimulus.head.yaw' : 'stimulus.head.pitch'), item.yNorm > 0.5 ? 'top' : 'bottom');
      } else {
        const sampled = elapsed - item.settleMs;
        if (sampled < item.sampleMs) finished = false;
        else if (!c.extend) finished = true;
        else finished = recorder.counts(p as Presentation).accepted >= c.minFrames || sampled >= item.maxSampleMs;
      }
      if (finished) {
        stage.clear();
        this.close(p, ts, intervals, false);
        const counts = recorder.counts(p as Presentation);
        if (game && lastDrawn && item.kind === 'target') await this.popAfter(lastDrawn);
        return { kind: 'complete', ...counts };
      }

      stage.clear();
      const norm = item.kind === 'pursuit' ? pursuitTargetAt(item, onset, ts) : ([item.xNorm, item.yNorm] as const);
      const [x, y] = layoutToPx(norm[0], norm[1], geometry);
      if (game) {
        lastDrawn = this.drawGame(item, x, y, elapsed, onset, ts, guide, arcs, yawPhase);
        continue;
      }
      const ring = ringDiameterPx(sizes, elapsed * c.speed, c.reducedMotion);
      drawTarget(stage.context, x, y, sizes, ring, colours);
      const guideR = Math.max(3 * sizes.discPx, 40);
      const showGuide = guide !== null && item.kind === 'target' && elapsed >= item.settleMs;
      if (guide && showGuide) {
        drawPoseGuide(stage.context, x, y, guideR, guide, { fg: colours.fg, done: '#0b6e4f', dim: 'rgba(0, 0, 0, 0.3)' });
      }
      // The guide's pose dot can reach 1.2 radii out; 6 px keeps a visible gap to the buttons.
      stage.avoidTarget(x, y, (showGuide ? 1.2 * guideR + Math.max(4, guideR / 10) : sizes.discPx / 2) + 6);
    }
  }

  /** One frame of a warm-up level: the bubble, the firefly or the head arcs; returns what was drawn. */
  private drawGame(
    item: TargetItem | PursuitItem,
    x: number,
    y: number,
    elapsed: number,
    onset: number,
    ts: number,
    guide: SectorTracker | null,
    arcs: ArcProgress | null,
    yawPhase: boolean,
  ): { x: number; y: number; r: number } {
    const c = this.c;
    const game = c.game as GameHooks;
    const ctx = c.stage.context;
    const col = game.colours;
    let drawn: { x: number; y: number; r: number };
    if (item.kind === 'pursuit') {
      const motionStart = onset + item.holdMs;
      const at = (t: number) => layoutToPx(...pursuitTargetAt(item, onset, t), c.geometry);
      const trail = c.reducedMotion ? [] : trailSegments(at, ts, motionStart, TRAIL_MS / c.speed);
      drawFirefly(ctx, x, y, trail, c.sizes, col);
      drawn = { x, y, r: FIREFLY_R };
      this.reportProgress(Math.min(1, elapsed / (item.holdMs + item.periodMs)));
    } else if (guide && arcs) {
      drawBubble(ctx, x, y, { r: game.headR, fullR: game.headR, ghost: false }, c.sizes, col);
      const motion = elapsed - item.settleMs;
      drawHeadArcs(ctx, x, y, game.headR, arcs.fills(guide), motion >= 0 ? arcs.current : null, col);
      const extent = arcsExtent(game.headR);
      game.caption(motion < 0 ? null : yawPhase ? 'warmup.head.turn' : 'warmup.head.nod', { x, y, r: extent });
      drawn = { x, y, r: game.headR };
      game.target({ x, y, r: extent });
      return drawn;
    } else if (game.style === 'ring') {
      const ring = ringDiameterPx(c.sizes, elapsed * c.speed, c.reducedMotion);
      drawTarget(ctx, x, y, c.sizes, ring, { fg: col.bubbleCore, bg: col.stage });
      drawn = { x, y, r: Math.max(c.sizes.discPx, ring ?? 0) / 2 };
    } else {
      const r = bubbleRadius(elapsed, item, game.bubble, c.reducedMotion, c.speed);
      drawBubble(ctx, x, y, { r, fullR: game.bubble.fullR, ghost: !c.reducedMotion }, c.sizes, col);
      drawn = { x, y, r };
    }
    game.target({ x: drawn.x, y: drawn.y, r: item.kind === 'target' && game.style !== 'ring' ? game.bubble.fullR : drawn.r });
    return drawn;
  }

  /**
   * The pop after a bubble (design §2.6): 150 ms ÷ speed of the burst, outside every sampling
   * window (the presentation is closed), then the next onset. None under reduced motion or for
   * the ring; an abort or an invalidation cuts it short.
   */
  private async popAfter(at: { x: number; y: number; r: number }): Promise<void> {
    const c = this.c;
    const game = c.game as GameHooks;
    game.caption(null, null);
    if (c.reducedMotion || game.style === 'ring') {
      game.target(null);
      return;
    }
    game.pop();
    const start = performance.now();
    for (;;) {
      const ts = await c.stage.frame();
      const progress = popProgress(ts - start, c.speed);
      c.stage.clear();
      if (progress === null || this.abortRequested || this.invalidation || c.block.check()) break;
      drawBurst(c.stage.context, at.x, at.y, at.r, progress, game.colours);
    }
    game.target(null);
  }
}
