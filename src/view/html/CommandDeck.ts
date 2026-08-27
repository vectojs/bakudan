import '../../styles/command.css';
import { BAKUDAN_THEME } from '../cinemaConfig';

export interface CommandDeckState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedRanges: readonly { start: number; end: number }[] | TimeRanges;
  rate: number;
  pendingSendText: string;
  labOpen: boolean;
  disabled?: boolean;
  danmakuStyle?: {
    opacity: number;
    outlineEnabled: boolean;
    outlineColor: string;
    outlineWidth: number;
    shadowEnabled: boolean;
    shadowColor: string;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
  };
  danmakuColor?: string;
  fontSizeChoice?: string;
}

export interface CommandDeckOptions {
  onTogglePlayback: () => void;
  onSeek: (time: number) => void;
  onSeekDelta: (delta: number) => void;
  onRateChange: (rate: number) => void;
  onSend: (text: string) => void;
  onLabToggle: () => void;
  getState: () => CommandDeckState;
  onColorChange?: (color: string) => void;
  onDanmakuStyleChange?: (patch: Partial<NonNullable<CommandDeckState['danmakuStyle']>>) => void;
  onFontSizeChange?: (size: string) => void;
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function normalizeBuffered(
  buffered: CommandDeckState['bufferedRanges'],
): { start: number; end: number }[] {
  if (!buffered) return [];
  // TimeRanges object
  if (
    typeof (buffered as TimeRanges).length === 'number' &&
    typeof (buffered as TimeRanges).start === 'function'
  ) {
    const ranges = buffered as TimeRanges;
    const result: { start: number; end: number }[] = [];
    for (let i = 0; i < ranges.length; i++) {
      try {
        result.push({ start: ranges.start(i), end: ranges.end(i) });
      } catch {
        break;
      }
    }
    return result;
  }
  return [...(buffered as readonly { start: number; end: number }[])];
}

function bufferedSignature(
  ranges: readonly { start: number; end: number }[],
  duration: number,
): string {
  if (ranges.length === 0 || duration <= 0) return `0:${duration.toFixed(1)}`;
  const parts = ranges.map((r) => `${r.start.toFixed(2)}-${r.end.toFixed(2)}`).join(',');
  return `${parts}|${duration.toFixed(2)}`;
}

/**
 * Vanilla HTML command deck that replaces DanmakuCommandDeck (canvas) for phase 3.
 * Mounts into #command-deck (already a <footer> in index.html).
 *
 * Theme tokens are mapped to CSS vars (--bakudan-*) so command.css never hardcodes
 * a palette value. Timeline uses native <input type="range"> with CSS vars
 * --progress and --buffered-end for buffered span + playhead.
 */
/**
 * Bilibili's danmaku palette — 12 signature colors users pick from (white + primaries + bilibili pink/blue).
 * Keep order stable so snapshot tests can assert it.
 */
export const BILIBILI_PALETTE: readonly string[] = [
  '#FFFFFF',
  '#FE0302',
  '#FF7204',
  '#FFAA02',
  '#FFD302',
  '#A0EE00',
  '#00CD00',
  '#019899',
  '#00A1D6',
  '#4266BE',
  '#6525CF',
  '#D4237A',
  '#FB7299',
  '#222222',
] as const;

export class CommandDeckHTML {
  private readonly container: HTMLElement;
  private readonly opts: CommandDeckOptions;
  private readonly root: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly timelineWrap: HTMLElement;
  private readonly timeline: HTMLInputElement;
  private readonly elapsed: HTMLElement;
  private readonly rateSelect: HTMLSelectElement;
  private readonly composer: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly labButton: HTMLButtonElement;
  // CTX-0046: Bilibili-like danmaku toolbar (color dots + style toggles)
  private readonly styleBar: HTMLElement;
  private readonly paletteWrap: HTMLElement;
  private readonly colorDots = new Map<string, HTMLButtonElement>();
  private readonly fontSizeGroup: HTMLElement;
  private readonly outlineToggle: HTMLButtonElement;
  private readonly shadowToggle: HTMLButtonElement;
  private readonly opacityRange: HTMLInputElement;
  private readonly opacityLabel: HTMLElement;
  private destroyed = false;
  private lastBufferedSignature = '';
  private lastDuration = 0;

