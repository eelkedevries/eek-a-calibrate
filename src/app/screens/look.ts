// Free look (spec §17.8.1; design §2.13; boards phone-free-look and desktop-free-look): immersive
// on the grey, inside the presentation span. The zones of Warm-up complete as faint outlines, the
// zone of the selected estimator's filtered, drift-corrected gaze lit, and a soft disc at that gaze
// whose radius is the 68th percentile of the Test round's per-target error in px (fading with the
// confidence, greyed with a dashed edge outside the calibrated head range). The bar and the dock
// ("Tracking", one sentence, Re-aim, Play the challenge) fade after 3 s without input; the glyph
// then stays in the corner. Re-aim runs over this screen (also by D), and is offered after 5
// minutes, after more than 10 s in the auto-pause overlay, and, unskippable, when §4.13 forces a
// check. Expert mode (Details → Settings, or ?expert=1) adds Live's raw and per-engine dots, the
// trail, recording (R) with markers (M) and the estimator switch.
import { ESTIMATOR_NAMES } from '../../core/calibration/select.ts';
import { trialName } from '../../core/export/samplesCsv.ts';
import { makeBoard, zoneAtPoint, zoneCentre, type Board, type Rect } from '../../core/game/board.ts';
import { LOOK } from '../../core/game/params.ts';
import { timedReaimDue } from '../../core/game/reaim.ts';
import { percentile } from '../../core/maths/stats.ts';
import { applyBlinkMask } from '../../core/protocol/gating.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId, EstimatorId, ScreenGeometry, Vec2 } from '../../core/types.ts';
import type { DriftForceReason } from '../../core/calibration/drift.ts';
import { drawBubble, gameColours } from '../components/bubble.ts';
import { cornerCluster } from '../components/cornerCluster.ts';
import { freeLookDock, type FreeLookDock } from '../components/freeLookDock.ts';
import { gazeDisc, type GazeDisc } from '../components/gazeDisc.ts';
import { offerCard, statusChip } from '../components/offerCard.ts';
import { pipLine } from '../components/pipLine.ts';
import { positionGlyph, type PositionGlyph } from '../components/positionGlyph.ts';
import { screenChangedCard } from '../components/screenChangedCard.ts';
import { StimulusStage } from '../components/stimulusCanvas.ts';
import { targetSizes } from '../components/target.ts';
import { zoneBoard, type ZoneBoard } from '../components/zoneBoard.ts';
import { announce, h } from '../dom.ts';
import { endSpan, playableZones, releaseSpan, setWarmupResult, warmupResult, type WarmupResult } from '../game/gameState.ts';
import { LivePlay, ownReport, startQuickWarmup, warmUpAgain, type LiveBlock, type ReaimOutcome } from '../game/liveSession.ts';
import { reducedMotion } from '../game/warmupRunner.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { addCleanup } from '../shell/appShell.ts';
import { trackModel } from '../shell/levelTrack.ts';
import { topBar } from '../shell/topBar.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerFixture, registerTestHook, testMode } from '../testHooks.ts';
import './game.css';
import './play.css';

// ----- Shared with the challenge --------------------------------------------------------------

/** The safe area of the board (the shell's gutters), measured from a probe in the screen. */
export function measureSafe(probe: HTMLElement): Rect {
  const r = probe.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** The zones' names, by index, for labels and Round complete's sentence. */
export function zoneNamesOf(cols: number, rows: number): string[] {
  const along = (k: number, n: number, axis: 'col' | 'row'): string | null => {
    if (n === 1) return null;
    if (n === 2) return t(`complete.zone.${axis === 'col' ? (k === 0 ? 'left' : 'right') : k === 0 ? 'top' : 'bottom'}`);
    if (n === 3) return t(`complete.zone.${k === 1 ? 'middle' : axis === 'col' ? (k === 0 ? 'left' : 'right') : k === 0 ? 'top' : 'bottom'}`);
    const four = axis === 'col' ? ['farLeft', 'centreLeft', 'centreRight', 'farRight'] : ['top', 'upper', 'lower', 'bottom'];
    const key = four[k] as string;
    return key === 'top' || key === 'bottom' ? t(`complete.zone.${key}`) : t(`look.zone.${key}`);
  };
  const out: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = along(col, cols, 'col');
      const r = along(row, rows, 'row');
      if (c && r) out.push(c === r ? t('look.zone.centre') : t('look.zone.pair', { row: r, col: c }));
      else out.push(c ?? r ?? t('look.zone.only'));
    }
  }
  return out;
}

