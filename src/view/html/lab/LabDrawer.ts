import { BAKUDAN_THEME } from '../../cinemaConfig';

export type LabTabId = 'videos' | 'throughput' | 'benchmark' | 'interactions' | 'devtools';

export interface LabPanelRef {
  element: HTMLElement;
  setState?: (state: unknown) => void;
  destroy: () => void;
}

export interface LabDrawerHTMLOptions {
  open: boolean;
  activeTab: LabTabId;
  onOpenChange: (open: boolean) => void;
  onActiveTabChange: (tabId: LabTabId) => void;
  panels: { id: LabTabId; label: string; panel: LabPanelRef }[];
  modal?: boolean;
  labels?: {
    title?: string;
    close?: string;
  };
}

/**
 * Help descriptions for each lab tab — shown in the help popup (? button).
 * Requirement CTX-0047: Add descriptions for functions, help popup.
 */
export const LAB_TAB_HELP: Record<LabTabId, { title: string; summary: string; details: string[] }> =
  {
    videos: {
      title: 'Videos',
      summary: 'Pick a video source and track profile for the danmaku field.',
      details: [
        'Catalog cards — choose a bundled CC-licensed video (duration/aspect/coverage).',
        'Track profile — sets danmaku lane layout (average/peak per second & cluster ratio).',
        'Custom URL — paste any direct MP4 URL and press Choose video.',
        'Upload local file — session-only blob URL, revoked when you switch source.',
        'Source status — idle / loading / ready / error with Retry.',
        'Choose / Retry — commits the pending source+profile after metadata loads.',
      ],
    },
    throughput: {
      title: 'Throughput',
      summary: 'Control how many danmaku are alive and how fast they spawn.',
      details: [
        'Pool capacity — fixed upper bound (5K mobile / 20K desktop) for the DanmakuPool.',
        'Target live count — desired concurrent danmaku (scheduler target).',
        'Quick targets — one-click 1K / 5K / 10K / 20K (desktop) shortcuts.',
        'Spawn rate — danmaku per second (6000/s desktop lets 20K fill before exits balance).',
        'Distribution — steady (even) vs bursty (+50% burst between band openings).',
        'Frame health — live FPS & frame-time from app Profiler.',
        'Draw split — GL runs / GL glyphs vs Canvas2D slots (overdraw pressure).',
      ],
    },
    interactions: {
      title: 'Interactions',
      summary: 'Toggle per-danmaku behaviours and motion presets.',
      details: [
        'Hover pause — cursor acts as freeze zone: every danmaku under it pauses until you move.',
        'Drag — click-drag a danmaku to pin it (released when toggle off).',
        'Reactions — single-select + like (♥ count) / copy text plate below center.',
        'Motion preset — scroll→ / reverse / top / bottom / sine / rotation / glitch / repulsion.',
        'Effects — neon glow / gradient / rainbow cycle / outline for new comments.',
        'Render classes — backend (WebGL/MSDF vs Canvas2D), glyphs & canvas slot counts.',
      ],
    },
    benchmark: {
      title: 'Benchmark',
      summary: 'Run a quotable in-page stress benchmark and export the JSON envelope.',
      details: [
        'Frame rate — writes Scene.maxFPS (0 uncapped, 60/120/240) so rAF follows the cap.',
        'Backend label — current glyph backend (WebGL/MSDF or Canvas2D fallback).',
        'Run benchmark — fill→settle→calibrate refreshHz→FrameProfiler window; hover-freeze suspended.',
        'Status / saturation — live detail + saturation line when max rate cannot sustain target.',
        'Copy / Download JSON — clipboard write or file download of the archived envelope.',
        'Last result — p50 FPS, p99 frame ms, active@ end vs target, refreshHz & filled count.',
      ],
    },
    devtools: {
      title: 'DevTools',
      summary: 'Attach Vecto diagnostics when running with ?debug.',
      details: [
        'Availability dot — available (green) / reload-required (blue) / unavailable (grey).',
        'Load diagnostics — in dev, dynamically imports @vectojs/devtools; prod stays light.',
        'Slot samples — after attach, inspect live slot state via window.__app & devtools panel.',
        'Export report — download JSON snapshot of availability & timestamp.',
        'a11y tree — canvas semantic projection still syncs even when DevTools is idle.',
      ],
    },
  };

