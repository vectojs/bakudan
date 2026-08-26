import { BAKUDAN_THEME } from '../../cinemaConfig';

export interface InteractionsState {
  presetId: string;
  effects: Record<string, boolean>;
  renderClasses: Record<string, string>;
  hoverPause?: boolean;
  dragEnabled?: boolean;
  reactionsEnabled?: boolean;
  repulsionEnabled?: boolean;
  gravityEnabled?: boolean;
  jellyEnabled?: boolean;
}

export interface InteractionsPanelOptions {
  state: InteractionsState;
  presets?: { id: string; label: string }[];
  effects?: { id: string; label: string }[];
  renderClasses?: { id: string; label: string }[];
  labels?: {
    presets?: string;
    effects?: string;
    renderClasses?: string;
  };
  onPresetChange: (id: string) => void;
  onEffectChange: (id: string, enabled: boolean) => void;
  onHoverPauseChange?: (enabled: boolean) => void;
  onDragChange?: (enabled: boolean) => void;
  onReactionsChange?: (enabled: boolean) => void;
  onRepulsionChange?: (enabled: boolean) => void;
  onGravityChange?: (enabled: boolean) => void;
  onJellyChange?: (enabled: boolean) => void;
}

/**
 * Vanilla HTML Interactions panel — preset radio, effect checkboxes,
 * and toggles for hover pause, drag, reactions, repulsion, gravity, Jelly.
 */
export class InteractionsPanelHTML {
  readonly element: HTMLElement;
  private readonly opts: InteractionsPanelOptions;
  private state: InteractionsState;

  private readonly presetGroup: HTMLElement;
  private readonly effectContainer: HTMLElement;
  private readonly renderContainer: HTMLElement;
  private readonly hoverPauseInput: HTMLInputElement;
  private readonly dragInput: HTMLInputElement;
  private readonly reactionsInput: HTMLInputElement;
  private readonly repulsionInput: HTMLInputElement;
  private readonly gravityInput: HTMLInputElement;
  private readonly jellyInput: HTMLInputElement;

