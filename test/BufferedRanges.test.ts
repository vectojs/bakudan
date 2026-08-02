import { describe, expect, it, mock } from 'bun:test';
import { StageBackground } from '../src/view/StageBackground';

interface FakeRanges {
  length: number;
  start: (i: number) => number;
  end: (i: number) => number;
}

function video(buffered: FakeRanges | undefined, duration = 100): HTMLVideoElement {
  const element = document.createElement('video');
  Object.defineProperty(element, 'duration', {
    configurable: true,
    value: duration,
  });
  Object.defineProperty(element, 'readyState', {
    configurable: true,
    value: 1,
  });
  Object.defineProperty(element, 'pause', {
    configurable: true,
    value: mock(() => {}),
  });
  Object.defineProperty(element, 'load', {
    configurable: true,
    value: mock(() => {}),
  });
  if (buffered) {
    Object.defineProperty(element, 'buffered', {
      configurable: true,
      value: buffered,
    });
  }
  return element;
}

function ranges(spans: [number, number][]): FakeRanges {
  return {
    length: spans.length,
    start: (i) => spans[i]![0],
    end: (i) => spans[i]![1],
  };
}

function fixture(buffered?: FakeRanges) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const element = video(buffered);
  const background = new StageBackground({ host, videoFactory: () => element });
  background.mode = 'video';
  return { background, element };
}

describe('StageBackground.bufferedRanges', () => {
  it('copies every span out of the live TimeRanges', async () => {
    const { background, element } = fixture(
      ranges([
        [0, 12.5],
        [40, 61.25],
      ]),
    );
    const load = background.setVideo('https://example.test/a.mp4');
    element.dispatchEvent(new Event('loadedmetadata'));
    await load;

    expect(background.bufferedRanges).toEqual([
      { start: 0, end: 12.5 },
      { start: 40, end: 61.25 },
    ]);
  });

  it('returns a plain array snapshot, not a view onto the live object', async () => {
    const spans: [number, number][] = [[0, 10]];
    const live = ranges(spans);
    const { background, element } = fixture(live);
    const load = background.setVideo('https://example.test/a.mp4');
    element.dispatchEvent(new Event('loadedmetadata'));
    await load;

    const first = background.bufferedRanges;
    // The browser keeps buffering: the same getter must not mutate what it
    // already handed out, or a caller diffing successive polls sees no change.
    spans[0] = [0, 40];
    expect(first).toEqual([{ start: 0, end: 10 }]);
    expect(background.bufferedRanges).toEqual([{ start: 0, end: 40 }]);
  });

  it('is empty with no video element mounted', () => {
    const { background } = fixture(ranges([[0, 10]]));
    expect(background.bufferedRanges).toEqual([]);
  });

  it('stops at the first index the range list refuses rather than throwing', async () => {
    // A TimeRanges shrinking between the length read and an index read throws
    // INDEX_SIZE_ERR; a poll on a 500ms tick must survive that.
    const flaky: FakeRanges = {
      length: 3,
      start: (i) => {
        if (i > 0) throw new Error('INDEX_SIZE_ERR');
        return 0;
      },
      end: (i) => {
        if (i > 0) throw new Error('INDEX_SIZE_ERR');
        return 8;
      },
    };
    const { background, element } = fixture(flaky);
    const load = background.setVideo('https://example.test/a.mp4');
    element.dispatchEvent(new Event('loadedmetadata'));
    await load;

    expect(() => background.bufferedRanges).not.toThrow();
    expect(background.bufferedRanges).toEqual([{ start: 0, end: 8 }]);
  });

  it('is empty for a source that reports no buffered spans', async () => {
    const { background, element } = fixture(ranges([]));
    const load = background.setVideo('https://example.test/a.mp4');
    element.dispatchEvent(new Event('loadedmetadata'));
    await load;

    expect(background.bufferedRanges).toEqual([]);
  });
});
