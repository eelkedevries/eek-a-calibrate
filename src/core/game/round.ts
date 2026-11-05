// One round of the challenge (spec §17.9.1, §17.9.4; design §2.14, §5), DOM-free. The screen
// feeds it the gaze (the selected estimator's filtered, drift-corrected point, or nothing while
// the blink hold or an invalid frame holds it) and ticks it once per animation frame; the round
// moves its clock, the bubble's leaky dwell, its lifetime and the gaps, the decoy of round 2 and
// the drift of round 3, and keeps the score, the streak and a record of every bubble and decoy.
//
// The round clock stops while the round is paused (manual Pause, the position guard's overlay,
// an offer card), so lifetimes and dwells are held; in test mode it runs `speed` times faster,
// which divides every duration.
import type { Vec2 } from '../types.ts';
import { innerRect, zoneAtPoint, zoneCentre, type Board, type Zone } from './board.ts';
import { DWELL_START, dwellFull, stepDwell, type DwellInput, type DwellState } from './dwell.ts';
import { DECOY, OFFSET, TIMING, type RoundDef } from './params.ts';
import { planRound, type Placement } from './placement.ts';
import { bonk, popPoints } from './scoring.ts';
import { summariseRound, type ItemRecord, type RoundSummary } from './stats.ts';
import { median } from '../maths/stats.ts';

/** A longer wall-clock step (a slow frame, a hidden page) moves the round on by this much at most. */
const MAX_STEP_MS = 250;
/** A gaze older than this (wall clock) holds the dwell: the camera has stalled. */
const STALE_GAZE_MS = 500;

export interface RoundOptions {
  def: RoundDef;
  seed: number;
  board: Board;
  /** The bubble's full radius, CSS px (the decoy has the same size). */
  bubbleR: number;
  /** CSS px per degree near the screen centre, for round 3's drift speed. */
  pxPerDeg: number;
  /** Item ids are `<idPrefix>-B01` (bubbles) and `<idPrefix>-S01` (decoys). */
  idPrefix: string;
  speed?: number;
  bubbles?: number;
}

export interface LiveBubble {
  id: string;
  index: number;
  zone: Zone;
  centre: Vec2;
  start: Vec2;
  onsetClock: number;
  onsetWall: number;
  dwell: DwellState;
  /** px per round-clock ms (round 3). */
  velocity: Vec2;
}

export interface LiveDecoy {
  id: string;
  zone: Zone;
  centre: Vec2;
  dwell: DwellState;
  /** Round clock of the bonk; it shakes for 200 ms, then it is gone. */
  bonkedClock: number | null;
}

/** The end of a bubble, drawn during the gap: the pop's burst, or the miss rising and fading. */
export interface AfterEffect {
  kind: 'pop' | 'miss';
  centre: Vec2;
  atClock: number;
}

export type RoundEvent =
  | { kind: 'onset'; bubble: LiveBubble }
  | { kind: 'pop'; record: ItemRecord; points: number }
  | { kind: 'miss'; record: ItemRecord }
  | { kind: 'bonk'; record: ItemRecord }
  | { kind: 'end' };

export type RoundPhase = 'gap' | 'bubble' | 'done';

function reflect(pos: number, v: number, lo: number, hi: number): [number, number] {
  if (hi <= lo) return [lo, 0];
  let p = pos;
  let vel = v;
  for (let i = 0; i < 4 && (p < lo || p > hi); i++) {
    if (p < lo) {
      p = 2 * lo - p;
      vel = Math.abs(vel);
    } else {
      p = 2 * hi - p;
      vel = -Math.abs(vel);
    }
  }
  return [Math.min(hi, Math.max(lo, p)), vel];
}

export class Round {
  readonly def: RoundDef;
  readonly seed: number;
  readonly board: Board;
  readonly bubbleR: number;
  readonly plan: Placement[];
  readonly speed: number;
  phase: RoundPhase = 'gap';
  clockMs = 0;
  score = 0;
  streak = 0;
  bubble: LiveBubble | null = null;
  decoy: LiveDecoy | null = null;
  after: AfterEffect | null = null;
  /** Bubbles ended so far (popped or missed), for the pip line. */
  done = 0;
  readonly records: ItemRecord[] = [];
  readonly outcomes: ('popped' | 'missed')[] = [];
  private readonly opts: RoundOptions;
  private gapUntil: number = TIMING.gapMs;
  private next = 0;
  private lastWall: number | null = null;
  private paused = false;
  private gazeZone: number | null = null;
  private gazeHeld = true;
  private gazeWall = Number.NEGATIVE_INFINITY;
  private readonly recent: { t: number; p: Vec2 }[] = [];

