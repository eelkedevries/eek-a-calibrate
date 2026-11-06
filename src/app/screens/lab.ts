// #/lab, the diagnostics screen (spec §7 screen 10, §17.2): host, delegate, backends,
// per-stage timings, live crops and engine status, and "Run each engine on 10
// frames" (the probe over every engine, used by engines.spec.ts). Opened from
// Details → Device, in the game's framed shell: the readings are cards in the
// stage, one at a time, and a card taller than the stage continues on the next
// page (`splitBlocks`), so the page never scrolls.
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
import { ENGINE_SPECS } from '../../engines/specs.ts';
import { CameraError, listCameras, openCamera, type CameraSession } from '../../platform/camera.ts';
import { FrameClock } from '../../platform/frameClock.ts';
import { roiRect } from '../../vision/frameImage.ts';
import { crashWorkerHosts, createVisionHost, defaultVisionConfig, type HostError, type ManagedVisionHost } from '../../vision/host.ts';
import type { ProbeResult } from '../../vision/protocol.ts';
import './pages.css';
import { checkRow } from '../details/page.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { addCleanup } from '../shell/appShell.ts';
import { detailsReturnHash } from '../shell/detailsSheet.ts';
import { icon } from '../shell/icons.ts';
import { splitBlocks } from '../shell/pager.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerTestHook } from '../testHooks.ts';
import { guardPanel, toolFrame } from './screen.ts';

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

// ----- The deck of cards ------------------------------------------------------------

interface DeckCard {
  id: string;
  title: string;
  el: HTMLElement;
}

/** One row of a card: a label and its value in mono. */
interface LabRow {
  el: HTMLElement;
  k: HTMLElement;
  v: HTMLElement;
}

function labRow(): LabRow {
  const k = h('span', { class: 'lab-row__k' });
  const v = h('span', { class: 'lab-row__v' });
  return { el: h('div', { class: 'lab-row' }, k, v), k, v };
}

/**
 * The cards in the stage, one page at a time. Each card's children are its blocks; a card taller
 * than the body is cut into pages between blocks. `layout` measures again (a resize, a change in
 * the number of rows); `showCard` jumps to a card's first page.
 */
class Deck {
  readonly el: HTMLElement;
  private readonly title = h('h2', { class: 'lab-deck__title', id: 'lab-card-title' });
  private readonly count = h('span', { class: 'pager__label', 'aria-live': 'polite' });
  private readonly body = h('div', { class: 'lab-deck__body', role: 'region', 'aria-labelledby': 'lab-card-title' });
  private readonly select: HTMLSelectElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private pages: { card: number; blocks: HTMLElement[] }[] = [];
  private index = 0;
  private readonly cards: DeckCard[];

