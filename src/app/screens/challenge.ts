// The challenge, "Pop!" (spec §17.9; design §2.14, §5; boards phone-challenge,
// phone-landscape-challenge, desktop-challenge): three rounds of 16 bubbles on the zones of Warm-up
// complete, inside the presentation span. Each round opens with its card (the level-card form),
// then plays on the grey: one bubble at a time in a zone, shrinking only while the selected
// estimator's filtered, drift-corrected gaze lights its zone (the leaky dwell of core/game), the
// spiky decoy of round 2, the drifters of round 3; the HUD is the pip line, the score chip and the
// corner cluster with nudges. Pause, the position guard's overlay and an offer card freeze the
// round. Round complete (framed) shows the zone map with each zone's pops and mark, Replay, the
// stars, one sentence and the score with the zone set's best, and the actions of design §2.14.
// Each round is recorded as a game block for the export, and its pops are a quality check: a
// consistent shift corrects the next round (§17.9.3).
import type { DriftForceReason } from '../../core/calibration/drift.ts';
import { makeBoard, bubbleDiameterPx, zoneCentre, type Board } from '../../core/game/board.ts';
import { consistentOffset } from '../../core/game/offset.ts';
import { DECOY, ROUNDS, TIMING, type RoundDef, type RoundKey } from '../../core/game/params.ts';
import { roundSeed } from '../../core/game/placement.ts';
import { reaimOfferDue, timedReaimDue } from '../../core/game/reaim.ts';
import { Round, type RoundEvent } from '../../core/game/round.ts';
import { streakActive } from '../../core/game/scoring.ts';
import { summariseRound, type ItemRecord, type RoundSummary } from '../../core/game/stats.ts';
import { pxPerDegAtCentre, pxToDeg } from '../../core/geometry/angles.ts';
import { pxToLayout } from '../../core/geometry/screen.ts';
import { applyBlinkMask } from '../../core/protocol/gating.ts';
import type { RecordedFrame, ScreenGeometry, TargetItem, Vec2 } from '../../core/types.ts';
import { HAPTICS, playSound, vibrate } from '../../platform/feedback.ts';
import { recordScore } from '../../platform/storage.ts';
import { drawBubble, drawBurst, gameColours, type GameColours } from '../components/bubble.ts';
import { cornerCluster, type AvoidTarget, type CornerCluster } from '../components/cornerCluster.ts';
import { decoyColour, drawDecoy } from '../components/decoy.ts';
import type { LevelCard } from '../components/levelCard.ts';
import { offerCard } from '../components/offerCard.ts';
import { pauseCard } from '../components/pauseCard.ts';
import { pipLine, type PipLine } from '../components/pipLine.ts';
import { roundCard } from '../components/roundCard.ts';
import { roundComplete, type RoundCompleteView } from '../components/roundComplete.ts';
import { formatScore, scoreChip, type ScoreChip } from '../components/scoreChip.ts';
import { screenChangedCard } from '../components/screenChangedCard.ts';
import { StimulusStage } from '../components/stimulusCanvas.ts';
import { targetSizes, type TargetSizes } from '../components/target.ts';
import { zoneBoard, type ZoneBoard } from '../components/zoneBoard.ts';
import { announce, h } from '../dom.ts';
import { addRoundResult, bestInMemory, endSpan, lastRoundResult, nextRound, playableZones, releaseSpan, setNextRound, setWarmupResult, warmupResult, type RoundResult } from '../game/gameState.ts';
import { applyGameOffset, LivePlay, startGameBlock, startQuickWarmup, warmUpAgain, type GameBlock } from '../game/liveSession.ts';
import { reducedMotion } from '../game/warmupRunner.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { addCleanup, setMode } from '../shell/appShell.ts';
import { openDetails } from '../shell/detailsSheet.ts';
import { contentFits, fitGuard } from '../shell/fitGuard.ts';
import { icon } from '../shell/icons.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { topBar } from '../shell/topBar.ts';
import { getState, setPrefs, setState, type ZoneStats } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerFixture, registerTestHook, testMode } from '../testHooks.ts';
import { fixtureScreen, fixtureWarmup, guardGlyph, measureSafe, offerBody, zoneNamesOf } from './look.ts';
import './game.css';
import './play.css';

// ----- Fixtures and the test hook (§17.2.5) ----------------------------------------------------

const FIXTURES = ['challenge-card-1', 'challenge-card-2', 'challenge-card-3', 'challenge-play', 'challenge-offer', 'challenge-done-well', 'challenge-done-final', 'challenge-done-badly', 'challenge-done-shift'] as const;
type FixtureName = (typeof FIXTURES)[number];
let fixtureAtLoad: FixtureName | null = null;
for (const name of FIXTURES)
  registerFixture(name, () => {
    setWarmupResult(fixtureWarmup());
    fixtureAtLoad = name;
  });

let snapshot: (() => unknown) | null = null;
registerTestHook('challenge', () => (snapshot ? structuredClone(snapshot()) : null));

type Phase = 'starting' | 'card' | 'playing' | 'offer' | 'reaim' | 'complete' | 'changed' | 'leaving';
type Action = 'next' | 'again' | 'reaim' | 'look';

