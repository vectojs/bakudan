import { Entity, type IRenderer, type MSDFFont, TextRasterCache } from '@vectojs/core';
import type { FrameProfiler } from '../model/FrameProfiler';
import type { PoolSlot, DanmakuPool } from '@vectojs/danmaku-core';
import type { LoadedAtlas } from './MSDFAtlas';
import { DANMAKU_CHROME } from './cinemaConfig';

/**
 * Geometry of the action pill drawn over a selected danmaku. Exported because
 * `App` places the accessibility hotspots on it: draw and hit-test must read the
 * same numbers or the buttons end up somewhere the user is not clicking, which
 * is exactly what happened when the hotspots hardcoded their own offsets.
 */
/** Vertical offset of the pill baseline from the danmaku origin, in font sizes. */
export const PILL_BASELINE_FACTOR = 1.4;
/** Horizontal offset of the like count from the pill's left edge. */
export const PILL_COUNT_OFFSET_PX = 20;
/** Horizontal offset of the copy glyph from the pill's left edge. */
export const PILL_COPY_OFFSET_PX = 60;
/** Total pill width, covering the like glyph, the count, and the copy glyph. */
export const PILL_WIDTH_PX = 80;
/** Pill height; the hotspots span it fully. */
export const PILL_HEIGHT_PX = 44;
/** Corner radius of the action-pill backing plate ("control" tier). */
export const PILL_RADIUS_PX = 12;
/** Corner radius of the per-danmaku interaction boxes ("chip" tier). */
export const USER_BOX_RADIUS_PX = 6;
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
  return (
    s.params.preset === 'glitch' ||
    s.params.preset === 'rotation' ||
    eff.rainbow ||
    eff.outline ||
    eff.glow ||
    eff.gradient
  );
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

function charWidth(ch: string, fontSize: number): number {
  const key = fontSize + ch;
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
  measureCanvasCtx.font = `400 ${fontSize}px system-ui, sans-serif`;
  const w = measureCanvasCtx.measureText(ch).width;
  charWidthCache.set(key, w);
  return w;
}

export type ActionKind = 'like' | 'copy';

