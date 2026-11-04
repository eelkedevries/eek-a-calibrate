// #/camera (specification §7 screen 1, §14.1.5, §14.2): camera permission, the picker, the
// mirrored preview with the face box, the live meters (heuristic; green for 2 s to continue), the
// eyewear question with glare advice, the engines loading in the background with progress bars,
// then the device probe (30 frames with every candidate engine) and the run-set decision. A
// stored calibration for this camera is offered, to be validated before use. The screen holds
// the wake lock (§14.2.6).
import { MOBILE, PROBE, SETUP } from '../../core/constants.ts';
import { DistanceTracker } from '../../core/geometry/distance.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineId, FrameResult } from '../../core/types.ts';
import { listCameras } from '../../platform/camera.ts';
import { detectCapabilities, detectDeviceClass, type CapabilityReport, type DeviceClass } from '../../platform/capabilities.ts';
import { holdWakeLock, type WakeLockHold } from '../../platform/presentation.ts';
import { listProfiles, type ProfileRecord } from '../../platform/storage.ts';
import type { ProbeResult } from '../../vision/protocol.ts';
import { BANNER_CSS, banner } from '../components/banner.ts';
import { AssetProgress, PROGRESS_CSS } from '../components/progress.ts';
import { HoldGate, METER_CSS, allGreen, evaluateSetup, placeFaceBox, renderMeters } from '../components/qualityMeter.ts';
import { announce, h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { activeCapture, ensureCapture, setPreferredCamera, type Capture } from '../session.ts';
import { getState, setState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerTestHook } from '../testHooks.ts';
import { SETUP_CSS } from './welcome.ts';

export type Eyewear = 'none' | 'glasses' | 'contacts' | 'undisclosed';

/** What the setup learned, kept for session.json (export) and for later screens. */
export interface SetupRecord {
  eyewear: Eyewear | null;
  deviceClass: DeviceClass | null;
  capabilities: CapabilityReport | null;
  probe: ProbeResult | null;
  runSet: RunSetDecision | null;
  camera: { label: string; deviceIdHash: string | null; width: number; height: number; frameRate: number | null; ladder: string; rung: number } | null;
  host: { kind: 'worker' | 'inline'; reason: string; delegate: 'GPU' | 'CPU' | null; wasmVariant: string | null; initMs: number | null; restarts: number } | null;
  engines: { id: EngineId; ok: boolean; backend: string | null; reason: string | null; loadMs: number | null }[];
}

const record: SetupRecord = { eyewear: null, deviceClass: null, capabilities: null, probe: null, runSet: null, camera: null, host: null, engines: [] };

export function setupRecord(): Readonly<SetupRecord> {
  return record;
}

/** Records the device probe and its run set when Get ready runs them (spec §17.4.5). */
export function recordProbe(probe: ProbeResult, decision: RunSetDecision): void {
  record.probe = probe;
  record.runSet = decision;
}

/** Copies what the export needs to know about the running camera and vision host. */
export function snapshotCapture(c: Capture): void {
  const info = c.camera.info;
  const s = c.camera.settings;
  record.camera = { label: info.label, deviceIdHash: info.deviceIdHash, width: s.width || info.width, height: s.height || info.height, frameRate: s.frameRate ?? info.frameRate, ladder: info.ladder, rung: info.rung };
  const hi = c.host.info;
  record.host = { kind: c.host.kind, reason: c.host.selection.reason, delegate: hi?.delegate ?? null, wasmVariant: hi?.wasmVariant ?? null, initMs: hi?.initMs ?? null, restarts: c.host.stats().restarts };
  record.engines = c.status.map((e) => ({ id: e.id, ok: e.ok, backend: e.backend ?? null, reason: e.reason ?? null, loadMs: e.loadMs ?? null }));
  record.deviceClass ??= detectDeviceClass();
  record.capabilities ??= detectCapabilities();
}

export interface RunSetDecision {
  runSet: EngineId[];
  dropped: { engine: EngineId; reason: 'budget' | 'total' | 'no-data'; p50Ms: number }[];
  /** landmarker + preparation + the run set's engines (p50s), ms. */
  totalP50Ms: number;
  /** The total exceeds the warning threshold (66 ms; 80 ms on mobile). */
  warn: boolean;
  warnMs: number;
  /** False when the engines were chosen by hand and only reported on. */
  applied: boolean;
}

const LEARNED: readonly EngineId[] = ['blazegaze', 'peekr'];

function p50Of(probe: ProbeResult, e: EngineId): number {
  const r = probe.engines[e];
  return r && r.okFrames > 0 && Number.isFinite(r.p50Ms) ? r.p50Ms : Number.NaN;
}

function totalOf(probe: ProbeResult, set: readonly EngineId[]): number {
  return probe.landmarkerP50Ms + probe.prepP50Ms + set.reduce((s, e) => s + (Number.isFinite(p50Of(probe, e)) ? p50Of(probe, e) : 0), 0);
}

/**
 * The run set (§7 screen 1): each learned engine is kept if its p50 is within its budget
 * (BlazeGaze 25 ms, Peekr 15 ms); then, while the total p50 (landmarker + preparation + engines)
 * exceeds 45 ms, the slowest learned engine is dropped. Geometric and eye-pixel are never timed
 * out (eye-pixel only when it loaded). `candidates` are the engines that loaded. With `applyRule` false (engines chosen by hand) the
 * candidates are kept and the timings only reported.
 */
export function decideRunSet(probe: ProbeResult, candidates: readonly EngineId[], warnMs: number, applyRule = true): RunSetDecision {
  const dropped: RunSetDecision['dropped'] = [];
  let set: EngineId[];
  if (!applyRule) {
    set = ENGINE_IDS.filter((e) => candidates.includes(e) || e === 'geometric');
  } else {
    set = ENGINE_IDS.filter((e) => !LEARNED.includes(e) && (candidates.includes(e) || e === 'geometric'));
    for (const e of LEARNED) {
      if (!candidates.includes(e)) continue;
      const p50 = p50Of(probe, e);
      if (!Number.isFinite(p50)) dropped.push({ engine: e, reason: 'no-data', p50Ms: p50 });
      else if (p50 > PROBE.budgetMs[e as keyof typeof PROBE.budgetMs]) dropped.push({ engine: e, reason: 'budget', p50Ms: p50 });
      else set.push(e);
    }
    for (;;) {
      const total = totalOf(probe, set);
      const learned = set.filter((e) => LEARNED.includes(e));
      if (!(total > PROBE.totalMs) || learned.length === 0) break;
      const slowest = learned.reduce((a, b) => (p50Of(probe, b) > p50Of(probe, a) ? b : a));
      set = set.filter((e) => e !== slowest);
      dropped.push({ engine: slowest, reason: 'total', p50Ms: p50Of(probe, slowest) });
    }
    set = ENGINE_IDS.filter((e) => set.includes(e));
  }
  const totalP50Ms = totalOf(probe, set);
  return { runSet: set, dropped, totalP50Ms, warn: totalP50Ms > warnMs, warnMs, applied: applyRule };
}

/** The engines the camera screen loads: every engine for Auto, else the chosen ones and geometric. */
function candidateEngines(): EngineId[] {
  const { settings } = getState();
  return settings.engines === 'auto' ? [...ENGINE_IDS] : ENGINE_IDS.filter((e) => (settings.engines as readonly EngineId[]).includes(e) || e === 'geometric');
}

/**
 * The profile-key parts that are known before calibrating: origin, camera (by id, or by name where
 * the browser changed the id), video size, pixel ratio and orientation.
 */
export function matchesCurrentSetup(p: ProfileRecord, c: Capture): boolean {
  const s = c.camera.settings;
  const [size, dpr] = p.parts.viewport.split('@');
  const [w, hgt] = (size ?? '').split('x').map(Number);
  const portraitNow = window.innerHeight >= window.innerWidth;
  const camera = p.parts.cameraHash === (c.camera.info.deviceIdHash ?? 'unknown') || (Boolean(p.cameraLabel) && p.cameraLabel === c.camera.info.label);
  return (
    p.parts.origin === location.origin &&
    camera &&
    p.parts.video === `${s.width}x${s.height}` &&
    Number(dpr) === window.devicePixelRatio &&
    Number.isFinite(w) &&
    Number.isFinite(hgt) &&
    (hgt as number) >= (w as number) === portraitNow
  );
}

const ENGINE_NAMES: Record<EngineId, string> = { blazegaze: 'BlazeGaze', peekr: 'Peekr', geometric: 'Geometric', eyepixel: 'Eye-pixel (WebGazer method)' };

/** "Continue anyway" appears after this long without every meter green (heuristic). */
const OVERRIDE_AFTER_MS = 20_000;
/** A face must have been visible this long before the probe starts, so that the engines run. */
const PROBE_AFTER_FACE_MS = 1000;
const FPS_WINDOW_MS = 2000;

class CameraScreen {
  private readonly ctx: ScreenContext;
  private readonly status = h('p', { role: 'status', 'aria-live': 'polite' });
  private readonly alert = h('div');
  private readonly progress = new AssetProgress(t('camera.progress'));
  private readonly startButton: HTMLButtonElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly overrideButton: HTMLButtonElement;
  private readonly picker = h('select', { id: 'camera-picker' });
  private readonly pickerField: HTMLElement;
  private readonly previewWrap = h('div', { class: 'preview-wrap' });
  private readonly faceBox = h('div', { class: 'face-box', 'aria-hidden': 'true' });
  private readonly meters = h('ul', { class: 'meters', 'aria-label': t('camera.meters') });
  private readonly holdNote = h('p', { class: 'note', 'aria-live': 'polite' });
  private readonly probeBox = h('div');
  private readonly storedBox = h('div');
  private readonly live: HTMLElement;
  private capture: Capture | null = null;
  private preview: HTMLVideoElement | null = null;
  private offs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private wake: WakeLockHold | null = null;
  private latest: FrameResult | null = null;
  private faceSinceMs: number | null = null;
  private readonly frameTimes: number[] = [];
  private gate = new HoldGate();
  private probing = false;
  private probed = false;
  private meterStartMs = 0;
  private tracker: DistanceTracker | null = null;
  private mounted = true;
  private readonly mobile = detectDeviceClass().mobile;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.ctx = ctx;
    record.deviceClass = detectDeviceClass();
    record.capabilities = detectCapabilities();
    this.startButton = h('button', { type: 'button', onclick: () => void this.start() }, t('camera.start'));
    this.continueButton = h('button', { type: 'button', disabled: true, onclick: () => ctx.navigate('calibrate') }, t('camera.continue'));
    this.overrideButton = h('button', { type: 'button', class: 'secondary', hidden: true, onclick: () => ctx.navigate('calibrate') }, t('camera.override'));
    this.picker.addEventListener('change', () => {
      setPreferredCamera(this.picker.value || null);
      void this.start();
    });
    this.pickerField = h('div', { class: 'field', hidden: true }, h('label', { for: 'camera-picker' }, t('camera.picker')), this.picker);
    this.previewWrap.append(this.faceBox);
    this.live = h(
      'div',
      { hidden: true },
      this.pickerField,
      h('section', null, h('h2', null, t('camera.preview')), this.previewWrap, this.meters, this.holdNote),
      this.eyewear(),
      h('section', null, h('h2', null, t('camera.probe.title')), h('p', null, t('camera.probe.body')), this.probeBox),
      this.storedBox,
    );
    root.append(
      h('style', null, SETUP_CSS + BANNER_CSS + PROGRESS_CSS + METER_CSS),
      h(
        'div',
        { class: 'setup' },
        h('h1', null, t('route.camera')),
        h('p', { class: 'lead' }, t('camera.lead')),
        h('p', null, t(this.mobile ? 'calibrate.steps.mobile' : 'camera.steps.desktop')),
        h('p', { class: 'note' }, t('camera.heuristic')),
        this.alert,
        this.status,
        this.progress.el,
        h('div', { class: 'actions' }, this.startButton),
        this.live,
        h('div', { class: 'actions' }, this.continueButton, this.overrideButton, h('a', { href: '#/', class: 'button secondary' }, t('camera.back'))),
      ),
    );
    registerTestHook('camera', () => cameraSnapshot());
    snapshotFn = () => ({
      running: this.capture !== null,
      face: this.latest?.face !== null && this.latest !== null,
      ready: this.gate.ready,
      probed: this.probed,
      runSet: record.runSet?.runSet ?? null,
      meters: evaluateSetup(this.sample()).map((m) => ({ id: m.id, ok: m.ok })),
    });
    if (activeCapture()) void this.start();
  }

  private eyewear(): HTMLElement {
    const advice = h('p', { class: 'note', hidden: record.eyewear !== 'glasses' }, t('camera.eyewear.glare'));
    const options: Eyewear[] = ['none', 'glasses', 'contacts', 'undisclosed'];
    return h(
      'fieldset',
      null,
      h('legend', null, t('camera.eyewear.legend')),
      ...options.map((o) => {
        const input = h('input', {
          type: 'radio',
          name: 'eyewear',
          value: o,
          onchange: () => {
            record.eyewear = o;
            advice.hidden = o !== 'glasses';
          },
        });
        input.checked = record.eyewear === o;
        return h('label', { class: 'choice' }, input, h('span', null, t(`camera.eyewear.${o}`)));
      }),
      advice,
    );
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private showError(text: string): void {
    this.alert.replaceChildren(banner('error', text));
    announce(text);
  }

  private detach(): void {
    for (const off of this.offs.splice(0)) off();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.preview && this.capture) this.capture.camera.releasePreview(this.preview);
    this.preview?.remove();
    this.preview = null;
    this.capture = null;
  }

  private async start(): Promise<void> {
    this.detach();
    this.alert.replaceChildren();
    this.startButton.disabled = true;
    this.gate = new HoldGate();
    this.probed = false;
    this.latest = null;
    this.faceSinceMs = null;
    this.frameTimes.length = 0;
    let c: Capture;
    try {
      c = await ensureCapture(candidateEngines(), {
        onStatus: (key) => this.setStatus(t(`calibrate.status.${key}`)),
        onAsset: (asset, loaded, total) => this.progress.update(asset, loaded, total),
      });
    } catch (error) {
      if (!this.mounted) return;
      this.startButton.disabled = false;
      this.setStatus('');
      this.showError(error instanceof Error ? error.message : String(error));
      return;
    }
    if (!this.mounted) return;
    this.capture = c;
    this.progress.complete();
    this.wake ??= holdWakeLock();
    snapshotCapture(c);
    this.startButton.hidden = true;
    this.live.hidden = false;
    this.setStatus(t('camera.running', { w: c.camera.settings.width, h: c.camera.settings.height }));
    this.preview = c.camera.createPreview('camera-preview');
    this.preview.setAttribute('aria-label', t('lab.preview'));
    this.previewWrap.prepend(this.preview);
    const measured = getState().geometry?.distance;
    this.tracker = measured && measured.focalSource === 'blind-spot' ? new DistanceTracker(measured) : null;
    this.offs.push(
      c.onResult((r) => {
        this.latest = r;
        const now = performance.now();
        if (r.face) this.faceSinceMs ??= now;
        else this.faceSinceMs = null;
        if (this.tracker) {
          try {
            this.tracker.push(r.meta.tCaptureMs, r.face ? r.face.eyes.irisDiamPx : Number.NaN, r.face?.eyes.open ?? false);
          } catch {
            this.tracker.reset();
          }
        }
      }),
      c.onFrame(() => {
        const now = performance.now();
        this.frameTimes.push(now);
        while (this.frameTimes.length > 0 && (this.frameTimes[0] as number) < now - FPS_WINDOW_MS) this.frameTimes.shift();
      }),
      c.camera.onEnded(() => {
        this.showError(t('camera.ended'));
        this.detach();
        this.startButton.hidden = false;
        this.startButton.disabled = false;
        this.live.hidden = true;
      }),
      c.camera.onChange(() => {
        this.setStatus(t('camera.running', { w: c.camera.settings.width, h: c.camera.settings.height }));
        this.probed = false;
      }),
    );
    this.meterStartMs = performance.now();
    this.timer = setInterval(() => this.tick(), 250);
    void this.fillPicker(c);
    void this.offerStored(c);
    if (c.status.some((s) => !s.ok)) {
      this.alert.append(
        banner('warn', t('camera.enginesUnavailable', { list: c.status.filter((s) => !s.ok).map((s) => `${ENGINE_NAMES[s.id]} (${s.reason ?? '—'})`).join('; ') })),
      );
    }
  }

  private async fillPicker(c: Capture): Promise<void> {
    let cameras: Awaited<ReturnType<typeof listCameras>> = [];
    try {
      cameras = await listCameras();
    } catch {
      cameras = [];
    }
    if (!this.mounted || this.capture !== c) return;
    const current = c.camera.track.getSettings().deviceId ?? '';
    this.picker.replaceChildren(...cameras.map((d) => h('option', { value: d.deviceId }, d.label)));
    if (current) this.picker.value = current;
    this.pickerField.hidden = cameras.length < 2;
  }

  private async offerStored(c: Capture): Promise<void> {
    let profiles: ProfileRecord[] = [];
    try {
      profiles = (await listProfiles()).filter((p) => matchesCurrentSetup(p, c));
    } catch {
      profiles = [];
    }
    if (!this.mounted || this.capture !== c || profiles.length === 0) return;
    this.storedBox.replaceChildren(
      h(
        'section',
        null,
        h('h2', null, t('camera.stored.title')),
        h('p', null, t('camera.stored.body')),
        ...profiles.map((p) =>
          h(
            'p',
            null,
            h(
              'button',
              {
                type: 'button',
                class: 'secondary',
                onclick: async () => {
                  const { restoreProfile } = await import('./live.ts');
                  restoreProfile(p);
                  this.ctx.navigate('live');
                },
              },
              t('camera.stored.use', { date: new Date(p.savedAt).toLocaleString('en-GB') }),
            ),
          ),
        ),
      ),
    );
  }

  private sample() {
    const fps = this.frameTimes.length >= 2 ? ((this.frameTimes.length - 1) * 1000) / ((this.frameTimes[this.frameTimes.length - 1] as number) - (this.frameTimes[0] as number)) : Number.NaN;
    return {
      face: this.latest?.face ?? null,
      fps,
      distanceMm: this.tracker?.distanceMm ?? null,
      distanceMeasured: this.tracker !== null,
      mobile: this.mobile,
    };
  }

  private tick(): void {
    if (!this.capture) return;
    const now = performance.now();
    const readings = evaluateSetup(this.sample());
    renderMeters(this.meters, readings);
    const green = allGreen(readings);
    placeFaceBox(this.faceBox, this.latest?.face ?? null, green);
    const wasReady = this.gate.ready;
    this.gate.update(green, now);
    const probeDone = this.probed;
    this.continueButton.disabled = !(this.gate.ready && probeDone);
    if (this.gate.ready && !wasReady) announce(t('camera.ready'));
    this.holdNote.textContent = this.gate.ready
      ? t(probeDone ? 'camera.ready' : 'camera.readyProbe')
      : green
        ? t('camera.holding', { s: ((SETUP.holdMs * (1 - this.gate.progress(now))) / 1000).toFixed(1) })
        : t('camera.notReady');
    this.overrideButton.hidden = !(probeDone && !this.gate.ready && now - this.meterStartMs > OVERRIDE_AFTER_MS);
    if (!this.probed && !this.probing && this.faceSinceMs !== null && now - this.faceSinceMs >= PROBE_AFTER_FACE_MS) void this.probe();
  }

  private async probe(): Promise<void> {
    const c = this.capture;
    if (!c) return;
    this.probing = true;
    this.probeBox.replaceChildren(h('p', { role: 'status' }, t('camera.probe.running', { n: PROBE.frames })));
    try {
      const result = await c.host.probe(PROBE.frames);
      if (!this.mounted || this.capture !== c) return;
      const loaded = c.status.filter((s) => s.ok).map((s) => s.id);
      const auto = getState().settings.engines === 'auto';
      const decision = decideRunSet(result, loaded, this.mobile ? MOBILE.warnMs : PROBE.warnMs, auto);
      record.probe = result;
      record.runSet = decision;
      setState({ runSet: decision.runSet });
      this.renderProbe(result, decision);
      snapshotCapture(c);
    } catch (error) {
      if (!this.mounted) return;
      this.probeBox.replaceChildren(banner('warn', t('camera.probe.failed', { message: error instanceof Error ? error.message : String(error) })));
    } finally {
      this.probing = false;
      // A probe of a camera that was switched meanwhile does not count for the new one.
      if (this.capture === c) this.probed = true;
    }
  }

  private renderProbe(p: ProbeResult, d: RunSetDecision): void {
    const ms = (v: number) => (Number.isFinite(v) ? t('lab.unit.ms', { value: v.toFixed(1) }) : '—');
    const rows = [
      h('tr', null, h('th', { scope: 'row' }, t('lab.run.landmarker')), h('td', null, ms(p.landmarkerP50Ms)), h('td', null, '')),
      h('tr', null, h('th', { scope: 'row' }, t('lab.run.prep')), h('td', null, ms(p.prepP50Ms)), h('td', null, '')),
      ...ENGINE_IDS.filter((e) => p.engines[e]).map((e) => {
        const r = p.engines[e]!;
        const budget = (PROBE.budgetMs as Record<string, number>)[e];
        return h('tr', null, h('th', { scope: 'row' }, ENGINE_NAMES[e]), h('td', null, ms(r.p50Ms)), h('td', null, budget ? t('camera.probe.budget', { ms: budget }) : t('camera.probe.always')));
      }),
      h('tr', null, h('th', { scope: 'row' }, t('camera.probe.total')), h('td', null, ms(d.totalP50Ms)), h('td', null, t('camera.probe.budget', { ms: PROBE.totalMs }))),
    ];
    const dropped = d.dropped.map((x) => t(`camera.probe.dropped.${x.reason}`, { name: ENGINE_NAMES[x.engine], ms: Number.isFinite(x.p50Ms) ? x.p50Ms.toFixed(1) : '—' }));
    this.probeBox.replaceChildren(
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'simple-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('lab.run.stage')), h('th', { scope: 'col' }, t('lab.run.p50')), h('th', { scope: 'col' }, t('camera.probe.limit')))),
          h('tbody', null, ...rows),
        ),
      ),
      h('p', null, h('strong', null, t('camera.probe.runSet', { list: d.runSet.map((e) => ENGINE_NAMES[e]).join(', ') }))),
      dropped.length > 0 ? h('ul', null, ...dropped.map((x) => h('li', null, x))) : '',
      d.applied ? '' : h('p', { class: 'note' }, t('camera.probe.manual')),
      d.warn ? banner('warn', t('camera.probe.slow', { ms: d.totalP50Ms.toFixed(0), limit: d.warnMs, hz: (1000 / d.warnMs).toFixed(0) })) : '',
      h('p', { class: 'note' }, t('camera.probe.heuristic')),
    );
  }

  unmount(): void {
    this.mounted = false;
    snapshotFn = () => null;
    this.detach();
    void this.wake?.release();
    this.wake = null;
  }
}

let snapshotFn: () => unknown = () => null;

function cameraSnapshot(): unknown {
  return snapshotFn();
}

const screen: Screen = {
  mount(root, ctx) {
    const s = new CameraScreen(root, ctx);
    return () => s.unmount();
  },
};

export default screen;
