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
  });
  scene.renderMode = 'always';

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
