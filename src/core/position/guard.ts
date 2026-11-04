// The position guard's state machines (design §3.3–§3.8, spec §17.5), DOM-free.
//
// ReadyGuard is the ready check of Get ready: the single instruction with its timing (a new cue
// persists 300 ms before it shows, blockers at once; a shown cue stays at least 1 s; the tip after
// 4 s), the hold over SETUP.holdMs that latches Ready and stores home, and "Start anyway".
//
// GradeGuard runs after Get ready: the grade against home (or the calibrated head range), the
// auto-pause when out of range or the face is lost for too long, and the resume rule (in range
// for 1 s, then "Back in place" for 400 ms). It is presentation, not gating: it never touches
// frame acceptance or labels (spec §17.5.2).
//
// createPositionGuard wires a GradeGuard to a capture's results and a motion source, so that the
// warm-up levels, Free look and the challenge share one source of guard state.
import type { FrameResult } from '../types.ts';
import { activeConditions, cueCopy, statusRow, topCondition, CONDITIONS, type ConditionId, type CueContext, type DirectionalCue, type StatusRow } from './cues.ts';
import { deviations, glyphEyes, grade, HomeAccumulator, nudgeKey, pauseHeadline, type DeviationKind, type FitRange, type Home } from './home.ts';
import { resultInput, SignalTracker, type Signals } from './signals.ts';
import { nudgesAllowed, pauseTiming, RESUME, TIMING, type ClassRanges, type GuardContext, type Setup } from './thresholds.ts';
import type { MotionReading } from './tilt.ts';

/** A string key and its placeholders, for the app's t(). */
export interface CopyRef {
  key: string;
  vars?: Readonly<Record<string, string | number>>;
}

// ----- The ready check -----------------------------------------------------------------------

export type ReadyState = 'loading' | 'searching' | 'adjust' | 'holding' | 'ready';

export interface ReadyView {
  state: ReadyState;
  /** The condition whose instruction is shown; null when all is clear. */
  condition: ConditionId | null;
  headline: CopyRef;
  tip: CopyRef | null;
  cue: DirectionalCue;
  status: StatusRow;
  /** How much of the hold has passed, 0–1 (1 once Ready has latched). */
  holdFraction: number;
  /** Ready has latched (it stays latched, design §2.5). */
  ready: boolean;
  /** "Start anyway" is due: 20 s with a face and no Ready (design §2.5). */
  anyway: boolean;
  /** Below 15 processed frames a second (design §2.16). */
  slow: boolean;
  /** Every active condition, in priority order (for Details and the tests). */
  active: ConditionId[];
}

export interface ReadyGuardOptions {
  ranges: ClassRanges;
  setup: Setup;
  /** `?speed=N` in test mode divides the hold, the tip delay and "Start anyway". */
  speed?: number;
}

export interface ReadyContext extends CueContext {
  /** The download so far, 0–100, for "Getting ready… 62 %". */
  loadingPct?: number;
}

const SEARCHING: ReadonlySet<ConditionId> = new Set(['no-camera', 'black', 'too-dark', 'no-face']);
/** The hand-held tip shows once, for this long (design §3.4). */
const HAND_HELD_TIP_MS = 6000;

export class ReadyGuard {
  /** Home, from the hold that latched Ready (and re-latched by a later full hold). */
  home: Home | null = null;
  /** Ready latched on the last update (for the 20 ms haptic). */
  justLatched = false;
  private ranges: ClassRanges;
  private setup: Setup;
  private readonly speed: number;
  private active: Set<ConditionId> = new Set();
  private candidate: ConditionId | null | undefined = undefined;
  private candidateSince = 0;
  private shown: ConditionId | null | undefined = undefined;
  private shownSince = Number.NEGATIVE_INFINITY;
  private holdSince: number | null = null;
  private latchedThisHold = false;
  private ready = false;
  private firstFaceMs: number | null = null;
  private readonly acc = new HomeAccumulator();
  private handHeldFrom: number | null = null;

  constructor(opts: ReadyGuardOptions) {
    this.ranges = opts.ranges;
    this.setup = opts.setup;
    this.speed = opts.speed && opts.speed >= 1 ? opts.speed : 1;
  }

  /** A change of class (the window turned) keeps Ready and home. */
  setRanges(ranges: ClassRanges, setup: Setup = this.setup): void {
    this.ranges = ranges;
    this.setup = setup;
  }

  get holdMs(): number {
    return TIMING.holdMs / this.speed;
  }

