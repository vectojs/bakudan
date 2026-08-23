import { afterEach, describe, expect, test } from 'bun:test';
import { Scene } from '@vectojs/core';
import { App } from '../src/view/App';
import {
  DanmakuLayer,
  paintOrderKey,
  PILL_HEIGHT_PX,
  PILL_WIDTH_PX,
} from '../src/view/DanmakuLayer';
import type { SelectionHotspots } from '../src/view/SelectionHotspots';
import { StageBackground } from '../src/view/StageBackground';
import type { PoolSlot } from '../src/model/types';

/**
 * The Bilibili-style select -> actions flow: hover pauses, clicking selects,
 * the anchored action bar persists and stays clickable, Escape/outside-click/
 * expiry dismiss it. Every regression here encodes a live defect measured on
 * the running app (CTX-0015 slice c), and each was sabotage-validated by
 * reverting exactly the change under test and watching it go red.
 */

interface Fixture {
  app: App;
  scene: Scene;
}

const fixtures: Fixture[] = [];

function fixture(width = 1280, height = 800): Fixture {
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
  const scene = new Scene(canvas, { maxFPS: 0, maxDPR: 1, disableWindowResize: true });
  const app = new App(scene, { stageBackground: background });
  app.onResize(width, height);
  const value = { app, scene };
  fixtures.push(value);
  return value;
}

afterEach(() => {
  for (const { app, scene } of fixtures.splice(0)) {
    app.destroy();
    scene.destroy();
  }
});

let nextId = 500;

function primeSlot(
  app: App,
  opts: {
    x?: number;
    y?: number;
    width?: number;
    text?: string;
    fontSize?: number;
    preset?: PoolSlot['params']['preset'];
    effects?: Partial<PoolSlot['params']['effects']>;
  } = {},
): PoolSlot {
  const s = app.pool.slots[nextId++];
  s.active = true;
  s.interactionLocked = false;
  s.paused = false;
  s.hovered = false;
  s.liked = false;
  s.userSent = false;
  s.x = opts.x ?? 100;
  s.y = opts.y ?? 100;
  s.width = opts.width ?? 200;
  s.params = {
    contentId: undefined,
    text: opts.text ?? 'hello',
    color: '#ffffff',
    fontSize: opts.fontSize ?? 24,
    speed: 200,
    opacity: 1,
    preset: opts.preset ?? 'scroll',
    presetParams: {},
    effects: { glow: false, gradient: false, rainbow: false, outline: false, ...opts.effects },
  };
  return s;
}

function internals(app: App): {
  pointerX: number;
  pointerY: number;
  _interactiveMode: boolean;
  _selectedSlotId: number | null;
  _selectedLikeCount: number;
  _handleTapStage(): void;
  _handlePointerDown(ev: { clientX: number; clientY: number; pointerId: number }): void;
} {
  return app as unknown as ReturnType<typeof internals>;
}

function pointAt(app: App, x: number, y: number): void {
  const a = internals(app);
  a.pointerX = x;
  a.pointerY = y;
}

/** Drive the real pointerdown -> tap-stage path at a slot's glyph position. */
function tapSlot(app: App, s: PoolSlot): void {
  const a = internals(app);
  a._interactiveMode = true;
  pointAt(app, s.x + s.width / 2, s.y + s.params.fontSize * 0.5);
  a._handleTapStage();
}

function hotspots(app: App): SelectionHotspots {
  return (app as unknown as { _selectionHotspots: SelectionHotspots })._selectionHotspots;
}

function childRects(hs: SelectionHotspots): Array<{ x: number; y: number; width: number }> {
  return hs.children as Array<{ x: number; y: number; width: number }>;
}

