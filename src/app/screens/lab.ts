// #/lab, the diagnostics screen (spec §7 screen 10): host, delegate, backends,
// per-stage timings, live crops and engine status, and "Run each engine on 10
// frames" (the probe over every engine, used by engines.spec.ts).
//
// Crop renderers are pluggable. An engine adds `src/engines/<id>/lab.ts` whose
// default export is a CropRenderer (the shape below; a type-only import or a
// structurally matching object), discovered here with import.meta.glob and
// loaded only when this screen opens. A renderer is DOM-free: it receives the
// frame's result and the same frame's RGBA pixels and returns images, or
// rectangles of the frame for this screen to draw with drawImage (the browser
// resampling Peekr uses). `registerCropRenderer` adds one at run time.
//
// Test hooks (`?e2e=1`): `__eek.lab()` returns a JSON-safe snapshot,
// `__eek.labCaptureFixture()` returns one frame's result with its pixels (for
// tests/e2e/make-landmark-fixture.spec.ts), and `__eek.crashWorker()` kills
// every live worker host's worker as a crash would (failures.spec.ts).
import { ENGINE_IDS } from '../../core/types.ts';
import type { EngineFrame, EngineId, FrameMeta, FrameResult } from '../../core/types.ts';
import { CONTOUR_L, CONTOUR_R, EYE_L, EYE_R, lmX, lmY } from '../../core/face/landmarkSets.ts';
import type { PixelBuffer } from '../../core/face/quality.ts';
import { ENGINE_LOADERS } from '../../engines/registry.ts';
import { CameraError, listCameras, openCamera, type CameraSession } from '../../platform/camera.ts';
import { FrameClock } from '../../platform/frameClock.ts';
import { roiRect } from '../../vision/frameImage.ts';
import { crashWorkerHosts, createVisionHost, defaultVisionConfig, type HostError, type ManagedVisionHost } from '../../vision/host.ts';
import type { ProbeResult } from '../../vision/protocol.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerTestHook } from '../testHooks.ts';

// ----- Crop renderer contract -------------------------------------------------

export interface LabImage {
  width: number;
  height: number;
  /** RGBA, row-major, width × height × 4. */
  data: Uint8ClampedArray;
}

export interface LabFrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
}

export interface LabView {
  label: string;
  /** Pixels to show, or */
  image?: LabImage;
  /** a rectangle of the frame (video pixels) that this screen draws at dw × dh. */
  frameRect?: LabFrameRect;
}

export interface LabFrameInput {
  result: FrameResult;
  /** The same frame's pixels, unmirrored, videoW × videoH RGBA. */
  frame: PixelBuffer;
}

export interface CropRenderer {
  engine: EngineId;
  render(input: LabFrameInput): LabView[];
}

const discovered = import.meta.glob<{ default: CropRenderer }>('../../engines/*/lab.ts');
const registered = new Map<EngineId, CropRenderer>();

export function registerCropRenderer(renderer: CropRenderer): () => void {
  registered.set(renderer.engine, renderer);
  return () => {
    if (registered.get(renderer.engine) === renderer) registered.delete(renderer.engine);
  };
}

/**
 * The eye-pixel engine's features are two equalised 10×6 patches (spec §4.6.4,
 * x = [L 60, R 60], values in [0, 1]); shown as they are when the engine
 * brings no renderer of its own.
 */
const eyePixelPatches: CropRenderer = {
  engine: 'eyepixel',
  render({ result }) {
    const x = result.engines.eyepixel?.x;
    if (!x || x.length !== 120) return [];
    return [0, 1].map((eye) => {
      const data = new Uint8ClampedArray(60 * 4);
      for (let i = 0; i < 60; i++) {
        const v = Math.round(x[eye * 60 + i] * 255);
        data.set([v, v, v, 255], i * 4);
      }
      return { label: t(eye === 0 ? 'lab.eyepixel.left' : 'lab.eyepixel.right'), image: { width: 10, height: 6, data } };
    });
  },
};

async function loadRenderers(): Promise<Map<EngineId, CropRenderer>> {
  const out = new Map<EngineId, CropRenderer>([['eyepixel', eyePixelPatches]]);
  for (const [path, load] of Object.entries(discovered)) {
    try {
      const renderer = (await load()).default;
      if (renderer && typeof renderer.render === 'function' && (ENGINE_IDS as readonly string[]).includes(renderer.engine)) out.set(renderer.engine, renderer);
      else console.warn(`${path} does not default-export a crop renderer`);
    } catch (error) {
      console.warn(`The crop renderer ${path} could not be loaded`, error);
    }
  }
  for (const [id, renderer] of registered) out.set(id, renderer);
  return out;
}

