import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Scene } from '@vectojs/core';
import { StageBackground } from '../src/view/StageBackground';
import { App } from '../src/view/App';

/**
 * Local video upload: a picked file becomes a session-local blob: object URL
 * routed through the custom-source pipeline. Since kit 0.8.0 the picking
 * mechanism lives behind VideosPanelOptions.onUploadFile - the kit renders the
 * upload button and owns the transient <input type="file">, then hands App the
 * raw File; App mints and revokes the object URLs. The invariants pinned here:
 *  1. App actually passes an onUploadFile into the panel options (the button
 *     renders only when set), and that callback routes a File through the same
 *     custom-source pipeline,
 *  2. the swap reuses the existing loadState precedence chain (loading ->
 *     ready, or error rung),
 *  3. a superseded object URL is revoked only AFTER the new source actually
 *     swapped (a failed load keeps the previous video alive on its blob),
 *  4. destroy revokes whatever is left,
 *  5. NOTHING persists while a local upload is active: user danmaku and
 *     reactions would land under `custom-<hash-of-blob-url>` keys that no
 *     future session can ever list.
 *
 * Sabotage: drop the `onUploadFile` wiring in App (test 1 and every pickFile
 * call go red), drop the `_pruneLocalObjectUrl` call from the load-success
 * path (tests 3/4 go red), drop the memoryOnly flag / saveUserDanmaku guard
 * (test 5 goes red).
 */

interface ControlledVideo {
  element: HTMLVideoElement;
  play: () => Promise<void>;
}

function controlledVideo(): ControlledVideo {
  const element = document.createElement('video');
  let paused = true;
  Object.defineProperties(element, {
    duration: { configurable: true, value: 15 },
    readyState: { configurable: true, value: 1 },
    paused: { configurable: true, get: () => paused },
    play: {
      configurable: true,
      value: async () => {
        paused = false;
      },
    },
    pause: {
      configurable: true,
      value: () => {
        paused = true;
      },
    },
    load: { configurable: true, value: () => {} },
  });
  return { element, play: element.play as unknown as () => Promise<void> };
}

const fixtures: Array<{ app: App; scene: Scene; host: HTMLElement }> = [];

function fixture(width = 1440, height = 900) {
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
  const scene = new Scene(canvas, { maxFPS: 0, maxDPR: 1, disableWindowResize: true });
  const app = new App(scene, { stageBackground: background });
  app.onResize(width, height);
  const value = { app, scene, host };
  fixtures.push(value);
  return { ...value, videos };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Deterministic fake object URLs; happy-dom has no media framework anyway.
let urlCounter = 0;
const createdUrls: string[] = [];
const revokedUrls: string[] = [];
URL.createObjectURL = (() => {
  const url = 'blob:http://localhost/fake-' + ++urlCounter;
  createdUrls.push(url);
  return url;
}) as typeof URL.createObjectURL;
URL.revokeObjectURL = ((url: string) => {
  revokedUrls.push(url);
}) as typeof URL.revokeObjectURL;

type PanelWithOptions = {
  videosPanel: { options: { onUploadFile?: (file: File) => void } };
};

function panelUploadOption(app: App): (file: File) => void {
  const { onUploadFile } = (app as unknown as PanelWithOptions).videosPanel.options;
  if (!onUploadFile) throw new Error('App did not pass onUploadFile into VideosPanel options');
  return onUploadFile;
}

function pickFile(app: App, name: string): void {
  const file = new File(['bytes'], name, { type: 'video/webm' });
  // Production entry point: exactly the callback the kit's upload button
  // invokes after its own file picker closes.
  panelUploadOption(app)(file);
}

async function loadReady(
  app: App,
  videos: ControlledVideo[],
  index: number,
): Promise<string | null> {
  const url = createdUrls[createdUrls.length - 1] ?? null;
  videos[index]!.element.dispatchEvent(new Event('loadedmetadata'));
  await settle();
  return url;
}

function bakudanKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('bakudan:v1:')) keys.push(key);
  }
  return keys.sort();
}

beforeEach(() => {
  createdUrls.length = 0;
  revokedUrls.length = 0;
});