describe('paint-order keys shared by draw and hit-test', () => {
  test('larger font buckets paint above smaller ones within the plain pass', () => {
    const { app } = fixture();
    const small = primeSlot(app, { fontSize: 18 });
    const large = primeSlot(app, { fontSize: 30 });
    expect(paintOrderKey(large) > paintOrderKey(small)).toBe(true);
  });

  test('special-effect slots paint above every plain slot', () => {
    const { app } = fixture();
    const plainHuge = primeSlot(app, { fontSize: 63 });
    const specialTiny = primeSlot(app, { fontSize: 16, preset: 'glitch' });
    expect(paintOrderKey(specialTiny) > paintOrderKey(plainHuge)).toBe(true);
    const rainbow = primeSlot(app, { fontSize: 20, effects: { rainbow: true } });
    expect(paintOrderKey(rainbow) > paintOrderKey(plainHuge)).toBe(true);
  });

  test('same bucket ties break by slot id (insertion order)', () => {
    const { app } = fixture();
    const first = primeSlot(app, { fontSize: 24 });
    const second = primeSlot(app, { fontSize: 24 });
    expect(paintOrderKey(second) > paintOrderKey(first)).toBe(true);
  });
});

describe('click lands on the danmaku that visually covers the point', () => {
  test('picks the larger bucket among overlapping plain danmaku', () => {
    const { app } = fixture();
    // Primed FIRST on purpose: insertion order opposes paint order, so an
    // index-based scan picks the visually-underneath danmaku and fails here.
    const over = primeSlot(app, { x: 150, y: 98, width: 300, fontSize: 30 });
    const under = primeSlot(app, { x: 100, y: 100, width: 300, fontSize: 18 });
    expect(under.id > over.id).toBe(true);
    pointAt(app, under.x + under.width / 2, under.y + 12);
    const picked = (
      app as unknown as { _findSlotAtPointer(): PoolSlot | null }
    )._findSlotAtPointer();
    expect(picked?.id).toBe(over.id);
  });

  test('picks the special-effect slot above a bigger plain one', () => {
    const { app } = fixture();
    const glitch = primeSlot(app, {
      x: 120,
      y: 100,
      width: 200,
      fontSize: 16,
      preset: 'glitch',
    });
    const plain = primeSlot(app, { x: 100, y: 100, width: 300, fontSize: 40 });
    expect(plain.id > glitch.id).toBe(true);
    pointAt(app, glitch.x + glitch.width / 2, glitch.y + 10);
    const picked = (
      app as unknown as { _findSlotAtPointer(): PoolSlot | null }
    )._findSlotAtPointer();
    expect(picked?.id).toBe(glitch.id);
  });
});

describe('Bilibili-model selection semantics', () => {
  test('selecting freezes the danmaku immediately, hover or not', () => {
    const { app } = fixture();
    const s = primeSlot(app, {});
    // No prior pointermove/hover ran: the tap itself must own the freeze.
    tapSlot(app, s);
    expect(internals(app)._selectedSlotId).toBe(s.id);
    expect(s.paused).toBe(true);
    expect(s.interactionLocked).toBe(true);
  });

  test('like works for spawned danmaku without engine contentId (text-keyed)', () => {
    const { app } = fixture();
    const s = primeSlot(app, { text: '前方高能' });
    tapSlot(app, s);
    (app as unknown as { _handleLikeToggle(): void })._handleLikeToggle();
    expect(s.liked).toBe(true);
    const store = (app as unknown as { _reactionStore: { get(k: string): { liked: boolean; count: number } } })._reactionStore;
    const rx = store.get('t:前方高能');
    expect(rx.liked).toBe(true);
    expect(rx.count).toBe(1);
    // Toggling again rolls back through the same stable key.
    (app as unknown as { _handleLikeToggle(): void })._handleLikeToggle();
    expect(store.get('t:前方高能')).toEqual({ liked: false, count: 0 });
  });

  test('the pill renders the persisted like count, not a 0/1 flag', () => {
    const { app } = fixture();
    const s = primeSlot(app, { text: '名场面' });
    // A count persisted by an earlier session must reach the pill through the
    // selection path alone — no in-session toggle may mask a missing read.
    const store = (
      app as unknown as {
        _reactionStore: { toggle(k: string): { liked: boolean; count: number } };
      }
    )._reactionStore;
    expect(store.toggle('t:名场面')).toEqual({ liked: true, count: 1 });

    tapSlot(app, s);
    const internalsNow = app as unknown as { _selectedLikeCount: number };
    expect(internalsNow._selectedLikeCount).toBe(1);
    expect(s.liked).toBe(true);
    const layer = (
      app.danmakuLayer as unknown as { getStage: () => { likeCount?: number } }
    ).getStage();
    expect(layer.likeCount).toBe(1);
  });

  test('a selected slot that expires takes its action bar with it', () => {
    const { app } = fixture();
    const s = primeSlot(app, {});
    tapSlot(app, s);
    expect(internals(app)._selectedSlotId).toBe(s.id);
    app.pool.deactivate(s.id);
    (app as unknown as { _updateHover(): void })._updateHover();
    expect(internals(app)._selectedSlotId).toBe(null);
  });
});

