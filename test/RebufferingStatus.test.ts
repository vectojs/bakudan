import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Scene } from '@vectojs/core';
import { DanmakuStatusBar } from '@vectojs/danmaku-kit/ui';
import { StageBackground } from '../src/view/StageBackground';
import { App } from '../src/view/App';

interface ControlledVideo {
  element: HTMLVideoElement;
  play: () => Promise<void>;
  pause: () => void;
}

/** Long enough to be a realistic progressive stream (10 minutes). */
function controlledVideo(duration = 600): ControlledVideo {
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
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
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
  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 1,
    disableWindowResize: true,
  });
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

function statusBarOf(f: Fixture): DanmakuStatusBar {
  const overlays = (f.scene as unknown as { overlayRoot: { children: unknown[] } }).overlayRoot;
  const bar = overlays.children.find((child) => child instanceof DanmakuStatusBar);
  if (!bar) throw new Error('status bar is not mounted');
  return bar as DanmakuStatusBar;
}

/**
 * The state the status bar is actually rendering.
 *
 * Read through the kit's public `getStatus()` on the real mounted overlay
 * rather than a hook on App, so this asserts what a user sees and what a screen
 * reader is told.
 */
function renderedState(f: Fixture): string {
  return statusBarOf(f).getStatus().state;
}

/**
 * Drive App's real load path to a playing video.
 *
 * Settles twice: once for the setVideo promise, once for the play() promise
 * whose resolution re-syncs the status.
 */
async function playCatalogVideo(f: Fixture, id = 'sintel-low-light'): Promise<ControlledVideo> {
  f.app.selectVideo({ kind: 'catalog', id }, 'peak-event');
  const video = f.videos.at(-1)!;
  video.element.dispatchEvent(new Event('loadedmetadata'));
  await settle();
  await settle();
  return video;
}

afterEach(() => {
  for (const { app, scene, host } of fixtures.splice(0)) {
    app.destroy();
    scene.destroy();
    host.remove();
  }
  document.body.replaceChildren();
});

describe('mid-stream rebuffering status', () => {
  // The defect: videoLoading clears the moment `loadedmetadata` fires, which on
  // a progressive 8-12 minute stream is after a few KB. Every later stall used
  // to leave the pill reading "Video" with nothing announced.
  it('reports loading while stalled mid-stream, after the initial load cleared', async () => {
    const f = fixture();
    const video = await playCatalogVideo(f);
    expect(renderedState(f)).toBe('video');

    video.element.dispatchEvent(new Event('waiting'));
    expect(renderedState(f)).toBe('loading');

    video.element.dispatchEvent(new Event('playing'));
    expect(renderedState(f)).toBe('video');
  });

  it('ranks an explicit pause above a stall, because a pause is user intent', async () => {
    const f = fixture();
    const video = await playCatalogVideo(f);
    video.element.dispatchEvent(new Event('waiting'));
    expect(renderedState(f)).toBe('loading');

    // Pause through the real public path, which syncs status. Poking the mock
    // element directly would change readyState without telling the app.
    f.app.togglePlayback();
    expect(renderedState(f)).toBe('paused');
  });

  it('reports a stall on a source loaded later in the session', async () => {
    const f = fixture();
    await playCatalogVideo(f, 'sintel-low-light');
    // The observer is registered once in the constructor, but the element is
    // replaced per source. Only the first video would report without rebinding.
    const second = await playCatalogVideo(f, 'bbb-motion');
    expect(renderedState(f)).toBe('video');

    second.element.dispatchEvent(new Event('waiting'));
    expect(renderedState(f)).toBe('loading');
  });

  it('announces the stall, not just paints it', async () => {
    const f = fixture();
    const video = await playCatalogVideo(f);
    video.element.dispatchEvent(new Event('waiting'));

    const attrs = statusBarOf(f).getA11yAttributes();
    expect(attrs.role).toBe('status');
    expect(attrs.live).toBe('polite');
    expect(attrs.label).toContain('Loading');
  });
});