const FONT_STRINGS = Array.from(
  { length: 64 },
  (_, fs) => `400 ${fs}px system-ui, -apple-system, sans-serif`,
);

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
    },
  ) {
    super();
    this.interactive = false;
    // Pre-size buckets for integer font sizes 0..63 (Scheduler emits 16..36).
    for (let i = 0; i < 64; i++) this._buckets.push([]);
  }

  /**
   * Supply the loaded MSDF atlas to switch the plain text pass onto the GPU
   * glyph-batch path. Safe to call after construction (atlas loads async).
   */
  setMSDF(atlas: LoadedAtlas): void {
    this._font = atlas.font;
    this._texture = atlas.texture;
    this._distanceRange = atlas.font.distanceRange;
    this._glSafe.clear();
    this._runCache.clear();
  }

  /** Is `text` fully representable by the MSDF atlas (no emoji, all glyphs present)? */
  private _isGLSafe(text: string): boolean {
    if (!this._font) return false;
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
    const { w: stageW, h: stageH, interactive } = this.getStage();
    const slots = this.pool.slots;
    const buckets = this._buckets;

    // Reset buckets (keep arrays, just zero their length — no per-frame alloc).
    for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;

    // Slots that need their own transform/effect pass (drawn after the plain
    // batched text so their glyphs sit on top and each gets isolated state).
    let special: PoolSlot[] | null = null;
    let selected: PoolSlot | null = null;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.active) continue;
      const fontSize = s.params.fontSize;
      // Inline frustum cull — skip anything fully off-screen.
      if (s.x > stageW || s.x + s.width < 0 || s.y > stageH || s.y + fontSize * 1.5 < 0) {
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
      const font = FONT_STRINGS[fs] || FONT_STRINGS[63];
      for (let j = 0; j < bucket.length; j++) {
        const s = bucket[j];
        const rx = (s.x + 0.5) | 0;
        const ry = (s.y + 0.5) | 0;
        const textY = ry + fs * 0.8;
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
        if (glr && this._font && !s.userSent && cache.glSafe) {
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
        this._renderSpecial(renderer, special[i], stageW, stageH, interactive);
      }
    }

    if (selected) {
      this._renderSpecial(renderer, selected, stageW, stageH, interactive, true);
    }

    if (curAlpha !== 1) renderer.setGlobalAlpha(1);
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
  ): void {
    const { text, color, fontSize, opacity, effects, preset } = s.params;
    const font = `400 ${fontSize}px system-ui, -apple-system, sans-serif`;
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
        this._drawUserBox(
          renderer,
          rx,
          ry,
          s.width,
          fontSize,
          isSelected ? 'selected' : s.userSent ? 'userSent' : 'hover',
        );
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
      for (let i = 0; i < chars.length; i++) {
        const hue = ((s.age / 50 + i * 30) % 360) | 0;
        renderer.fillText(chars[i], cx, textY, font, `hsl(${hue}, 80%, 65%)`);
        cx += charWidth(chars[i], fontSize);
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
    if (isSelected)
      this._drawSelectedPill(renderer, s, rx, ry, this.getStage().likeCount ?? (s.liked ? 1 : 0));
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
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      renderer.save();
      renderer.translate(cx, fontSize * 0.8);
      renderer.rotate(s.charAngles[i] ?? 0);
      renderer.fillText(chars[i], 0, 0, font, color);
      renderer.restore();
      cx += charWidth(chars[i], fontSize);
    }
  }

  /**
   * Per-danmaku interaction box, painted from the shared DANMAKU_CHROME
   * tokens so canvas chrome and kit panels stay one color system. Three
   * states replace the old two-color orange scheme: a quiet slate veil for
   * hover-pause (transient inspection), rose for user-sent ownership, and the
   * strongest rose for selection (emphasis - keyboard focus keeps blue).
   */
  private _drawUserBox(
    renderer: IRenderer,
    rx: number,
    ry: number,
    width: number,
    fontSize: number,
    kind: UserBoxKind = 'hover',
  ): void {
    const pad = 4;
    renderer.beginPath();
    renderer.roundRect(
      rx - pad,
      ry - pad,
      width + pad * 2,
      fontSize * 1.2 + pad * 2,
      USER_BOX_RADIUS_PX,
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
    const pillY = ry + s.params.fontSize * PILL_BASELINE_FACTOR;
    // Backing plate over the exact hotspot span ([rx, rx+84] x [pillY-22,
    // pillY+22], see SelectionHotspots.place) plus a uniform 12px margin, so
    // the visible control and the click targets coincide and the actions read
    // as one floating surface instead of bare emoji over bright video.
    renderer.beginPath();
    renderer.roundRect(
      rx - PILL_PLATE_MARGIN_PX,
      pillY - PILL_HEIGHT_PX / 2,
      PILL_PLATE_WIDTH_PX,
      PILL_HEIGHT_PX,
      PILL_RADIUS_PX,
    );
    renderer.fill(DANMAKU_CHROME.pillFill);
    renderer.stroke(DANMAKU_CHROME.pillStroke, 1);
    const hovered = this.getStage().hoveredAction ?? null;
    // Emoji glyphs ignore the fill colour, so hover is signalled by drawing the
    // hovered action one size larger — the only affordance that actually reads
    // on a colour-fixed glyph. Without it the pill gave no feedback at all.
    const baseFont = `14px sans-serif`;
    const hotFont = `17px sans-serif`;
    renderer.fillText(
      s.liked ? '❤️' : '🤍',
      rx,
      pillY,
      hovered === 'like' ? hotFont : baseFont,
      '#fff',
    );
    renderer.fillText(
      `${likeCount}`,
      rx + PILL_COUNT_OFFSET_PX,
      pillY,
      baseFont,
      hovered === 'like' ? '#fff' : DANMAKU_CHROME.pillCount,
    );
    renderer.fillText(
      '📋',
      rx + PILL_COPY_OFFSET_PX,
      pillY,
      hovered === 'copy' ? hotFont : baseFont,
      '#fff',
    );
  }
}