describe('the action bar survives dismissal cycles and stays put', () => {

});

describe('hover maintenance runs even while the bar is hovered', () => {
  test('a danmaku hovered before the bar does not stay frozen behind it', () => {
    const { app } = fixture();
    const selected = primeSlot(app, { x: 400, y: 400, width: 150, fontSize: 24 });
    const neighbor = primeSlot(app, { x: 100, y: 100, width: 150, fontSize: 24 });
    tapSlot(app, selected);
    const upd = (app as unknown as { _updateHover(): void })._updateHover.bind(app);

    // Pointer rests on the neighbor: it pauses under the cursor.
    pointAt(app, neighbor.x + 50, neighbor.y + 10);
    upd();
    expect(neighbor.hovered).toBe(true);
    expect(neighbor.paused).toBe(true);

    // Pointer moves onto the action bar: the neighbor must resume.
    const [like] = childRects(hotspots(app));
    pointAt(app, like.x + like.width / 2, like.y + PILL_HEIGHT_PX / 2);
    upd();
    expect(neighbor.hovered).toBe(false);
    expect(neighbor.paused).toBe(false);

    // The frozen selected danmaku itself keeps its hover flags clear.
    expect(selected.hovered).toBe(false);
  });

  test('hover-pause clears when the pointer moves off the danmaku', () => {
    const { app } = fixture();
    const s = primeSlot(app, { x: 200, y: 200, width: 150 });
    const upd = (app as unknown as { _updateHover(): void })._updateHover.bind(app);
    pointAt(app, s.x + 50, s.y + 10);
    upd();
    expect(s.paused).toBe(true);
    pointAt(app, s.x + 900, s.y + 10);
    upd();
    expect(s.hovered).toBe(false);
    expect(s.paused).toBe(false);
  });
});

describe('dismissal paths', () => {
  test('Escape fires from an action button even though it owns the keyboard', () => {
    const { app } = fixture();
    const s = primeSlot(app, {});
    tapSlot(app, s);
    (app as unknown as { _updateHover(): void })._updateHover();
    const [like] = childRects(hotspots(app));
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    (like as unknown as { emit(t: string, e: KeyboardEvent): void }).emit('keydown', ev);
    expect(internals(app)._selectedSlotId).toBe(null);
  });

  test('Enter on an action button toggles the like', () => {
    const { app } = fixture();
    const s = primeSlot(app, { text: '键盘操作' });
    tapSlot(app, s);
    (app as unknown as { _updateHover(): void })._updateHover();
    const [like] = childRects(hotspots(app));
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    (like as unknown as { emit(t: string, e: KeyboardEvent): void }).emit('keydown', ev);
    expect(s.liked).toBe(true);
  });

  test('a tap on empty stage dismisses the current selection', () => {
    const { app } = fixture();
    const s = primeSlot(app, {});
    tapSlot(app, s);
    expect(internals(app)._selectedSlotId).toBe(s.id);
    pointAt(app, 5, 5);
    internals(app)._handleTapStage();
    expect(internals(app)._selectedSlotId).toBe(null);
    // The bar parks far off-scene together with zeroed children.
    expect(hotspots(app).x).toBeLessThan(-90_000);
  });

  test('dismissing resets the cached like count', () => {
    const { app } = fixture();
    const s = primeSlot(app, {});
    tapSlot(app, s);
    (app as unknown as { _handleLikeToggle(): void })._handleLikeToggle();
    expect((app as unknown as { _selectedLikeCount: number })._selectedLikeCount).toBe(1);
    app.dismiss();
    expect((app as unknown as { _selectedLikeCount: number })._selectedLikeCount).toBe(0);
  });
});