/**
 * HTML floating lab drawer — CTX-0047
 * Floating window (position:fixed, 560x520) with drag via header, resize via corner handle,
 * ball mode (minimized 48px circle on side when closed), and per-tab help popup (? modal).
 * Preserves original API: open/close toggles bakudan-lab--open/closed + aria-hidden, tablist keyboard.
 */
export class LabDrawerHTML {
  readonly element: HTMLElement;
  private readonly opts: LabDrawerHTMLOptions;
  private open: boolean;
  private activeTab: LabTabId;
  private readonly tablistEl: HTMLElement;
  private readonly panelsEl: HTMLElement;
  private readonly tabButtons = new Map<LabTabId, HTMLButtonElement>();
  private readonly tabPanels = new Map<LabTabId, HTMLElement>();
  private readonly closeButton: HTMLButtonElement;
  private readonly headerEl: HTMLElement;
  private readonly ballEl: HTMLButtonElement;
  private readonly resizeHandleEl: HTMLElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly helpModalEl: HTMLElement;
  private readonly helpTitleEl: HTMLElement;
  private readonly helpSummaryEl: HTMLElement;
  private readonly helpListEl: HTMLElement;
  private readonly helpCloseButton: HTMLButtonElement;
  private helpOpen = false;
  private destroyed = false;
  private trapCleanup: (() => void) | null = null;

  // Drag state
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dragPointerId: number | null = null;

  // Resize state
  private resizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartW = 0;
  private resizeStartH = 0;
  private resizePointerId: number | null = null;

