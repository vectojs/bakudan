import { describe, expect, it, mock } from 'bun:test';
import { StageBackground, VideoLoadError } from '../src/view/StageBackground';

interface ControlledVideo {
  element: HTMLVideoElement;
  pause: ReturnType<typeof mock>;
  load: ReturnType<typeof mock>;
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
    await expect(pending).rejects.toBeInstanceOf(VideoLoadError);
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
});