  update(s: Signals, now: number, ctx: ReadyContext): ReadyView {
    this.active = activeConditions(s, this.ranges, this.active, ctx);
    const top = topCondition(this.active);
    if (top !== this.candidate) {
      this.candidate = top;
      this.candidateSince = now;
    }
    const blocker = top !== null && CONDITIONS[top].blocker;
    // A blocker that has cleared (the model has loaded, frames arrive) gives way at once.
    const blockerGone = this.shown !== undefined && this.shown !== null && CONDITIONS[this.shown].blocker && !this.active.has(this.shown);
    const persisted = blocker || blockerGone || now - this.candidateSince >= TIMING.persistMs;
    const shownLongEnough = this.shown === undefined || blockerGone || now - this.shownSince >= TIMING.minShowMs;
    if (top !== this.shown && persisted && (shownLongEnough || blocker)) {
      this.shown = top;
      this.shownSince = now;
    }

    if (s.face) this.firstFaceMs ??= now;

    // The hold runs while nothing at all is active; any break restarts it (design §2.5).
    this.justLatched = false;
    if (this.active.size === 0) {
      this.holdSince ??= now;
      this.acc.add(s);
    } else {
      this.holdSince = null;
      this.latchedThisHold = false;
      this.acc.clear();
    }
    const held = this.holdSince === null ? 0 : Math.min(1, (now - this.holdSince) / this.holdMs);
    if (held >= 1 && !this.latchedThisHold) {
      this.latchedThisHold = true;
      this.home = this.acc.home() ?? this.home;
      if (!this.ready) this.justLatched = true;
      this.ready = true;
    }

    const shown = this.shown ?? top;
    let state: ReadyState;
    if (shown === 'loading') state = 'loading';
    else if (shown !== null && SEARCHING.has(shown)) state = 'searching';
    else if (shown !== null) state = 'adjust';
    else state = this.ready ? 'ready' : 'holding';

    let headline: CopyRef;
    let tip: CopyRef | null = null;
    let cue: DirectionalCue = null;
    const tipDue = this.shown !== undefined && now - this.shownSince >= TIMING.tipAfterMs / this.speed;
    if (shown === null) {
      headline = { key: this.ready ? 'guard.cue.ready' : 'guard.cue.holding' };
      if (this.ready) tip = { key: 'guard.tip.ready' };
    } else {
      const copy = cueCopy(shown, this.ranges, this.setup);
      headline = shown === 'loading' ? { key: copy.headline, vars: { pct: Math.round(ctx.loadingPct ?? 0) } } : { key: copy.headline };
      if (copy.tip && tipDue) tip = { key: copy.tip };
      cue = copy.cue;
    }

    // Propped, but the rotation rate says a hand holds it: one tip, once (design §3.9).
    if (this.setup === 'propped' && this.ranges.phone && s.handHeld && this.handHeldFrom === null) this.handHeldFrom = now;
    if (this.handHeldFrom !== null && now - this.handHeldFrom < HAND_HELD_TIP_MS && state !== 'loading') tip = { key: 'guard.tip.prop' };

    const anyway = !this.ready && s.face && this.firstFaceMs !== null && now - this.firstFaceMs >= TIMING.anywayAfterMs / this.speed;
    return {
      state,
      condition: shown,
      headline,
      tip,
      cue,
      status: statusRow(this.active, s),
      holdFraction: this.ready && shown === null ? 1 : held,
      ready: this.ready,
      anyway,
      slow: Number.isFinite(s.fps) && s.fps < TIMING.slowHz,
      active: [...this.active].sort((a, b) => CONDITIONS[a].rank - CONDITIONS[b].rank),
    };
  }
}

// ----- After Get ready: grades, pause and resume ---------------------------------------------

export type GuardPhase = 'running' | 'paused' | 'resuming';
export type PauseReason = 'out' | 'face-lost';

export interface GradeView {
  /** The compact glyph's state (design §3.7). */
  glyph: 'good' | 'drifting' | 'lost';
  phase: GuardPhase;
  reason: PauseReason | null;
  /** The overlay's headline while paused, "Back in place" while resuming; null while running. */
  headline: CopyRef | null;
  /** The nudge beside the glyph (Free look and the challenge only). */
  nudge: CopyRef | null;
  /** The glyph's eye dots relative to home. */
  eyes: { dx: number; dy: number; spacing: number };
  /** The deviation that decides the grade. */
  worst: DeviationKind | null;
  /** How long the current pause has lasted, ms (0 while running). */
  pausedMs: number;
  /** The overlay's second action is due (paused 10 s or more). */
  extra: boolean;
}

