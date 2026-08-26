import { BAKUDAN_THEME } from '../../cinemaConfig';

export type DistributionId = string;

export interface ThroughputState {
  capacity: number;
  target: number;
  rate: number;
  distributionId: DistributionId;
  framePercentiles: Record<string, number>;
  drawSplit: Record<string, number>;
}

export interface ThroughputPanelOptions {
  state: ThroughputState;
  isMobile?: boolean;
  distributions?: { id: string; label: string }[];
  frameMetrics?: { id: string; label: string }[];
  drawMetrics?: { id: string; label: string }[];
  targetRange?: { min: number; max: number; step: number };
  quickTargets?: { value: number; label: string }[];
  rateRange?: { min: number; max: number; step: number };
  labels?: {
    capacity?: string;
    target?: string;
    rate?: string;
    quickTargets?: string;
    distribution?: string;
    framePercentiles?: string;
    drawSplit?: string;
    formatCapacity?: (v: number) => string;
    formatTarget?: (v: number) => string;
    formatRate?: (v: number) => string;
    formatMetric?: (v: number) => string;
  };
  onTargetChange: (target: number) => void;
  onRateChange: (rate: number) => void;
  onDistributionChange: (id: string) => void;
}

/**
 * Vanilla HTML Throughput panel — quickTargets, custom target number input,
 * rateRange slider, distribution display, and metric readouts.
 */
export class ThroughputPanelHTML {
  readonly element: HTMLElement;
  private readonly opts: ThroughputPanelOptions;
  private state: ThroughputState;

  private readonly capacityEl: HTMLElement;
  private readonly targetValueEl: HTMLElement;
  private readonly targetInput: HTMLInputElement;
  private readonly targetSlider: HTMLInputElement;
  private readonly quickContainer: HTMLElement;
  private readonly rateValueEl: HTMLElement;
  private readonly rateSlider: HTMLInputElement;
  private readonly distributionGroup: HTMLElement;
  private readonly frameContainer: HTMLElement;
  private readonly drawContainer: HTMLElement;

