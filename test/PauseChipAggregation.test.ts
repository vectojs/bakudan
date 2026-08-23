import { describe, expect, test } from 'bun:test';
import type { IRenderer } from '@vectojs/core';
import type { DanmakuPool, PoolSlot } from '@vectojs/danmaku-core';
import {
  DanmakuLayer,
  PAUSE_CHIP_AGGREGATE_THRESHOLD,
  PAUSE_CHIP_HEIGHT_PX,
  PAUSE_CHIP_SAFE_GAP_PX,
} from '../src/view/DanmakuLayer';

/**
 * Paused-chip anti-mush (round 3): past PAUSE_CHIP_AGGREGATE_THRESHOLD the
 * per-slot labels collapsed into an illegible overlapping band under a resting
 * pointer (~9 chips, y378-435 in the r2 QA captures), and one chip vanished
 * entirely behind the now-opaque top bar. The suite pins the three contracts:
 * aggregation threshold, safe-zone clipping, and localized summary labels.
 *
 * Sabotage arms: force individual chips past the threshold -> threshold tests
 * red; drop the safeTop clamps -> safe-zone tests red; break label
 * interpolation -> localization test red.
 */

let nextId = 900;

function frozenSlot(x: number, y: number): PoolSlot {
  const id = nextId++;
  return {
    id,
    active: true,
    x,
    y,
    width: 120,
    age: 1000,
    hovered: true,
    userSent: false,
    interactionLocked: false,
    paused: true,
    liked: false,
    charAngles: null,
    params: {
      contentId: undefined,
      text: `comment-${id}`,
      color: '#ffffff',
      fontSize: 24,
      speed: 200,
      opacity: 1,
      preset: 'scroll',
      presetParams: {},
      effects: { glow: false, gradient: false, rainbow: false, outline: false },
    },
  } as unknown as PoolSlot;
}

function makeLayer(slots: PoolSlot[], stage: Record<string, unknown> = {}): DanmakuLayer {
  const pool = { slots } as unknown as DanmakuPool;
  return new DanmakuLayer(pool, () => ({
    w: 800,
    h: 600,
    interactive: true,
    pausedLabel: 'Paused',
    safeTop: 34,
    ...stage,
  }));
}

/** Renderer double recording every draw call for paint-level assertions. */
function recordingRenderer() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const renderer = {
    setGlobalAlpha: () => calls.push({ op: 'setGlobalAlpha', args: [] }),
    fillText: (...args: unknown[]) => calls.push({ op: 'fillText', args }),
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    roundRect: (...args: unknown[]) => calls.push({ op: 'roundRect', args }),
    moveTo: () => calls.push({ op: 'moveTo', args: [] }),
    lineTo: () => calls.push({ op: 'lineTo', args: [] }),
    bezierCurveTo: () => calls.push({ op: 'bezierCurveTo', args: [] }),
    closePath: () => calls.push({ op: 'closePath', args: [] }),
    fill: (color?: string) => calls.push({ op: 'fill', args: [color] }),
    stroke: (color?: string, width?: number) => calls.push({ op: 'stroke', args: [color, width] }),
    drawImage: () => calls.push({ op: 'drawImage', args: [] }),
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    translate: () => calls.push({ op: 'translate', args: [] }),
    rotate: () => calls.push({ op: 'rotate', args: [] }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    pixelRatio: 1,
  };
  return { calls, renderer: renderer as unknown as IRenderer };
}

function chipRects(calls: Array<{ op: string; args: unknown[] }>): Array<[number, number]> {
  return calls
    .filter((c) => c.op === 'roundRect' && c.args[3] === PAUSE_CHIP_HEIGHT_PX)
    .map((c) => [c.args[0] as number, c.args[1] as number]);
}

describe('paused-chip anti-mush (round 3)', () => {
  test('at or below the threshold every frozen danmaku wears its own chip', () => {
    const slots = Array.from({ length: PAUSE_CHIP_AGGREGATE_THRESHOLD }, (_, i) =>
      frozenSlot(80 + i * 220, 300),
    );
    const { calls, renderer } = recordingRenderer();
    makeLayer(slots).render(renderer);
    const labels = calls.filter(
      (c) => c.op === 'fillText' && String(c.args[0]) === '\u23F8 Paused',
    );
    expect(labels.length).toBe(PAUSE_CHIP_AGGREGATE_THRESHOLD);
  });

  test('above the threshold the chips collapse into ONE summary chip', () => {
    const n = PAUSE_CHIP_AGGREGATE_THRESHOLD + 1;
    const slots = Array.from({ length: n }, (_, i) => frozenSlot(60 + i * 90, 300));
    const { calls, renderer } = recordingRenderer();
    makeLayer(slots).render(renderer);
    const summaries = calls.filter(
      (c) => c.op === 'fillText' && String(c.args[0]).includes(`\u23F8 ${n} Paused`),
    );
    expect(summaries.length).toBe(1);
    expect(calls.some((c) => c.op === 'fillText' && String(c.args[0]) === '\u23F8 Paused')).toBe(
      false,
    );
    // Exactly one chip plate on the layer.
    expect(chipRects(calls).length).toBe(1);
  });

  test('the summary reuses the kit paused label verbatim (localized)', () => {
    const slots = Array.from({ length: 6 }, (_, i) => frozenSlot(60 + i * 80, 300));
    const { calls, renderer } = recordingRenderer();
    makeLayer(slots, { pausedLabel: '\u4E00\u6642\u505C\u6B62\u4E2D' }).render(renderer);
    const summary = calls.find(
      (c) => c.op === 'fillText' && String(c.args[0]).startsWith('\u23F8'),
    );
    expect(String(summary!.args[0])).toBe('\u23F8 6 \u4E00\u6642\u505C\u6B62\u4E2D');
  });

  test('individual chips never paint inside the top-bar safe zone', () => {
    // A danmaku frozen right under the bar used to lose its chip behind it.
    const slots = Array.from({ length: PAUSE_CHIP_AGGREGATE_THRESHOLD }, (_, i) =>
      frozenSlot(80 + i * 220, 10),
    );
    const { calls, renderer } = recordingRenderer();
    makeLayer(slots, { safeTop: 34 }).render(renderer);
    for (const [, y] of chipRects(calls)) {
      expect(y).toBeGreaterThanOrEqual(34 + PAUSE_CHIP_SAFE_GAP_PX);
    }
  });

  test('the aggregated summary respects the safe zone too', () => {
    const slots = Array.from({ length: 7 }, (_, i) => frozenSlot(60 + i * 70, 12));
    const { calls, renderer } = recordingRenderer();
    makeLayer(slots, { safeTop: 34 }).render(renderer);
    const rects = chipRects(calls);
    expect(rects.length).toBe(1);
    expect(rects[0]![1]).toBeGreaterThanOrEqual(34 + PAUSE_CHIP_SAFE_GAP_PX);
  });

  test('the summary stays clamped fully inside the stage', () => {
    // Cluster far right + near bottom: centroid clamp must keep the chip on-screen.
    const slots = Array.from({ length: 5 }, (_, i) => frozenSlot(700 + (i % 2) * 40, 540 + i));
    const { calls, renderer } = recordingRenderer();
    makeLayer(slots, { w: 800, h: 600 }).render(renderer);
    const rects = chipRects(calls);
    expect(rects.length).toBe(1);
    const [x, y] = rects[0]!;
    expect(x).toBeGreaterThanOrEqual(4);
    expect(y + PAUSE_CHIP_HEIGHT_PX).toBeLessThanOrEqual(600 - 4 + 1);
  });
});
