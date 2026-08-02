import { beforeEach, describe, expect, it } from 'bun:test';
import {
  loadUserDanmakus,
  saveUserDanmaku,
  storageKeyForVideo,
  videoIdForCustomUrl,
} from '../src/model/UserDanmakuStore';

beforeEach(() => localStorage.clear());

describe('UserDanmakuStore', () => {
  it('isolates entries by video id', () => {
    saveUserDanmaku('video-a', { time: 1, text: 'A' });
    saveUserDanmaku('video-b', { time: 2, text: 'B' });
    expect(loadUserDanmakus('video-a').map((entry) => entry.text)).toEqual(['A']);
    expect(loadUserDanmakus('video-b').map((entry) => entry.text)).toEqual(['B']);
  });

  it('drops only the corrupt video payload', () => {
    localStorage.setItem(storageKeyForVideo('bad'), '{');
    saveUserDanmaku('good', { time: 1, text: 'kept' });
    expect(loadUserDanmakus('bad')).toEqual([]);
    expect(localStorage.getItem(storageKeyForVideo('bad'))).toBeNull();
    expect(loadUserDanmakus('good')).toHaveLength(1);
  });

  it('keeps only finite non-negative entries with non-empty text', () => {
    localStorage.setItem(
      storageKeyForVideo('mixed'),
      JSON.stringify([
        { time: 2, text: 'later' },
        { time: -1, text: 'negative' },
        { time: 1, text: 'earlier' },
        { time: 3, text: '   ' },
      ]),
    );
    expect(loadUserDanmakus('mixed').map((entry) => entry.text)).toEqual(['earlier', 'later']);
  });

  it('derives a stable local id from a normalized custom URL', () => {
    expect(videoIdForCustomUrl('https://EXAMPLE.test:443/video.mp4?b=2&a=1#frame')).toBe(
      videoIdForCustomUrl('https://example.test/video.mp4?a=1&b=2'),
    );
  });
});
