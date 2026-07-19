import { Scene } from '@vectojs/core';
import { attachDevtools } from '@vectojs/devtools';
import { App } from './view/App';

function main(): void {
  const canvas = document.getElementById('bakudan-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  const scene = new Scene(canvas, {
    maxFPS: 60,
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