  constructor(container: HTMLElement, opts: LabDrawerHTMLOptions) {
    this.opts = opts;
    this.open = !!opts.open;
    this.activeTab = opts.activeTab;
    this.element = container;

    // CSS vars from theme
    for (const [k, v] of Object.entries({
      '--bakudan-surface': BAKUDAN_THEME.surface,
      '--bakudan-surface-raised': BAKUDAN_THEME.surfaceRaised,
      '--bakudan-border': BAKUDAN_THEME.border,
      '--bakudan-text': BAKUDAN_THEME.text,
      '--bakudan-text-muted': BAKUDAN_THEME.textMuted,
      '--bakudan-accent': BAKUDAN_THEME.accent,
      '--bakudan-accent-hover': BAKUDAN_THEME.accentHover,
      '--bakudan-signal': BAKUDAN_THEME.signal,
      '--bakudan-danger': BAKUDAN_THEME.danger,
      '--bakudan-focus-ring': BAKUDAN_THEME.focusRing,
      '--bakudan-font-ui': BAKUDAN_THEME.fontUi,
      '--bakudan-font-mono': BAKUDAN_THEME.fontMono,
      '--bakudan-font-label': BAKUDAN_THEME.fontLabel,
      '--bakudan-font-display': BAKUDAN_THEME.fontDisplay,
    })) {
      container.style.setProperty(k, v);
    }

    container.classList.add('bakudan-lab');
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', opts.labels?.title ?? 'Bakudan Lab');
    container.setAttribute('aria-modal', String(!!opts.modal));

    container.classList.toggle('bakudan-lab--open', this.open);
    container.classList.toggle('bakudan-lab--closed', !this.open);
    container.setAttribute('aria-hidden', String(!this.open));

    // Header — draggable via pointerdown on header (not on buttons)
    const header = document.createElement('div');
    header.className = 'bakudan-lab__header';
    // draggable handle semantics
    header.setAttribute('aria-label', 'Drag to move lab window');

    const title = document.createElement('h2');
    title.className = 'bakudan-lab__title';
    title.textContent = opts.labels?.title ?? 'Bakudan Lab';
    title.id = 'bakudan-lab-title';
    container.setAttribute('aria-labelledby', title.id);
    header.append(title);

    // Help (?) button — per CTX-0047
    this.helpButton = document.createElement('button');
    this.helpButton.type = 'button';
    this.helpButton.className = 'bakudan-lab__help';
    this.helpButton.textContent = '?';
    this.helpButton.setAttribute('aria-label', 'Help for current tab');
    this.helpButton.setAttribute('aria-haspopup', 'dialog');
    this.helpButton.setAttribute('aria-expanded', 'false');
    this.helpButton.title = 'Show help for this tab';
    this.helpButton.addEventListener('click', this.handleHelpToggle);
    header.append(this.helpButton);

    // Spacer to push close to the right
    const spacer = document.createElement('div');
    spacer.style.flex = '1 1 auto';
    spacer.setAttribute('aria-hidden', 'true');
    header.append(spacer);

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'bakudan-lab__close';
    this.closeButton.textContent = opts.labels?.close ?? 'Minimize';
    this.closeButton.setAttribute('aria-label', 'Minimize to floating ball');
    this.closeButton.title = 'Minimize to 48px ball';
    this.closeButton.addEventListener('click', this.handleClose);
    header.append(this.closeButton);

    this.headerEl = header;

    // Tablist
    this.tablistEl = document.createElement('div');
    this.tablistEl.className = 'bakudan-lab__tabs';
    this.tablistEl.setAttribute('role', 'tablist');
    this.tablistEl.setAttribute('aria-label', 'Lab sections');
    this.tablistEl.addEventListener('keydown', this.handleTablistKeydown);

    // Panels container
    this.panelsEl = document.createElement('div');
    this.panelsEl.className = 'bakudan-lab__panels';

    // Build tabs + panels
    for (const { id, label, panel } of opts.panels) {
      const tabId = `bakudan-lab-tab-${id}`;
      const panelId = `bakudan-lab-panel-${id}`;

      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'bakudan-lab__tab';
      tab.setAttribute('role', 'tab');
      tab.id = tabId;
      tab.textContent = label;
      tab.setAttribute('aria-selected', String(id === this.activeTab));
      tab.setAttribute('aria-controls', panelId);
      tab.tabIndex = id === this.activeTab ? 0 : -1;
      tab.dataset.tabId = id;
      // Tooltip help summary per requirement
      const help = LAB_TAB_HELP[id];
      if (help) tab.title = `${help.title}: ${help.summary}`;
      tab.addEventListener('click', () => this.requestTab(id));
      this.tablistEl.append(tab);
      this.tabButtons.set(id, tab);

      const panelWrapper = document.createElement('div');
      panelWrapper.className = 'bakudan-lab__panel';
      if (id === this.activeTab) panelWrapper.classList.add('bakudan-lab__panel--active');
      panelWrapper.setAttribute('role', 'tabpanel');
      panelWrapper.id = panelId;
      panelWrapper.setAttribute('aria-labelledby', tabId);
      if (id !== this.activeTab) panelWrapper.hidden = true;
      else panelWrapper.hidden = false;
      panelWrapper.tabIndex = 0;
      panelWrapper.append(panel.element);
      this.panelsEl.append(panelWrapper);
      this.tabPanels.set(id, panelWrapper);
    }

    // Resize handle — bottom-right corner
    this.resizeHandleEl = document.createElement('div');
    this.resizeHandleEl.className = 'bakudan-lab__resize-handle';
    this.resizeHandleEl.setAttribute('role', 'presentation');
    this.resizeHandleEl.setAttribute('aria-label', 'Resize lab window');
    this.resizeHandleEl.title = 'Drag to resize';

    // Help modal — absolute inset overlay inside drawer
    this.helpModalEl = document.createElement('div');
    this.helpModalEl.className = 'bakudan-lab__help-modal';
    this.helpModalEl.setAttribute('role', 'dialog');
    this.helpModalEl.setAttribute('aria-modal', 'true');
    this.helpModalEl.setAttribute('aria-labelledby', 'bakudan-lab-help-title');
    this.helpModalEl.hidden = true;

    const helpHeader = document.createElement('div');
    helpHeader.className = 'bakudan-lab__help-header';
    this.helpTitleEl = document.createElement('h3');
    this.helpTitleEl.className = 'bakudan-lab__help-title';
    this.helpTitleEl.id = 'bakudan-lab-help-title';
    this.helpSummaryEl = document.createElement('p');
    this.helpSummaryEl.className = 'bakudan-lab__help-summary';
    this.helpCloseButton = document.createElement('button');
    this.helpCloseButton.type = 'button';
    this.helpCloseButton.className = 'bakudan-lab__help-close';
    this.helpCloseButton.textContent = '×';
    this.helpCloseButton.setAttribute('aria-label', 'Close help');
    this.helpCloseButton.addEventListener('click', this.handleHelpClose);
    helpHeader.append(this.helpTitleEl, this.helpCloseButton);

    this.helpListEl = document.createElement('ul');
    this.helpListEl.className = 'bakudan-lab__help-list';

    const helpFooter = document.createElement('div');
    helpFooter.className = 'bakudan-lab__help-footer';
    const helpHint = document.createElement('p');
    helpHint.className = 'bakudan-lab__help-hint';
    helpHint.textContent =
      'Tip: drag the header to move • drag the corner to resize • click the ball to restore';
    helpHint.style.fontSize = '11px';
    helpHint.style.color = 'var(--bakudan-text-muted)';
    helpFooter.append(helpHint);

    this.helpModalEl.append(helpHeader, this.helpSummaryEl, this.helpListEl, helpFooter);

    // Ball — 48px floating circle shown when closed
    this.ballEl = document.createElement('button');
    this.ballEl.type = 'button';
    this.ballEl.className = 'bakudan-lab__ball';
    this.ballEl.setAttribute('aria-label', 'Open lab');
    this.ballEl.title = 'Open lab (floating ball)';
    this.ballEl.textContent = '🧪';
    // fallback text if emoji not rendered
    this.ballEl.setAttribute('aria-hidden', 'false');
    this.ballEl.addEventListener('click', this.handleBallClick);

    // Assemble — order: header, tabs, panels, resize, help modal, ball
    container.replaceChildren(
      header,
      this.tablistEl,
      this.panelsEl,
      this.resizeHandleEl,
      this.helpModalEl,
      this.ballEl,
    );

    // Init help content for active tab
    this.syncHelpContent();

    // Install drag & resize listeners
    this.headerEl.addEventListener('pointerdown', this.handleHeaderPointerDown);
    this.resizeHandleEl.addEventListener('pointerdown', this.handleResizePointerDown);
    // Dismiss help on Escape, close drawer on Escape when help not open
    container.addEventListener('keydown', this.handleContainerKeydown);
    // Clicking outside help modal but inside drawer should not propagate to ball
    this.helpModalEl.addEventListener('click', (e) => {
      if (e.target === this.helpModalEl) this.hideHelp();
    });

    this.updateTrap();
  }

