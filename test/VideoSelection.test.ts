import { describe, expect, it, mock } from 'bun:test';
import { Dropdown } from '@vectojs/ui';
import type { Entity } from '@vectojs/core';
import { TRANSLATIONS, type Language } from '../src/model/i18n';
import { DEFAULT_VIDEO_ID, VIDEO_CATALOG } from '../src/model/VideoCatalog';
import { TRACK_PROFILES } from '../src/model/TrackProfiles';
import { ControlCenter, type ControlCenterCallbacks } from '../src/view/ControlCenter';
import { App } from '../src/view/App';
import { VideoLoadError } from '../src/view/StageBackground';
interface AppTestDriver {
  _onVideoSourceChange: (videoId: string) => void;
  videoLoadFailed: boolean;
}

function descendants(root: Entity): Entity[] {
  const result: Entity[] = [];
  const pending = [...root.children];
  while (pending.length > 0) {
    const entity = pending.shift()!;
    result.push(entity);
    pending.push(...entity.children);
  }
  return result;
}

function callbacks(overrides: Partial<ControlCenterCallbacks> = {}): ControlCenterCallbacks {
  return {
    onPresetChange: () => {},
    onStressCountChange: () => {},
    onStressRateChange: () => {},
    onEffectToggle: () => {},
    onToggleShowcase: () => {},
    onBgModeChange: () => {},
    onVideoSourceChange: () => {},
    onTrackProfileChange: () => {},
    onPresetParamChange: () => {},
    onFpsCapChange: () => {},
    onAppModeChange: () => {},
    onLanguageChange: () => {},
    onTogglePanel: () => {},
    onToggleProfiler: () => '',
    ...overrides,
  };
}

describe('video selection integration', () => {
  it('returns catalog and profile ids from accessibly named dropdowns', () => {
    const onVideoSourceChange = mock(() => {});
    const onTrackProfileChange = mock(() => {});
    const center = new ControlCenter(
      280,
      600,
      'en',
      VIDEO_CATALOG,
      DEFAULT_VIDEO_ID,
      TRACK_PROFILES,
      'natural-peaks',
      callbacks({ onVideoSourceChange, onTrackProfileChange }),
    );
    const dropdowns = descendants(center).filter(
      (entity): entity is Dropdown => entity instanceof Dropdown,
    );
    const videoDropdown = dropdowns.find(
      (dropdown) => dropdown.getA11yAttributes().label === 'Video Source',
    )!;
    const profileDropdown = dropdowns.find(
      (dropdown) => dropdown.getA11yAttributes().label === 'Track Profile',
    )!;

    videoDropdown.emit('change', { value: VIDEO_CATALOG[1]!.title });
    profileDropdown.emit('change', { value: TRACK_PROFILES.get('flood')!.label });

    expect(onVideoSourceChange).toHaveBeenCalledWith('bbb-motion');
    expect(onTrackProfileChange).toHaveBeenCalledWith('flood');
  });

  it('preserves app video and profile identity when a candidate fails', async () => {
    const app = Object.create(App.prototype) as App;
    Object.assign(app, {
      currentLang: 'en',
      currentVideoId: DEFAULT_VIDEO_ID,
      currentTrackProfileId: 'natural-peaks',
      videoLoading: false,
      videoLoadFailed: false,
      _videoRequestId: 0,
      bg: {
        isVideoReady: true,
        setVideo: () =>
          Promise.reject(new VideoLoadError('network-error', 'candidate unavailable')),
      },
      announcer: { setSummary: mock(() => {}) },
    });
    // The source-change entry point is private because production reaches it through ControlCenter.
    const driver = app as unknown as AppTestDriver;

    driver._onVideoSourceChange('bbb-motion');
    await Promise.resolve();
    await Promise.resolve();

    expect(app.currentVideoId).toBe(DEFAULT_VIDEO_ID);
    expect(app.currentTrackProfileId).toBe('natural-peaks');
    expect(driver.videoLoadFailed).toBe(false);
  });

  it('defines selection actions and typed errors in all languages', () => {
    const keys = [
      'field.trackProfile',
      'field.customVideoUrl',
      'action.retry',
      'action.chooseAnotherSource',
      'video.error.network',
      'video.error.media',
      'video.error.metadata',
      'video.error.playback',
    ];
    for (const language of Object.keys(TRANSLATIONS) as Language[]) {
      for (const key of keys) expect(TRANSLATIONS[language][key]).toBeTruthy();
    }
  });
});
