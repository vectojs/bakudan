import { BAKUDAN_THEME } from '../../cinemaConfig';

export interface BenchmarkState {
  frameRate: number;
  backendLabel: string;
  running: boolean;
  statusLine: string;
  resultLines: readonly string[];
  saturationLine: string | null;
  copied: boolean;
  autoThrottle?: boolean;
  idleFPS?: number;
}

export interface BenchmarkPanelOptions {
  state: BenchmarkState;
  labels?: {
    fpsHeading?: string;
    renderer?: string;
    run?: string;
    running?: string;
    copy?: string;
    download?: string;
    copied?: string;
    copyFailed?: string;
    idle?: string;
    resultHeading?: string;
  };
  onFrameRateChange: (hz: number) => void;
  onRun: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onAutoThrottleChange?: (enabled: boolean) => void;
  onIdleFPSChange?: (fps: number) => void;
}

/**
 * Vanilla HTML Benchmark panel — frameRate selector that writes Scene.maxFPS
 * (0 uncapped, 60/120/240), autoThrottle/idleFPS toggles, run button, JSON export.
 */
export class BenchmarkPanelHTML {
  readonly element: HTMLElement;
  private readonly opts: BenchmarkPanelOptions;
  private state: BenchmarkState;

  private readonly frameRateSelect: HTMLSelectElement;
  private readonly backendEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly saturationEl: HTMLElement;
  private readonly resultHeadingEl: HTMLElement;
  private readonly resultContainer: HTMLElement;
  private readonly runButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly downloadButton: HTMLButtonElement;
  private readonly autoThrottleInput: HTMLInputElement;
  private readonly idleFPSInput: HTMLSelectElement;