  constructor(cards: DeckCard[]) {
    this.cards = cards;
    this.select = h('select', { 'aria-label': t('lab.section') }, ...cards.map((c) => h('option', { value: c.id }, c.title)));
    this.select.addEventListener('change', () => this.showCard(this.select.value));
    this.prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('details.page.prev') }, icon('chevronLeft'));
    this.next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('details.page.next') }, icon('chevronRight'));
    this.prev.addEventListener('click', () => this.step(-1));
    this.next.addEventListener('click', () => this.step(1));
    for (const c of cards) c.el.hidden = true;
    this.body.append(...cards.map((c) => c.el));
    this.el = h(
      'div',
      { class: 'lab-deck' },
      h('div', { class: 'lab-deck__head' }, this.title, this.count),
      this.body,
      h('div', { class: 'lab-deck__nav' }, this.prev, this.select, this.next),
    );
  }

  private step(delta: number): void {
    const target = this.index + delta;
    if (target < 0 || target >= this.pages.length) return;
    this.show(target);
  }

  /** The blocks of a card that apply now (rows marked `data-off` do not). */
  private blocks(card: DeckCard): HTMLElement[] {
    return ([...card.el.children] as HTMLElement[]).filter((b) => !b.hasAttribute('data-off'));
  }

  layout(): void {
    const available = this.body.clientHeight;
    const currentCard = this.pages[this.index]?.card ?? 0;
    const currentFirst = this.pages[this.index]?.blocks[0] ?? null;
    this.pages = [];
    this.cards.forEach((card, i) => {
      const blocks = this.blocks(card);
      card.el.hidden = false;
      for (const b of blocks) b.hidden = false;
      const heights = blocks.map((b) => b.getBoundingClientRect().height);
      const gap = Number.parseFloat(getComputedStyle(card.el).rowGap) || 0;
      card.el.hidden = true;
      const split = available > 0 ? splitBlocks(heights, [], gap, available) : [blocks.map((_, n) => n)];
      for (const piece of split) this.pages.push({ card: i, blocks: piece.map((n) => blocks[n]!) });
    });
    const keep = this.pages.findIndex((p) => p.card === currentCard && (currentFirst === null || p.blocks.includes(currentFirst)));
    this.show(keep >= 0 ? keep : Math.max(0, this.pages.findIndex((p) => p.card === currentCard)));
  }

  show(index: number): void {
    this.index = Math.min(Math.max(0, index), Math.max(0, this.pages.length - 1));
    const page = this.pages[this.index];
    this.cards.forEach((card, i) => {
      card.el.hidden = !page || i !== page.card;
      if (page && i === page.card) for (const b of this.blocks(card)) b.hidden = !page.blocks.includes(b);
    });
    const card = page ? this.cards[page.card]! : null;
    this.title.textContent = card?.title ?? '';
    this.select.value = card?.id ?? '';
    this.count.textContent = t('details.page.position', { page: this.index + 1, pages: Math.max(1, this.pages.length) });
    this.prev.setAttribute('aria-disabled', String(this.index <= 0));
    this.next.setAttribute('aria-disabled', String(this.index >= this.pages.length - 1));
  }

  showCard(id: string): void {
    const i = this.cards.findIndex((c) => c.id === id);
    const page = this.pages.findIndex((p) => p.card === i);
    if (page >= 0) this.show(page);
  }

  /**
   * Lays the deck out again when a card's content grows past the body (the crops arrive as
   * images); returns the function that stops watching.
   */
  watch(): () => void {
    const observer = new ResizeObserver(() => {
      if (this.body.scrollHeight > this.body.clientHeight + 1) this.layout();
    });
    for (const card of this.cards) observer.observe(card.el);
    return () => observer.disconnect();
  }

  currentCard(): string | null {
    const page = this.pages[this.index];
    return page ? (this.cards[page.card]?.id ?? null) : null;
  }
}


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
  private previewBox!: HTMLElement;
  private roiCanvas!: HTMLCanvasElement;
  private engineCanvases = new Map<EngineId, HTMLElement>();
  private engineFigures = new Map<EngineId, HTMLElement>();
  private rows: Record<string, LabRow[]> = {};
  private cardEls: Record<string, HTMLElement> = {};
  private deck!: Deck;
  private shape = '';
  private root: HTMLElement | null = null;

  mount(root: HTMLElement): () => void {
    this.root = root;
    const settings = getState().settings;
    if (Array.isArray(settings.engines)) for (const id of settings.engines) this.selected.add(id);
    this.layout(root);
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

  private card(id: string, ...blocks: (Node | null)[]): DeckCard {
    const el = h('div', { class: `lab-card${blocks.length === 0 ? ' lab-card--rows' : ''}`, 'data-card': id }, ...blocks);
    this.cardEls[id] = el;
    return { id, title: t(`lab.section.${id}`), el };
  }

  private layout(root: HTMLElement): void {
    // Diagnostics is opened from Details → Device: Back returns there.
    const back = detailsReturnHash('device');
    const frame = toolFrame(root, { title: t('route.lab'), body: t('lab.lead'), back });
    this.startButton = h('button', { type: 'button', class: 'btn btn--primary', onclick: () => void this.toggle() }, t('lab.start'));
    this.runButton = h('button', { type: 'button', class: 'btn btn--secondary', disabled: true, onclick: () => void this.runAll() }, t('lab.runAll'));
    this.cameraSelect = h('select', { id: 'lab-camera', class: 'lab-camera-select', disabled: true, onchange: () => void this.switchCamera() });
    const engineBoxes = ENGINE_IDS.map((id) =>
      checkRow({ id: `lab-engine-${id}`, label: ENGINE_SPECS[id].displayName, checked: this.selected.has(id), onChange: () => void this.applyEngines() }),
    );
    this.previewBox = h('div', { class: 'lab-crops' });
    this.roiCanvas = h('canvas', { width: 240, height: 240, 'aria-label': t('lab.roi') });
    const cards = [
      this.card('host'),
      this.card('camera', h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'lab-camera' }, t('lab.cameraLabel')), this.cameraSelect), h('p', { class: 'tool-note' }, t('lab.cameraHint'))),
      this.card('frames'),
      this.card('timings'),
      this.card('face'),
      this.card('quality'),
      this.card('engines'),
      this.card('select', h('p', { class: 'tool-note' }, t('lab.enginesLegend')), ...engineBoxes),
      this.card('crops', h('p', { class: 'tool-note' }, t('lab.cropsNote')), this.previewBox),
      this.card('engineCrops'),
      this.card('run'),
      this.card('messages'),
    ];
    // Rows-only cards start empty; their rows arrive with the first render.
    for (const id of ['host', 'camera', 'frames', 'timings', 'face', 'quality', 'engines', 'run']) this.cardEls[id]!.classList.add('lab-card--rows');
    this.deck = new Deck(cards);
    frame.stage.append(this.deck.el);
    frame.extra.append(this.el('alert', 'p', { class: 'tool-status', role: 'alert' }));
    frame.status.setAttribute('aria-live', 'polite');
    this.els.status = frame.status;
    frame.actions.classList.add('actions--wrap');
    frame.actions.append(this.runButton, this.startButton);
    guardPanel(root, 320);
    const observer = new ResizeObserver(() => this.deck.layout());
    observer.observe(frame.stage);
    addCleanup(() => observer.disconnect());
    addCleanup(this.deck.watch());
  }

  private buildCropSlots(): void {
    this.engineCanvases.clear();
    this.engineFigures.clear();
    const frame: Node[] = [];
    if (this.session) frame.push(h('figure', null, this.session.preview, h('figcaption', null, t('lab.preview'))));
    frame.push(h('figure', null, this.roiCanvas, h('figcaption', null, t('lab.roi'))));
    this.previewBox.replaceChildren(...frame);
    const engines = ENGINE_IDS.map((id) => {
      const holder = h('div', { class: 'lab-crop-views', 'data-engine': id }, h('p', { class: 'tool-note' }, t('lab.engine.notSelected')));
      this.engineCanvases.set(id, holder);
      const figure = h('figure', { class: 'lab-engine-crop' }, h('figcaption', null, this.displayNames[id] ?? id), holder);
      this.engineFigures.set(id, figure);
      return h('div', { class: 'lab-crops' }, figure);
    });
    this.cardEls.engineCrops?.replaceChildren(...engines);
    if (this.deck) requestAnimationFrame(() => this.deck.layout());
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
      host = await createVisionHost(defaultVisionConfig({ e2e: settings.e2e, force: settings.force, delegate: settings.delegate ?? null }), settings.host ?? undefined);
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
      this.renderText();
      this.deck.showCard('run');
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

  /** Writes a card's rows (label, value); a change in their number lays the deck out again. */
  private dl(key: string, rows: [string, string][], translate = true): void {
    const card = this.cardEls[key];
    if (!card) return;
    const list = (this.rows[key] ??= []);
    while (list.length < rows.length) {
      const row = labRow();
      list.push(row);
      card.append(row.el);
    }
    list.forEach((row, i) => {
      const r = rows[i];
      if (r) {
        row.el.removeAttribute('data-off');
        row.k.textContent = translate ? t(r[0]) : r[0];
        row.v.textContent = r[1];
      } else {
        row.el.setAttribute('data-off', '');
        row.el.hidden = true;
      }
    });
  }

  /** A table as rows: the first cell is the label, the others the value, joined. */
  private table(key: string, rows: string[][]): void {
    this.dl(key, rows.map((cells) => [cells[0] ?? '', cells.slice(1).join(' · ')] as [string, string]), false);
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
    this.table('timings', timingRows.map(([stage, last, med]) => [stage ?? '', t('lab.timing.lastMedian', { last: last ?? none, median: med ?? none })]));

    const f = last?.face ?? null;
    this.dl('face', [
      ['lab.face.found', last ? yesNo(f !== null) : none],
      ['lab.face.pose', f ? `${deg(f.pose.yawDeg)}, ${deg(f.pose.pitchDeg)}, ${deg(f.pose.rollDeg)}` : none],
      ['lab.face.open', f ? yesNo(f.eyes.open) : none],
      ['lab.face.openQ', f ? `${fmt(f.eyes.openQL, 2)}, ${fmt(f.eyes.openQR, 2)}` : none],
      ['lab.face.blink', f ? `${fmt(f.eyes.blinkL, 2)}, ${fmt(f.eyes.blinkR, 2)}` : none],
      ['lab.face.ear', f ? `${fmt(f.eyes.earL, 3)}, ${fmt(f.eyes.earR, 3)}` : none],
      ['lab.face.iris', f ? px(f.eyes.irisDiamPx) : none],
    ]);
    this.dl('quality', [
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

    const p = this.probe;
    if (!p) {
      this.dl('run', [[t('lab.run.stage'), this.probeError ? t('lab.runFailed', { message: this.probeError }) : none]], false);
    } else {
      this.table('run', [
        [t('lab.run.landmarker'), t('lab.run.frames', { ok: p.frames, n: p.frames }), t('lab.run.times', { p50: ms(p.landmarkerP50Ms), p90: ms(p.landmarkerP90Ms) })],
        [t('lab.run.prep'), t('lab.run.times', { p50: ms(p.prepP50Ms), p90: none })],
        ...ENGINE_IDS.map((id) => {
          const e = p.engines[id];
          const st = statuses.find((x) => x.id === id);
          const label = `${this.displayNames[id] ?? id}${st?.backend ? ` (${st.backend})` : st && !st.ok ? ` (${st.reason ?? none})` : ''}`;
          return [label, e ? t('lab.run.frames', { ok: e.okFrames, n: p.frames }) : none, t('lab.run.times', { p50: ms(e?.p50Ms), p90: ms(e?.p90Ms) })];
        }),
        [t('lab.run.total'), t('lab.run.times', { p50: ms(p.totalP50Ms), p90: none })],
      ]);
    }

    const messages = this.cardEls.messages;
    if (messages) {
      const lines = this.messages.length === 0 ? [t('lab.noMessages')] : this.messages.map((m) => `${m.stage}${m.recoverable ? '' : t('lab.fatal')}: ${m.message}`);
      const now = [...messages.children].map((c) => c.textContent).join('\n');
      if (now !== lines.join('\n')) messages.replaceChildren(...lines.map((line) => h('p', { class: 'lab-messages' }, line)));
    }

    // A change in the cards' rows (an engine added, a message) lays the deck out again.
    const shape = Object.values(this.cardEls).map((c) => [...c.children].filter((b) => !b.hasAttribute('data-off')).length).join(',');
    if (shape !== this.shape) {
      this.shape = shape;
      this.deck.layout();
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
