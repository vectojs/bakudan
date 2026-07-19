import { describe, expect, it } from 'bun:test';
import { DanmakuEntity } from '../src/view/DanmakuEntity';
import { createDefaultParams, type PoolSlot } from '../src/model/types';

function makeSlot(overrides?: Partial<PoolSlot>): PoolSlot {
  return {
    id: 0,
    active: true,
    params: { ...createDefaultParams(), text: 'テスト弾幕' },
    x: 100,
    y: 50,
    width: 120,
    rotation: 0,
    opacity: 1,
    age: 500,
    lane: 0,
    charAngles: new Float64Array(64),
    ...overrides,
  };
}

describe('DanmakuEntity', () => {
  it('_getCharWidths caches and returns stable widths', () => {
    const de = new DanmakuEntity();
    de.slot = makeSlot();
    de.boundParams = de.slot.params;
    // Access private _getCharWidths via direct call as we bypass TypeScript typing in test
    const widths1 = (de as any)._getCharWidths();
    const widths2 = (de as any)._getCharWidths();
    expect(widths1).toBe(widths2); // same reference = cache hit
    expect(widths1.length).toBe([...'テスト弾幕'].length);
  });

  it('_getCharWidths invalidates on text change', () => {
    const de = new DanmakuEntity();
    de.slot = makeSlot();
    de.boundParams = de.slot.params;
    const w1 = (de as any)._getCharWidths();
    de.slot.params = { ...createDefaultParams(), text: '別のテキスト' };
    const w2 = (de as any)._getCharWidths();
    expect(w1).not.toBe(w2);
  });

  it('hitAction returns null outside button region', () => {
    const de = new DanmakuEntity();
    de.slot = makeSlot();
    expect(de.hitAction(0)).toBeNull();
  });

  it('hitAction returns like/copy in button region', () => {
    const de = new DanmakuEntity();
    de.slot = makeSlot({ width: 100 });
    expect(de.hitAction(104 + 5)).toBe('like');
    expect(de.hitAction(124 + 5)).toBe('copy');
  });
});