  private readonly handleClose = (): void => {
    this.hideHelp();
    this.requestOpen(false);
  };

  private readonly handleBallClick = (e: Event): void => {
    e.stopPropagation();
    this.requestOpen(true);
  };

  private requestOpen(open: boolean): void {
    if (this.destroyed) return;
    if (this.open === open) return;
    this.setOpen(open);
    this.opts.onOpenChange(open);
  }

  private requestTab(id: LabTabId): void {
    if (this.destroyed) return;
    if (this.activeTab === id) {
      this.tabButtons.get(id)?.focus();
      return;
    }
    this.setActiveTab(id);
    this.opts.onActiveTabChange(id);
  }

  private readonly handleTablistKeydown = (event: KeyboardEvent): void => {
    const tabs = this.opts.panels.map((p) => p.id);
    const currentIdx = tabs.indexOf(this.activeTab);
    let nextIdx: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIdx = currentIdx <= 0 ? tabs.length - 1 : currentIdx - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        nextIdx = currentIdx >= tabs.length - 1 ? 0 : currentIdx + 1;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = tabs.length - 1;
        break;
      default:
        return;
    }
    if (nextIdx !== null) {
      event.preventDefault();
      const nextId = tabs[nextIdx]!;
      this.requestTab(nextId);
      this.tabButtons.get(nextId)?.focus();
    }
  };

  private readonly handleHelpToggle = (): void => {
    if (this.helpOpen) this.hideHelp();
    else this.showHelp();
  };

  private readonly handleHelpClose = (): void => {
    this.hideHelp();
  };

  private readonly handleContainerKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (this.helpOpen) {
        e.stopPropagation();
        this.hideHelp();
        this.helpButton.focus();
      } else if (this.open && !this.opts.modal) {
        // Allow Escape to minimize floating window when not modal
        // Do not close if focus trap expects modal behavior — keep consistent with close button
        // Only minimize if help not open
        // We do not auto-close modal trap here because trap only when modal
      }
    }
    if (e.key === '?' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.showHelp();
    }
  };

  private showHelp(): void {
    if (this.destroyed || this.helpOpen) return;
    this.helpOpen = true;
    this.syncHelpContent();
    this.helpModalEl.hidden = false;
    this.helpModalEl.setAttribute('aria-hidden', 'false');
    this.helpButton.setAttribute('aria-expanded', 'true');
    // Focus close button for quick dismiss
    this.helpCloseButton.focus();
  }

  private hideHelp(): void {
    if (!this.helpOpen) return;
    this.helpOpen = false;
    this.helpModalEl.hidden = true;
    this.helpModalEl.setAttribute('aria-hidden', 'true');
    this.helpButton.setAttribute('aria-expanded', 'false');
  }

  private syncHelpContent(): void {
    const help = LAB_TAB_HELP[this.activeTab];
    if (!help) return;
    this.helpTitleEl.textContent = help.title;
    this.helpSummaryEl.textContent = help.summary;
    this.helpListEl.replaceChildren();
    for (const line of help.details) {
      const li = document.createElement('li');
      li.textContent = line;
      this.helpListEl.append(li);
    }
    // Update help button title to current tab
    this.helpButton.title = `Help: ${help.title} — ${help.summary}`;
  }

  // --- Drag via header ---

  private readonly handleHeaderPointerDown = (e: PointerEvent): void => {
    if (this.destroyed || !this.open) return;
    const target = e.target as HTMLElement | null;
    // Do not drag when clicking buttons inside header
    if (target && target.closest('button')) return;
    // Only primary button
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = this.element.getBoundingClientRect();
    this.dragging = true;
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    this.dragPointerId = e.pointerId;
    try {
      (
        this.headerEl as unknown as { setPointerCapture?: (id: number) => void }
      ).setPointerCapture?.(e.pointerId);
    } catch {}
    window.addEventListener('pointermove', this.handleHeaderPointerMove);
    window.addEventListener('pointerup', this.handleHeaderPointerUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    this.headerEl.style.cursor = 'grabbing';
  };

  private readonly handleHeaderPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    if (this.dragPointerId !== null && e.pointerId !== this.dragPointerId) return;
    e.preventDefault();
    let newLeft = e.clientX - this.dragOffsetX;
    let newTop = e.clientY - this.dragOffsetY;
    // Clamp within viewport with 8px margin
    const margin = 8;
    const rect = this.element.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = rect.width;
    newLeft = Math.max(margin - w + 48, Math.min(newLeft, vw - 48));
    newTop = Math.max(margin, Math.min(newTop, vh - 48));
    // Switch from right/bottom anchoring to left/top
    this.element.style.left = `${Math.round(newLeft)}px`;
    this.element.style.top = `${Math.round(newTop)}px`;
    this.element.style.right = 'auto';
    this.element.style.bottom = 'auto';
  };

  private readonly handleHeaderPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    if (this.dragPointerId !== null && e.pointerId !== this.dragPointerId) return;
    this.dragging = false;
    this.dragPointerId = null;
    try {
      (
        this.headerEl as unknown as {
          releasePointerCapture?: (id: number) => void;
        }
      ).releasePointerCapture?.(e.pointerId);
    } catch {}
    window.removeEventListener('pointermove', this.handleHeaderPointerMove);
    window.removeEventListener('pointerup', this.handleHeaderPointerUp);
    document.body.style.userSelect = '';
    this.headerEl.style.cursor = '';
  };

  // --- Resize via corner handle ---

  private readonly handleResizePointerDown = (e: PointerEvent): void => {
    if (this.destroyed || !this.open) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = this.element.getBoundingClientRect();
    this.resizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeStartW = rect.width;
    this.resizeStartH = rect.height;
    this.resizePointerId = e.pointerId;
    try {
      (
        this.resizeHandleEl as unknown as {
          setPointerCapture?: (id: number) => void;
        }
      ).setPointerCapture?.(e.pointerId);
    } catch {}
    window.addEventListener('pointermove', this.handleResizePointerMove);
    window.addEventListener('pointerup', this.handleResizePointerUp);
    document.body.style.userSelect = 'none';
  };

  private readonly handleResizePointerMove = (e: PointerEvent): void => {
    if (!this.resizing) return;
    if (this.resizePointerId !== null && e.pointerId !== this.resizePointerId) return;
    e.preventDefault();
    let newW = this.resizeStartW + (e.clientX - this.resizeStartX);
    let newH = this.resizeStartH + (e.clientY - this.resizeStartY);
    const minW = 320;
    const minH = 360;
    const maxW = Math.min(800, window.innerWidth - 16);
    const maxH = Math.min(720, window.innerHeight - 32);
    newW = Math.max(minW, Math.min(newW, maxW));
    newH = Math.max(minH, Math.min(newH, maxH));
    this.element.style.width = `${Math.round(newW)}px`;
    this.element.style.height = `${Math.round(newH)}px`;
    // Ensure left/top remain so we don't jump to right/bottom anchored position
    if (!this.element.style.left && !this.element.style.top) {
      const rect = this.element.getBoundingClientRect();
      this.element.style.left = `${Math.round(rect.left)}px`;
      this.element.style.top = `${Math.round(rect.top)}px`;
      this.element.style.right = 'auto';
      this.element.style.bottom = 'auto';
    }
  };

  private readonly handleResizePointerUp = (e: PointerEvent): void => {
    if (!this.resizing) return;
    if (this.resizePointerId !== null && e.pointerId !== this.resizePointerId) return;
    this.resizing = false;
    this.resizePointerId = null;
    try {
      (
        this.resizeHandleEl as unknown as {
          releasePointerCapture?: (id: number) => void;
        }
      ).releasePointerCapture?.(e.pointerId);
    } catch {}
    window.removeEventListener('pointermove', this.handleResizePointerMove);
    window.removeEventListener('pointerup', this.handleResizePointerUp);
    document.body.style.userSelect = '';
  };

  private installFocusTrap(): void {
    if (!this.opts.modal || !this.open) return;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || this.destroyed) return;
      const focusable = [...this.element.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    this.element.addEventListener('keydown', onKeyDown);
    this.trapCleanup = () => this.element.removeEventListener('keydown', onKeyDown);
    const firstTab = this.tabButtons.get(this.activeTab);
    firstTab?.focus();
  }

  private removeFocusTrap(): void {
    if (this.trapCleanup) {
      this.trapCleanup();
      this.trapCleanup = null;
    }
  }

  private updateTrap(): void {
    this.removeFocusTrap();
    if (this.open && this.opts.modal) this.installFocusTrap();
  }

  setOpen(open: boolean): void {
    if (this.destroyed) return;
    if (this.open === open) return;
    this.open = open;
    this.element.classList.toggle('bakudan-lab--open', open);
    this.element.classList.toggle('bakudan-lab--closed', !open);
    this.element.setAttribute('aria-hidden', String(!open));
    if (!open) this.hideHelp();
    this.updateTrap();
    this.syncTabVisibility();
  }

  setActiveTab(tabId: LabTabId): void {
    if (this.destroyed) return;
    if (!this.tabButtons.has(tabId)) return;
    if (this.activeTab === tabId) return;
    this.activeTab = tabId;
    this.syncTabVisibility();
    this.syncHelpContent();
  }

  private syncTabVisibility(): void {
    for (const [id, btn] of this.tabButtons) {
      const isActive = id === this.activeTab;
      btn.setAttribute('aria-selected', String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
      btn.classList.toggle('bakudan-lab__tab--active', isActive);
    }
    for (const [id, panelEl] of this.tabPanels) {
      const isActive = id === this.activeTab;
      panelEl.hidden = !isActive;
      panelEl.classList.toggle('bakudan-lab__panel--active', isActive);
      panelEl.setAttribute('aria-hidden', String(!isActive));
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  get activeTabId(): LabTabId {
    return this.activeTab;
  }

  get isHelpOpen(): boolean {
    return this.helpOpen;
  }

  /** For App.getCinemaLayoutSnapshot compatibility — return y/height based on viewport. */
  getLayoutInfo(
    stageH: number,
    isMobile: boolean,
  ): { y: number; height: number; width: number; open: boolean } {
    // Prefer live rect when floating window is open and measurable (jsdom/happy-dom may give 0)
    if (this.open) {
      try {
        const rect = this.element.getBoundingClientRect();
        if (rect.width > 40 && rect.height > 40) {
          // Report in stage-relative coords similar to old bottom sheet
          // Use rect top relative to viewport; stageH approximates viewport height in App
          return {
            y: Math.round(rect.top),
            height: Math.round(rect.height),
            width: Math.round(rect.width),
            open: true,
          };
        }
      } catch {}
    }
    const ratio = isMobile ? 0.69 : 0.46;
    const height = Math.round(stageH * ratio);
    const y = stageH - height;
    const width = typeof window !== 'undefined' ? window.innerWidth : stageH;
    return { y, height, width, open: this.open };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeFocusTrap();
    this.tablistEl.removeEventListener('keydown', this.handleTablistKeydown);
    this.closeButton.removeEventListener('click', this.handleClose);
    this.helpButton.removeEventListener('click', this.handleHelpToggle);
    this.helpCloseButton.removeEventListener('click', this.handleHelpClose);
    this.ballEl.removeEventListener('click', this.handleBallClick);
    this.headerEl.removeEventListener('pointerdown', this.handleHeaderPointerDown);
    this.resizeHandleEl.removeEventListener('pointerdown', this.handleResizePointerDown);
    this.element.removeEventListener('keydown', this.handleContainerKeydown);
    window.removeEventListener('pointermove', this.handleHeaderPointerMove);
    window.removeEventListener('pointerup', this.handleHeaderPointerUp);
    window.removeEventListener('pointermove', this.handleResizePointerMove);
    window.removeEventListener('pointerup', this.handleResizePointerUp);
    document.body.style.userSelect = '';
    // Destroy child panels
    for (const { panel } of this.opts.panels) {
      try {
        panel.destroy();
      } catch {}
    }
    this.element.replaceChildren();
    this.element.classList.remove('bakudan-lab', 'bakudan-lab--open', 'bakudan-lab--closed');
    this.element.removeAttribute('role');
    this.element.removeAttribute('aria-label');
    this.element.removeAttribute('aria-modal');
    this.element.removeAttribute('aria-hidden');
    this.element.removeAttribute('aria-labelledby');
    // Clear inline geometry installed by drag/resize
    this.element.style.removeProperty('left');
    this.element.style.removeProperty('top');
    this.element.style.removeProperty('right');
    this.element.style.removeProperty('bottom');
    this.element.style.removeProperty('width');
    this.element.style.removeProperty('height');
  }
}
