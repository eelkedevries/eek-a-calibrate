// The Details sheet (design §2.17, §4.7; spec §17.2.1): every expert feature in one modal
// <dialog>, opened from the top bar of every screen (and the Pause card) or from
// `#/details/<tab>`, without changing the route. A bottom sheet on windows under 600 px wide
// and at least 480 px tall, a side sheet otherwise. Five tabs, one page at a time, never
// scrolling; "Delete all my data" behind a confirmation in the footer of every tab.
//
// Each tab's module (src/app/details/<tab>.ts) is loaded the first time the tab is shown and
// gives its pages through `registerDetailsTab`. A page taller than the sheet's panel is cut into
// pages that fit (`splitBlocks`): its title repeats, and the pager counts every piece.
import { announce, h } from '../dom.ts';
import { deleteAllData } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { cameraSide } from './appShell.ts';
import { icon } from './icons.ts';
import { createPager, pageAfter, splitBlocks, type Pager } from './pager.ts';

export const DETAILS_TABS = ['results', 'settings', 'data', 'device', 'about'] as const;
export type DetailsTabId = (typeof DETAILS_TABS)[number];

export function isDetailsTab(value: string): value is DetailsTabId {
  return (DETAILS_TABS as readonly string[]).includes(value);
}

/** What a page may ask of the sheet while it is built and shown. */
export interface PageContext {
  /** Runs `start` each time the page is shown; the function it returns runs when it stops being shown. */
  whileShown(start: () => void | (() => void)): void;
  /** Runs `fn` when the page is shown and then every `ms` while it stays shown (live readings). */
  every(ms: number, fn: () => void): void;
  /** Builds the tab again, keeping this page in view (a change altered what the pages hold). */
  refresh(): void;
  /** Shows another page, of this tab or another. */
  go(tab: DetailsTabId, page?: string): void;
}

export interface DetailsPage {
  /** Stable within its tab, so that a caller can open the sheet on it ("How we judge this"). */
  id: string;
  /**
   * The page, as one element whose children are its blocks; a block with the class
   * `sheet-page__head` opens every piece when the page has to be cut to fit.
   */
  build(ctx: PageContext): Node;
}

/** Builds a tab's pages; called each time the tab is shown, so the pages show current values. */
export type BuildPages = () => readonly DetailsPage[];

const builders = new Map<DetailsTabId, BuildPages>();

/** The page "Rule of thumb · How we judge this" opens (design §2.12, §2.17). */
export const JUDGE_PAGE = 'judge';

// Each tab's pages arrive with its module, loaded on first use so that the first screen stays light.
const TAB_MODULES: Readonly<Record<DetailsTabId, () => Promise<unknown>>> = {
  results: () => import('../details/results.ts'),
  settings: () => import('../details/settings.ts'),
  data: () => import('../details/data.ts'),
  device: () => import('../details/device.ts'),
  about: () => import('../details/about.ts'),
};
const loading = new Map<DetailsTabId, Promise<unknown>>();

/** Gives a tab its pages. A tab without a builder shows a loading page until its module registers. */
export function registerDetailsTab(id: DetailsTabId, buildPages: BuildPages): void {
  builders.set(id, buildPages);
  if (sheet?.dialog.open && sheet.tab === id) sheet.render(id, sheet.wanted ?? 0);
}

/** Loads a tab's module (and so its pages) ahead of opening the sheet on it. */
export function preloadDetailsTab(id: DetailsTabId): Promise<unknown> {
  let pending = loading.get(id);
  if (!pending) {
    pending = TAB_MODULES[id]().catch((error: unknown) => {
      loading.delete(id);
      throw error;
    });
    loading.set(id, pending);
  }
  return pending;
}

export type SheetForm = 'bottom' | 'side';
export interface SheetPlacement {
  form: SheetForm;
  /** The edge the sheet comes from. */
  from: 'bottom' | 'left' | 'right';
}

