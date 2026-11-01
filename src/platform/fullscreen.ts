// Fullscreen helpers (spec §4.1 pause conditions, §4.7 presentation), with the
// WebKit-prefixed API that Safari still needs. In test mode (`?e2e=1`) the
// screens skip fullscreen altogether (window.__eek.skipFullscreen).

type PrefixedDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type PrefixedElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function fullscreenSupported(): boolean {
  const el = document.documentElement as PrefixedElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function fullscreenElement(): Element | null {
  const doc = document as PrefixedDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function isFullscreen(): boolean {
  return fullscreenElement() !== null;
}

/** Requests fullscreen; resolves false when it is unsupported or refused (it needs a user gesture). */
export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<boolean> {
  if (isFullscreen()) return true;
  const target = el as PrefixedElement;
  try {
    if (typeof target.requestFullscreen === 'function') await target.requestFullscreen({ navigationUI: 'hide' });
    else if (typeof target.webkitRequestFullscreen === 'function') await target.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  return isFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  const doc = document as PrefixedDocument;
  try {
    if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen();
    else await doc.webkitExitFullscreen?.();
  } catch {
    // Already leaving fullscreen (for example after Esc): nothing to undo.
  }
}

/** Calls `listener(isFullscreen)` on every fullscreen change. */
export function onFullscreenChange(listener: (fullscreen: boolean) => void): () => void {
  const handler = (): void => listener(isFullscreen());
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}
