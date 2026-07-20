/**
 * Pre-rasterized text bitmap cache for the danmaku stress pool.
 *
 * At 5,000 concurrent danmaku the dominant per-frame cost is not the scene
 * walk (already collapsed to one node) but 5,000 native `ctx.fillText()`
 * calls. Each one re-shapes the string, re-parses the CSS color, and
 * rasterizes glyphs on the CPU main thread — which is why a GPU profile shows
 * the card starved/downclocked while the main thread is pegged in native
 * (`(program)`) code. A fixed-font reference impl hits 58fps precisely because
 * it avoids per-draw font/color churn.
 *
 * This cache rasterizes each distinct `(text, fontSize, color)` run to a small
 * offscreen canvas exactly once. Every subsequent frame the DanmakuLayer blits
 * it with a single `drawImage`, turning CPU text shaping into a GPU-friendly
 * bitmap copy. The stress pool samples from a fixed ~177-string library across
 * 3 font tiers and 8 colors, so the key space is bounded (~4.2k entries) and
 * the steady-state hit rate approaches 100%. User-submitted danmaku add
 * unbounded keys, so an insertion-order eviction cap keeps memory sane.
 */

/** A rasterized text run plus the offset needed to blit it at a baseline. */
export interface TextBitmap {
  canvas: HTMLCanvasElement;
  /** Backing-store width in px (== blit destination width, DPR is 1). */
  w: number;
  /** Backing-store height in px. */
  h: number;
  /** Left inset of the glyph origin inside the canvas. */
  offsetX: number;
  /** Distance from the canvas top down to the text baseline. */
  offsetY: number;
}

/** Instrumentation for the HUD: bitmaps reused vs. freshly rasterized. */
export const textBitmapStats = { hits: 0, misses: 0, size: 0 };

const cache = new Map<string, TextBitmap>();

/**
 * Hard cap on cached bitmaps. The fixed library needs ~4.2k; the headroom
 * absorbs user-sent strings. On overflow the oldest ~10% (insertion order,
 * which Map preserves) are evicted — the fixed working set is re-rasterized
 * cheaply on its next miss, and transient user strings age out naturally.
 */
const MAX_ENTRIES = 6000;

let scratchCtx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D | null {
  if (!scratchCtx) {
    const c = document.createElement('canvas');
    scratchCtx = c.getContext('2d');
  }
  return scratchCtx;
}

/**
 * Return the cached bitmap for a text run, rasterizing it on first request.
 *
 * @param text - The danmaku string (may contain CJK / emoji).
 * @param fontSize - Integer font size in logical px (Scheduler floors it).
 * @param font - The full CSS font shorthand used for both measure and paint.
 * @param color - CSS color string, baked into the bitmap.
 * @returns The bitmap, or `null` in a non-DOM/headless context.
 */
export function getTextBitmap(
  text: string,
  fontSize: number,
  font: string,
  color: string,
): TextBitmap | null {
  const key = fontSize + '\u0000' + color + '\u0000' + text;
  const hit = cache.get(key);
  if (hit) {
    textBitmapStats.hits++;
    return hit;
  }
  textBitmapStats.misses++;

  const m = measureCtx();
  if (!m) return null;
  m.font = font;
  const metrics = m.measureText(text);

  // Prefer true glyph metrics (cover emoji/ascender/descender overshoot);
  // fall back to font-relative estimates on engines that omit them.
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.3;
  const left = metrics.actualBoundingBoxLeft || 0;
  const right = metrics.actualBoundingBoxRight || metrics.width;
  const pad = 2; // antialias bleed guard

  const offsetX = Math.ceil(left) + pad;
  const offsetY = Math.ceil(ascent) + pad;
  const w = offsetX + Math.ceil(right) + pad;
  const h = offsetY + Math.ceil(descent) + pad;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, offsetX, offsetY);

  const bitmap: TextBitmap = { canvas, w, h, offsetX, offsetY };

  if (cache.size >= MAX_ENTRIES) {
    // Evict oldest ~10% in insertion order to bound memory.
    let toDrop = Math.ceil(MAX_ENTRIES * 0.1);
    for (const k of cache.keys()) {
      cache.delete(k);
      if (--toDrop <= 0) break;
    }
  }
  cache.set(key, bitmap);
  textBitmapStats.size = cache.size;
  return bitmap;
}

/** Drop all cached bitmaps (e.g. on teardown or a deliberate cache reset). */
export function clearTextBitmapCache(): void {
  cache.clear();
  textBitmapStats.hits = 0;
  textBitmapStats.misses = 0;
  textBitmapStats.size = 0;
}
