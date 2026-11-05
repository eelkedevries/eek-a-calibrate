// Get ready, the ready check (design §2.5, §3, §2.16; spec §17.4.5; boards phone-ready,
// desktop-ready and position-signals): immersive. The mirrored camera image under the grey veil
// with the target oval, the live outline and eye dots and one directional cue; the cue card with
// one instruction at a time; the dock with the status row and the action slot. While the player
// settles, the engines load and, once a face is present, the device probe runs silently with the
// run-set rule of §7 row 1. "Start warm-up" needs Ready (or "Start anyway"), the engines and the
// probe; its tap starts the presentation span and opens the warm-up levels.
import { MOBILE, PROBE } from '../../core/constants.ts';
import { ReadyGuard, type CopyRef, type ReadyState, type ReadyView } from '../../core/position/guard.ts';
import type { Home } from '../../core/position/home.ts';
import { resultInput, SignalTracker, type FaceGeometry } from '../../core/position/signals.ts';
import { classRanges, guardClass, type ClassRanges, type GuardClass } from '../../core/position/thresholds.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId } from '../../core/types.ts';
import { detectDeviceClass } from '../../platform/capabilities.ts';
import { HAPTICS, speak, speechAvailable, vibrate } from '../../platform/feedback.ts';
import { listProfiles } from '../../platform/storage.ts';
import { cueCard } from '../components/cueCard.ts';
import { faceGuide, faceOnStage, guideLayout, ovalInBand, syntheticFace, type GuideLayout, type StageFace } from '../components/faceGuide.ts';
import { pauseOverlay } from '../components/pauseOverlay.ts';
import { statusRow } from '../components/statusRow.ts';
import { h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { cameraSide } from '../shell/appShell.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { topBar } from '../shell/topBar.ts';
import {
  activeMotionSource,
  currentSetup,
  ensureCapture,
  holdGameWakeLock,
  loadPercent,
  loadState,
  playedThisLoad,
  setGuardProvider,
  setReadyHome,
  setWarmupMode,
  warmupMode,
  type Capture,
} from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerFixture, testMode } from '../testHooks.ts';
import { startSpan } from '../game/gameState.ts';
import { measuredScale } from '../game/warmupRunner.ts';
import { decideRunSet, matchesCurrentSetup, recordProbe, snapshotCapture } from './camera.ts';

/** The probe starts once a face has been seen this long, so that the engines have work (as on #/camera). */
const PROBE_AFTER_FACE_MS = 1000;
/** The height of the cue's tip line (14 px × 1.55 and the 2 px gap), kept free under the headline. */
const TIP_RESERVE_PX = 24;
/** Below this short side the stimulus would be too small to play (design §2.5). */
const MIN_STAGE_PX = 280;
/** The frame a forced layout state assumes: a phone's 3:4 front camera, or a 16:9 webcam. */
const NOMINAL = { portrait: [480, 640], landscape: [1280, 720] } as const;

// ----- Forced states for the layout tests (test mode, §17.2.5) --------------------------------

type ForcedName = 'loading' | 'searching' | 'adjust' | 'holding' | 'ready' | 'anyway' | 'overlay' | 'overlay-late';
const FORCED: readonly ForcedName[] = ['loading', 'searching', 'adjust', 'holding', 'ready', 'anyway', 'overlay', 'overlay-late'];
let forcedAtLoad: ForcedName | null = null;
for (const name of FORCED) registerFixture(name.startsWith('overlay') ? `guard-${name}` : `ready-${name}`, () => void (forcedAtLoad = name));