// ----- Formatting --------------------------------------------------------------

function fmt(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? t('lab.none') : value.toFixed(digits);
}
const ms = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? t('lab.none') : t('lab.unit.ms', { value: fmt(v) }));
const px = (v: number) => (Number.isFinite(v) ? t('lab.unit.px', { value: fmt(v) }) : t('lab.none'));
const deg = (v: number) => (Number.isFinite(v) ? t('lab.unit.deg', { value: fmt(v) }) : t('lab.none'));
const pct = (v: number) => (Number.isFinite(v) ? t('lab.unit.pct', { value: fmt(v * 100) }) : t('lab.none'));
const yesNo = (v: boolean) => (v ? t('lab.yes') : t('lab.no'));

function median(values: readonly number[]): number {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length === 0) return Number.NaN;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/** A plain-array copy of a result for test hooks and the fixture (typed arrays do not survive JSON). */
function plainResult(r: FrameResult) {
  const engines: Record<string, unknown> = {};
  for (const [id, f] of Object.entries(r.engines) as [EngineId, EngineFrame][]) {
    engines[id] = { ...f, x: f.x ? Array.from(f.x) : null };
  }
  return {
    meta: r.meta,
    workerMs: r.workerMs,
    receivedMs: r.receivedMs,
    engines,
    face: r.face && {
      ...r.face,
      landmarks: Array.from(r.face.landmarks),
      blendshapes: Array.from(r.face.blendshapes),
      matrix: Array.from(r.face.matrix),
    },
  };
}

function base64(bytes: Uint8ClampedArray): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

const LAB_CSS = `
.lab-grid { display: grid; gap: var(--space-4); }
.lab-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-3); }
.lab-panel h2 { margin-top: 0; font-size: 1.1rem; }
.lab-dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3); margin: 0; }
.lab-dl dt { color: var(--muted); }
.lab-dl dd { margin: 0; font-family: var(--font-mono); overflow-wrap: anywhere; }
.lab-table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
.lab-table th, .lab-table td { text-align: left; padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--border); }
.lab-controls { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: end; }
.lab-controls fieldset { border: 1px solid var(--border); border-radius: var(--radius); }
.lab-crops { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-start; }
.lab-crops figure { margin: 0; }
.lab-crops-engines { margin-top: var(--space-4); }
.lab-crops-engines > figure > figcaption { font-weight: 600; }
.lab-crop-views { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.lab-crops canvas, .lab-crops video { display: block; max-width: 100%; background: #000; image-rendering: pixelated; }
.lab-crops video { width: 320px; }
.lab-messages { font-family: var(--font-mono); font-size: 0.9rem; max-height: 12rem; overflow: auto; }
`;

// ----- Session -------------------------------------------------------------------

interface Session {
  camera: CameraSession;
  host: ManagedVisionHost;
  clock: FrameClock;
  preview: HTMLVideoElement;
  unsubscribe: (() => void)[];
}

interface FrameCopy {
  index: number;
  canvas: OffscreenCanvas | HTMLCanvasElement;
}

const COPY_SLOTS = 4;
const CROP_INTERVAL_MS = 150;
const TEXT_INTERVAL_MS = 250;
const WINDOW = 60;

interface FixtureWaiter {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

class Lab {
  private session: Session | null = null;
  private starting = false;
  private error: string | null = null;
  private results = 0;
  private faces = 0;
  private last: FrameResult | null = null;
  private recent: FrameResult[] = [];
  private probe: ProbeResult | null = null;
  private probeError: string | null = null;
  private messages: HostError[] = [];
  private selected = new Set<EngineId>();
  private renderers = new Map<EngineId, CropRenderer>();
  private copies: FrameCopy[] = [];
  private lastCopyMs = 0;
  private copyNext = false;
  private fixture: FixtureWaiter | null = null;
  private textDue = 0;
  private rafPending = false;
  private displayNames: Partial<Record<EngineId, string>> = {};
  private readonly els: Record<string, HTMLElement> = {};
  private cameraSelect!: HTMLSelectElement;
  private startButton!: HTMLButtonElement;
  private runButton!: HTMLButtonElement;
  private cropBox!: HTMLElement;
  private roiCanvas!: HTMLCanvasElement;
  private engineCanvases = new Map<EngineId, HTMLElement>();
  private root: HTMLElement | null = null;

