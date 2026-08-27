import { Entity, type IRenderer, type MSDFFont, TextRasterCache } from '@vectojs/core';
import { measureText } from '@vectojs/ui';
import type { FrameProfiler } from '../model/FrameProfiler';
import type { PoolSlot, DanmakuPool } from '@vectojs/danmaku-core';
import type { LoadedAtlas } from './MSDFAtlas';
import { BAKUDAN_THEME, DANMAKU_CHROME } from './cinemaConfig';

// --- CTX-0045: Bilibili-like typography (font family / size / weight) ---
export type FontFamilyId = 'sans' | 'serif' | 'mono';
export type FontSizeId = 'small' | 'normal' | 'large';
export type FontWeightId = 'normal' | 'bold';

export const FONT_FAMILIES: Record<FontFamilyId, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Cascadia Code', monospace",
};

export const FONT_SIZES: Record<FontSizeId, number> = {
  small: 18,
  normal: 24,
  large: 30,
};

export const FONT_WEIGHTS: Record<FontWeightId, number> = {
  normal: 400,
  bold: 700,
};

export const DEFAULT_TYPOGRAPHY: {
  fontFamily: FontFamilyId;
  fontSize: FontSizeId;
  fontWeight: FontWeightId;
} = {
  fontFamily: 'sans',
  fontSize: 'normal',
  fontWeight: 'normal',
};

export function fontStringFor(
  sizePx: number,
  weight: FontWeightId | number,
  family: FontFamilyId | string,
): string {
  const w = typeof weight === 'number' ? weight : (FONT_WEIGHTS[weight as FontWeightId] ?? 400);
  const fam =
    (FONT_FAMILIES as Record<string, string>)[family as string] ?? family ?? FONT_FAMILIES.sans;
  return `${w} ${sizePx}px ${fam}`;
}

export function fontSizePx(choice: FontSizeId): number {
  return FONT_SIZES[choice] ?? FONT_SIZES.normal;
}

export function fontWeightNum(choice: FontWeightId): number {
  return FONT_WEIGHTS[choice] ?? 400;
}

// Augment danmaku-core DanmakuParams so slots carry typography without casts everywhere.
declare module '@vectojs/danmaku-core' {
  interface DanmakuParams {
    fontFamily?: FontFamilyId;
    fontWeight?: FontWeightId;
  }
}

/**
 * Geometry of the action pill drawn over a selected danmaku. Exported because
 * `App` places the accessibility hotspots on it: draw and hit-test must read the
 * same numbers or the buttons end up somewhere the user is not clicking, which
 * is exactly what happened when the hotspots hardcoded their own offsets.
 */
/** Vertical offset of the pill baseline from the danmaku origin, in font sizes. */
export const PILL_BASELINE_FACTOR = 1.4;
/** Horizontal offset of the like count from the pill's left edge. */
export const PILL_COUNT_OFFSET_PX = 40;
/** Horizontal offset of the copy glyph from the pill's left edge. */
export const PILL_COPY_OFFSET_PX = 62;
/** Total pill width, covering the like glyph, the count, and the copy glyph. */
export const PILL_WIDTH_PX = 118;
/** Pill height; the hotspots span it fully. */
export const PILL_HEIGHT_PX = 44;
/**
 * Corner radius of the action-pill backing plate. Derives from the theme so
 * the floating plate and every kit surface share one radius scale (the old
 * hardcoded 12 put the pill on a private tier).
 */
export const PILL_RADIUS_PX = BAKUDAN_THEME.radius;
/**
 * Corner radius of the selection outline. Was USER_BOX_RADIUS_PX (6), which
 * read sharp-cornered next to every rounded surface around it (round-2
 * review); selection now speaks the theme radius while hover/user-sent chips
 * keep the tight tier.
 */
export const SELECTED_RADIUS_PX = BAKUDAN_THEME.radius;
/** Corner radius of the per-danmaku interaction boxes ("chip" tier). */
export const USER_BOX_RADIUS_PX = 6;
/**
 * Action-icon geometry (round 3): both actions are hand-drawn monochrome
 * vector paths instead of color emoji. Each icon's geometric center lands
 * exactly on the pill's optical line (the like count's ink center above the
 * shared baseline), so alignment is deterministic - no font-metric offsets,
 * and no cross-shot identity drift (the r2 review's strongest eyesore).
 */
/** Square icon box side, px. Both glyphs fit inside it. */
export const PILL_ICON_SIZE_PX = 18;
/** Horizontal center of the heart icon, from the pill's left edge. */
export const PILL_LIKE_ICON_CENTER_PX = 28;
/** Horizontal center of the copy icon, from the pill's left edge (its hotspot spans [60,84]). */
export const PILL_COPY_ICON_CENTER_PX = 94;
/** Hover affordance: the hovered icon scales by this factor about its center. */
export const PILL_ICON_HOVER_SCALE = 1.15;
/**
 * Paused-chip geometry ("chip" tier): height, corner radius, horizontal
 * padding. The chip labels a hover-frozen danmaku so the freeze reads as
 * deliberate inspection rather than an anonymous gray veil.
 */
export const PAUSE_CHIP_HEIGHT_PX = 18;
export const PAUSE_CHIP_RADIUS_PX = 6;
export const PAUSE_CHIP_PADDING_PX = 8;
/**
 * Frozen-hovered chips above this count collapse into ONE summary chip at the
 * frozen set's centroid (round 3): ~9 individual chips stacked into an
 * illegible overlapping band under a resting pointer in stress mode.
 */
export const PAUSE_CHIP_AGGREGATE_THRESHOLD = 3;
/** Vertical gap kept between the top-bar safe zone and any paused chip. */
export const PAUSE_CHIP_SAFE_GAP_PX = 4;
/**
 * Chip label font, hoisted to a module constant: a fresh string per chip made
 * every paint pay allocation and font-string parsing again.
 */
export const PAUSE_CHIP_FONT = `600 10px 'Inter', system-ui, sans-serif`;

const pauseChipWidthCache = new Map<string, number>();