function forcedView(name: ForcedName, ranges: ClassRanges): ReadyView {
  const good = { distance: 'good', position: 'good', light: 'good' } as const;
  const none = { distance: 'adjust', position: 'adjust', light: 'adjust' } as const;
  const base: ReadyView = { state: 'ready', condition: null, headline: { key: 'guard.cue.ready' }, tip: { key: 'guard.tip.ready' }, cue: null, status: good, holdFraction: 1, ready: true, anyway: false, slow: false, active: [] };
  switch (name) {
    case 'loading':
      return { ...base, state: 'loading', condition: 'loading', headline: { key: 'guard.cue.loading', vars: { pct: 62 } }, tip: null, status: none, holdFraction: 0, ready: false, active: ['loading'] };
    case 'searching':
      return { ...base, state: 'searching', condition: 'no-face', headline: { key: ranges.phone ? 'guard.cue.noFace.phone' : 'guard.cue.noFace.webcam' }, tip: null, status: none, holdFraction: 0, ready: false, active: ['no-face'] };
    case 'adjust':
      return { ...base, state: 'adjust', condition: 'too-far', headline: { key: 'guard.cue.tooFar' }, tip: { key: 'guard.tip.tooFar' }, cue: { kind: 'chevrons', direction: 'out' }, status: { ...good, distance: 'adjust' }, holdFraction: 0, ready: false, active: ['too-far'] };
    case 'holding':
      return { ...base, state: 'holding', headline: { key: 'guard.cue.holding' }, tip: null, holdFraction: 0.6, ready: false };
    case 'anyway':
      return { ...base, state: 'adjust', condition: 'too-far', headline: { key: 'guard.cue.tooFar' }, tip: { key: 'guard.tip.tooFar' }, cue: { kind: 'chevrons', direction: 'out' }, status: { ...good, distance: 'adjust' }, holdFraction: 0, ready: false, anyway: true, active: ['too-far'] };
    default:
      return base;
  }
}

/** A forced face in frame px around the oval, for the overlay's preview. */
function forcedGeometry(videoW: number, videoH: number, ranges: ClassRanges, shift: number): FaceGeometry {
  const rx = 0.88 * ((ranges.face.target * Math.max(videoW, videoH)) / 2);
  const cx = videoW / 2 + shift * videoW;
  const cy = videoH / 2 - 0.03 * videoH;
  return {
    videoW,
    videoH,
    box: { minX: (cx - rx) / videoW, minY: (cy - 1.3 * rx) / videoH, maxX: (cx + rx) / videoW, maxY: (cy + 1.3 * rx) / videoH },
    centre: [cx / videoW, cy / videoH],
    outline: { cx, cy, rx, ry: 1.3 * rx, angleDeg: 0 },
    eyes: [
      [cx - 0.385 * rx, cy - 0.23 * rx],
      [cx + 0.385 * rx, cy - 0.23 * rx],
    ],
  };
}

// ----- The screen -------------------------------------------------------------------------------

/** The engines Get ready loads: every engine for Auto, else the chosen ones and geometric. */
function candidateEngines(): EngineId[] {
  const { settings } = getState();
  return settings.engines === 'auto' ? [...ENGINE_IDS] : ENGINE_IDS.filter((e) => (settings.engines as readonly EngineId[]).includes(e) || e === 'geometric');
}

type Action = 'start' | 'anyway' | 'disabled' | 'larger';

