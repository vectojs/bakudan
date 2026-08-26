import '../../styles/header.css';
import { BAKUDAN_THEME, cinemaLabelsFor } from '../cinemaConfig';
import type { Language } from '../../model/i18n';

export type StatusKind = 'loading' | 'error' | 'stress' | 'paused' | 'video';

export interface StatusState {
  kind: StatusKind;
  videoTitle?: string;
  trackProfileLabel?: string;
  fps: number;
  frameTime?: number;
  liveCount: number;
  capacity: number;
  backend: string;
  language: Language;
}

export interface HeaderBarOptions {
  getState: () => StatusState;
  onLangChange?: (language: Language) => void;
}

/**
 * Vanilla HTML header that replaces DanmakuStatusBar (canvas) for phase 2.
 * Mounts into #bakudan-header (already a <header> in index.html).
 *
 * Maps BAKUDAN_THEME tokens to CSS vars (--bakudan-surface, etc.) so
 * header.css never hardcodes a palette value. Keeps status always visible;
 * the canvas 22% quietOpacity logic remains canvas-only.
 */
export class HeaderBar {
  private readonly container: HTMLElement;
  private readonly opts: HeaderBarOptions;
  private readonly root: HTMLElement;
  private readonly wordmarkEl: HTMLElement;
  private readonly pillEl: HTMLElement;
  private readonly videoEl: HTMLElement;
  private readonly trackEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly frameEl: HTMLElement;
  private readonly liveEl: HTMLElement;
  private readonly backendEl: HTMLElement;
  private destroyed = false;

  constructor(container: HTMLElement, opts: HeaderBarOptions) {
    this.container = container;
    this.opts = opts;

    // Map theme tokens to CSS vars — header.css reads these, never hardcodes.
    // Keep the surface fully opaque per BAKUDAN_THEME.surface (rgba 7,9,13,1);
    // the CSS pairs it with backdrop-filter for future glass without reintroducing
    // the 0.97 translucency defect.
    container.style.setProperty('--bakudan-surface', BAKUDAN_THEME.surface);
    container.style.setProperty('--bakudan-surface-raised', BAKUDAN_THEME.surfaceRaised);
    container.style.setProperty('--bakudan-border', BAKUDAN_THEME.border);
    container.style.setProperty('--bakudan-text', BAKUDAN_THEME.text);
    container.style.setProperty('--bakudan-text-muted', BAKUDAN_THEME.textMuted);
    container.style.setProperty('--bakudan-accent', BAKUDAN_THEME.accent);
    container.style.setProperty('--bakudan-signal', BAKUDAN_THEME.signal);
    container.style.setProperty('--bakudan-focus-ring', BAKUDAN_THEME.focusRing);
    // Font tokens: Inter for UI, JetBrains Mono for metrics per cinemaConfig.ts
    container.style.setProperty('--bakudan-font-ui', BAKUDAN_THEME.fontUi);
    container.style.setProperty('--bakudan-font-mono', BAKUDAN_THEME.fontMono);
    container.style.setProperty('--bakudan-font-label', BAKUDAN_THEME.fontLabel);
    container.style.setProperty('--bakudan-font-display', BAKUDAN_THEME.fontDisplay);

    // Ensure container is identifiable for CSS (index.html already has #bakudan-header)
    container.classList.add('bakudan-header-host');

    // Root flex container inside the semantic <header>
    this.root = document.createElement('div');
    this.root.className = 'bakudan-header';
    this.root.setAttribute('role', 'banner');

    // Left: wordmark + status pill
    const left = document.createElement('div');
    left.className = 'bakudan-header__left';

    this.wordmarkEl = document.createElement('span');
    this.wordmarkEl.className = 'bakudan-header__wordmark';
    this.wordmarkEl.textContent = 'Bakudan';

    this.pillEl = document.createElement('span');
    this.pillEl.className = 'bakudan-header__pill';
    this.pillEl.setAttribute('role', 'status');
    this.pillEl.setAttribute('aria-live', 'polite');
    // Data attribute drives kind-specific styling without hardcoding colors
    this.pillEl.dataset.kind = 'video';

    left.append(this.wordmarkEl, this.pillEl);

    // Center: video / track labels (optional, may be empty)
    const center = document.createElement('div');
    center.className = 'bakudan-header__center';

    this.videoEl = document.createElement('span');
    this.videoEl.className = 'bakudan-header__video';
    this.videoEl.dataset.testid = 'video-title';

    this.trackEl = document.createElement('span');
    this.trackEl.className = 'bakudan-header__track';
    this.trackEl.dataset.testid = 'track-label';

    center.append(this.videoEl, this.trackEl);

    // Right: metrics (fps, frameTime, live/capacity, backend)
    const right = document.createElement('div');
    right.className = 'bakudan-header__right bakudan-header__metrics';

    this.fpsEl = document.createElement('span');
    this.fpsEl.className = 'bakudan-header__metric bakudan-header__metric--fps';
    // JetBrains Mono per cinemaConfig.ts fontMono

    this.frameEl = document.createElement('span');
    this.frameEl.className = 'bakudan-header__metric bakudan-header__metric--frame secondary';
    this.frameEl.dataset.testid = 'frame-time';

    this.liveEl = document.createElement('span');
    this.liveEl.className = 'bakudan-header__metric bakudan-header__metric--live';
    this.liveEl.dataset.testid = 'live-count';

    this.backendEl = document.createElement('span');
    this.backendEl.className = 'bakudan-header__metric bakudan-header__metric--backend secondary';
    this.backendEl.dataset.testid = 'backend';

    right.append(this.fpsEl, this.frameEl, this.liveEl, this.backendEl);

    this.root.append(left, center, right);
    this.container.replaceChildren(this.root);

    // Initial render from getState() so mount is never empty
    try {
      this.update(this.opts.getState());
    } catch {
      // getState may throw in tests before App is fully wired; ignore
    }
  }

