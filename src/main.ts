import { Scene } from '@vectojs/core';
import { App } from './view/App';
declare global {
  interface Window {
    __app?: App;
  }
}

/**
 * Hybrid shell (final, CTX-0030): Scene is embedded inside #stage-container
 * via disableWindowResize — the canvas is a Grid island, not a fullscreen
 * viewport. Header/command/lab are HTML chrome outside the island.
 */
async function main(): Promise<void> {
  const canvas = document.getElementById('bakudan-canvas') as HTMLCanvasElement | null;
  const stageContainer = document.getElementById('stage-container') as HTMLElement | null;
  if (!canvas) return;

  const cappedDPR = (): number => Math.min(window.devicePixelRatio || 1, 2);

  const scene = new Scene(canvas, {
    // Uncapped by the app — let the display's refresh rate (e.g. 240Hz) drive
    // rAF. The stress bench should show the true achievable frame rate, not an
    // artificial 60fps ceiling. A per-run cap is still exposed in the panel.
    maxFPS: 240,
    // Backing-store cap. The default DPR-1 raster CSS-stretches on any HiDPI
    // display or under browser zoom — measured soft on this 2560x1600 @1.6
    // panel. 2 is core's recommendation; cost scales with logical x dpr^2 and
    // holds at the 5,000-danmaku stress ceiling (CTX-0015a, 2026-08-23).
    maxDPR: cappedDPR(),
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
    ...(stageContainer ? { disableWindowResize: true } : {}),
  });
  scene.renderMode = 'always';

  // The Scene stacks its WebGL glyph canvas at z-index 5 by default, which would
  // draw danmaku OVER the Canvas2D UI (HUD/panel live on #bakudan-canvas at z2).
  // Drop it to z1 so the layer order is: bg(0) < GL danmaku(1) < 2D UI(2).
  const glCanvas = (scene as unknown as { glCanvas?: HTMLCanvasElement }).glCanvas;
  if (glCanvas) glCanvas.style.zIndex = '1';

  // In hybrid island mode the Scene's internal canvas ResizeObserver duplicates
  // the stageContainer observer below (both call scene.resize on the same
  // Grid size change — header collapse, lab drawer, browser chrome). Keep only
  // the container observer when the island exists; the canvas fills the
  // container so either fires, but only one should drive the backing store.
  if (stageContainer) {
    const internalObserver = (scene as unknown as { canvasResizeObserver?: ResizeObserver | null })
      .canvasResizeObserver;
    if (internalObserver) {
      internalObserver.disconnect();
      (scene as unknown as { canvasResizeObserver: ResizeObserver | null }).canvasResizeObserver =
        null;
    }
  }

  // Video-export mode skips the catalog video autoload: a hanging remote
  // fetch would keep the exporter's networkidle0 from firing, and the clip
  // targets stress mode anyway.
  const exportMode = new URLSearchParams(window.location.search).get('export') === '1';
  const app = new App(scene, { skipVideoAutoload: exportMode });

  // Forge devtools hook
  if (window.location.search.includes('debug')) {
    // Keep the debug inspector out of the production bundle's startup path.
    const { attachDevtools } = await import('@vectojs/devtools');
    attachDevtools(scene);
    window.__app = app;
  }

  // Guarded resize: prevent backing-store realloc every observer tick when
  // size hasn't changed (readStageSize uses layout-triggering
  // getBoundingClientRect). Bench mountHost never resizes during measure;
  // hybrid must also be quiet once the Grid settles.
  let prevW = -1;
  let prevH = -1;

  function readStageSize(): { width: number; height: number } {
    if (stageContainer) {
      const rect = stageContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
      // Container not yet laid out (0 before Grid settles) — avoid allocing a
      // full-window backing store that will be discarded on the next observer
      // tick. Return the last known good size instead.
      if (prevW > 0 && prevH > 0) return { width: prevW, height: prevH };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function resize(): void {
    const { width, height } = readStageSize();
    if (width <= 0 || height <= 0) return;
    if (width === prevW && height === prevH) return;
    prevW = width;
    prevH = height;
    // In embedded mode Scene's ResizeObserver already resized the backing
    // store on canvas size change; calling resize() is still needed to sync
    // App's stageW/H, scheduler, and overlay layout to the same size.
    scene.resize(width, height);
    app.onResize(width, height);
  }

  // Keep backing store crisp across DPR/zoom changes. Scene.watchDevicePixelRatio
  // already re-runs resize() on DPR change, but it keeps the original maxDPR
  // cap — moving a window from 1x to 2x would stay at 1x (blurry) and the
  // reverse would stay capped at the old DPR. Update the cap before re-scaling.
  const syncDPR = (): void => {
    const next = cappedDPR();
    if (scene.maxDPR === next) return;
    scene.maxDPR = next;
    if (prevW > 0 && prevH > 0) {
      scene.resize(prevW, prevH);
      app.onResize(prevW, prevH);
    } else {
      const { width, height } = readStageSize();
      if (width > 0 && height > 0) {
        scene.resize(width, height);
        app.onResize(width, height);
      }
    }
  };

  // Hybrid: observe the stage container for CSS Grid size changes (header
  // collapse, lab drawer, browser chrome). Window resize alone no longer
  // fires for embedded scenes. Use the observer's contentRect when available
  // to avoid an extra getBoundingClientRect inside the callback, and guard
  // on actual change so the callback is not a per-frame realloc (bench never
  // resizes; hybrid container settles after first layout).
  let stageObserver: ResizeObserver | null = null;
  if (stageContainer && typeof ResizeObserver !== 'undefined') {
    stageObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w === prevW && h === prevH) return;
        if (w <= 0 || h <= 0) return;
      }
      resize();
    });
    stageObserver.observe(stageContainer);
  } else {
    window.addEventListener('resize', resize);
  }

  // DPR/zoom listeners — Scene's internal watchDevicePixelRatio already traps
  // DPR via matchMedia, but with a stale maxDPR cap. Mirror it here with an
  // updated cap so zoom/monitor moves rescale to the new cap.
  window.addEventListener('resize', syncDPR);
  if (typeof window.matchMedia === 'function') {
    try {
      const bindDPRMedia = (): void => {
        const dpr = window.devicePixelRatio || 1;
        const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
        mq.addEventListener(
          'change',
          () => {
            syncDPR();
            bindDPRMedia();
          },
          { once: true },
        );
      };
      bindDPRMedia();
    } catch {
      // matchMedia throws on malformed query in some engines — DPR sync via
      // window resize remains.
    }
  }

  // visualViewport for mobile keyboard avoidance — rAF-batched so a single
  // keyboard tick that fires both visualViewport resize and a Grid/ResizeObserver
  // callback does not force two layouts (getBoundingClientRect + app layout).
  let viewportRaf = 0;
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      app.onViewportChange(window.visualViewport!);
      if (viewportRaf) return;
      viewportRaf = requestAnimationFrame(() => {
        viewportRaf = 0;
        resize();
      });
    });
  }

  // Expose for App's _layoutCinema fallback and for tests
  if (stageContainer) {
    (window as unknown as { __stageContainer?: HTMLElement }).__stageContainer = stageContainer;
  }

  // Ensure canvas is keyboard-focusable for Scene's window keyboard channel.
  // Scene's channel gates on ownsKeyboard(activeElement) and only fires when
  // focus is on body/documentElement or a non-owning element; an unfocusable
  // canvas would leave activeElement on body (which still fires) but a tabbable
  // canvas gives a stable focus target for playwright-cli press and restores
  // parity with the bench's mountHost (which is 100vw/vh and receives focus).
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  canvas.setAttribute('tabindex', '0');

  resize();
  scene.start();
  app.start();

  // Focus the canvas when nothing HTML owns focus on load — otherwise an
  // autofocus/input or LabDrawer tab trap could steal focus and make the
  // scene channel suppress every key via ownsKeyboard. RequestAnimationFrame
  // defers until after Scene's focusSentinel is in the DOM.
  requestAnimationFrame(() => {
    const active = document.activeElement as HTMLElement | null;
    const owns = active?.hasAttribute?.('data-vecto-a11y-root');
    const isBodyLike =
      !active || active === document.body || active === document.documentElement || !!owns;
    if (isBodyLike && document.activeElement !== canvas) {
      canvas.focus({ preventScroll: true });
    }
  });

  // Stress-mode startup seam: `?stress=<n>` enters stress mode at n danmaku
  // after the app boots, through the same App.applyStressTarget path the
  // throughput panel uses. This is what lets a benchmark harness mount the real
  // app at a parameterized pool count without touching kit-panel internals.
  const params = new URLSearchParams(window.location.search);
  const stressParam = Number.parseInt(params.get('stress') ?? '', 10);
  if (Number.isFinite(stressParam) && stressParam > 0) {
    app.applyStressTarget(stressParam);
  }

  // Video-export seam: `?export=1` hands the scene to @vectojs/video-exporter,
  // which needs `window.vectoScene` (it calls stop() to halt the rAF loop, then
  // drives step(dt) per frame — see tools/export-video.ts). UI overlays are
  // hidden for a clean stage clip. Combine with `?stress=<n>`; video mode is
  // NOT exportable (a DOM <video> advances by wall clock, not by step()).
  if (exportMode) {
    (window as unknown as { vectoScene?: Scene }).vectoScene = scene;
    app.hideChrome();
  }
}

window.addEventListener('DOMContentLoaded', main);
