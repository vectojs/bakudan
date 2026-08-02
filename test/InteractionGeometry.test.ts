import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Scene } from '@vectojs/core';
import { App } from '../src/view/App';
import { BAKUDAN_THEME } from '../src/view/cinemaConfig';
import { PILL_COPY_OFFSET_PX, PILL_HEIGHT_PX, PILL_WIDTH_PX } from '../src/view/DanmakuLayer';
import { SelectionHotspots } from '../src/view/SelectionHotspots';
import { StageBackground } from '../src/view/StageBackground';

interface Fixture {
  app: App;
  scene: Scene;
  host: HTMLElement;
}

const fixtures: Fixture[] = [];

function fixture(width: number, height: number): Fixture {
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
  const background = new StageBackground({
    host,
    videoFactory: () => document.createElement('video'),
  });
  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 1,
    disableWindowResize: true,
  });
  const app = new App(scene, { stageBackground: background });
  app.onResize(width, height);
  const value = { app, scene, host };
  fixtures.push(value);
  return value;
}

afterEach(() => {
  for (const { app, scene, host } of fixtures.splice(0)) {
    app.destroy();
    scene.destroy();
    host.remove();
  }
});

describe('overlay pointer regions follow real layout', () => {
  // These regions used to be guessed from stageH: the lab was assumed to start
  // at stageH - 500 on desktop. Measured against the real drawer top, that
  // guess was 236px too low at 1600px tall and 132px too high at 800px tall,
  // so pointerdowns in the gap were routed to the wrong owner.
  const sizes = [
    [2560, 1600],
    [1920, 1200],
    [1440, 900],
    [1280, 800],
  ] as const;

  it('treats exactly the drawer rect as "in the lab" at every viewport height', () => {
    for (const [w, h] of sizes) {
      const { app } = fixture(w, h);
      app.setLabOpen(true);
      const geometry = app.getCinemaLayoutSnapshot();
      const drawerTop = geometry.drawer.y;

      // A point just inside the drawer must count as the lab.
      expect(app.debugHitsLab(drawerTop + 4)).toBe(true);
      // A point just above it must not.
      expect(app.debugHitsLab(drawerTop - 4)).toBe(false);

      // The old hardcoded guess disagrees with the real top by a wide margin at
      // every one of these sizes, which is the whole defect. Assert the region
      // follows the drawer and not the guess: a point that the guess and the
      // real rect classify differently must follow the real rect.
      const legacyGuess = h - 500;
      expect(Math.abs(legacyGuess - drawerTop)).toBeGreaterThan(8);
      const disputed = (legacyGuess + drawerTop) / 2;
      expect(app.debugHitsLab(disputed)).toBe(disputed >= drawerTop);
    }
  });

  it('does not treat the stage above the drawer as the lab', () => {
    const { app } = fixture(1280, 800);
    app.setLabOpen(true);
    const drawerTop = app.getCinemaLayoutSnapshot().drawer.y;
    // stageH - 500 == 300 here, well above the real drawer top (~432), so the
    // old guess swallowed ~132px of genuine stage taps.
    expect(drawerTop).toBeGreaterThan(300);
    expect(app.debugHitsLab(320)).toBe(false);
  });
});

describe('selection pill hotspots match the drawn pill', () => {
  function hotspots(): {
    hotspots: SelectionHotspots;
    like: { x: number; y: number; width: number; height: number };
    copy: { x: number; y: number; width: number; height: number };
  } {
    const value = new SelectionHotspots({
      onLikeToggle: () => {},
      onCopy: () => {},
      likeLabel: () => 'Like',
      copyLabel: () => 'Copy',
    });
    const [like, copy] = value.children as Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    return { hotspots: value, like: like!, copy: copy! };
  }

  it('splits the pill at the copy glyph rather than halving it', () => {
    const { hotspots: h, like, copy } = hotspots();
    h.place(100, 200, PILL_HEIGHT_PX, PILL_COPY_OFFSET_PX, PILL_WIDTH_PX);

    // The like hotspot covers the heart AND its count, stopping where the copy
    // glyph starts. Previously it was a flat 44px, which ended 16px short.
    expect(like.x).toBe(100);
    expect(like.width).toBe(PILL_COPY_OFFSET_PX);
    // The copy hotspot begins exactly at the copy glyph, not 16px before it.
    expect(copy.x).toBe(100 + PILL_COPY_OFFSET_PX);
    // No gap and no overlap between the two.
    expect(like.x + like.width).toBe(copy.x);
  });

  it('places the hotspots on the pill, not on the danmaku origin', () => {
    const { hotspots: h, like, copy } = hotspots();
    const pillTop = 200;
    h.place(100, pillTop, PILL_HEIGHT_PX, PILL_COPY_OFFSET_PX, PILL_WIDTH_PX);
    // Both span the pill's full height at the pill's own top. The old code
    // passed the slot origin, so at fontSize 32 the rects cleared the painted
    // pill entirely and neither action was clickable.
    for (const rect of [like, copy]) {
      expect(rect.y).toBe(pillTop);
      expect(rect.height).toBe(PILL_HEIGHT_PX);
    }
  });

  it('reports which action a point falls on, consistently with the rects', () => {
    const { hotspots: h, like, copy } = hotspots();
    h.place(100, 200, PILL_HEIGHT_PX, PILL_COPY_OFFSET_PX, PILL_WIDTH_PX);

    expect(h.hitAction(like.x + 2, 202)).toBe('like');
    expect(h.hitAction(copy.x + 2, 202)).toBe('copy');
    expect(h.hitAction(50, 202)).toBeNull();
    expect(h.hitAction(100, 100)).toBeNull();
  });

  it('keeps both hotspots at or above the minimum touch target', () => {
    const { hotspots: h, like, copy } = hotspots();
    h.place(0, 0, PILL_HEIGHT_PX, PILL_COPY_OFFSET_PX, PILL_WIDTH_PX);
    for (const rect of [like, copy]) {
      expect(rect.width).toBeGreaterThanOrEqual(24);
      expect(rect.height).toBeGreaterThanOrEqual(24);
    }
  });

  it('routes a click on each hotspot to its own action', () => {
    const onLikeToggle = mock(() => {});
    const onCopy = mock(() => {});
    const h = new SelectionHotspots({
      onLikeToggle,
      onCopy,
      likeLabel: () => 'Like',
      copyLabel: () => 'Copy',
    });
    const [like, copy] = h.children;
    like!.emit('click');
    expect(onLikeToggle).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(0);
    copy!.emit('click');
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('does not suppress pointer events, so a mouse can reach the actions', () => {
    const h = new SelectionHotspots({
      onLikeToggle: () => {},
      onCopy: () => {},
      likeLabel: () => 'Like',
      copyLabel: () => 'Copy',
    });
    for (const child of h.children) {
      const attrs = child.getA11yAttributes();
      expect(attrs.role).toBe('button');
      // The projected element is the ONLY mouse path to these actions: core
      // dispatches click from the a11y element, not from the canvas. Setting
      // pointerEvents:'none' here would make them keyboard-only.
      expect(attrs.pointerEvents).toBeUndefined();
    }
  });
});

describe('overlay surface stays readable over the danmaku wall', () => {
  it('is near-opaque so the moving danmaku behind it does not bleed through', () => {
    const match = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/.exec(BAKUDAN_THEME.surface);
    expect(match).not.toBeNull();
    const alpha = Number(match![1]);
    // At 0.82 a full 18% of a 20k-danmaku stream showed through the drawer.
    expect(alpha).toBeGreaterThanOrEqual(0.95);
    expect(alpha).toBeLessThan(1);
  });
});
