import { Stack, Slider, Dropdown, Checkbox, Text } from '@vectojs/ui';
import type { PresetId, CharacterEffects } from '../model/types';

export interface ControlCenterCallbacks {
  onPresetChange: (preset: PresetId) => void;
  onStressCountChange: (count: number) => void;
  onStressRateChange: (rate: number) => void;
  onEffectToggle: (effect: keyof CharacterEffects) => void;
  onToggleShowcase: (preset: 'physics' | 'jelly', enabled: boolean) => void;
  onBgModeChange: (mode: 'none' | 'ambient' | 'video') => void;
  onPresetParamChange: (key: string, value: number) => void;
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

export class ControlCenter extends Stack {
  constructor(width: number, height: number, callbacks: ControlCenterCallbacks) {
    super({ direction: 'vertical', gap: 10 });
    this.width = width;
    this.height = height;
    this.padding = 16;

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
  }
}
