import { afterEach, describe, expect, test } from 'bun:test';
import { Scene } from '@vectojs/core';
import { App } from '../src/view/App';
import {
  DanmakuLayer,
  paintOrderKey,
  PAUSE_CHIP_HEIGHT_PX,
  PAUSE_CHIP_PADDING_PX,
  PILL_BASELINE_FACTOR,
  PILL_HEIGHT_PX,
  PILL_LIKE_BASELINE_OFFSET_PX,
  PILL_COPY_BASELINE_OFFSET_PX,
  PILL_WIDTH_PX,
} from '../src/view/DanmakuLayer';
import { BAKUDAN_THEME } from '../src/view/cinemaConfig';
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
  _handlePointerMove(ev: { clientX: number; clientY: number }): void;
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

/** Renderer double that records every draw call for paint-level assertions. */
function makeRecordingRenderer() {
  const texts: string[] = [];
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const renderer = {
    setGlobalAlpha: () => calls.push({ op: 'setGlobalAlpha', args: [] }),
    fillText: (text: string, x: number, y: number, font?: string, color?: string) => {
      texts.push(text);
      calls.push({ op: 'fillText', args: [text, x, y, font, color] });
    },
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    roundRect: (...args: unknown[]) => calls.push({ op: 'roundRect', args }),
    fill: (color?: string) => calls.push({ op: 'fill', args: [color] }),
    stroke: (color?: string, width?: number) => calls.push({ op: 'stroke', args: [color, width] }),
    drawImage: () => calls.push({ op: 'drawImage', args: [] }),
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    translate: () => calls.push({ op: 'translate', args: [] }),
    rotate: () => calls.push({ op: 'rotate', args: [] }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  return { texts, calls, renderer: renderer as unknown as IRenderer };
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
    const store = (
      app as unknown as { _reactionStore: { get(k: string): { liked: boolean; count: number } } }
    )._reactionStore;
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

describe('the action bar survives dismissal cycles and stays put', () => {});

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
  const makeRenderer = makeRecordingRenderer;

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

describe('round-2 pill paint details stay coherent with the hotspots', () => {
  function selectedSlot(): PoolSlot {
    return {
      id: 7,
      active: true,
      interactionLocked: true,
      paused: true,
      liked: false,
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
  }

  function makeLayer(stageOverrides: Record<string, unknown> = {}) {
    const pool = { slots: [selectedSlot()] } as unknown as DanmakuPool;
    return new DanmakuLayer(pool, () => ({
      w: 800,
      h: 600,
      interactive: false,
      hoveredAction: null,
      likeCount: 3,
      ...stageOverrides,
    }));
  }

  function fillCalls(layer: DanmakuLayer): Array<[string, number, number, string?]> {
    const { calls, renderer } = makeRecordingRenderer();
    layer.render(renderer);
    return calls.filter((c) => c.op === 'fillText').map((c) => c.args as never);
  }

  test('copy glyph rides exactly PILL_COPY_BASELINE_OFFSET_PX below the heart', () => {
    const layer = makeLayer();
    const draws = fillCalls(layer);
    const heart = draws.find(([text]) => text === '\uD83E\uDD0D');
    const copy = draws.find(([text]) => text === '\uD83C\uDFCB\uFE0F');
    expect(heart).toBeDefined();
    expect(copy).toBeDefined();
    const pillY = Math.round(50) + 24 * PILL_BASELINE_FACTOR;
    expect(heart![2]).toBe(pillY + PILL_LIKE_BASELINE_OFFSET_PX);
    expect(copy![2]).toBe(pillY + PILL_COPY_BASELINE_OFFSET_PX);
    // Independent floor: on the reference stack the clipboard's ink CENTER
    // sits ~1.7px BELOW the heart's at a shared baseline, so a real upward
    // correction must exist - a 0 offset is the pre-R2 misalignment.
    expect(PILL_COPY_BASELINE_OFFSET_PX).toBeLessThanOrEqual(-1);
    expect(copy![2] - heart![2]).toBe(PILL_COPY_BASELINE_OFFSET_PX);
  });

  test('like count paints promoted semibold typography', () => {
    const layer = makeLayer();
    const draws = fillCalls(layer);
    const count = draws.find(([text]) => text === '3');
    expect(count).toBeDefined();
    expect(count![3]).toContain('600 15px');
  });

  test('selection outline rounds at the theme radius, hover chips stay tight', () => {
    const { calls, renderer } = makeRecordingRenderer();
    makeLayer().render(renderer);
    const rects = calls
      .filter((c) => c.op === 'roundRect')
      .map((c) => c.args as [number, number, number, number, number]);
    // The pill plate rect: radius == theme radius.
    const plate = rects.find(([, , , , r]) => r === BAKUDAN_THEME.radius);
    expect(plate).toBeDefined();
    // The selection box around the text: also theme radius (was chip-tier 6).
    const box = rects.filter(([, , , , r]) => r === BAKUDAN_THEME.radius);
    expect(box.length).toBeGreaterThanOrEqual(2);
  });

  test('a hover-frozen danmaku wears the localized paused chip', () => {
    const layer = makeLayer({ interactive: true, pausedLabel: 'Paused' });
    const slot = (layer as unknown as { pool: { slots: PoolSlot[] } }).pool.slots[0];
    // Hover state only: unlocked, so the slot takes the PLAIN pass where the
    // chip lives (the selected pass has the action pill instead).
    slot.interactionLocked = false;
    slot.hovered = true;
    const out = makeRecordingRenderer();
    layer.render(out.renderer);
    const { texts, calls } = out;
    const chip = texts.find((t) => t === '\u23F8 Paused');
    expect(chip).toBeDefined();
    // The chip plate stays within the frozen danmaku's bounds-plus-pad band:
    // it labels THIS danmaku, it must not become its own floating slab.
    const rects = calls
      .filter((c) => c.op === 'roundRect')
      .map((c) => c.args as [number, number, number, number, number]);
    const chipRect = rects.find(([, y, , h]) => h === PAUSE_CHIP_HEIGHT_PX && y < 50 + 12);
    expect(chipRect).toBeDefined();
    const [x] = chipRect!;
    expect(x).toBeLessThanOrEqual(slot.x + slot.width + 4);
    expect(x).toBeGreaterThanOrEqual(slot.x - 4 - PAUSE_CHIP_PADDING_PX * 2);
  });

  test('user-sent danmaku do not grow a paused chip (identity outranks inspection)', () => {
    const layer = makeLayer({ interactive: true, pausedLabel: 'Paused' });
    const slot = (layer as unknown as { pool: { slots: PoolSlot[] } }).pool.slots[0];
    slot.interactionLocked = false;
    slot.userSent = true;
    slot.hovered = true;
    const out = makeRecordingRenderer();
    layer.render(out.renderer);
    const { texts } = out;
    expect(texts.some((t) => String(t).includes('Paused'))).toBe(false);
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
      throw new Error("Failed to execute 'setPointerCapture' on 'Element': No active pointer");
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

describe('pointer coords stay world-true at any device pixel ratio', () => {
  // vectojs/bakudan#40: the handlers scaled client px by canvas.width /
  // rect.width, which is the BACKING-STORE ratio. Harmless while maxDPR
  // pinned the backing store to 1x (#29 raised it to min(dpr, 2)), then every
  // hit-test evaluated dpr-fold down-right of the cursor: hover missed and
  // taps selected nothing. These fixtures pin a 1.6x backing store under a
  // CSS-sized rect, exactly what the live renderer builds on a 1.6-scaled
  // panel.
  function hiDpiFixture(width = 1280, height = 800, dpr = 1.6): Fixture {
    const f = fixture(width, height);
    const canvas = f.scene.canvas;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect;
    return f;
  }

  test('pointermove maps client px to scene/world px, not backing-store px', () => {
    const { app } = hiDpiFixture();
    const a = internals(app);
    a._handlePointerMove({ clientX: 400, clientY: 300 });
    expect(a.pointerX).toBe(400);
    expect(a.pointerY).toBe(300);
  });

  test('hover follows the cursor when the backing store is scaled', () => {
    const { app } = hiDpiFixture();
    const s = primeSlot(app, { x: 350, y: 288, width: 100, fontSize: 24 });
    const a = internals(app);
    a._handlePointerMove({ clientX: s.x + s.width / 2, clientY: s.y + 12 });
    (app as unknown as { _updateHover(): void })._updateHover();
    expect(s.hovered).toBe(true);
  });

  test('click selects the danmaku under the cursor when the backing store is scaled', () => {
    const { app } = hiDpiFixture();
    const s = primeSlot(app, { x: 350, y: 288, width: 100, fontSize: 24 });
    const a = internals(app);
    a._handlePointerDown({
      clientX: s.x + s.width / 2,
      clientY: s.y + 12,
      pointerId: 7,
    });
    expect(a._selectedSlotId).toBe(s.id);
  });
});
