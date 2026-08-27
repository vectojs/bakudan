import {
  runInPageBench,
  type BenchProgress,
  type BenchProfileReport,
} from '../../model/InPageBench';
import type { BenchmarkPanelState } from '../BenchmarkPanel';
import { cinemaLabelsFor } from '../cinemaConfig';
import type { App } from '../App';

type BenchHost = {
  _benchRunning: boolean;
  _benchJson: string | null;
  _benchCopied: boolean;
  _benchStatusLine: string;
  _benchResultLines: readonly string[];
  _plateauActive: number;
  _plateauSince: number;
  _saturationLine: string | null;
  _frameRate: number;
  _benchAutoThrottle: boolean;
  _benchIdleFPS: number;
  _hoverPauseEnabled: boolean;
  _dragEnabled: boolean;
  _reactionsEnabled: boolean;
  _repulsionEnabled: boolean;
  _gravityEnabled: boolean;
  _jellyEnabled: boolean;
  isMobile: boolean;
  mode: import('./types').AppMode;
  pool: { activeCount: number; capacity: number };
  scheduler: {
    rate: number;
    target: number;
    setSpawnRate(r: number): void;
    setTargetCount(n: number): void;
  };
  scene: { maxFPS: number };
  profiler: { start(): void; stop(): BenchProfileReport | null };
  _stressTargetBeforeVideo: number;
  _profSpawnRate: number | null;
  benchPanel: { setState(s: BenchmarkPanelState): void };
  danmakuLayer: {
    drawStats: {
      glRuns: number;
      glGlyphs: number;
      c2dBlits: number;
      c2dFillText: number;
      special: number;
    };
  };
  currentLang: import('../../model/i18n').Language;
  applyStressTarget(target: number): void;
  _syncBenchState(): void;
};

function bh(host: App): BenchHost {
  return host as unknown as BenchHost;
}

export function benchState(
  host: App,
): BenchmarkPanelState & { autoThrottle?: boolean; idleFPS?: number } {
  const h = bh(host);
  const labels = cinemaLabelsFor(h.currentLang).panels.benchmark;
  const backend = (h as unknown as { scene: { pointRenderer?: unknown } }).scene.pointRenderer
    ? 'WebGL/MSDF'
    : 'Canvas2D';
  return {
    frameRate: h._frameRate,
    backendLabel: `${labels.renderer}: ${backend}`,
    running: h._benchRunning,
    statusLine: h._benchRunning ? h._benchStatusLine : labels.idle,
    resultLines: h._benchResultLines,
    saturationLine: h._saturationLine,
    copied: h._benchCopied,
    autoThrottle: (h as unknown as { _benchAutoThrottle: boolean })._benchAutoThrottle,
    idleFPS: (h as unknown as { _benchIdleFPS: number })._benchIdleFPS,
  };
}

export function syncBenchState(host: App): void {
  const h = bh(host);
  h.benchPanel.setState(benchState(host));
}

export async function runBenchmark(host: App): Promise<void> {
  const h = bh(host);
  if (h._benchRunning) return;
  const labels = cinemaLabelsFor(h.currentLang).panels.benchmark;
  h._benchRunning = true;
  h._benchCopied = false;
  h._benchResultLines = [];
  h._benchStatusLine = '';
  syncBenchState(host);
  try {
    const result = await runInPageBench(
      {
        now: () => performance.now(),
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        requestAnimationFrame: (cb) => requestAnimationFrame(cb),
        applyStressTarget: (target) => {
          (host as unknown as { applyStressTarget(t: number): void }).applyStressTarget(target);
          return Math.min(target, h.pool.capacity);
        },
        setSpawnRate: (rate) => {
          h._profSpawnRate = rate;
          h.scheduler.setSpawnRate(rate);
        },
        activeCount: () => h.pool.activeCount,
        startProfiler: () => h.profiler.start(),
        stopProfiler: () => h.profiler.stop(),
      },
      h._stressTargetBeforeVideo,
      (progress: BenchProgress) => {
        h._benchStatusLine = progress.detail;
        syncBenchState(host);
      },
      labels,
      h._frameRate,
    );
    h._benchJson = result.json;
    h._benchResultLines = labels.resultLines({
      fpsP50: result.report.fps.p50,
      frameTimeMsP99: result.report.frameTimeMs.p99,
      activeAtEnd: result.activeAtEnd,
      target: result.effectiveTarget,
      refreshHz: result.refreshHz,
      filled: result.filled,
    });
    h._benchStatusLine = '';
  } catch (error) {
    h._benchStatusLine = labels.benchFailed(error instanceof Error ? error.message : String(error));
  } finally {
    h._benchRunning = false;
    syncBenchState(host);
  }
}

