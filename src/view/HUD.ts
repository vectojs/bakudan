import { Entity, type IRenderer } from '@vectojs/core';
import type { HUDData } from '../model/types';
import { t } from '../model/i18n';

export class HUD extends Entity {
  width = 250;
  height = 118;
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

  /** Position at top-left by default. Caller sets x/y based on stage size. */
  alignToStage(_stageWidth: number): void {
    this.x = 16;
    this.y = 16;
  }

  render(renderer: IRenderer): void {
    const isThrottled = this.data.fps <= 5 && this.data.entityCount === 0;

    // Glassmorphic Card Container
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 10);
    renderer.fill('rgba(255, 255, 255, 0.92)');
    renderer.stroke('rgba(255, 126, 95, 0.25)', 1);

    // Top Accent Pill Bar
    renderer.beginPath();
    renderer.roundRect(14, 0, 48, 3, 2);
    renderer.fill(isThrottled ? '#f59e0b' : '#ff7e5f');

    // Live Pulse Dot
    const dotX = 18;
    const dotY = 18;
    renderer.beginPath();
    renderer.arc(dotX, dotY, 4, 0, Math.PI * 2);
    renderer.fill(isThrottled ? '#f59e0b' : '#10b981');

    // Section Title
    const headerFont = "600 10px 'Outfit', 'Inter', sans-serif";
    renderer.fillText('ENGINE METRICS', 28, 21, headerFont, '#8c7d75');
    renderer.restore();

    const y0 = 40;
    const font = "11px 'JetBrains Mono', monospace";
    const hitRate = this.data.measureTextHitRate ?? 100;
    const gcSaved = this.data.gcSavedCount ?? 0;

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
      const y = y0 + i * 15;
      renderer.fillText(label + ':', 16, y, font, '#71625a');

      let valColor = '#332a26';
      if (label === t('hud.fps', this.lang)) {
        valColor = this.data.fps >= 55 ? '#059669' : '#d97706';
      } else if (label === t('hud.state', this.lang)) {
        valColor = isThrottled ? '#d97706' : '#ea580c';
      } else if (label === t('hud.cache', this.lang)) {
        valColor = '#d97706';
      } else if (label === t('hud.gc', this.lang) && gcSaved > 0) {
        valColor = '#ea580c';
      }
      renderer.fillText(val, 120, y, font, valColor);
    }
    renderer.restore();
  }
}
