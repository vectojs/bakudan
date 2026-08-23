/**
 * Fullscreen plumbing for the app shell.
 *
 * ## Why this lives beside KeyboardShortcuts rather than in @vectojs/danmaku-kit
 *
 * The kit owns control-surface chrome but exposes no generic action slot on
 * `DanmakuCommandDeck` (verified read-only against 0.6.0), and fullscreen is an
 * application-shell concern: it targets the whole document so both canvas
 * layers (`#bakudan-bg`, `#bakudan-canvas`) and every projected element stay
 * visible. Like the shortcut layer, this module reads only what the engine does
 * not expose and funnels state changes through `App` methods, so behaviour
 * stays testable without a real fullscreen implementation.
 */

type LegacyFullscreenDocument = Document &
  Partial<{
    webkitFullscreenElement: Element | null;
    webkitExitFullscreen: () => Promise<void> | void;
  }>;

type LegacyFullscreenElement = Element &
  Partial<{ webkitRequestFullscreen: () => Promise<void> | void }>;

/** The element currently presented fullscreen, following the webkit prefix. */
export function fullscreenElementOf(doc: Document): Element | null {
  const legacy = doc as LegacyFullscreenDocument;
  return doc.fullscreenElement ?? legacy.webkitFullscreenElement ?? null;
}

/**
 * Request fullscreen for `el`, returning false when the API is unavailable at
 * all (e.g. iOS Safari for non-video elements). Promise rejections are NOT
 * caught here — per spec they dispatch `fullscreenerror`, which
 * {@link installFullscreenListeners} surfaces to the app.
 */
export function requestFullscreenOn(el: Element): boolean {
  if (typeof el.requestFullscreen === 'function') {
    void el.requestFullscreen().catch(() => {});
    return true;
  }
  const legacy = el as LegacyFullscreenElement;
  if (typeof legacy.webkitRequestFullscreen === 'function') {
    legacy.webkitRequestFullscreen();
    return true;
  }
  return false;
}

/** Exit fullscreen, following the webkit prefix; no-op when unsupported. */
export function exitFullscreenIn(doc: Document): void {
  if (typeof doc.exitFullscreen === 'function') {
    void doc.exitFullscreen().catch(() => {});
    return;
  }
  const legacy = doc as LegacyFullscreenDocument;
  if (typeof legacy.webkitExitFullscreen === 'function') {
    legacy.webkitExitFullscreen();
  }
}

export interface FullscreenHandlers {
  /** Called after any change event with whether an element is now fullscreen. */
  onChange(active: boolean): void;
  /** Called on fullscreenerror — e.g. gesture or persistence rejections. */
  onError(): void;
}

/**
 * Install `fullscreenchange`/`fullscreenerror` listeners (with their webkit
 * fallbacks) on `doc`. Returns a disposer; call it from the owner's destroy()
 * so a re-mounted app does not accumulate listeners.
 */
export function installFullscreenListeners(
  doc: Document,
  handlers: FullscreenHandlers,
): () => void {
  const onChange = (): void => handlers.onChange(fullscreenElementOf(doc) !== null);
  const onError = (): void => handlers.onError();
  doc.addEventListener('fullscreenchange', onChange);
  doc.addEventListener('webkitfullscreenchange', onChange);
  doc.addEventListener('fullscreenerror', onError);
  doc.addEventListener('webkitfullscreenerror', onError);
  return () => {
    doc.removeEventListener('fullscreenchange', onChange);
    doc.removeEventListener('webkitfullscreenchange', onChange);
    doc.removeEventListener('fullscreenerror', onError);
    doc.removeEventListener('webkitfullscreenerror', onError);
  };
}
