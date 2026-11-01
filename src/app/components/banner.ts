// A message strip for the setup, Live and Data screens: information, a warning or an error, with
// an optional dismiss button. Errors are announced at once (role alert), the rest politely.
import { h, type Child } from '../dom.ts';
import { t } from '../strings.en-GB.ts';

export type BannerKind = 'info' | 'ok' | 'warn' | 'error';

export const BANNER_CSS = `
.banner { border-left: 4px solid var(--border); background: var(--surface); padding: var(--space-2) var(--space-3); margin: var(--space-3) 0; border-radius: 0 var(--radius) var(--radius) 0; max-width: var(--measure); }
.banner p { margin: 0; }
.banner p + p { margin-top: var(--space-2); }
.banner.ok { border-left-color: var(--ok); }
.banner.warn { border-left-color: var(--warn); }
.banner.error { border-left-color: var(--danger); }
.banner .banner-kind { font-weight: 600; margin-right: var(--space-2); }
.banner .banner-dismiss { margin-top: var(--space-2); min-height: 44px; }
`;

export interface BannerOptions {
  /** Shows a Dismiss button; the banner removes itself and then calls this. */
  onDismiss?: () => void;
}

/** A banner; its kind is written out as a word too, so colour is never the only cue. */
export function banner(kind: BannerKind, content: Child | readonly Child[], opts: BannerOptions = {}): HTMLDivElement {
  const parts = Array.isArray(content) ? content : [content];
  const el = h(
    'div',
    { class: `banner ${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('p', null, h('span', { class: 'banner-kind' }, t(`banner.${kind}`)), ...parts),
  );
  if (opts.onDismiss) {
    const onDismiss = opts.onDismiss;
    el.append(
      h('button', { type: 'button', class: 'secondary banner-dismiss', onclick: () => { el.remove(); onDismiss(); } }, t('banner.dismiss')),
    );
  }
  return el;
}
