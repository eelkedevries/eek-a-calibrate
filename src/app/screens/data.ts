// #/data (specification §7 screen 8, §4.15, §4.16, §14.1.6, §15.2.2): the export zip, the stored
// calibrations (profiles) and session summaries; restoring a profile, which forces a VAL6 check in
// Live; "Delete all my data"; and the optional screen and distance measurement. The export and the
// summaries are built by Details → Data (src/app/details/data.ts), which this v1 screen calls
// until prompt 018 removes it.
import { ESTIMATOR_NAMES } from '../../core/calibration/select.ts';
import { viewportDiagonalPx } from '../../core/geometry/screen.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { EstimatorId } from '../../core/types.ts';
import { deleteProfile, deleteSession, listProfiles, listSessions, onDataDeleted, onStorageStatus, storageStatus, type ProfileRecord, type SessionRecord } from '../../platform/storage.ts';
import { BANNER_CSS, banner } from '../components/banner.ts';
import { buildSessionExport, download, exportAvailability, profileSummary, storeSessionSummary } from '../details/data.ts';
import { announce, h } from '../dom.ts';
import type { Screen, ScreenContext } from '../router.ts';
import { currentValidationRun } from '../session.ts';
import { deleteAllData, getState, subscribe } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { restoreProfile, sessionRecords } from './live.ts';
import { SETUP_CSS } from './welcome.ts';

export { buildSessionExport, exportAvailability, type Omission, type SessionExport } from '../details/data.ts';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ----- The screen -------------------------------------------------------------------------

const DATA_CSS = `
.data-page .item-list { list-style: none; padding: 0; display: grid; gap: var(--space-2); max-width: var(--measure); }
.data-page .item-list li { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); }
.data-page .item-list .key { font-family: var(--font-mono); font-size: 0.75rem; color: var(--muted); overflow-wrap: anywhere; }
.data-page .item-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.data-page .item-actions button { min-height: 44px; }
.data-page .file-list { font-size: 0.9rem; }
`;

class DataScreen {
  private readonly ctx: ScreenContext;
  private readonly storage = h('div');
  private readonly exportBox = h('div');
  private readonly profiles = h('ul', { class: 'item-list' });
  private readonly sessions = h('ul', { class: 'item-list' });
  private readonly datasetBox: HTMLInputElement;
  private readonly offs: (() => void)[] = [];
  private mounted = true;