/**
 * Plate width for a paused-chip label, memoized per text. The label is
 * language-static, but stress mode keeps hundreds of slots hovered under a
 * stationary pointer (the stream flows through the pointer column), so an
 * uncached measureText here ran once per hovered slot per frame - measured
 * 2026-08-23 at ~103k calls / 3 s on the 5k stress pool, halving fps (#38).
 * The cap is 256 (was 32) because the aggregated summary label varies with
 * the frozen count frame-to-frame; each distinct entry is one short string.
 */
export function pausedChipWidth(text: string): number {
  const cached = pauseChipWidthCache.get(text);
  if (cached !== undefined) return cached;
  if (pauseChipWidthCache.size > 256) pauseChipWidthCache.clear();
  const w = PAUSE_CHIP_PADDING_PX * 2 + measureText(text, PAUSE_CHIP_FONT);
  pauseChipWidthCache.set(text, w);
  return w;
}

/** Digits have no descender; their ink center is ~half a cap-height up. */
const COUNT_FALLBACK_INK_CENTER_PX = 5.5;

/** One hand-drawn path op in unit space; `m` moves, `b` is a cubic segment. */
type IconPathOp =
  | { op: 'm'; pts: readonly [number, number] }
  | { op: 'b'; pts: readonly [number, number, number, number, number, number] };

/**
 * Filled heart in unit space, pre-centered: the ink bounding box is symmetric
 * around (0.5, 0.5), so drawing `(u - 0.5) * size` about an anchor point puts
 * the glyph's optical center exactly on that anchor. Round 3 replaces the
 * '\uD83E\uDD0D'/'\u2764\uFE0F' emoji pair, whose identity and metrics drifted
 * between platforms and shots.
 */
const HEART_PATH: readonly IconPathOp[] = [
  { op: 'm', pts: [0.5, 0.415] },
  { op: 'b', pts: [0.2, 0.195, 0.04, 0.035, 0.04, -0.155] },
  { op: 'b', pts: [0.04, -0.325, 0.17, -0.295, 0.29, -0.415] },
  { op: 'b', pts: [0.38, -0.415, 0.46, -0.355, 0.5, -0.275] },
  { op: 'b', pts: [0.54, -0.355, 0.62, -0.415, 0.71, -0.415] },
  { op: 'b', pts: [0.83, -0.415, 0.96, -0.325, 0.96, -0.155] },
  { op: 'b', pts: [0.96, 0.035, 0.8, 0.195, 0.5, 0.415] },
];

/**
 * The copy glyph's two sheets (back then front), centered like the heart:
 * x/y/w/h in unit space relative to the icon center. Proportions follow the
 * classic two-rounded-squares mark (front sheet lower-left, overlapping the
 * back sheet's diagonal), which replaces the '\uD83C\uDFCB' weightlifter emoji
 * whose arbitrary identity broke the design system.
 */
const COPY_BACK_SHEET = { x: -0.417, y: -0.417, w: 0.583, h: 0.583 };
const COPY_FRONT_SHEET = { x: -0.167, y: -0.167, w: 0.583, h: 0.583 };
const COPY_SHEET_RADIUS_UNIT = 0.09;

/** Scratch 2D context for ink-extent measurement (module singleton). */
let emojiMeasureCtx: CanvasRenderingContext2D | null = null;

/**
 * Distance above the alphabetic baseline of `text`'s ink center when drawn at
 * `font`, or null where TextMetrics ink extents are unavailable.
 */
