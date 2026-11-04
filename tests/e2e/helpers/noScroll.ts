// The automated no-scroll check (spec §17.3.3, design §4.1): the document scrolls in neither
// direction, no visible element's box lies past the viewport (0.5 px tolerance), and every
// visible interactive element is at least 44 × 44 px (MOBILE.minTouchPx, §17.3.7).
import { expect, type Page } from '@playwright/test';

export interface NoScrollReport {
  scrollWidth: number;
  scrollHeight: number;
  innerWidth: number;
  innerHeight: number;
  /** Visible elements whose box (after their own clipping containers) passes the viewport. */
  outside: string[];
  /** Visible interactive elements under 44 × 44 px. */
  small: string[];
}

/** Waits for the web fonts and for any finite animation (the sheet sliding in), then measures. */
export async function noScrollReport(page: Page): Promise<NoScrollReport> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
  return page.evaluate(() => {
    const TOL = 0.5;
    const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])';
    const label = (el: Element, r: DOMRect) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''} [${r.left.toFixed(1)}, ${r.top.toFixed(1)}, ${r.right.toFixed(1)}, ${r.bottom.toFixed(1)}]`;
    };
    // The page-level containers clip whatever overflows them; only clipping inside a screen
    // (a stage, a card, the sheet's page) counts as intended.
    const isRoot = (el: Element) => el === document.documentElement || el === document.body || el.classList.contains('app') || el.id === 'app';
    const clippedRect = (el: Element): DOMRect | null => {
      const r = el.getBoundingClientRect();
      let left = r.left;
      let top = r.top;
      let right = r.right;
      let bottom = r.bottom;
      for (let p = el.parentElement; p && !isRoot(p); p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const c = p.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          left = Math.max(left, c.left);
          right = Math.min(right, c.right);
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, c.top);
          bottom = Math.min(bottom, c.bottom);
        }
      }
      return right - left > 1 && bottom - top > 1 ? new DOMRect(left, top, right - left, bottom - top) : null;
    };
    const outside: string[] = [];
    const small: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      // Visually hidden text (1 × 1 px, clipped) is for screen readers only.
      if (r.width <= 1 || r.height <= 1) continue;
      const shown = clippedRect(el);
      if (!shown) continue;
      if (shown.left < -TOL || shown.top < -TOL || shown.right > innerWidth + TOL || shown.bottom > innerHeight + TOL) outside.push(label(el, shown));
      if (el.matches(INTERACTIVE) && (r.width < 44 - TOL || r.height < 44 - TOL)) small.push(label(el, r));
    }
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight, innerWidth, innerHeight, outside, small };
  });
}

export async function expectNoScroll(page: Page, what = 'page'): Promise<void> {
  const report = await noScrollReport(page);
  expect(report.scrollWidth, `${what}: document width`).toBeLessThanOrEqual(report.innerWidth);
  expect(report.scrollHeight, `${what}: document height`).toBeLessThanOrEqual(report.innerHeight);
  expect(report.outside, `${what}: elements past the viewport`).toEqual([]);
  expect(report.small, `${what}: targets under 44 × 44 px`).toEqual([]);
}
