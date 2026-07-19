import { Entity, type IRenderer } from '@vectojs/core';
import type { HUDData } from '../model/types';

export class HUD extends Entity {
  width = 240;
  height = 105;
  data: HUDData = {
    fps: 60,
    frameTime: 16,
    entityCount: 0,
    heapUsedMB: null,
    gcSavedCount: 0,
    measureTextHitRate: 100,
  };

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
    renderer.roundRect(0, 0, this.width, this.height, 6);
    renderer.fill('#111827');
    renderer.stroke('rgba(148, 163, 184, 0.2)', 1);
    renderer.restore();

    const y0 = 18;
    const font = '11px monospace';
    const hitRate = this.data.measureTextHitRate ?? 100;
    const gcSaved = this.data.gcSavedCount ?? 0;
    const isThrottled = this.data.fps <= 5 && this.data.entityCount === 0;

    const lines = [
      ['FPS', `${this.data.fps} (${this.data.frameTime.toFixed(1)}ms)`],
      ['Engine State', isThrottled ? 'Throttle (2fps)' : 'Active (60fps)'],
      ['Barrage Count', `${this.data.entityCount} active`],
      ['Width Cache', `${hitRate.toFixed(1)}% hit`],
      ['GC Saved', `${gcSaved.toLocaleString()} objs/s`],
    ];

    renderer.save();
    renderer.setGlobalAlpha(0.9);
    for (let i = 0; i < lines.length; i++) {
      const [label, val] = lines[i];
      const y = y0 + i * 16;
      renderer.fillText(label + ':', 10, y, font, '#94a3b8');

      let valColor = '#f8fafc';
      if (label === 'Engine State') {
        valColor = isThrottled ? '#fbbf24' : '#38bdf8'; // amber vs sky
      } else if (label === 'Width Cache') {
        valColor = '#34d399'; // emerald
      } else if (label === 'GC Saved' && gcSaved > 0) {
        valColor = '#818cf8'; // indigo
      }
      renderer.fillText(val, 115, y, font, valColor);
    }
    renderer.restore();
  }
}