  constructor(opts: ThroughputPanelOptions) {
    this.opts = opts;
    this.state = opts.state;

    const root = document.createElement('div');
    root.className = 'bakudan-throughput';
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

    // Capacity
    const capSection = document.createElement('div');
    capSection.className = 'bakudan-lab__section';
    const capHeading = document.createElement('h3');
    capHeading.textContent = opts.labels?.capacity ?? 'Pool capacity';
    capSection.append(capHeading);
    this.capacityEl = document.createElement('p');
    this.capacityEl.className = 'bakudan-throughput__capacity';
    this.capacityEl.style.fontFamily = 'var(--bakudan-font-mono)';
    capSection.append(this.capacityEl);
    root.append(capSection);

    // Target
    const targetSection = document.createElement('div');
    targetSection.className = 'bakudan-lab__section';
    const targetHeading = document.createElement('h3');
    targetHeading.textContent = opts.labels?.target ?? 'Target live count';
    targetSection.append(targetHeading);

    this.targetValueEl = document.createElement('p');
    this.targetValueEl.className = 'bakudan-throughput__target-value';
    targetSection.append(this.targetValueEl);

    // Quick targets
    const quickLabel = document.createElement('h4');
    quickLabel.textContent = opts.labels?.quickTargets ?? 'Quick targets';
    targetSection.append(quickLabel);
    this.quickContainer = document.createElement('div');
    this.quickContainer.className = 'bakudan-throughput__quick';
    this.quickContainer.setAttribute('role', 'group');
    this.quickContainer.setAttribute('aria-label', 'Quick targets');
    const quickTargets = opts.quickTargets ?? [];
    for (const qt of quickTargets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bakudan-lab__button';
      btn.textContent = qt.label;
      btn.dataset.value = String(qt.value);
      btn.setAttribute('aria-label', `Target ${qt.label}`);
      btn.addEventListener('click', () => opts.onTargetChange(qt.value));
      this.quickContainer.append(btn);
    }
    targetSection.append(this.quickContainer);

    // Custom target number input + slider
    const targetRange = opts.targetRange ?? { min: 0, max: 20000, step: 100 };
    const sliderRow = document.createElement('div');
    sliderRow.className = 'bakudan-lab__range-row';
    const sliderLabel = document.createElement('label');
    sliderLabel.textContent = 'Target';
    sliderLabel.style.fontSize = '11px';
    sliderLabel.style.color = 'var(--bakudan-text-muted)';
    this.targetSlider = document.createElement('input');
    this.targetSlider.type = 'range';
    this.targetSlider.className = 'bakudan-lab__range';
    this.targetSlider.min = String(targetRange.min);
    this.targetSlider.max = String(targetRange.max);
    this.targetSlider.step = String(targetRange.step);
    this.targetSlider.value = String(this.state.target);
    this.targetSlider.setAttribute('aria-label', 'Target live count');
    this.targetSlider.addEventListener('input', () => {
      const v = Number(this.targetSlider.value);
      if (Number.isFinite(v)) {
        this.targetInput.value = String(v);
        opts.onTargetChange(v);
      }
    });
    sliderRow.append(sliderLabel, this.targetSlider);
    targetSection.append(sliderRow);

    const inputLabel = document.createElement('label');
    inputLabel.textContent = 'Custom target';
    inputLabel.style.fontSize = '11px';
    inputLabel.style.color = 'var(--bakudan-text-muted)';
    this.targetInput = document.createElement('input');
    this.targetInput.type = 'number';
    this.targetInput.className = 'bakudan-lab__input';
    this.targetInput.min = String(targetRange.min);
    this.targetInput.max = String(targetRange.max);
    this.targetInput.step = String(targetRange.step);
    this.targetInput.value = String(this.state.target);
    this.targetInput.setAttribute('aria-label', 'Custom target count');
    this.targetInput.addEventListener('change', () => {
      const v = Number.parseInt(this.targetInput.value, 10);
      if (Number.isFinite(v)) opts.onTargetChange(v);
    });
    this.targetInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = Number.parseInt(this.targetInput.value, 10);
        if (Number.isFinite(v)) opts.onTargetChange(v);
      }
    });
    targetSection.append(inputLabel, this.targetInput);
    root.append(targetSection);

    // Rate
    const rateSection = document.createElement('div');
    rateSection.className = 'bakudan-lab__section';
    const rateHeading = document.createElement('h3');
    rateHeading.textContent = opts.labels?.rate ?? 'Spawn rate';
    rateSection.append(rateHeading);
    this.rateValueEl = document.createElement('p');
    this.rateValueEl.className = 'bakudan-throughput__rate-value';
    rateSection.append(this.rateValueEl);
    const rateRange = opts.rateRange ?? { min: 1, max: 6000, step: 10 };
    const rateRow = document.createElement('div');
    rateRow.className = 'bakudan-lab__range-row';
    const rateLbl = document.createElement('label');
    rateLbl.textContent = 'Rate';
    rateLbl.style.fontSize = '11px';
    rateLbl.style.color = 'var(--bakudan-text-muted)';
    this.rateSlider = document.createElement('input');
    this.rateSlider.type = 'range';
    this.rateSlider.className = 'bakudan-lab__range';
    this.rateSlider.min = String(rateRange.min);
    this.rateSlider.max = String(rateRange.max);
    this.rateSlider.step = String(rateRange.step);
    this.rateSlider.value = String(this.state.rate);
    this.rateSlider.setAttribute('aria-label', 'Spawn rate');
    this.rateSlider.addEventListener('input', () => {
      const v = Number(this.rateSlider.value);
      if (Number.isFinite(v)) opts.onRateChange(v);
    });
    rateRow.append(rateLbl, this.rateSlider);
    rateSection.append(rateRow);
    root.append(rateSection);

    // Distribution
    const distSection = document.createElement('div');
    distSection.className = 'bakudan-lab__section';
    const distHeading = document.createElement('h3');
    distHeading.textContent = opts.labels?.distribution ?? 'Distribution';
    distSection.append(distHeading);
    this.distributionGroup = document.createElement('div');
    this.distributionGroup.setAttribute('role', 'radiogroup');
    this.distributionGroup.setAttribute('aria-label', 'Distribution');
    this.distributionGroup.className = 'bakudan-throughput__distribution';
    this.distributionGroup.style.display = 'flex';
    this.distributionGroup.style.flexDirection = 'column';
    this.distributionGroup.style.gap = '8px';
    const dists = opts.distributions ?? [
      { id: 'steady', label: 'Steady' },
      { id: 'bursty', label: 'Bursty' },
    ];
    for (const d of dists) {
      const label = document.createElement('label');
      label.className = 'bakudan-lab__checkbox-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'bakudan-distribution';
      radio.value = d.id;
      radio.checked = d.id === this.state.distributionId;
      radio.setAttribute('aria-label', d.label);
      radio.addEventListener('change', () => {
        if (radio.checked) opts.onDistributionChange(d.id);
      });
      const span = document.createElement('span');
      span.textContent = d.label;
      label.append(radio, span);
      this.distributionGroup.append(label);
    }
    distSection.append(this.distributionGroup);
    // Preset counts display (distribution preset counts)
    const distCounts = document.createElement('p');
    distCounts.className = 'bakudan-throughput__dist-counts';
    distCounts.style.fontSize = '11px';
    distCounts.style.color = 'var(--bakudan-text-muted)';
    distCounts.textContent = 'Preset counts: steady · bursty distribution';
    distSection.append(distCounts);
    root.append(distSection);

    // Frame percentiles
    const frameSection = document.createElement('div');
    frameSection.className = 'bakudan-lab__section';
    const frameHeading = document.createElement('h3');
    frameHeading.textContent = opts.labels?.framePercentiles ?? 'Frame health';
    frameSection.append(frameHeading);
    this.frameContainer = document.createElement('div');
    this.frameContainer.className = 'bakudan-throughput__frame';
    this.frameContainer.style.display = 'flex';
    this.frameContainer.style.flexDirection = 'column';
    this.frameContainer.style.gap = '4px';
    const fm = opts.frameMetrics ?? [
      { id: 'fps', label: 'FPS' },
      { id: 'frame-time', label: 'Frame ms' },
    ];
    for (const m of fm) {
      const p = document.createElement('p');
      p.dataset.metric = m.id;
      p.style.fontFamily = 'var(--bakudan-font-mono)';
      p.style.fontSize = '11px';
      p.style.margin = '0';
      this.frameContainer.append(p);
    }
    frameSection.append(this.frameContainer);
    root.append(frameSection);

    // Draw split
    const drawSection = document.createElement('div');
    drawSection.className = 'bakudan-lab__section';
    const drawHeading = document.createElement('h3');
    drawHeading.textContent = opts.labels?.drawSplit ?? 'Draw split';
    drawSection.append(drawHeading);
    this.drawContainer = document.createElement('div');
    this.drawContainer.className = 'bakudan-throughput__draw';
    this.drawContainer.style.display = 'flex';
    this.drawContainer.style.flexDirection = 'column';
    this.drawContainer.style.gap = '4px';
    const dm = opts.drawMetrics ?? [
      { id: 'gl-runs', label: 'GL runs' },
      { id: 'gl-glyphs', label: 'GL glyphs' },
      { id: 'canvas-slots', label: 'Canvas slots' },
    ];
    for (const m of dm) {
      const p = document.createElement('p');
      p.dataset.metric = m.id;
      p.style.fontFamily = 'var(--bakudan-font-mono)';
      p.style.fontSize = '11px';
      p.style.margin = '0';
      this.drawContainer.append(p);
    }
    drawSection.append(this.drawContainer);
    root.append(drawSection);

    this.element = root;
    this.syncState(this.state);
  }

  private syncState(state: ThroughputState): void {
    this.state = state;
    const fmtCap = this.opts.labels?.formatCapacity ?? ((v: number) => v.toLocaleString());
    const fmtTarget = this.opts.labels?.formatTarget ?? ((v: number) => v.toLocaleString());
    const fmtRate = this.opts.labels?.formatRate ?? ((v: number) => `${v}/s`);
    const fmtMetric =
      this.opts.labels?.formatMetric ?? ((v: number) => `${Math.round(v * 10) / 10}`);
    const capLabel = this.opts.labels?.capacity ?? 'Pool capacity';
    const targetLabel = this.opts.labels?.target ?? 'Target live count';
    const rateLabel = this.opts.labels?.rate ?? 'Spawn rate';

    this.capacityEl.textContent = `${capLabel}: ${fmtCap(state.capacity)}`;
    this.targetValueEl.textContent = `${targetLabel}: ${fmtTarget(state.target)}`;
    this.rateValueEl.textContent = `${rateLabel}: ${fmtRate(state.rate)}`;

    // Sync sliders/inputs without fighting user drag
    const isTargetActive =
      document.activeElement === this.targetSlider || document.activeElement === this.targetInput;
    if (!isTargetActive) {
      this.targetSlider.value = String(state.target);
      this.targetInput.value = String(state.target);
    }
    const isRateActive = document.activeElement === this.rateSlider;
    if (!isRateActive) {
      this.rateSlider.value = String(state.rate);
    }

    // Quick targets highlight
    for (const btn of this.quickContainer.querySelectorAll<HTMLButtonElement>('button')) {
      const val = Number(btn.dataset.value);
      const isActive = val === state.target;
      btn.classList.toggle('bakudan-lab__button--primary', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    }

    // Distribution radios
    for (const input of this.distributionGroup.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )) {
      input.checked = input.value === state.distributionId;
    }

    // Frame metrics
    for (const el of this.frameContainer.querySelectorAll<HTMLElement>('[data-metric]')) {
      const id = el.dataset.metric!;
      const label = this.opts.frameMetrics?.find((m) => m.id === id)?.label ?? id;
      const v = state.framePercentiles[id];
      el.textContent = v !== undefined ? `${label}: ${fmtMetric(v)}` : `${label}: —`;
    }
    // Draw metrics
    for (const el of this.drawContainer.querySelectorAll<HTMLElement>('[data-metric]')) {
      const id = el.dataset.metric!;
      const label = this.opts.drawMetrics?.find((m) => m.id === id)?.label ?? id;
      const v = state.drawSplit[id];
      el.textContent = v !== undefined ? `${label}: ${fmtMetric(v)}` : `${label}: —`;
    }
  }

  setState(state: ThroughputState): void {
    this.syncState(state);
  }

  destroy(): void {
    this.element.remove();
  }
}
