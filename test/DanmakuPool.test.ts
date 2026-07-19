import { describe, expect, it } from 'bun:test';
import { DanmakuPool } from '../src/model/DanmakuPool';
import { createDefaultParams, type DanmakuParams } from '../src/model/types';

function makeParams(text = 'hello'): DanmakuParams {
  return { ...createDefaultParams(), text };
}

function makeSlot(): DanmakuParams[] {
  return Array.from({ length: 10 }, (_, i) => makeParams(`dmk-${i}`));
}

describe('DanmakuPool', () => {
  it('preallocates to fixed capacity', () => {
    const pool = new DanmakuPool(100);
    expect(pool.capacity).toBe(100);
    expect(pool.activeCount).toBe(0);
    expect(pool.slots.length).toBe(100);
  });

  it('activates slots up to capacity', () => {
    const pool = new DanmakuPool(5);
    const added = pool.activateBatch(makeSlot());
    expect(added.length).toBe(5);
    expect(pool.activeCount).toBe(5);
  });

  it('rejects activation beyond capacity', () => {
    const pool = new DanmakuPool(3);
    pool.activateBatch(makeSlot()); // 3/3 filled
    const added = pool.activateBatch([makeParams('extra')]);
    expect(added.length).toBe(0);
  });

  it('recycles slots on deactivate', () => {
    const pool = new DanmakuPool(5);
    pool.activateBatch(makeSlot().slice(0, 3));
    expect(pool.activeCount).toBe(3);
    const ids = pool.slots.filter((s) => s.active).map((s) => s.id);
    pool.deactivate(ids[1]);
    expect(pool.activeCount).toBe(2);
    const added = pool.activateBatch([makeParams('recycled')]);
    expect(added.length).toBe(1);
    expect(pool.activeCount).toBe(3);
  });

  it('reports correct active count after mixed activate/deactivate', () => {
    const pool = new DanmakuPool(5);
    pool.activateBatch(makeSlot().slice(0, 4));
    pool.deactivate(0);
    pool.deactivate(2);
    pool.activateBatch([makeParams('new')]);
    expect(pool.activeCount).toBe(3);
  });

  it('getActiveIds returns all active slot ids', () => {
    const pool = new DanmakuPool(5);
    pool.activateBatch(makeSlot().slice(0, 3));
    const ids = pool.getActiveIds();
    expect(ids.length).toBe(3);
    expect(ids.every((id) => id >= 0 && id < 5)).toBe(true);
  });

  it('deactivateBatch clears multiple slots', () => {
    const pool = new DanmakuPool(5);
    pool.activateBatch(makeSlot().slice(0, 5));
    pool.deactivateBatch([0, 2, 4]);
    expect(pool.activeCount).toBe(2);
  });

  it('activateBatch returns the exact recycled slot when a low index frees up while higher indices stay active', () => {
    // Regression test: activateBatch must return the slot it actually wrote
    // to, not force callers to guess via getActiveIds()[length-1]. _findFree
    // scans from index 0, so freeing a low index while high indices remain
    // active must return that low-index slot, not the highest active id.
    const pool = new DanmakuPool(10);
    pool.activateBatch(makeSlot()); // fills indices 0-9
    pool.deactivate(3);
    const [slot] = pool.activateBatch([makeParams('recycled-into-3')]);
    expect(slot).toBeDefined();
    expect(slot!.id).toBe(3);
    expect(slot!.params.text).toBe('recycled-into-3');
    // The highest-index slot must be untouched by the recycle.
    expect(pool.slots[9].params.text).toBe('dmk-9');
  });

  it('reset clears all active slots', () => {
    const pool = new DanmakuPool(5);
    pool.activateBatch(makeSlot().slice(0, 4));
    pool.reset();
    expect(pool.activeCount).toBe(0);
    expect(pool.slots.every((s) => !s.active)).toBe(true);
  });

  it('activeCount is O(1) and accurate after mixed ops', () => {
    const pool = new DanmakuPool(10);
    expect(pool.activeCount).toBe(0);
    pool.activateBatch(makeSlot().slice(0, 5));
    expect(pool.activeCount).toBe(5);
    pool.deactivate(0);
    pool.deactivate(1);
    expect(pool.activeCount).toBe(3);
    pool.activateBatch([makeParams('new1'), makeParams('new2')]);
    expect(pool.activeCount).toBe(5);
    pool.reset();
    expect(pool.activeCount).toBe(0);
  });
});