  mount(root: HTMLElement): () => void {
    this.root = root;
    const settings = getState().settings;
    if (Array.isArray(settings.engines)) for (const id of settings.engines) this.selected.add(id);
    root.append(h('style', null, LAB_CSS), ...this.layout());
    void loadRenderers().then((r) => {
      this.renderers = r;
      this.buildCropSlots();
    });
    void Promise.all(ENGINE_IDS.map(async (id) => [id, (await ENGINE_LOADERS[id]()).spec.displayName] as const))
      .then((names) => {
        for (const [id, name] of names) this.displayNames[id] = name;
        this.renderText();
      })
      .catch(() => undefined);
    this.renderText();
    current = this;
    return () => {
      if (current === this) current = null;
      this.stop();
      this.root = null;
    };
  }

  private el<K extends keyof HTMLElementTagNameMap>(key: string, tag: K, attrs?: Record<string, string>): HTMLElementTagNameMap[K] {
    const node = h(tag, attrs ?? null);
    this.els[key] = node;
    return node;
  }

  private panel(titleKey: string, ...children: (Node | string)[]): HTMLElement {
    return h('section', { class: 'lab-panel', 'aria-labelledby': `lab-${titleKey}` }, h('h2', { id: `lab-${titleKey}` }, t(`lab.section.${titleKey}`)), ...children);
  }

  private layout(): Node[] {
    this.startButton = h('button', { type: 'button', onclick: () => void this.toggle() }, t('lab.start'));
    this.cameraSelect = h('select', { id: 'lab-camera', disabled: true, onchange: () => void this.switchCamera() });
    this.runButton = h('button', { type: 'button', class: 'secondary', disabled: true, onclick: () => void this.runAll() }, t('lab.runAll'));
    const engineBoxes = ENGINE_IDS.map((id) => {
      const box = h('input', { type: 'checkbox', id: `lab-engine-${id}`, value: id, onchange: () => void this.applyEngines() });
      box.checked = this.selected.has(id);
      return h('label', { for: `lab-engine-${id}`, style: 'margin-right: var(--space-3)' }, box, ` ${id}`);
    });
    this.cropBox = h('div');
    this.roiCanvas = h('canvas', { width: 240, height: 240, 'aria-label': t('lab.roi') });

    return [
      h('h1', null, t('route.lab')),
      h('p', { class: 'lead' }, t('lab.lead')),
      h(
        'div',
        { class: 'lab-controls' },
        this.startButton,
        h('div', null, h('label', { for: 'lab-camera' }, t('lab.cameraLabel')), h('br'), this.cameraSelect, h('p', { class: 'note' }, t('lab.cameraHint'))),
        h('fieldset', null, h('legend', null, t('lab.enginesLegend')), ...engineBoxes),
        this.runButton,
      ),
      this.el('status', 'p', { role: 'status', 'aria-live': 'polite' }),
      this.el('alert', 'p', { role: 'alert', style: 'color: var(--danger)' }),
      h(
        'div',
        { class: 'lab-grid' },
        this.panel('host', this.el('host', 'dl', { class: 'lab-dl' })),
        this.panel('camera', this.el('camera', 'dl', { class: 'lab-dl' })),
        this.panel('frames', this.el('frames', 'dl', { class: 'lab-dl' })),
        this.panel('timings', this.el('timings', 'table', { class: 'lab-table' })),
        this.panel('face', this.el('face', 'dl', { class: 'lab-dl' })),
        this.panel('engines', this.el('engines', 'table', { class: 'lab-table' })),
        this.panel('crops', h('p', { class: 'note' }, t('lab.cropsNote')), this.cropBox),
        this.panel('run', this.el('run', 'div')),
        this.panel('messages', this.el('messages', 'div', { class: 'lab-messages' })),
      ),
    ];
  }