  constructor(opts: RoundOptions) {
    this.opts = opts;
    this.def = opts.def;
    this.seed = opts.seed;
    this.board = opts.board;
    this.bubbleR = opts.bubbleR;
    this.speed = opts.speed && opts.speed >= 1 ? opts.speed : 1;
    this.plan = planRound(opts.seed, opts.def, opts.board.cols, opts.board.rows, opts.bubbles);
  }

  get total(): number {
    return this.plan.length;
  }

  /** The zone the gaze falls in now, or null without a valid gaze. */
  get litZone(): Zone | null {
    return this.gazeZone === null ? null : (this.board.zones[this.gazeZone] ?? null);
  }

  /**
   * The latest gaze: a point (CSS px), or null while it is held or invalid. `wallMs` is when it
   * arrived; points also feed the 400 ms window of the pop's offset.
   */
  setGaze(point: Vec2 | null, wallMs: number): void {
    this.gazeWall = wallMs;
    if (!point) {
      this.gazeHeld = true;
      return;
    }
    this.gazeHeld = false;
    this.gazeZone = zoneAtPoint(this.board, point)?.index ?? null;
    if (this.paused) return;
    this.recent.push({ t: this.clockMs, p: point });
    while (this.recent.length > 0 && (this.recent[0] as { t: number }).t < this.clockMs - 2 * OFFSET.windowMs) this.recent.shift();
  }

  /** Forgets the lit zone (the gaze is gone, not merely held). */
  clearGaze(): void {
    this.gazeZone = null;
    this.gazeHeld = true;
  }

  private input(zone: number, wallMs: number): DwellInput {
    if (this.gazeHeld || this.gazeZone === null || wallMs - this.gazeWall > STALE_GAZE_MS) return 'held';
    return this.gazeZone === zone ? 'in' : 'out';
  }

  /**
   * Moves the round on to `wallMs` (performance.now()); nothing moves while `paused`. When the gap
   * is over, `mayStart` is asked before the next bubble appears: false keeps the round between
   * bubbles (the after-effect over), where the screen can put up the Re-aim offer.
   */
  tick(wallMs: number, paused: boolean, mayStart: () => boolean = () => true): RoundEvent[] {
    const last = this.lastWall ?? wallMs;
    this.lastWall = wallMs;
    this.paused = paused;
    if (paused || this.phase === 'done') return [];
    const dt = Math.min(MAX_STEP_MS, Math.max(0, wallMs - last)) * this.speed;
    this.clockMs += dt;
    const events: RoundEvent[] = [];
    if (this.phase === 'gap') {
      if (this.clockMs < this.gapUntil) return events;
      this.after = null;
      if (this.next >= this.plan.length) {
        this.phase = 'done';
        events.push({ kind: 'end' });
        return events;
      }
      if (!mayStart()) return events;
      events.push({ kind: 'onset', bubble: this.start(this.next++, wallMs) });
      return events;
    }
    const b = this.bubble as LiveBubble;
    this.move(b, dt);
    const d = this.decoy;
    if (d && d.bonkedClock === null) {
      d.dwell = stepDwell(d.dwell, this.input(d.zone.index, wallMs), dt, DECOY.bonkMs);
      if (dwellFull(d.dwell)) events.push(this.bonk(d, b, wallMs));
    }
    b.dwell = stepDwell(b.dwell, this.input(b.zone.index, wallMs), dt, this.def.dwellMs);
    if (dwellFull(b.dwell)) events.push(this.pop(b, wallMs));
    else if (this.clockMs - b.onsetClock >= TIMING.lifetimeMs) events.push(this.miss(b, wallMs));
    return events;
  }

  private start(index: number, wallMs: number): LiveBubble {
    const p = this.plan[index] as Placement;
    const zone = this.board.zones[p.zone] as Zone;
    const id = `${this.opts.idPrefix}-B${String(index + 1).padStart(2, '0')}`;
    const centre = this.place(zone, p.jitter);
    let velocity: Vec2 = [0, 0];
    if (p.driftAngleRad !== null && this.def.driftDegS > 0) {
      const v = (this.def.driftDegS * this.opts.pxPerDeg) / 1000;
      velocity = [v * Math.cos(p.driftAngleRad), v * Math.sin(p.driftAngleRad)];
    }
    const bubble: LiveBubble = { id, index, zone, centre, start: centre, onsetClock: this.clockMs, onsetWall: wallMs, dwell: { ...DWELL_START }, velocity };
    this.bubble = bubble;
    this.phase = 'bubble';
    this.decoy = null;
    if (p.decoy) {
      const dz = this.board.zones[p.decoy.zone] as Zone;
      this.decoy = { id: `${this.opts.idPrefix}-S${String(index + 1).padStart(2, '0')}`, zone: dz, centre: this.place(dz, p.decoy.jitter), dwell: { ...DWELL_START }, bonkedClock: null };
    }
    return bubble;
  }

