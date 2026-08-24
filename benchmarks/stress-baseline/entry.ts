/**
 * bakudan dual-engine stress baseline — mounts the REAL App/Scene in stress
 * mode at a parameterized pool count and reports the app's own FrameProfiler
 * distribution (fps percentiles, frame-time percentiles, over-budget fraction,
 * per-phase costs) through the shared result envelope.
 *
 * Why this exists: every prior bakudan stress figure was CLI-driven single-
 * engine prose (bakudan-docs/TODO.md, PR #26: "Firefox arm needs a
 * run-browsers.sh pass"), so nothing was quotable. This entry is driven only
 * by vectojs/benchmarks/run-browsers.sh, which owns focus, the dedicated
 * workspace, Firefox's layout.frame_rate pref and the cadence gate.
 *
 * Engine versions are the app's exact npm pins (@vectojs/core 1.38.1 etc.) —
 * NOT the monorepo workspace source. That is deliberate (forge convention:
 * measure what an external user experiences) and is why build.ts does not use
 * the shared source-resolving bundler; see benchmarks/README.md.
 */
import { Scene } from '@vectojs/core';
import { awaitStart, calibrateRefreshRate, reportResult } from 'vectojs-bench-client';
import { App } from '../../src/view/App';

const BENCH_NAME = 'bakudan-stress';

/** Fill rate while the pool grows — the throughput panel's own slider max. */
const FILL_SPAWN_RATE = 2000;
/** Quiet period after fill before any measurement starts. */
const SETTLE_MS = 1500;
/** Wall-clock length of the measured window. */
const MEASURE_MS = 8000;
/** Give up waiting for a fill that will never complete (target > capacity). */
const FILL_TIMEOUT_MS = 45_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Recreate production index.html's host markup: #bakudan-bg under the WebGL
 * glyph canvas (z1) under the Canvas2D UI canvas (z2), all viewport-sized.
 * Remote Google Fonts are deliberately not loaded — a baseline must not depend
 * on network weather; both engines measure their default sans fallback.
 */
function mountHost(): HTMLCanvasElement {
  document.body.style.cssText =
    'margin:0;padding:0;background:#07090d;color:#e2e8f0;overflow:hidden;' +
    'font-family:system-ui,sans-serif;';
  const bg = document.createElement('div');
  bg.id = 'bakudan-bg';
  bg.style.cssText =
    'position:absolute;top:0;left:0;width:100vw;height:100vh;z-index:0;overflow:hidden;';
  document.body.appendChild(bg);
  const canvas = document.createElement('canvas');
  canvas.id = 'bakudan-canvas';
  canvas.style.cssText =
    'display:block;width:100vw;height:100vh;position:absolute;top:0;left:0;z-index:2;';
  document.body.appendChild(canvas);
  return canvas;
}

async function waitForFill(app: App, effectiveTarget: number): Promise<boolean> {
  const deadline = performance.now() + FILL_TIMEOUT_MS;
  while (performance.now() < deadline) {
    if (app.pool.activeCount >= effectiveTarget) return true;
    await sleep(250);
  }
  return false;
}

async function main(): Promise<void> {
  const urlParams = new URLSearchParams(location.search);
  const requested = Number.parseInt(urlParams.get('stress') ?? '5000', 10);
  const stressTarget = Number.isFinite(requested) && requested > 0 ? requested : 5000;

  const canvas = mountHost();

  // Scene options mirror src/main.ts exactly — this must be production startup,
  // not a tuned harness variant.
  const scene = new Scene(canvas, {
    maxFPS: 240,
    maxDPR: Math.min(window.devicePixelRatio || 1, 2),
    a11ySyncInterval: 100,
    pointBackend: 'webgl',
  });
  scene.renderMode = 'always';
  // Keep the WebGL danmaku layer below the Canvas2D UI layer (src/main.ts).
  const glCanvas = (scene as unknown as { glCanvas?: HTMLCanvasElement }).glCanvas;
  if (glCanvas) glCanvas.style.zIndex = '1';

  const app = new App(scene);

  function resize(): void {
    scene.resize(window.innerWidth, window.innerHeight);
    app.onResize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();
  scene.start();
  app.start();

  // Same seam a user's kit-panel interaction drives (App.applyStressTarget).
  app.applyStressTarget(stressTarget);
  const effectiveTarget = Math.min(stressTarget, app.pool.capacity);
  const fillStart = performance.now();
  // Elevated spawn rate for fill AND measurement: scroll-out exits must be
  // refilled instantly or the pool settles below target (measured: restoring
  // the default 300/s held only 1876 of a 2000 target — inflow-limited, not
  // engine-limited). With ample inflow the scheduler tops up each deficit the
  // frame it appears, so steady state is exactly N alive.
  app.scheduler.setSpawnRate(FILL_SPAWN_RATE);
  const filled = await waitForFill(app, effectiveTarget);
  const fillSeconds = Math.round((performance.now() - fillStart) / 100) / 10;
  await sleep(SETTLE_MS);

  // Cadence gate AFTER the pool is full, not before: the app idles at a
  // deliberate ~60Hz (DEC-0001), so gating on an empty scene would time out by
  // construction. For a genuinely frame-bound arm the gate still times out —
  // honestly — and the envelope carries that issue instead of pretending the
  // panel cadence was met.
  await awaitStart();

  // Calibrate under steady stress so `refreshHz` is the achievable ceiling this
  // run was measured against. Cached per page: reportResult's envelope reuses
  // exactly this number.
  const refreshHz = await calibrateRefreshRate(1000);

  const profiler = app.profilerRef();
  profiler.start();
  await sleep(MEASURE_MS);
  const report = profiler.stop();

  if (!report) throw new Error('FrameProfiler produced no report');

  const row = {
    stressRequested: stressTarget,
    stressEffective: effectiveTarget,
    filled,
    fillSeconds,
    activeAtEnd: app.pool.activeCount,
    profile: report,
  };

  const payload = {
    name: BENCH_NAME,
    params: {
      stressTarget: effectiveTarget,
      measureMs: MEASURE_MS,
      settleMs: SETTLE_MS,
      fillSpawnRate: FILL_SPAWN_RATE,
      enginePins: 'exact npm pins (see benchmarks/README.md)',
    },
    rows: [row],
    summary: {
      fpsP50: report.fps.p50,
      fpsMean: report.fps.mean,
      fpsLowTailP5: report.fps.p5,
      frameTimeMsP50: report.frameTimeMs.p50,
      frameTimeMsP95: report.frameTimeMs.p95,
      frameTimeMsP99: report.frameTimeMs.p99,
      overBudgetPct: report.overBudget ? report.overBudget.pct : null,
      frames: report.frames,
      refreshHzProbe: refreshHz,
    },
    phases: report.phasesMs,
    durationMs: MEASURE_MS,
    issues: filled ? [] : [`pool never reached ${effectiveTarget} within ${FILL_TIMEOUT_MS}ms`],
  };

  const result = await reportResult(payload);

  // Render the payload into the page: if the POST ever fails the run is still
  // readable on screen.
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:relative;z-index:10;white-space:pre-wrap;font-size:11px;';
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);
}

main().catch(async (error: unknown) => {
  const { reportFailure } = await import('vectojs-bench-client');
  await reportFailure(BENCH_NAME, error);
});