/** The burst after a pop: 200 ms of round time (÷ speed in test mode, as the round clock runs). */
function popProgress(since: number): number | null {
  return since >= 0 && since < TIMING.popMs ? since / TIMING.popMs : null;
}

// ----- The screen -------------------------------------------------------------------------------

class ChallengeScreen {
  private readonly ctx: ScreenContext;
  private readonly root: HTMLElement;
  private readonly motion = !reducedMotion();
  // The round's view (stimulus mode)
  private readonly heading = h('h1', { class: 'sr-only' }, t('challenge.name'));
  private readonly board: ZoneBoard = zoneBoard(t('challenge.name'));
  private readonly stage = new StimulusStage();
  private readonly probe = h('div', { class: 'board-probe', 'aria-hidden': 'true' });
  private readonly layer = h('div', { class: 'play-layer' });
  private readonly pips: PipLine = pipLine(t('challenge.progress', { round: 1 }));
  private readonly chip: ScoreChip;
  private readonly glyph = guardGlyph(true);
  private readonly corner: CornerCluster;
  private readonly playView: HTMLElement;
  private doneView: { els: HTMLElement[]; view: RoundCompleteView } | null = null;
  private play: LivePlay | null = null;
  private zones: Board | null = null;
  private names: string[] = [];
  private geometry: ScreenGeometry | null = null;
  private colours: GameColours | null = null;
  private decoyFill = '#24242a';
  private sizes: TargetSizes | null = null;
  private bubbleR = 39;
  private phase: Phase = 'starting';
  private round: Round | null = null;
  private roundNo = 1;
  private block: GameBlock | null = null;
  private card: LevelCard | null = null;
  private manual = false;
  private offeredThisRound = false;
  private overlayPausedAt: number | null = null;
  private lateOffer = false;
  private trail: { x: number; y: number }[] = [];
  private raf = 0;
  private stopRound: ((how: 'aborted' | 'changed') => void) | null = null;
  private readonly offs: (() => void)[] = [];
  private mounted = true;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.root = root;
    this.ctx = ctx;
    const speed = getState().settings.speed;
    this.chip = scoreChip({ reducedMotion: !this.motion, speed });
    this.corner = cornerCluster(this.glyph.el, t('warmup.pause'), () => this.pause());
    this.corner.setPlaying(false);
    this.chip.el.hidden = true;
    this.pips.el.hidden = true;
    this.playView = h(
      'main',
      { class: 'app__main' },
      this.heading,
      h('section', { class: 'stage', 'aria-hidden': 'false' }, this.board.el, this.stage.el),
      this.probe,
      this.pips.el,
      this.chip.el,
      this.corner.el,
      this.layer,
    );
    this.stage.el.setAttribute('aria-hidden', 'true');
    root.append(this.playView);
    snapshot = () => this.snapshot();
    const fixture = testMode() ? fixtureAtLoad : null;
    fixtureAtLoad = null;
    if (fixture) this.mountFixture(fixture);
    else void this.start();
  }

  // ----- Starting -----------------------------------------------------------------------------

  private async start(): Promise<void> {
    let play: LivePlay | null;
    try {
      play = await LivePlay.open({
        root: this.root,
        context: 'challenge',
        onScreenChanged: (inv) => this.screenChanged(inv?.reason === 'orientation'),
        onExit: () => this.exitRound(),
        onWarmUp: () => {
          this.stopRound?.('aborted');
          warmUpAgain(this.root, (id) => this.ctx.navigate(id));
        },
        onCameraEnded: () => this.leave('ready'),
      });
    } catch (error) {
      console.warn('The challenge could not start:', error);
      if (this.mounted) this.leave('ready');
      return;
    }
    if (!play) return;
    if (!this.mounted) {
      play.dispose();
      return;
    }
    this.play = play;
    this.glyph.el.replaceWith(play.attached.glyph.el);
    this.offs.push(
      play.guard.onPause(() => {
        this.overlayPausedAt = performance.now();
        this.card?.hold(true);
      }),
      play.guard.onResume(() => {
        this.card?.hold(false);
        if (this.overlayPausedAt !== null && performance.now() - this.overlayPausedAt > 10_000) this.lateOffer = true;
        this.overlayPausedAt = null;
      }),
      play.onFrame((r, f, extra) => this.onFrame(r.face?.eyes.irisDiamPx ?? null, f, extra)),
    );
    const onKey = (e: KeyboardEvent) => this.key(e);
    document.addEventListener('keydown', onKey);
    this.offs.push(() => document.removeEventListener('keydown', onKey));
    const onResize = () => this.corner.remeasure();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    this.layout(play.geometry.screen, play.geometry.refDistanceMm ?? 600, !play.geometry.degreesApproximate);
    this.roundNo = nextRound();
    void this.loop();
  }

  /** The board, the bubble's size and the core's (design §5.3), measured once per round. */
  private layout(screen: ScreenGeometry, distanceMm: number, known: boolean): void {
    const z = playableZones() ?? warmupResult()?.zones ?? { cols: 1, rows: 3 };
    this.geometry = screen;
    this.zones = makeBoard(measureSafe(this.probe), z.cols, z.rows);
    this.names = zoneNamesOf(z.cols, z.rows);
    this.board.setBoard(this.zones, { w: screen.viewportWpx, h: screen.viewportHpx });
    this.stage.configure(screen);
    this.wipe();
    this.colours = gameColours(this.root);
    this.decoyFill = decoyColour(this.root);
    this.sizes = targetSizes(known, screen.pxPerMm, distanceMm);
    this.bubbleR = bubbleDiameterPx(this.zones.zones[0]!.rect, Math.min(screen.viewportWpx, screen.viewportHpx)) / 2;
  }

  /** The canvas is transparent over the board's SVG (the stage's own clear() paints it grey). */
  private wipe(): void {
    const g = this.geometry;
    if (g) this.stage.context.clearRect(0, 0, g.viewportWpx, g.viewportHpx);
  }

  // ----- The rounds ---------------------------------------------------------------------------

  private async loop(): Promise<void> {
    while (this.mounted && this.play) {
      if (!(await this.forcedCheck())) return;
      const go = await this.roundCardShown(this.roundNo);
      if (!go || !this.mounted) return;
      const result = await this.playRound(this.roundNo);
      if (!result || !this.mounted) return;
      const action = await this.complete(result);
      if (!this.mounted) return;
      if (action === 'look') {
        this.phase = 'leaving';
        this.ctx.navigate('look');
        return;
      }
      this.showPlay();
      if (action === 'next') this.roundNo = Math.min(3, this.roundNo + 1);
      else if (action === 'again') this.roundNo = 1;
      else if (action === 'reaim' && !(await this.reaim(false))) return;
      setNextRound(this.roundNo);
    }
  }

  /** A check forced by §4.13 runs before the next round card, unskippable. */
  private async forcedCheck(): Promise<boolean> {
    const play = this.play;
    if (!play) return false;
    const reasons = play.forcedReasons();
    if (reasons.length === 0) return true;
    const go = await this.offer('forced', reasons);
    return go ? this.reaim(true) : false;
  }

  private roundCardShown(n: number): Promise<boolean> {
    this.phase = 'card';
    this.corner.setPlaying(false);
    this.pips.el.hidden = true;
    this.chip.el.hidden = true;
    this.wipe();
    this.board.setLit(null);
    // The card sits on the plain grey, as the warm-up's do; the zones come with the round.
    this.board.el.setAttribute('hidden', '');
    const def = ROUNDS[n - 1] as RoundDef;
    const { settings } = getState();
    this.heading.textContent = t('challenge.heading', { round: n, name: t(`challenge.round.${def.key}.name`) });
    const card = roundCard({
      track: trackModel(settings.preset, { screen: 'challenge' }),
      round: n,
      key: def.key,
      sound: settings.sound,
      onSound: (on) => void setPrefs({ sound: on }),
      speed: settings.speed,
      reducedMotion: !this.motion,
      tapArea: this.root,
    });
    this.card = card;
    this.layer.replaceChildren(card.el);
    card.hold(this.play?.paused() ?? false);
    card.el.querySelector<HTMLElement>('.level-card__start')?.focus({ preventScroll: true });
    return card.result.then(() => {
      this.card = null;
      card.dispose();
      return this.phase === 'card' && this.mounted;
    });
  }

  private playRound(n: number): Promise<RoundResult | null> {
    const play = this.play as LivePlay;
    const def = ROUNDS[n - 1] as RoundDef;
    const { settings } = getState();
    const g = play.geometry;
    const block = startGameBlock(play.rec, { fit: play.fit, geometry: g, estimator: play.estimator(), round: { round: n, key: def.key, seed: 0, cols: this.zones!.cols, rows: this.zones!.rows } });
    const seed = roundSeed(settings.seed, play.rec.gameCount);
    block.round.seed = seed;
    const round = new Round({
      def,
      seed,
      board: this.zones as Board,
      bubbleR: this.bubbleR,
      pxPerDeg: pxPerDegAtCentre(g.screen.pxPerMm, g.refDistanceMm ?? 600),
      idPrefix: `G${String(play.rec.gameCount).padStart(3, '0')}`,
      speed: settings.speed,
    });
    this.round = round;
    this.block = block;
    this.trail = [];
    this.offeredThisRound = false;
    this.lateOffer = false;
    this.manual = false;
    this.phase = 'playing';
    this.board.el.removeAttribute('hidden');
    this.pips.setLabel(t('challenge.progress', { round: n }));
    this.pips.set(0, round.total);
    this.pips.el.hidden = false;
    this.chip.set(0, false);
    this.chip.el.hidden = false;
    this.corner.setPlaying(true);
    return new Promise<RoundResult | null>((resolve) => {
      let finished = false;
      const end = (how: 'complete' | 'aborted' | 'changed') => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(this.raf);
        this.stopRound = null;
        this.corner.setPlaying(false);
        this.chip.avoid(null);
        resolve(this.finishRound(how));
      };
      this.stopRound = (how) => end(how);
      const frame = (now: number) => {
        if (finished || !this.mounted) return;
        const inv = play.block.invalidation ?? play.block.check();
        if (inv) {
          this.screenChanged(inv.reason === 'orientation');
          return;
        }
        const held = this.manual || play.paused() || this.phase !== 'playing';
        let due = null as 'drift' | 'timed' | null;
        for (const e of round.tick(now, held, () => (due = this.offerDue()) === null)) this.onEvent(e, now);
        if (round.phase === 'done') {
          end('complete');
          return;
        }
        this.track(now);
        this.draw();
        if (due) this.showOffer(due);
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  private onEvent(e: RoundEvent, now: number): void {
    const round = this.round as Round;
    const block = this.block as GameBlock;
    if (e.kind === 'onset') {
      const g = this.geometry as ScreenGeometry;
      const [xn, yn] = pxToLayout(e.bubble.centre[0], e.bubble.centre[1], g);
      const item: TargetItem = { kind: 'target', id: e.bubble.id, phase: 'game', block: round.def.number, xNorm: xn, yNorm: yn, groupId: `zone-${e.bubble.zone.col}-${e.bubble.zone.row}`, settleMs: 0, sampleMs: TIMING.lifetimeMs, maxSampleMs: TIMING.lifetimeMs };
      block.items.push(item);
      return;
    }
    if (e.kind === 'end') return;
    const rec = e.record;
    if (rec.kind === 'bubble') block.presentations.push({ itemId: rec.id, onsetMs: rec.onsetMs, offsetMs: now });
    this.pips.set(round.done, round.total);
    this.chip.set(round.score, streakActive(round.streak));
    if (e.kind === 'pop') {
      if (getState().settings.sound) playSound('pop');
      vibrate(HAPTICS.pop);
    } else if (e.kind === 'bonk') {
      this.chip.bonk();
      vibrate(HAPTICS.pop);
    }
  }

  /** The gaze for the round and the recording: the filtered point, or nothing while held or invalid. */
  private onFrame(irisPx: number | null, f: RecordedFrame, extra: number): void {
    const play = this.play;
    const round = this.round;
    // Re-aim records its own frames; the round's block skips them.
    if (!play || !round || this.phase === 'card' || this.phase === 'complete' || this.phase === 'reaim') return;
    const block = this.block;
    if (block && round.phase !== 'done') {
      block.frames.push(f);
      if (extra !== 0) block.extraFlags.set(f.meta.index, extra);
      if (irisPx !== null) block.irisPx.set(f.meta.index, irisPx);
    }
    const d = play.stream.display;
    const now = performance.now();
    if (!d.visible || !d.filtered) {
      round.clearGaze();
      return;
    }
    if (d.held || d.greyed) round.setGaze(null, now);
    else round.setGaze(d.filtered, now);
    this.trail.push({ x: d.filtered[0], y: d.filtered[1] });
  }

  /** Where the bubble is at this frame, for samples.csv (a drifter moves). */
  private track(now: number): void {
    const b = this.round?.bubble;
    const block = this.block;
    if (!block) return;
    const last = block.track[block.track.length - 1];
    const id = b?.id ?? null;
    const x = b ? b.centre[0] : 0;
    const y = b ? b.centre[1] : 0;
    if (last && last.itemId === id && last.x === x && last.y === y) return;
    block.track.push({ tMs: now, itemId: id, x, y });
  }

  private draw(): void {
    const round = this.round;
    const sizes = this.sizes;
    const col = this.colours;
    if (!round || !sizes || !col) return;
    const ctx = this.stage.context;
    this.wipe();
    this.board.setLit(round.litZone?.index ?? null);
    const fullR = this.bubbleR;
    const coreR = sizes.discPx / 2;
    // The HUD fades near any of the bubble, the decoy and a missed bubble rising away.
    const near: AvoidTarget[] = [];
    const d = round.decoy;
    if (d && round.decoyVisible()) {
      const shake = d.bonkedClock === null || !this.motion ? null : (round.clockMs - d.bonkedClock) / DECOY.shakeMs;
      drawDecoy(ctx, d.centre[0], d.centre[1], fullR, this.decoyFill, shake);
      near.push({ x: d.centre[0], y: d.centre[1], r: fullR });
    }
    const b = round.bubble;
    this.label(b ? b.zone.index : null);
    if (b) {
      const [x, y] = b.centre;
      if (this.motion) {
        const r = coreR + (fullR - coreR) * (1 - b.dwell.progress);
        drawBubble(ctx, x, y, { r, fullR, ghost: true }, sizes, col);
      } else {
        drawBubble(ctx, x, y, { r: fullR, fullR, ghost: false }, sizes, col);
        // Reduced motion: an inner disc grows from the core to the full size as the dwell fills.
        ctx.beginPath();
        ctx.arc(x, y, coreR + (fullR - coreR) * b.dwell.progress, 0, 2 * Math.PI);
        ctx.fillStyle = col.bubbleGhost;
        ctx.fill();
      }
      near.push({ x, y, r: fullR });
    }
    const a = round.after;
    if (a && this.motion) {
      const since = round.clockMs - a.atClock;
      if (a.kind === 'pop') {
        const p = popProgress(since);
        if (p !== null) drawBurst(ctx, a.centre[0], a.centre[1], coreR, p, col);
      } else if (since < TIMING.missMs) {
        const p = since / TIMING.missMs;
        ctx.save();
        ctx.globalAlpha = 1 - p;
        drawBubble(ctx, a.centre[0], a.centre[1] - TIMING.missRisePx * p, { r: fullR, fullR, ghost: false }, sizes, col);
        ctx.restore();
        near.push({ x: a.centre[0], y: a.centre[1] - TIMING.missRisePx * p, r: fullR });
      }
    }
    this.corner.avoid(near);
    this.chip.avoid(near);
  }

  private labelled: number | null | undefined = undefined;

  /** The board's label names the bubble's zone (the canvas itself is not read out). */
  private label(zone: number | null): void {
    if (zone === this.labelled) return;
    this.labelled = zone;
    const zones = t('look.zones', { n: this.names.length });
    this.board.setLabel(zone === null ? `${zones}.` : t('challenge.board', { zones, zone: this.names[zone] ?? '' }));
  }

  /**
   * Asked before each bubble: Re-aim is offered when fewer than half of the last six popped, after
   * more than 10 s in the overlay, or 5 minutes on (at most once a round).
   */
  private offerDue(): 'drift' | 'timed' | null {
    const round = this.round;
    const play = this.play;
    if (!round || !play || this.offeredThisRound) return null;
    const every = getState().settings.driftEveryMin;
    if (every > 0 && timedReaimDue(performance.now(), play.rec.lastCheckMs, every)) return 'timed';
    return reaimOfferDue(round.outcomes, false) || this.lateOffer ? 'drift' : null;
  }

  /** Between bubbles (the round waits for the next one until the card is answered). */
  private showOffer(kind: 'drift' | 'timed'): void {
    if (this.offeredThisRound || this.phase !== 'playing') return;
    this.offeredThisRound = true;
    this.lateOffer = false;
    void this.offer(kind).then(async (go) => {
      if (go && (await this.reaim(false))) this.phase = 'playing';
    });
  }

  private offer(kind: 'drift' | 'timed' | 'forced', reasons: readonly DriftForceReason[] = []): Promise<boolean> {
    const before = this.phase;
    this.phase = 'offer';
    return new Promise((resolve) => {
      const done = (go: boolean) => {
        card.dispose();
        if (this.phase === 'offer') this.phase = before;
        if (!go && kind === 'timed' && this.play) this.play.rec.lastCheckMs = performance.now();
        resolve(go);
      };
      const card = offerCard({
        title: t(kind === 'forced' ? 'reaim.forced.title' : 'reaim.offer.title'),
        body: offerBody(kind, reasons),
        role: kind === 'forced' ? 'alertdialog' : 'dialog',
        primary: { label: t('reaim.go'), onSelect: () => done(true) },
        secondary: kind === 'forced' ? null : { label: t('reaim.keep'), onSelect: () => done(false) },
      });
      this.layer.replaceChildren(card.el);
      card.focus();
      announce(card.title);
    });
  }

  /** Re-aim over the screen; false when the challenge was left (a quick warm-up, a screen change). */
  private async reaim(forced: boolean): Promise<boolean> {
    const play = this.play;
    if (!play) return false;
    const before = this.phase;
    this.phase = 'reaim';
    this.layer.replaceChildren();
    for (;;) {
      const out = await play.reaim(forced || play.rec.forced.length > 0);
      if (!this.mounted || out.result === 'invalid' || this.phase !== 'reaim') return false;
      // Between bubbles, the round goes on with the corrections Re-aim left (its frames were not recorded here).
      const block = this.block;
      if (block && this.round?.phase !== 'done') block.segments.push({ fromIndex: block.frames.reduce((m, f) => Math.max(m, f.meta.index), -1) + 1, corrections: { ...play.rec.corrections } });
      if (out.choice === 'quick') {
        this.stopRound?.('aborted');
        this.phase = 'leaving';
        startQuickWarmup((id) => this.ctx.navigate(id));
        return false;
      }
      if (out.choice === 'full') {
        this.stopRound?.('aborted');
        this.phase = 'leaving';
        warmUpAgain(this.root, (id) => this.ctx.navigate(id));
        return false;
      }
      if (out.choice === 'again' || (out.result === 'aborted' && forced)) continue;
      this.phase = before === 'reaim' ? 'playing' : before;
      return true;
    }
  }

  // ----- Pausing and leaving ------------------------------------------------------------------

  private key(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.target instanceof Element && e.target.closest('dialog')) return;
    if (this.phase !== 'playing') return;
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (this.manual) this.resume();
      else this.pause();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.exitRound();
    }
  }

  private pause(): void {
    if (this.phase !== 'playing' || this.manual) return;
    this.manual = true;
    const card = pauseCard({
      sound: getState().settings.sound,
      onSound: (on) => void setPrefs({ sound: on }),
      onDetails: (trigger) => openDetails({ tab: 'settings', trigger }),
      onExit: () => this.exitRound(),
      onCarryOn: () => this.resume(),
    });
    this.layer.replaceChildren(card.el);
    card.focus();
  }

  private resume(): void {
    this.manual = false;
    this.layer.replaceChildren();
  }

  /** Exit (Pause card, Esc, the overlay): the round ends unfinished and Free look follows. */
  private exitRound(): void {
    if (this.phase === 'leaving' || this.phase === 'changed') return;
    this.stopRound?.('aborted');
    this.phase = 'leaving';
    this.ctx.navigate('look');
  }

  private screenChanged(rotated: boolean): void {
    if (this.phase === 'changed' || this.phase === 'leaving') return;
    this.stopRound?.('changed');
    this.card?.dispose();
    this.card = null;
    this.phase = 'changed';
    this.showPlay();
    this.wipe();
    this.corner.setPlaying(false);
    this.pips.el.hidden = true;
    this.chip.el.hidden = true;
    releaseSpan();
    const card = screenChangedCard({ rotated, onWarmUp: () => warmUpAgain(this.root, (id) => this.ctx.navigate(id)) });
    this.layer.replaceChildren(card.el);
    card.focus();
    announce(t('warmup.changed.title'));
  }

  private leave(where: 'title' | 'ready'): void {
    if (this.phase === 'leaving') return;
    this.stopRound?.('aborted');
    this.phase = 'leaving';
    void endSpan().then(() => {
      if (this.mounted) this.ctx.navigate(where);
    });
  }

  // ----- The end of a round -------------------------------------------------------------------

  private finishRound(how: 'complete' | 'aborted' | 'changed'): RoundResult | null {
    const round = this.round;
    const block = this.block;
    const play = this.play;
    this.round = null;
    this.block = null;
    this.wipe();
    this.board.setLit(null);
    if (!round || !block || !play) return null;
    block.endMs = performance.now();
    block.frames.sort((a, b) => a.meta.index - b.meta.index);
    applyBlinkMask(block.frames);
    block.records = [...round.records];
    const summary = round.summary();
    block.round = { ...block.round, score: round.score, stars: summary.stars, popped: summary.popped, total: summary.total, zones: summary.zones, ended: how === 'complete' ? 'complete' : 'aborted' };
    if (how !== 'complete') return null;
    // Played again from Free look, the challenge goes on where it was left (Round complete's actions decide otherwise).
    setNextRound(summary.well ? (round.def.number >= 3 ? 1 : round.def.number + 1) : round.def.number);
    const corrected = this.qualityCheck(round, play);
    const zones = { cols: round.board.cols, rows: round.board.rows };
    setState({ challenge: { cols: zones.cols, rows: zones.rows, rounds: (getState().challenge?.cols === zones.cols && getState().challenge?.rows === zones.rows ? getState().challenge!.rounds : 0) + 1, zones: this.cumulativeStats(zones) } });
    const g = this.geometry as ScreenGeometry;
    const result: RoundResult = {
      trial: block.trial,
      round: round.def.number,
      key: round.def.key,
      seed: round.seed,
      cols: zones.cols,
      rows: zones.rows,
      score: round.score,
      summary,
      records: [...round.records],
      trail: this.trail,
      viewport: { w: g.viewportWpx, h: g.viewportHpx },
      corrected,
      best: Math.max(round.score, bestInMemory(zones) ?? 0),
      ended: 'complete',
    };
    addRoundResult(result);
    return result;
  }

  /** The challenge as a quality check (§17.9.3): a shift agreed by three zones corrects the next round. */
  private qualityCheck(round: Round, play: LivePlay): boolean {
    const zone = round.board.zones[0]!.rect;
    const pops = round.records.filter((r) => r.outcome === 'popped' && r.offsetPx !== null).map((r) => ({ zone: r.zone, offsetPx: r.offsetPx as Vec2 }));
    const finding = consistentOffset(pops, { w: zone.w, h: zone.h });
    if (!finding) return false;
    const g = play.geometry;
    const d = g.refDistanceMm ?? 600;
    const c = zoneCentre(round.board.zones[0]!);
    const a = pxToDeg([c[0] + finding.offsetPx[0], c[1] + finding.offsetPx[1]], g.screen, d);
    const b = pxToDeg(c, g.screen, d);
    const out = applyGameOffset(play.rec, play.estimator(), [a[0] - b[0], a[1] - b[1]], performance.now());
    play.syncCorrection();
    return out.applied;
  }

  /** Every complete round of this zone set in this session, as Details → Results shows it. */
  private cumulativeStats(z: { cols: number; rows: number }): ZoneStats[] {
    const play = this.play;
    const records: ItemRecord[] = [];
    for (const b of play?.rec.blocks ?? []) if (b.kind === 'game' && b.round.ended === 'complete' && b.round.cols === z.cols && b.round.rows === z.rows) records.push(...b.records);
    return summariseRound(records, z.cols, z.rows).zones.map((s) => ({ col: s.col, row: s.row, bubbles: s.bubbles, popped: s.popped, medianPopMs: s.medianPopMs, offsetPx: s.offsetPx }));
  }

  // ----- Round complete (framed) --------------------------------------------------------------

  private showPlay(): void {
    if (!this.doneView) return;
    this.doneView.view.dispose();
    for (const el of this.doneView.els) el.remove();
    this.doneView = null;
    delete this.root.dataset.arrive;
    this.root.style.removeProperty('--zones');
    setMode(this.root, 'stimulus');
    this.root.prepend(this.playView);
  }

  private complete(r: RoundResult): Promise<Action> {
    this.phase = 'complete';
    const best = r.best;
    // The best score is kept per zone set on the device (§17.10.3); the line updates when it is read back.
    const stored = recordScore({ cols: r.cols, rows: r.rows, score: r.score, stars: r.summary.stars, round: r.trial }).then(
      (out) => out.best?.score ?? best,
      () => best,
    );
    return new Promise((resolve) => {
      const view = this.renderComplete(r, best);
      void stored.then((b) => {
        if (b !== null && b !== best && this.doneView?.view === view.view) {
          r.best = b;
          view.score.textContent = t('challenge.done.score', { score: formatScore(r.score), best: formatScore(b) });
        }
      });
      for (const [id, button] of view.buttons) button.addEventListener('click', () => resolve(id));
    });
  }

  private renderComplete(r: RoundResult, best: number | null): { view: RoundCompleteView; buttons: [Action, HTMLButtonElement][]; score: HTMLElement } {
    const s: RoundSummary = r.summary;
    const zoneRects = this.zones?.zones.map((z) => z.rect) ?? [];
    const names = zoneNamesOf(r.cols, r.rows);
    const sentence = !s.well ? t('challenge.done.badly') : r.corrected ? t('challenge.corrected') : s.allGood || !s.hardest ? t('challenge.done.allWell') : t('challenge.done.hardest', { zone: names[s.hardest.zone] ?? '' });
    const scoreLine = best === null ? t('challenge.done.scoreOnly', { score: formatScore(r.score) }) : t('challenge.done.score', { score: formatScore(r.score), best: formatScore(best) });
    const view = roundComplete({
      summary: s,
      zoneRects,
      viewport: r.viewport,
      trail: r.trail,
      zoneNames: names,
      eyebrow: r.round >= 3 ? t('challenge.done.final') : t('challenge.done.eyebrow', { round: r.round }),
      headline: t('challenge.done.headline', { popped: s.popped, total: s.total }),
      sentence,
      scoreLine,
      reducedMotion: !this.motion,
    });
    const actions = h('div', { class: 'actions round__actions' });
    const make = (id: Action, kind: 'primary' | 'secondary'): HTMLButtonElement => {
      const label = t(id === 'next' ? 'challenge.done.next' : id === 'again' ? 'challenge.done.again' : id === 'reaim' ? 'challenge.done.reaim' : 'challenge.done.look');
      const b =
        kind === 'secondary'
          ? h('button', { type: 'button', class: 'btn btn--secondary', 'data-action': id, 'aria-label': label }, icon(id === 'look' ? 'back' : 'play', 20), h('span', { class: 'btn__label' }, label))
          : h('button', { type: 'button', class: 'btn btn--primary', 'data-action': id }, label);
      actions.append(b);
      return b;
    };
    const buttons: [Action, HTMLButtonElement][] = [];
    if (!s.well) {
      buttons.push(['again', make('again', 'secondary')], ['reaim', make('reaim', 'primary')]);
    } else {
      buttons.push(['look', make('look', 'secondary')]);
      buttons.push(r.round >= 3 ? ['again', make('again', 'primary')] : ['next', make('next', 'primary')]);
    }
    const bar = topBar({ variant: 'bar', track: trackModel(getState().settings.preset, { screen: 'challenge' }), detailsTab: 'results' });
    const main = h('main', { class: 'app__main' }, view.stage, h('div', { class: 'side' }, view.panel, actions));
    this.playView.remove();
    setMode(this.root, 'framed');
    this.root.dataset.arrive = this.motion ? 'animate' : 'still';
    this.root.style.setProperty('--zones', String(s.zones.length));
    this.root.prepend(bar, main);
    this.doneView = { els: [bar, main], view };
    addCleanup(fitGuard(actions, { maxTier: 2, fits: contentFits }));
    if (getState().settings.sound) playSound('chime');
    main.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    announce(`${t('challenge.done.headline', { popped: s.popped, total: s.total })}. ${sentence}`);
    return { view, buttons, score: view.panel.querySelector('.round-panel__score') as HTMLElement };
  }

  // ----- Fixtures (test mode) -----------------------------------------------------------------

  private mountFixture(name: FixtureName): void {
    const screen = fixtureScreen();
    this.layout(screen, 600, false);
    const z = this.zones as Board;
    if (name.startsWith('challenge-card-')) {
      this.roundNo = Number(name.slice(-1));
      void this.roundCardFrozen(this.roundNo);
      return;
    }
    if (name === 'challenge-play' || name === 'challenge-offer') {
      this.phase = 'playing';
      this.heading.textContent = t('challenge.heading', { round: 2, name: t('challenge.round.spikes.name') });
      this.pips.set(8, 16);
      this.pips.el.hidden = false;
      this.chip.el.hidden = false;
      this.chip.set(1040, true);
      this.corner.setPlaying(true);
      // As the boards draw it: the bubble in the middle zone (the right one across a wider
      // screen), shrinking under the gaze, and a spike in the first zone.
      const across = z.cols > 1;
      const target = z.zones[across ? z.zones.length - 1 : Math.min(1, z.zones.length - 1)]!;
      const decoyZone = z.zones[0]!;
      this.board.setLit(target.index);
      const sizes = this.sizes as TargetSizes;
      const [bx, by] = zoneCentre(target);
      const [dx, dy] = zoneCentre(decoyZone);
      const ctx = this.stage.context;
      drawDecoy(ctx, dx + (across ? -0.03 : -0.2) * decoyZone.rect.w, dy + (across ? 0.14 : 0.12) * decoyZone.rect.h, this.bubbleR, this.decoyFill, null);
      const coreR = sizes.discPx / 2;
      const share = across ? 0.3 : 0.4;
      drawBubble(ctx, bx + (across ? 0.09 : 0.03) * target.rect.w, by + (across ? -0.08 : 0.04) * target.rect.h, { r: coreR + share * (this.bubbleR - coreR), fullR: this.bubbleR, ghost: this.motion }, sizes, this.colours as GameColours);
      if (name === 'challenge-offer') {
        this.phase = 'playing';
        void this.offer('drift');
      }
      return;
    }
    const kind = name.slice('challenge-done-'.length) as 'well' | 'final' | 'badly' | 'shift';
    const r = this.fixtureResult(kind, screen, z);
    void this.complete(r);
  }

  private roundCardFrozen(n: number): void {
    this.phase = 'card';
    this.board.el.setAttribute('hidden', '');
    const def = ROUNDS[n - 1] as RoundDef;
    const { settings } = getState();
    this.heading.textContent = t('challenge.heading', { round: n, name: t(`challenge.round.${def.key}.name`) });
    const card = roundCard({ track: trackModel(settings.preset, { screen: 'challenge' }), round: n, key: def.key as RoundKey, sound: settings.sound, onSound: () => undefined, speed: 1, reducedMotion: true, tapArea: this.root, frozen: true });
    this.card = card;
    this.layer.replaceChildren(card.el);
  }

  /** A Round complete of each outcome, on this window's zones (left 5 of 5, middle 6 of 6, right 3 of 5 when well). */
  private fixtureResult(kind: 'well' | 'final' | 'badly' | 'shift', screen: ScreenGeometry, z: Board): RoundResult {
    const counts = kind === 'badly' ? [[5, 1], [6, 2], [5, 3]] : [[5, 5], [6, 6], [5, 3]];
    const records: ItemRecord[] = [];
    let k = 0;
    z.zones.forEach((zone, zi) => {
      const [n, popped] = counts[zi % counts.length] as [number, number];
      for (let i = 0; i < n; i++) {
        const [x, y] = zoneCentre(zone);
        records.push({ id: `G001-B${String(++k).padStart(2, '0')}`, kind: 'bubble', index: k - 1, zone: zone.index, col: zone.col, row: zone.row, x, y, onsetMs: 0, offsetMs: 0, outcome: i < popped ? 'popped' : 'missed', timeToPopMs: i < popped ? 1100 + 80 * i : null, scoreChange: i < popped ? 120 : 0, streak: 0, offsetPx: null });
      }
    });
    const summary = summariseRound(records, z.cols, z.rows);
    const round = kind === 'final' ? 3 : 1;
    const trail: { x: number; y: number }[] = [];
    for (let i = 0; i < 240; i++) {
      const zone = z.zones[Math.floor(i / 30) % z.zones.length]!;
      const [cx, cy] = zoneCentre(zone);
      trail.push({ x: cx + 0.2 * zone.rect.w * Math.sin(i / 7), y: cy + 0.15 * zone.rect.h * Math.cos(i / 11) });
    }
    return { trial: 'game-001', round, key: (ROUNDS[round - 1] as RoundDef).key, seed: 1, cols: z.cols, rows: z.rows, score: kind === 'badly' ? 640 : 1820, summary, records, trail, viewport: { w: screen.viewportWpx, h: screen.viewportHpx }, corrected: kind === 'shift', best: 1820, ended: 'complete' };
  }

  // ----- Test hook ------------------------------------------------------------------------------

  private snapshot(): unknown {
    const round = this.round;
    const b = round?.bubble ?? null;
    const last = lastRoundResult();
    return {
      screen: 'challenge',
      phase: this.phase,
      round: this.roundNo,
      zones: this.zones ? { cols: this.zones.cols, rows: this.zones.rows } : null,
      lit: round?.litZone?.index ?? this.board.lit,
      bubble: b ? { id: b.id, zone: b.zone.index, x: b.centre[0], y: b.centre[1], r: this.bubbleR } : null,
      decoy: round?.decoy ? { id: round.decoy.id, zone: round.decoy.zone.index, bonked: round.decoy.bonkedClock !== null } : null,
      dwell: b ? b.dwell.progress : null,
      score: round?.score ?? null,
      streak: round?.streak ?? null,
      done: round?.done ?? 0,
      total: round?.total ?? 0,
      paused: this.manual || (this.play?.paused() ?? false),
      last: last ? { trial: last.trial, round: last.round, score: last.score, stars: last.summary.stars, popped: last.summary.popped, total: last.summary.total, well: last.summary.well, corrected: last.corrected, best: last.best, zones: last.summary.zones } : null,
    };
  }

  unmount(): void {
    this.mounted = false;
    snapshot = null;
    this.stopRound?.('aborted');
    cancelAnimationFrame(this.raf);
    this.card?.dispose();
    this.chip.dispose();
    this.doneView?.view.dispose();
    for (const off of this.offs.splice(0)) off();
    this.play?.dispose();
    this.stage.destroy();
    delete this.root.dataset.arrive;
    delete this.root.dataset.reaim;
    this.root.style.removeProperty('--zones');
  }
}

const screen: Screen = {
  mount(root, ctx) {
    const s = new ChallengeScreen(root, ctx);
    return () => s.unmount();
  },
};

export default screen;
