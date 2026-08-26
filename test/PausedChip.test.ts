import { describe, expect, test } from 'bun:test';
import { measureText } from '@vectojs/ui';
import { PAUSE_CHIP_PADDING_PX, pausedChipWidth } from '../src/view/DanmakuLayer';

/**
 * The paused micro-chip's plate width is memoized per label text: stress mode
 * keeps hundreds of slots hovered under a stationary pointer, so an uncached
 * measureText ran once per hovered slot per frame and halved stress fps
 * (issue #38). These tests encode the contract the fix must preserve.
 */
describe('pausedChipWidth', () => {
  const label = '⏸ Paused';

  test('matches the live plate-width computation', () => {
    expect(pausedChipWidth(label)).toBe(
      PAUSE_CHIP_PADDING_PX * 2 + measureText(label, `600 10px 'Inter', system-ui, sans-serif`),
    );
  });

  test('is stable across repeated calls (memo hit)', () => {
    expect(pausedChipWidth(label)).toBe(pausedChipWidth(label));
  });

  test('computes distinct labels independently', () => {
    const ja = '⏸ 一時停止';
    expect(pausedChipWidth(ja)).toBe(
      PAUSE_CHIP_PADDING_PX * 2 + measureText(ja, `600 10px 'Inter', system-ui, sans-serif`),
    );
    expect(pausedChipWidth(ja)).not.toBe(pausedChipWidth(label));
  });
});
