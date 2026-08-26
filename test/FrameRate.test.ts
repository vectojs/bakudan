import { describe, expect, test } from 'bun:test';
import { Scene } from '@vectojs/core';
import { App } from '../src/view/App';

/**
 * The Benchmark tab's FPS selector writes Scene.maxFPS at runtime — core
 * documents the field as "Also settable later via Scene.maxFPS". Pin that the
 * panel callback actually reaches the scene: a selector that updates only the
 * app's own field would render a number and change nothing.
 */
describe('FPS selector', () => {
  test('onFrameRateChange writes Scene.maxFPS, not just app state', () => {
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1440 },
      innerHeight: { configurable: true, value: 900 },
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 900;
    document.body.appendChild(canvas);

    const scene = new Scene(canvas, {
      maxFPS: 0,
      maxDPR: 1,
      disableWindowResize: true,
    });
    const app = new App(scene);
    try {
      const panel = (
        app as unknown as {
          benchPanel: { options: { onFrameRateChange(hz: number): void } };
        }
      ).benchPanel;
      panel.options.onFrameRateChange(120);
      expect(scene.maxFPS).toBe(120);
      expect((app as unknown as { _frameRate: number })._frameRate).toBe(120);
    } finally {
      app.destroy();
      scene.destroy();
      canvas.remove();
    }
  });
});
