// The warm-up levels (spec §17.6, §17.4.4; design §2.6–§2.11, §2.16; boards phone-level1-pop,
// phone-level2-follow, desktop-level1-pop, desktop-level3-turn and phone-landscape-level1):
// stimulus mode inside the presentation span that Get ready started. Each level of the set opens
// with its card (steadiness line, track, pictogram, name, rule, hint, the 3 s countdown), then
// runs the protocol's block on the grey stage with the bubble, the firefly or the head arcs; the
// HUD is the pip line on the camera edge and the corner cluster. The position guard pauses and
// resumes the level (its overlay); Pause opens the Pause card; three pauses in a level ask to fix
// the set-up; a screen change offers to warm up again. After the Test round, "Checking your aim…"
// waits for the fit and the scoring, and Warm-up complete follows; a stored calibration that
// passes its Test round first runs the forced Re-aim of §4.13 (§17.4.4). The protocol, gating,
// labelling, fit and scoring are the existing ones (game/warmupRunner.ts, game/liveSession.ts).
import { SETUP } from '../../core/constants.ts';
import { layoutToPx } from '../../core/geometry/screen.ts';
import { median } from '../../core/maths/stats.ts';
import type { Home } from '../../core/position/home.ts';
import type { PauseReason as GuardPauseReason, PositionGuard } from '../../core/position/guard.ts';
import { createPositionGuard } from '../../core/position/guard.ts';
import { guardClass, type GuardClass } from '../../core/position/thresholds.ts';
import { minAcceptedFrames } from '../../core/protocol/schedule.ts';
import { pursuitTargetAt } from '../../core/protocol/pursuit.ts';
import { BUBBLE, bubbleDiameterPx } from '../../core/warmup/bubble.ts';
import { warmupPlan, type WarmupLevel, type WarmupMode } from '../../core/warmup/levels.ts';
import { steadiness, type Steadiness } from '../../core/warmup/steadiness.ts';
import type { PursuitItem, ScreenGeometry, TargetItem } from '../../core/types.ts';
import { detectDeviceClass } from '../../platform/capabilities.ts';
import { HAPTICS, playSound, speak, speechAvailable, vibrate } from '../../platform/feedback.ts';
import type { Invalidation, Presentation as Block } from '../../platform/presentation.ts';
import { drawBubble, gameColours, type GameColours } from '../components/bubble.ts';
import { checkingCard, type CheckingCard } from '../components/checkingCard.ts';
import { cornerCluster, type CornerCluster } from '../components/cornerCluster.ts';
import { drawFirefly, trailSegments } from '../components/firefly.ts';
import { ArcProgress, arcsExtent, drawHeadArcs } from '../components/headArcs.ts';
import { levelCard, type LevelCard } from '../components/levelCard.ts';
import { attachPositionGuard, type AttachedGuard } from '../components/pauseOverlay.ts';
import { cardDialog, pauseCard } from '../components/pauseCard.ts';
import { pipLine, type PipLine } from '../components/pipLine.ts';
import { positionGlyph } from '../components/positionGlyph.ts';
import { SectorTracker } from '../components/poseGuide.ts';
import { screenChangedCard } from '../components/screenChangedCard.ts';
import { BlockRunner, StimulusStage, type GameHooks, type PauseReason, type RunOutcome } from '../components/stimulusCanvas.ts';
import { targetSizes, type TargetSizes } from '../components/target.ts';
import { announce, h } from '../dom.ts';
import {
  addQuickRecalibration,
  clearQuickRecalibrations,
  clearWarmupResult,
  endSpan,
  recalibrationNumber,
  releaseSpan,
  setWarmupMode,
  setWarmupResult,
  span,
  startSpan,
  targetStyle,
  warmupMode,
  type LevelPause,
  type LevelRecord,
} from '../game/gameState.ts';
import { adoptQuickWarmup, adoptRestoreTestRound, cancelReaim, estimatorInUse, liveGeometry, runReaim } from '../game/liveSession.ts';
import { applyTestRound, awaitFit, fittedEngines, measuredScale, reducedMotion, sameLayout, WarmupSession, warmupResultFrom } from '../game/warmupRunner.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { openDetails } from '../shell/detailsSheet.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { activeMotionSource, currentFit, currentSetup, ensureCapture, readyHome, requestedEngines, setReadyHome, type Capture } from '../session.ts';
import { getState, setPrefs } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerFixture, registerTestHook, testMode } from '../testHooks.ts';
import './game.css';

// ----- Fixtures and test hooks (§17.2.5) --------------------------------------------------------

const FIXTURES = ['card', 'card-2', 'pop', 'follow', 'turn', 'checking', 'pause', 'changed', 'rotated', 'fix'] as const;
type FixtureName = (typeof FIXTURES)[number];
let fixtureAtLoad: FixtureName | null = null;
for (const name of FIXTURES) registerFixture(`warmup-${name}`, () => void (fixtureAtLoad = name));