  constructor(container: HTMLElement, opts: CommandDeckOptions) {
    this.container = container;
    this.opts = opts;

    // Map theme tokens to CSS vars — command.css reads these, never hardcodes.
    container.style.setProperty('--bakudan-surface', BAKUDAN_THEME.surface);
    container.style.setProperty('--bakudan-surface-raised', BAKUDAN_THEME.surfaceRaised);
    container.style.setProperty('--bakudan-border', BAKUDAN_THEME.border);
    container.style.setProperty('--bakudan-text', BAKUDAN_THEME.text);
    container.style.setProperty('--bakudan-text-muted', BAKUDAN_THEME.textMuted);
    container.style.setProperty('--bakudan-accent', BAKUDAN_THEME.accent);
    container.style.setProperty('--bakudan-accent-hover', BAKUDAN_THEME.accentHover);
    container.style.setProperty('--bakudan-signal', BAKUDAN_THEME.signal);
    container.style.setProperty('--bakudan-focus-ring', BAKUDAN_THEME.focusRing);
    container.style.setProperty('--bakudan-buffered-track', BAKUDAN_THEME.bufferedTrack);
    // pulse = accent per one-accent policy; progress uses pulse
    container.style.setProperty('--bakudan-pulse', BAKUDAN_THEME.accent);
    container.style.setProperty('--bakudan-track', BAKUDAN_THEME.border);
    container.style.setProperty('--bakudan-font-ui', BAKUDAN_THEME.fontUi);
    container.style.setProperty('--bakudan-font-mono', BAKUDAN_THEME.fontMono);
    container.style.setProperty('--bakudan-font-label', BAKUDAN_THEME.fontLabel);
    container.style.setProperty('--bakudan-font-display', BAKUDAN_THEME.fontDisplay);

    container.classList.add('bakudan-command-host');

    this.root = document.createElement('div');
    this.root.className = 'bakudan-command';
    this.root.setAttribute('role', 'toolbar');
    this.root.setAttribute('aria-label', 'Playback controls');

    // Play / Pause
    this.playButton = document.createElement('button');
    this.playButton.type = 'button';
    this.playButton.className = 'bakudan-command__play';
    this.playButton.setAttribute('aria-label', 'Play');
    this.playButton.setAttribute('aria-pressed', 'false');
    this.playButton.textContent = 'Play';

    // Timeline wrap + range + elapsed
    this.timelineWrap = document.createElement('div');
    this.timelineWrap.className = 'bakudan-command__timeline-wrap';

    this.timeline = document.createElement('input');
    this.timeline.type = 'range';
    this.timeline.className = 'bakudan-command__timeline';
    this.timeline.min = '0';
    this.timeline.max = '100';
    this.timeline.step = '0.1';
    this.timeline.value = '0';
    this.timeline.setAttribute('role', 'slider');
    this.timeline.setAttribute('aria-label', 'Video position');
    this.timeline.setAttribute('aria-valuemin', '0');
    this.timeline.setAttribute('aria-valuemax', '100');
    this.timeline.setAttribute('aria-valuenow', '0');
    // CSS vars for buffered + progress
    this.timeline.style.setProperty('--progress', '0');
    this.timeline.style.setProperty('--buffered-end', '0');
    this.timelineWrap.style.setProperty('--progress', '0');
    this.timelineWrap.style.setProperty('--buffered-end', '0');

    this.elapsed = document.createElement('span');
    this.elapsed.className = 'bakudan-command__elapsed';
    this.elapsed.setAttribute('aria-live', 'polite');
    this.elapsed.textContent = '0:00 / 0:00';

    this.timelineWrap.append(this.timeline, this.elapsed);

    // Rate select
    this.rateSelect = document.createElement('select');
    this.rateSelect.className = 'bakudan-command__rate';
    this.rateSelect.setAttribute('aria-label', 'Playback rate');
    for (const value of [0.5, 1, 1.5, 2] as const) {
      const opt = document.createElement('option');
      opt.value = String(value);
      opt.textContent = `${value}×`;
      this.rateSelect.append(opt);
    }
    this.rateSelect.value = '1';

    // Composer: input + Send
    this.composer = document.createElement('div');
    this.composer.className = 'bakudan-command__composer';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'bakudan-command__input';
    this.input.placeholder = 'Send a danmaku…';
    this.input.setAttribute('aria-label', 'Danmaku input');

    this.sendButton = document.createElement('button');
    this.sendButton.type = 'button';
    this.sendButton.className = 'bakudan-command__send';
    this.sendButton.setAttribute('aria-label', 'Send danmaku');
    this.sendButton.textContent = 'Send';

    this.composer.append(this.input, this.sendButton);

    // Lab toggle
    this.labButton = document.createElement('button');
    this.labButton.type = 'button';
    this.labButton.className = 'bakudan-command__lab';
    this.labButton.setAttribute('aria-label', 'Toggle Lab');
    this.labButton.setAttribute('aria-pressed', 'false');
    this.labButton.textContent = 'Lab';

    // CTX-0046: Bilibili-like danmaku style bar — color palette + font/size + outline/shadow/opacity
    // Mimics Bilibili's bottom control bar: "A" font buttons, color dots, border & shadow toggles, opacity slider.
    this.styleBar = document.createElement('div');
    this.styleBar.className = 'bakudan-command__stylebar';
    this.styleBar.setAttribute('role', 'toolbar');
    this.styleBar.setAttribute('aria-label', 'Danmaku style');

    // Palette dots (Bilibili 12-color grid condensed to a row)
    this.paletteWrap = document.createElement('div');
    this.paletteWrap.className = 'bakudan-command__palette';
    this.paletteWrap.setAttribute('role', 'group');
    this.paletteWrap.setAttribute('aria-label', 'Danmaku color');
    for (const col of BILIBILI_PALETTE) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'bakudan-command__color-dot';
      dot.dataset.color = col;
      dot.setAttribute('aria-label', `Danmaku color ${col}`);
      dot.style.background = col;
      // White needs border so it stays visible on dark deck
      if (col.toLowerCase() === '#ffffff') dot.style.border = '1px solid rgba(148,163,184,0.6)';
      dot.addEventListener('click', () => this.opts.onColorChange?.(col));
      this.paletteWrap.append(dot);
      this.colorDots.set(col, dot);
    }
    this.styleBar.append(this.paletteWrap);

