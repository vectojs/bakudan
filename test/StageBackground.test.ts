import { describe, expect, it, mock } from 'bun:test';
import { VideoSourceError } from '@vectojs/danmaku-kit/model';
import { StageBackground } from '../src/view/StageBackground';

interface ControlledVideo {
  element: HTMLVideoElement;
  pause: () => void;
  load: () => void;
}

function controlledVideo(duration = 15): ControlledVideo {
  const element = document.createElement('video');
  const pause = mock(() => {});
  const load = mock(() => {});
  Object.defineProperty(element, 'duration', { configurable: true, value: duration });
  Object.defineProperty(element, 'readyState', { configurable: true, value: 1 });
  Object.defineProperty(element, 'pause', { configurable: true, value: pause });
  Object.defineProperty(element, 'load', { configurable: true, value: load });
  return { element, pause, load };
}

function fixture() {
  const host = document.createElement('div');
  const videos: ControlledVideo[] = [];
  document.body.appendChild(host);
  const background = new StageBackground({
    host,
    videoFactory: () => {
      const video = controlledVideo();
      videos.push(video);
      return video.element;
    },
  });
  background.mode = 'video';
  return { background, host, videos };
}

describe('StageBackground', () => {
  it('swaps to a blob: object URL source like any other URL', async () => {
    const { background, host, videos } = fixture();
    const pending = background.setVideo('blob:http://localhost:4173/session-uuid');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await pending;
    expect(background.currentSource).toBe('blob:http://localhost:4173/session-uuid');
    expect(host.contains(videos[0]!.element)).toBe(true);
    background.destroy();
    host.remove();
  });
  it('keeps the active video and app-facing source when a candidate fails', async () => {
    const { background, host, videos } = fixture();
    const first = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await first;

    const second = background.setVideo('https://example.test/bad.mp4');
    videos[1]!.element.dispatchEvent(new Event('error'));
    await expect(second).rejects.toMatchObject({ code: 'media-error' });
    expect(background.currentSource).toBe('https://example.test/first.mp4');
    expect(host.contains(videos[0]!.element)).toBe(true);
    expect(host.contains(videos[1]!.element)).toBe(false);
    background.destroy();
    host.remove();
  });

  it('replaces and disposes the previous video only after candidate metadata succeeds', async () => {
    const { background, host, videos } = fixture();
    const first = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await first;
    background.playbackRate = 1.5;

    const second = background.setVideo('https://example.test/second.mp4');
    expect(host.contains(videos[0]!.element)).toBe(true);
    videos[1]!.element.dispatchEvent(new Event('loadedmetadata'));
    await second;

    expect(background.currentSource).toBe('https://example.test/second.mp4');
    expect(background.playbackRate).toBe(1.5);
    expect(videos[0]!.pause).toHaveBeenCalledTimes(1);
    expect(videos[0]!.load).toHaveBeenCalledTimes(1);
    expect(host.contains(videos[0]!.element)).toBe(false);
    expect(host.contains(videos[1]!.element)).toBe(true);
    background.destroy();
    host.remove();
  });

  it('cleans up a pending candidate when destroyed', async () => {
    const { background, host, videos } = fixture();
    const pending = background.setVideo('https://example.test/pending.mp4');
    background.destroy();
    await expect(pending).rejects.toBeInstanceOf(VideoSourceError);
    expect(videos[0]!.pause).toHaveBeenCalledTimes(1);
    expect(host.children).toHaveLength(0);
    host.remove();
  });

  it('reports playback rejection with a typed error', async () => {
    const { background, host, videos } = fixture();
    const pending = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await pending;
    Object.defineProperty(videos[0]!.element, 'play', {
      configurable: true,
      value: () => Promise.reject(new Error('autoplay blocked')),
    });
    await expect(background.play()).rejects.toMatchObject({ code: 'playback-rejected' });
    background.destroy();
    host.remove();
  });

  it('opens a stall on waiting and closes it on playing', async () => {
    const { background, host, videos } = fixture();
    const seen: boolean[] = [];
    background.onBufferingChange((buffering) => seen.push(buffering));
    const pending = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await pending;

    expect(background.isBuffering).toBe(false);
    videos[0]!.element.dispatchEvent(new Event('waiting'));
    expect(background.isBuffering).toBe(true);
    videos[0]!.element.dispatchEvent(new Event('playing'));
    expect(background.isBuffering).toBe(false);
    expect(seen).toEqual([true, false]);
    background.destroy();
    host.remove();
  });

  it('treats stalled as a stall and clears it on canplay', async () => {
    const { background, host, videos } = fixture();
    background.onBufferingChange(() => {});
    const pending = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await pending;

    videos[0]!.element.dispatchEvent(new Event('stalled'));
    expect(background.isBuffering).toBe(true);
    videos[0]!.element.dispatchEvent(new Event('canplay'));
    expect(background.isBuffering).toBe(false);
    background.destroy();
    host.remove();
  });

  // A seek into an unbuffered region fires `waiting`; while paused it never
  // fires `playing`, so without a `seeked` listener the stall never clears and
  // the status bar reads "Loading" forever.
  it('clears a stall on seeked, so a paused seek does not strand the state', async () => {
    const { background, host, videos } = fixture();
    background.onBufferingChange(() => {});
    const pending = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await pending;

    videos[0]!.element.dispatchEvent(new Event('waiting'));
    expect(background.isBuffering).toBe(true);
    videos[0]!.element.dispatchEvent(new Event('seeked'));
    expect(background.isBuffering).toBe(false);
    background.destroy();
    host.remove();
  });

  it('reports only on transitions, not on every event', async () => {
    const { background, host, videos } = fixture();
    const seen: boolean[] = [];
    background.onBufferingChange((buffering) => seen.push(buffering));
    const pending = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await pending;

    videos[0]!.element.dispatchEvent(new Event('waiting'));
    videos[0]!.element.dispatchEvent(new Event('waiting'));
    videos[0]!.element.dispatchEvent(new Event('stalled'));
    videos[0]!.element.dispatchEvent(new Event('playing'));
    videos[0]!.element.dispatchEvent(new Event('canplay'));
    expect(seen).toEqual([true, false]);
    background.destroy();
    host.remove();
  });

  // The observer is registered once by the caller, but the element it listens to
  // is replaced on every source change. Without rebinding, only the first video
  // of a session would ever report a stall.
  it('keeps reporting stalls after the video element is replaced', async () => {
    const { background, host, videos } = fixture();
    background.onBufferingChange(() => {});
    const first = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await first;

    const second = background.setVideo('https://example.test/second.mp4');
    videos[1]!.element.dispatchEvent(new Event('loadedmetadata'));
    await second;

    videos[1]!.element.dispatchEvent(new Event('waiting'));
    expect(background.isBuffering).toBe(true);
    videos[1]!.element.dispatchEvent(new Event('playing'));
    expect(background.isBuffering).toBe(false);
    background.destroy();
    host.remove();
  });

  it('does not let a stall on a replaced element leak into the next source', async () => {
    const { background, host, videos } = fixture();
    const seen: boolean[] = [];
    background.onBufferingChange((buffering) => seen.push(buffering));
    const first = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await first;

    videos[0]!.element.dispatchEvent(new Event('waiting'));
    expect(background.isBuffering).toBe(true);

    const second = background.setVideo('https://example.test/second.mp4');
    videos[1]!.element.dispatchEvent(new Event('loadedmetadata'));
    await second;
    expect(background.isBuffering).toBe(false);

    // The detached element must no longer be able to drive state.
    videos[0]!.element.dispatchEvent(new Event('waiting'));
    expect(background.isBuffering).toBe(false);
    expect(seen).toEqual([true, false]);
    background.destroy();
    host.remove();
  });

  it('clears the stall when the video is stopped', async () => {
    const { background, host, videos } = fixture();
    background.onBufferingChange(() => {});
    const pending = background.setVideo('https://example.test/first.mp4');
    videos[0]!.element.dispatchEvent(new Event('loadedmetadata'));
    await pending;

    videos[0]!.element.dispatchEvent(new Event('waiting'));
    expect(background.isBuffering).toBe(true);
    background.stopVideo();
    expect(background.isBuffering).toBe(false);
    background.destroy();
    host.remove();
  });
});