  private buildCropSlots(): void {
    this.engineCanvases.clear();
    const frame: Node[] = [];
    if (this.session) frame.push(h('figure', null, this.session.preview, h('figcaption', null, t('lab.preview'))));
    frame.push(h('figure', null, this.roiCanvas, h('figcaption', null, t('lab.roi'))));
    const engines = ENGINE_IDS.map((id) => {
      const holder = h('div', { class: 'lab-crop-views', 'data-engine': id }, h('p', { class: 'note' }, t('lab.engine.notSelected')));
      this.engineCanvases.set(id, holder);
      return h('figure', null, h('figcaption', null, this.displayNames[id] ?? id), holder);
    });
    this.cropBox.replaceChildren(h('div', { class: 'lab-crops' }, ...frame), h('div', { class: 'lab-crops lab-crops-engines' }, ...engines));
  }

  // ----- Start and stop ------------------------------------------------------

  private async toggle(): Promise<void> {
    if (this.session) this.stop();
    else await this.start();
  }

  async start(deviceId?: string): Promise<void> {
    if (this.session || this.starting) return;
    this.starting = true;
    this.error = null;
    this.startButton.disabled = true;
    this.setStatus(t('lab.starting'));
    let camera: CameraSession | null = null;
    let host: ManagedVisionHost | null = null;
    try {
      camera = await openCamera({ deviceId });
      if (!this.root) throw new Error('the diagnostics screen was closed');
      void this.fillCameras(camera);
      this.setStatus(t('lab.loadingVision'));
      const settings = getState().settings;
      host = await createVisionHost(defaultVisionConfig({ e2e: settings.e2e, force: settings.force }), settings.host ?? undefined);
      // Leaving the screen while the host started must not leave a camera or worker running.
      if (!this.root) throw new Error('the diagnostics screen was closed');
      const preview = camera.createPreview();
      const session: Session = { camera, host, preview, clock: null as unknown as FrameClock, unsubscribe: [] };
      session.clock = new FrameClock(camera.source, host, {
        tap: (bitmap, meta) => this.tap(bitmap, meta),
        onError: (error) => this.addMessage({ stage: 'host', message: `frame clock: ${error instanceof Error ? error.message : String(error)}`, recoverable: true }),
      });
      session.unsubscribe.push(
        host.onResult((r) => this.onResult(r)),
        host.onError((e) => this.addMessage(e)),
        host.onProgress((asset, loaded, total) => this.setStatus(t('lab.progress', { asset, percent: total > 0 ? Math.round((100 * loaded) / total) : 0 }))),
        camera.onEnded(() => {
          this.stop();
          this.showError(t('camera.ended'));
        }),
      );
      this.session = session;
      session.clock.start();
      this.buildCropSlots();
      this.startButton.textContent = t('lab.stop');
      this.runButton.disabled = false;
      this.setStatus(t('lab.running'));
      if (this.selected.size > 0) await this.applyEngines();
    } catch (error) {
      host?.dispose();
      camera?.stop();
      this.session = null;
      const message = error instanceof CameraError ? error.message : t('lab.startFailed', { message: error instanceof Error ? error.message : String(error) });
      this.showError(message);
      this.setStatus(t('lab.stopped'));
    } finally {
      this.starting = false;
      if (this.root) {
        this.startButton.disabled = false;
        this.renderText();
      }
    }
  }

  stop(): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    s.clock.stop();
    for (const off of s.unsubscribe) off();
    s.host.dispose();
    s.camera.stop();
    this.copies = [];
    this.fixture?.reject(new Error('the diagnostics session stopped'));
    this.fixture = null;
    if (this.root) {
      this.startButton.textContent = t('lab.start');
      this.runButton.disabled = true;
      this.setStatus(t('lab.stopped'));
      this.buildCropSlots();
      this.renderText();
    }
  }

  private async fillCameras(camera: CameraSession): Promise<void> {
    try {
      const cameras = await listCameras();
      const settingsId = camera.track.getSettings().deviceId;
      this.cameraSelect.replaceChildren(
        ...cameras.map((c) => {
          const option = h('option', { value: c.deviceId }, c.label);
          option.selected = c.deviceId === settingsId;
          return option;
        }),
      );
      this.cameraSelect.disabled = cameras.length < 2;
    } catch {
      this.cameraSelect.disabled = true;
    }
  }

  private async switchCamera(): Promise<void> {
    const id = this.cameraSelect.value;
    this.stop();
    await this.start(id);
  }

