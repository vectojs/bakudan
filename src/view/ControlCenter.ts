import { Stack, Button, Slider, Dropdown, Checkbox, Text, ScrollView } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import type { PresetId, CharacterEffects } from '../model/types';
import { t, PRESET_TRANSLATIONS, type Language } from '../model/i18n';

export interface ControlCenterCallbacks {
  onPresetChange: (preset: PresetId) => void;
  onStressCountChange: (count: number) => void;
  onStressRateChange: (rate: number) => void;
  onEffectToggle: (effect: keyof CharacterEffects) => void;
  onToggleShowcase: (preset: 'physics' | 'jelly', enabled: boolean) => void;
  onBgModeChange: (mode: 'none' | 'ambient' | 'video') => void;
  onVideoSourceChange: (url: string) => void;
  onPresetParamChange: (key: string, value: number) => void;
  onFpsCapChange: (fps: number) => void;
  onAppModeChange: (mode: 'stress' | 'video') => void;
  onLanguageChange: (lang: Language) => void;
  onTogglePanel: () => void;
}

export interface VideoSourceEntry {
  label: string;
  url: string;
}

export const VIDEO_SOURCES: VideoSourceEntry[] = [
  { label: 'Demo Loop (15s Local)', url: '/video/demo-clip.mp4' },
  {
    label: 'Big Buck Bunny (10m Stream)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    label: 'Sintel Trailer (8m Stream)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
  {
    label: 'Tears of Steel (12m Stream)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
];

class SettingsCard extends Stack {
  private _cardWidth: number;
  override layout(): void {
    super.layout();
    for (const c of this.children) {
      c.x += 12;
      c.y += 12;
    }
    this.width = this._cardWidth;
    this.height += 24;
  }
  constructor(title: string, width: number, options: { gap?: number } = {}) {
    super({ direction: 'vertical', gap: options.gap ?? 8 });
    this._cardWidth = width;
    this.width = width;
    this.padding = 12;

    const header = new Text(title.toUpperCase(), {
      font: '600 10px monospace',
      color: '#ff7e5f',
    });
    this.add(header);
  }

  override render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 6);
    renderer.fill('rgba(250, 248, 246, 0.65)');
    renderer.stroke('rgba(255, 126, 95, 0.2)', 1);
    renderer.restore();
    super.render(renderer);
  }
}

export class ControlCenter extends ScrollView {
  private stack: Stack;

