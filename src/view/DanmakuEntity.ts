import { Entity, type IRenderer } from '@vectojs/core';
import type { PoolSlot } from '../model/types';

/** Cached per-font measurements: key = fontSize|fontWeight, value = ctx */
const fontCtxCache = new Map<string, CanvasRenderingContext2D>();

function getMeasureCtx(fontSize: number): CanvasRenderingContext2D {
  const key = `${fontSize}`;
  let ctx = fontCtxCache.get(key);
  if (ctx) return ctx;
  const c = document.createElement('canvas');
  const cctx = c.getContext('2d')!;
  cctx.font = `400 ${fontSize}px system-ui, sans-serif`;
  fontCtxCache.set(key, cctx);
  return cctx;
}

/**
 * A single danmaku strip. Owns a PoolSlot reference and renders its text
 * directly via fillText — no LayoutEngine, no Text/RichText, no
 * getContentProjection(). Implements getBounds() for viewport culling.
 */
export class DanmakuEntity extends Entity {
  slot: PoolSlot | null = null;

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  getBounds() {
    if (!this.slot) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: 0,
      y: 0,
      width: this.slot.width,
      height: this.slot.params.fontSize * 1.4,
    };
  }

  render(renderer: IRenderer): void {
    const s = this.slot;
    if (!s || !s.active) return;

    const { text, color, fontSize, opacity, effects } = s.params;
    if (!text) return;

    renderer.save();
    renderer.translate(s.x, s.y);
    renderer.setGlobalAlpha(opacity);

    const font = `400 ${fontSize}px system-ui, -apple-system, sans-serif`;

    if (s.params.preset === 'glitch') {
      this._renderGlitch(renderer, s, font, color, fontSize);
    } else if (effects.rainbow) {
      this._renderRainbow(renderer, s, font);
    } else {
      renderer.fillText(text, 0, fontSize * 0.8, font, color);
      if (effects.outline) {
        const outlineOff = 1;
        renderer.fillText(text, outlineOff, fontSize * 0.8, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, -outlineOff, fontSize * 0.8, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, 0, fontSize * 0.8 + outlineOff, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, 0, fontSize * 0.8 - outlineOff, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, 0, fontSize * 0.8, font, color);
      }
      if (effects.glow) {
        renderer.fillText(text, 0, fontSize * 0.8, font, color); // draw twice for glow emphasis
      }
    }

    if (s.params.preset === 'rotation' && s.charAngles && s.charAngles.length > 0) {
      this._renderRotatedChars(renderer, s, font, color, fontSize);
      renderer.restore();
      return;
    }

    renderer.restore();
  }

  private _renderGlitch(
    renderer: IRenderer,
    s: PoolSlot,
    font: string,
    color: string,
    fontSize: number,
  ): void {
    const t = s.age / 1000;
    const jitterX = Math.sin(t * 47) * 3;
    const jitterY = Math.cos(t * 53) * 2;

    // Red channel offset
    renderer.fillText(
      s.params.text,
      jitterX - 2,
      fontSize * 0.8 + jitterY,
      font,
      'rgba(255,50,50,0.8)',
    );
    // Blue channel offset
    renderer.fillText(
      s.params.text,
      jitterX + 2,
      fontSize * 0.8 - jitterY,
      font,
      'rgba(50,50,255,0.8)',
    );
    // Main text
    renderer.fillText(s.params.text, jitterX, fontSize * 0.8, font, color);
  }

  private _renderRainbow(renderer: IRenderer, s: PoolSlot, font: string): void {
    const chars = [...s.params.text];
    const fontSize = s.params.fontSize;
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      const hue = ((s.age / 50 + i * 30) % 360) | 0;
      renderer.fillText(chars[i], cx, fontSize * 0.8, font, `hsl(${hue}, 80%, 65%)`);
      const ctx = getMeasureCtx(fontSize);
      cx += ctx.measureText(chars[i]).width;
    }
  }

  private _renderRotatedChars(
    renderer: IRenderer,
    s: PoolSlot,
    font: string,
    color: string,
    fontSize: number,
  ): void {
    const chars = [...s.params.text];
    const ctx = getMeasureCtx(fontSize);
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      renderer.save();
      renderer.translate(cx, fontSize * 0.8);
      renderer.rotate(s.charAngles[i] ?? 0);
      renderer.fillText(chars[i], 0, 0, font, color);
      renderer.restore();
      cx += ctx.measureText(chars[i]).width;
    }
  }

  override destroy(): void {
    this.slot = null;
    super.destroy();
  }
}