  private async applyEngines(): Promise<void> {
    this.selected = new Set(ENGINE_IDS.filter((id) => (this.root?.querySelector<HTMLInputElement>(`#lab-engine-${id}`)?.checked ?? false)));
    const s = this.session;
    if (!s) return;
    try {
      await s.host.setEngines([...this.selected]);
    } catch (error) {
      this.addMessage({ stage: 'host', message: error instanceof Error ? error.message : String(error), recoverable: true });
    }
    this.renderText();
  }

  async runAll(): Promise<ProbeResult | null> {
    const s = this.session;
    if (!s) return null;
    this.runButton.disabled = true;
    this.probeError = null;
    this.setStatus(t('lab.runningAll'));
    for (const id of ENGINE_IDS) {
      const box = this.root?.querySelector<HTMLInputElement>(`#lab-engine-${id}`);
      if (box) box.checked = true;
    }
    try {
      await this.applyEngines();
      this.probe = await s.host.probe(10);
      this.setStatus(t('lab.runDone', { frames: this.probe.frames }));
      return this.probe;
    } catch (error) {
      this.probeError = error instanceof Error ? error.message : String(error);
      this.setStatus(t('lab.runFailed', { message: this.probeError }));
      return null;
    } finally {
      this.runButton.disabled = !this.session;
      this.renderText();
    }
  }

  // ----- Frames ----------------------------------------------------------------