let snapshot: (() => unknown) | null = null;
registerTestHook('warmup', () => (snapshot ? structuredClone(snapshot()) : null));

/** A home that grades nothing but light, steadiness and a lost face, until the guard re-latches it. */
const NEUTRAL_HOME: Home = { centring: [Number.NaN, Number.NaN], scale: Number.NaN, yawDeg: Number.NaN, pitchDeg: Number.NaN, rollDeg: Number.NaN, tiltDeg: Number.NaN, phoneRollDeg: Number.NaN, irisPx: Number.NaN, geometry: null };

type CardKind = 'level' | 'pause' | 'checking' | 'changed' | 'fix' | 'failed';
type Stop = 'exit' | 'ready' | 'fix' | 'failed' | 'changed' | 'unmounted';

const STEADINESS_LINE: Readonly<Record<Steadiness, string>> = { steady: 'warmup.card.steady', still: 'warmup.card.still', view: 'warmup.card.view', nice: 'warmup.card.nice' };

/** The guard class now, as Get ready works it out (for a home latched here). */
function currentClass(): GuardClass {
  const dc = detectDeviceClass();
  return guardClass({ setup: currentSetup(), mobile: dc.mobile, screenShortPx: Math.min(dc.screenWpx, dc.screenHpx), windowW: innerWidth, windowH: innerHeight });
}

function hintKey(level: Pick<WarmupLevel, 'hintKey'>): string {
  return `${level.hintKey}.${currentSetup() === 'webcam' ? 'webcam' : 'phone'}`;
}

/** The static bubble of Turn your head: 64 px on phones, 80 px on larger screens (design §2.9). */
function headRadius(): number {
  return (detectDeviceClass().mobile ? BUBBLE.headPhonePx : BUBBLE.headDesktopPx) / 2;
}

function bubbleSizes(sizes: TargetSizes, screen: Pick<ScreenGeometry, 'viewportWpx' | 'viewportHpx'>) {
  return { fullR: bubbleDiameterPx(sizes.discPx / 0.6, Math.min(screen.viewportWpx, screen.viewportHpx)) / 2, coreR: sizes.discPx / 2 };
}

// ----- The screen's parts -----------------------------------------------------------------------

class WarmupView {
  readonly root: HTMLElement;
  readonly heading: HTMLHeadingElement;
  readonly stage: StimulusStage;
  readonly pips: PipLine;
  readonly corner: CornerCluster;
  readonly layer: HTMLElement;
  readonly chip: HTMLElement;
  private card: { kind: CardKind; dispose(): void } | null = null;
  private chipKey = '';

  constructor(root: HTMLElement, glyph: HTMLElement, onPause: () => void) {
    this.root = root;
    this.heading = h('h1', { class: 'sr-only' }, t('warmup.name'));
    this.stage = new StimulusStage({ game: true });
    this.pips = pipLine(t('warmup.progress', { level: 1 }));
    this.pips.el.hidden = true;
    this.corner = cornerCluster(glyph, t('warmup.pause'), onPause);
    this.corner.setPlaying(false);
    this.layer = h('div', { class: 'stim-layer' });
    this.chip = h('p', { class: 'head-chip', hidden: true, 'aria-live': 'polite' });
    root.append(h('main', { class: 'app__main' }, this.heading, h('section', { class: 'stage', 'aria-hidden': 'true' }, this.stage.el), this.pips.el, this.chip, this.corner.el, this.layer));
  }

  get cardKind(): CardKind | null {
    return this.card?.kind ?? null;
  }

  showCard(kind: CardKind, el: HTMLElement, dispose: () => void = () => el.remove()): void {
    this.clearCard();
    this.layer.replaceChildren(el);
    this.card = { kind, dispose };
  }

  clearCard(kind?: CardKind): void {
    if (!this.card || (kind && this.card.kind !== kind)) return;
    this.card.dispose();
    this.card = null;
    this.layer.replaceChildren();
  }

