import { describe, expect, it } from 'bun:test';
import { BAKUDAN_THEME, DANMAKU_CHROME, cinemaLabelsFor } from '../src/view/cinemaConfig';
import type { Language } from '../src/model/i18n';
import {
  PILL_PLATE_WIDTH_PX,
  PILL_PLATE_MARGIN_PX,
  PILL_COPY_OFFSET_PX,
  PILL_WIDTH_PX,
  PILL_RADIUS_PX,
  SELECTED_RADIUS_PX,
  USER_BOX_RADIUS_PX,
} from '../src/view/DanmakuLayer';

/**
 * These tests pin the round-1 design decisions, not specific pixel values:
 *
 * 1. Canvas interaction chrome derives from the SAME accent family as
 *    BAKUDAN_THEME (rose = emphasis/ownership). The old chrome used an
 *    off-palette peach (#ff7e5f) and painted selection blue like keyboard
 *    focus - both regressions must fail here.
 * 2. Hover-pause stays a NEUTRAL veil: transient inspection must not borrow
 *    the brand accent.
 * 3. Muted text clears WCAG AA against every surface it sits on.
 * 4. Every supported language gets real label sets (zh-TW was served the
 *    simplified set; ja/ko fell back to English).
 */

type Rgb = [number, number, number];

function parseRgba(color: string): { rgb: Rgb; a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(color);
  if (!rgba) throw new Error(`unsupported color: ${color}`);
  const parts = rgba[1].split(',').map((p) => Number.parseFloat(p.trim()));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  return { rgb: [r, g, b], a };
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

/** Composites `fg` over `bg` (both opaque Rgb) with alpha `a`. */
function over(fg: Rgb, a: number, bg: Rgb): Rgb {
  return [a * fg[0] + (1 - a) * bg[0], a * fg[1] + (1 - a) * bg[1], a * fg[2] + (1 - a) * bg[2]];
}

describe('canvas chrome speaks the theme accent language', () => {
  const accent = parseRgba(BAKUDAN_THEME.accent);

  // Rose #f43f5e == rgb(244, 63, 94); equality of all three channels is what
  // "same family" means concretely. A hue-only match would be too weak to
  // catch drift; exact channels catch it.
  it('user-sent marker uses the theme accent channels', () => {
    for (const key of ['userSentFill', 'userSentStroke'] as const) {
      const { rgb } = parseRgba(DANMAKU_CHROME[key]);
      expect(rgb).toEqual(accent.rgb);
    }
  });

  it('selection emphasis also uses the theme accent channels', () => {
    for (const key of ['selectedFill', 'selectedStroke'] as const) {
      const { rgb } = parseRgba(DANMAKU_CHROME[key]);
      expect(rgb).toEqual(accent.rgb);
    }
  });

  it('selection stroke reads louder than its fill (alpha-only separation)', () => {
    const stroke = parseRgba(DANMAKU_CHROME.selectedStroke).a;
    const fill = parseRgba(DANMAKU_CHROME.selectedFill).a;
    expect(stroke).toBeGreaterThan(fill);
  });

  it('selection stays clearly distinct from keyboard focus (blue signal)', () => {
    const signal = parseRgba(BAKUDAN_THEME.signal).rgb;
    const selectedStroke = parseRgba(DANMAKU_CHROME.selectedStroke).rgb;
    // Different channels on at least two components: not a blue in disguise.
    const differing = selectedStroke.filter((c, i) => Math.abs(c - signal[i]) > 40).length;
    expect(differing).toBeGreaterThanOrEqual(2);
  });

  it('hover-pause veil is neutral slate, not the accent', () => {
    for (const key of ['hoverFill', 'hoverStroke'] as const) {
      const { rgb } = parseRgba(DANMAKU_CHROME[key]);
      expect(rgb).not.toEqual(accent.rgb);
      // Neutral-ish: channels within 60 of each other (slate family).
      const spread = Math.max(...rgb) - Math.min(...rgb);
      expect(spread).toBeLessThanOrEqual(60);
    }
  });

  it('the selection box clears the 3:1 non-text floor against its own fill', () => {
    // The stroke is drawn ON the fill it outlines, so that pair is fully
    // determined by our tokens even though video frames behind are not.
    const stroke = over(
      parseRgba(DANMAKU_CHROME.selectedStroke).rgb,
      parseRgba(DANMAKU_CHROME.selectedStroke).a,
      [20, 20, 20],
    );
    const fill = over(
      parseRgba(DANMAKU_CHROME.selectedFill).rgb,
      parseRgba(DANMAKU_CHROME.selectedFill).a,
      [20, 20, 20],
    );
    expect(contrast(stroke, fill)).toBeGreaterThanOrEqual(3);
  });
});

describe('muted text legibility', () => {
  function opaqueOver(color: string, under: string): Rgb {
    const bg = parseRgba(under);
    const fg = parseRgba(color);
    return over(fg.rgb, bg.a, [7, 9, 13]);
  }

  it('textMuted clears AA (4.5:1) on surface and surfaceRaised', () => {
    for (const surface of [BAKUDAN_THEME.surface, BAKUDAN_THEME.surfaceRaised]) {
      const muted = parseRgba(BAKUDAN_THEME.textMuted);
      const bg = opaqueOver(surface, surface);
      expect(contrast(muted.rgb, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('textMuted joins the slate ramp used by text and pill counts', () => {
    // #94a3b8 family check: blue channel dominant, cool gray, not warm/muddy.
    const { rgb } = parseRgba(BAKUDAN_THEME.textMuted);
    expect(rgb[2]).toBeGreaterThan(rgb[0]);
    expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThanOrEqual(40);
  });
});

describe('pill plate covers the clickable span', () => {
  it('plate width >= hotspot span plus the configured margin on both sides', () => {
    const copyWidth = Math.max(24, PILL_WIDTH_PX - PILL_COPY_OFFSET_PX);
    const spanEnd = PILL_COPY_OFFSET_PX + copyWidth;
    expect(PILL_PLATE_WIDTH_PX).toBeGreaterThanOrEqual(spanEnd + PILL_PLATE_MARGIN_PX * 2);
  });

  it('hotspots stay independent of the visual margin (no geometry drift)', () => {
    // The margin pads only the painted plate; the placed hotspot split is a
    // function of the glyph offsets alone. Pin that independence: changing
    // padding must never move like/copy click targets.
    expect(PILL_COPY_OFFSET_PX).toBe(60);
    expect(PILL_WIDTH_PX).toBe(80);
  });
});

describe('round-2 chrome coherence', () => {
  const roseAccent = parseRgba(BAKUDAN_THEME.accent).rgb;

  it('pill plate and selection outline share the theme radius', () => {
    expect(PILL_RADIUS_PX).toBe(BAKUDAN_THEME.radius);
    expect(SELECTED_RADIUS_PX).toBe(BAKUDAN_THEME.radius);
    // Tight chips stay a distinct tier below the plates.
    expect(USER_BOX_RADIUS_PX).toBeLessThan(PILL_RADIUS_PX);
  });

  it('like count is promoted to the theme text color', () => {
    expect(parseRgba(DANMAKU_CHROME.pillCount).rgb).toEqual(parseRgba(BAKUDAN_THEME.text).rgb);
  });

  it('status bar surface is fully opaque (bleed-through killed)', () => {
    expect(parseRgba(BAKUDAN_THEME.surface).a).toBe(1);
  });

  it('surfaceRaised sits visibly above surface (secondary control affordance)', () => {
    // Composite both over the stage black at their real alphas and compare:
    // the old raised value scored ~1.10x, the lift must hold >= 1.2x.
    const stage: Rgb = [7, 9, 13];
    const raised = over(
      parseRgba(BAKUDAN_THEME.surfaceRaised).rgb,
      parseRgba(BAKUDAN_THEME.surfaceRaised).a,
      stage,
    );
    const base = over(
      parseRgba(BAKUDAN_THEME.surface).rgb,
      parseRgba(BAKUDAN_THEME.surface).a,
      stage,
    );
    expect(contrast(raised, base)).toBeGreaterThanOrEqual(1.2);
  });

  it('state pills speak one accent language (DEC-0011)', () => {
    // Video/Throughput pills are neutral slate now: cool-gray family, not the
    // brand accent, not a saturated semantic hue.
    for (const key of ['success', 'warning'] as const) {
      const { rgb } = parseRgba(BAKUDAN_THEME[key]);
      const spread = Math.max(...rgb) - Math.min(...rgb);
      expect(spread).toBeLessThanOrEqual(40);
      expect(rgb).not.toEqual(roseAccent);
    }
    // Loading keeps the blue signal/focus language; error keeps a saturated
    // rose so an error still shouts.
    expect(BAKUDAN_THEME.signal).toBe(BAKUDAN_THEME.focusRing);
    const danger = parseRgba(BAKUDAN_THEME.danger);
    const dangerSpread = Math.max(...danger.rgb) - Math.min(...danger.rgb);
    expect(dangerSpread).toBeGreaterThan(60);
  });
});

describe('every supported language has real labels', () => {
  const LANGUAGES: Language[] = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'];

  it('returns a complete, structurally valid label set per language', () => {
    for (const lang of LANGUAGES) {
      const labels = cinemaLabelsFor(lang);
      expect(labels.kit.product.length).toBeGreaterThan(0);
      expect(labels.kit.command.inputPlaceholder.length).toBeGreaterThan(0);
      expect(labels.panels.videos.panel.length).toBeGreaterThan(0);
      expect(labels.panels.throughput.panel.length).toBeGreaterThan(0);
      expect(labels.panels.interactions.panel.length).toBeGreaterThan(0);
      expect(labels.panels.devtools.panel.length).toBeGreaterThan(0);
      expect(
        labels.panels.videos.formatLoadState({
          status: 'ready',
          sourceId: 'x',
        }),
      ).toContain('x');
    }
  });

  it('no locale silently falls back to English anymore', () => {
    const en = cinemaLabelsFor('en');
    for (const lang of ['zh-CN', 'zh-TW', 'ja', 'ko'] as Language[]) {
      expect(cinemaLabelsFor(lang).kit.lab.title).not.toBe(en.kit.lab.title);
    }
  });

  it('zh-TW differs from zh-CN (Traditional script, not the simplified set)', () => {
    const tw = cinemaLabelsFor('zh-TW');
    const cn = cinemaLabelsFor('zh-CN');
    const differing = [
      tw.panels.videos.metadata,
      tw.panels.devtools.title,
      tw.kit.status.video,
      tw.panels.interactions.renderClasses,
    ].filter(
      (v, i) =>
        v !==
        [
          cn.panels.videos.metadata,
          cn.panels.devtools.title,
          cn.kit.status.video,
          cn.panels.interactions.renderClasses,
        ][i],
    ).length;
    expect(differing).toBeGreaterThanOrEqual(2);
  });
});