  constructor(
    width: number,
    height: number,
    lang: Language,
    currentVideoUrl: string,
    callbacks: ControlCenterCallbacks,
  ) {
    super({ width, height });

    this.stack = new Stack({ direction: 'vertical', gap: 12 });
    this.stack.padding = 16;
    this.add(this.stack);

    const innerW = width - 32;
    const cardContentW = innerW - 24;

    // 1. Header Bar with Close Button
    const headerStack = new Stack({ direction: 'horizontal', gap: 8 });
    headerStack.width = innerW;
    headerStack.height = 24;

    const titleText = new Text(t('settings.title', lang), {
      font: '700 11px monospace',
      color: '#453c38',
    });
    titleText.width = innerW - 32;
    headerStack.add(titleText);

    const closeBtn = new Button('✕', {
      bg: 'transparent',
      hoverBg: 'rgba(255, 126, 95, 0.15)',
      color: '#ff7e5f',
      radius: 12,
    });
    closeBtn.width = 24;
    closeBtn.height = 24;
    closeBtn.on('click', callbacks.onTogglePanel);
    headerStack.add(closeBtn);
    this.stack.add(headerStack);

    // 2. System Settings Card
    const sysCard = new SettingsCard(t('settings.mode', lang), innerW);

    const appModeLabels = [t('mode.stress', lang), t('mode.video', lang)];
    const appModeMap = {
      [t('mode.stress', lang)]: 'stress' as const,
      [t('mode.video', lang)]: 'video' as const,
    };
    const modeDropdown = new Dropdown(appModeLabels, {
      value: appModeLabels[0]!,
      bg: 'rgba(255, 255, 255, 0.95)',
      color: '#453c38',
      radius: 6,
    });
    modeDropdown.width = cardContentW;
    (modeDropdown as any).button.hoverBg = 'rgba(255, 126, 95, 0.1)';
    modeDropdown.on('change', (e: any) => callbacks.onAppModeChange(appModeMap[e.value]));
    sysCard.add(modeDropdown);

    const bgLabels = [t('bg.ambient', lang), t('bg.none', lang), t('bg.video', lang)];
    const bgMap = {
      [t('bg.ambient', lang)]: 'ambient' as const,
      [t('bg.none', lang)]: 'none' as const,
      [t('bg.video', lang)]: 'video' as const,
    };
    const bgDropdown = new Dropdown(bgLabels, {
      value: bgLabels[0]!,
      bg: 'rgba(255, 255, 255, 0.95)',
      color: '#453c38',
      radius: 6,
    });
    bgDropdown.width = cardContentW;
    (bgDropdown as any).button.hoverBg = 'rgba(255, 126, 95, 0.1)';
    bgDropdown.on('change', (e: any) => callbacks.onBgModeChange(bgMap[e.value]));
    sysCard.add(bgDropdown);

    // Video Source Dropdown
    const videoLabels = VIDEO_SOURCES.map((v) => v.label);
    const videoMap = VIDEO_SOURCES.reduce(
      (acc, v) => {
        acc[v.label] = v.url;
        return acc;
      },
      {} as Record<string, string>,
    );
    const initialVideo = VIDEO_SOURCES.find((v) => v.url === currentVideoUrl) || VIDEO_SOURCES[0]!;
    const videoDropdown = new Dropdown(videoLabels, {
      value: initialVideo.label,
      bg: 'rgba(255, 255, 255, 0.95)',
      color: '#453c38',
      radius: 6,
    });
    videoDropdown.width = cardContentW;
    (videoDropdown as any).button.hoverBg = 'rgba(255, 126, 95, 0.1)';
    videoDropdown.on('change', (e: any) => callbacks.onVideoSourceChange(videoMap[e.value]));
    sysCard.add(videoDropdown);

    this.stack.add(sysCard);

    // 3. Stress Simulator Card
    const stressCard = new SettingsCard(t('settings.stress', lang), innerW);

    const countRow = new Stack({ direction: 'horizontal', gap: 8, align: 'center' });
    countRow.width = cardContentW;
    const countLabel = new Text(t('stress.count', lang) + ':', {
      font: '11px sans-serif',
      color: '#453c38',
    });
    const countValue = new Text('500', { font: '600 11px monospace', color: '#ff7e5f' });
    countRow.add(countLabel);
    countRow.add(countValue);
    stressCard.add(countRow);

    const countSlider = new Slider({
      min: 0,
      max: 5000,
      value: 500,
      step: 100,
      width: cardContentW,
      trackColor: 'rgba(255, 126, 95, 0.15)',
      progressColor: '#ff7e5f',
    });
    countSlider.width = cardContentW;
    countSlider.height = 18;
    countSlider.on('change', (e: any) => {
      countValue.setText(String(e.value));
      callbacks.onStressCountChange(e.value);
    });
    stressCard.add(countSlider);

    const rateRow = new Stack({ direction: 'horizontal', gap: 8, align: 'center' });
    rateRow.width = cardContentW;
    const rateLabel = new Text(t('stress.rate', lang) + ':', {
      font: '11px sans-serif',
      color: '#453c38',
    });
    const rateValue = new Text('50', { font: '600 11px monospace', color: '#ff7e5f' });
    rateRow.add(rateLabel);
    rateRow.add(rateValue);
    stressCard.add(rateRow);

    const rateSlider = new Slider({
      min: 1,
      max: 1000,
      value: 50,
      step: 1,
      width: cardContentW,
      trackColor: 'rgba(255, 126, 95, 0.15)',
      progressColor: '#ff7e5f',
    });
    rateSlider.width = cardContentW;
    rateSlider.height = 18;
    rateSlider.on('change', (e: any) => {
      rateValue.setText(String(e.value));
      callbacks.onStressRateChange(e.value);
    });
    stressCard.add(rateSlider);

    this.stack.add(stressCard);

    // 4. Motion Preset Card
    const presetCard = new SettingsCard(t('settings.preset', lang), innerW);

    const presetTrans = PRESET_TRANSLATIONS[lang] || PRESET_TRANSLATIONS.en;
    const presetLabels = Object.values(presetTrans);
    const presetMap = Object.entries(presetTrans).reduce(
      (acc, [k, v]) => {
        acc[v] = k as PresetId;
        return acc;
      },
      {} as Record<string, PresetId>,
    );

    const presetDropdown = new Dropdown(presetLabels, {
      value: presetLabels[0]!,
      bg: 'rgba(255, 255, 255, 0.95)',
      color: '#453c38',
      radius: 6,
    });
    presetDropdown.width = cardContentW;
    (presetDropdown as any).button.hoverBg = 'rgba(255, 126, 95, 0.1)';
    presetDropdown.on('change', (e: any) => callbacks.onPresetChange(presetMap[e.value]));
    presetCard.add(presetDropdown);

    this.stack.add(presetCard);

    // 5. Visual Effects Card
    const fxCard = new SettingsCard(t('settings.fx', lang), innerW);
    const fxKeys: (keyof CharacterEffects)[] = ['glow', 'gradient', 'rainbow', 'outline'];
    for (const key of fxKeys) {
      const cb = new Checkbox({
        label: t(`fx.${key}`, lang),
        checked: false,
        color: '#453c38',
        accent: '#ff7e5f',
        border: 'rgba(255, 126, 95, 0.3)',
      });
      cb.on('change', () => callbacks.onEffectToggle(key));
      fxCard.add(cb);
    }
    this.stack.add(fxCard);

    // 6. Showcase Card
    const showcaseCard = new SettingsCard(t('settings.showcase', lang), innerW);
    const physicsCb = new Checkbox({
      label: t('showcase.physics', lang),
      checked: false,
      color: '#453c38',
      accent: '#ff7e5f',
      border: 'rgba(255, 126, 95, 0.3)',
    });
    physicsCb.on('change', () => callbacks.onToggleShowcase('physics', physicsCb.checked));
    showcaseCard.add(physicsCb);

    const jellyCb = new Checkbox({
      label: t('showcase.jelly', lang),
      checked: false,
      color: '#453c38',
      accent: '#ff7e5f',
      border: 'rgba(255, 126, 95, 0.3)',
    });
    jellyCb.on('change', () => callbacks.onToggleShowcase('jelly', jellyCb.checked));
    showcaseCard.add(jellyCb);
    this.stack.add(showcaseCard);

    // 7. Language Selector Card
    const langCard = new SettingsCard(t('settings.lang', lang), innerW);
    const langLabels = ['English', '简体中文', '繁體中文', '日本語', '한국어'];
    const langMap: Record<string, Language> = {
      English: 'en',
      简体中文: 'zh-CN',
      繁體中文: 'zh-TW',
      日本語: 'ja',
      한국어: 'ko',
    };
    const langReverseMap: Record<Language, string> = {
      en: 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ja: '日本語',
      ko: '한국어',
    };
    const langDropdown = new Dropdown(langLabels, {
      value: langReverseMap[lang],
      bg: 'rgba(255, 255, 255, 0.95)',
      color: '#453c38',
      radius: 6,
    });
    langDropdown.width = cardContentW;
    (langDropdown as any).button.hoverBg = 'rgba(255, 126, 95, 0.1)';
    langDropdown.on('change', (e: any) => callbacks.onLanguageChange(langMap[e.value]));
    langCard.add(langDropdown);
    this.stack.add(langCard);

    // Ensure scrollview knows its content size after adding all cards
    this.stack.layout();
    this.updateContentSize();
  }

  override render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 0);
    renderer.fill('rgba(255, 255, 255, 0.85)');
    renderer.stroke('rgba(255, 126, 95, 0.15)', 1.5);
    renderer.restore();
    super.render(renderer);
  }
}