  /** Turn your head's caption chip, under the arcs (above them near the bottom edge). */
  caption(text: string | null, at: { x: number; y: number; r: number } | null): void {
    if (!text || !at) {
      this.chip.hidden = true;
      this.chipKey = '';
      return;
    }
    // Called every frame: the chip is laid out again only when its text or place changes.
    const key = `${text}|${at.x}|${at.y}|${at.r}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    if (this.chip.textContent !== text) this.chip.textContent = text;
    this.chip.hidden = false;
    const hgt = this.chip.offsetHeight || 32;
    const below = at.y + at.r + 12;
    const top = below + hgt + 8 > this.root.clientHeight ? at.y - at.r - 12 - hgt : below;
    this.chip.style.left = `${at.x}px`;
    this.chip.style.top = `${Math.max(8, top)}px`;
  }
}

// ----- The screen -------------------------------------------------------------------------------

class WarmupScreen {
  private readonly ctx: ScreenContext;
  private readonly root: HTMLElement;
  private view: WarmupView | null = null;
  private capture: Capture | null = null;
  private guard: PositionGuard | null = null;
  private attached: AttachedGuard | null = null;
  private session: WarmupSession | null = null;
  private runner: BlockRunner | null = null;
  private card: LevelCard | null = null;
  private colours: GameColours | null = null;
  private mode: WarmupMode = 'full';
  private levelIndex = -1;
  private phase: 'starting' | 'card' | 'running' | 'checking' | 'reaim' | 'done' | 'stopped' = 'starting';
  private log: LevelRecord[] = [];
  private record: LevelRecord | null = null;
  private stop: Stop | null = null;
  private invalidation: Invalidation | 'camera' | null = null;
  private readonly cardsSeen: string[] = [];
  private readonly light: { luma: number[]; backlight: number[]; glare: number[]; lastMs: number } = { luma: [], backlight: [], glare: [], lastMs: 0 };
  private mounted = true;
  private readonly offs: (() => void)[] = [];
  private message: string | null = null;
  /** Home was latched afresh during this warm-up (no Ready on Get ready). */
  private relatched = false;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.root = root;
    this.ctx = ctx;
    snapshot = () => this.snapshot();
    const fixture = testMode() ? fixtureAtLoad : null;
    if (fixture) {
      fixtureAtLoad = null;
      this.mountFixture(fixture);
      return;
    }
    void this.start();
  }

  // ----- Starting ----------------------------------------------------------------------------

  private async start(): Promise<void> {
    // Inside the span only: a reload or a direct visit goes back to Get ready (spec §17.2.3).
    const block = span();
    if (!block || block.invalidation) {
      location.replace('#/ready');
      return;
    }
    let capture: Capture;
    try {
      capture = await ensureCapture(requestedEngines());
    } catch (error) {
      if (this.mounted) this.fail('warmup.failed.camera', error);
      return;
    }
    if (!this.mounted) return;
    this.capture = capture;
    const { settings } = getState();
    const home = readyHome()?.home ?? null;
    this.guard = createPositionGuard(capture, 'warmup', { home: home ?? NEUTRAL_HOME, motion: activeMotionSource(), holdMs: SETUP.holdMs / settings.speed });
    // "Start anyway" left no home: it is latched over the first hold, during the Level 1 card.
    if (!home) {
      this.guard.rehome();
      this.relatched = true;
    }
    const v = capture.camera.settings;
    this.attached = attachPositionGuard(this.guard, {
      host: this.root,
      camera: capture.camera,
      context: 'warmup',
      sound: settings.sound,
      videoW: v.width || 640,
      videoH: v.height || 480,
      onExit: () => this.leave('exit'),
      onExtra: () => this.leave('ready'),
    });
    this.view = new WarmupView(this.root, this.attached.glyph.el, () => this.runner?.pause('manual'));
    this.colours = gameColours(this.root);
    this.offs.push(
      this.guard.onPause((reason) => this.onGuardPause(reason)),
      this.guard.onResume(() => this.onGuardResume()),
      this.guard.onChange((s) => this.sampleLight(s.signals)),
    );
    const onResize = () => this.view?.corner.remeasure();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    if (fittedEngines(capture.status).length === 0) {
      this.fail('warmup.failed.fit', new Error('no engine loaded'));
      return;
    }

    this.mode = warmupMode();
    if (this.mode === 'restore' && !(await this.restore(capture, block))) {
      this.mode = 'full';
      setWarmupMode('full');
    }
    if (!this.mounted) return;
    if (this.mode === 'full') clearQuickRecalibrations();
    await this.play();
  }

  /** "Skip warm-up": the stored calibration that matches this camera and screen, made the session's (§17.4.4). */
  private async restore(capture: Capture, block: Block): Promise<boolean> {
    const [{ listProfiles }, { matchesCurrentSetup }, { restoreProfile }] = await Promise.all([import('../../platform/storage.ts'), import('./camera.ts'), import('../game/liveSession.ts')]);
    const profiles = await listProfiles().catch(() => []);
    const p = profiles.find((x) => matchesCurrentSetup(x, capture) && x.fit.fitGeometry && sameLayout(x.fit.fitGeometry.screen, block.geometry()));
    if (!p || !this.mounted) return false;
    try {
      restoreProfile(p);
      return true;
    } catch {
      return false;
    }
  }

  private newSession(): WarmupSession {
    const { settings } = getState();
    const capture = this.capture as Capture;
    this.session?.dispose();
    this.session = new WarmupSession({
      capture,
      mode: this.mode,
      preset: settings.preset,
      seed: settings.seed,
      speed: settings.speed,
      reducedMotion: reducedMotion(),
      recalibration: recalibrationNumber(),
      onCamera: (event) => this.onCamera(event),
    });
    return this.session;
  }

  // ----- The levels ------------------------------------------------------------------------------

  private async play(): Promise<void> {
    for (;;) {
      const outcome = await this.runLevels();
      if (outcome !== 'restart' || !this.mounted) return;
    }
  }

  private async runLevels(): Promise<'done' | 'restart' | 'stopped'> {
    const session = this.newSession();
    this.log = [];
    this.invalidation = null;
    this.stop = null;
    clearWarmupResult();
    let previous: { level: WarmupLevel; line: Steadiness } | null = null;
    let begun = false;
    for (let i = 0; i < session.plan.levels.length; i++) {
      this.levelIndex = i;
      const shown = session.plan.levels[i] as WarmupLevel;
      const choice = await this.levelCard(shown, previous);
      if (!this.mounted || this.stop) return 'stopped';
      const block = span();
      if (!block || block.invalidation || this.invalidation === 'camera') return this.screenChanged(block?.invalidation ?? null);
      // The geometry is measured once, at the start of Level 1 (design §4.1 rule 10).
      if (!begun) {
        session.begin(block);
        begun = true;
      }
      const level = session.plan.levels[i] as WarmupLevel;
      this.record = { key: level.key, number: level.number, of: level.of, pauses: [], steadiness: null, skipped: false, retried: 0 };
      if (choice === 'skip') {
        session.skip(level);
        this.record.skipped = true;
        this.log.push(this.record);
      } else {
        const outcome = await this.playLevel(level, block);
        if (!this.mounted) return 'stopped';
        if (outcome.kind === 'invalid') return this.screenChanged(outcome.invalidation);
        if (outcome.kind === 'aborted') return this.stopped();
        this.record.steadiness = steadiness(session.levelFrames(level), this.record.retried > 0);
        this.log.push(this.record);
        previous = { level, line: this.record.steadiness };
      }
      const next = session.plan.levels[i + 1];
      if (level.recording === 'calibration' && next?.recording === 'validation') {
        const ok = await session.endCalibration(fittedEngines((this.capture as Capture).status), () => this.mounted);
        if (!this.mounted) return 'stopped';
        if (!ok) {
          this.fail('warmup.failed.noFrames');
          return 'stopped';
        }
      }
    }
    return this.check();
  }

  private levelCard(level: WarmupLevel, previous: { level: WarmupLevel; line: Steadiness } | null): Promise<'start' | 'skip'> {
    const view = this.view as WarmupView;
    const { settings } = getState();
    this.phase = 'card';
    view.corner.setPlaying(false);
    view.pips.el.hidden = true;
    view.stage.clear();
    view.heading.textContent = t('warmup.heading', { level: level.number, name: t(level.nameKey) });
    // The quick warm-up and the restored Test round are drawn on the Quick set's track (Pop, Test).
    const card = levelCard({
      track: this.mode === 'full' ? trackModel(settings.preset, { screen: 'level', level: level.number }) : trackModel('quick', { screen: 'level', level: this.mode === 'restore' ? 2 : level.number }),
      level: level.number,
      levels: level.of,
      pictogram: level.key,
      name: t(level.nameKey),
      rule: t(level.ruleKey),
      hint: t(hintKey(level)),
      clear: previous ? { level: previous.level.number, line: t(STEADINESS_LINE[previous.line]) } : null,
      sound: settings.sound,
      onSound: (on) => void setPrefs({ sound: on }),
      speed: settings.speed,
      reducedMotion: reducedMotion(),
      skippable: level.skippable,
      tapArea: this.root,
    });
    this.card = card;
    this.cardsSeen.push(level.key);
    view.showCard('level', card.el, () => card.dispose());
    card.hold(this.guard?.state().view.phase !== 'running');
    card.el.querySelector<HTMLElement>('.level-card__start')?.focus({ preventScroll: true });
    if (settings.speech && speechAvailable()) speak(`${t(level.nameKey)}. ${t(level.ruleKey)}`);
    return card.result.then((choice) => {
      this.card = null;
      view.clearCard('level');
      return choice;
    });
  }

  private async playLevel(level: WarmupLevel, block: Block): Promise<RunOutcome> {
    const view = this.view as WarmupView;
    const session = this.session as WarmupSession;
    const { settings, prefs } = getState();
    const sizes = session.sizes();
    const screen = session.geometry.screen;
    const motion = reducedMotion();
    const hooks: GameHooks = {
      style: targetStyle(),
      bubble: bubbleSizes(sizes, screen),
      headR: headRadius(),
      colours: this.colours as GameColours,
      limitedHead: prefs.limitedHead,
      paused: (reason) => this.onRunnerPaused(reason),
      resumed: () => {
        view.clearCard('pause');
        // Carry on while the guard has paused (the player moved during the Pause card): the
        // guard's pause, already reported, holds the level until it resumes.
        if (this.guard && this.guard.state().view.phase !== 'running') this.runner?.pause('guard');
      },
      progress: (done, total, fraction) => {
        if (level.key === 'follow') view.pips.setFraction(fraction ?? done / Math.max(1, total));
        else view.pips.set(done, total);
      },
      target: (at) => view.corner.avoid(at),
      pop: () => {
        if (getState().settings.sound) playSound('pop');
        vibrate(HAPTICS.pop);
      },
      caption: (key, at) => view.caption(key ? t(key) : null, at),
    };
    const runner = new BlockRunner({
      stage: view.stage,
      block,
      geometry: screen,
      recorder: session.recorder(level),
      sizes,
      reducedMotion: motion,
      speed: settings.speed,
      minFrames: minAcceptedFrames(settings.speed),
      retry: level.recording === 'calibration',
      extend: level.recording === 'calibration',
      // The position guard pauses for a lost face (0.4 s, spec §17.5.3).
      faceLost: () => false,
      pose: () => session.link.pose(),
      game: hooks,
    });
    runner.total = level.items.length;
    this.runner = runner;
    this.guard?.setContext(level.key === 'turn' ? 'warmup-head' : 'warmup');
    this.guard?.resetPauses();
    // "Lean in" re-latches home at its start (design §2.11): until the hold is over, only a lost
    // face, the light and steadiness are graded, so the new distance does not pause the level.
    if (level.rehome && this.guard) {
      this.guard.rehome(NEUTRAL_HOME);
      this.guard.rehome();
    }
    if (this.guard && this.guard.state().view.phase !== 'running') runner.pause('guard');
    view.pips.setLabel(t('warmup.progress', { level: level.number }));
    view.pips.el.hidden = false;
    view.corner.setPlaying(true);
    this.phase = 'running';
    let outcome: RunOutcome;
    try {
      outcome = await runner.runBlock(level.items as (TargetItem | PursuitItem)[]);
    } catch (error) {
      console.error('The level stopped:', error);
      this.stop ??= 'failed';
      outcome = { kind: 'aborted' };
    } finally {
      if (this.record) this.record.retried = runner.retried;
      runner.dispose();
      this.runner = null;
      this.guard?.setContext('warmup');
      view.corner.setPlaying(false);
      view.pips.el.hidden = true;
      view.clearCard('pause');
    }
    return outcome;
  }

  // ----- Pausing ------------------------------------------------------------------------------

  private notePause(reason: LevelPause['reason']): void {
    this.record?.pauses.push({ reason, atMs: performance.now() });
  }

  private onGuardPause(reason: GuardPauseReason): void {
    this.card?.hold(true);
    const runner = this.runner;
    if (!runner) return;
    this.notePause(reason);
    runner.pause('guard');
    // Three pauses in one level: fix the set-up first (design §2.6).
    if ((this.guard?.state().pauses ?? 0) >= 3) {
      this.stop = 'fix';
      runner.abort();
    }
  }

  private onGuardResume(): void {
    this.card?.hold(false);
    this.runner?.resume('guard');
  }

  private onRunnerPaused(reason: PauseReason): void {
    if (reason === 'guard') return;
    this.notePause(reason === 'hidden' ? 'hidden' : 'manual');
    const view = this.view as WarmupView;
    const card = pauseCard({
      sound: getState().settings.sound,
      onSound: (on) => void setPrefs({ sound: on }),
      onDetails: (trigger) => openDetails({ tab: 'settings', trigger }),
      onExit: () => this.leave('exit'),
      onCarryOn: () => this.runner?.resume(reason),
    });
    view.showCard('pause', card.el);
    card.focus();
  }

  private sampleLight(s: { face: boolean; lumaMean: number; backlight: number; glare: number } | null): void {
    if (!s || !s.face || this.phase !== 'running') return;
    const now = performance.now();
    if (now - this.light.lastMs < 200) return;
    this.light.lastMs = now;
    for (const [list, v] of [[this.light.luma, s.lumaMean], [this.light.backlight, s.backlight], [this.light.glare, s.glare]] as const) if (Number.isFinite(v)) list.push(v);
  }

  // ----- Ends -----------------------------------------------------------------------------------

  private onCamera(event: 'changed' | 'ended'): void {
    if (event === 'ended') {
      this.stop = 'failed';
      this.message = t('warmup.failed.camera');
      this.runner?.abort();
      if (!this.runner) this.fail('warmup.failed.camera');
      return;
    }
    // A camera that changes its frame size invalidates the warm-up like a screen change (§14.3).
    this.invalidation = 'camera';
    const block = span();
    if (this.runner && block) this.runner.invalidate({ reason: 'resize', atMs: performance.now(), from: { w: 0, h: 0 }, to: { w: 0, h: 0 }, detail: 'the camera changed' });
  }

  /** The screen changed: "Warm up again" starts a new presentation from its tap and the levels anew. */
  private screenChanged(inv: Invalidation | null): Promise<'restart' | 'stopped'> {
    const view = this.view as WarmupView;
    this.phase = 'stopped';
    this.card?.dispose();
    this.card = null;
    view.stage.clear();
    view.corner.setPlaying(false);
    view.pips.el.hidden = true;
    // The shell takes the new viewport at once (in viewport mode it was fixed to the old size).
    releaseSpan();
    const rotated = inv?.reason === 'orientation';
    return new Promise((resolve) => {
      const card = screenChangedCard({
        rotated,
        onWarmUp: () => {
          void startSpan(this.root, measuredScale(getState().geometry)).then(
            () => {
              view.clearCard('changed');
              resolve(this.mounted ? 'restart' : 'stopped');
            },
            (error: unknown) => {
              console.warn('The presentation could not start again:', error);
              this.leave('ready');
              resolve('stopped');
            },
          );
        },
      });
      view.showCard('changed', card.el);
      card.focus();
      announce(t('warmup.changed.title'));
    });
  }

  private stopped(): 'stopped' {
    if (this.stop === 'fix') this.showFix();
    else if (this.stop === 'failed') this.fail(this.message ? null : 'warmup.failed.fit');
    else if (this.stop === null) this.leave('exit');
    return 'stopped';
  }

  private showFix(): void {
    const view = this.view as WarmupView;
    this.phase = 'stopped';
    const card = cardDialog({ title: t('warmup.fix.title'), body: t('warmup.fix.body'), role: 'alertdialog', className: 'stim-dialog--end', actions: [{ label: t('warmup.fix.action'), kind: 'primary', onSelect: () => this.leave('ready') }] });
    view.showCard('fix', card.el);
    card.focus();
  }

  /** A card that ends the warm-up with "Get ready again". */
  private fail(key: string | null, error?: unknown): void {
    if (error) console.warn('The warm-up stopped:', error);
    this.phase = 'stopped';
    this.stop ??= 'failed';
    const text = this.message ?? (key ? t(key) : '');
    this.message = text;
    if (!this.view) {
      this.view = new WarmupView(this.root, positionGlyph().el, () => undefined);
    }
    const card = cardDialog({ title: t('warmup.failed.title'), body: text, role: 'alertdialog', className: 'stim-dialog--end', actions: [{ label: t('warmup.failed.action'), kind: 'primary', onSelect: () => this.leave('ready') }] });
    this.view.showCard('failed', card.el);
    card.focus();
  }

  /** Leaves the warm-up: Exit goes to the Title, the rest to Get ready; the span ends either way. */
  private leave(where: 'exit' | 'ready'): void {
    this.stop ??= where;
    this.runner?.abort();
    this.card?.dispose();
    this.card = null;
    void endSpan().then(() => {
      if (this.mounted) this.ctx.navigate(where === 'exit' ? 'title' : 'ready');
    });
  }

  // ----- Checking your aim… ----------------------------------------------------------------------

  private async check(): Promise<'done' | 'restart' | 'stopped'> {
    const view = this.view as WarmupView;
    const session = this.session as WarmupSession;
    const capture = this.capture as Capture;
    const { settings } = getState();
    this.phase = 'checking';
    const checking: CheckingCard = checkingCard({ speed: settings.speed });
    view.showCard('checking', checking.el, () => checking.dispose());
    const pending = currentFit();
    const timer = setInterval(() => checking.set(pending ? 0.9 * pending.fraction : 0.5), 100);
    try {
      const { rec, receivedMs } = await session.endTestRound();
      const fit = await awaitFit(this.mode === 'restore' ? null : pending);
      // Exit or "Get ready again" on the guard's overlay, or a stopped camera, while the fit ran.
      if (!this.mounted || this.stop) return 'stopped';
      console.info(`Fit: ${Math.round(fit.fitMs)} ms; τ = ${fit.pursuitLagMs} ms; ${fit.selection.reason}`);
      const test = { rec, receivedMs, nominalFps: capture.nominalFps() };
      // The quick warm-up's refit joins the lineage of the fit it replaces (its records and blocks stay).
      const oldFit = getState().fit;
      if (this.mode === 'quick-warmup' && session.recalibrationRecording && oldFit) adoptQuickWarmup({ oldFit, fit, recalibration: session.recalibrationRecording, test });
      const scored = applyTestRound(fit, rec, receivedMs, capture.nominalFps());
      if (this.mode === 'quick-warmup' && session.recalibrationRecording) addQuickRecalibration(session.recalibrationRecording);
      const estimator = getState().estimator ?? fit.selection.estimator;
      setWarmupResult(
        warmupResultFrom({
          mode: this.mode,
          preset: settings.preset,
          plan: session.plan,
          scored,
          rec,
          estimator,
          frames: session.allFrames(),
          light: { lumaMean: median(this.light.luma), backlight: median(this.light.backlight), glare: median(this.light.glare) },
          log: this.log,
        }),
      );
      // "Lean in", or a warm-up started without Ready, latched a new home: what follows measures against it.
      const latest = this.guard?.state().home;
      if (latest && latest !== NEUTRAL_HOME && (this.relatched || session.plan.levels.some((l) => l.rehome))) setReadyHome(latest, readyHome()?.cls ?? currentClass());
      checking.set(1);
      if (this.mode === 'restore') {
        const verdict = scored.own.find((r) => r.estimator === estimator)?.verdict ?? 'not-tracking';
        if (adoptRestoreTestRound({ fit, test, verdict })) {
          clearInterval(timer);
          view.clearCard('checking');
          const after = await this.forcedReaim();
          if (after !== 'done') return after;
        }
      }
    } catch (error) {
      if (!this.mounted || this.stop) return 'stopped';
      this.fail('warmup.failed.fit', error);
      return 'stopped';
    } finally {
      clearInterval(timer);
    }
    this.phase = 'done';
    this.ctx.navigate('complete');
    return 'done';
  }

  /**
   * The drift check that a restored calibration forces (§4.13, §17.4.4), as Re-aim over this
   * screen, before Warm-up complete. "Warm up again" after a large shift starts the full warm-up;
   * Exit leaves the game.
   */
  private async forcedReaim(): Promise<'done' | 'restart' | 'stopped'> {
    const block = span();
    const capture = this.capture;
    const session = this.session;
    const fit = getState().fit;
    if (!block || !capture || !session || !fit) return 'done';
    this.phase = 'reaim';
    for (;;) {
      const out = await runReaim({
        root: this.root,
        capture,
        link: session.link,
        guard: this.guard,
        block,
        fit,
        geometry: liveGeometry(fit, block.geometry()),
        estimator: estimatorInUse(fit),
        forced: true,
        onExit: () => this.leave('exit'),
      });
      if (!this.mounted || this.stop) return 'stopped';
      if (out.result === 'invalid') return this.screenChanged(out.invalidation ?? null);
      if (out.choice === 'again') continue;
      if (out.choice === 'full') {
        this.mode = 'full';
        setWarmupMode('full');
        return 'restart';
      }
      return out.result === 'aborted' ? 'stopped' : 'done';
    }
  }

  // ----- Fixtures (test mode) -----------------------------------------------------------------

  private mountFixture(name: FixtureName): void {
    const { settings } = getState();
    const glyph = positionGlyph();
    glyph.update({ glyph: 'good', eyes: { dx: 0, dy: 0, spacing: 6.4 }, nudge: null });
    const view = new WarmupView(this.root, glyph.el, () => undefined);
    this.view = view;
    const levels = warmupPlan({ mode: 'full', preset: settings.preset, seed: settings.seed }).levels;
    const geometry: ScreenGeometry = { viewportWpx: innerWidth, viewportHpx: innerHeight, screenWpx: window.screen.width, screenHpx: window.screen.height, dpr: devicePixelRatio || 1, fullscreen: false, pxPerMm: 96 / 25.4, pxPerMmSource: 'assumed', insets: { top: 0, right: 0, bottom: 0, left: 0 } };
    view.stage.configure(geometry);
    const colours = gameColours(this.root);
    view.stage.background = colours.stage;
    view.stage.clear();
    const sizes = targetSizes(false, geometry.pxPerMm, 600);
    const card = (index: number, clear: boolean) => {
      const level = levels[index] as WarmupLevel;
      const c = levelCard({
        track: trackModel(settings.preset, { screen: 'level', level: level.number }),
        level: level.number,
        levels: level.of,
        pictogram: level.key,
        name: t(level.nameKey),
        rule: t(level.ruleKey),
        hint: t(hintKey(level)),
        clear: clear ? { level: index, line: t('warmup.card.steady') } : null,
        sound: settings.sound,
        onSound: () => undefined,
        speed: 1,
        reducedMotion: true,
        skippable: level.skippable,
        tapArea: this.root,
        frozen: true,
      });
      view.showCard('level', c.el, () => c.dispose());
      this.phase = 'card';
    };
    const playing = () => {
      view.corner.setPlaying(true);
      view.pips.el.hidden = false;
      this.phase = 'running';
    };
    const ctx2 = view.stage.context;
    switch (name) {
      case 'card':
        card(0, false);
        break;
      case 'card-2':
        card(Math.min(1, levels.length - 1), true);
        break;
      case 'pop':
      case 'pause': {
        playing();
        view.pips.set(6, 13);
        const [x, y] = layoutToPx(0.71, 0.29, geometry);
        const b = bubbleSizes(sizes, geometry);
        drawBubble(ctx2, x, y, { r: 0.6 * b.fullR, fullR: b.fullR, ghost: true }, sizes, colours);
        view.corner.avoid({ x, y, r: b.fullR });
        if (name === 'pause') {
          const p = pauseCard({ sound: true, onSound: () => undefined, onDetails: (trigger) => openDetails({ tab: 'settings', trigger }), onExit: () => undefined, onCarryOn: () => undefined });
          view.showCard('pause', p.el);
        }
        break;
      }
      case 'follow': {
        playing();
        view.pips.setFraction(0.2);
        const item: PursuitItem = { kind: 'pursuit', id: 'B-pursuit', phase: 'pursuit', block: 2, periodMs: 16000, holdMs: 1000, discardMs: 500, ax: 0.42, ay: 0.42, phiX: 0, phiY: Math.PI / 2 };
        const at = (tMs: number) => layoutToPx(...pursuitTargetAt(item, 0, tMs), geometry);
        const now = 4200;
        const [x, y] = at(now);
        drawFirefly(ctx2, x, y, trailSegments(at, now, 1000), sizes, colours);
        view.corner.avoid({ x, y, r: 22 });
        break;
      }
      case 'turn': {
        playing();
        view.pips.set(2, 5);
        const [x, y] = layoutToPx(0.71, 0.29, geometry);
        const r = headRadius();
        drawBubble(ctx2, x, y, { r, fullR: r, ghost: false }, sizes, colours);
        const tracker = new SectorTracker();
        tracker.addBaseline(0, 0);
        const arcs = new ArcProgress();
        for (const yaw of [4, 8, 2, -3, -6]) {
          tracker.add(yaw, 0, 'yaw');
          arcs.update(tracker, 'yaw');
        }
        tracker.add(0, -3, 'pitch');
        arcs.update(tracker, 'pitch');
        drawHeadArcs(ctx2, x, y, r, arcs.fills(tracker), arcs.current, colours);
        view.caption(t('warmup.head.nod'), { x, y, r: arcsExtent(r) });
        view.corner.avoid({ x, y, r: arcsExtent(r) });
        break;
      }
      case 'checking': {
        const c = checkingCard({ speed: 1, frozen: { fraction: 0.6, late: true } });
        view.showCard('checking', c.el, () => c.dispose());
        this.phase = 'checking';
        break;
      }
      case 'changed':
      case 'rotated': {
        const c = screenChangedCard({ rotated: name === 'rotated', onWarmUp: () => undefined });
        view.showCard('changed', c.el);
        break;
      }
      case 'fix':
        this.showFix();
        break;
    }
  }

  // ----- Test hook ------------------------------------------------------------------------------

  private snapshot(): unknown {
    const session = this.session;
    const level = session?.plan.levels[this.levelIndex] ?? null;
    return {
      screen: 'warmup',
      mode: this.mode,
      phase: this.phase,
      levels: session?.plan.levels.map((l) => l.key) ?? [],
      level: level ? { key: level.key, number: level.number, of: level.of } : null,
      card: this.view?.cardKind ?? null,
      cards: this.cardsSeen,
      item: this.runner?.current ?? null,
      done: this.runner?.done ?? 0,
      total: this.runner?.total ?? 0,
      pauses: this.log.map((r) => ({ level: r.key, pauses: r.pauses.map((p) => p.reason) })).concat(this.record && !this.log.includes(this.record) ? [{ level: this.record.key, pauses: this.record.pauses.map((p) => p.reason) }] : []),
      guardPauses: this.guard?.state().pauses ?? 0,
      geometry: this.geometry(),
      message: this.message,
    };
  }

  /** The run's geometry once Level 1 has started (null before, and in fixtures). */
  private geometry(): ScreenGeometry | null {
    try {
      return this.session?.geometry.screen ?? null;
    } catch {
      return null;
    }
  }

  unmount(): void {
    this.mounted = false;
    this.stop ??= 'unmounted';
    snapshot = null;
    for (const off of this.offs.splice(0)) off();
    cancelReaim();
    this.runner?.abort();
    this.runner?.dispose();
    this.card?.dispose();
    this.view?.clearCard();
    this.session?.dispose();
    this.attached?.dispose();
    this.guard?.dispose();
    this.view?.stage.destroy();
  }
}

const screen: Screen = {
  mount(root, ctx) {
    const s = new WarmupScreen(root, ctx);
    return () => s.unmount();
  },
};

export default screen;
