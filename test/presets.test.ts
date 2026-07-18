import { describe, expect, it } from 'bun:test';
import { PRESETS } from '../src/model/presets';
import { createDefaultParams, type PoolSlot, type PresetState } from '../src/model/types';

function makeSlot(): PoolSlot {
  return {
    id: 0,
    active: true,
    params: { ...createDefaultParams(), text: 'Hello' },
    x: 500,
    y: 100,
    width: 120,
    rotation: 0,
    opacity: 1,
    age: 0,
    lane: 2,
    charAngles: new Float64Array(64),
    charColors: [],
  };
}

const state: PresetState = {
  time: 0,
  cursorX: 400,
  cursorY: 300,
  pointerActive: true,
};
const W = 1920;
const H = 1080;

describe('presets', () => {
  it('scroll moves left', () => {
    const s = makeSlot();
    PRESETS.scroll(s, 16, state, W, H);
    expect(s.x).toBeLessThan(500);
  });

  it('reverse moves right', () => {
    const s = makeSlot();
    PRESETS.reverse(s, 16, state, W, H);
    expect(s.x).toBeGreaterThan(500);
  });

  it('top fixes at center x', () => {
    const s = makeSlot();
    PRESETS.top(s, 16, state, W, H);
    expect(s.x).toBe((W - s.width) / 2);
    expect(s.y).toBe(24);
  });

  it('bottom fixes near bottom', () => {
    const s = makeSlot();
    PRESETS.bottom(s, 16, state, W, H);
    expect(s.y).toBe(H - 24);
  });

  it('sine oscillates y', () => {
    const s1 = makeSlot();
    const s2 = makeSlot();
    PRESETS.sine(s1, 250, state, W, H);
    PRESETS.sine(s2, 500, state, W, H);
    expect(s1.y).not.toBe(s2.y);
  });

  it('rotation sets per-char angles', () => {
    const s = makeSlot();
    s.params.text = 'ABCD';
    PRESETS.rotation(s, 100, state, W, H);
    const hasNonZero = Array.from(s.charAngles.slice(0, 4)).some((a) => a !== 0);
    expect(hasNonZero).toBe(true);
  });

  it('glitch moves like scroll but records age', () => {
    const s = makeSlot();
    PRESETS.glitch(s, 16, state, W, H);
    expect(s.x).toBeLessThan(500);
    expect(s.age).toBe(16);
  });

  it('repulsion pushes away from cursor when active', () => {
    const s = makeSlot();
    s.x = 350;
    s.width = 100;
    PRESETS.repulsion(s, 16, state, W, H);
    expect(s.y).not.toBe(118);
  });

  it('repulsion falls back to scroll when pointer inactive', () => {
    const s = makeSlot();
    const inactiveState: PresetState = { ...state, pointerActive: false };
    PRESETS.repulsion(s, 16, inactiveState, W, H);
    expect(s.x).toBeLessThan(500);
  });
});
