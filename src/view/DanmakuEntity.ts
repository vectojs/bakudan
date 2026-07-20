import { Entity, type IRenderer } from '@vectojs/core';
import type { PoolSlot, DanmakuParams } from '../model/types';

const fontCtxCache = new Map<string, any>();

function getMeasureCtx(fontSize: number): { measureText(text: string): { width: number } } {
  const rounded = Math.round(fontSize);
  const key = `${rounded}`;
  let ctx = fontCtxCache.get(key);
  if (ctx) return ctx;
  const c = document.createElement('canvas');
  const cctx = c.getContext('2d');
  if (!cctx) {
    return {
      measureText(t: string) {
        return { width: t.length * rounded * 0.6 };
      },
    };
  }
  cctx.font = `400 ${rounded}px system-ui, sans-serif`;
  fontCtxCache.set(key, cctx);
  return cctx;
}

export type ActionKind = 'like' | 'copy';

export class DanmakuEntity extends Entity {
  public static cacheHits = 0;
  public static cacheMisses = 0;
  public app: any = null;
  slot: PoolSlot | null = null;
  liked = false;
  hovered = false;
  dragging = false;
  dragOffX = 0;
  dragOffY = 0;

  /**
   * Reference to the `slot.params` object we last bound to. `PoolSlot`
   * objects are never re-allocated (fixed array reused in place), so
   * comparing `slot` itself can never detect a recycle — but `params` IS a
   * fresh object every `activateBatch()` call, so it's the right identity
   * to watch for "this slot changed occupant since we last synced".
   */
  boundParams: DanmakuParams | null = null;

  onAction: ((kind: ActionKind) => void) | null = null;
  onDragStart: ((gx: number, gy: number) => void) | null = null;

  private _actionBtnW = 44;

  /** Cached per-character widths, recomputed only on text/fontSize change. */
  private _cachedCharWidths: number[] | null = null;
  private _cachedText = '';
  private _cachedFontSize = 0;

  get actionBtnWidth(): number {
    return this._actionBtnW;
  }

  /**
   * Return per-character pixel widths for the current slot text. The result
   * is cached and only recomputed when text or fontSize changes — avoids
   * calling the expensive `measureText()` on every frame during rainbow and
   * rotation rendering.
   */
  private _getCharWidths(): number[] {
    const s = this.slot;
    if (!s) return [];
    const { text, fontSize } = s.params;
    if (this._cachedCharWidths && this._cachedText === text && this._cachedFontSize === fontSize) {
      DanmakuEntity.cacheHits += [...text].length;
      return this._cachedCharWidths;
    }
    const chars = [...text];
    DanmakuEntity.cacheMisses += chars.length;
    const ctx = getMeasureCtx(fontSize);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    this._cachedCharWidths = widths;
    this._cachedText = text;
    this._cachedFontSize = fontSize;
    return widths;
  }

  isPointInside(globalX: number, globalY: number): boolean {
    if (!this.interactive || !this.slot) return false;
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    const w = (this.slot.width || 80) + this._actionBtnW;
    const h = (this.slot.params.fontSize || 24) * 1.4;
    return local.x >= 0 && local.x <= w && local.y >= 0 && local.y <= h;
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

    if (this.app?.showcaseJelly && s.age > 0) {
      const freq = 12;
      const decay = 2.5;
      const time = s.age / 1000;
      const wobble = Math.sin(time * freq) * Math.exp(-time * decay) * 0.35;
      renderer.scale(1 + wobble, 1 - wobble);
    }

    renderer.setGlobalAlpha(opacity);
    if ((this as any).isUserSent && s.width > 0) {
      const pad = 4;
      renderer.beginPath();
      renderer.roundRect(-pad, -pad, s.width + pad * 2, fontSize * 1.2 + pad * 2, 4);
      renderer.fill('rgba(255, 126, 95, 0.08)');
      renderer.stroke('rgba(255, 126, 95, 0.35)', 1);
    }

    const font = `400 ${fontSize}px system-ui, -apple-system, sans-serif`;

    if (s.params.preset === 'glitch') {
      this._renderGlitch(renderer, s, font, color, fontSize);
    } else if (effects.rainbow) {
      this._renderRainbow(renderer, s, font);
    } else {
      renderer.fillText(text, 0, fontSize * 0.8, font, color);
      if (effects.outline) {
        const off = 1;
        renderer.fillText(text, off, fontSize * 0.8, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, -off, fontSize * 0.8, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, 0, fontSize * 0.8 + off, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, 0, fontSize * 0.8 - off, font, 'rgba(0,0,0,0.6)');
        renderer.fillText(text, 0, fontSize * 0.8, font, color);
      }
      if (effects.glow) {
        renderer.fillText(text, 0, fontSize * 0.8, font, color);
      }
    }

    if (s.params.preset === 'rotation' && s.charAngles && s.charAngles.length > 0) {
      this._renderRotatedChars(renderer, s, font, color, fontSize);
      renderer.restore();
      return;
    }

    if (this.hovered && this.interactive && s.active) {
      this._renderActions(renderer, s, fontSize);
    }

    renderer.restore();
  }

  private _renderActions(renderer: IRenderer, s: PoolSlot, fontSize: number): void {
    const textEnd = s.width;
    const btnFont = `${fontSize}px sans-serif`;
    renderer.fillText(this.liked ? '❤️' : '🤍', textEnd + 4, fontSize * 0.8, btnFont, '#fff');
    renderer.fillText('📋', textEnd + 24, fontSize * 0.8, btnFont, '#fff');
  }

  /** Hit-test the action button region at a known local-x. Returns the action kind or null. */
  hitAction(localX: number): ActionKind | null {
    const s = this.slot;
    if (!s) return null;
    const textEnd = s.width;
    if (localX >= textEnd + 4 && localX < textEnd + 24) return 'like';
    if (localX >= textEnd + 24 && localX < textEnd + 44) return 'copy';
    return null;
  }

  private _renderGlitch(
    renderer: IRenderer,
    s: PoolSlot,
    font: string,
    color: string,
    fontSize: number,
  ): void {
    const t = s.age / 1000;
    const jx = Math.sin(t * 47) * 3;
    const jy = Math.cos(t * 53) * 2;
    renderer.fillText(s.params.text, jx - 2, fontSize * 0.8 + jy, font, 'rgba(255,50,50,0.8)');
    renderer.fillText(s.params.text, jx + 2, fontSize * 0.8 - jy, font, 'rgba(50,50,255,0.8)');
    renderer.fillText(s.params.text, jx, fontSize * 0.8, font, color);
  }

  private _renderRainbow(renderer: IRenderer, s: PoolSlot, font: string): void {
    const chars = [...s.params.text];
    const fontSize = s.params.fontSize;
    const widths = this._getCharWidths();
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      const hue = ((s.age / 50 + i * 30) % 360) | 0;
      renderer.fillText(chars[i], cx, fontSize * 0.8, font, `hsl(${hue}, 80%, 65%)`);
      cx += widths[i] ?? 0;
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
    const widths = this._getCharWidths();
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      renderer.save();
      renderer.translate(cx, fontSize * 0.8);
      renderer.rotate(s.charAngles[i] ?? 0);
      renderer.fillText(chars[i], 0, 0, font, color);
      renderer.restore();
      cx += widths[i] ?? 0;
    }
  }

  override destroy(): void {
    this.slot = null;
    this.boundParams = null;
    super.destroy();
  }
}