/** A warm-up result for the fixtures: three zones down a phone held upright, across a wider screen. */
export function fixtureWarmup(): WarmupResult {
  const w = innerWidth;
  const hgt = innerHeight;
  const portrait = w < (5 / 4) * hgt;
  return {
    mode: 'full',
    preset: getState().settings.preset,
    levels: ['pop', 'follow', 'turn', 'test'],
    estimator: 'combined',
    verdict: 'good',
    zones: portrait ? { cols: 1, rows: 3 } : { cols: 3, rows: 1 },
    needDeg: 4,
    stars: 3,
    outcome: 'great',
    cause: null,
    marks: [],
    viewport: { w, h: hgt },
    restoreRejected: false,
    log: [],
    atMs: performance.now(),
  };
}

/** The test geometry of the fixtures: the window, 96 px per inch. */
export function fixtureScreen(): ScreenGeometry {
  return { viewportWpx: innerWidth, viewportHpx: innerHeight, screenWpx: window.screen.width, screenHpx: window.screen.height, dpr: devicePixelRatio || 1, fullscreen: false, pxPerMm: 96 / 25.4, pxPerMmSource: 'assumed', insets: { top: 0, right: 0, bottom: 0, left: 0 } };
}

/** Free look's and the challenge's position glyphs, kept in step with the guard. */
export function guardGlyph(nudges: boolean): PositionGlyph {
  const g = positionGlyph({ nudges });
  g.update({ glyph: 'good', eyes: { dx: 0, dy: 0, spacing: 6.4 }, nudge: null });
  return g;
}

/** The Re-aim offer's body for the reasons a check is forced (§4.13), or the timed and drifting offers. */
export function offerBody(kind: 'drift' | 'timed' | 'forced', reasons: readonly DriftForceReason[]): string {
  if (kind === 'forced') return t(`reaim.forced.${reasons[0] ?? 'restore'}`);
  return t(kind === 'timed' ? 'reaim.offer.timed' : 'reaim.offer.body');
}

// ----- Fixtures and the test hook (§17.2.5) ----------------------------------------------------

const FIXTURES = ['look', 'look-faded', 'look-offer', 'look-reaim', 'reaim-fixed', 'reaim-fine', 'reaim-large'] as const;
type FixtureName = (typeof FIXTURES)[number];
let fixtureAtLoad: FixtureName | null = null;
for (const name of FIXTURES)
  registerFixture(name, () => {
    setWarmupResult(fixtureWarmup());
    fixtureAtLoad = name;
  });

let snapshot: (() => unknown) | null = null;
registerTestHook('look', () => (snapshot ? structuredClone(snapshot()) : null));

/** Okabe–Ito colours of the estimators (as Live draws them) where the theme gives none. */
const ESTIMATOR_COLOURS: Readonly<Record<EstimatorId, string>> = { blazegaze: '#56b4e9', peekr: '#e69f00', geometric: '#009e73', eyepixel: '#cc79a7', combined: '#f4f2ec' };

// ----- The screen -------------------------------------------------------------------------------

type Phase = 'starting' | 'look' | 'offer' | 'reaim' | 'changed' | 'leaving';