class ReadyScreen {
  private readonly ctx: ScreenContext;
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly guide = faceGuide();
  private readonly cue = cueCard();
  private readonly status = statusRow();
  private readonly slowChip = h('p', { class: 'info-chip', hidden: true }, t('ready.slow'));
  private readonly mismatchChip = h('p', { class: 'info-chip', hidden: true }, t('ready.mismatch'));
  private readonly note = h('p', { class: 'dock__note', hidden: true }, t('ready.anywayNote'));
  private readonly button = h('button', { type: 'button', class: 'btn btn--primary ready-start', disabled: true }, t('ready.start'));
  private readonly larger = h('p', { class: 'dock__larger', hidden: true }, t('ready.larger'));
  private readonly tracker = new SignalTracker();
  private forced: ForcedName | null;
  private guard: ReadyGuard;
  private cls: GuardClass;
  private ranges: ClassRanges;
  private capture: Capture | null = null;
  private preview: HTMLVideoElement | null = null;
  private layout: GuideLayout | null = null;
  private view: ReadyView | null = null;
  private action: Action = 'disabled';
  private enginesLoaded = false;
  private probing = false;
  private probed = false;
  private faceSinceMs: number | null = null;
  private lastSpoken = '';
  private error: string | null = null;
  private mounted = true;
  private readonly offs: (() => void)[] = [];
  private lumaCanvas: HTMLCanvasElement | null = null;
  private lastLumaMs = 0;
  private maxPct = 0;
  private storedHome: Home | null = null;
  private starting = false;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.root = root;
    this.ctx = ctx;
    this.forced = testMode() ? forcedAtLoad : null;
    this.cls = this.currentClass();
    this.ranges = this.rangesFor(this.cls);
    this.guard = new ReadyGuard({ ranges: this.ranges, setup: currentSetup(), speed: getState().settings.speed });
    const track = trackModel(getState().settings.preset, { screen: 'ready' });
    this.stage = h('section', { class: 'stage ready-stage', 'aria-hidden': 'true' }, this.guide.svg);
    this.button.addEventListener('click', () => this.start());
    root.append(
      topBar({ variant: 'bar', surface: 'chip', track, detailsTab: 'device' }),
      h(
        'main',
        { class: 'app__main' },
        h('h1', { class: 'sr-only' }, t('ready.name')),
        this.stage,
        h('div', { class: 'cue-stack' }, this.cue.el, this.slowChip, this.mismatchChip),
        h('div', { class: 'dock' }, h('div', { class: 'dock__status' }, this.status.el), h('div', { class: 'dock__actions' }, this.note, this.button, this.larger)),
      ),
    );
    setGuardProvider(
      () => this.snapshot(),
      (name) => this.force(name),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, input, select, textarea, dialog')) return;
      if (this.action === 'start' || this.action === 'anyway') {
        e.preventDefault();
        this.start();
      }
    };
    document.addEventListener('keydown', onKey);
    this.offs.push(() => document.removeEventListener('keydown', onKey));
    // With "Read instructions aloud" on, the whole screen starts the warm-up once Ready (design §3.10).
    const tapAnywhere = (e: Event) => {
      if (!getState().settings.speech || this.action !== 'start') return;
      if ((e.target as HTMLElement | null)?.closest('button, a, dialog')) return;
      this.start();
    };
    root.addEventListener('click', tapAnywhere);
    this.offs.push(() => root.removeEventListener('click', tapAnywhere));
    const timer = setInterval(() => this.tick(), 100);
    this.offs.push(() => clearInterval(timer));
    const onResize = () => this.relayout();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));

    if (this.forced) this.mountForced(this.forced);
    else void this.begin();
    requestAnimationFrame(() => this.tick());
  }

  private currentClass(): GuardClass {
    const dc = detectDeviceClass();
    return guardClass({ setup: currentSetup(), mobile: dc.mobile, screenShortPx: Math.min(dc.screenWpx, dc.screenHpx), windowW: innerWidth, windowH: innerHeight });
  }

  private rangesFor(cls: GuardClass): ClassRanges {
    return classRanges(cls, { setup: currentSetup(), cameraSide: cameraSide(), landscape: innerWidth >= (5 / 4) * innerHeight });
  }

  private relayout(): void {
    const cls = this.currentClass();
    if (cls !== this.cls) {
      this.cls = cls;
      this.ranges = this.rangesFor(cls);
      this.guard.setRanges(this.ranges, currentSetup());
    }
    this.layout = null;
  }

  // ----- Starting the capture -----------------------------------------------------------------

  private async begin(): Promise<void> {
    // Get ready opened without Play (a reload): only a camera that is already allowed may start;
    // otherwise the player goes back to the Title to tap Play (spec §17.2.3).
    if (!playedThisLoad()) {
      const state = await navigator.permissions?.query({ name: 'camera' as PermissionName }).then((p) => p.state, () => 'prompt');
      if (!this.mounted) return;
      if (state !== 'granted') {
        location.replace('#/');
        return;
      }
      holdGameWakeLock();
    }
    let c: Capture;
    try {
      c = await ensureCapture([]);
    } catch (error) {
      if (!this.mounted) return;
      this.fail(t('ready.failed', { message: error instanceof Error ? error.message : String(error) }));
      return;
    }
    if (!this.mounted) return;
    this.capture = c;
    snapshotCapture(c);
    this.preview = c.camera.createPreview('ready-video');
    this.stage.prepend(this.preview);
    const motion = activeMotionSource();
    this.offs.push(
      c.onResult((r) => {
        this.tracker.pushResult(resultInput(r));
        if (r.face) this.faceSinceMs ??= performance.now();
        else this.faceSinceMs = null;
      }),
      c.onFrame((meta) => this.tracker.pushFrame(meta.tCaptureMs)),
      c.camera.onEnded(() => this.fail(t('ready.ended'))),
      c.camera.onChange(() => {
        this.tracker.reset();
        this.layout = null;
        this.probed = false;
      }),
      ...(motion ? [motion.onReading((r) => this.tracker.pushMotion(r))] : []),
    );
    void this.checkRestore(c);
    // The engines load in the background while the player settles (§17.4.5).
    ensureCapture(candidateEngines()).then(
      () => {
        if (!this.mounted) return;
        this.enginesLoaded = true;
        snapshotCapture(c);
      },
      (error: unknown) => {
        if (this.mounted) this.fail(t('ready.failed', { message: error instanceof Error ? error.message : String(error) }));
      },
    );
  }

  /** "Skip warm-up" needs a stored calibration that also matches this camera (spec §17.4.4). */
  private async checkRestore(c: Capture): Promise<void> {
    if (warmupMode() !== 'restore') return;
    const profiles = await listProfiles().catch(() => []);
    if (!this.mounted || profiles.some((p) => matchesCurrentSetup(p, c))) return;
    setWarmupMode('full');
    this.setChip(this.mismatchChip, true);
  }

  private async probe(c: Capture): Promise<void> {
    this.probing = true;
    try {
      const result = await c.host.probe(PROBE.frames);
      if (!this.mounted || this.capture !== c) return;
      const loaded = c.status.filter((s) => s.ok).map((s) => s.id);
      const auto = getState().settings.engines === 'auto';
      const decision = decideRunSet(result, loaded, detectDeviceClass().mobile ? MOBILE.warnMs : PROBE.warnMs, auto);
      recordProbe(result, decision);
      setState({ runSet: decision.runSet });
      snapshotCapture(c);
    } catch (error) {
      // A failed probe leaves the run set to the settings; the warm-up can still start.
      console.warn('Device probe failed:', error);
    } finally {
      this.probing = false;
      if (this.capture === c) this.probed = true;
    }
  }

  /** Shows `headline` in the cue, with the way to try again as its tip, and holds the action. */
  private fail(headline: string): void {
    this.error = headline;
  }

  // ----- Forced layout states ----------------------------------------------------------------

  private mountForced(name: ForcedName): void {
    this.enginesLoaded = true;
    this.probed = true;
    if (name === 'overlay' || name === 'overlay-late') {
      const [vw, vh] = this.nominalFrame();
      const home: Home = { centring: [0, 0], scale: this.ranges.face.target, yawDeg: 0, pitchDeg: 0, rollDeg: 0, tiltDeg: Number.NaN, phoneRollDeg: Number.NaN, irisPx: 20, geometry: forcedGeometry(vw, vh, this.ranges, 0) };
      const late = name === 'overlay-late';
      const overlay = pauseOverlay({ host: this.root, camera: null, context: late ? 'look' : 'warmup', onExit: () => this.ctx.navigate('title'), onExtra: () => undefined });
      // After the router has focused the screen's heading, as a real pause comes later.
      const timer = setTimeout(() =>
        overlay.update({
          view: { glyph: late ? 'lost' : 'drifting', phase: 'paused', reason: late ? 'face-lost' : 'out', headline: { key: late ? 'guard.pause.lookBack' : 'guard.pause.intoView' }, nudge: null, eyes: { dx: 0, dy: 0, spacing: 6.4 }, worst: late ? null : 'centre', pausedMs: late ? 10_000 : 900, extra: late },
          live: late ? null : forcedGeometry(vw, vh, this.ranges, -0.3),
          home,
          videoW: vw,
          videoH: vh,
        }),
      );
      this.offs.push(() => {
        clearTimeout(timer);
        overlay.dispose();
      });
    }
  }

  private force(name: string | null): void {
    if (!testMode()) return;
    forcedAtLoad = name && (FORCED as readonly string[]).includes(name) ? (name as ForcedName) : null;
    this.forced = forcedAtLoad;
    if (this.forced) {
      this.enginesLoaded = true;
      this.probed = true;
    }
    this.tick();
  }

  private nominalFrame(): readonly [number, number] {
    return innerWidth < (5 / 4) * innerHeight ? NOMINAL.portrait : NOMINAL.landscape;
  }

  // ----- Each tick -----------------------------------------------------------------------------

  /** The clear band between the cue and the dock, in stage px (design §3.5). */
  private band(): { top: number; bottom: number } {
    const s = this.stage.getBoundingClientRect();
    const tops = [this.root.querySelector('.topbar'), this.root.querySelector('.cue-stack')].filter((e): e is Element => e !== null).map((e) => e.getBoundingClientRect());
    const bottoms = [this.root.querySelector('.dock__status'), this.root.querySelector('.dock__actions'), this.root.querySelector('.dock')]
      .filter((e): e is Element => e !== null && (e as HTMLElement).getClientRects().length > 0)
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.height > 0);
    // Room is kept for the tip under the headline, so that its arrival does not move the preview.
    const tipReserve = this.root.querySelector<HTMLElement>('.cue__body')?.hidden ? TIP_RESERVE_PX : 0;
    const top = Math.max(0, ...tops.map((r, i) => r.bottom - s.top + (i === 1 ? tipReserve : 0)));
    const bottom = Math.min(s.height, ...bottoms.map((r) => r.top - s.top));
    return { top, bottom };
  }

  /** Shows or hides an info chip under the cue; the clear band changes, so the preview is laid out again. */
  private setChip(chip: HTMLElement, shown: boolean): void {
    if (chip.hidden !== shown) return;
    chip.hidden = !shown;
    this.layout = null;
  }

  private frameSize(): readonly [number, number] {
    const v = this.capture?.camera.settings;
    if (!this.forced && v && v.width > 0 && v.height > 0) return [v.width, v.height];
    return this.nominalFrame();
  }

  private ensureLayout(): GuideLayout | null {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!(W > 0 && H > 0)) return null;
    const [vw, vh] = this.frameSize();
    const l = this.layout;
    const band = this.band();
    // Kept while the frame and the stage are unchanged and the cue has not grown over the oval.
    if (l && l.w > 0 && Math.abs(l.w / l.scale - vw) < 0.5 && Math.abs(l.h / l.scale - vh) < 0.5 && this.stage.dataset.size === `${W}x${H}` && ovalInBand(l, band.top, band.bottom)) return l;
    const next = guideLayout({ stageW: W, stageH: H, videoW: vw, videoH: vh, bandTop: band.top, bandBottom: band.bottom, target: this.ranges.face.target });
    this.layout = next;
    this.stage.dataset.size = `${W}x${H}`;
    this.stage.dataset.fit = next.mode;
    this.tracker.setVisibleRegion(next.visible);
    if (this.preview) Object.assign(this.preview.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.w}px`, height: `${next.h}px` });
    return next;
  }

  /** The frame's mean luma from a 32 × 18 downscale of the preview (blockers 2 and 3). */
  private sampleLuma(now: number): void {
    const v = this.preview;
    if (!v || v.readyState < 2 || now - this.lastLumaMs < 250) return;
    this.lastLumaMs = now;
    this.lumaCanvas ??= Object.assign(document.createElement('canvas'), { width: 32, height: 18 });
    const g = this.lumaCanvas.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    try {
      g.drawImage(v, 0, 0, 32, 18);
      const d = g.getImageData(0, 0, 32, 18).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      this.tracker.pushFrameLuma(now, sum / (d.length / 4));
    } catch {
      // A frame that cannot be read yet says nothing.
    }
  }

  private tick(): void {
    if (!this.mounted) return;
    const now = performance.now();
    const layout = this.ensureLayout();
    if (!layout) return;
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    let view: ReadyView;
    let face: StageFace | null = null;
    if (this.forced) {
      view = forcedView(this.forced, this.ranges);
      if (view.state !== 'searching' && view.state !== 'loading') face = syntheticFace(layout.oval, view.state === 'adjust' ? 0.62 : 1);
    } else {
      this.sampleLuma(now);
      const signals = this.tracker.snapshot(now);
      const load = loadState();
      const engines = candidateEngines();
      const loading = !load.hostReady || !this.enginesLoaded;
      this.maxPct = Math.max(this.maxPct, loadPercent(engines));
      view = this.guard.update(signals, now, { loading, cameraStarted: this.capture !== null, loadingPct: loading ? Math.min(99, this.maxPct) : 100 });
      if (signals.geometry) face = faceOnStage(layout, signals.geometry);
      if (this.guard.justLatched) vibrate(HAPTICS.ready);
      // Home is stored when Ready latches, and again when a later full hold re-latches it.
      if (this.guard.home && this.guard.home !== this.storedHome) {
        this.storedHome = this.guard.home;
        setReadyHome(this.guard.home, this.cls);
      }
      const c = this.capture;
      if (c && this.enginesLoaded && !this.probed && !this.probing && this.faceSinceMs !== null && now - this.faceSinceMs >= PROBE_AFTER_FACE_MS) void this.probe(c);
    }
    this.view = view;
    this.guide.render(layout, W, H, { state: view.state, cue: view.cue, holdFraction: view.holdFraction, face });
    this.stage.dataset.state = view.state;
    const headline = this.error ?? tr(view.headline);
    this.cue.update(headline, this.error ? t('ready.retry') : view.tip ? tr(view.tip) : null, this.error ? null : view.cue, this.error ? undefined : view.headline.key);
    this.status.update(view.status);
    this.setChip(this.slowChip, view.slow);
    this.updateAction(view);
    this.speakIfNew(headline, view.state);
  }

  private updateAction(view: ReadyView): void {
    const small = Math.min(innerWidth, innerHeight) < MIN_STAGE_PX;
    const prepared = this.enginesLoaded && this.probed && this.error === null;
    let action: Action;
    if (small) action = 'larger';
    else if (view.ready && prepared) action = 'start';
    else if (view.anyway && prepared) action = 'anyway';
    else action = 'disabled';
    if (action === this.action && this.button.isConnected) return;
    this.action = action;
    this.larger.hidden = action !== 'larger';
    this.button.hidden = action === 'larger';
    this.note.hidden = action !== 'anyway';
    this.button.disabled = action === 'disabled';
    this.button.className = `btn ${action === 'anyway' ? 'btn--chip' : 'btn--primary'} ready-start`;
    this.button.textContent = t(action === 'anyway' ? 'ready.anyway' : 'ready.start');
    this.root.querySelector('.dock')?.toggleAttribute('data-note', action === 'anyway');
  }

  private speakIfNew(headline: string, state: ReadyState): void {
    if (!getState().settings.speech || !speechAvailable() || headline === this.lastSpoken) return;
    const line = state === 'ready' && this.action === 'start' ? `${headline}. ${t('ready.tapAnywhere')}` : headline;
    if (speak(line)) this.lastSpoken = headline;
  }

  /**
   * Start warm-up (or Start anyway): the presentation span starts inside this tap, because
   * fullscreen needs a gesture (§17.2.4), and stays on through the warm-up and what follows it.
   */
  private start(): void {
    if ((this.action !== 'start' && this.action !== 'anyway') || this.starting) return;
    this.starting = true;
    startSpan(this.root, measuredScale(getState().geometry)).then(
      () => {
        if (this.mounted) this.ctx.navigate('warmup');
      },
      (error: unknown) => {
        this.starting = false;
        this.fail(t('ready.failed', { message: error instanceof Error ? error.message : String(error) }));
      },
    );
  }

  private snapshot(): unknown {
    const v = this.view;
    const l = this.layout;
    return {
      screen: 'ready',
      forced: this.forced,
      cls: this.cls,
      setup: currentSetup(),
      state: v?.state ?? null,
      condition: v?.condition ?? null,
      active: v?.active ?? [],
      headline: v ? tr(v.headline) : null,
      tip: v?.tip ? tr(v.tip) : null,
      status: v?.status ?? null,
      holdFraction: v?.holdFraction ?? 0,
      ready: v?.ready ?? false,
      anyway: v?.anyway ?? false,
      slow: v?.slow ?? false,
      enginesLoaded: this.enginesLoaded,
      probed: this.probed,
      action: this.action,
      warmup: warmupMode(),
      error: this.error,
      layout: l ? { mode: l.mode, oval: l.oval, visible: l.visible } : null,
    };
  }

  unmount(): void {
    this.mounted = false;
    setGuardProvider(null);
    for (const off of this.offs.splice(0)) off();
    if (this.preview && this.capture) this.capture.camera.releasePreview(this.preview);
    this.preview = null;
  }
}

const tr = (ref: CopyRef) => t(ref.key, ref.vars);

const screen: Screen = {
  mount(root, ctx) {
    const s = new ReadyScreen(root, ctx);
    return () => s.unmount();
  },
};

export default screen;
