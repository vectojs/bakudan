import { BAKUDAN_THEME } from '../../cinemaConfig';
import type { FontFamilyId, FontSizeId, FontWeightId } from '../../DanmakuLayer';

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
  /** Bilibili-like typography choices (CTX-0045). */
  fontFamily?: FontFamilyId;
  fontSizeChoice?: FontSizeId;
  fontWeight?: FontWeightId;
}

export interface InteractionsPanelOptions {
  state: InteractionsState;
  presets?: { id: string; label: string }[];
  effects?: { id: string; label: string }[];
  renderClasses?: { id: string; label: string }[];
  fontFamilies?: { id: FontFamilyId; label: string }[];
  fontSizes?: { id: FontSizeId; label: string }[];
  fontWeights?: { id: FontWeightId; label: string }[];
  labels?: {
    presets?: string;
    effects?: string;
    renderClasses?: string;
    typography?: string;
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
  };
  onPresetChange: (id: string) => void;
  onEffectChange: (id: string, enabled: boolean) => void;
  onHoverPauseChange?: (enabled: boolean) => void;
  onDragChange?: (enabled: boolean) => void;
  onReactionsChange?: (enabled: boolean) => void;
  onRepulsionChange?: (enabled: boolean) => void;
  onGravityChange?: (enabled: boolean) => void;
  onJellyChange?: (enabled: boolean) => void;
  onFontFamilyChange?: (id: FontFamilyId) => void;
  onFontSizeChange?: (id: FontSizeId) => void;
  onFontWeightChange?: (id: FontWeightId) => void;
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
  private readonly fontFamilyGroup: HTMLElement;
  private readonly fontSizeGroup: HTMLElement;
  private readonly fontWeightGroup: HTMLElement;

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
    // CTX-0044: rotation removed — per-char save/rotate was 10fps
    const presets = opts.presets ?? [
      { id: 'scroll', label: 'Scroll →' },
      { id: 'reverse', label: '← Reverse' },
      { id: 'top', label: 'Top Fixed' },
      { id: 'bottom', label: 'Bottom Fixed' },
      { id: 'sine', label: 'Sine Wave' },
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

    // Typography — Bilibili-like font family / size / weight (CTX-0045)
    const typoSection = document.createElement('div');
    typoSection.className = 'bakudan-lab__section';
    const typoHeading = document.createElement('h3');
    typoHeading.textContent = opts.labels?.typography ?? 'Typography';
    typoSection.append(typoHeading);

    const makeRadioGroup = <T extends string>(
      sectionTitle: string,
      groupLabel: string,
      choices: readonly { id: T; label: string }[],
      current: string | undefined,
      dataAttr: string,
      inputName: string,
      onChange: ((id: T) => void) | undefined,
    ): HTMLElement => {
      const groupTitle = document.createElement('h4');
      groupTitle.textContent = sectionTitle;
      groupTitle.style.fontSize = '11px';
      groupTitle.style.color = 'var(--bakudan-text-muted)';
      groupTitle.style.margin = '8px 0 4px';
      typoSection.append(groupTitle);
      const group = document.createElement('div');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', groupLabel);
      group.style.display = 'flex';
      group.style.flexDirection = 'column';
      group.style.gap = '8px';
      for (const c of choices) {
        const label = document.createElement('label');
        label.className = 'bakudan-lab__checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = inputName;
        radio.value = c.id;
        radio.checked = c.id === current;
        radio.dataset[dataAttr] = c.id;
        radio.setAttribute('aria-label', c.label);
        radio.addEventListener('change', () => {
          if (radio.checked) onChange?.(c.id);
        });
        const span = document.createElement('span');
        span.textContent = c.label;
        label.append(radio, span);
        group.append(label);
      }
      typoSection.append(group);
      return group;
    };

    const families = opts.fontFamilies ?? [
      { id: 'sans' as FontFamilyId, label: 'Sans' },
      { id: 'serif' as FontFamilyId, label: 'Serif' },
      { id: 'mono' as FontFamilyId, label: 'Mono' },
    ];
    const sizes = opts.fontSizes ?? [
      { id: 'small' as FontSizeId, label: 'Small' },
      { id: 'normal' as FontSizeId, label: 'Normal' },
      { id: 'large' as FontSizeId, label: 'Large' },
    ];
    const weights = opts.fontWeights ?? [
      { id: 'normal' as FontWeightId, label: 'Normal' },
      { id: 'bold' as FontWeightId, label: 'Bold' },
    ];

    this.fontFamilyGroup = makeRadioGroup(
      opts.labels?.fontFamily ?? 'Font family',
      'Font family',
      families,
      this.state.fontFamily ?? 'sans',
      'fontFamily',
      'bakudan-font-family',
      opts.onFontFamilyChange as ((id: string) => void) | undefined,
    );
    this.fontSizeGroup = makeRadioGroup(
      opts.labels?.fontSize ?? 'Font size',
      'Font size',
      sizes,
      this.state.fontSizeChoice ?? 'normal',
      'fontSize',
      'bakudan-font-size',
      opts.onFontSizeChange as ((id: string) => void) | undefined,
    );
    this.fontWeightGroup = makeRadioGroup(
      opts.labels?.fontWeight ?? 'Font weight',
      'Font weight',
      weights,
      this.state.fontWeight ?? 'normal',
      'fontWeight',
      'bakudan-font-weight',
      opts.onFontWeightChange as ((id: string) => void) | undefined,
    );

    root.append(typoSection);

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

  setState(state: unknown): void {
    const s = state as InteractionsState;
    this.state = s;
    // Presets
    for (const input of this.presetGroup.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )) {
      input.checked = input.value === s.presetId;
    }
    // Effects
    for (const input of this.effectContainer.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )) {
      const id = input.dataset.effect!;
      if (id in s.effects) input.checked = !!s.effects[id];
    }
    // Toggles
    if (s.hoverPause !== undefined) this.hoverPauseInput.checked = !!s.hoverPause;
    if (s.dragEnabled !== undefined) this.dragInput.checked = !!s.dragEnabled;
    if (s.reactionsEnabled !== undefined) this.reactionsInput.checked = !!s.reactionsEnabled;
    if (s.repulsionEnabled !== undefined) this.repulsionInput.checked = !!s.repulsionEnabled;
    if (s.gravityEnabled !== undefined) this.gravityInput.checked = !!s.gravityEnabled;
    if (s.jellyEnabled !== undefined) this.jellyInput.checked = !!s.jellyEnabled;
    // Render classes
    for (const el of this.renderContainer.querySelectorAll<HTMLElement>('[data-render-class]')) {
      const id = el.dataset.renderClass!;
      const label = this.opts.renderClasses?.find((r) => r.id === id)?.label ?? id;
      el.textContent = `${label}: ${s.renderClasses[id] ?? '—'}`;
    }
    // Typography
    if (s.fontFamily !== undefined) {
      for (const input of this.fontFamilyGroup.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]',
      )) {
        input.checked = input.value === s.fontFamily;
      }
    }
    if (s.fontSizeChoice !== undefined) {
      for (const input of this.fontSizeGroup.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]',
      )) {
        input.checked = input.value === s.fontSizeChoice;
      }
    }
    if (s.fontWeight !== undefined) {
      for (const input of this.fontWeightGroup.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]',
      )) {
        input.checked = input.value === s.fontWeight;
      }
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
