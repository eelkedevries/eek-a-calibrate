// The Details sheet (design §2.17, §4.7; spec §17.2.1): every expert feature in one modal
// <dialog>, opened from the top bar of every screen (and, later, the Pause card) or from
// `#/details/<tab>`, without changing the route. A bottom sheet on windows under 600 px wide
// and at least 480 px tall, a side sheet otherwise. Five tabs, one page at a time, never
// scrolling; "Delete all my data" behind a confirmation in the footer of every tab. Prompt 017
// fills the tabs through `registerDetailsTab`; until then each tab shows one placeholder page.
import { announce, h } from '../dom.ts';
import { deleteAllData } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { registerFixture } from '../testHooks.ts';
import { cameraSide } from './appShell.ts';
import { icon } from './icons.ts';
import { createPager, pageAfter, type Pager } from './pager.ts';

export const DETAILS_TABS = ['results', 'settings', 'data', 'device', 'about'] as const;
export type DetailsTabId = (typeof DETAILS_TABS)[number];

export function isDetailsTab(value: string): value is DetailsTabId {
  return (DETAILS_TABS as readonly string[]).includes(value);
}

export interface DetailsPage {
  /** Stable within its tab, so that a caller can open the sheet on it ("How we judge this"). */
  id: string;
  build(): Node;
}

/** Builds a tab's pages; called each time the tab is shown, so the pages show current values. */
export type BuildPages = () => readonly DetailsPage[];

const builders = new Map<DetailsTabId, BuildPages>();

/** Gives a tab its pages (prompt 017). A tab without a builder shows a placeholder page. */
export function registerDetailsTab(id: DetailsTabId, buildPages: BuildPages): void {
  builders.set(id, buildPages);
  if (sheet?.dialog.open && sheet.tab === id) sheet.render(id, 0);
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

const LEGACY_PAGES: Partial<Record<DetailsTabId, string>> = {
  results: '#/results',
  data: '#/data',
  device: '#/lab',
  about: '#/about',
};

function placeholderPages(tab: DetailsTabId, count = 1): readonly DetailsPage[] {
  const legacy = LEGACY_PAGES[tab];
  return Array.from({ length: count }, (_, i) => ({
    id: count === 1 ? 'placeholder' : `placeholder-${i + 1}`,
    build: () =>
      h(
        'section',
        { class: 'sheet-page' },
        h('h3', { class: 'sheet-page__title' }, t(`details.tab.${tab}`)),
        h('p', { class: 'sheet-page__body' }, t('details.placeholder')),
        legacy ? h('a', { class: 'btn btn--secondary', href: legacy }, t(`details.placeholder.${tab}`)) : null,
      ),
  }));
}

// For the tests (`?e2e=1&fixture=sheet-pages`): three pages in every tab, so that the pager shows.
registerFixture('sheet-pages', () => {
  for (const tab of DETAILS_TABS) if (!builders.has(tab)) registerDetailsTab(tab, () => placeholderPages(tab, 3));
});

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

class Sheet {
  readonly dialog: HTMLDialogElement;
  tab: DetailsTabId = 'about';
  page = 0;
  pages: readonly DetailsPage[] = [];
  private readonly tabs: HTMLButtonElement[];
  private readonly panel: HTMLElement;
  private readonly pager: Pager;
  private readonly status: HTMLElement;
  private readonly confirm: HTMLDialogElement;
  private trigger: HTMLElement | null = null;
  private onClose: (() => void) | null = null;
  private restoreFocus = true;

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
    this.pager = createPager((delta) => this.render(this.tab, pageAfter(this.page, delta, this.pages.length)));
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
    window.addEventListener('resize', () => {
      if (this.dialog.open) this.place();
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
    this.render(opts.tab ?? this.tab, opts.page ?? 0);
    if (!this.dialog.open) this.dialog.showModal();
    this.tabs[DETAILS_TABS.indexOf(this.tab)]!.focus();
  }

  close(restoreFocus = true): void {
    if (!this.dialog.open) return;
    this.restoreFocus = restoreFocus;
    if (this.confirm.open) this.confirm.close();
    this.dialog.close();
  }

  render(tab: DetailsTabId, page: number | string): void {
    this.tab = tab;
    this.pages = (builders.get(tab) ?? (() => placeholderPages(tab)))();
    const byId = typeof page === 'string' ? this.pages.findIndex((p) => p.id === page) : page;
    this.page = pageAfter(byId < 0 ? 0 : byId, 0, this.pages.length);
    this.tabs.forEach((button, i) => {
      const selected = DETAILS_TABS[i] === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    this.panel.setAttribute('aria-labelledby', `details-tab-${tab}`);
    const current = this.pages[this.page];
    this.panel.replaceChildren(current ? current.build() : '');
    this.panel.dataset.page = current?.id ?? '';
    this.pager.set(this.page, this.pages.length);
  }

  private place(): void {
    const where = sheetPlacement(window.innerWidth, window.innerHeight, cameraSide());
    this.dialog.dataset.form = where.form;
    this.dialog.dataset.from = where.from;
  }

  private afterClose(): void {
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
}

export function detailsState(): DetailsState {
  if (!sheet?.dialog.open) return { open: false, tab: null, page: 0, pages: 0, pageId: null };
  return { open: true, tab: sheet.tab, page: sheet.page, pages: sheet.pages.length, pageId: sheet.pages[sheet.page]?.id ?? null };
}
