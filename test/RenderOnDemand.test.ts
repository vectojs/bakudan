import { afterEach, describe, expect, it } from 'bun:test';
import { Entity, Scene } from '@vectojs/core';
import { StageBackground } from '../src/view/StageBackground';
import { App } from '../src/view/App';

interface Fixture {
  app: App;
  scene: Scene;
  host: HTMLElement;
  background: StageBackground;
}

const fixtures: Fixture[] = [];

function fixture(width = 1440, height = 900): Fixture {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const background = new StageBackground({
    host,
    videoFactory: () => document.createElement('video'),
  });
  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 1,
    disableWindowResize: true,
  });
  const app = new App(scene, { stageBackground: background });
  app.onResize(width, height);
  const value = { app, scene, host, background };
  fixtures.push(value);
  return value;
}

/**
 * Recomposes the private Ticker's predicate from App's public getters.
 *
 * The Ticker is private and only constructed in start(), so this mirrors
 * `Ticker.hasPendingAnimations()` rather than reaching into it. Keep the two in
 * sync: if App gains another animation source, add it here too.
 */
function tickerWouldReportPending(app: App): boolean {
  return (
    app.pool.activeCount > 0 ||
    app.isDragging ||
    app.isVideoPlaying ||
    app.hasAmbientAnimation ||
    app.hasActiveParticles
  );
}

afterEach(() => {
  for (const { app, scene, host } of fixtures.splice(0)) {
    app.destroy();
    scene.destroy();
    host.remove();
  }
  document.body.replaceChildren();
});

describe('render-on-demand idle gating', () => {
  it('reports no ambient animation, because the ambient background is a static gradient', () => {
    const { app, background } = fixture();

    // #bakudan-bg.ambient is a plain radial-gradient: no @keyframes, no
    // transition anywhere in index.html or src/. Claiming animation here pinned
    // the scene at maxFPS forever and made the idle throttle unreachable.
    background.mode = 'ambient';
    expect(app.hasAmbientAnimation).toBe(false);

    background.mode = 'video';
    expect(app.hasAmbientAnimation).toBe(false);
  });

  it('goes fully idle with an empty pool so core can throttle', () => {
    const { app, background } = fixture();
    background.mode = 'ambient';
    app.scheduler.setTargetCount(0);
    app.pool.reset();

    expect(app.pool.activeCount).toBe(0);
    expect(app.isDragging).toBe(false);
    expect(app.isVideoPlaying).toBe(false);
    expect(app.hasActiveParticles).toBe(false);
    expect(tickerWouldReportPending(app)).toBe(false);
  });

  it('still reports pending work while danmaku are active', () => {
    const { app, background } = fixture();
    background.mode = 'ambient';
    app.scheduler.setTargetCount(50);
    // Spawning is paced, so one tick is not enough to reach the target.
    for (let i = 0; i < 120; i++) app.frame(16.7);

    expect(app.pool.activeCount).toBeGreaterThan(0);
    expect(tickerWouldReportPending(app)).toBe(true);
  });

  it('satisfies every precondition core requires to clamp an idle frame to idleFPS', () => {
    const { app, scene, background } = fixture();
    background.mode = 'ambient';
    app.scheduler.setTargetCount(0);
    app.pool.reset();

    // Scene.loop() clamps to the idle floor only when all four hold at once:
    //   isIdle && autoThrottle && renderMode === 'always' && maxFPS > 0
    // Since core >=1.38.0 that floor defaults to 60fps and the app keeps the
    // default on purpose: idle must hold a fixed 60Hz cadence, not sleep.
    scene.renderMode = 'always';
    scene.maxFPS = 240;
    expect(scene.autoThrottle).toBe(true);
    expect(scene.renderMode).toBe('always');
    expect(scene.maxFPS).toBeGreaterThan(0);

    // isIdle is `!dirty && !frameHadAnimation`; the app half of that is the
    // ticker predicate, which must be false for the clamp to ever engage.
    expect(tickerWouldReportPending(app)).toBe(false);
  });

  it('keeps a non-visual entity from forcing frames', () => {
    const { app, scene, background } = fixture();
    background.mode = 'ambient';
    app.scheduler.setTargetCount(0);
    app.pool.reset();

    const probe = new Entity();
    scene.add(probe);
    expect(probe.hasPendingAnimations()).toBe(false);
    expect(tickerWouldReportPending(app)).toBe(false);
    scene.remove(probe);
  });
});