/**
 * Bottom sheet below 600 px wide when at least 480 px tall, side sheet otherwise: from the right,
 * or, on a phone held sideways with its camera on the right, from the left, so that it never
 * covers the camera-side cue (design §4.4, §4.7).
 */
export function sheetPlacement(width: number, height: number, camera: 'left' | 'right' | null): SheetPlacement {
  if (width < 600 && height >= 480) return { form: 'bottom', from: 'bottom' };
  const compactLandscape = width >= (5 / 4) * height && height < 480;
  return { form: 'side', from: compactLandscape && camera === 'right' ? 'left' : 'right' };
}

/** The tab a key moves to in the segmented control (arrows wrap), or null for other keys. */
export function tabAfterKey(index: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** The id of the n-th piece (0-based) of a page cut to fit: the page's own id, then `id~2`, `id~3`. */
export function pieceId(id: string, piece: number): string {
  return piece === 0 ? id : `${id}~${piece + 1}`;
}

/** The page id a piece id belongs to. */
export function pageOfPiece(id: string): string {
  const cut = id.lastIndexOf('~');
  return cut > 0 && /^\d+$/.test(id.slice(cut + 1)) ? id.slice(0, cut) : id;
}

function messagePage(tab: DetailsTabId, key: string, role: 'status' | 'alert'): DetailsPage {
  return {
    id: 'loading',
    build: () =>
      h(
        'section',
        { class: 'sheet-page' },
        h('h3', { class: 'sheet-page__title sheet-page__head' }, t(`details.tab.${tab}`)),
        h('p', { class: 'sheet-page__body', role }, t(key)),
      ),
  };
}

// ----- Where a measurement opened from Details returns to -----------------------------------

let returnHash: string | null = null;

/** Remembers the screen under the sheet before a Details link leaves it (Measure, Diagnostics). */
export function rememberDetailsReturn(): void {
  returnHash = location.hash || '#/';
}

/**
 * Where a page opened from Details goes back to: the screen the sheet was opened over, or the
 * Title with the sheet open on Device when that screen was the Title (or is not known after a
 * reload).
 */
export function detailsReturnHash(tab: DetailsTabId = 'device'): string {
  const raw = (returnHash ?? '').replace(/^#/, '');
  const path = raw.split('?')[0] ?? '';
  if (path === '' || path === '/' || path.startsWith('/details')) return `#/details/${tab}`;
  return `#${raw}`;
}

export interface OpenDetailsOptions {
  tab?: DetailsTabId;
  /** A page index, or a page id of the tab. */
  page?: number | string;
  /** Where the focus returns on closing; by default the element focused when the sheet opened. */
  trigger?: HTMLElement | null;
  /** Called once the sheet has closed. */
  onClose?: () => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Cuts a paragraph of plain text (no links or controls) that is taller than `room` px into
 * paragraphs that fit, between words, measuring it where it stands. Other blocks are left whole.
 */
function splitText(block: HTMLElement, room: number): void {
  if (block.tagName !== 'P' || room <= 0 || [...block.childNodes].some((n) => n.nodeType !== Node.TEXT_NODE)) return;
  const words = (block.textContent ?? '').split(/\s+/).filter(Boolean);
  const parts: HTMLElement[] = [];
  let start = 0;
  while (start < words.length) {
    let lo = start + 1;
    let hi = words.length;
    let best = start + 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      block.textContent = words.slice(start, mid).join(' ');
      if (block.getBoundingClientRect().height <= room + 0.5) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const part = block.cloneNode(false) as HTMLElement;
    part.textContent = words.slice(start, best).join(' ');
    parts.push(part);
    start = best;
  }
  block.replaceWith(...parts);
}

/** One piece of a page as shown: which page it belongs to and whether its content overflows. */
interface Piece {
  id: string;
  page: number;
  el: HTMLElement;
}

interface BuiltPage {
  id: string;
  starters: (() => void | (() => void))[];
}

class Sheet {
  readonly dialog: HTMLDialogElement;
  tab: DetailsTabId = 'about';
  /** The piece shown (0-based), and the pieces of the tab. */
  page = 0;
  pieces: Piece[] = [];
  /** The page asked for while the tab's module loads. */
  wanted: number | string | null = null;
  overflow = false;
  private built: BuiltPage[] = [];
  private stops: (() => void)[] = [];
  private readonly tabs: HTMLButtonElement[];
  private readonly panel: HTMLElement;
  private readonly pager: Pager;
  private readonly status: HTMLElement;
  private readonly confirm: HTMLDialogElement;
  private trigger: HTMLElement | null = null;
  private onClose: (() => void) | null = null;
  private restoreFocus = true;
  private resizeFrame = 0;
  private laidOutHeight = 0;
  private laidOutWidth = 0;

  constructor() {
    this.tabs = DETAILS_TABS.map((id) =>
      h('button', { type: 'button', class: 'sheet__tab', role: 'tab', id: `details-tab-${id}`, 'aria-controls': 'details-panel', 'aria-selected': 'false', tabindex: '-1' }, t(`details.tab.${id}`)),
    );
    this.tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => this.render(DETAILS_TABS[i]!, 0));
      tab.addEventListener('keydown', (event) => {
        const next = tabAfterKey(i, event.key, this.tabs.length);
        if (next === null) return;
        event.preventDefault();
        this.render(DETAILS_TABS[next]!, 0);
        this.tabs[next]!.focus();
      });
    });
    this.panel = h('div', { class: 'sheet__panel', role: 'tabpanel', id: 'details-panel', tabindex: '0' });
    this.pager = createPager((delta) => this.show(pageAfter(this.page, delta, this.pieces.length)));
    this.status = h('p', { class: 'sheet__status', role: 'status' });
    this.confirm = this.buildConfirm();

    const done = h('button', { type: 'button', class: 'btn btn--primary', onclick: () => this.close() }, t('details.done'));
    // Named by aria-label too: on short windows the label is hidden and the bin icon stays.
    const remove = h(
      'button',
      { type: 'button', class: 'btn btn--ghost sheet__delete', 'aria-label': t('details.delete'), 'aria-haspopup': 'dialog', onclick: () => this.confirm.showModal() },
      icon('bin'),
      h('span', { class: 'sheet__delete-label' }, t('details.delete')),
    );
    this.dialog = h(
      'dialog',
      { class: 'sheet', 'aria-labelledby': 'details-title' },
      h('div', { class: 'sheet__grip', 'aria-hidden': 'true' }),
      h('header', { class: 'sheet__head' }, h('h2', { class: 'sheet__title', id: 'details-title' }, t('details.title')), done),
      h('div', { class: 'sheet__tabs', role: 'tablist', 'aria-label': t('details.tabs') }, ...this.tabs),
      this.panel,
      h(
        'footer',
        { class: 'sheet__foot' },
        h('div', { class: 'sheet__nav' }, remove, this.pager.el),
        h('p', { class: 'sheet__version' }, t('details.version', { version: __APP_VERSION__, commit: __APP_COMMIT__ })),
        this.status,
      ),
      this.confirm,
    );
    this.dialog.addEventListener('keydown', (event) => this.trapFocus(event));
    // A click on the scrim lands on the dialog itself, outside its box.
    this.dialog.addEventListener('click', (event) => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) this.close();
    });
    // Esc, Done, the scrim and Android Back (a close request to the modal dialog) all end here.
    this.dialog.addEventListener('close', () => this.afterClose());
    // A new window or panel size, or the web fonts arriving, changes what fits: the pages are cut
    // again, keeping the piece in view.
    const relayout = () => {
      if (!this.dialog.open) return;
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        if (!this.dialog.open) return;
        this.place();
        if (Math.abs(this.panel.clientHeight - this.laidOutHeight) > 1 || Math.abs(this.panel.clientWidth - this.laidOutWidth) > 1) this.relayout();
      });
    };
    window.addEventListener('resize', relayout);
    new ResizeObserver(relayout).observe(this.panel);
    document.fonts?.addEventListener('loadingdone', () => {
      if (this.dialog.open) this.relayout();
    });
    document.body.append(this.dialog);
  }

  open(opts: OpenDetailsOptions): void {
    if (!this.dialog.open) {
      const active = document.activeElement;
      this.trigger = opts.trigger ?? (active instanceof HTMLElement && active !== document.body ? active : null);
      this.restoreFocus = true;
      this.status.textContent = '';
    }
    this.onClose = opts.onClose ?? null;
    this.place();
    // The panel must have its size before the pages are measured into it.
    if (!this.dialog.open) this.dialog.showModal();
    this.render(opts.tab ?? this.tab, opts.page ?? 0);
    this.tabs[DETAILS_TABS.indexOf(this.tab)]!.focus();
  }

  close(restoreFocus = true): void {
    if (!this.dialog.open) return;
    this.restoreFocus = restoreFocus;
    if (this.confirm.open) this.confirm.close();
    this.dialog.close();
  }

  /** Cuts the tab's pages again for the panel's size, keeping the piece shown. */
  relayout(): void {
    // While the tab's module loads, the page asked for is kept, not the loading page.
    if (!builders.has(this.tab)) this.render(this.tab, this.wanted ?? 0);
    else this.render(this.tab, this.pieces[this.page]?.id ?? this.page);
  }

  /** The page id of the piece shown. */
  currentPageId(): string | null {
    const piece = this.pieces[this.page];
    return piece ? (this.built[piece.page]?.id ?? null) : null;
  }

  render(tab: DetailsTabId, page: number | string): void {
    // A control rebuilt by a refresh keeps the focus when it has an id.
    const active = document.activeElement;
    const focusId = active instanceof HTMLElement && this.panel.contains(active) ? active.id : '';
    this.leave();
    // The form follows the window before anything is measured (a resize may not have been handled yet).
    this.place();
    this.tab = tab;
    this.tabs.forEach((button, i) => {
      const selected = DETAILS_TABS[i] === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    this.panel.setAttribute('aria-labelledby', `details-tab-${tab}`);

    const builder = builders.get(tab);
    let pages: readonly DetailsPage[];
    if (builder) {
      this.wanted = null;
      try {
        pages = builder();
      } catch (error) {
        console.error(`The ${tab} tab could not be built`, error);
        pages = [messagePage(tab, 'details.failed', 'alert')];
      }
    } else {
      this.wanted = page;
      pages = [messagePage(tab, 'details.loading', 'status')];
      preloadDetailsTab(tab).catch((error: unknown) => {
        console.error(`The ${tab} tab could not be loaded`, error);
        if (this.dialog.open && this.tab === tab && !builders.has(tab)) this.showPieces([messagePage(tab, 'details.failed', 'alert')], 0);
      });
    }
    this.showPieces(pages, page);
    if (focusId) (document.getElementById(focusId) ?? this.panel).focus({ preventScroll: true });
  }

  private showPieces(pages: readonly DetailsPage[], page: number | string): void {
    this.leave();
    this.built = [];
    this.pieces = [];
    const available = this.panel.clientHeight;
    this.laidOutHeight = available;
    this.laidOutWidth = this.panel.clientWidth;
    const tabAtBuild = this.tab;
    pages.forEach((p, index) => {
      const built: BuiltPage = { id: p.id, starters: [] };
      this.built.push(built);
      const ctx: PageContext = {
        whileShown: (start) => built.starters.push(start),
        every: (ms, fn) =>
          built.starters.push(() => {
            fn();
            const timer = setInterval(fn, ms);
            return () => clearInterval(timer);
          }),
        refresh: () => {
          if (this.dialog.open && this.tab === tabAtBuild) this.relayout();
        },
        go: (tab, target) => this.render(tab, target ?? 0),
      };
      let node: Node;
      try {
        node = p.build(ctx);
      } catch (error) {
        console.error(`The page ${p.id} could not be built`, error);
        node = messagePage(this.tab, 'details.failed', 'alert').build(ctx);
      }
      const el = node instanceof HTMLElement ? node : h('section', { class: 'sheet-page' }, node);
      for (const [n, piece] of this.cut(el, available).entries()) this.pieces.push({ id: pieceId(p.id, n), page: index, el: piece });
    });
    let index = 0;
    if (typeof page === 'string') {
      const found = this.pieces.findIndex((piece) => piece.id === page);
      index = found >= 0 ? found : Math.max(0, this.pieces.findIndex((piece) => piece.id === pageOfPiece(page)));
    } else {
      index = page;
    }
    this.show(pageAfter(index, 0, this.pieces.length));
  }

  /**
   * Cuts a page into pieces that fit the panel, measuring its blocks in the panel itself (in the
   * same task, so nothing is painted in between). A paragraph of plain text that is taller than a
   * piece can hold is first cut between words.
   */
  private cut(el: HTMLElement, available: number): HTMLElement[] {
    if (available <= 0) return [el];
    this.panel.replaceChildren(el);
    const style = getComputedStyle(el);
    const px = (v: string) => Number.parseFloat(v) || 0;
    const chrome = px(style.paddingTop) + px(style.paddingBottom) + px(style.borderTopWidth) + px(style.borderBottomWidth);
    const room = available - chrome;
    const fits = el.scrollHeight <= available + 0.5 && el.getBoundingClientRect().height <= available + 0.5;
    if (fits || el.children.length < 2) {
      this.panel.replaceChildren();
      return [el];
    }
    const gap = px(style.rowGap);
    const isHead = (b: Element) => b.classList.contains('sheet-page__head');
    const headHeight = [...el.children].filter(isHead).reduce((sum, b) => sum + b.getBoundingClientRect().height + gap, 0);
    for (const block of [...el.children] as HTMLElement[]) {
      if (!isHead(block) && block.getBoundingClientRect().height > room - headHeight + 0.5) splitText(block, room - headHeight);
    }
    const blocks = [...el.children] as HTMLElement[];
    const heads = blocks.map(isHead);
    const heights = blocks.map((b) => b.getBoundingClientRect().height);
    this.panel.replaceChildren();
    const split = splitBlocks(heights, heads, gap, room);
    return split.map((indices, n) => {
      const piece = n === 0 ? el : (el.cloneNode(false) as HTMLElement);
      const head = blocks.filter((_, i) => heads[i]).map((b) => (n === 0 ? b : (b.cloneNode(true) as HTMLElement)));
      piece.replaceChildren(...head, ...indices.map((i) => blocks[i]!));
      piece.dataset.piece = String(n + 1);
      return piece;
    });
  }

  /** Shows piece `index` and starts its page's live parts. */
  private show(index: number): void {
    this.leave();
    this.page = index;
    const piece = this.pieces[index];
    this.panel.replaceChildren(piece ? piece.el : '');
    this.panel.dataset.page = piece?.id ?? '';
    this.pager.set(this.page, this.pieces.length);
    this.overflow = piece ? piece.el.scrollHeight > this.panel.clientHeight + 1 || piece.el.scrollWidth > this.panel.clientWidth + 1 : false;
    // Pieces cut for a panel of another size are cut again (the window changed meanwhile).
    if (this.overflow && (Math.abs(this.panel.clientHeight - this.laidOutHeight) > 1 || Math.abs(this.panel.clientWidth - this.laidOutWidth) > 1)) {
      requestAnimationFrame(() => {
        if (this.dialog.open) this.relayout();
      });
    }
    const built = piece ? this.built[piece.page] : undefined;
    for (const start of built?.starters ?? []) {
      try {
        const stop = start();
        if (stop) this.stops.push(stop);
      } catch (error) {
        console.error('A live part of a Details page failed', error);
      }
    }
  }

  private leave(): void {
    for (const stop of this.stops.splice(0)) {
      try {
        stop();
      } catch (error) {
        console.warn('Stopping a Details page failed', error);
      }
    }
  }

  private place(): void {
    const where = sheetPlacement(window.innerWidth, window.innerHeight, cameraSide());
    this.dialog.dataset.form = where.form;
    this.dialog.dataset.from = where.from;
  }

  private afterClose(): void {
    this.leave();
    const onClose = this.onClose;
    this.onClose = null;
    if (this.restoreFocus) {
      const target = this.trigger?.isConnected ? this.trigger : document.querySelector<HTMLElement>('.topbar__details');
      target?.focus({ preventScroll: true });
    }
    this.trigger = null;
    onClose?.();
  }

  private trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || this.confirm.open) return;
    const items = [...this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.closest('dialog.confirm') && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || !this.dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private buildConfirm(): HTMLDialogElement {
    const cancel = h('button', { type: 'button', class: 'btn btn--secondary' }, t('details.delete.cancel'));
    const confirmButton = h('button', { type: 'button', class: 'btn btn--danger' }, t('details.delete.confirm'));
    const dialog = h(
      'dialog',
      { class: 'confirm', role: 'alertdialog', 'aria-labelledby': 'details-delete-title', 'aria-describedby': 'details-delete-body' },
      h('h2', { class: 'confirm__title', id: 'details-delete-title' }, t('details.delete.title')),
      h('p', { id: 'details-delete-body' }, t('details.delete.body')),
      h('div', { class: 'confirm__actions' }, cancel, confirmButton),
    );
    cancel.addEventListener('click', () => dialog.close());
    confirmButton.addEventListener('click', () => {
      confirmButton.disabled = true;
      void deleteAllData()
        .then(() => {
          this.status.textContent = t('details.deleted');
          announce(t('details.deleted'));
        })
        .catch((error: unknown) => {
          // The storage handler words its error for the player ("The stored data could not be deleted: …").
          console.warn('Deleting the stored data failed', error);
          const message = error instanceof Error ? error.message : String(error);
          this.status.textContent = message;
          announce(message);
        })
        .finally(() => {
          confirmButton.disabled = false;
          if (dialog.open) dialog.close();
          // The tab shown may list what was just deleted.
          if (this.dialog.open) this.relayout();
        });
    });
    dialog.addEventListener('close', () => {
      if (this.dialog.open) this.dialog.querySelector<HTMLElement>('.sheet__delete')?.focus();
    });
    return dialog;
  }
}

let sheet: Sheet | null = null;

export function openDetails(opts: OpenDetailsOptions = {}): void {
  sheet ??= new Sheet();
  sheet.open(opts);
}

/** Opens Details → Results on "How we judge this" ("Rule of thumb · How we judge this", design §2.12). */
export function openHowWeJudge(trigger?: HTMLElement | null): void {
  openDetails({ tab: 'results', page: JUDGE_PAGE, trigger });
}

/** Closes the sheet; `restoreFocus: false` when the screen beneath is going away. */
export function closeDetails(opts: { restoreFocus?: boolean } = {}): void {
  sheet?.close(opts.restoreFocus ?? true);
}

export function isDetailsOpen(): boolean {
  return Boolean(sheet?.dialog.open);
}

export interface DetailsState {
  open: boolean;
  tab: DetailsTabId | null;
  /** 0-based page index. */
  page: number;
  pages: number;
  pageId: string | null;
  /** Every page of the tab, as shown by the pager (pieces of a cut page are `id~2`, `id~3`). */
  pageIds: string[];
  /** True when the page shown does not fit the panel (it is clipped): a defect. */
  overflow: boolean;
}

export function detailsState(): DetailsState {
  if (!sheet?.dialog.open) return { open: false, tab: null, page: 0, pages: 0, pageId: null, pageIds: [], overflow: false };
  return {
    open: true,
    tab: sheet.tab,
    page: sheet.page,
    pages: sheet.pieces.length,
    pageId: sheet.pieces[sheet.page]?.id ?? null,
    pageIds: sheet.pieces.map((p) => p.id),
    overflow: sheet.overflow,
  };
}
