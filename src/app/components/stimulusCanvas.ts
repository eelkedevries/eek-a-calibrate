// The stimulus (specification §4.7, §14.2, §17.6): the grey stage, one canvas drawn in
// requestAnimationFrame and embedded in the game shell by the screen that runs it, and the block
// runner that presents the items of a schedule. An item's onsetMs is the rAF timestamp of the
// first frame that shows it, and its offsetMs that of the first frame without it. The runner
// draws through the game hooks: the bubble, the firefly and the head arcs (`?target=ring` keeps
// the §4.7 ring), a 150 ms pop between items, pauses waited out by the screen's own cards and the
// position guard, and progress reported to the pip line.
import { FIXATION, HEAD_BLOCK } from '../../core/constants.ts';
import { layoutToPx } from '../../core/geometry/screen.ts';
import type { FrameRecorder } from '../../core/protocol/labelling.ts';
import { pursuitTargetAt } from '../../core/protocol/pursuit.ts';
import type { Presentation, PursuitItem, ScreenGeometry, TargetItem } from '../../core/types.ts';
import { bubbleRadius, popProgress, type BubbleSizes } from '../../core/warmup/bubble.ts';
import type { Invalidation, Presentation as Block } from '../../platform/presentation.ts';
import { h } from '../dom.ts';
import { drawBubble, drawBurst, type GameColours } from './bubble.ts';
import { drawFirefly, FIREFLY_R, trailSegments, TRAIL_MS } from './firefly.ts';
import { ArcProgress, arcsExtent, drawHeadArcs } from './headArcs.ts';
import { SectorTracker } from './poseGuide.ts';
import { drawTarget, ringDiameterPx, type TargetSizes } from './target.ts';

const STAGE_CSS = `
.stimulus-stage { position: absolute; inset: 0; display: block; overflow: hidden; background: var(--stage); }
.stimulus-stage canvas { position: absolute; left: 0; top: 0; display: block; }
`;

function injectStyle(): void {
  if (document.getElementById('stimulus-style')) return;
  document.head.append(h('style', { id: 'stimulus-style' }, STAGE_CSS));
}

/** The grey stage of a level, Re-aim or round: one canvas, drawn by the screen that embeds it. */
export class StimulusStage {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private geometry: ScreenGeometry | null = null;

  constructor() {
    injectStyle();
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw on a canvas.');
    this.ctx = ctx;
    this.el = h('div', { class: 'stimulus-stage stimulus-stage--game', 'aria-hidden': 'true' }, this.canvas);
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

  /** The colour `clear()` paints (the game's --stage). */
  background = '#808080';

  clear(): void {
    const g = this.geometry;
    if (!g) return;
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, g.viewportWpx, g.viewportHpx);
  }

  /** The next animation frame's timestamp (performance.now() domain). */
  frame(): Promise<number> {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  destroy(): void {
    this.el.remove();
  }
}

// ----- The block runner ------------------------------------------------------------------

export type PauseReason = 'manual' | 'face' | 'hidden' | 'guard';

/** How the warm-up levels, Re-aim and the quick warm-up draw and pause (spec §17.6, §17.8). */
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
  /** The latest head pose, for the head block's arcs. */
  pose(): { yawDeg: number; pitchDeg: number } | null;
  /** The levels' drawing and pausing. */
  game: GameHooks;
}

export type RunOutcome = { kind: 'done' } | { kind: 'aborted' } | { kind: 'invalid'; invalidation: Invalidation };

type ItemOutcome = { kind: 'complete'; accepted: number; labelled: number } | { kind: 'interrupted' } | { kind: 'aborted' } | { kind: 'invalid'; invalidation: Invalidation };

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
    c.stage.background = c.game.colours.stage;
    this.offs.push(c.block.onInvalidate((inv) => this.invalidate(inv)));
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') this.pause('hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.offs.push(() => document.removeEventListener('visibilitychange', onVisibility));
    const onKey = (e: KeyboardEvent): void => {
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
    else this.paused = null;
  }

  abort(): void {
    this.abortRequested = true;
    this.release?.('abort');
  }

  invalidate(inv: Invalidation): void {
    if (this.invalidation) return;
    this.invalidation = inv;
    this.release?.('invalid');
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.c.game.target(null);
    this.c.game.caption(null, null);
  }

  outcome(): RunOutcome | null {
    if (this.invalidation) return { kind: 'invalid', invalidation: this.invalidation };
    if (this.abortRequested) return { kind: 'aborted' };
    return null;
  }

  private reportProgress(fraction: number | null = null): void {
    this.c.game.progress(this.done, this.total, fraction);
  }

  /** Presents the items of one block in order, then the failed fixation items once more (when `retry`). */
  async runBlock(items: readonly (TargetItem | PursuitItem)[]): Promise<RunOutcome> {
    const queue = [...items];
    const retried = new Set<string>();
    this.reportProgress();
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
      this.c.game.target(null);
      this.c.game.caption(null, null);
      this.c.stage.clear();
    }
  }

  /** Waits out a pause on the screen's card or the guard's overlay; null to carry on, or the outcome that ends the run. */
  private async waitForResume(): Promise<RunOutcome | null> {
    const reason = this.paused ?? 'manual';
    this.c.stage.clear();
    const game = this.c.game;
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

  private close(p: Presentation | null, ts: number, intervals: number[], aborted: boolean): void {
    if (p) this.c.recorder.labeller.close(p, ts, median(intervals), aborted);
  }

  /** One presentation of an item, frame by frame. */
  private async present(item: TargetItem | PursuitItem, attempt: number): Promise<ItemOutcome> {
    const c = this.c;
    const { stage, recorder, geometry } = c;
    const game = c.game;
    const guide = item.kind === 'target' && item.headMotion ? new SectorTracker() : null;
    const arcs = guide ? new ArcProgress() : null;
    // Limited head movement: twice the measured turn reaches the same sectors (±5° yaw, ±3.5° pitch).
    const headScale = game.limitedHead ? 2 : 1;
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
        if (lastDrawn && item.kind === 'target') await this.popAfter(lastDrawn);
        return { kind: 'complete', ...counts };
      }

      stage.clear();
      const norm = item.kind === 'pursuit' ? pursuitTargetAt(item, onset, ts) : ([item.xNorm, item.yNorm] as const);
      const [x, y] = layoutToPx(norm[0], norm[1], geometry);
      lastDrawn = this.drawGame(item, x, y, elapsed, onset, ts, guide, arcs, yawPhase);
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
    const game = c.game;
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
    const game = c.game;
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
