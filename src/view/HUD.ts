import { Entity, type IRenderer } from '@vectojs/core';
import type { HUDData } from '../model/types';

export class HUD extends Entity {
  width = 200;
  height = 60;
  data: HUDData = { fps: 60, frameTime: 16, entityCount: 0, heapUsedMB: null };

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  /** Position at top-right by default. Caller sets x/y based on stage size. */
  alignToStage(stageWidth: number): void {
    this.x = stageWidth - this.width - 12;
    this.y = 8;
  }

  render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 8);
    renderer.fill('#1e2536');
    renderer.stroke('rgba(148,163,184,0.4)', 1);
    renderer.restore();

    const y0 = 16;
    const font = '11px monospace';
    const lines = [
      `FPS: ${this.data.fps}  ·  ${this.data.frameTime.toFixed(1)}ms`,
      `Entity: ${this.data.entityCount}`,
    ];
    if (this.data.heapUsedMB !== null) {
      lines.push(`Heap: ${this.data.heapUsedMB} MB`);
    }

    renderer.save();
    renderer.setGlobalAlpha(0.9);
    for (let i = 0; i < lines.length; i++) {
      renderer.fillText(lines[i], 8, y0 + i * 16, font, '#4ade80');
    }
    renderer.restore();
  }
}
