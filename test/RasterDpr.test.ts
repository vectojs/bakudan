import { describe, expect, test } from 'bun:test';
import type { IRenderer } from '@vectojs/core';
import type { DanmakuPool } from '@vectojs/danmaku-core';
import { DanmakuLayer } from '../src/view/DanmakuLayer';

/**
 * The Canvas2D fallback text rasters must be keyed to the renderer's live
 * pixelRatio (IRenderer.pixelRatio, core >= 1.29.0): a raster built at dpr 1
 * blitted onto a dpr-1.6 backing store resamples and looks exactly like the
 * maxDPR blur this slice fixes. Sabotage: remove the pixelRatio tracking
 * block at the top of DanmakuLayer.render() — every assertion here goes red.
 */
describe('RasterDpr', () => {
  function makeLayer(): DanmakuLayer {
    const pool = { slots: [] } as unknown as DanmakuPool;
    return new DanmakuLayer(pool, () => ({ w: 100, h: 100, interactive: false }));
  }

  const rendererWith = (pixelRatio?: number): IRenderer =>
    ({
      setGlobalAlpha: () => {},
      ...(pixelRatio !== undefined ? { pixelRatio } : {}),
    }) as unknown as IRenderer;

  test('starts at dpr 1 before the first render', () => {
    expect(makeLayer().rasterCacheDpr).toBe(1);
  });

  test('adopts the renderer live pixelRatio on render', () => {
    const layer = makeLayer();
    layer.render(rendererWith(1.6));
    expect(layer.rasterCacheDpr).toBe(1.6);
  });

  test('treats a missing pixelRatio (legacy backend) as 1', () => {
    const layer = makeLayer();
    layer.render(rendererWith(undefined));
    expect(layer.rasterCacheDpr).toBe(1);
  });

  test('rebuilds the cache when the ratio changes back (zoom / monitor move)', () => {
    const layer = makeLayer();
    layer.render(rendererWith(2));
    const statsAt2 = layer.rasterStats;
    expect(layer.rasterCacheDpr).toBe(2);
    layer.render(rendererWith(1));
    expect(layer.rasterCacheDpr).toBe(1);
    // A fresh cache starts empty; reusing the old one would keep its counters.
    expect(layer.rasterStats).not.toBe(statsAt2);
    expect(layer.rasterStats.misses).toBe(0);
  });
});
