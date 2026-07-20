import { Entity, type IRenderer } from '@vectojs/core';
import type { HUDData } from '../model/types';
import { t } from '../model/i18n';

export class HUD extends Entity {
  width = 240;
  height = 105;
  lang: any = 'en'; // Defaults to 'en'

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
  alignToStage(_stageWidth: number): void {
    this.x = 12;
    this.y = 12;
  }

  render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 6);
    renderer.fill('rgba(255, 255, 255, 0.85)');
    renderer.stroke('rgba(255, 126, 95, 0.2)', 1);
    renderer.restore();

    const y0 = 18;
    const font = '11px monospace';
    const hitRate = this.data.measureTextHitRate ?? 100;
    const gcSaved = this.data.gcSavedCount ?? 0;
    const isThrottled = this.data.fps <= 5 && this.data.entityCount === 0;

    const stateText = isThrottled
      ? t('hud.state.throttle', this.lang)
      : t('hud.state.active', this.lang);

    const lines = [
      [t('hud.fps', this.lang), `${this.data.fps} (${this.data.frameTime.toFixed(1)}ms)`],
      [t('hud.state', this.lang), stateText],
      [t('hud.barrage', this.lang), `${this.data.entityCount}`],
      [t('hud.cache', this.lang), `${hitRate.toFixed(1)}% ${t('hud.hit', this.lang)}`],
      [t('hud.gc', this.lang), `${gcSaved.toLocaleString()} ${t('hud.objs', this.lang)}`],
    ];

    renderer.save();
    renderer.setGlobalAlpha(0.95);
    for (let i = 0; i < lines.length; i++) {
      const [label, val] = lines[i];
      const y = y0 + i * 16;
      renderer.fillText(label + ':', 10, y, font, '#453c38'); // warm charcoal label

      let valColor = '#453c38';
      if (label === t('hud.state', this.lang)) {
        valColor = isThrottled ? '#ff9a9e' : '#ff7e5f';
      } else if (label === t('hud.cache', this.lang)) {
        valColor = '#feb47b';
      } else if (label === t('hud.gc', this.lang) && gcSaved > 0) {
        valColor = '#ff7e5f';
      }
      renderer.fillText(val, 115, y, font, valColor);
    }
    renderer.restore();
  }
}
