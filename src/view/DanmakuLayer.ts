import { Entity, type IRenderer, type MSDFFont } from '@vectojs/core';
import type { PoolSlot } from '../model/types';
import type { DanmakuPool } from '../model/DanmakuPool';
import { getTextBitmap } from './TextBitmapCache';
import type { LoadedAtlas } from './MSDFAtlas';

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

  // --- WebGL/MSDF text path (set once the atlas loads; null → Canvas2D) ---
  private _font: MSDFFont | null = null;
  private _texture: TexImageSource | null = null;
  private _distanceRange = 0;
  /** Cached laid-out glyph quads per `fontSize\u0000text` (bounded working set). */
  private _runCache = new Map<string, GlyphRun>();
  /** Cached "every glyph is in the atlas & no emoji" per text. */
  private _glSafe = new Map<string, boolean>();

  constructor(
    private pool: DanmakuPool,
    private getStage: () => { w: number; h: number; interactive: boolean },
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
  }

  /** Is `text` fully representable by the MSDF atlas (no emoji, all glyphs present)? */
  private _isGLSafe(text: string): boolean {
    const hit = this._glSafe.get(text);
    if (hit !== undefined) return hit;
    let safe = true;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (emojiRe.test(ch) || !this._font!.getGlyph(cp)) {
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

  render(renderer: IRenderer): void {
    const { w: stageW, h: stageH, interactive } = this.getStage();
    const slots = this.pool.slots;
    const buckets = this._buckets;

    // Reset buckets (keep arrays, just zero their length — no per-frame alloc).
    for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;

    // Slots that need their own transform/effect pass (drawn after the plain
    // batched text so their glyphs sit on top and each gets isolated state).
    let special: PoolSlot[] | null = null;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.active) continue;
      const fontSize = s.params.fontSize;
      // Inline frustum cull — skip anything fully off-screen.
      if (s.x > stageW || s.x + s.width < 0 || s.y > stageH || s.y + fontSize * 1.5 < 0) {
        continue;
      }
      const eff = s.params.effects;
      const isSpecial =
        s.params.preset === 'glitch' ||
        s.params.preset === 'rotation' ||
        eff.rainbow ||
        eff.outline ||
        eff.glow ||
        eff.gradient;
      if (isSpecial) {
        (special ||= []).push(s);
        continue;
      }
      const fs = fontSize | 0;
      (buckets[fs] || buckets[buckets.length - 1]).push(s);
    }

    // GL glyph batch layer (stacked WebGL canvas the Scene owns). When present
    // and the atlas is loaded, plain danmaku draw their glyphs through it — the
    // whole frame's glyphs batch into ~1 GPU draw call, which is the only way
    // past the Canvas2D per-glyph draw + overdraw fill-rate wall at 5,000.
    const gl = this._font
      ? (this.scene as unknown as { pointRenderer?: GLPointRenderer } | null)
      : null;
    const glr = gl?.pointRenderer ?? null;
    if (glr && this._texture) glr.setMSDFTexture(this._texture, this._distanceRange);

    // --- Plain batched pass. GL path: one addGlyph per glyph (no ctx.font /
    //     fillStyle churn). Canvas2D fallback: font-size buckets + bitmap cache. ---
    let curAlpha = -1;
    for (let fs = 0; fs < buckets.length; fs++) {
      const bucket = buckets[fs];
      if (bucket.length === 0) continue;
      const font = `400 ${fs}px system-ui, -apple-system, sans-serif`;
      for (let j = 0; j < bucket.length; j++) {
        const s = bucket[j];
        const rx = Math.round(s.x);
        const ry = Math.round(s.y);
        const textY = ry + fs * 0.8;
        // Interaction chrome (user-sent box) stays on Canvas2D, behind glyphs.
        if (s.userSent && s.width > 0) {
          if (curAlpha !== s.params.opacity) {
            renderer.setGlobalAlpha(s.params.opacity);
            curAlpha = s.params.opacity;
          }
          this._drawUserBox(renderer, rx, ry, s.width, fs);
        }

        // User-sent danmaku keep their highlight box + text together on the 2D
        // canvas (z2) so the box stays behind the glyphs; the GL glyph layer is
        // z1 (below the 2D canvas), which would otherwise put the box on top.
        // They're rare (hand-typed), so the Canvas2D path costs nothing here.
        if (glr && !s.userSent && this._isGLSafe(s.params.text)) {
          // GPU path: push this run's glyph quads to the batch.
          const run = this._glyphRun(s.params.text, fs);
          const color = s.params.color;
          const alpha = s.params.opacity;
          const quads = run.quads;
          for (let q = 0; q < quads.length; q++) {
            const g = quads[q];
            glr.addGlyph(rx + g.x, ry + g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, color, alpha);
          }
        } else {
          // Canvas2D fallback (emoji / out-of-atlas glyphs, or no WebGL).
          if (curAlpha !== s.params.opacity) {
            renderer.setGlobalAlpha(s.params.opacity);
            curAlpha = s.params.opacity;
          }
          const bmp = getTextBitmap(s.params.text, fs, font, s.params.color);
          if (bmp) {
            renderer.drawImage(bmp.canvas, rx - bmp.offsetX, textY - bmp.offsetY, bmp.w, bmp.h);
          } else {
            renderer.fillText(s.params.text, rx, textY, font, s.params.color);
          }
        }

        if (s.hovered && interactive) {
          if (curAlpha !== 1) {
            renderer.setGlobalAlpha(1);
            curAlpha = 1;
          }
          this._drawActions(renderer, s, fs, rx, ry);
        }
      }
    }

    // --- Special pass: glitch / rotation / rainbow / outline / glow ---
    if (special) {
      for (let i = 0; i < special.length; i++) {
        this._renderSpecial(renderer, special[i], stageW, stageH, interactive);
      }
    }

    if (curAlpha !== 1) renderer.setGlobalAlpha(1);
  }

  private _renderSpecial(
    renderer: IRenderer,
    s: PoolSlot,
    _stageW: number,
    _stageH: number,
    interactive: boolean,
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

    if (s.userSent && s.width > 0) this._drawUserBox(renderer, rx, ry, s.width, fontSize);

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
      if (effects.outline) {
        renderer.fillText(text, rx + 1, textY, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, rx - 1, textY, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, rx, textY + 1, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, rx, textY - 1, font, 'rgba(0,0,0,0.6)');
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

    if (s.hovered && interactive) this._drawActions(renderer, s, fontSize, rx, ry);
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

  private _drawUserBox(
    renderer: IRenderer,
    rx: number,
    ry: number,
    width: number,
    fontSize: number,
  ): void {
    const pad = 4;
    renderer.beginPath();
    renderer.roundRect(rx - pad, ry - pad, width + pad * 2, fontSize * 1.2 + pad * 2, 4);
    renderer.fill('rgba(255, 126, 95, 0.08)');
    renderer.stroke('rgba(255, 126, 95, 0.35)', 1);
  }

  private _drawActions(
    renderer: IRenderer,
    s: PoolSlot,
    fontSize: number,
    rx: number,
    ry: number,
  ): void {
    const textEnd = rx + s.width;
    const btnFont = `${fontSize}px sans-serif`;
    renderer.fillText(s.liked ? '❤️' : '🤍', textEnd + 4, ry + fontSize * 0.8, btnFont, '#fff');
    renderer.fillText('📋', textEnd + 24, ry + fontSize * 0.8, btnFont, '#fff');
  }
}

/** Action-button hit region width (like + copy buttons past the text). */
export const ACTION_BTN_WIDTH = 44;

/**
 * Hit-test the action button strip at a local-x offset past the text.
 * Mirrors the layout drawn in `_drawActions`. Only valid while hovered.
 */
export function hitAction(slot: PoolSlot, localX: number): ActionKind | null {
  const textEnd = slot.width;
  if (localX >= textEnd + 4 && localX < textEnd + 24) return 'like';
  if (localX >= textEnd + 24 && localX < textEnd + 44) return 'copy';
  return null;
}