export async function copyBenchJson(host: App): Promise<void> {
  const h = bh(host);
  if (!h._benchJson) return;
  const labels = cinemaLabelsFor(h.currentLang).panels.benchmark;
  try {
    await navigator.clipboard.writeText(h._benchJson);
    h._benchCopied = true;
  } catch {
    h._benchCopied = false;
    h._benchStatusLine = labels.copyFailed;
  }
  syncBenchState(host);
}

export function downloadBenchJson(host: App): void {
  const h = bh(host);
  if (!h._benchJson) return;
  const labels = cinemaLabelsFor(h.currentLang).panels.benchmark;
  const url = URL.createObjectURL(new Blob([h._benchJson], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = labels.downloadName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function updateSaturation(host: App): void {
  const h = bh(host);
  const labels = cinemaLabelsFor(h.currentLang).panels.benchmark;
  if (h.mode !== 'stress' || h._benchRunning) {
    h._saturationLine = null;
    h._plateauActive = -1;
    return;
  }
  const active = h.pool.activeCount;
  const target = h._stressTargetBeforeVideo;
  const maxed = h.scheduler.rate >= (h.isMobile ? 3000 : 6000);
  if (target > 0 && active < target && maxed) {
    if (active !== h._plateauActive) {
      h._plateauActive = active;
      h._plateauSince = performance.now();
    } else if (performance.now() - h._plateauSince > 4000) {
      h._saturationLine = labels.saturation(active, target);
      return;
    }
  } else {
    h._plateauActive = -1;
  }
  h._saturationLine = null;
}

export function throughputState(host: App): {
  capacity: number;
  target: number;
  rate: number;
  distributionId: import('./types').DistributionId;
  framePercentiles: { fps: number; 'frame-time': number };
  drawSplit: { 'gl-runs': number; 'gl-glyphs': number; 'canvas-slots': number };
} {
  const h = bh(host) as unknown as BenchHost & {
    _lastFps: number;
    _frameTimeMs: number;
    distributionId: import('./types').DistributionId;
  };
  const draw = h.danmakuLayer.drawStats;
  return {
    capacity: h.pool.capacity,
    target: h.scheduler.target,
    rate: h.scheduler.rate,
    distributionId: (h as unknown as { distributionId: import('./types').DistributionId })
      .distributionId,
    framePercentiles: {
      fps: (h as unknown as { _lastFps: number })._lastFps,
      'frame-time': (h as unknown as { _frameTimeMs: number })._frameTimeMs,
    },
    drawSplit: {
      'gl-runs': draw.glRuns,
      'gl-glyphs': draw.glGlyphs,
      'canvas-slots': draw.c2dBlits + draw.c2dFillText + draw.special,
    },
  };
}

export function interactionsState(host: App): {
  presetId: import('@vectojs/danmaku-core').PresetId;
  effects: import('@vectojs/danmaku-core').CharacterEffects;
  renderClasses: { backend: string; glyphs: string; canvas: string };
  hoverPause: boolean;
  dragEnabled: boolean;
  reactionsEnabled: boolean;
  repulsionEnabled: boolean;
  gravityEnabled: boolean;
  jellyEnabled: boolean;
} {
  const h = bh(host) as unknown as BenchHost & {
    activePreset: import('@vectojs/danmaku-core').PresetId;
    effects: import('@vectojs/danmaku-core').CharacterEffects;
    scene: { pointRenderer?: unknown };
  };
  const draw = h.danmakuLayer.drawStats;
  return {
    presetId: (h as unknown as { activePreset: import('@vectojs/danmaku-core').PresetId })
      .activePreset,
    effects: {
      ...(
        h as unknown as {
          effects: import('@vectojs/danmaku-core').CharacterEffects;
        }
      ).effects,
    },
    renderClasses: {
      backend: (h.scene as unknown as { pointRenderer?: unknown }).pointRenderer
        ? 'WebGL + Canvas2D'
        : 'Canvas2D',
      glyphs: `${draw.glGlyphs}`,
      canvas: `${draw.c2dBlits + draw.c2dFillText + draw.special}`,
    },
    hoverPause: (h as unknown as { _hoverPauseEnabled: boolean })._hoverPauseEnabled,
    dragEnabled: (h as unknown as { _dragEnabled: boolean })._dragEnabled,
    reactionsEnabled: (h as unknown as { _reactionsEnabled: boolean })._reactionsEnabled,
    repulsionEnabled: (h as unknown as { _repulsionEnabled: boolean })._repulsionEnabled,
    gravityEnabled: (h as unknown as { _gravityEnabled: boolean })._gravityEnabled,
    jellyEnabled: (h as unknown as { _jellyEnabled: boolean })._jellyEnabled,
  };
}