export type GradeEvent = { kind: 'pause'; reason: PauseReason } | { kind: 'resume' };

export interface GradeGuardOptions {
  home: Home;
  context: GuardContext;
  fit?: FitRange | null;
}

export class GradeGuard {
  home: Home;
  context: GuardContext;
  fit: FitRange | null;
  private phase: GuardPhase = 'running';
  private reason: PauseReason | null = null;
  private outSince: number | null = null;
  private pausedAt = 0;
  private inRangeSince: number | null = null;
  private resumingSince = 0;
  private headline: CopyRef | null = null;
  pauses = 0;

  constructor(opts: GradeGuardOptions) {
    this.home = opts.home;
    this.context = opts.context;
    this.fit = opts.fit ?? null;
  }

  update(s: Signals, now: number): { view: GradeView; events: GradeEvent[] } {
    const events: GradeEvent[] = [];
    const devs = s.face ? deviations(s, this.home, this.context, this.fit) : [];
    const g = grade(devs);
    const timing = pauseTiming(this.context);
    if (s.faceNow && g.grade === 'out') this.outSince ??= now;
    else this.outSince = null;

    const outFor = this.outSince === null ? 0 : now - this.outSince;
    const lost = !s.faceNow && s.faceLostMs >= timing.lostMs;
    if (this.phase === 'running') {
      if (lost || outFor >= timing.outMs) {
        this.phase = 'paused';
        this.reason = lost ? 'face-lost' : 'out';
        this.pausedAt = now;
        this.inRangeSince = null;
        this.pauses += 1;
        events.push({ kind: 'pause', reason: this.reason });
      }
    }
    if (this.phase !== 'running') {
      const inRange = s.faceNow && g.grade !== 'out';
      if (!inRange) {
        this.inRangeSince = null;
        if (this.phase === 'resuming') this.phase = 'paused';
        this.reason = s.faceNow ? 'out' : 'face-lost';
      } else {
        this.inRangeSince ??= now;
        if (this.phase === 'paused' && now - this.inRangeSince >= RESUME.inRangeMs) {
          this.phase = 'resuming';
          this.resumingSince = now;
        }
        if (this.phase === 'resuming' && now - this.resumingSince >= RESUME.backInPlaceMs) {
          this.phase = 'running';
          this.reason = null;
          this.inRangeSince = null;
          events.push({ kind: 'resume' });
        }
      }
    }

    if (this.phase === 'paused') {
      // The headline follows the player relative to home; while in range it keeps the last one.
      if (!s.faceNow) this.headline = { key: pauseHeadline('face-lost', null) };
      else if (g.grade !== 'good' || this.headline === null) this.headline = { key: pauseHeadline('out', g.worst?.kind ?? null) };
    } else if (this.phase === 'resuming') {
      this.headline = { key: 'guard.pause.backInPlace' };
    } else {
      this.headline = null;
    }

    const glyph: GradeView['glyph'] = !s.faceNow ? 'lost' : g.grade === 'good' ? 'good' : 'drifting';
    const nudge = this.phase === 'running' && nudgesAllowed(this.context) && g.worst && g.grade !== 'good' ? { key: nudgeKey(g.worst.kind) } : null;
    const pausedMs = this.phase === 'running' ? 0 : now - this.pausedAt;
    return {
      view: {
        glyph,
        phase: this.phase,
        reason: this.reason,
        headline: this.headline,
        nudge,
        eyes: glyphEyes(s, this.home),
        worst: g.worst?.kind ?? null,
        pausedMs,
        extra: this.phase !== 'running' && pausedMs >= RESUME.extraAfterMs,
      },
      events,
    };
  }
}

// ----- The controller ----------------------------------------------------------------------

/** The view before the first evaluation. */
const IDLE_VIEW: GradeView = { glyph: 'good', phase: 'running', reason: null, headline: null, nudge: null, eyes: { dx: 0, dy: 0, spacing: 6.4 }, worst: null, pausedMs: 0, extra: false };

/** What the controller reads from a capture (session.ts's Capture has it). */
export interface GuardSource {
  onResult(cb: (r: FrameResult) => void): () => void;
  onFrame?(cb: (meta: { tCaptureMs: number }, submitted: boolean) => void): () => void;
}

export interface MotionFeed {
  onReading(cb: (r: MotionReading) => void): () => void;
}

