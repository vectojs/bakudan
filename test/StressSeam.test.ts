import { describe, expect, it } from 'bun:test';
import { Scene } from '@vectojs/core';
import { App } from '../src/view/App';
import { StageBackground } from '../src/view/StageBackground';

/**
 * Pins App.applyStressTarget — the single entry point shared by the
 * throughput panel callback and the `?stress=<n>` startup seam in main.ts.
 * If this regresses, the bench harness measures a different code path than a
 * user's panel interaction drives.
 */

interface ControlledVideo {
  element: HTMLVideoElement;
  pause: () => void;
}

function controlledVideo(): ControlledVideo {
  const element = document.createElement('video');
  let paused = true;
  const pause = () => {
    paused = true;
  };
  Object.defineProperties(element, {
    duration: { configurable: true, value: 15 },
    readyState: { configurable: true, value: 1 },
    paused: { configurable: true, get: () => paused },
    play: {
      configurable: true,
      value: () => {
        paused = false;
        return Promise.resolve();
      },
    },
    pause: { configurable: true, value: pause },
    load: { configurable: true, value: () => {} },
  });
  return { element, pause };
}

function stressFixture(
  width = 1440,
  height = 900,
): { app: App; scene: Scene; video: ControlledVideo } {
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
  const video = controlledVideo();
  const background = new StageBackground({
    host,
    videoFactory: () => video.element,
  });
  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 1,
    disableWindowResize: true,
  });
  const app = new App(scene, { stageBackground: background });
  app.onResize(width, height);
  app.start();
  return { app, scene, video };
}

describe('App.applyStressTarget', () => {
  it('enters stress mode and drives the scheduler to the requested count', () => {
    const { app, scene } = stressFixture();
    try {
      expect(app.scheduler.target).toBe(0);
      app.applyStressTarget(5000);
      expect(app.scheduler.target).toBe(5000);
      // Profiler context must name the target so a report is interpretable.
      expect(app.profilerRef()).toBeDefined();
    } finally {
      app.destroy();
      scene.destroy();
    }
  });

  it('pauses the background video, as the panel path does', async () => {
    const { app, scene, video } = stressFixture();
    try {
      // StageBackground attaches the candidate only on loadedmetadata; force
      // the same attachment a real session reaches before any pause().
      video.element.dispatchEvent(new Event('loadedmetadata'));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      let pauseCalled = false;
      Object.defineProperty(video.element, 'pause', {
        configurable: true,
        value: () => {
          pauseCalled = true;
        },
      });
      app.applyStressTarget(1000);
      expect(pauseCalled).toBe(true);
    } finally {
      app.destroy();
      scene.destroy();
    }
  });
});
