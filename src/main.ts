import { Scene } from '@vectojs/core';
import { App } from './view/App';
declare global {
  interface Window {
    __app?: App;
  }
}

/**
 * Hybrid shell flag (CTX-0026). Phase 1 keeps canvas chrome but mounts Scene
 * as an embedded island inside #stage-container via disableWindowResize.
 * The flag stays true from here; later phases replace chrome with HTML.
 */
const USE_HTML_SHELL = true;

async function main(): Promise<void> {
  const canvas = document.getElementById('bakudan-canvas') as HTMLCanvasElement | null;
  const stageContainer = document.getElementById('stage-container') as HTMLElement | null;
  if (!canvas) return;

  const scene = new Scene(canvas, {
    // Uncapped by the app — let the display's refresh rate (e.g. 240Hz) drive
    // rAF. The stress bench should show the true achievable frame rate, not an
    // artificial 60fps ceiling. A per-run cap is still exposed in the panel.
    maxFPS: 240,
    // Backing-store cap. The default DPR-1 raster CSS-stretches on any HiDPI
    // display or under browser zoom — measured soft on this 2560x1600 @1.6
    // panel. 2 is core's recommendation; cost scales with logical x dpr^2 and
    // holds at the 5,000-danmaku stress ceiling (CTX-0015a, 2026-08-23).
    maxDPR: Math.min(window.devicePixelRatio || 1, 2),
    a11ySyncInterval: 100,
    // Stack a WebGL2 layer above the 2D canvas. The danmaku text layer draws
    // its glyphs through it (MSDF, one batched draw call for the whole frame),
    // which is the only way past the Canvas2D per-glyph draw + overdraw
    // fill-rate wall at 5,000 concurrent danmaku. UI (HUD/panel) stays Canvas2D.
    // Falls back to Canvas2D automatically if WebGL2 is unavailable.
    pointBackend: 'webgl',
    // Embedded island: Scene observes the canvas/container size via
    // ResizeObserver instead of window.resize — see Scene.ts:269,2967.
    // This lets the stage fill the CSS Grid cell rather than the viewport.
    ...(USE_HTML_SHELL && stageContainer ? { disableWindowResize: true } : {}),
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
    // Keep the debug inspector out of the production bundle's startup path.
    const { attachDevtools } = await import('@vectojs/devtools');
    attachDevtools(scene);
    window.__app = app;
  }

  function readStageSize(): { width: number; height: number } {
    if (USE_HTML_SHELL && stageContainer) {
      const rect = stageContainer.getBoundingClientRect();
      // Fallback to window size if container not yet laid out (0)
      if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function resize(): void {
    const { width, height } = readStageSize();
    // In embedded mode Scene's ResizeObserver already resized the backing
    // store on canvas size change; calling resize() is still needed to sync
    // App's stageW/H, scheduler, and overlay layout to the same size.
    scene.resize(width, height);
    app.onResize(width, height);
  }

  // Hybrid: observe the stage container for CSS Grid size changes (header
  // collapse, lab drawer, browser chrome). Window resize alone no longer
  // fires for embedded scenes.
  let stageObserver: ResizeObserver | null = null;
  if (USE_HTML_SHELL && stageContainer && typeof ResizeObserver !== 'undefined') {
    stageObserver = new ResizeObserver(() => resize());
    stageObserver.observe(stageContainer);
  } else {
    window.addEventListener('resize', resize);
  }

  // visualViewport for mobile keyboard avoidance
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      app.onViewportChange(window.visualViewport!);
      // visualViewport changes can affect the Grid height; re-read stage size
      resize();
    });
  }

  // Expose for App's _layoutCinema fallback and for tests
  if (USE_HTML_SHELL && stageContainer) {
    (window as unknown as { __stageContainer?: HTMLElement }).__stageContainer = stageContainer;
  }

  resize();
  scene.start();
  app.start();

  // Stress-mode startup seam: `?stress=<n>` enters stress mode at n danmaku
  // after the app boots, through the same App.applyStressTarget path the
  // throughput panel uses. This is what lets a benchmark harness mount the real
  // app at a parameterized pool count without touching kit-panel internals.
  const stressParam = Number.parseInt(
    new URLSearchParams(window.location.search).get('stress') ?? '',
    10,
  );
  if (Number.isFinite(stressParam) && stressParam > 0) {
    app.applyStressTarget(stressParam);
  }
}

window.addEventListener('DOMContentLoaded', main);
