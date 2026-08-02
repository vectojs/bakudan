import { describe, expect, it } from 'bun:test';
import { DEFAULT_DANMAKU_KIT_THEME } from '@vectojs/danmaku-kit/ui';
import { BAKUDAN_THEME } from '../src/view/cinemaConfig';

/**
 * These tests recompute WCAG contrast from the theme's own values rather than
 * asserting the hex strings. A future palette change is then free to move any
 * color and only fails if it actually breaks a contrast floor -- which is the
 * property worth protecting, not the specific rose.
 */

type Rgb = [number, number, number];

/** Parses `#rrggbb` or `rgba(r, g, b, a)` into a premultiplied-over-black Rgb. */
function parse(color: string, under: Rgb = [0, 0, 0]): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(color);
  if (!rgba) throw new Error(`unsupported color: ${color}`);
  const parts = rgba[1].split(',').map((p) => Number.parseFloat(p.trim()));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  return [a * r + (1 - a) * under[0], a * g + (1 - a) * under[1], a * b + (1 - a) * under[2]];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('BAKUDAN_THEME focus and menu contrast', () => {
  const stage = parse(BAKUDAN_THEME.surface);
  const menu = parse(BAKUDAN_THEME.menuSurface);
  const selected = parse(BAKUDAN_THEME.menuSelected, menu);
  const highlight = parse(BAKUDAN_THEME.menuHighlight, menu);
  const ring = parse(BAKUDAN_THEME.focusRing);
  const text = parse(BAKUDAN_THEME.text);

  it('defines every field the kit theme requires', () => {
    for (const key of Object.keys(DEFAULT_DANMAKU_KIT_THEME)) {
      expect(BAKUDAN_THEME).toHaveProperty(key);
    }
  });

  it('states all four values explicitly instead of spreading the kit default', () => {
    // BAKUDAN_THEME is a frozen object literal, so a missing field is a type
    // error rather than a silent inherited default. Guard that it stays that
    // way: every field must be its own own-property.
    for (const key of ['focusRing', 'menuSurface', 'menuSelected', 'menuHighlight']) {
      expect(Object.hasOwn(BAKUDAN_THEME, key)).toBe(true);
    }
    // menuSurface is deliberately more opaque than the kit default, since the
    // deck floats over a 20k-danmaku stream rather than a quiet page.
    expect(BAKUDAN_THEME.menuSurface).not.toBe(DEFAULT_DANMAKU_KIT_THEME.menuSurface);
  });

  it('meets the 3:1 non-text floor for the focus ring on every surface it lands on', () => {
    // WCAG 2.2 SC 1.4.11. The ring is drawn on the stage, on the near-opaque
    // menu, and on a highlighted option row -- option rows are themselves
    // focusable (role="option"), so the last one is reachable.
    expect(contrast(ring, stage)).toBeGreaterThanOrEqual(3);
    expect(contrast(ring, menu)).toBeGreaterThanOrEqual(3);
    expect(contrast(ring, highlight)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the focus ring visually distinct from the accent', () => {
    // Focus must not read as ordinary emphasis, so the ring is the blue signal
    // rather than the rose accent.
    expect(BAKUDAN_THEME.focusRing).not.toBe(BAKUDAN_THEME.accent);
    expect(BAKUDAN_THEME.focusRing).toBe(BAKUDAN_THEME.signal);
  });

  it('keeps menu label text at AA on every row state', () => {
    for (const row of [menu, selected, highlight]) {
      expect(contrast(text, row)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('separates the selected row from the keyboard-highlighted row', () => {
    // Both are rose; only alpha distinguishes them. Equal alphas would make
    // arrow-key navigation invisible on the already-selected option.
    expect(contrast(highlight, menu)).toBeGreaterThan(contrast(selected, menu));
  });

  it('keeps the open menu opaque enough to sit over the danmaku wall', () => {
    const alpha = /rgba?\([^)]*,\s*([0-9.]+)\s*\)/.exec(BAKUDAN_THEME.menuSurface);
    expect(alpha).not.toBeNull();
    expect(Number.parseFloat(alpha![1])).toBeGreaterThanOrEqual(0.95);
  });
});