    // Font size quick pick (Bilibili "A" size: 小/标准/大)
    this.fontSizeGroup = document.createElement('div');
    this.fontSizeGroup.className = 'bakudan-command__fontsize';
    this.fontSizeGroup.setAttribute('role', 'group');
    this.fontSizeGroup.setAttribute('aria-label', 'Font size');
    for (const sz of ['small', 'normal', 'large'] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bakudan-command__fontsize-btn';
      btn.dataset.size = sz;
      btn.setAttribute('aria-label', `Font size ${sz}`);
      // Visual: A with varying size like Bilibili
      btn.textContent = sz === 'small' ? 'A-' : sz === 'large' ? 'A+' : 'A';
      btn.style.fontSize = sz === 'small' ? '12px' : sz === 'large' ? '16px' : '14px';
      btn.addEventListener('click', () => this.opts.onFontSizeChange?.(sz));
      this.fontSizeGroup.append(btn);
    }
    this.styleBar.append(this.fontSizeGroup);

    // Outline toggle (Bilibili “描边”)
    this.outlineToggle = document.createElement('button');
    this.outlineToggle.type = 'button';
    this.outlineToggle.className = 'bakudan-command__style-toggle';
    this.outlineToggle.dataset.toggle = 'outline';
    this.outlineToggle.setAttribute('aria-pressed', 'true');
    this.outlineToggle.setAttribute('aria-label', 'Outline');
    this.outlineToggle.textContent = '◯';
    this.outlineToggle.title = 'Border / Outline (Bilibili 描边)';
    this.outlineToggle.addEventListener('click', () => {
      const pressed = this.outlineToggle.getAttribute('aria-pressed') === 'true';
      this.opts.onDanmakuStyleChange?.({ outlineEnabled: !pressed });
    });
    this.styleBar.append(this.outlineToggle);

    // Shadow toggle (Bilibili “阴影”)
    this.shadowToggle = document.createElement('button');
    this.shadowToggle.type = 'button';
    this.shadowToggle.className = 'bakudan-command__style-toggle';
    this.shadowToggle.dataset.toggle = 'shadow';
    this.shadowToggle.setAttribute('aria-pressed', 'true');
    this.shadowToggle.setAttribute('aria-label', 'Shadow');
    this.shadowToggle.textContent = '⬒';
    this.shadowToggle.title = 'Shadow (Bilibili 阴影)';
    this.shadowToggle.addEventListener('click', () => {
      const pressed = this.shadowToggle.getAttribute('aria-pressed') === 'true';
      this.opts.onDanmakuStyleChange?.({ shadowEnabled: !pressed });
    });
    this.styleBar.append(this.shadowToggle);