describe('the painted pill carries the persisted like count', () => {
  function makeRenderer() {
    const texts: string[] = [];
    const renderer = {
      setGlobalAlpha: () => {},
      fillText: (text: string) => texts.push(text),
      beginPath: () => {},
      roundRect: () => {},
      fill: () => {},
      stroke: () => {},
    };
    return { texts, renderer: renderer as unknown as IRenderer };
  }

  test('drawSelectedPill renders state.likeCount instead of s.liked?1:0', () => {
    const slot: PoolSlot = {
      id: 7,
      active: true,
      interactionLocked: true,
      paused: true,
      liked: true,
      x: 50,
      y: 50,
      width: 100,
      params: {
        contentId: undefined,
        text: 'x',
        color: '#fff',
        fontSize: 24,
        speed: 200,
        opacity: 1,
        preset: 'scroll',
        presetParams: {},
        effects: { glow: false, gradient: false, rainbow: false, outline: false },
      },
    } as unknown as PoolSlot;
    // liked=true and store count=7: only the real count is correct here.
    const pool = { slots: [slot] } as unknown as DanmakuPool;
    const layer = new DanmakuLayer(pool, () => ({
      w: 800,
      h: 600,
      interactive: true,
      hoveredAction: null,
      likeCount: 7,
    }));
    const { texts, renderer } = makeRenderer();
    layer.render(renderer);
    expect(texts).toContain('7');
    expect(texts).not.toContain('1');
  });
});

describe('taps are processed no matter how long the pointer rested', () => {
  test('a tap with interactive mode decayed still selects what is under it', () => {
    const { app } = fixture();
    const s = primeSlot(app, { x: 300, y: 300, width: 200, fontSize: 24 });
    const a = internals(app);
    a._interactiveMode = false; // pointer idle > the old 1.5s budget
    const down = () =>
      a._handlePointerDown({
        clientX: s.x + s.width / 2,
        clientY: s.y + 10,
        pointerId: 1,
      });
    expect(down).not.toThrow();
    expect(a._selectedSlotId).toBe(s.id);
  });

  test('a pointerdown without an active capture target does not throw', () => {
    const { app } = fixture();
    const a = internals(app);
    a._interactiveMode = true;
    // happy-dom's canvas no-ops capture, so force the exact live failure
    // (NotFoundError for an inactive pointer id) onto the stub.
    const canvas = app.scene.canvas as unknown as {
      setPointerCapture(id: number): void;
    };
    const original = canvas.setPointerCapture.bind(canvas);
    canvas.setPointerCapture = () => {
      throw new Error(
        "Failed to execute 'setPointerCapture' on 'Element': No active pointer",
      );
    };
    try {
      expect(() =>
        a._handlePointerDown({ clientX: 10, clientY: 10, pointerId: 99_999 }),
      ).not.toThrow();
    } finally {
      canvas.setPointerCapture = original;
    }
  });
});

describe('pill geometry constants match the placed hotspots', () => {
  test('placing after parking restores world coordinates end to end', () => {
    const { app } = fixture();
    const s = primeSlot(app, { x: 500, y: 300, width: 180, fontSize: 32 });
    tapSlot(app, s);
    const upd = (app as unknown as { _updateHover(): void })._updateHover.bind(app);
    upd();
    // Dismiss parks everything...
    app.dismiss();
    expect(hotspots(app).x).toBeLessThan(-90_000);
    const [like, copy] = childRects(hotspots(app));
    expect(like.width).toBe(0);
    // ...then selecting again must compose back to the painted pill rect.
    tapSlot(app, s);
    upd();
    expect(hotspots(app).x).toBe(0);
    expect(hotspots(app).y).toBe(0);
    expect(like.x).toBe(Math.round(s.x));
    expect(copy.x).toBe(Math.round(s.x) + 60);
    expect(like.width).toBe(60);
    // 80 - 60 clamps up to the WCAG minimum touch target.
    expect(copy.width).toBe(Math.max(24, PILL_WIDTH_PX - 60));
    expect(like.height).toBe(PILL_HEIGHT_PX);
  });
});