  /**
   * Copies a frame's pixels before the bitmap goes to the host, only when the
   * host will take the frame (a busy host drops it) and a crop update or the
   * fixture needs it.
   */
  private tap(bitmap: ImageBitmap, meta: FrameMeta): void {
    if (!this.session || this.session.host.busy) return;
    const now = performance.now();
    if (!this.copyNext && now - this.lastCopyMs < CROP_INTERVAL_MS) return;
    this.copyNext = false;
    this.lastCopyMs = now;
    let slot = this.copies.length >= COPY_SLOTS ? this.copies.shift()! : null;
    if (!slot) {
      const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) : h('canvas');
      slot = { index: meta.index, canvas };
    }
    if (slot.canvas.width !== bitmap.width || slot.canvas.height !== bitmap.height) {
      slot.canvas.width = bitmap.width;
      slot.canvas.height = bitmap.height;
    }
    const ctx = slot.canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return;
    ctx.clearRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    slot.index = meta.index;
    this.copies.push(slot);
  }

  private framePixels(index: number): ImageData | null {
    const copy = this.copies.find((c) => c.index === index);
    if (!copy) return null;
    const ctx = copy.canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    return ctx ? ctx.getImageData(0, 0, copy.canvas.width, copy.canvas.height) : null;
  }

  private onResult(r: FrameResult): void {
    this.results += 1;
    if (r.face) this.faces += 1;
    this.last = r;
    this.recent.push(r);
    if (this.recent.length > WINDOW) this.recent.shift();

    if (this.fixture) {
      const pixels = r.face ? this.framePixels(r.meta.index) : null;
      if (r.face && pixels) {
        const waiter = this.fixture;
        this.fixture = null;
        clearTimeout(waiter.timer);
        waiter.resolve(this.fixtureData(r, pixels));
      } else {
        this.copyNext = true;
      }
    }
    if (this.copies.some((c) => c.index === r.meta.index)) this.renderCrops(r);

    const now = performance.now();
    if (now >= this.textDue && !this.rafPending) {
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        this.textDue = performance.now() + TEXT_INTERVAL_MS;
        this.renderText();
      });
    }
  }

  // ----- Crops -------------------------------------------------------------------

  private renderCrops(r: FrameResult): void {
    const pixels = this.framePixels(r.meta.index);
    const copy = this.copies.find((c) => c.index === r.meta.index);
    if (!pixels || !copy) return;
    this.drawRoi(r, copy.canvas);
    for (const [id, holder] of this.engineCanvases) {
      const renderer = this.renderers.get(id);
      if (!r.engines[id]) {
        holder.replaceChildren(h('p', { class: 'note' }, t('lab.engine.notSelected')));
        continue;
      }
      if (!renderer) {
        holder.replaceChildren(h('p', { class: 'note' }, t('lab.noCrop')));
        continue;
      }
      let views: LabView[];
      try {
        views = renderer.render({ result: r, frame: pixels });
      } catch (error) {
        holder.replaceChildren(h('p', { class: 'note' }, String(error instanceof Error ? error.message : error)));
        continue;
      }
      holder.replaceChildren(...views.map((v) => this.drawView(v, copy.canvas)));
    }
  }

  private drawView(view: LabView, frame: OffscreenCanvas | HTMLCanvasElement): Node {
    const canvas = h('canvas', { 'aria-label': view.label });
    const ctx = canvas.getContext('2d');
    if (view.image && ctx) {
      const scale = Math.max(1, Math.floor(160 / Math.max(view.image.width, view.image.height)));
      canvas.width = view.image.width * scale;
      canvas.height = view.image.height * scale;
      const tile = h('canvas');
      tile.width = view.image.width;
      tile.height = view.image.height;
      tile.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(view.image.data), view.image.width, view.image.height), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tile, 0, 0, canvas.width, canvas.height);
    } else if (view.frameRect && ctx) {
      const { sx, sy, sw, sh, dw, dh } = view.frameRect;
      canvas.width = Math.max(1, Math.round(dw));
      canvas.height = Math.max(1, Math.round(dh));
      if (sw > 0 && sh > 0) ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }
    return h('figure', null, canvas, h('figcaption', null, view.label));
  }

  private drawRoi(r: FrameResult, frame: OffscreenCanvas | HTMLCanvasElement): void {
    const ctx = this.roiCanvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.roiCanvas.width, this.roiCanvas.height);
    const face = r.face;
    if (!face) return;
    const rect = roiRect(face.landmarks, r.meta.videoW, r.meta.videoH);
    if (!rect) return;
    const scale = Math.min(this.roiCanvas.width / rect.w, this.roiCanvas.height / rect.h);
    const ox = (this.roiCanvas.width - rect.w * scale) / 2;
    const oy = (this.roiCanvas.height - rect.h * scale) / 2;
    ctx.drawImage(frame, rect.x, rect.y, rect.w, rect.h, ox, oy, rect.w * scale, rect.h * scale);
    const toCanvas = (i: number): [number, number] => [
      ox + (lmX(face.landmarks, i) * r.meta.videoW - rect.x) * scale,
      oy + (lmY(face.landmarks, i) * r.meta.videoH - rect.y) * scale,
    ];
    ctx.fillStyle = '#56b4e9';
    for (const i of [...CONTOUR_L, ...CONTOUR_R]) {
      const [x, y] = toCanvas(i);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.fillStyle = '#e69f00';
    for (const i of [EYE_L.iris, EYE_R.iris]) {
      const [x, y] = toCanvas(i);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  // ----- Text panels -----------------------------------------------------------------

  private setStatus(text: string): void {
    if (this.els.status) this.els.status.textContent = text;
  }

  private showError(message: string): void {
    this.error = message;
    if (this.els.alert) this.els.alert.textContent = message;
  }

  private addMessage(e: HostError): void {
    const last = this.messages.at(-1);
    if (last && last.stage === e.stage && last.message === e.message) return;
    this.messages.push(e);
    if (this.messages.length > 20) this.messages.shift();
    this.renderText();
  }

  private dl(key: string, rows: [string, string][]): void {
    const el = this.els[key];
    if (!el) return;
    el.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, t(k)), h('dd', null, v)]));
  }

  private table(key: string, head: string[], rows: string[][]): void {
    const el = this.els[key];
    if (!el) return;
    el.replaceChildren(
      h('thead', null, h('tr', null, ...head.map((c) => h('th', { scope: 'col' }, t(c))))),
      h('tbody', null, ...rows.map((row) => h('tr', null, ...row.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', null, c)))))),
    );
  }

  private renderText(): void {
    if (!this.root) return;
    const s = this.session;
    const info = s?.host.info ?? null;
    const none = t('lab.none');
    if (this.els.alert && !this.error) this.els.alert.textContent = '';

    this.dl('host', [
      ['lab.host.kind', s ? s.host.kind : t('lab.notStarted')],
      ['lab.host.reason', s ? s.host.selection.reason : none],
      ['lab.host.variant', info?.wasmVariant ?? none],
      ['lab.host.delegate', info?.delegate ?? none],
      ['lab.host.mediapipe', info?.mediapipe ?? none],
      ['lab.host.model', info ? `${info.modelSha256.slice(0, 12)}…` : none],
      ['lab.host.init', ms(info?.initMs)],
      ['lab.host.restarts', s ? String(s.host.stats().restarts) : none],
    ]);

    const cam = s?.camera.info;
    const clock = s?.clock.stats();
    this.dl('camera', [
      ['lab.camera.device', cam?.label || none],
      ['lab.camera.size', cam ? `${cam.width} × ${cam.height}` : none],
      ['lab.camera.fps', cam?.frameRate ? t('lab.unit.hz', { value: fmt(cam.frameRate) }) : none],
      ['lab.camera.rung', cam ? String(cam.attempts.map((a) => (a.rung ? `${a.rung.width}×${a.rung.height}` : t('lab.camera.anyRung')) + (a.error ? ` (${a.error})` : '')).join(' → ')) : none],
      ['lab.camera.hash', cam?.deviceIdHash ?? none],
      ['lab.camera.clock', clock ? `${clock.mode}, ${clock.lastClock ?? none}` : none],
    ]);

    const recent = this.recent;
    const span = recent.length > 1 ? recent[recent.length - 1].receivedMs - recent[0].receivedMs : 0;
    const rate = span > 0 ? ((recent.length - 1) * 1000) / span : Number.NaN;
    const latency = recent.map((r) => r.receivedMs - r.meta.tCaptureMs);
    this.dl('frames', [
      ['lab.frames.delivered', clock ? String(clock.delivered) : none],
      ['lab.frames.submitted', clock ? String(clock.submitted) : none],
      ['lab.frames.dropped', clock ? String(clock.dropped) : none],
      ['lab.frames.gaps', clock ? String(clock.cameraGapFrames) : none],
      ['lab.frames.results', String(this.results)],
      ['lab.frames.faces', String(this.faces)],
      ['lab.frames.rate', Number.isFinite(rate) ? t('lab.unit.hz', { value: fmt(rate) }) : none],
      ['lab.frames.latency', ms(median(latency))],
    ]);

    const last = this.last;
    const timingRows: string[][] = [
      [t('lab.timing.landmarker'), ms(last?.face?.landmarkerMs), ms(median(recent.map((r) => r.face?.landmarkerMs ?? Number.NaN)))],
      ...ENGINE_IDS.filter((id) => last?.engines[id]).map((id) => [
        this.displayNames[id] ?? id,
        ms(last?.engines[id]?.computeMs),
        ms(median(recent.map((r) => (r.engines[id]?.status === 'ok' ? r.engines[id]!.computeMs : Number.NaN)))),
      ]),
      [t('lab.timing.worker'), ms(last?.workerMs), ms(median(recent.map((r) => r.workerMs)))],
      [t('lab.timing.latency'), ms(last ? last.receivedMs - last.meta.tCaptureMs : null), ms(median(latency))],
    ];
    this.table('timings', ['lab.timing.stage', 'lab.timing.last', 'lab.timing.median'], timingRows);

    const f = last?.face ?? null;
    this.dl('face', [
      ['lab.face.found', last ? yesNo(f !== null) : none],
      ['lab.face.pose', f ? `${deg(f.pose.yawDeg)}, ${deg(f.pose.pitchDeg)}, ${deg(f.pose.rollDeg)}` : none],
      ['lab.face.open', f ? yesNo(f.eyes.open) : none],
      ['lab.face.openQ', f ? `${fmt(f.eyes.openQL, 2)}, ${fmt(f.eyes.openQR, 2)}` : none],
      ['lab.face.blink', f ? `${fmt(f.eyes.blinkL, 2)}, ${fmt(f.eyes.blinkR, 2)}` : none],
      ['lab.face.ear', f ? `${fmt(f.eyes.earL, 3)}, ${fmt(f.eyes.earR, 3)}` : none],
      ['lab.face.iris', f ? px(f.eyes.irisDiamPx) : none],
      ['lab.face.interOcular', f ? px(f.eyes.interOcularPx) : none],
      ['lab.face.width', f ? pct(f.quality.faceWidthFrac) : none],
      ['lab.face.centring', f ? `${fmt(f.quality.centring[0], 3)}, ${fmt(f.quality.centring[1], 3)}` : none],
      ['lab.face.luma', f ? `${fmt(f.quality.lumaMean)}, ${fmt(f.quality.lumaSd)}` : none],
      ['lab.face.backlight', f ? fmt(f.quality.backlight, 2) : none],
      ['lab.face.glare', f ? pct(f.quality.glare) : none],
    ]);

    const statuses = s?.host.engineStatus ?? [];
    this.table(
      'engines',
      ['lab.engine.engine', 'lab.engine.status', 'lab.engine.backend', 'lab.engine.load', 'lab.engine.frame', 'lab.engine.median'],
      ENGINE_IDS.map((id) => {
        const st = statuses.find((x) => x.id === id);
        const frame = last?.engines[id];
        return [
          this.displayNames[id] ?? id,
          !st ? t('lab.engine.notSelected') : st.ok ? t('lab.engine.ok') : t('lab.engine.unavailable', { reason: st.reason ?? none }),
          st?.backend ?? none,
          ms(st?.loadMs),
          frame?.status ?? none,
          ms(median(recent.map((r) => (r.engines[id]?.status === 'ok' ? r.engines[id]!.computeMs : Number.NaN)))),
        ];
      }),
    );

    const run = this.els.run;
    if (run) {
      const p = this.probe;
      if (!p) run.replaceChildren(h('p', { class: 'note' }, this.probeError ? t('lab.runFailed', { message: this.probeError }) : none));
      else {
        const table = h('table', { class: 'lab-table' });
        this.els.runTable = table;
        this.table('runTable', ['lab.run.stage', 'lab.run.okFrames', 'lab.run.p50', 'lab.run.p90'], [
          [t('lab.run.landmarker'), String(p.frames), ms(p.landmarkerP50Ms), ms(p.landmarkerP90Ms)],
          [t('lab.run.prep'), none, ms(p.prepP50Ms), none],
          ...ENGINE_IDS.map((id) => {
            const e = p.engines[id];
            const st = statuses.find((x) => x.id === id);
            const label = `${this.displayNames[id] ?? id}${st?.backend ? ` (${st.backend})` : st && !st.ok ? ` (${st.reason ?? none})` : ''}`;
            return [label, e ? `${e.okFrames} / ${p.frames}` : none, ms(e?.p50Ms), ms(e?.p90Ms)];
          }),
          [t('lab.run.total'), none, ms(p.totalP50Ms), none],
        ]);
        run.replaceChildren(table);
      }
    }

    const messages = this.els.messages;
    if (messages) {
      messages.replaceChildren(
        ...(this.messages.length === 0
          ? [h('p', { class: 'note' }, t('lab.noMessages'))]
          : this.messages.map((m) => h('p', null, `${m.stage}${m.recoverable ? '' : t('lab.fatal')}: ${m.message}`))),
      );
    }
  }

  // ----- Test hooks --------------------------------------------------------------------

  snapshot() {
    const s = this.session;
    return {
      running: s !== null,
      error: this.error,
      selection: s?.host.selection ?? null,
      info: s?.host.info ?? null,
      engineStatus: s?.host.engineStatus ?? [],
      camera: s?.camera.info ?? null,
      clock: s?.clock.stats() ?? null,
      host: s?.host.stats() ?? null,
      results: this.results,
      faces: this.faces,
      lastResult: this.last ? plainResult(this.last) : null,
      probe: this.probe,
      probeError: this.probeError,
      messages: [...this.messages],
    };
  }

  captureFixture(timeoutMs = 15_000): Promise<unknown> {
    if (!this.session) return Promise.reject(new Error('Start the diagnostics session first.'));
    this.fixture?.reject(new Error('superseded'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fixture = null;
        reject(new Error('no frame with a face arrived in time'));
      }, timeoutMs);
      this.fixture = { resolve, reject, timer };
      this.copyNext = true;
    });
  }

  private fixtureData(r: FrameResult, pixels: ImageData) {
    const s = this.session!;
    return {
      result: plainResult(r),
      info: s.host.info,
      selection: s.host.selection,
      camera: s.camera.info,
      roi: roiRect(r.face!.landmarks, r.meta.videoW, r.meta.videoH),
      pixels: { width: pixels.width, height: pixels.height, rgbaBase64: base64(pixels.data) },
    };
  }
}

let current: Lab | null = null;

registerTestHook('lab', () => (current ? current.snapshot() : null));
registerTestHook('labStart', () => current?.start() ?? Promise.reject(new Error('#/lab is not open')));
registerTestHook('labRunAll', () => current?.runAll() ?? Promise.reject(new Error('#/lab is not open')));
registerTestHook('labCaptureFixture', () => current?.captureFixture() ?? Promise.reject(new Error('#/lab is not open')));
registerTestHook('crashWorker', () => crashWorkerHosts());

const screen: Screen = {
  mount(root) {
    return new Lab().mount(root);
  },
};

export default screen;
