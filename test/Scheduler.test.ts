import { describe, expect, it } from 'bun:test';
import { DanmakuPool } from '../src/model/DanmakuPool';
import { Scheduler } from '../src/model/Scheduler';
import { createDefaultParams, type PresetId } from '../src/model/types';

describe('Scheduler', () => {
  const preset: PresetId = 'scroll';

  it('spawns danmaku respecting maxCount ceiling', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 50);
    sched.tick(16, preset, {
      cursorX: 0,
      cursorY: 0,
      pointerActive: false,
    });
    expect(pool.activeCount).toBeGreaterThan(0);
    expect(pool.activeCount).toBeLessThanOrEqual(50);
  });

  it('userSpawn() adds a danmaku with given text', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 100);
    sched.userSpawn({ ...createDefaultParams(), text: 'user message', preset });
    expect(pool.activeCount).toBe(1);
    expect(pool.slots.find((s) => s.active)!.params.text).toBe('user message');
  });

  it('respects targetCount when filling', () => {
    const pool = new DanmakuPool(200);
    const sched = new Scheduler(pool, 1920, 1080, 100);
    for (let i = 0; i < 30; i++) {
      sched.tick(16, preset, {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    expect(pool.activeCount).toBeGreaterThan(0);
    expect(pool.activeCount).toBeLessThanOrEqual(100);
  });

  it('deactivates danmaku that leave the viewport (targetCount=0 = no refill)', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 0);
    sched.userSpawn({
      ...createDefaultParams(),
      text: 'AAAA',
      preset: 'scroll',
      speed: 1000,
    });
    sched.userSpawn({
      ...createDefaultParams(),
      text: 'BBBB',
      preset: 'scroll',
      speed: 1000,
    });
    expect(pool.activeCount).toBe(2);
    // dt=5000ms at speed 1000px/s => both should be far off-screen left
    sched.tick(5000, preset, {
      cursorX: 0,
      cursorY: 0,
      pointerActive: false,
    });
    expect(pool.activeCount).toBe(0);
  });

  it('assigns valid lane indices (non-negative, in bounds)', () => {
    const pool = new DanmakuPool(100);
    const sched = new Scheduler(pool, 1920, 1080, 10);
    for (let i = 0; i < 30; i++) {
      sched.tick(16, 'scroll', {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    for (const slot of pool.slots) {
      if (slot.active) {
        expect(slot.lane).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('setTargetCount changes the ceiling live', () => {
    const pool = new DanmakuPool(200);
    const sched = new Scheduler(pool, 1920, 1080, 50);
    for (let i = 0; i < 20; i++) {
      sched.tick(16, preset, {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    const before = pool.activeCount;
    sched.setTargetCount(150);
    for (let i = 0; i < 30; i++) {
      sched.tick(16, preset, {
        cursorX: 0,
        cursorY: 0,
        pointerActive: false,
      });
    }
    expect(pool.activeCount).toBeGreaterThan(before);
    expect(pool.activeCount).toBeLessThanOrEqual(150);
  });
});
