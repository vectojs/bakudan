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
 * HTML bottom sheet lab drawer — manages open/close (46% desktop / 69% mobile),
 * tabs with role=tablist / role=tabpanel, aria-selected, keyboard nav
 * (ArrowLeft/Right, Home/End), focus trap only when modal.
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
  private destroyed = false;
  private trapCleanup: (() => void) | null = null;

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

    // Ensure container is visible (override shell.css display:none)
    // lab.css handles transform; we just toggle class
    container.classList.toggle('bakudan-lab--open', this.open);
    container.classList.toggle('bakudan-lab--closed', !this.open);
    container.setAttribute('aria-hidden', String(!this.open));
    // Do not set inert when not modal — per spec focus trap only when modal

    // Header
    const header = document.createElement('div');
    header.className = 'bakudan-lab__header';

    const title = document.createElement('h2');
    title.className = 'bakudan-lab__title';
    title.textContent = opts.labels?.title ?? 'Bakudan Lab';
    title.id = 'bakudan-lab-title';
    container.setAttribute('aria-labelledby', title.id);
    header.append(title);

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'bakudan-lab__close';
    this.closeButton.textContent = opts.labels?.close ?? 'Close';
    this.closeButton.setAttribute('aria-label', 'Close lab drawer');
    this.closeButton.addEventListener('click', this.handleClose);
    header.append(this.closeButton);

    // Tablist
    this.tablistEl = document.createElement('div');
    this.tablistEl.className = 'bakudan-lab__tabs';
    this.tablistEl.setAttribute('role', 'tablist');
    this.tablistEl.setAttribute('aria-label', 'Lab sections');
    // Keyboard nav on tablist
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
      tab.addEventListener('click', () => this.requestTab(id));
      this.tablistEl.append(tab);
      this.tabButtons.set(id, tab);

      const panelWrapper = document.createElement('div');
      panelWrapper.className = 'bakudan-lab__panel';
      if (id === this.activeTab) panelWrapper.classList.add('bakudan-lab__panel--active');
      panelWrapper.setAttribute('role', 'tabpanel');
      panelWrapper.id = panelId;
      panelWrapper.setAttribute('aria-labelledby', tabId);
      // Hide inactive panels from a11y
      if (id !== this.activeTab) panelWrapper.hidden = true;
      else panelWrapper.hidden = false;
      panelWrapper.tabIndex = 0;
      panelWrapper.append(panel.element);
      this.panelsEl.append(panelWrapper);
      this.tabPanels.set(id, panelWrapper);
    }

    container.replaceChildren(header, this.tablistEl, this.panelsEl);

    this.updateTrap();
  }

  private readonly handleClose = (): void => {
    this.requestOpen(false);
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
      // Still focus the tab for keyboard users
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
      // Focus after selection so screen readers announce
      this.tabButtons.get(nextId)?.focus();
    }
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
    // Move focus into drawer when opened modal
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
    // When closed, make drawer inert only if modal? Non-modal stays non-modal region over playing video
    // Do not set display:none — keep transform animation
    this.updateTrap();
    // When opening, ensure active tab panel is visible
    this.syncTabVisibility();
  }

  setActiveTab(tabId: LabTabId): void {
    if (this.destroyed) return;
    if (!this.tabButtons.has(tabId)) return;
    if (this.activeTab === tabId) return;
    this.activeTab = tabId;
    this.syncTabVisibility();
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

  /** For App.getCinemaLayoutSnapshot compatibility — return y/height based on viewport. */
  getLayoutInfo(
    stageH: number,
    isMobile: boolean,
  ): { y: number; height: number; width: number; open: boolean } {
    const ratio = isMobile ? 0.69 : 0.46;
    const height = Math.round(stageH * ratio);
    const y = stageH - height;
    // Use window width if available
    const width = typeof window !== 'undefined' ? window.innerWidth : stageH;
    return { y, height, width, open: this.open };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeFocusTrap();
    this.tablistEl.removeEventListener('keydown', this.handleTablistKeydown);
    this.closeButton.removeEventListener('click', this.handleClose);
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
  }
}