afterEach(() => {
  for (const { app, scene, host } of fixtures.splice(0)) {
    app.destroy();
    scene.destroy();
    host.remove();
  }
  document.body.replaceChildren();
  for (const key of bakudanKeys()) localStorage.removeItem(key);
});

describe('local video upload flow', () => {
  it('wires the kit panel onUploadFile option so the upload button renders', async () => {
    const { app, videos } = fixture();
    // The kit renders its local-file upload button only when this callback is
    // set; its absence would silently remove the affordance.
    const onUploadFile = panelUploadOption(app);

    const file = new File(['bytes'], 'via-button.webm', { type: 'video/webm' });
    onUploadFile(file);
    expect(createdUrls).toHaveLength(1);
    await loadReady(app, videos, 0);
    expect(app.getViewSnapshot().videoId.startsWith('custom-')).toBe(true);
    expect(videos[0]!.element.getAttribute('src')).toBe(createdUrls[0]);
  });

  it('routes a picked file through the custom pipeline to a ready state', async () => {
    const { app, videos } = fixture();
    expect(createdUrls).toHaveLength(0);

    pickFile(app, 'clip.webm');
    expect(createdUrls).toHaveLength(1);
    expect(app.getViewSnapshot()).toMatchObject({
      videoLoadState: { status: 'loading' },
    });

    await loadReady(app, videos, 0);
    expect(app.getViewSnapshot()).toMatchObject({
      videoLoadState: { status: 'ready' },
      videoId: app.getViewSnapshot().videoId,
    });
    expect(app.getViewSnapshot().videoId.startsWith('custom-')).toBe(true);
    // The stage element received the object URL itself.
    expect(videos[0]!.element.getAttribute('src')).toBe(createdUrls[0]);
  });

  it('revokes the superseded object URL only after the new source swaps', async () => {
    const { app, videos } = fixture();
    pickFile(app, 'first.webm');
    const first = await loadReady(app, videos, 0);
    expect(revokedUrls).toEqual([]);

    pickFile(app, 'second.webm');
    const second = createdUrls[createdUrls.length - 1];
    expect(second).not.toBe(first);
    // Not yet: the first video must stay usable until the swap completes.
    expect(revokedUrls).toEqual([]);
    videos[1]!.element.dispatchEvent(new Event('loadedmetadata'));
    await settle();
    expect(revokedUrls).toEqual([first]);

    // A failed third upload keeps the active second blob alive.
    pickFile(app, 'third.webm');
    videos[2]!.element.dispatchEvent(new Event('error'));
    await settle();
    expect(revokedUrls).toEqual([first]);
    expect(app.getViewSnapshot().videoId.startsWith('custom-')).toBe(true);
  });

  it('destroy revokes any remaining object URL', async () => {
    const { app, videos } = fixture();
    pickFile(app, 'kept.webm');
    await loadReady(app, videos, 0);
    expect(revokedUrls).toEqual([]);

    app.destroy();
    expect(revokedUrls).toHaveLength(1);
  });

  it('persists nothing while a local upload is active', async () => {
    const { app, videos } = fixture();
    pickFile(app, 'session.webm');
    await loadReady(app, videos, 0);
    expect(bakudanKeys()).toEqual([]);

    (app as unknown as { _onUserSend: (t: string) => void })._onUserSend('hello');
    (
      app as unknown as { _reactionStore: { toggle: (id: string) => unknown } }
    )._reactionStore.toggle('comment-1');
    expect(bakudanKeys()).toEqual([]);
  });

  it('still persists for non-upload sources (the skip is upload-specific)', async () => {
    const { app, videos } = fixture();
    // A non-default id: re-selecting the default would short-circuit as
    // "same source" without ever creating a video element.
    app.selectVideo({ kind: 'catalog', id: 'bbb-motion' });
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await settle();

    (app as unknown as { _onUserSend: (t: string) => void })._onUserSend('hello');
    expect(bakudanKeys().some((key) => key.startsWith('bakudan:v1:user-danmaku:'))).toBe(true);
  });
});
