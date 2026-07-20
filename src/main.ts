import { Scene } from '@vectojs/core';
import { attachDevtools } from '@vectojs/devtools';
import { App } from './view/App';
import { patchDropdownTheme } from './view/DropdownPatch';

function main(): void {
  patchDropdownTheme();
  const canvas = document.getElementById('bakudan-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  const scene = new Scene(canvas, {
    // Uncapped by the app — let the display's refresh rate (e.g. 240Hz) drive
    // rAF. The stress bench should show the true achievable frame rate, not an
    // artificial 60fps ceiling. A per-run cap is still exposed in the panel.
    maxFPS: 240,
    maxDPR: 1,
    a11ySyncInterval: 100,
    // Stack a WebGL2 layer above the 2D canvas. The danmaku text layer draws
    // its glyphs through it (MSDF, one batched draw call for the whole frame),
    // which is the only way past the Canvas2D per-glyph draw + overdraw
    // fill-rate wall at 5,000 concurrent danmaku. UI (HUD/panel) stays Canvas2D.
    // Falls back to Canvas2D automatically if WebGL2 is unavailable.
    pointBackend: 'webgl',
  });
  scene.renderMode = 'always';

  // The Scene stacks its WebGL glyph canvas at z-index 5 by default, which would
  // draw danmaku OVER the Canvas2D UI (HUD/panel live on #bakudan-canvas at z2).
  // Drop it to z1 so the layer order is: bg(0) < GL danmaku(1) < 2D UI(2).
  const glCanvas = (scene as unknown as { glCanvas?: HTMLCanvasElement }).glCanvas;
  if (glCanvas) glCanvas.style.zIndex = '1';

  const app = new App(scene);

  // Forge devtools hook
  if (window.location.search.includes('debug')) {
    attachDevtools(scene);
    (window as any).__app = app;
  }

  function resize(): void {
    scene.resize(window.innerWidth, window.innerHeight);
    app.onResize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);

  // visualViewport for mobile keyboard avoidance
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      app.onViewportChange(window.visualViewport!);
    });
  }

  resize();
  scene.start();
  app.start();
}

window.addEventListener('DOMContentLoaded', main);