export interface PositionGuardOptions {
  home: Home;
  fit?: FitRange | null;
  motion?: MotionFeed | null;
  now?: () => number;
  /** How often the guard re-evaluates between results (ms). */
  tickMs?: number;
  /** For "re-latch home": the length of the hold (SETUP.holdMs ÷ speed). */
  holdMs?: number;
}

export interface GuardSnapshot {
  context: GuardContext;
  view: GradeView;
  signals: Signals | null;
  home: Home;
  pauses: number;
  forced: boolean;
}

export interface PositionGuard {
  state(): GuardSnapshot;
  onChange(cb: (s: GuardSnapshot) => void): () => void;
  onPause(cb: (reason: PauseReason) => void): () => void;
  onResume(cb: () => void): () => void;
  /** The level changes (Level 3 does not check the angles). */
  setContext(context: GuardContext): void;
  setFit(fit: FitRange | null): void;
  /** Re-latches home: from `home`, or from the medians over the next hold. */
  rehome(home?: Home): void;
  /** Pauses so far in this context; the warm-up asks for a set-up fix after three. */
  resetPauses(): void;
  /** Test mode: shows a given view instead of the measured one (layout tests). */
  force(view: Partial<GradeView> | null): void;
  dispose(): void;
}

/**
 * One source of guard state for the screens after Get ready (spec §17.5.3): every result updates
 * the signals and the grade, and a timer re-evaluates between results so that a camera that stops
 * delivering still pauses. Pause and resume are reported once each.
 */
export function createPositionGuard(capture: GuardSource, context: GuardContext, opts: PositionGuardOptions): PositionGuard {
  const now = opts.now ?? (() => performance.now());
  const tracker = new SignalTracker();
  const grades = new GradeGuard({ home: opts.home, context, fit: opts.fit ?? null });
  const changeListeners = new Set<(s: GuardSnapshot) => void>();
  const pauseListeners = new Set<(r: PauseReason) => void>();
  const resumeListeners = new Set<() => void>();
  let signals: Signals | null = null;
  let view: GradeView | null = null;
  let forced: Partial<GradeView> | null = null;
  let rehoming: { acc: HomeAccumulator; until: number } | null = null;
  let disposed = false;

  const snapshot = (): GuardSnapshot => {
    const base = view ?? IDLE_VIEW;
    return { context: grades.context, view: forced ? { ...base, ...forced } : base, signals, home: grades.home, pauses: grades.pauses, forced: forced !== null };
  };

  const evaluate = (): void => {
    if (disposed) return;
    const t = now();
    signals = tracker.snapshot(t);
    if (rehoming) {
      rehoming.acc.add(signals);
      if (t >= rehoming.until) {
        grades.home = rehoming.acc.home() ?? grades.home;
        rehoming = null;
      }
    }
    const out = grades.update(signals, t);
    view = out.view;
    if (!forced) {
      for (const e of out.events) {
        if (e.kind === 'pause') for (const cb of pauseListeners) cb(e.reason);
        else for (const cb of resumeListeners) cb();
      }
    }
    const snap = snapshot();
    for (const cb of changeListeners) cb(snap);
  };

  const offs: (() => void)[] = [
    capture.onResult((r) => {
      tracker.pushResult(resultInput(r));
      evaluate();
    }),
  ];
  if (capture.onFrame) offs.push(capture.onFrame((meta) => tracker.pushFrame(meta.tCaptureMs)));
  if (opts.motion) offs.push(opts.motion.onReading((r) => tracker.pushMotion(r)));
  const timer = setInterval(evaluate, opts.tickMs ?? 100);

  return {
    state: snapshot,
    onChange(cb) {
      changeListeners.add(cb);
      return () => changeListeners.delete(cb);
    },
    onPause(cb) {
      pauseListeners.add(cb);
      return () => pauseListeners.delete(cb);
    },
    onResume(cb) {
      resumeListeners.add(cb);
      return () => resumeListeners.delete(cb);
    },
    setContext(c) {
      grades.context = c;
    },
    setFit(fit) {
      grades.fit = fit;
    },
    rehome(home) {
      if (home) grades.home = home;
      else rehoming = { acc: new HomeAccumulator(), until: now() + (opts.holdMs ?? TIMING.holdMs) };
    },
    resetPauses() {
      grades.pauses = 0;
    },
    force(v) {
      forced = v;
      const snap = snapshot();
      for (const cb of changeListeners) cb(snap);
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      for (const off of offs.splice(0)) off();
      changeListeners.clear();
      pauseListeners.clear();
      resumeListeners.clear();
    },
  };
}
