import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Scene } from '@vectojs/core';
import { DanmakuCommandDeck } from '@vectojs/danmaku-kit/ui';
import { Slider } from '@vectojs/ui';
import { StageBackground } from '../src/view/StageBackground';
import { App } from '../src/view/App';
import { BAKUDAN_THEME } from '../src/view/cinemaConfig';

interface FakeRanges {
  length: number;
  start: (i: number) => number;
  end: (i: number) => number;
}

function ranges(spans: [number, number][]): FakeRanges {
  return {
    length: spans.length,
    start: (i) => spans[i]![0],
    end: (i) => spans[i]![1],
  };
}

/** A realistic progressive stream: 10 minutes. */
function controlledVideo(buffered: FakeRanges, duration = 600): HTMLVideoElement {
  const element = document.createElement('video');
  let paused = true;
  Object.defineProperties(element, {
    duration: { configurable: true, value: duration },
    readyState: { configurable: true, value: 1 },
    paused: { configurable: true, get: () => paused },
    buffered: { configurable: true, get: () => buffered },
    play: {
      configurable: true,
      value: mock(async () => {
        paused = false;
      }),
    },
    pause: {
      configurable: true,
      value: mock(() => {
        paused = true;
      }),
    },
    load: { configurable: true, value: mock(() => {}) },
  });
  return element;
}

interface Fixture {
  app: App;
  scene: Scene;
  host: HTMLElement;
  elements: HTMLVideoElement[];
}

const fixtures: Fixture[] = [];

function fixture(buffered: FakeRanges): Fixture {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 1440 },
    innerHeight: { configurable: true, value: 900 },
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1440;
  canvas.height = 900;
  document.body.appendChild(canvas);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const elements: HTMLVideoElement[] = [];
  const background = new StageBackground({
    host,
    videoFactory: () => {
      const element = controlledVideo(buffered);
      elements.push(element);
      return element;
    },
  });
  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 1,
    disableWindowResize: true,
  });
  const app = new App(scene, { stageBackground: background });
  app.onResize(1440, 900);
  const value = { app, scene, host, elements };
  fixtures.push(value);
  return value;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function timelineOf(f: Fixture): Slider {
  const overlays = (f.scene as unknown as { overlayRoot: { children: unknown[] } }).overlayRoot;
  const deck = overlays.children.find((child) => child instanceof DanmakuCommandDeck);
  if (!deck) throw new Error('command deck is not mounted');
  const timeline = (deck as DanmakuCommandDeck).children.find((child) => child instanceof Slider);
  if (!timeline) throw new Error('timeline slider is not mounted');
  return timeline as Slider;
}

/** Bars the timeline paints with the theme's buffered token. */
function paintedBuffered(f: Fixture): { x: number; width: number }[] {
  const bars: { x: number; width: number }[] = [];
  let pending: { x: number; width: number } | null = null;
  const renderer = {
    beginPath() {
      pending = null;
    },
    roundRect(x: number, _y: number, width: number) {
      pending = { x, width };
    },
    arc() {
      pending = null;
    },
    fill(color: string) {
      if (pending && color === BAKUDAN_THEME.bufferedTrack) bars.push({ ...pending });
    },
    stroke() {},
    save() {},
    restore() {},
    clip() {},
    translate() {},
    setGlobalAlpha() {},
    fillText() {},
    measureText: () => ({ width: 0 }),
  } as unknown as Parameters<Slider['render']>[0];
  timelineOf(f).render(renderer);
  return bars;
}

async function playCatalogVideo(f: Fixture): Promise<void> {
  f.app.selectVideo({ kind: 'catalog', id: 'sintel-low-light' }, 'peak-event');
  f.elements.at(-1)!.dispatchEvent(new Event('loadedmetadata'));
  await settle();
  await settle();
}

afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.app.destroy();
    f.scene.destroy();
    f.host.remove();
  }
});

describe('buffered ranges reach the scrubber', () => {
  it('paints the downloaded span of a playing video', async () => {
    const f = fixture(ranges([[0, 150]]));
    await playCatalogVideo(f);

    const bars = paintedBuffered(f);
    expect(bars).toHaveLength(1);
    // 0..150s of a 600s stream is the first quarter of the slider.
    const timeline = timelineOf(f);
    expect(bars[0]!.x).toBeCloseTo(0, 5);
    expect(bars[0]!.width).toBeCloseTo(timeline.width * 0.25, 5);
  });

  it('paints every disjoint span after seeking around', async () => {
    const f = fixture(
      ranges([
        [0, 60],
        [300, 420],
      ]),
    );
    await playCatalogVideo(f);

    const bars = paintedBuffered(f);
    expect(bars).toHaveLength(2);
    const timeline = timelineOf(f);
    expect(bars[1]!.x).toBeCloseTo(timeline.width * 0.5, 5);
    expect(bars[1]!.width).toBeCloseTo(timeline.width * 0.2, 5);
  });

  it('paints nothing in stress mode, which has no media', async () => {
    const f = fixture(ranges([[0, 300]]));
    await playCatalogVideo(f);
    expect(paintedBuffered(f)).toHaveLength(1);

    // Stress mode has no public setter; the lab's throughput callbacks are the
    // only route in. Matches the reach used in AppIntegration.test.ts.
    const modeControl = f.app as unknown as {
      _setAppMode: (mode: 'video' | 'stress') => void;
    };
    modeControl._setAppMode('stress');
    await settle();

    // Not merely absent from the source: the span must be cleared, or a stale
    // buffer from the last video stays painted under a scrubber that means
    // nothing in stress mode.
    expect(paintedBuffered(f)).toHaveLength(0);
  });
});