  constructor(opts: BenchmarkPanelOptions) {
    this.opts = opts;
    this.state = opts.state;

    const root = document.createElement('div');
    root.className = 'bakudan-benchmark';
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
    })) {
      root.style.setProperty(k, v);
    }

    // Frame rate
    const fpsSection = document.createElement('div');
    fpsSection.className = 'bakudan-lab__section';
    const fpsHeading = document.createElement('h3');
    fpsHeading.textContent = opts.labels?.fpsHeading ?? 'Frame rate';
    fpsSection.append(fpsHeading);

    this.frameRateSelect = document.createElement('select');
    this.frameRateSelect.className = 'bakudan-lab__select';
    this.frameRateSelect.setAttribute('aria-label', 'Frame rate limit');
    const frameRateOptions = [
      { value: 0, label: 'Uncapped (0)' },
      { value: 60, label: '60 Hz' },
      { value: 120, label: '120 Hz' },
      { value: 240, label: '240 Hz' },
    ];
    for (const o of frameRateOptions) {
      const opt = document.createElement('option');
      opt.value = String(o.value);
      opt.textContent = o.label;
      this.frameRateSelect.append(opt);
    }
    this.frameRateSelect.value = String(this.state.frameRate);
    this.frameRateSelect.addEventListener('change', () => {
      const hz = Number(this.frameRateSelect.value);
      if (Number.isFinite(hz)) opts.onFrameRateChange(hz);
    });
    fpsSection.append(this.frameRateSelect);

    // AutoThrottle toggle
    const throttleRow = document.createElement('label');
    throttleRow.className = 'bakudan-lab__checkbox-row';
    this.autoThrottleInput = document.createElement('input');
    this.autoThrottleInput.type = 'checkbox';
    this.autoThrottleInput.checked = !!this.state.autoThrottle;
    this.autoThrottleInput.setAttribute('aria-label', 'Auto throttle');
    this.autoThrottleInput.addEventListener('change', () => {
      opts.onAutoThrottleChange?.(this.autoThrottleInput.checked);
    });
    const throttleSpan = document.createElement('span');
    throttleSpan.textContent = 'Auto throttle';
    throttleRow.append(this.autoThrottleInput, throttleSpan);
    fpsSection.append(throttleRow);

    // idleFPS selector
    const idleRow = document.createElement('div');
    idleRow.className = 'bakudan-lab__range-row';
    const idleLabel = document.createElement('label');
    idleLabel.textContent = 'Idle FPS';
    idleLabel.style.fontSize = '11px';
    idleLabel.style.color = 'var(--bakudan-text-muted)';
    this.idleFPSInput = document.createElement('select');
    this.idleFPSInput.className = 'bakudan-lab__select';
    this.idleFPSInput.setAttribute('aria-label', 'Idle FPS');
    for (const v of [0, 15, 30, 60]) {
      const opt = document.createElement('option');
      opt.value = String(v);
      opt.textContent = v === 0 ? 'Uncapped' : `${v} FPS`;
      this.idleFPSInput.append(opt);
    }
    this.idleFPSInput.value = String(this.state.idleFPS ?? 30);
    this.idleFPSInput.addEventListener('change', () => {
      const fps = Number(this.idleFPSInput.value);
      if (Number.isFinite(fps)) opts.onIdleFPSChange?.(fps);
    });
    idleRow.append(idleLabel, this.idleFPSInput);
    fpsSection.append(idleRow);

    // Backend label
    this.backendEl = document.createElement('p');
    this.backendEl.className = 'bakudan-benchmark__backend';
    this.backendEl.style.fontFamily = 'var(--bakudan-font-mono)';
    this.backendEl.style.fontSize = '11px';
    this.backendEl.style.color = 'var(--bakudan-text-muted)';
    this.backendEl.textContent = this.state.backendLabel;
    fpsSection.append(this.backendEl);
    root.append(fpsSection);

    // Status line
    this.statusEl = document.createElement('p');
    this.statusEl.className = 'bakudan-benchmark__status';
    this.statusEl.setAttribute('aria-live', 'polite');
    this.statusEl.style.fontFamily = 'var(--bakudan-font-ui)';
    this.statusEl.style.fontSize = '13px';
    this.statusEl.textContent = this.state.statusLine;
    root.append(this.statusEl);

    this.saturationEl = document.createElement('p');
    this.saturationEl.className = 'bakudan-benchmark__saturation';
    this.saturationEl.style.color = 'var(--bakudan-accent)';
    this.saturationEl.style.fontSize = '12px';
    this.saturationEl.textContent = this.state.saturationLine ?? '';
    if (!this.state.saturationLine) this.saturationEl.style.display = 'none';
    root.append(this.saturationEl);

    // Run / export buttons
    const actionsSection = document.createElement('div');
    actionsSection.className = 'bakudan-lab__section';
    this.runButton = document.createElement('button');
    this.runButton.type = 'button';
    this.runButton.className = 'bakudan-lab__button bakudan-lab__button--primary';
    this.runButton.textContent = opts.labels?.run ?? 'Run benchmark';
    this.runButton.addEventListener('click', () => opts.onRun());
    actionsSection.append(this.runButton);

    const exportRow = document.createElement('div');
    exportRow.style.display = 'flex';
    exportRow.style.gap = '8px';
    exportRow.style.marginTop = '8px';
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'bakudan-lab__button';
    this.copyButton.textContent = opts.labels?.copy ?? 'Copy JSON';
    this.copyButton.addEventListener('click', () => opts.onCopy());
    this.downloadButton = document.createElement('button');
    this.downloadButton.type = 'button';
    this.downloadButton.className = 'bakudan-lab__button';
    this.downloadButton.textContent = opts.labels?.download ?? 'Download JSON';
    this.downloadButton.addEventListener('click', () => opts.onDownload());
    exportRow.append(this.copyButton, this.downloadButton);
    actionsSection.append(exportRow);
    root.append(actionsSection);

    // Result
    const resultSection = document.createElement('div');
    resultSection.className = 'bakudan-lab__section';
    this.resultHeadingEl = document.createElement('h4');
    this.resultHeadingEl.textContent = opts.labels?.resultHeading ?? 'Last result';
    this.resultHeadingEl.style.display = this.state.resultLines.length > 0 ? '' : 'none';
    resultSection.append(this.resultHeadingEl);
    this.resultContainer = document.createElement('div');
    this.resultContainer.className = 'bakudan-benchmark__results';
    this.resultContainer.style.display = 'flex';
    this.resultContainer.style.flexDirection = 'column';
    this.resultContainer.style.gap = '4px';
    for (const line of this.state.resultLines) {
      const p = document.createElement('p');
      p.textContent = line;
      p.style.fontFamily = 'var(--bakudan-font-mono)';
      p.style.fontSize = '11px';
      p.style.margin = '0';
      this.resultContainer.append(p);
    }
    if (this.state.resultLines.length === 0) this.resultContainer.style.display = 'none';
    resultSection.append(this.resultContainer);
    root.append(resultSection);

    this.element = root;
    this.syncState(this.state);
  }

  private syncState(state: BenchmarkState): void {
    this.state = state;
    const isSelectActive = document.activeElement === this.frameRateSelect;
    if (!isSelectActive) this.frameRateSelect.value = String(state.frameRate);
    this.backendEl.textContent = state.backendLabel;
    this.statusEl.textContent = state.statusLine;
    if (state.saturationLine) {
      this.saturationEl.textContent = state.saturationLine;
      this.saturationEl.style.display = '';
    } else {
      this.saturationEl.textContent = '';
      this.saturationEl.style.display = 'none';
    }
    this.runButton.disabled = state.running;
    this.runButton.textContent = state.running
      ? (this.opts.labels?.running ?? 'Running…')
      : (this.opts.labels?.run ?? 'Run benchmark');
    const hasResult = !state.running && state.resultLines.length > 0;
    this.copyButton.disabled = !hasResult;
    this.downloadButton.disabled = !hasResult;
    this.copyButton.textContent = state.copied
      ? (this.opts.labels?.copied ?? 'Copied!')
      : (this.opts.labels?.copy ?? 'Copy JSON');
    if (state.autoThrottle !== undefined) this.autoThrottleInput.checked = !!state.autoThrottle;
    if (state.idleFPS !== undefined) this.idleFPSInput.value = String(state.idleFPS);
    // Results
    if (hasResult) {
      this.resultHeadingEl.style.display = '';
      this.resultContainer.style.display = 'flex';
      this.resultContainer.replaceChildren();
      for (const line of state.resultLines) {
        const p = document.createElement('p');
        p.textContent = line;
        p.style.fontFamily = 'var(--bakudan-font-mono)';
        p.style.fontSize = '11px';
        p.style.margin = '0';
        this.resultContainer.append(p);
      }
    } else {
      this.resultHeadingEl.style.display = 'none';
      this.resultContainer.style.display = 'none';
      this.resultContainer.replaceChildren();
      if (state.running) {
        // Show status only
      }
    }
  }

  setState(state: unknown): void {
    this.syncState(state as BenchmarkState);
  }

  destroy(): void {
    this.element.remove();
  }
}