    // Opacity slider (Bilibili “不透明度” 0-100%)
    const opacityWrap = document.createElement('label');
    opacityWrap.className = 'bakudan-command__opacity';
    opacityWrap.textContent = 'Opacity';
    this.opacityRange = document.createElement('input');
    this.opacityRange.type = 'range';
    this.opacityRange.className = 'bakudan-command__opacity-range';
    this.opacityRange.min = '0.2';
    this.opacityRange.max = '1';
    this.opacityRange.step = '0.05';
    this.opacityRange.value = '1';
    this.opacityRange.setAttribute('aria-label', 'Danmaku opacity');
    this.opacityLabel = document.createElement('span');
    this.opacityLabel.className = 'bakudan-command__opacity-value';
    this.opacityLabel.textContent = '100%';
    this.opacityRange.addEventListener('input', () => {
      const v = Number.parseFloat(this.opacityRange.value);
      this.opts.onDanmakuStyleChange?.({ opacity: Number.isFinite(v) ? v : 1 });
    });
    opacityWrap.append(this.opacityRange, this.opacityLabel);
    this.styleBar.append(opacityWrap);

    // Order: play, timeline, elapsed (inside wrap), rate, composer, lab
    // But spec order is [play] [timeline] [elapsed] [rate] [input+Send] [Lab]
    // We keep elapsed inside wrap next to timeline, then rate, composer, lab
    this.root.append(
      this.playButton,
      this.timelineWrap,
      this.rateSelect,
      this.composer,
      this.labButton,
      this.styleBar,
    );

    // Events
    this.playButton.addEventListener('click', this.handlePlay);
    this.timeline.addEventListener('input', this.handleTimelineInput);
    this.timeline.addEventListener('change', this.handleTimelineInput);
    this.rateSelect.addEventListener('change', this.handleRateChange);
    this.input.addEventListener('keydown', this.handleInputKeydown);
    this.sendButton.addEventListener('click', this.handleSend);
    this.labButton.addEventListener('click', this.handleLab);

    this.container.replaceChildren(this.root);

    // Initial render
    try {
      this.update(this.opts.getState());
    } catch {
      // getState may throw before App fully wired
    }
  }

  private readonly handlePlay = (): void => {
    if (this.destroyed) return;
    this.opts.onTogglePlayback();
  };

  private readonly handleTimelineInput = (): void => {
    if (this.destroyed) return;
    const value = Number.parseFloat(this.timeline.value);
    if (!Number.isFinite(value)) return;
    this.opts.onSeek(value);
  };

  private readonly handleRateChange = (): void => {
    if (this.destroyed) return;
    const value = Number.parseFloat(this.rateSelect.value);
    if (!Number.isFinite(value)) return;
    this.opts.onRateChange(value);
  };

