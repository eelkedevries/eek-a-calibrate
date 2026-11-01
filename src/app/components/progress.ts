// Download progress for the face model and the engines' files: one labelled <progress> per asset,
// added as the vision host reports it. A total of 0 (unknown size) shows an indeterminate bar.
import { h } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export const PROGRESS_CSS = `
.asset-progress { list-style: none; padding: 0; margin: var(--space-2) 0; max-width: var(--measure); }
.asset-progress li { display: grid; grid-template-columns: minmax(8rem, 1fr) 2fr auto; gap: var(--space-2); align-items: center; padding: var(--space-1) 0; }
.asset-progress progress { width: 100%; height: 0.9rem; accent-color: var(--accent); }
.asset-progress .asset-name { overflow-wrap: anywhere; font-size: 0.9rem; }
.asset-progress .asset-pct { font-variant-numeric: tabular-nums; font-size: 0.9rem; min-width: 3.5rem; text-align: right; }
`;

/** A readable name for an asset path or id: the file name without the hashed part. */
export function assetLabel(asset: string): string {
  const base = asset.split('/').pop() ?? asset;
  return base.replace(/-[A-Za-z0-9_-]{8}(?=\.)/, '');
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1);
}

export class AssetProgress {
  readonly el: HTMLUListElement;
  private readonly rows = new Map<string, { bar: HTMLProgressElement; pct: HTMLSpanElement }>();

  constructor(label: string) {
    this.el = h('ul', { class: 'asset-progress', 'aria-label': label });
  }

  update(asset: string, loaded: number, total: number): void {
    let row = this.rows.get(asset);
    if (!row) {
      const bar = h('progress', { max: 1, 'aria-label': assetLabel(asset) });
      const pct = h('span', { class: 'asset-pct' });
      row = { bar, pct };
      this.rows.set(asset, row);
      this.el.append(h('li', null, h('span', { class: 'asset-name' }, assetLabel(asset)), bar, pct));
    }
    if (total > 0 && Number.isFinite(total)) {
      const frac = Math.min(1, Math.max(0, loaded / total));
      row.bar.max = 1;
      row.bar.value = frac;
      row.pct.textContent = t('progress.of', { loaded: megabytes(loaded), total: megabytes(total), percent: Math.round(100 * frac) });
    } else {
      row.bar.removeAttribute('value');
      row.pct.textContent = t('progress.loaded', { loaded: megabytes(loaded) });
    }
  }

  /** Marks every listed asset as finished (the host reports no final 100 % for cached files). */
  complete(): void {
    for (const row of this.rows.values()) {
      row.bar.max = 1;
      row.bar.value = 1;
      row.pct.textContent = t('progress.done');
    }
  }

  get size(): number {
    return this.rows.size;
  }
}