function glyphInkCenterAboveBaseline(text: string, font: string): number | null {
  if (!emojiMeasureCtx) {
    emojiMeasureCtx = document.createElement('canvas').getContext('2d');
  }
  const ctx = emojiMeasureCtx;
  if (!ctx) return null;
  ctx.font = font;
  const m = ctx.measureText(text);
  if (
    typeof m.actualBoundingBoxAscent !== 'number' ||
    typeof m.actualBoundingBoxDescent !== 'number'
  ) {
    return null;
  }
  return (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
}

/**
 * Minimum hotspot width SelectionHotspots.place() applies per action
 * (mirrors its MIN_TOUCH_TARGET_PX, WCAG 2.5.8); needed here because the
 * backing plate must cover the full clickable span, not just the glyphs.
 * InteractionGeometry.test.ts pins the composed span on both sides.
 */
const COPY_HOTSPOT_MIN_PX = 24;
/** Uniform margin between the pill plate's edge and the hotspot span. */
export const PILL_PLATE_MARGIN_PX = 12;
/**
 * Total pill plate width: the hotspot span (like [0,60] + copy [60,84])
 * plus one margin each side.
 */
export const PILL_PLATE_WIDTH_PX =
  PILL_COPY_OFFSET_PX +
  Math.max(COPY_HOTSPOT_MIN_PX, PILL_WIDTH_PX - PILL_COPY_OFFSET_PX) +
  PILL_PLATE_MARGIN_PX * 2;
/** Which visual state a danmaku's interaction box paints. */
export type UserBoxKind = 'hover' | 'userSent' | 'selected';

/**
 * Pure slot predicates shared by the draw pass and App's hit-testing.
 *
 * App owns hit-testing (this layer returns `false` from `isPointInside`), and a
 * click must land on the danmaku that is visually on top at that point. The
 * paint order below is: plain slots bucketed by ascending integer font size,
 * then the special pass, with the selected slot always painted last. Encoding
 * that order as a single comparable key keeps the two sides from drifting —
 * they drifted once before and every action became unclickable.
 */
export function isSpecialSlot(s: PoolSlot): boolean {
  const eff = s.params.effects;
  // P2-2: reduce over-classification. style-showcase's 73% special came from
  // glow(0.3)+gradient(0.25)+outline(0.35) each forcing the special pass and
  // bypassing the GL glyph batch. Only presets that truly need per-char or
  // multi-pass rendering stay special: rotation (per-char angles), glitch
  // (3-pass chroma), and rainbow (per-char hue). Glow/outline/gradient are
  // single-fill with an extra stroke/gradient and can stay batched.
  return s.params.preset === 'glitch' || s.params.preset === 'rotation' || eff.rainbow;
}

/**
 * Paint z-order as one number: special above all plain, font-size buckets
 * ascending within each group, insertion (slot id) breaking ties. The selected
 * slot paints last and is excluded from hit-testing entirely.
 */
export function paintOrderKey(s: PoolSlot): number {
  return (isSpecialSlot(s) ? 2 ** 32 : 0) + (s.params.fontSize | 0) * 65536 + s.id;
}

/**
 * Minimal structural view of the WebGL point layer the Scene owns (typed
 * `private` in core, but reachable at runtime — this is exactly how core's own
 * `MSDFTextEntity` renders). We only need the MSDF glyph-batch entry points.
 */
interface GLPointRenderer {
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(
    x: number,
    y: number,
    width: number,
    height: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    color?: string,
    alpha?: number,
    rotation?: number,
  ): void;
}

/** A laid-out glyph run cached per (fontSize, text): quads ready to blit. */
interface GlyphRun {
  quads: {
    x: number;
    y: number;
    w: number;
    h: number;
    u0: number;
    v0: number;
    u1: number;
    v1: number;
  }[];
}

const emojiRe = /\p{Extended_Pictographic}/u;

/**
 * Shared per-(fontSize,char) width cache for the rare rainbow/rotation
 * presets, which draw character-by-character and need per-glyph advances.
 * fontSize is an integer (Scheduler floors it), so the key space is bounded
 * (~21 sizes × the small CJK/ASCII working set) and never leaks.
 */
const charWidthCache = new Map<string, number>();
let measureCanvasCtx: CanvasRenderingContext2D | null = null;

/** Cache instrumentation for the HUD (measureText avoided vs. performed). */
export const charWidthStats = { hits: 0, misses: 0 };

function charWidth(
  ch: string,
  fontSize: number,
  weight: FontWeightId | number = 400,
  family: FontFamilyId | string = 'sans',
): number {
  const famKey =
    typeof family === 'string' && (FONT_FAMILIES as Record<string, string>)[family]
      ? family
      : family;
  const wNum = typeof weight === 'number' ? weight : (FONT_WEIGHTS[weight as FontWeightId] ?? 400);
  const key = `${fontSize}|${wNum}|${famKey}|${ch}`;
  const cached = charWidthCache.get(key);
  if (cached !== undefined) {
    charWidthStats.hits++;
    return cached;
  }
  charWidthStats.misses++;
  if (!measureCanvasCtx) {
    const c = document.createElement('canvas');
    measureCanvasCtx = c.getContext('2d');
  }
  if (!measureCanvasCtx) return fontSize * 0.6;
  measureCanvasCtx.font = fontStringFor(fontSize, wNum, famKey as FontFamilyId);
  const w = measureCanvasCtx.measureText(ch).width;
  charWidthCache.set(key, w);
  return w;
}

/**
 * Helper to build a Canvas font string for a slot (falls back to sans/400).
 */
export function slotFont(s: PoolSlot): string {
  const fs = s.params.fontSize | 0;
  const weight = (s.params as { fontWeight?: FontWeightId }).fontWeight ?? 'normal';
  const family = (s.params as { fontFamily?: FontFamilyId }).fontFamily ?? 'sans';
  const wNum = typeof weight === 'number' ? weight : (FONT_WEIGHTS[weight as FontWeightId] ?? 400);
  return fontStringFor(fs, wNum, family as FontFamilyId);
}

/**
 * Whether this slot can use the MSDF GPU path. The atlas is built for the
 * default sans 400 — serif/mono/bold remain Canvas2D (correct, not missing).
 */
export function isGLCompatible(s: PoolSlot): boolean {
  const weight = (s.params as { fontWeight?: FontWeightId | number }).fontWeight ?? 'normal';
  const family = (s.params as { fontFamily?: FontFamilyId }).fontFamily ?? 'sans';
  if (family !== 'sans') return false;
  if ((weight as unknown) === 'bold' || (weight as unknown) === 700) return false;
  return true;
}

interface SlotCache {
  lastText?: string;
  lastFS?: number;
  glRun?: GlyphRun;
  glSafe?: boolean;
  isSpecial?: boolean;
}

/**
 * A single scene node that batch-paints the ENTIRE danmaku stress pool.
 *
 * The old design gave every danmaku its own `Entity` added to the scene, so
 * the engine walked, transformed, culled, and `save()/restore()`-wrapped
 * thousands of nodes per frame — the dominant cost at 5,000 danmaku (~12fps).
 * This layer is one node: the scene walk visits it once, and its `render()`
 * runs a tight immediate-mode loop over `pool.slots`, doing its own frustum
 * culling and font-tier batching. Per-danmaku interaction state lives on the
 * slots (`hovered`/`liked`/`dragging`/`userSent`); the App owns hit-testing.
 */
export class DanmakuLayer extends Entity {
  /** Font-size buckets: index = fontSize, value = list of slots to draw. */
  private _buckets: PoolSlot[][] = [];
  private _slotCaches = new WeakMap<PoolSlot, SlotCache>();

  private _getSlotCache(s: PoolSlot): SlotCache {
    let c = this._slotCaches.get(s);
    if (!c) {
      c = {};
      this._slotCaches.set(s, c);
    }
    return c;
  }

  private _cullMargin(s: PoolSlot): number {
    // P3-2: cull previously used 1.5*fs, underestimating sine(60), rotation(0.4*fs),
    // glitch(3), repulsion(6), outline(2), glow(4), and jelly(0.16*fs).
    const fs = s.params.fontSize;
    let motion = 0;
    switch (s.params.preset) {
      case 'sine':
        motion = Math.abs(s.params.presetParams.amplitude ?? 60);
        break;
      case 'rotation':
        motion = fs * 0.4;
        break;
      case 'glitch':
        motion = 3;
        break;
      case 'repulsion':
        motion = 6;
        break;
      default:
        break;
    }
    let effect = 0;
    if (s.params.effects.outline) effect += 2;
    if (s.params.effects.glow) effect += 4;
    const jelly = s.jellyScaleY !== 1 || s.jellyScaleX !== 1 ? Math.ceil(fs * 0.32 * 0.5) : 0;
    return Math.ceil(motion + effect + jelly);
  }

  // --- WebGL/MSDF text path (set once the atlas loads; null → Canvas2D) ---
  private _font: MSDFFont | null = null;
  private _texture: TexImageSource | null = null;
  private _distanceRange = 0;
  /** Cached laid-out glyph quads per `fontSize\u0000text` (bounded working set). */
  private _runCache = new Map<string, GlyphRun>();
  /** Cached "every glyph is in the atlas & no emoji" per text. */
  private _glSafe = new Map<string, boolean>();

  /**
   * Canvas2D fallback text cache (emoji / out-of-atlas glyphs / no WebGL2).
   * Pre-rasterizes each `(font, color, text)` run once and blits it, instead of
   * re-shaping with `fillText` every frame. The fixed stress library (~177
   * strings × 3 tiers × 8 colors) stays well under the eviction cap, so the
   * steady-state hit rate is ~100%. Provided by `@vectojs/core` since 1.12.0.
   */
  private _rasterCache = new TextRasterCache({ maxEntries: 6000 });
  /** DPR `_rasterCache` was built for; see `rasterCacheDpr`. */
  private _rasterCacheDpr = 1;

  /** Fallback-cache hit/miss/size, surfaced on the HUD. */
  get rasterStats(): { hits: number; misses: number; size: number } {
    return this._rasterCache.stats;
  }

  /**
   * DPR the fallback rasters are keyed to. `TextRasterCache` rasterizes at a
   * fixed dpr (default 1) while keeping blit dimensions in CSS px, so a cache
   * built at the wrong ratio resamples onto the backing store — the same
   * softness as the old maxDPR-1 blur, just for emoji / user-sent text.
   * Keyed to the live `IRenderer.pixelRatio` (core >= 1.29.0), which is what
   * `GlyphRasterAtlas.pixelRatio` established for code atlases.
   */
  get rasterCacheDpr(): number {
    return this._rasterCacheDpr;
  }

  constructor(
    private pool: DanmakuPool,
    private getStage: () => {
      w: number;
      h: number;
      interactive: boolean;
      hoveredAction?: 'like' | 'copy' | null;
      /** Persisted like count for the selected danmaku, rendered on its pill. */
      likeCount?: number;
      /** Localized "Paused" label for the hover-freeze micro-chip. */
      pausedLabel?: string;
      /** Top-bar safe zone: y below which no chip/plate may paint. */
      safeTop?: number;
    },
  ) {
    super();
    this.interactive = false;
    // P3-3: buckets[63] coalesced overflow (different sizes sharing 63). Expand
    // to 128 so all real font sizes (16..36) each have their own bucket and
    // overflow only for truly out-of-range sizes >127.
    for (let i = 0; i < 128; i++) this._buckets.push([]);
  }

  /**
   * Supply the loaded MSDF atlas to switch the plain text pass onto the GPU
   * glyph-batch path. Safe to call after construction (atlas loads async).
   *
   * The atlas is validated before adoption: `MSDFFont.parse` performs no shape
   * checking, so a truncated/partial atlas.json parses into a font whose
   * `data.atlas` / `data.metrics` is missing. Adopting such a font throws here
   * (the `distanceRange` getter dereferences `data.atlas`) — an unhandled
   * rejection in App's load callback — or pushes NaN quads from `_glyphRun`
   * once a non-finite ascender reaches the layout. On rejection this layer
   * keeps whatever font it already had (normally none) and stays on the
   * Canvas2D fallback: degraded rendering, never a crash or NaN geometry.
   */
  setMSDF(atlas: LoadedAtlas): void {
    const data = atlas?.font?.data;
    const distanceRange = data?.atlas?.distanceRange;
    const ascender = data?.metrics?.ascender;
    if (
      !atlas?.texture ||
      !data ||
      !Number.isFinite(distanceRange) ||
      distanceRange <= 0 ||
      !Number.isFinite(ascender)
    ) {
      // One warn, once per bad load attempt: silent degradation here would
      // read as "why is stress fps capped" months later.
      console.warn('[bakudan] MSDF atlas malformed; staying on the Canvas2D fallback', {
        hasTexture: !!atlas?.texture,
        distanceRange,
        ascender,
      });
      return;
    }
    this._font = atlas.font;
    this._texture = atlas.texture;
    this._distanceRange = distanceRange;
    this._glSafe.clear();
    this._runCache.clear();
  }

  /** Is `text` fully representable by the MSDF atlas (no emoji, all glyphs present)? */
  private _isGLSafe(text: string): boolean {
    // Null font (atlas still loading / load failed / rejected by setMSDF), or
    // a font without finite metrics: either would NaN every quad in
    // `_glyphRun`, so everything takes the Canvas2D fallback.
    if (!this._font || !Number.isFinite(this._font.data?.metrics?.ascender)) return false;
    const hit = this._glSafe.get(text);
    if (hit !== undefined) return hit;
    let safe = true;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (emojiRe.test(ch) || !this._font.getGlyph(cp)) {
        safe = false;
        break;
      }
    }
    this._glSafe.set(text, safe);
    return safe;
  }

  /**
   * Lay out (once, cached) a text run's glyph quads in local pixels, with the
   * baseline shifted so the visual position matches the Canvas2D path
   * (baseline at ~0.8×fontSize below the slot's top-left `y`). `MSDFFont.layout`
   * puts the line-0 baseline at `ascender×fontSize`, so we offset by the
   * difference to keep GL and Canvas2D danmaku vertically identical.
   */
  private _glyphRun(text: string, fs: number): GlyphRun {
    const key = fs + '\u0000' + text;
    const hit = this._runCache.get(key);
    if (hit) return hit;
    const font = this._font!;
    const ascender = font.data.metrics.ascender;
    const yOffset = 0.8 * fs - ascender * fs; // align baseline to Canvas2D
    const laid = font.layout(text, fs, { x: 0, y: yOffset });
    const quads = laid.glyphs.map((g) => ({
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      u0: g.u0,
      v0: g.v0,
      u1: g.u1,
      v1: g.v1,
    }));
    const run: GlyphRun = { quads };
    this._runCache.set(key, run);
    return run;
  }

  /** The layer itself is never the pointer target; App does manual hit-tests. */
  isPointInside(): boolean {
    return false;
  }

  /** Fills the whole viewport, so the engine must not frustum-cull it. */
  getBounds(): null {
    return null;
  }

  /** Optional profiler, injected by the app so this hot path can be localised. */
  profiler?: FrameProfiler;
  /**
   * Per-frame draw-path split, reset each render. `layer.draw` dominating the
   * frame is only actionable once we know WHICH path it went down: the GL batch
   * (one addGlyph per glyph, ~1 GPU draw call) or the Canvas2D fallback (one
   * drawImage per danmaku, taken for emoji / out-of-atlas text).
   */
  readonly drawStats = {
    glRuns: 0,
    glGlyphs: 0,
    c2dBlits: 0,
    c2dFillText: 0,
    special: 0,
  };

  render(renderer: IRenderer): void {
    this.drawStats.glRuns = 0;
    this.drawStats.glGlyphs = 0;
    this.drawStats.c2dBlits = 0;
    this.drawStats.c2dFillText = 0;
    this.drawStats.special = 0;

    // Keep fallback rasters at the backing store's resolution. The read is
    // live per frame on purpose: browser zoom and monitor moves change the
    // ratio without recreating the layer, and a stale-keyed cache would blit
    // resampled rasters. A rebuild is rare and cheap (next frame re-rasterizes).
    const dpr = renderer.pixelRatio ?? 1;
    if (dpr !== this._rasterCacheDpr) {
      this._rasterCache = new TextRasterCache({ maxEntries: 6000, dpr });
      this._rasterCacheDpr = dpr;
    }

    this.profiler?.beginPhase('layer.cullBucket');
    const { w: stageW, h: stageH, interactive, pausedLabel, safeTop } = this.getStage();
    const slots = this.pool.slots;
    const buckets = this._buckets;

    // Reset buckets (keep arrays, just zero their length — no per-frame alloc).
    for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;

    // Slots that need their own transform/effect pass (drawn after the plain
    // batched text so their glyphs sit on top and each gets isolated state).
    let special: PoolSlot[] | null = null;
    let selected: PoolSlot | null = null;
    // Frozen-hovered slots from BOTH draw passes; chips repaint once after
    // everything else so the aggregation decision sees the whole frame.
    let frozen: PoolSlot[] | null = null;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.active) continue;
      const fontSize = s.params.fontSize;
      // P3-2: frustum cull previously used 1.5*fs, underestimating sine(60px),
      // glow(4px), outline(2px) and jelly. Use 1.2*fs (actual text height) + outset.
      const outset = this._cullMargin(s);
      if (
        s.x > stageW ||
        s.x + s.width < 0 ||
        s.y > stageH + outset ||
        s.y + fontSize * 1.2 + outset < 0
      ) {
        continue;
      }
      if (s.interactionLocked) {
        selected = s;
        continue;
      }
      const cache = this._getSlotCache(s);
      if (cache.isSpecial === undefined || cache.lastText !== s.params.text) {
        cache.isSpecial = isSpecialSlot(s);
      }
      if (cache.isSpecial) {
        this.drawStats.special++;
        (special ||= []).push(s);
        continue;
      }
      const fs = fontSize | 0;
      (buckets[fs] || buckets[buckets.length - 1]).push(s);
    }
    this.profiler?.endPhase('layer.cullBucket');
    this.profiler?.beginPhase('layer.draw');
    this.profiler?.beginPhase('draw.jsBatch');

    // GL glyph batch layer (stacked WebGL canvas the Scene owns). When present
    // and the atlas is loaded, plain danmaku draw their glyphs through it — the
    // whole frame's glyphs batch into ~1 GPU draw call, which is the only way
    // past the Canvas2D per-glyph draw + overdraw fill-rate wall at 5,000.
    const gl = this._font
      ? (this.scene as (Entity['scene'] & { pointRenderer?: GLPointRenderer }) | null)
      : null;
    const glr = gl?.pointRenderer ?? null;
    if (glr && this._texture) glr.setMSDFTexture(this._texture, this._distanceRange);

    // --- Plain batched pass. GL path: one addGlyph per glyph (no ctx.font /
    //     fillStyle churn). Canvas2D fallback: font-size buckets + bitmap cache. ---
    let curAlpha = -1;
    for (let fs = 0; fs < buckets.length; fs++) {
      const bucket = buckets[fs];
      if (bucket.length === 0) continue;
      for (let j = 0; j < bucket.length; j++) {
        const s = bucket[j];
        const rx = (s.x + 0.5) | 0;
        const ry = (s.y + 0.5) | 0;
        const textY = ry + fs * 0.8;
        // Per-slot font (CTX-0045): weight/family vary per danmaku, so the
        // bucket-level FONT_STRINGS is not sufficient.
        const font = slotFont(s);
        // Interaction chrome (user-sent box / hover-pause cue) stays on
        // Canvas2D, behind glyphs. The hover box is the affordance that tells
        // the user this danmaku is paused under their pointer; without it a
        // freeze reads as a dropped frame.
        if ((s.userSent || (interactive && s.hovered)) && s.width > 0) {
          if (curAlpha !== s.params.opacity) {
            renderer.setGlobalAlpha(s.params.opacity);
            curAlpha = s.params.opacity;
          }
          // Identity outranks inspection: a user-sent danmaku keeps its rose
          // marker even while hovered, so ownership never flickers away under
          // the pointer.
          this._drawUserBox(renderer, rx, ry, s.width, fs, s.userSent ? 'userSent' : 'hover');
          if (!s.userSent) (frozen ||= []).push(s);
        }

        const cache = this._getSlotCache(s);
        if (glr && this._font && (cache.glSafe === undefined || cache.lastText !== s.params.text)) {
          cache.glSafe = this._isGLSafe(s.params.text);
          cache.lastText = s.params.text;
          cache.glRun = undefined;
        }

        // User-sent danmaku keep their highlight box + text together on the 2D
        // canvas (z2) so the box stays behind the glyphs; the GL glyph layer is
        // z1 (below the 2D canvas), which would otherwise put the box on top.
        // They're rare (hand-typed), so the Canvas2D path costs nothing here.
        // CTX-0045: MSDF atlas is sans/400 only — serif/mono/bold remain Canvas2D.
        if (glr && this._font && !s.userSent && cache.glSafe && isGLCompatible(s)) {
          // GPU path: push this run's glyph quads to the batch.
          this.drawStats.glRuns++;
          if (!cache.glRun || cache.lastFS !== fs) {
            cache.glRun = this._glyphRun(s.params.text, fs);
            cache.lastFS = fs;
          }
          const run = cache.glRun!;
          const color = s.params.color;
          const alpha = s.params.opacity;
          const quads = run.quads;
          for (let q = 0; q < quads.length; q++) {
            const g = quads[q];
            glr.addGlyph(rx + g.x, ry + g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, color, alpha);
            this.drawStats.glGlyphs++;
          }
        } else {
          // Canvas2D fallback (emoji / out-of-atlas glyphs, or no WebGL).
          if (curAlpha !== s.params.opacity) {
            renderer.setGlobalAlpha(s.params.opacity);
            curAlpha = s.params.opacity;
          }
          const r = this._rasterCache.get(font, s.params.color, s.params.text);
          if (r) {
            this.drawStats.c2dBlits++;
            renderer.drawImage(r.canvas, rx - r.offsetX, textY - r.offsetY, r.width, r.height);
          } else {
            this.drawStats.c2dFillText++;
            renderer.fillText(s.params.text, rx, textY, font, s.params.color);
          }
        }
      }
    }

    // --- Special pass: glitch / rotation / rainbow / outline / glow ---
    if (special) {
      for (let i = 0; i < special.length; i++) {
        this._renderSpecial(renderer, special[i], stageW, stageH, interactive, false, frozen);
      }
    }

    if (selected) {
      this._renderSpecial(renderer, selected, stageW, stageH, interactive, true, frozen);
    }

    if (curAlpha !== 1) renderer.setGlobalAlpha(1);
    // Paused chips repaint once for the whole frame, above the wall, so the
    // aggregation decision sees every frozen slot from BOTH draw passes.
    this._renderPausedChips(renderer, frozen, stageW, stageH, safeTop ?? 0, pausedLabel);
    // Ends here rather than at the GPU submit: everything above is JS work
    // (glyph-run lookup + addGlyph pushes into the vertex buffer). The actual
    // drawArrays happens later in the renderer's flush/present, so a large
    // jsBatch vs a small one tells us whether 218ns/glyph is our loop or the GPU.
    this.profiler?.endPhase('draw.jsBatch');
    this.profiler?.endPhase('layer.draw');
  }

  private _renderSpecial(
    renderer: IRenderer,
    s: PoolSlot,
    _stageW: number,
    _stageH: number,
    interactive: boolean,
    isSelected = false,
    frozen: PoolSlot[] | null = null,
  ): void {
    const { text, color, fontSize, opacity, effects, preset } = s.params;
    const font = slotFont(s);
    renderer.setGlobalAlpha(opacity);

    const isRotation = preset === 'rotation' && s.charAngles && s.charAngles.length > 0;

    if (isRotation) {
      renderer.save();
      renderer.translate(Math.round(s.x), Math.round(s.y));
      this._renderRotatedChars(renderer, s, font, color, fontSize);
      renderer.restore();
      renderer.setGlobalAlpha(1);
      return;
    }

    const rx = Math.round(s.x);
    const ry = Math.round(s.y);
    const textY = ry + fontSize * 0.8;

    if (isSelected || s.userSent || (interactive && s.hovered)) {
      if (s.width > 0) {
        const kind: UserBoxKind = isSelected ? 'selected' : s.userSent ? 'userSent' : 'hover';
        this._drawUserBox(renderer, rx, ry, s.width, fontSize, kind);
        if (kind === 'hover' && frozen) frozen.push(s);
      }
    }

    if (preset === 'glitch') {
      const t = s.age / 1000;
      const jx = Math.sin(t * 47) * 3;
      const jy = Math.cos(t * 53) * 2;
      renderer.fillText(text, rx + jx - 2, textY + jy, font, 'rgba(255,50,50,0.8)');
      renderer.fillText(text, rx + jx + 2, textY - jy, font, 'rgba(50,50,255,0.8)');
      renderer.fillText(text, rx + jx, textY, font, color);
    } else if (effects.rainbow) {
      let cx = rx;
      const chars = [...text];
      const weight = (s.params as { fontWeight?: FontWeightId }).fontWeight ?? 'normal';
      const family = (s.params as { fontFamily?: FontFamilyId }).fontFamily ?? 'sans';
      for (let i = 0; i < chars.length; i++) {
        const hue = ((s.age / 50 + i * 30) % 360) | 0;
        renderer.fillText(chars[i], cx, textY, font, `hsl(${hue}, 80%, 65%)`);
        cx += charWidth(chars[i], fontSize, weight, family);
      }
    } else {
      if (effects.outline || isSelected) {
        const outlineColor = isSelected ? DANMAKU_CHROME.selectedTextOutline : 'rgba(0,0,0,0.6)';
        renderer.fillText(text, rx + 1, textY, font, outlineColor);
        renderer.fillText(text, rx - 1, textY, font, outlineColor);
        renderer.fillText(text, rx, textY + 1, font, outlineColor);
        renderer.fillText(text, rx, textY - 1, font, outlineColor);
      }
      let paint: string | unknown = color;
      if (effects.gradient) {
        // Vertical two-stop gradient across the glyph band: the danmaku's own
        // color at the top fading to warm gold at the baseline.
        paint = renderer.createLinearGradient(rx, ry, rx, ry + fontSize, [
          { stop: 0, color },
          { stop: 1, color: '#ffd36e' },
        ]);
      }
      renderer.fillText(text, rx, textY, font, paint);
      if (effects.glow) renderer.fillText(text, rx, textY, font, color);
    }
    if (isSelected) {
      this._drawSelectedPill(renderer, s, rx, ry, this.getStage().likeCount ?? (s.liked ? 1 : 0));
      // The backing plate painted over the selection outline's bottom stroke
      // (round-2 QA crops). Re-stroke ABOVE the plate so the rose outline
      // renders complete; paint-only - hotspots never see this.
      renderer.beginPath();
      this._userBoxPath(renderer, rx, ry, s.width, fontSize, SELECTED_RADIUS_PX);
      renderer.stroke(DANMAKU_CHROME.selectedStroke, 1);
    }
    renderer.setGlobalAlpha(1);
  }

  private _renderRotatedChars(
    renderer: IRenderer,
    s: PoolSlot,
    font: string,
    color: string,
    fontSize: number,
  ): void {
    const chars = [...s.params.text];
    const weight = (s.params as { fontWeight?: FontWeightId }).fontWeight ?? 'normal';
    const family = (s.params as { fontFamily?: FontFamilyId }).fontFamily ?? 'sans';
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      renderer.save();
      renderer.translate(cx, fontSize * 0.8);
      renderer.rotate(s.charAngles[i] ?? 0);
      renderer.fillText(chars[i], 0, 0, font, color);
      renderer.restore();
      cx += charWidth(chars[i], fontSize, weight, family);
    }
  }

  /**
   * Per-danmaku interaction box, painted from the shared DANMAKU_CHROME
   * tokens so canvas chrome and kit panels stay one color system. Three
   * states replace the old two-color orange scheme: a quiet slate veil for
   * hover-pause (transient inspection), rose for user-sent ownership, and the
   * strongest rose for selection (emphasis - keyboard focus keeps blue).
   */
  /**
   * Shared interaction-box path. The draw pass AND the post-pill outline
   * re-stroke read this one geometry, so they cannot drift.
   */
  private _userBoxPath(
    renderer: IRenderer,
    rx: number,
    ry: number,
    width: number,
    fontSize: number,
    radius: number,
  ): void {
    const pad = 4;
    renderer.roundRect(rx - pad, ry - pad, width + pad * 2, fontSize * 1.2 + pad * 2, radius);
  }

  private _drawUserBox(
    renderer: IRenderer,
    rx: number,
    ry: number,
    width: number,
    fontSize: number,
    kind: UserBoxKind = 'hover',
  ): void {
    renderer.beginPath();
    this._userBoxPath(
      renderer,
      rx,
      ry,
      width,
      fontSize,
      kind === 'selected' ? SELECTED_RADIUS_PX : USER_BOX_RADIUS_PX,
    );
    switch (kind) {
      case 'selected':
        renderer.fill(DANMAKU_CHROME.selectedFill);
        renderer.stroke(DANMAKU_CHROME.selectedStroke, 1);
        break;
      case 'userSent':
        renderer.fill(DANMAKU_CHROME.userSentFill);
        renderer.stroke(DANMAKU_CHROME.userSentStroke, 1);
        break;
      case 'hover':
        renderer.fill(DANMAKU_CHROME.hoverFill);
        renderer.stroke(DANMAKU_CHROME.hoverStroke, 1);
        break;
    }
  }

  private _drawSelectedPill(
    renderer: IRenderer,
    s: PoolSlot,
    rx: number,
    ry: number,
    likeCount: number,
  ): void {
    const stage = this.getStage();
    const stageW = stage.w;
    const safeTop = stage.safeTop ?? 0;
    // Centered under the danmaku text, clamped to stageW and safeTop — must
    // match App's hotspot placement or the plate and the click targets drift
    // (P1-1: left 142 vs centered 118).
    const unclampedLeft = rx + s.width / 2 - PILL_WIDTH_PX / 2;
    const pillLeft = Math.round(
      Math.min(
        Math.max(unclampedLeft, PILL_PLATE_MARGIN_PX),
        Math.max(PILL_PLATE_MARGIN_PX, stageW - PILL_PLATE_WIDTH_PX - PILL_PLATE_MARGIN_PX),
      ),
    );
    const pillYRaw = ry + s.params.fontSize * PILL_BASELINE_FACTOR;
    const pillTopRaw = pillYRaw - PILL_HEIGHT_PX / 2;
    const pillTop = Math.max(pillTopRaw, safeTop + PAUSE_CHIP_SAFE_GAP_PX);
    const pillY = pillTop + PILL_HEIGHT_PX / 2;
    const plateLeft = pillLeft - PILL_PLATE_MARGIN_PX;
    renderer.beginPath();
    renderer.roundRect(plateLeft, pillTop, PILL_PLATE_WIDTH_PX, PILL_HEIGHT_PX, PILL_RADIUS_PX);
    renderer.fill(DANMAKU_CHROME.pillFill);
    renderer.stroke(DANMAKU_CHROME.pillStroke, 1);
    const hovered = this.getStage().hoveredAction ?? null;
    // The count is the pill's primary readout: promoted to semibold at the
    // next size up, painted in the theme's own text color (round-2 review).
    const countFont = `600 15px 'Inter', system-ui, sans-serif`;
    // One optical line: the count text's INK CENTER defines it, and every icon
    // centers its exact vector geometry on that line. Unlike the old emoji
    // TextMetrics offsets this needs no clamping and no per-font fallbacks.
    const countText = `${likeCount}`;
    const referenceCenter =
      glyphInkCenterAboveBaseline(countText, countFont) ?? COUNT_FALLBACK_INK_CENTER_PX;
    const centerY = pillY - referenceCenter;
    renderer.fillText(
      countText,
      pillLeft + PILL_COUNT_OFFSET_PX,
      pillY,
      countFont,
      DANMAKU_CHROME.pillCount,
    );

    // Monochrome vector actions (round 3). Tint speaks the chrome language -
    // theme text normally, accent rose once liked (rose = emphasis/ownership).
    // Hover scales the hovered icon about its center: the same grow affordance
    // the color-fixed emoji needed, now with exact bounds and no font reads.
    this._drawHeartIcon(
      renderer,
      pillLeft + PILL_LIKE_ICON_CENTER_PX,
      centerY,
      PILL_ICON_SIZE_PX * (hovered === 'like' ? PILL_ICON_HOVER_SCALE : 1),
      s.liked ? DANMAKU_CHROME.pillIconActive : DANMAKU_CHROME.pillIcon,
    );
    this._drawCopyIcon(
      renderer,
      pillLeft + PILL_COPY_ICON_CENTER_PX,
      centerY,
      PILL_ICON_SIZE_PX * (hovered === 'copy' ? PILL_ICON_HOVER_SCALE : 1),
      DANMAKU_CHROME.pillIcon,
    );
  }

  /** Filled monochrome heart centered on (cx, cy), side `size`. */
  private _drawHeartIcon(
    renderer: IRenderer,
    cx: number,
    cy: number,
    size: number,
    tint: string,
  ): void {
    renderer.beginPath();
    // HEART_PATH is pre-centered unit space (ink bbox symmetric around 0), so
    // the anchor IS the optical center - no further 0.5 offset.
    for (const seg of HEART_PATH) {
      if (seg.op === 'm') {
        renderer.moveTo(cx + seg.pts[0] * size, cy + seg.pts[1] * size);
      } else {
        renderer.bezierCurveTo(
          cx + seg.pts[0] * size,
          cy + seg.pts[1] * size,
          cx + seg.pts[2] * size,
          cy + seg.pts[3] * size,
          cx + seg.pts[4] * size,
          cy + seg.pts[5] * size,
        );
      }
    }
    renderer.closePath();
    renderer.fill(tint);
  }

  /** Two-sheet copy glyph (stroked back sheet behind a filled front sheet). */
  private _drawCopyIcon(
    renderer: IRenderer,
    cx: number,
    cy: number,
    size: number,
    tint: string,
  ): void {
    const r = Math.max(1, COPY_SHEET_RADIUS_UNIT * size);
    const sheet = (sh: typeof COPY_BACK_SHEET): void => {
      renderer.roundRect(cx + sh.x * size, cy + sh.y * size, sh.w * size, sh.h * size, r);
    };
    // Back sheet first (stroke only), then the front sheet filled with the
    // plate base so the overlap reads as occlusion, not intersection.
    renderer.beginPath();
    sheet(COPY_BACK_SHEET);
    renderer.stroke(tint, 1.5);
    renderer.beginPath();
    sheet(COPY_FRONT_SHEET);
    renderer.fill(DANMAKU_CHROME.pillFill);
    renderer.stroke(tint, 1.5);
  }

  /**
   * Micro-label pinned to a hover-frozen danmaku's top-right corner: explains
   * WHY that danmaku is standing still instead of leaving an anonymous gray
   * veil whose role is unreadable in a still or at stress scale (round-2
   * review item 5). Drawn only for transient hover inspection — selection has
   * its action pill and user-sent has its rose marker. In stress mode a
   * stationary pointer leaves hundreds of slots hovered at once, so the chip
   * width is memoized (pausedChipWidth); the label itself is language-static.
   */
  private _drawPausedChip(
    renderer: IRenderer,
    rx: number,
    ry: number,
    width: number,
    label?: string,
    safeTop = 0,
  ): void {
    if (!label) return;
    const text = `⏸ ${label}`;
    const chipW = pausedChipWidth(text);
    const chipX = rx + width - chipW + PAUSE_CHIP_PADDING_PX;
    // Never inside the top-bar safe zone: the now-opaque bar fully hid a
    // top-row chip in the round-2 QA captures.
    const chipY = Math.max(ry - PAUSE_CHIP_HEIGHT_PX / 2 - 2, safeTop + PAUSE_CHIP_SAFE_GAP_PX);
    this._paintPausedChip(renderer, chipX, chipY, chipW, text);
  }

  /** One chip plate + label. All chip painting funnels through here. */
  private _paintPausedChip(
    renderer: IRenderer,
    chipX: number,
    chipY: number,
    chipW: number,
    text: string,
  ): void {
    renderer.beginPath();
    renderer.roundRect(chipX, chipY, chipW, PAUSE_CHIP_HEIGHT_PX, PAUSE_CHIP_RADIUS_PX);
    renderer.fill(DANMAKU_CHROME.pillFill);
    renderer.stroke(DANMAKU_CHROME.pillStroke, 1);
    renderer.fillText(
      text,
      chipX + PAUSE_CHIP_PADDING_PX,
      chipY + PAUSE_CHIP_HEIGHT_PX / 2 + 3,
      PAUSE_CHIP_FONT,
      BAKUDAN_THEME.text,
    );
  }

  /**
   * Post-pass chip paint (round 3 anti-mush). At or below
   * PAUSE_CHIP_AGGREGATE_THRESHOLD every frozen danmaku wears its own chip;
   * past it the per-slot labels stacked into an illegible band, so they
   * collapse into ONE localized summary chip ("⏸ N <label>") anchored at the
   * frozen set's centroid, clamped fully inside the stage and below safeTop.
   * Drawing last also lifts the labels above the wall instead of behind it.
   */
  private _renderPausedChips(
    renderer: IRenderer,
    frozen: PoolSlot[] | null,
    stageW: number,
    stageH: number,
    safeTop: number,
    label?: string,
  ): void {
    if (!label || !frozen || frozen.length === 0) return;
    const n = frozen.length;
    if (n > PAUSE_CHIP_AGGREGATE_THRESHOLD) {
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < n; i++) {
        const f = frozen[i]!;
        sumX += f.x + f.width / 2;
        sumY += f.y + (f.params.fontSize | 0) * 0.5;
      }
      const text = `⏸ ${n} ${label}`;
      const chipW = pausedChipWidth(text);
      const x = Math.min(Math.max(4, sumX / n - chipW / 2), Math.max(4, stageW - chipW - 4));
      const yFloor = safeTop + PAUSE_CHIP_SAFE_GAP_PX;
      const y = Math.min(
        Math.max(yFloor, sumY / n - PAUSE_CHIP_HEIGHT_PX / 2),
        Math.max(yFloor, stageH - PAUSE_CHIP_HEIGHT_PX - 4),
      );
      this._paintPausedChip(renderer, x, y, chipW, text);
      return;
    }
    for (let i = 0; i < n; i++) {
      const f = frozen[i]!;
      this._drawPausedChip(renderer, Math.round(f.x), Math.round(f.y), f.width, label, safeTop);
    }
  }
}