  private readonly handleInputKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || (event as unknown as { isComposing?: boolean }).isComposing)
      return;
    event.preventDefault();
    this.dispatchSend();
  };

  private readonly handleSend = (): void => {
    this.dispatchSend();
  };

  private readonly handleLab = (): void => {
    if (this.destroyed) return;
    this.opts.onLabToggle();
  };

  private dispatchSend(): void {
    if (this.destroyed) return;
    if (this.input.disabled) return;
    const text = this.input.value.trim();
    if (text.length === 0) return;
    this.opts.onSend(text);
    this.input.value = '';
  }

  update(state: CommandDeckState): void {
    if (this.destroyed) return;

    const raw = state as unknown as Record<string, unknown>;
    // Support both isPlaying and playing aliases
    const isPlaying =
      typeof raw.isPlaying === 'boolean'
        ? (raw.isPlaying as boolean)
        : typeof raw.playing === 'boolean'
          ? (raw.playing as boolean)
          : false;
    const currentTime = Number.isFinite(raw.currentTime as number)
      ? (raw.currentTime as number)
      : 0;
    const duration = Number.isFinite(raw.duration as number)
      ? Math.max(0, raw.duration as number)
      : 0;
    const rate = Number.isFinite(raw.rate as number) ? (raw.rate as number) : 1;
    const labOpen = typeof raw.labOpen === 'boolean' ? (raw.labOpen as boolean) : false;
    const disabled = typeof raw.disabled === 'boolean' ? (raw.disabled as boolean) : false;
    const pendingSendText =
      typeof raw.pendingSendText === 'string' ? (raw.pendingSendText as string) : '';

    // Play / pause button
    const playLabel = isPlaying ? 'Pause' : 'Play';
    if (this.playButton.textContent !== playLabel) this.playButton.textContent = playLabel;
    this.playButton.setAttribute('aria-label', playLabel);
    this.playButton.setAttribute('aria-pressed', String(isPlaying));
    this.playButton.disabled = disabled;

    // Timeline range attrs
    const clampedCurrent = Math.max(0, Math.min(duration, currentTime));
    const maxForInput = duration > 0 ? duration : 1;
    const maxStr = String(maxForInput);
    if (this.timeline.max !== maxStr) this.timeline.max = maxStr;
    // Avoid fighting user drag: only update value when not actively dragging
    const isTimelineActive = document.activeElement === this.timeline;
    if (!isTimelineActive) {
      // Avoid setting same value to prevent extra events
      const currentVal = Number.parseFloat(this.timeline.value);
      if (Math.abs(currentVal - clampedCurrent) > 0.001) {
        this.timeline.value = String(clampedCurrent);
      }
    }
    this.timeline.setAttribute('aria-valuemin', '0');
    this.timeline.setAttribute('aria-valuemax', String(duration));
    this.timeline.setAttribute('aria-valuenow', String(clampedCurrent));
    this.timeline.setAttribute(
      'aria-valuetext',
      `${formatTime(clampedCurrent)} of ${formatTime(duration)}`,
    );
    this.timeline.disabled = disabled;
    if (disabled) {
      this.timeline.setAttribute('aria-disabled', 'true');
    } else {
      this.timeline.removeAttribute('aria-disabled');
    }

    // Progress CSS var — update every frame (cheap)
    const progress = duration > 0 ? clampedCurrent / duration : 0;
    const progressStr = String(Math.max(0, Math.min(1, progress)));
    this.timeline.style.setProperty('--progress', progressStr);
    this.timelineWrap.style.setProperty('--progress', progressStr);

    // Buffered ranges — pixel-compare guard: only update if signature changed
    const normalized = normalizeBuffered(state.bufferedRanges);
    const sig = bufferedSignature(normalized, duration);
    if (sig !== this.lastBufferedSignature || duration !== this.lastDuration) {
      this.lastBufferedSignature = sig;
      this.lastDuration = duration;
      let bufferedEnd = 0;
      if (normalized.length > 0 && duration > 0) {
        let maxEnd = 0;
        for (const range of normalized) {
          if (Number.isFinite(range.end)) maxEnd = Math.max(maxEnd, range.end);
        }
        bufferedEnd = Math.max(0, Math.min(1, maxEnd / duration));
      }
      const bufferedStr = String(bufferedEnd);
      this.timeline.style.setProperty('--buffered-end', bufferedStr);
      this.timelineWrap.style.setProperty('--buffered-end', bufferedStr);
    }

    // Elapsed text
    const elapsedText = `${formatTime(clampedCurrent)} / ${formatTime(duration)}`;
    if (this.elapsed.textContent !== elapsedText) this.elapsed.textContent = elapsedText;

    // Rate select — snap to nearest option
    const candidates = [0.5, 1, 1.5, 2];
    let closest = candidates[1]!;
    let best = Math.abs(closest - rate);
    for (const c of candidates) {
      const diff = Math.abs(c - rate);
      if (diff < best) {
        best = diff;
        closest = c;
      }
    }
    const rateStr = String(closest);
    if (this.rateSelect.value !== rateStr) this.rateSelect.value = rateStr;
    this.rateSelect.disabled = disabled;
    if (disabled) {
      this.rateSelect.setAttribute('aria-disabled', 'true');
    } else {
      this.rateSelect.removeAttribute('aria-disabled');
    }

    // Composer: disable input + Send when transport is disabled (CTX-0038 P2-02)
    this.input.disabled = disabled;
    this.sendButton.disabled = disabled;
    if (disabled) {
      this.input.setAttribute('aria-disabled', 'true');
      this.sendButton.setAttribute('aria-disabled', 'true');
    } else {
      this.input.removeAttribute('aria-disabled');
      this.sendButton.removeAttribute('aria-disabled');
    }

    // Composer input — respect pendingSendText when not focused
    if (pendingSendText !== undefined) {
      const isInputFocused = document.activeElement === this.input;
      if (!isInputFocused && this.input.value !== pendingSendText) {
        this.input.value = pendingSendText;
      }
    }

    // Lab toggle
    this.labButton.setAttribute('aria-pressed', String(labOpen));
    // Keep text as "Lab" per spec (not Open/Close variant) but reflect pressed state via aria
    if (this.labButton.textContent !== 'Lab') this.labButton.textContent = 'Lab';

    // CTX-0046: Bilibili palette + style sync — keep cheap, no extra events
    const danmakuColor = typeof raw.danmakuColor === 'string' ? (raw.danmakuColor as string) : '';
    if (danmakuColor) {
      for (const [col, dot] of this.colorDots) {
        const isActive = col.toLowerCase() === danmakuColor.toLowerCase();
        dot.setAttribute('aria-pressed', String(isActive));
        dot.classList.toggle('bakudan-command__color-dot--active', isActive);
        dot.style.outline = isActive ? '2px solid var(--bakudan-focus-ring, #60a5fa)' : '';
        dot.style.outlineOffset = isActive ? '2px' : '';
      }
      // Tint composer input border with the chosen color (bilibili: input shows active color)
      this.input.style.borderColor = danmakuColor;
      this.input.style.boxShadow = `0 0 0 2px ${danmakuColor}22`;
    }
    const fontSizeChoice =
      typeof raw.fontSizeChoice === 'string' ? (raw.fontSizeChoice as string) : '';
    if (fontSizeChoice) {
      for (const btn of this.fontSizeGroup.querySelectorAll<HTMLButtonElement>(
        '.bakudan-command__fontsize-btn',
      )) {
        const isActive = btn.dataset.size === fontSizeChoice;
        btn.setAttribute('aria-pressed', String(isActive));
        btn.classList.toggle('bakudan-command__fontsize-btn--active', isActive);
        btn.style.background = isActive ? 'var(--bakudan-accent, #f43f5e)' : '';
        btn.style.color = isActive ? '#fff' : '';
      }
    }
    const ds = raw.danmakuStyle as
      | {
          opacity?: number;
          outlineEnabled?: boolean;
          outlineColor?: string;
          outlineWidth?: number;
          shadowEnabled?: boolean;
          shadowColor?: string;
          shadowBlur?: number;
        }
      | undefined;
    if (ds) {
      if (typeof ds.outlineEnabled === 'boolean') {
        this.outlineToggle.setAttribute('aria-pressed', String(ds.outlineEnabled));
        this.outlineToggle.classList.toggle(
          'bakudan-command__style-toggle--active',
          ds.outlineEnabled,
        );
        this.outlineToggle.style.background = ds.outlineEnabled
          ? 'var(--bakudan-accent, #f43f5e)'
          : '';
        this.outlineToggle.style.color = ds.outlineEnabled ? '#fff' : '';
      }
      if (typeof ds.shadowEnabled === 'boolean') {
        this.shadowToggle.setAttribute('aria-pressed', String(ds.shadowEnabled));
        this.shadowToggle.classList.toggle(
          'bakudan-command__style-toggle--active',
          ds.shadowEnabled,
        );
        this.shadowToggle.style.background = ds.shadowEnabled
          ? 'var(--bakudan-accent, #f43f5e)'
          : '';
        this.shadowToggle.style.color = ds.shadowEnabled ? '#fff' : '';
      }
      if (typeof ds.opacity === 'number' && Number.isFinite(ds.opacity)) {
        const v = Math.max(0.2, Math.min(1, ds.opacity));
        if (Math.abs(Number.parseFloat(this.opacityRange.value) - v) > 0.01) {
          this.opacityRange.value = String(v);
        }
        this.opacityLabel.textContent = `${Math.round(v * 100)}%`;
        this.opacityRange.setAttribute('aria-valuenow', String(v));
      }
    }
    // Danmaku style bar disabled state mirrors composer disabled (video mode only)
    const styleDisabled = disabled;
    this.styleBar.setAttribute('aria-disabled', String(styleDisabled));
    this.styleBar.style.opacity = styleDisabled ? '0.55' : '';
    this.styleBar.style.pointerEvents = styleDisabled ? 'none' : '';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playButton.removeEventListener('click', this.handlePlay);
    this.timeline.removeEventListener('input', this.handleTimelineInput);
    this.timeline.removeEventListener('change', this.handleTimelineInput);
    this.rateSelect.removeEventListener('change', this.handleRateChange);
    this.input.removeEventListener('keydown', this.handleInputKeydown);
    this.sendButton.removeEventListener('click', this.handleSend);
    this.labButton.removeEventListener('click', this.handleLab);
    this.root.remove();
    this.container.classList.remove('bakudan-command-host');
  }
}
