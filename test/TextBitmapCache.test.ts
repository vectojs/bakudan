import { test, expect, beforeEach } from 'bun:test';
import { getTextBitmap, clearTextBitmapCache, textBitmapStats } from '../src/view/TextBitmapCache';

/**
 * happy-dom does not implement a real `CanvasRenderingContext2D`
 * (`getContext('2d')` is `null`), so these tests pin the cache's *contract*
 * rather than pixel output: it must degrade gracefully to `null` in a
 * headless/non-DOM context (so `DanmakuLayer` falls back to `fillText`), and
 * its instrumentation counters must behave predictably.
 */
beforeEach(() => {
  clearTextBitmapCache();
});

test('returns null (no throw) when no 2D context is available', () => {
  const font = '400 24px system-ui, sans-serif';
  expect(getTextBitmap('第三', 24, font, '#38bdf8')).toBeNull();
});

test('counts a miss on first request for a run', () => {
  const font = '400 24px system-ui, sans-serif';
  getTextBitmap('hello', 24, font, '#fff');
  expect(textBitmapStats.misses).toBe(1);
  expect(textBitmapStats.hits).toBe(0);
});

test('clearTextBitmapCache resets instrumentation to zero', () => {
  const font = '400 18px system-ui, sans-serif';
  getTextBitmap('a', 18, font, '#fff');
  getTextBitmap('b', 18, font, '#fff');
  clearTextBitmapCache();
  expect(textBitmapStats.hits).toBe(0);
  expect(textBitmapStats.misses).toBe(0);
  expect(textBitmapStats.size).toBe(0);
});
