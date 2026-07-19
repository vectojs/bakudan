import { Stack, Slider, Dropdown, Checkbox, Text } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import type { PresetId, CharacterEffects } from '../model/types';

export interface ControlCenterCallbacks {
  onPresetChange: (preset: PresetId) => void;
  onStressCountChange: (count: number) => void;
  onStressRateChange: (rate: number) => void;
  onEffectToggle: (effect: keyof CharacterEffects) => void;
  onToggleShowcase: (preset: 'physics' | 'jelly', enabled: boolean) => void;
  onBgModeChange: (mode: 'none' | 'ambient' | 'video') => void;
  onPresetParamChange: (key: string, value: number) => void;
  onFpsCapChange: (fps: number) => void;
  onAppModeChange: (mode: 'stress' | 'video') => void;
}

const PRESET_LABELS = [
  'Scroll \u2192',
  '\u2190 Reverse',
  'Top Fixed',
  'Bottom Fixed',
  'Sine Wave',
  'Rotating Chars',
  'Glitch',
  'Cursor Repulsion',
];

const PRESET_MAP: Record<string, PresetId> = {
  'Scroll \u2192': 'scroll',
  '\u2190 Reverse': 'reverse',
  'Top Fixed': 'top',
  'Bottom Fixed': 'bottom',
  'Sine Wave': 'sine',
  'Rotating Chars': 'rotation',
  Glitch: 'glitch',
  'Cursor Repulsion': 'repulsion',
};

const BG_LABELS = ['Ambient', 'None', 'Video (opt-in)'];

const BG_MAP: Record<string, 'none' | 'ambient' | 'video'> = {
  Ambient: 'ambient',
  None: 'none',
  'Video (opt-in)': 'video',
};

const FPS_LABELS = ['60 FPS', '120 FPS', 'Max (uncapped)'];

const FPS_MAP: Record<string, number> = {
  '60 FPS': 60,
  '120 FPS': 120,
  'Max (uncapped)': 0,
};

const APP_MODE_LABELS = ['Stress Test', 'Video Playback'];

const APP_MODE_MAP: Record<string, 'stress' | 'video'> = {
  'Stress Test': 'stress',
  'Video Playback': 'video',
};

export class ControlCenter extends Stack {
  constructor(width: number, height: number, callbacks: ControlCenterCallbacks) {
    super({ direction: 'vertical', gap: 10 });
    this.width = width;
    this.height = height;
    this.padding = 16;

    // App mode: stress test vs. video playback with timed danmaku
    const modeLabel = new Text('Mode');
    this.add(modeLabel);
    const modeDropdown = new Dropdown(APP_MODE_LABELS, { value: 'Stress Test' });
    modeDropdown.width = width - 32;
    modeDropdown.on('change', (e: any) => callbacks.onAppModeChange(APP_MODE_MAP[e.value]));
    this.add(modeDropdown);

    // Preset dropdown
    const presetLabel = new Text('Motion Preset');
    this.add(presetLabel);
    const presetDropdown = new Dropdown(PRESET_LABELS, { value: 'Scroll \u2192' });
    presetDropdown.width = width - 32;
    presetDropdown.on('change', (e: any) => callbacks.onPresetChange(PRESET_MAP[e.value]));
    this.add(presetDropdown);

    // Stress controls
    const stressLabel = new Text('Stress');
    this.add(stressLabel);

    const countSlider = new Slider({
      min: 100,
      max: 5000,
      value: 1000,
      step: 100,
    });
    countSlider.width = width - 32;
    countSlider.height = 24;
    countSlider.on('change', (e: any) => callbacks.onStressCountChange(e.value));
    this.add(countSlider);

    const rateSlider = new Slider({ min: 10, max: 500, value: 50, step: 10 });
    rateSlider.width = width - 32;
    rateSlider.height = 24;
    rateSlider.on('change', (e: any) => callbacks.onStressRateChange(e.value));
    this.add(rateSlider);

    // Effects toggles
    const fxLabel = new Text('Character Effects');
    this.add(fxLabel);
    const fxKeys: (keyof CharacterEffects)[] = ['glow', 'gradient', 'rainbow', 'outline'];
    for (const key of fxKeys) {
      const cb = new Checkbox({ label: key, checked: false });
      cb.on('change', () => callbacks.onEffectToggle(key));
      this.add(cb);
    }

    // Showcase toggles
    const showcaseLabel = new Text('Showcase');
    this.add(showcaseLabel);
    const physicsCb = new Checkbox({
      label: 'Physics Bounce',
      checked: false,
    });
    physicsCb.on('change', () => callbacks.onToggleShowcase('physics', physicsCb.checked));
    this.add(physicsCb);
    const jellyCb = new Checkbox({ label: 'Jelly', checked: false });
    jellyCb.on('change', () => callbacks.onToggleShowcase('jelly', jellyCb.checked));
    this.add(jellyCb);

    // Background mode
    const bgLabel = new Text('Background');
    this.add(bgLabel);
    const bgDropdown = new Dropdown(BG_LABELS, { value: 'Ambient' });
    bgDropdown.width = width - 32;
    bgDropdown.on('change', (e: any) => callbacks.onBgModeChange(BG_MAP[e.value]));
    this.add(bgDropdown);

    // FPS cap
    const fpsLabel = new Text('Frame Rate Cap');
    this.add(fpsLabel);
    const fpsDropdown = new Dropdown(FPS_LABELS, { value: '60 FPS' });
    fpsDropdown.width = width - 32;
    fpsDropdown.on('change', (e: any) => callbacks.onFpsCapChange(FPS_MAP[e.value]));
    this.add(fpsDropdown);
  }

  /**
   * `Stack` (its base class) is purely structural and draws nothing — see
   * `@vectojs/ui`'s `Stack.render()` docs. Without a backdrop here, the
   * panel's controls sit directly over the scrolling danmaku layer with no
   * visual separation, making sliders/dropdowns nearly unreadable. Paint a
   * glassmorphism backdrop (matches HUD's panel style) before children draw.
   */
  override render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 0);
    // Fully opaque and several steps lighter than the stage background
    // (#0f1420). Earlier attempts at translucent dark-blue fills (82%,
    // then 97% alpha at a similar hue) measured correctly pixel-by-pixel
    // but read as "no panel" at a glance — the color step from the stage
    // was too subtle against bright, saturated danmaku text bleeding
    // through. A fully opaque mid-slate with a bright accent border reads
    // unambiguously as a raised UI surface.
    renderer.fill('#1e2536');
    renderer.stroke('rgba(148,163,184,0.4)', 1.5);
    renderer.restore();
    super.render(renderer);
  }
}
