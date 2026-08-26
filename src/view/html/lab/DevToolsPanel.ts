import { BAKUDAN_THEME } from '../../cinemaConfig';

export type DevToolsAvailability = 'available' | 'unavailable' | 'reload-required';

export interface DevToolsState {
  availability: DevToolsAvailability;
  canReload: boolean;
}

export interface DevToolsPanelOptions {
  state: DevToolsState;
  labels?: {
    panel?: string;
    title?: string;
    reload?: string;
    availability?: Record<DevToolsAvailability, string>;
  };
  onReload: () => void;
  onExportReport?: () => void;
}

/**
 * Vanilla HTML DevTools panel — availability indicator, attach button for ?debug,
 * slot samples placeholder, report export.
 */
export class DevToolsPanelHTML {
  readonly element: HTMLElement;
  private readonly opts: DevToolsPanelOptions;
  private state: DevToolsState;

  private readonly statusDot: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly reloadButton: HTMLButtonElement;
  private readonly slotSamplesEl: HTMLElement;
  private readonly exportButton: HTMLButtonElement;

  constructor(opts: DevToolsPanelOptions) {
    this.opts = opts;
    this.state = opts.state;

    const root = document.createElement('div');
    root.className = 'bakudan-devtools';
    for (const [k, v] of Object.entries({
      '--bakudan-surface': BAKUDAN_THEME.surface,
      '--bakudan-surface-raised': BAKUDAN_THEME.surfaceRaised,
      '--bakudan-border': BAKUDAN_THEME.border,
      '--bakudan-text': BAKUDAN_THEME.text,
      '--bakudan-text-muted': BAKUDAN_THEME.textMuted,
      '--bakudan-accent': BAKUDAN_THEME.accent,
      '--bakudan-signal': BAKUDAN_THEME.signal,
      '--bakudan-focus-ring': BAKUDAN_THEME.focusRing,
      '--bakudan-font-ui': BAKUDAN_THEME.fontUi,
      '--bakudan-font-mono': BAKUDAN_THEME.fontMono,
      '--bakudan-font-label': BAKUDAN_THEME.fontLabel,
    })) {
      root.style.setProperty(k, v);
    }

    // Availability indicator
    const statusSection = document.createElement('div');
    statusSection.className = 'bakudan-lab__section';
    const statusHeading = document.createElement('h3');
    statusHeading.textContent = 'DevTools';
    statusSection.append(statusHeading);

    const statusRow = document.createElement('div');
    statusRow.className = 'bakudan-devtools__status';
    statusRow.setAttribute('role', 'status');
    statusRow.setAttribute('aria-live', 'polite');
    this.statusDot = document.createElement('span');
    this.statusDot.className = 'bakudan-devtools__dot';
    this.statusText = document.createElement('span');
    this.statusText.textContent = this.labelFor(this.state.availability);
    statusRow.append(this.statusDot, this.statusText);
    statusSection.append(statusRow);

    const titleEl = document.createElement('p');
    titleEl.textContent = opts.labels?.title ?? 'Debug diagnostics are loaded only in development.';
    titleEl.style.fontSize = '12px';
    titleEl.style.color = 'var(--bakudan-text-muted)';
    statusSection.append(titleEl);
    root.append(statusSection);

    // Attach button for ?debug
    const attachSection = document.createElement('div');
    attachSection.className = 'bakudan-lab__section';
    this.reloadButton = document.createElement('button');
    this.reloadButton.type = 'button';
    this.reloadButton.className = 'bakudan-lab__button bakudan-lab__button--primary';
    this.reloadButton.textContent = opts.labels?.reload ?? 'Load diagnostics';
    this.reloadButton.setAttribute('aria-label', 'Attach DevTools');
    this.reloadButton.addEventListener('click', () => opts.onReload());
    attachSection.append(this.reloadButton);
    root.append(attachSection);

    // Slot samples placeholder
    const samplesSection = document.createElement('div');
    samplesSection.className = 'bakudan-lab__section';
    const samplesHeading = document.createElement('h4');
    samplesHeading.textContent = 'Slot samples';
    samplesSection.append(samplesHeading);
    this.slotSamplesEl = document.createElement('div');
    this.slotSamplesEl.className = 'bakudan-devtools__samples';
    this.slotSamplesEl.style.fontFamily = 'var(--bakudan-font-mono)';
    this.slotSamplesEl.style.fontSize = '11px';
    this.slotSamplesEl.style.color = 'var(--bakudan-text-muted)';
    this.slotSamplesEl.style.minHeight = '48px';
    this.slotSamplesEl.style.padding = '8px';
    this.slotSamplesEl.style.border = '1px dashed var(--bakudan-border)';
    this.slotSamplesEl.style.borderRadius = '8px';
    this.slotSamplesEl.textContent = 'No slot samples yet. Attach DevTools with ?debug to collect.';
    this.slotSamplesEl.setAttribute('aria-label', 'Slot samples placeholder');
    samplesSection.append(this.slotSamplesEl);
    root.append(samplesSection);

    // Report export
    const exportSection = document.createElement('div');
    exportSection.className = 'bakudan-lab__section';
    const exportHeading = document.createElement('h4');
    exportHeading.textContent = 'Report';
    exportSection.append(exportHeading);
    this.exportButton = document.createElement('button');
    this.exportButton.type = 'button';
    this.exportButton.className = 'bakudan-lab__button';
    this.exportButton.textContent = 'Export report';
    this.exportButton.setAttribute('aria-label', 'Export DevTools report');
    this.exportButton.addEventListener('click', () => {
      if (opts.onExportReport) {
        opts.onExportReport();
      } else {
        // Fallback: export placeholder JSON
        const blob = new Blob(
          [
            JSON.stringify(
              {
                availability: this.state.availability,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          ],
          {
            type: 'application/json',
          },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bakudan-devtools-report.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
    exportSection.append(this.exportButton);
    root.append(exportSection);

    this.element = root;
    this.syncState(this.state);
  }

  private labelFor(a: DevToolsAvailability): string {
    const map = this.opts.labels?.availability;
    if (map) return map[a] ?? a;
    const fallback: Record<DevToolsAvailability, string> = {
      available: 'Available',
      unavailable: 'Unavailable in this build',
      'reload-required': 'Load on demand',
    };
    return fallback[a];
  }

  private syncState(state: DevToolsState): void {
    this.state = state;
    this.statusText.textContent = this.labelFor(state.availability);
    this.statusDot.className = `bakudan-devtools__dot bakudan-devtools__dot--${state.availability}`;
    this.reloadButton.disabled = !state.canReload;
    if (state.availability === 'available') {
      this.slotSamplesEl.textContent =
        'DevTools attached. Slot samples available via window.__app and @vectojs/devtools panel.';
    } else if (state.availability === 'reload-required') {
      this.slotSamplesEl.textContent =
        'Add ?debug to the URL and reload to attach DevTools, then return here.';
    } else {
      this.slotSamplesEl.textContent = 'DevTools unavailable in this build.';
    }
  }

  setState(state: DevToolsState): void {
    this.syncState(state);
  }

  destroy(): void {
    this.element.remove();
  }
}
