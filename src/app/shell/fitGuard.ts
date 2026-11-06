// The fit guard (design §4.1 rule 11): each region degrades on its own ladder until its content
// fits, so nothing is ever cut off or scrolls. A region's tier is its `data-fit` attribute (0 =
// everything shown); CSS hides what each tier drops. The check runs on every resize of the
// region, when the web fonts arrive, and when the root text size changes (the reader enlarges
// the text with the page open), both of which change text widths without a resize.

/** The lowest tier at which `fitsAt` holds, or `maxTier` when none does. */
export function pickTier(maxTier: number, fitsAt: (tier: number) => boolean): number {
  for (let tier = 0; tier < maxTier; tier++) if (fitsAt(tier)) return tier;
  return maxTier;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * True when the boxes lie inside `frame` (within `tolerance`) and, taken left to right, keep at
 * least `minGap` between neighbours.
 */
export function boxesFitInRow(frame: Box, boxes: readonly Box[], minGap = 0, tolerance = 0.5): boolean {
  const sorted = [...boxes].sort((a, b) => a.left - b.left);
  for (const [i, box] of sorted.entries()) {
    if (box.left < frame.left - tolerance || box.right > frame.right + tolerance) return false;
    if (box.top < frame.top - tolerance || box.bottom > frame.bottom + tolerance) return false;
    const next = sorted[i + 1];
    if (next && box.right + minGap > next.left + tolerance) return false;
  }
  return true;
}

/** A region fits when its content neither overflows it nor is wider or taller than it. */
export function contentFits(el: HTMLElement): boolean {
  return el.scrollWidth <= el.clientWidth + 0.5 && el.scrollHeight <= el.clientHeight + 0.5;
}

/** A row fits when its visible children stay inside it without overlapping (top bars, dock rows). */
export function childrenFitInRow(row: HTMLElement, minGap = 8): boolean {
  const boxes = [...row.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.getClientRects().length > 0)
    .map((child) => child.getBoundingClientRect());
  return boxesFitInRow(row.getBoundingClientRect(), boxes, minGap);
}

export interface FitGuardOptions {
  /** The last tier of the region's ladder. */
  maxTier: number;
  /** Whether the region's content fits at the tier currently applied. */
  fits(el: HTMLElement): boolean;
  /** Called after each check with the tier chosen. */
  onTier?(tier: number): void;
}

const remChecks = new Set<() => void>();
let remProbe: HTMLElement | null = null;

/** Calls every guard's check when 1 rem changes size: a hidden 1 rem square, observed. */
function watchRem(check: () => void): () => void {
  remChecks.add(check);
  if (!remProbe?.isConnected) {
    remProbe = document.createElement('span');
    remProbe.setAttribute('aria-hidden', 'true');
    remProbe.style.cssText = 'position:absolute;inset-block-start:0;inset-inline-start:0;inline-size:1rem;block-size:1rem;visibility:hidden;pointer-events:none;contain:strict';
    document.body.append(remProbe);
    let first = true;
    new ResizeObserver(() => {
      if (first) first = false;
      else for (const fn of [...remChecks]) fn();
    }).observe(remProbe);
  }
  return () => remChecks.delete(check);
}

/**
 * Keeps `el` at the lowest tier that fits. Observe only regions whose size the layout sets (a
 * grid cell, a fixed-height bar), so that a change of tier cannot resize the region itself.
 * Returns a function that stops the guard.
 */
export function fitGuard(el: HTMLElement, opts: FitGuardOptions): () => void {
  let stopped = false;
  const check = () => {
    if (stopped || !el.isConnected) return;
    const tier = pickTier(opts.maxTier, (candidate) => {
      el.dataset.fit = String(candidate);
      return opts.fits(el);
    });
    el.dataset.fit = String(tier);
    opts.onTier?.(tier);
  };
  const observer = new ResizeObserver(check);
  observer.observe(el);
  const fonts = document.fonts;
  fonts?.addEventListener('loadingdone', check);
  void fonts?.ready.then(check);
  const stopRem = watchRem(check);
  check();
  return () => {
    stopped = true;
    observer.disconnect();
    fonts?.removeEventListener('loadingdone', check);
    stopRem();
  };
}