  constructor(root: HTMLElement, ctx: ScreenContext) {
    this.ctx = ctx;
    this.datasetBox = h('input', { type: 'checkbox', id: 'data-dataset' });
    root.append(
      h('style', null, SETUP_CSS + BANNER_CSS + DATA_CSS),
      h(
        'div',
        { class: 'setup data-page' },
        h('h1', null, t('route.data')),
        h('p', { class: 'lead' }, t('data.lead')),
        this.storage,
        h(
          'section',
          null,
          h('h2', null, t('data.export.title')),
          h('p', null, t('data.export.body')),
          h('label', { class: 'choice', for: 'data-dataset' }, this.datasetBox, h('span', null, t('data.export.dataset'), h('small', null, t('data.export.datasetNote')))),
          this.exportBox,
        ),
        h(
          'section',
          null,
          h('h2', null, t('data.geometry.title')),
          h('p', null, t('data.geometry.body')),
          h('p', null, h('a', { href: '#/screen?from=data', class: 'button secondary' }, t('results.approx.measure'))),
        ),
        h('section', null, h('h2', null, t('data.profiles.title')), h('p', null, t('data.profiles.body')), this.profiles),
        h('section', null, h('h2', null, t('data.sessions.title')), h('p', null, t('data.sessions.body')), this.sessions),
        h(
          'section',
          null,
          h('h2', null, t('data.delete.title')),
          h('p', null, t('data.delete.body')),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'secondary', onclick: () => void this.deleteAll() }, t('footer.deleteAll'))),
        ),
      ),
    );
    // The footer's "Delete all my data" also empties this page's lists and its export.
    this.offs.push(
      onStorageStatus(() => this.renderStorage()),
      onDataDeleted(() => void this.refresh()),
      subscribe((s) => {
        if (!s.fit) this.renderExport();
      }),
    );
    this.renderStorage();
    this.renderExport();
    void this.refresh();
  }

  private renderStorage(): void {
    const s = storageStatus();
    this.storage.replaceChildren(...(s.warning ? [banner('warn', [t('storage.memory'), ' ', s.warning])] : []));
  }

  private renderExport(message?: Node): void {
    const available = exportAvailability();
    if (!available.ok) {
      this.exportBox.replaceChildren(h('p', { class: 'note' }, available.reason), message ?? '');
      return;
    }
    const button = h('button', { type: 'button', onclick: () => void this.export(button) }, t('data.export.button'));
    const records = sessionRecords();
    const items = [
      getState().calibration || records?.base?.calibration ? t('data.export.has.calibration') : null,
      (records?.base?.validation ?? currentValidationRun()) ? t('data.export.has.validation') : null,
      records && records.blocks.length > 0 ? t('data.export.has.blocks', { n: records.blocks.length }) : null,
    ].filter((x): x is string => x !== null);
    const g = getState().geometry;
    this.exportBox.replaceChildren(
      items.length > 0 ? h('ul', null, ...items.map((x) => h('li', null, x))) : '',
      g?.degreesApproximate ? h('p', { class: 'note' }, t('data.export.approximate')) : '',
      h('div', { class: 'actions' }, button, records && this.storeSessionButton()),
      message ?? '',
    );
  }

  private storeSessionButton(): HTMLButtonElement {
    return h(
      'button',
      {
        type: 'button',
        class: 'secondary',
        onclick: async () => {
          try {
            await this.storeSession();
            this.renderExport(banner('ok', t('data.sessions.stored')));
            await this.refresh();
          } catch (error) {
            this.renderExport(banner('error', t('data.sessions.storeFailed', { message: errorText(error) })));
          }
        },
      },
      t('data.sessions.store'),
    );
  }

  /** Stores this session's summary, with its per-frame features when the box is ticked (opt-in, §4.15). */
  private storeSession(): Promise<void> {
    return storeSessionSummary(this.datasetBox.checked);
  }

  private async export(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const out = await buildSessionExport({ includeDataset: this.datasetBox.checked });
      if (!this.mounted) return;
      download(out.name, out.zip);
      const summary = [
        h('p', null, t('data.export.done', { name: out.name, n: out.files.length })),
        h('ul', { class: 'file-list' }, ...out.files.map((f) => h('li', null, f.name))),
        ...out.omitted.map((o) => h('p', null, t('data.export.omitted', { file: o.file, reason: o.reason }))),
      ];
      this.renderExport(banner(out.omitted.length > 0 ? 'warn' : 'ok', summary));
      announce(t('data.export.done', { name: out.name, n: out.files.length }));
    } catch (error) {
      console.error('The export failed', error);
      if (this.mounted) this.renderExport(banner('error', t('data.export.failed', { message: errorText(error) })));
    } finally {
      button.disabled = false;
    }
  }

  private async refresh(): Promise<void> {
    let profiles: ProfileRecord[] = [];
    let sessions: SessionRecord[] = [];
    try {
      [profiles, sessions] = await Promise.all([listProfiles(), listSessions()]);
    } catch (error) {
      console.warn('Stored data could not be listed', error);
    }
    if (!this.mounted) return;
    this.profiles.replaceChildren(
      ...(profiles.length === 0
        ? [h('li', { class: 'note' }, t('data.profiles.none'))]
        : profiles.map((p) =>
            h(
              'li',
              { 'data-profile': p.key },
              h('strong', null, t('data.profile.title', { date: new Date(p.savedAt).toLocaleString('en-GB'), pid: p.participant || '—', session: p.session || '—' })),
              h('p', null, profileSummary(p)),
              h('p', null, t('data.profile.engines', { list: ENGINE_IDS.filter((e) => p.fit.fits[e]).map((e) => ESTIMATOR_NAMES[e]).join(', '), used: new Date(p.lastUsedAt).toLocaleString('en-GB') })),
              h('p', { class: 'key' }, p.key),
              h(
                'div',
                { class: 'item-actions' },
                h('button', { type: 'button', onclick: () => this.restore(p) }, t('data.profile.use')),
                h('button', { type: 'button', class: 'secondary', onclick: () => void this.removeProfile(p) }, t('data.delete.one')),
              ),
            ),
          )),
    );
    this.sessions.replaceChildren(
      ...(sessions.length === 0
        ? [h('li', { class: 'note' }, t('data.sessions.none'))]
        : sessions.map((s) => {
            const r = s.reports.find((x) => x.mode === 'own' && x.estimator === s.estimator);
            const diag = s.geometry ? viewportDiagonalPx(s.geometry.screen) : Number.NaN;
            const accuracy = r && Number.isFinite(diag) ? `${((r.accuracyPctDiag / 100) * diag).toFixed(0)} px · ${r.accuracyPctDiag.toFixed(1)} %` : '—';
            return h(
              'li',
              null,
              h('strong', null, t('data.session.title', { date: new Date(s.updatedAt).toLocaleString('en-GB'), pid: s.participant || '—', session: s.session || '—' })),
              h('p', null, t('data.session.summary', { name: s.estimator ? (ESTIMATOR_NAMES[s.estimator as EstimatorId] ?? s.estimator) : '—', accuracy, verdict: r ? t(`results.verdict.${r.verdict}`) : '—', checks: s.driftLog.length })),
              s.dataset ? h('p', { class: 'note' }, t('data.session.dataset')) : '',
              h('div', { class: 'item-actions' }, h('button', { type: 'button', class: 'secondary', onclick: () => void this.removeSession(s) }, t('data.delete.one'))),
            );
          })),
    );
  }

  private restore(p: ProfileRecord): void {
    try {
      restoreProfile(p);
    } catch (error) {
      this.renderExport(banner('error', errorText(error)));
      return;
    }
    this.ctx.navigate('live');
  }

  private async removeProfile(p: ProfileRecord): Promise<void> {
    if (!window.confirm(t('data.profile.deleteConfirm'))) return;
    await deleteProfile(p.key).catch((error: unknown) => console.warn(error));
    await this.refresh();
    announce(t('data.deleted'));
  }

  private async removeSession(s: SessionRecord): Promise<void> {
    if (!window.confirm(t('data.session.deleteConfirm'))) return;
    await deleteSession(s.id).catch((error: unknown) => console.warn(error));
    await this.refresh();
    announce(t('data.deleted'));
  }

  private async deleteAll(): Promise<void> {
    if (!window.confirm(t('footer.deleteConfirm'))) return;
    try {
      await deleteAllData();
      announce(t('footer.deleted'));
      this.renderExport(banner('ok', t('footer.deleted')));
    } catch (error) {
      this.renderExport(banner('error', errorText(error)));
    }
    await this.refresh();
  }

  unmount(): void {
    this.mounted = false;
    for (const off of this.offs.splice(0)) off();
  }
}

const view: Screen = {
  mount(root, ctx) {
    const s = new DataScreen(root, ctx);
    return () => s.unmount();
  },
};

export default view;