  constructor(opts: InteractionsPanelOptions) {
    this.opts = opts;
    this.state = opts.state;

    const root = document.createElement('div');
    root.className = 'bakudan-interactions';
    for (const [k, v] of Object.entries({
      '--bakudan-surface': BAKUDAN_THEME.surface,
      '--bakudan-surface-raised': BAKUDAN_THEME.surfaceRaised,
      '--bakudan-border': BAKUDAN_THEME.border,
      '--bakudan-text': BAKUDAN_THEME.text,
      '--bakudan-text-muted': BAKUDAN_THEME.textMuted,
      '--bakudan-accent': BAKUDAN_THEME.accent,
      '--bakudan-focus-ring': BAKUDAN_THEME.focusRing,
      '--bakudan-font-ui': BAKUDAN_THEME.fontUi,
      '--bakudan-font-mono': BAKUDAN_THEME.fontMono,
      '--bakudan-font-label': BAKUDAN_THEME.fontLabel,
    })) {
      root.style.setProperty(k, v);
    }

    // Interaction toggles (task requires hover pause, drag, reactions, repulsion, gravity, Jelly)
    const togglesSection = document.createElement('div');
    togglesSection.className = 'bakudan-lab__section';
    const togglesHeading = document.createElement('h3');
    togglesHeading.textContent = 'Interactions';
    togglesSection.append(togglesHeading);

    const makeToggle = (
      labelText: string,
      initial: boolean,
      onChange?: (v: boolean) => void,
    ): HTMLInputElement => {
      const row = document.createElement('label');
      row.className = 'bakudan-lab__checkbox-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = initial;
      input.setAttribute('aria-label', labelText);
      input.addEventListener('change', () => onChange?.(input.checked));
      const span = document.createElement('span');
      span.textContent = labelText;
      row.append(input, span);
      togglesSection.append(row);
      return input;
    };

    this.hoverPauseInput = makeToggle(
      'Hover pause',
      !!this.state.hoverPause,
      opts.onHoverPauseChange,
    );
    this.dragInput = makeToggle('Drag', this.state.dragEnabled ?? true, opts.onDragChange);
    this.reactionsInput = makeToggle(
      'Reactions',
      this.state.reactionsEnabled ?? true,
      opts.onReactionsChange,
    );
    this.repulsionInput = makeToggle(
      'Repulsion',
      !!this.state.repulsionEnabled,
      opts.onRepulsionChange,
    );
    this.gravityInput = makeToggle('Gravity', !!this.state.gravityEnabled, opts.onGravityChange);
    this.jellyInput = makeToggle('Jelly', !!this.state.jellyEnabled, opts.onJellyChange);

    root.append(togglesSection);

    // Presets
    const presetSection = document.createElement('div');
    presetSection.className = 'bakudan-lab__section';
    const presetHeading = document.createElement('h3');
    presetHeading.textContent = opts.labels?.presets ?? 'Motion preset';
    presetSection.append(presetHeading);
    this.presetGroup = document.createElement('div');
    this.presetGroup.setAttribute('role', 'radiogroup');
    this.presetGroup.setAttribute('aria-label', 'Motion preset');
    this.presetGroup.style.display = 'flex';
    this.presetGroup.style.flexDirection = 'column';
    this.presetGroup.style.gap = '8px';
    const presets = opts.presets ?? [
      { id: 'scroll', label: 'Scroll →' },
      { id: 'reverse', label: '← Reverse' },
      { id: 'top', label: 'Top Fixed' },
      { id: 'bottom', label: 'Bottom Fixed' },
      { id: 'sine', label: 'Sine Wave' },
      { id: 'rotation', label: 'Rotating Chars' },
      { id: 'glitch', label: 'Glitch Effect' },
      { id: 'repulsion', label: 'Cursor Repulsion' },
    ];
    for (const p of presets) {
      const label = document.createElement('label');
      label.className = 'bakudan-lab__checkbox-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'bakudan-preset';
      radio.value = p.id;
      radio.checked = p.id === this.state.presetId;
      radio.setAttribute('aria-label', p.label);
      radio.addEventListener('change', () => {
        if (radio.checked) opts.onPresetChange(p.id);
      });
      const span = document.createElement('span');
      span.textContent = p.label;
      label.append(radio, span);
      this.presetGroup.append(label);
    }
    presetSection.append(this.presetGroup);
    root.append(presetSection);

    // Effects
    const effectsSection = document.createElement('div');
    effectsSection.className = 'bakudan-lab__section';
    const effectsHeading = document.createElement('h3');
    effectsHeading.textContent = opts.labels?.effects ?? 'New-comment effects';
    effectsSection.append(effectsHeading);
    this.effectContainer = document.createElement('div');
    this.effectContainer.style.display = 'flex';
    this.effectContainer.style.flexDirection = 'column';
    this.effectContainer.style.gap = '8px';
    const effects = opts.effects ?? [
      { id: 'glow', label: 'Neon Glow' },
      { id: 'gradient', label: 'Color Gradient' },
      { id: 'rainbow', label: 'Rainbow Cycle' },
      { id: 'outline', label: 'Text Outline' },
    ];
    for (const e of effects) {
      const label = document.createElement('label');
      label.className = 'bakudan-lab__checkbox-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!this.state.effects[e.id];
      cb.dataset.effect = e.id;
      cb.setAttribute('aria-label', e.label);
      cb.addEventListener('change', () => opts.onEffectChange(e.id, cb.checked));
      const span = document.createElement('span');
      span.textContent = e.label;
      label.append(cb, span);
      this.effectContainer.append(label);
    }
    effectsSection.append(this.effectContainer);
    root.append(effectsSection);

    // Render classes
    const renderSection = document.createElement('div');
    renderSection.className = 'bakudan-lab__section';
    const renderHeading = document.createElement('h3');
    renderHeading.textContent = opts.labels?.renderClasses ?? 'Render classes';
    renderSection.append(renderHeading);
    this.renderContainer = document.createElement('div');
    this.renderContainer.style.display = 'flex';
    this.renderContainer.style.flexDirection = 'column';
    this.renderContainer.style.gap = '4px';
    const renderClasses = opts.renderClasses ?? [
      { id: 'backend', label: 'Backend' },
      { id: 'glyphs', label: 'MSDF glyphs' },
      { id: 'canvas', label: 'Canvas fallbacks' },
    ];
    for (const rc of renderClasses) {
      const p = document.createElement('p');
      p.dataset.renderClass = rc.id;
      p.style.fontFamily = 'var(--bakudan-font-mono)';
      p.style.fontSize = '11px';
      p.style.margin = '0';
      p.textContent = `${rc.label}: ${this.state.renderClasses[rc.id] ?? '—'}`;
      this.renderContainer.append(p);
    }
    renderSection.append(this.renderContainer);
    root.append(renderSection);

    this.element = root;
  }

  setState(state: InteractionsState): void {
    this.state = state;
    // Presets
    for (const input of this.presetGroup.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )) {
      input.checked = input.value === state.presetId;
    }
    // Effects
    for (const input of this.effectContainer.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )) {
      const id = input.dataset.effect!;
      if (id in state.effects) input.checked = !!state.effects[id];
    }
    // Toggles
    if (state.hoverPause !== undefined) this.hoverPauseInput.checked = !!state.hoverPause;
    if (state.dragEnabled !== undefined) this.dragInput.checked = !!state.dragEnabled;
    if (state.reactionsEnabled !== undefined)
      this.reactionsInput.checked = !!state.reactionsEnabled;
    if (state.repulsionEnabled !== undefined)
      this.repulsionInput.checked = !!state.repulsionEnabled;
    if (state.gravityEnabled !== undefined) this.gravityInput.checked = !!state.gravityEnabled;
    if (state.jellyEnabled !== undefined) this.jellyInput.checked = !!state.jellyEnabled;
    // Render classes
    for (const el of this.renderContainer.querySelectorAll<HTMLElement>('[data-render-class]')) {
      const id = el.dataset.renderClass!;
      const label = this.opts.renderClasses?.find((r) => r.id === id)?.label ?? id;
      el.textContent = `${label}: ${state.renderClasses[id] ?? '—'}`;
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
