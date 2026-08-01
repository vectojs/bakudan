import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Scene } from '@vectojs/core';
import { VideoSourceError } from '@vectojs/danmaku-kit/model';
import { StageBackground } from '../src/view/StageBackground';
import { App } from '../src/view/App';
import { cinemaLabelsFor } from '../src/view/cinemaConfig';

interface ControlledVideo {
  element: HTMLVideoElement;
  play: () => Promise<void>;
  pause: () => void;
}

function controlledVideo(duration = 15): ControlledVideo {
  const element = document.createElement('video');
  let paused = true;
  const play = mock(async () => {
    paused = false;
  });
  const pause = mock(() => {
    paused = true;
  });
  Object.defineProperties(element, {
    duration: { configurable: true, value: duration },
    readyState: { configurable: true, value: 1 },
    paused: { configurable: true, get: () => paused },
    play: { configurable: true, value: play },
    pause: { configurable: true, value: pause },
    load: { configurable: true, value: mock(() => {}) },
  });
  return { element, play, pause };
}

interface Fixture {
  app: App;
  scene: Scene;
  host: HTMLElement;
  videos: ControlledVideo[];
}

const fixtures: Fixture[] = [];

function fixture(width = 1440, height = 900): Fixture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const videos: ControlledVideo[] = [];
  const background = new StageBackground({
    host,
    videoFactory: () => {
      const video = controlledVideo();
      videos.push(video);
      return video.element;
    },
  });
  const scene = new Scene(canvas, { maxFPS: 0, maxDPR: 1, disableWindowResize: true });
  const app = new App(scene, { stageBackground: background });
  app.onResize(width, height);
  const value = { app, scene, host, videos };
  fixtures.push(value);
  return value;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  for (const { app, scene, host } of fixtures.splice(0)) {
    app.destroy();
    scene.destroy();
    host.remove();
  }
  document.body.replaceChildren();
});

describe('App Cinema Overlay integration', () => {
  it('starts video-first with package surfaces and no closed-Lab descendants', () => {
    const { app } = fixture();
    expect(app.getViewSnapshot()).toMatchObject({
      mode: 'video',
      labOpen: false,
      activeLabTab: 'videos',
    });
    expect(app.scheduler.target).toBe(0);
    expect(app.getCinemaLayoutSnapshot().drawer).toMatchObject({
      open: false,
      childCount: 0,
    });
    expect(cinemaLabelsFor('en').kit.command).toMatchObject({
      openLab: 'Lab',
      closeLab: 'Lab',
    });
    expect(
      cinemaLabelsFor('zh-CN').panels.videos.formatLoadError(
        new VideoSourceError('network-error', 'raw transport detail'),
        'candidate',
      ),
    ).toBe('candidate：无法下载视频。');

    app.setLabOpen(true);
    expect(app.getCinemaLayoutSnapshot().drawer.open).toBe(true);
    expect(app.getCinemaLayoutSnapshot().drawer.childCount).toBeGreaterThan(0);
    app.setLabOpen(false);
    expect(app.getCinemaLayoutSnapshot().drawer.childCount).toBe(0);
  });

  it('uses exact desktop, mobile, and visual-viewport drawer bounds', () => {
    const { app } = fixture();
    app.setLabOpen(true);

    let layout = app.getCinemaLayoutSnapshot();
    expect(layout.status.x).toBe(16);
    expect(layout.drawer).toMatchObject({ x: 0, y: 486, width: 1440, height: 414, open: true });
    expect(layout.command.y + layout.command.height).toBeLessThanOrEqual(layout.drawer.y - 16);

    app.onResize(390, 844);
    layout = app.getCinemaLayoutSnapshot();
    expect(layout.status.x).toBe(8);
    expect(layout.drawer).toMatchObject({ x: 0, y: 262, width: 390, height: 582, open: true });
    expect(layout.command.controls.lab.x + layout.command.controls.lab.width).toBeLessThanOrEqual(
      layout.command.width,
    );
    expect(layout.command.controls.send.x + layout.command.controls.send.width).toBeLessThanOrEqual(
      layout.command.width,
    );

    app.onViewportChange({ offsetTop: 100, height: 500 } as VisualViewport);
    layout = app.getCinemaLayoutSnapshot();
    expect(layout.drawer).toMatchObject({ y: 255, height: 345 });
    expect(layout.drawer.y + layout.drawer.height).toBe(600);
  });

  it('commits a candidate source and profile only after metadata succeeds', async () => {
    const { app, videos } = fixture();
    const initial = app.getViewSnapshot();

    app.selectVideo({ kind: 'catalog', id: 'sintel-low-light' }, 'peak-event');
    expect(app.getViewSnapshot()).toMatchObject({
      videoId: initial.videoId,
      profileId: initial.profileId,
      videoLoadState: { status: 'loading', candidateId: 'sintel-low-light' },
    });

    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await settle();
    expect(app.getViewSnapshot()).toMatchObject({
      videoId: 'sintel-low-light',
      profileId: 'peak-event',
      videoLoadState: { status: 'ready', sourceId: 'sintel-low-light' },
    });
    expect(videos[0]!.play).toHaveBeenCalledTimes(1);
  });

  it('keeps the active source and profile when a candidate fails', async () => {
    const { app, videos } = fixture();
    app.selectVideo({ kind: 'catalog', id: 'sintel-low-light' }, 'peak-event');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await settle();

    app.selectVideo({ kind: 'catalog', id: 'bbb-motion' }, 'flood');
    videos[1]!.element.dispatchEvent(new Event('error'));
    await settle();

    expect(app.getViewSnapshot()).toMatchObject({
      videoId: 'sintel-low-light',
      profileId: 'peak-event',
      videoLoadState: {
        status: 'error',
        candidateId: 'bbb-motion',
        error: { code: 'media-error' },
      },
    });
  });

  it('preserves playback state while toggling Lab and removes every surface on destroy', async () => {
    const { app, scene, host, videos } = fixture();
    app.selectVideo({ kind: 'catalog', id: 'sintel-low-light' });
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await settle();
    const target = app.scheduler.target;

    app.setLabOpen(true);
    app.setActiveLabTab('interactions');
    app.setLabOpen(false);
    expect(app.scheduler.target).toBe(target);
    expect(videos[0]!.pause).not.toHaveBeenCalled();
    expect(app.getViewSnapshot()).toMatchObject({ labOpen: false, activeLabTab: 'interactions' });

    app.destroy();
    expect(scene.getA11yTree()).toEqual([]);
    expect(host.children).toHaveLength(0);
  });
});