class LookScreen {
  private readonly ctx: ScreenContext;
  private readonly root: HTMLElement;
  private readonly heading = h('h1', { class: 'sr-only' }, t('look.name'));
  private readonly board: ZoneBoard = zoneBoard(t('look.name'));
  private readonly disc: GazeDisc = gazeDisc();
  private readonly probe = h('div', { class: 'board-probe', 'aria-hidden': 'true' });
  private readonly layer = h('div', { class: 'play-layer' });
  private readonly stage: HTMLElement;
  private readonly barGlyph = guardGlyph(true);
  private readonly cornerGlyph = guardGlyph(true);
  private readonly dockGlyph = guardGlyph(true);
  private dock: FreeLookDock | null = null;
  private play: LivePlay | null = null;
  private zones: Board | null = null;
  private names: string[] = [];
  private discR = 44;
  private phase: Phase = 'starting';
  private faded = false;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private pausedAt: number | null = null;
  private offered: 'drift' | 'timed' | 'forced' | null = null;
  private lastReaim: ReaimOutcome['result'] | null = null;
  private litZone: number | null = null;
  private discShown: { x: number; y: number; r: number; greyed: boolean } | null = null;
  private readonly offs: (() => void)[] = [];
  private mounted = true;
  // Expert mode
  private readonly expert: boolean;
  private expertCanvas: HTMLCanvasElement | null = null;
  private expertStatus: HTMLElement | null = null;
  private recordButton: HTMLButtonElement | null = null;
  private markerButton: HTMLButtonElement | null = null;
  private recording: LiveBlock | null = null;
  private readonly trail: { t: number; p: Vec2 }[] = [];

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.root = root;
    this.ctx = ctx;
    this.expert = getState().prefs.expert || ctx.params.get('expert') === '1';
    snapshot = () => this.snapshot();
    this.stage = h('section', { class: 'stage', 'aria-hidden': 'false' }, this.board.el);
    this.board.marks.append(this.disc.el);
    const fixture = testMode() ? fixtureAtLoad : null;
    fixtureAtLoad = null;
    this.render();
    if (fixture) this.mountFixture(fixture);
    else void this.start();
  }

  private render(): void {
    const track = trackModel(getState().settings.preset, { screen: 'look' });
    const bar = topBar({ variant: 'bar', surface: 'chip', track, detailsTab: 'results' });
    const end = bar.querySelector('.topbar__end');
    end?.prepend(h('div', { class: 'look-bar-glyph' }, this.barGlyph.el));
    this.dock = freeLookDock(this.dockGlyph.el, () => void this.reaim(false), () => this.playChallenge());
    this.root.append(
      bar,
      h(
        'main',
        { class: 'app__main' },
        this.heading,
        this.stage,
        this.probe,
        this.expert ? this.expertTools() : null,
        this.dock.el,
        h('div', { class: 'look-corner' }, this.cornerGlyph.el),
        this.layer,
      ),
    );
  }

  // ----- Starting -----------------------------------------------------------------------------

  private async start(): Promise<void> {
    let play: LivePlay | null;
    try {
      play = await LivePlay.open({
        root: this.root,
        context: 'look',
        onScreenChanged: (inv) => this.screenChanged(inv?.reason === 'orientation'),
        onExit: () => this.leave('title'),
        onWarmUp: () => warmUpAgain(this.root, (id) => this.ctx.navigate(id)),
        onCameraEnded: () => this.leave('ready'),
      });
    } catch (error) {
      console.warn('Free look could not start:', error);
      if (this.mounted) this.leave('ready');
      return;
    }
    if (!play) return;
    if (!this.mounted) {
      play.dispose();
      return;
    }
    this.play = play;
    this.dockGlyph.el.replaceWith(play.attached.glyph.el);
    this.offs.push(
      play.guard.onChange((s) => {
        for (const g of [this.barGlyph, this.cornerGlyph]) g.update({ glyph: s.view.glyph, eyes: s.view.eyes, nudge: s.view.nudge });
      }),
      play.guard.onPause(() => (this.pausedAt = performance.now())),
      play.guard.onResume(() => {
        const long = this.pausedAt !== null && performance.now() - this.pausedAt > LOOK.overlayOfferMs;
        this.pausedAt = null;
        if (long && this.phase === 'look') this.offer('drift');
      }),
      play.onFrame((r, f, extra) => {
        const rec = this.recording;
        if (!rec) return;
        rec.frames.push(f);
        if (extra !== 0) rec.extraFlags.set(f.meta.index, extra);
        if (r.face) rec.irisPx.set(f.meta.index, r.face.eyes.irisDiamPx);
      }),
    );
    this.layout();
    this.discR = this.discRadius();
    const onResize = () => this.layout();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    this.listenForInput();
    this.phase = 'look';
    this.wake();
    this.raf = requestAnimationFrame(() => this.draw());
    this.watchTimer = setInterval(() => this.watch(), 1000);
    this.watch();
  }

  /** The board from the zones of the latest warm-up, in the safe area of this layout. */
  private layout(): void {
    const z = playableZones() ?? warmupResult()?.zones;
    if (!z || z.cols * z.rows < 1) return;
    const w = this.root.clientWidth || innerWidth;
    const hgt = this.root.clientHeight || innerHeight;
    this.zones = makeBoard(measureSafe(this.probe), z.cols, z.rows);
    this.names = zoneNamesOf(z.cols, z.rows);
    this.board.setBoard(this.zones, { w, h: hgt });
    if (this.expertCanvas) {
      const dpr = devicePixelRatio || 1;
      this.expertCanvas.width = Math.round(w * dpr);
      this.expertCanvas.height = Math.round(hgt * dpr);
      this.expertCanvas.style.width = `${w}px`;
      this.expertCanvas.style.height = `${hgt}px`;
    }
  }

  /** The 68th percentile of the selected estimator's per-target Test-round error, in px. */
  private discRadius(): number {
    const fit = this.play?.fit;
    const id = fit ? this.play!.estimator() : 'combined';
    const report = ownReport(getState().validation, id);
    const errs = report ? report.targets.map((x) => x.accuracyPx).filter(Number.isFinite) : [];
    const p68 = percentile(errs, 68);
    const short = Math.min(innerWidth, innerHeight);
    return Number.isFinite(p68) && p68 > 0 ? Math.min(p68, 0.5 * short) : Math.max(44, 0.067 * short);
  }

  // ----- Fading (design §2.13) ------------------------------------------------------------------

  private listenForInput(): void {
    const wake = () => this.wake();
    const onPointer = (e: PointerEvent) => {
      if (e.type === 'pointermove' && e.pointerType !== 'mouse') return;
      wake();
    };
    const onKey = (e: KeyboardEvent) => this.key(e);
    this.root.addEventListener('pointerdown', onPointer);
    this.root.addEventListener('pointermove', onPointer);
    document.addEventListener('keydown', onKey);
    this.offs.push(
      () => this.root.removeEventListener('pointerdown', onPointer),
      () => this.root.removeEventListener('pointermove', onPointer),
      () => document.removeEventListener('keydown', onKey),
    );
  }

  private wake(): void {
    if (this.faded) {
      this.faded = false;
      delete this.root.dataset.faded;
    }
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => this.fade(), LOOK.fadeAfterMs);
  }

  private fade(): void {
    // Keep the dock while keyboard focus is in it, or while a card or Re-aim is up.
    const focus = document.activeElement;
    if (this.phase !== 'look' || (focus && this.dock?.el.contains(focus) && focus.matches(':focus-visible'))) {
      this.fadeTimer = setTimeout(() => this.fade(), LOOK.fadeAfterMs);
      return;
    }
    this.faded = true;
    this.root.dataset.faded = '';
  }

  private key(e: KeyboardEvent): void {
    this.wake();
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.target instanceof Element && e.target.closest('dialog, input, select, textarea')) return;
    if (this.phase !== 'look') return;
    const k = e.key.toLowerCase();
    if (k === 'd') {
      e.preventDefault();
      void this.reaim(false);
    } else if (this.expert && k === 'r') {
      e.preventDefault();
      this.toggleRecord();
    } else if (this.expert && k === 'm') {
      e.preventDefault();
      this.marker();
    }
  }

  // ----- Drawing ------------------------------------------------------------------------------

  private draw(): void {
    if (!this.mounted) return;
    this.raf = requestAnimationFrame(() => this.draw());
    const play = this.play;
    if (!play || !this.zones || this.phase === 'reaim' || play.paused()) return;
    const d = play.stream.display;
    const p = d.visible && d.filtered ? d.filtered : null;
    const lit = p && !d.greyed ? (zoneAtPoint(this.zones, p)?.index ?? null) : null;
    this.setLit(lit);
    if (p) {
      this.disc.update({ x: p[0], y: p[1], r: this.discR, confidence: d.confidence, greyed: d.greyed, visible: true });
      this.discShown = { x: p[0], y: p[1], r: this.discR, greyed: d.greyed };
    } else {
      this.disc.update({ x: 0, y: 0, r: 0, confidence: 0, greyed: false, visible: false });
      this.discShown = null;
    }
    if (this.expert) this.drawExpert(d.raw, d.perEngine, p, d.visible);
  }

  private setLit(lit: number | null): void {
    if (lit === this.litZone && this.board.lit === lit) return;
    this.litZone = lit;
    this.board.setLit(lit);
    const zones = t('look.zones', { n: this.names.length });
    this.board.setLabel(lit === null ? t('look.boardNone', { zones }) : t('look.board', { zones, zone: this.names[lit] ?? '' }));
  }

  // ----- Offers and Re-aim (design §2.15) --------------------------------------------------------

  /** Forced checks at once; the timed offer 5 minutes after the warm-up or the last check. */
  private watch(): void {
    const play = this.play;
    if (!play || this.phase !== 'look' || play.paused()) return;
    const reasons = play.forcedReasons();
    if (reasons.length > 0) {
      this.offer('forced', reasons);
      return;
    }
    const every = getState().settings.driftEveryMin;
    if (every > 0 && timedReaimDue(performance.now(), play.rec.lastCheckMs, every)) this.offer('timed');
  }

  private offer(kind: 'drift' | 'timed' | 'forced', reasons: readonly DriftForceReason[] = []): void {
    if (this.phase !== 'look') return;
    this.phase = 'offer';
    this.offered = kind;
    this.wake();
    const close = () => {
      card.dispose();
      this.offered = null;
    };
    const card = offerCard({
      title: t(kind === 'forced' ? 'reaim.forced.title' : 'reaim.offer.title'),
      body: offerBody(kind, reasons),
      role: kind === 'forced' ? 'alertdialog' : 'dialog',
      primary: {
        label: t('reaim.go'),
        onSelect: () => {
          close();
          this.phase = 'look';
          void this.reaim(kind === 'forced');
        },
      },
      secondary:
        kind === 'forced'
          ? null
          : {
              label: t('reaim.keep'),
              onSelect: () => {
                close();
                // Keep playing snoozes the timed offer for another interval.
                if (this.play) this.play.rec.lastCheckMs = performance.now();
                this.phase = 'look';
              },
            },
    });
    this.layer.replaceChildren(card.el);
    card.focus();
    announce(card.title);
  }

  private async reaim(forced: boolean): Promise<void> {
    const play = this.play;
    if (!play || this.phase !== 'look') return;
    this.stopRecording();
    this.phase = 'reaim';
    this.layer.replaceChildren();
    const out = await play.reaim(forced || play.rec.forced.length > 0);
    // Exit (or "Warm up again") while Re-aim ran has already left the screen.
    if (!this.mounted || this.phase !== 'reaim') return;
    this.lastReaim = out.result;
    if (out.result === 'invalid') return;
    if (out.choice === 'quick') {
      this.phase = 'leaving';
      startQuickWarmup((id) => this.ctx.navigate(id));
      return;
    }
    if (out.choice === 'full') {
      this.phase = 'leaving';
      warmUpAgain(this.root, (id) => this.ctx.navigate(id));
      return;
    }
    this.phase = 'look';
    this.wake();
    if (out.choice === 'again' || (out.result === 'aborted' && forced)) void this.reaim(forced);
  }

  private playChallenge(): void {
    if (this.phase !== 'look') return;
    this.phase = 'leaving';
    this.stopRecording();
    this.ctx.navigate('challenge');
  }

  // ----- Ends -----------------------------------------------------------------------------------

  private screenChanged(rotated: boolean): void {
    if (this.phase === 'changed' || this.phase === 'leaving') return;
    this.phase = 'changed';
    this.stopRecording();
    releaseSpan();
    const card = screenChangedCard({ rotated, onWarmUp: () => warmUpAgain(this.root, (id) => this.ctx.navigate(id)) });
    this.layer.replaceChildren(card.el);
    card.focus();
    announce(t('warmup.changed.title'));
  }

  private leave(where: 'title' | 'ready'): void {
    if (this.phase === 'leaving') return;
    this.phase = 'leaving';
    this.stopRecording();
    void endSpan().then(() => {
      if (this.mounted) this.ctx.navigate(where);
    });
  }

  // ----- Expert mode (§17.8.1) ------------------------------------------------------------------

  private expertTools(): HTMLElement {
    this.expertCanvas = h('canvas', { class: 'look-expert-canvas', 'aria-hidden': 'true' });
    this.stage.append(this.expertCanvas);
    this.recordButton = h('button', { type: 'button', class: 'btn btn--chip', 'aria-pressed': 'false' }, t('look.expert.record'));
    this.recordButton.addEventListener('click', () => this.toggleRecord());
    this.markerButton = h('button', { type: 'button', class: 'btn btn--chip', disabled: true }, t('look.expert.marker'));
    this.markerButton.addEventListener('click', () => this.marker());
    const fit = getState().fit;
    const ids: EstimatorId[] = fit ? [...(fit.combined ? (['combined'] as EstimatorId[]) : []), ...ENGINE_IDS.filter((e) => fit.fits[e])] : [];
    const select = h('select', { 'aria-label': t('look.expert.estimator') }, ...ids.map((id) => h('option', { value: id }, ESTIMATOR_NAMES[id])));
    if (fit) select.value = getState().estimator ?? fit.selection.estimator;
    select.addEventListener('change', () => {
      this.play?.useEstimator(select.value as EstimatorId);
      this.discR = this.discRadius();
    });
    this.expertStatus = h('span', { class: 'look-expert__status', role: 'status' });
    return h('div', { class: 'look-expert', role: 'toolbar', 'aria-label': t('look.expert.label') }, this.recordButton, this.markerButton, select, this.expertStatus);
  }

  private toggleRecord(): void {
    if (this.recording) this.stopRecording();
    else this.startRecording();
  }

  private startRecording(): void {
    const play = this.play;
    if (!play || this.phase !== 'look') return;
    const rec = play.rec;
    rec.liveCount += 1;
    const id = play.estimator();
    this.recording = {
      kind: 'live',
      trial: trialName('live', rec.liveCount),
      fit: play.fit,
      geometry: play.geometry,
      estimator: id,
      correctionDeg: rec.corrections[id] ?? null,
      corrections: { ...rec.corrections },
      irisPx: new Map(),
      frames: [],
      extraFlags: new Map(),
      markers: [],
      startMs: performance.now(),
      endMs: null,
    };
    rec.blocks.push(this.recording);
    this.recordButton?.setAttribute('aria-pressed', 'true');
    if (this.recordButton) this.recordButton.textContent = t('look.expert.stop');
    if (this.markerButton) this.markerButton.disabled = false;
    if (this.expertStatus) this.expertStatus.textContent = t('look.expert.recording', { trial: this.recording.trial });
    announce(t('look.expert.started', { trial: this.recording.trial }));
  }

  private stopRecording(): void {
    const r = this.recording;
    if (!r) return;
    this.recording = null;
    r.endMs = performance.now();
    r.frames.sort((a, b) => a.meta.index - b.meta.index);
    applyBlinkMask(r.frames);
    this.recordButton?.setAttribute('aria-pressed', 'false');
    if (this.recordButton) this.recordButton.textContent = t('look.expert.record');
    if (this.markerButton) this.markerButton.disabled = true;
    if (this.expertStatus) this.expertStatus.textContent = '';
    announce(t('look.expert.stopped', { trial: r.trial, n: r.frames.length }));
  }

  private marker(): void {
    const r = this.recording;
    if (!r) return;
    r.markers.push({ tMs: performance.now(), n: r.markers.length + 1 });
    announce(t('look.expert.markerAdded', { n: r.markers.length }));
  }

  private colour(id: EstimatorId): string {
    return getComputedStyle(document.documentElement).getPropertyValue(`--c-${id}`).trim() || ESTIMATOR_COLOURS[id];
  }

  private drawExpert(raw: Vec2 | null, perEngine: Partial<Record<EngineId, Vec2>>, filtered: Vec2 | null, visible: boolean): void {
    const canvas = this.expertCanvas;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    if (filtered) this.trail.push({ t: now, p: filtered });
    while (this.trail.length > 0 && (this.trail[0] as { t: number }).t < now - 1000) this.trail.shift();
    if (this.trail.length > 1) {
      ctx.beginPath();
      this.trail.forEach((s, k) => (k === 0 ? ctx.moveTo(s.p[0], s.p[1]) : ctx.lineTo(s.p[0], s.p[1])));
      ctx.strokeStyle = 'rgb(0 0 0 / 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (!visible) return;
    for (const [e, p] of Object.entries(perEngine) as [EngineId, Vec2][]) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6, 0, 2 * Math.PI);
      ctx.fillStyle = this.colour(e);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (raw) {
      ctx.beginPath();
      ctx.arc(raw[0], raw[1], 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#000';
      ctx.fill();
    }
  }

  // ----- Fixtures (test mode) -----------------------------------------------------------------

  private mountFixture(name: FixtureName): void {
    const z = warmupResult()?.zones ?? { cols: 1, rows: 3 };
    const w = innerWidth;
    const hgt = innerHeight;
    this.zones = makeBoard(measureSafe(this.probe), z.cols, z.rows);
    this.names = zoneNamesOf(z.cols, z.rows);
    this.board.setBoard(this.zones, { w, h: hgt });
    const zone = this.zones.zones[0]!;
    this.setLit(zone.index);
    const [cx, cy] = zoneCentre(zone);
    // Where the boards draw it: a little left of the top zone's centre, or above the left zone's.
    const x = z.cols === 1 ? cx - 0.05 * zone.rect.w : cx + 0.03 * zone.rect.w;
    const y = z.cols === 1 ? cy : cy - 0.025 * zone.rect.h;
    this.discR = Math.max(44, 0.067 * Math.min(w, hgt));
    this.disc.update({ x, y, r: this.discR, confidence: 1, greyed: false, visible: true });
    this.discShown = { x, y, r: this.discR, greyed: false };
    this.phase = 'look';
    if (name === 'look-faded') {
      this.faded = true;
      this.root.dataset.faded = '';
    }
    if (name === 'look-offer') this.offer('drift');
    if (name === 'look-reaim' || name.startsWith('reaim-')) this.fixtureReaim(name);
  }

  /** Re-aim as it looks in play (one bubble of two) or at its end, drawn still. */
  private fixtureReaim(name: FixtureName): void {
    this.phase = 'reaim';
    const geometry = fixtureScreen();
    const stage = new StimulusStage({ game: true });
    const pips = pipLine(t('reaim.progress'));
    const glyph = guardGlyph(false);
    const corner = cornerCluster(glyph.el, t('warmup.pause'), () => undefined);
    const layer = h('div', { class: 'stim-layer reaim__layer' });
    const el = h('div', { class: 'reaim', role: 'region', 'aria-label': t('reaim.name') }, h('h1', { class: 'sr-only' }, t('reaim.name')), h('div', { class: 'reaim__stage', 'aria-hidden': 'true' }, stage.el), pips.el, corner.el, layer);
    this.root.append(el);
    this.root.dataset.reaim = '';
    addCleanup(() => stage.destroy());
    stage.configure(geometry);
    const colours = gameColours(this.root);
    stage.background = colours.stage;
    stage.clear();
    if (name === 'look-reaim') {
      pips.set(1, 2);
      corner.setPlaying(true);
      const sizes = targetSizes(false, geometry.pxPerMm, 600);
      const fullR = Math.max(32, Math.min(0.1 * Math.min(geometry.viewportWpx, geometry.viewportHpx), 39));
      const x = 0.62 * geometry.viewportWpx;
      const y = 0.15 * geometry.viewportHpx + 40;
      drawBubble(stage.context, x, y, { r: 0.6 * fullR, fullR, ghost: !reducedMotion() }, sizes, colours);
      corner.avoid({ x, y, r: fullR });
      return;
    }
    pips.el.hidden = true;
    corner.setPlaying(false);
    if (name === 'reaim-large') {
      const card = offerCard({ title: t('reaim.large.title'), body: t('reaim.large.body'), primary: { label: t('reaim.large.quick'), onSelect: () => undefined }, secondary: { label: t('reaim.keep'), onSelect: () => undefined } });
      layer.replaceChildren(card.el);
    } else {
      layer.replaceChildren(statusChip(t(name === 'reaim-fine' ? 'reaim.fine' : 'reaim.fixed')));
    }
  }

  // ----- Test hook ------------------------------------------------------------------------------

  private snapshot(): unknown {
    return {
      screen: 'look',
      phase: this.phase,
      faded: this.faded,
      zones: this.zones ? { cols: this.zones.cols, rows: this.zones.rows } : null,
      lit: this.litZone === null || !this.zones ? null : { index: this.litZone, col: this.zones.zones[this.litZone]?.col ?? null, row: this.zones.zones[this.litZone]?.row ?? null },
      disc: this.discShown,
      offer: this.offered,
      reaim: this.lastReaim,
      estimator: this.play?.estimator() ?? null,
      corrections: this.play ? { ...this.play.rec.corrections } : {},
      driftLog: this.play ? this.play.rec.driftLog.map((e) => ({ ...e })) : [],
      expert: this.expert,
      recording: this.recording?.trial ?? null,
    };
  }

  unmount(): void {
    this.mounted = false;
    snapshot = null;
    this.stopRecording();
    cancelAnimationFrame(this.raf);
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    if (this.watchTimer !== null) clearInterval(this.watchTimer);
    for (const off of this.offs.splice(0)) off();
    this.play?.dispose();
    delete this.root.dataset.faded;
    delete this.root.dataset.reaim;
  }
}

const screen: Screen = {
  mount(root, ctx) {
    const s = new LookScreen(root, ctx);
    return () => s.unmount();
  },
};

export default screen;