  /** The zone centre plus the jitter, kept where the whole bubble lies inside the zone. */
  private place(zone: Zone, jitter: Vec2): Vec2 {
    const [cx, cy] = zoneCentre(zone);
    const inner = innerRect(zone, this.bubbleR);
    const x = Math.min(inner.x + inner.w, Math.max(inner.x, cx + jitter[0] * zone.rect.w));
    const y = Math.min(inner.y + inner.h, Math.max(inner.y, cy + jitter[1] * zone.rect.h));
    return [x, y];
  }

  /** Round 3: the bubble drifts and bounces, never nearer than its radius to the zone's edge. */
  private move(b: LiveBubble, dt: number): void {
    if (b.velocity[0] === 0 && b.velocity[1] === 0) return;
    const inner = innerRect(b.zone, this.bubbleR);
    const [x, vx] = reflect(b.centre[0] + b.velocity[0] * dt, b.velocity[0], inner.x, inner.x + inner.w);
    const [y, vy] = reflect(b.centre[1] + b.velocity[1] * dt, b.velocity[1], inner.y, inner.y + inner.h);
    b.centre = [x, y];
    b.velocity = [vx, vy];
  }

  private recentOffset(centre: Vec2): Vec2 | null {
    const window = this.recent.filter((s) => s.t >= this.clockMs - OFFSET.windowMs);
    if (window.length === 0) return null;
    return [median(window.map((s) => s.p[0])) - centre[0], median(window.map((s) => s.p[1])) - centre[1]];
  }

  private record(item: { id: string; kind: 'bubble' | 'decoy'; index: number; zone: Zone; at: Vec2; onsetWall: number }, wallMs: number, rest: Pick<ItemRecord, 'outcome' | 'timeToPopMs' | 'scoreChange' | 'offsetPx'>): ItemRecord {
    const r: ItemRecord = { id: item.id, kind: item.kind, index: item.index, zone: item.zone.index, col: item.zone.col, row: item.zone.row, x: item.at[0], y: item.at[1], onsetMs: item.onsetWall, offsetMs: wallMs, ...rest, streak: this.streak };
    this.records.push(r);
    return r;
  }

  private endBubble(b: LiveBubble, kind: 'pop' | 'miss', wallMs: number): void {
    const d = this.decoy;
    if (d && d.bonkedClock === null) this.record({ id: d.id, kind: 'decoy', index: b.index, zone: d.zone, at: d.centre, onsetWall: b.onsetWall }, wallMs, { outcome: 'ignored', timeToPopMs: null, scoreChange: 0, offsetPx: null });
    this.after = { kind, centre: b.centre, atClock: this.clockMs };
    this.bubble = null;
    this.decoy = null;
    this.done++;
    this.phase = 'gap';
    this.gapUntil = this.clockMs + TIMING.gapMs;
  }

  private pop(b: LiveBubble, wallMs: number): RoundEvent {
    const timeToPopMs = this.clockMs - b.onsetClock;
    const points = popPoints(timeToPopMs, this.streak);
    this.score += points;
    this.streak += 1;
    this.outcomes.push('popped');
    const record = this.record({ id: b.id, kind: 'bubble', index: b.index, zone: b.zone, at: b.start, onsetWall: b.onsetWall }, wallMs, { outcome: 'popped', timeToPopMs, scoreChange: points, offsetPx: this.recentOffset(b.centre) });
    this.endBubble(b, 'pop', wallMs);
    return { kind: 'pop', record, points };
  }

  private miss(b: LiveBubble, wallMs: number): RoundEvent {
    this.streak = 0;
    this.outcomes.push('missed');
    const record = this.record({ id: b.id, kind: 'bubble', index: b.index, zone: b.zone, at: b.start, onsetWall: b.onsetWall }, wallMs, { outcome: 'missed', timeToPopMs: null, scoreChange: 0, offsetPx: null });
    this.endBubble(b, 'miss', wallMs);
    return { kind: 'miss', record };
  }

  private bonk(d: LiveDecoy, b: LiveBubble, wallMs: number): RoundEvent {
    d.bonkedClock = this.clockMs;
    const after = bonk(this.score);
    this.score = after.score;
    this.streak = 0;
    const record = this.record({ id: d.id, kind: 'decoy', index: b.index, zone: d.zone, at: d.centre, onsetWall: b.onsetWall }, wallMs, { outcome: 'bonked', timeToPopMs: null, scoreChange: after.change, offsetPx: null });
    return { kind: 'bonk', record };
  }

  /** The decoy is drawn until its 200 ms shake after a bonk is over. */
  decoyVisible(): boolean {
    const d = this.decoy;
    return d !== null && (d.bonkedClock === null || this.clockMs - d.bonkedClock < DECOY.shakeMs);
  }

  summary(): RoundSummary {
    return summariseRound(this.records, this.board.cols, this.board.rows);
  }
}