  update(state: StatusState): void {
    if (this.destroyed) return;

    // Normalize aliases so callers can pass kind/statusKind/state
    const raw = state as unknown as Record<string, unknown>;
    const kind = (raw.kind ?? raw.statusKind ?? raw.state ?? 'video') as StatusKind;
    const language = (raw.language ?? 'en') as Language;
    const labels = cinemaLabelsFor(language);
    const statusText = labels.kit.status[kind] ?? kind;

    // Wordmark respects i18n product name (EN "Bakudan", zh-CN "Bakudan 弹幕")
    this.wordmarkEl.textContent = labels.kit.product;

    // Pill: localized text, class per kind, aria-label for screen readers
    this.pillEl.textContent = statusText;
    this.pillEl.dataset.kind = kind;
    this.pillEl.className = `bakudan-header__pill bakudan-header__pill--${kind}`;
    this.pillEl.setAttribute('role', 'status');
    this.pillEl.setAttribute('aria-live', 'polite');
    // Keep a11y parity: t('status.${kind}') equivalent is the localized label
    this.pillEl.setAttribute('aria-label', statusText);

    // Video / track labels — hidden when empty to avoid stray separators
    const videoTitle = (raw.videoTitle as string | undefined) ?? '';
    const trackLabel = (raw.trackProfileLabel as string | undefined) ?? '';

    this.videoEl.textContent = videoTitle;
    this.videoEl.style.display = videoTitle ? '' : 'none';
    this.videoEl.title = videoTitle;

    this.trackEl.textContent = trackLabel;
    this.trackEl.style.display = trackLabel ? '' : 'none';
    this.trackEl.title = trackLabel;

    // Metrics: fps (always visible), frameTime + backend are secondary (hidden <768px via CSS)
    const fps = typeof raw.fps === 'number' ? (raw.fps as number) : 0;
    const frameTime = typeof raw.frameTime === 'number' ? (raw.frameTime as number) : undefined;
    const liveCount = (raw.liveCount ?? raw.active ?? 0) as number;
    const capacity = (raw.capacity ?? 0) as number;
    const backend = (raw.backend as string | undefined) ?? '';

    // fpsSummary parity: `${fps} FPS` with localized helper, but keep deterministic for tests
    const fpsText = labels.kit.status.fpsSummary(fps);
    this.fpsEl.textContent = fpsText;
    this.fpsEl.setAttribute('aria-label', `${fps} frames per second`);
    // Keep JetBrains Mono metric styling via CSS class; no inline font needed

    if (frameTime !== undefined && Number.isFinite(frameTime)) {
      this.frameEl.textContent = `${frameTime.toFixed(1)} ms`;
      this.frameEl.setAttribute('aria-label', `frame time ${frameTime.toFixed(1)} milliseconds`);
      this.frameEl.style.display = '';
    } else {
      this.frameEl.textContent = '';
      this.frameEl.style.display = 'none';
    }

    const liveText = labels.kit.status.activeSummary(liveCount, capacity);
    this.liveEl.textContent = liveText;
    this.liveEl.setAttribute('aria-label', `${liveCount} of ${capacity} live`);

    this.backendEl.textContent = backend;
    this.backendEl.setAttribute('aria-label', `backend ${backend}`);
    this.backendEl.style.display = backend ? '' : 'none';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
    this.container.classList.remove('bakudan-header-host');
    // Do not clear CSS vars — container may be reused; leave them for inspection
  }
}
