import { Entity, type IRenderer } from '@vectojs/core';
import type { PoolSlot, DanmakuParams } from '../model/types';

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

export type ActionKind = 'like' | 'copy';

export class DanmakuEntity extends Entity {
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

  get actionBtnWidth(): number {
    return this._actionBtnW;
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
    renderer.setGlobalAlpha(opacity);

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
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      const hue = ((s.age / 50 + i * 30) % 360) | 0;
      renderer.fillText(chars[i], cx, fontSize * 0.8, font, `hsl(${hue}, 80%, 65%)`);
      cx += getMeasureCtx(fontSize).measureText(chars[i]).width;
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
    this.boundParams = null;
    super.destroy();
  }
}
