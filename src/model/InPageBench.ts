/**
 * In-page stress benchmark — the lab drawer's own measurement runner.
 *
 * Why this exists: every quotable bakudan number came from the external
 * run-browsers.sh harness (CTX-0020), which a reader cannot rerun. This module
 * runs the same protocol inside the live app — fill to target, settle,
 * calibrate the display cadence, measure through the app's own FrameProfiler —
 * so anyone can reproduce a figure and export it as JSON. It is a
 * verification instrument, not a replacement for the harness: the harness
 * still owns focus, dedicated workspaces and fresh profiles; this runs in
 * whatever tab the user has open.
 *
 * Everything injectable is injected (clock, rAF, sleep, pool access), so the
 * orchestrator is unit-testable without a browser.
 */

/** Wall-clock length of the measured window. */
export const MEASURE_MS = 8000;
/** Quiet period after fill before measurement starts. */
export const SETTLE_MS = 1500;
/** Give up on a fill that will never complete (band-refused placement). */
export const FILL_TIMEOUT_MS = 150_000;
/** Spawn rate during fill and measurement — matches the external bench. */
export const BENCH_SPAWN_RATE = 2000;

export type BenchPhase = 'filling' | 'settling' | 'calibrating' | 'measuring' | 'done' | 'error';

export interface BenchProgress {
  phase: BenchPhase;
  /** Human-readable detail for the panel line, already localized. */
  detail: string;
}

/** The subset of FrameProfiler's report the envelope quotes. */
export interface BenchProfileReport {
  frames: number;
  fps: { mean: number; p5: number; p50: number };
  frameTimeMs: { p50: number; p95: number; p99: number };
  overBudget?: { pct: number } | null;
  phasesMs: Record<string, { p50: number; p95: number; max: number }>;
}

export interface BenchEnvelopeInput {
  name: string;
  timestamp: string;
  url: string;
  userAgent: string;
  hardwareConcurrency: number | null;
  dpr: number;
  viewport: { width: number; height: number };
  params: {
    stressTarget: number;
    spawnRate: number;
    settleMs: number;
    measureMs: number;
    /** Scene.maxFPS during the run — the selector's value. */
    frameRate: number;
  };
  refreshHz: number;
  report: BenchProfileReport;
  filled: boolean;
  fillSeconds: number;
  activeAtEnd: number;
}

/**
 * Sample rAF intervals and reduce them to a cadence — the same estimator as
 * the shared bench client: reject hitches above 2x the median, mean the rest.
 * A plain mean is dragged down by one missed vsync; the median over-reads on
 * engines whose rAF timestamps quantize. Injectable clock/rAF for tests.
 */
export function measureCadence(
  durationMs: number,
  requestAnimationFrame: (cb: (now: number) => void) => unknown,
  now: () => number,
): Promise<number> {
  if (durationMs <= 0) return Promise.resolve(0);
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let previous = now();
    const end = previous + durationMs;
    const frame = (timestamp: number): void => {
      const delta = timestamp - previous;
      previous = timestamp;
      if (delta > 0.1 && delta < 200) intervals.push(delta);
      if (timestamp < end) {
        requestAnimationFrame(frame);
        return;
      }
      if (intervals.length === 0) {
        resolve(0);
        return;
      }
      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)]!;
      const limit = median * 2;
      let total = 0;
      let count = 0;
      for (const interval of intervals) {
        if (interval <= limit) {
          total += interval;
          count += 1;
        }
      }
      resolve(1000 / (total / count));
    };
    requestAnimationFrame(frame);
  });
}

/** Round to 2 decimals so exported JSON stays readable. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Assemble the exportable envelope. Pure — snapshot-tested. */
export function buildBenchEnvelope(input: BenchEnvelopeInput): string {
  const { report } = input;
  const envelope = {
    schemaVersion: 1,
    name: input.name,
    timestamp: input.timestamp,
    environment: {
      url: input.url,
      userAgent: input.userAgent,
      hardwareConcurrency: input.hardwareConcurrency,
      dpr: input.dpr,
      viewport: input.viewport,
      refreshHz: round2(input.refreshHz),
    },
    params: input.params,
    summary: {
      fpsMean: round2(report.fps.mean),
      fpsP50: round2(report.fps.p50),
      fpsLowTailP5: round2(report.fps.p5),
      frameTimeMsP50: round2(report.frameTimeMs.p50),
      frameTimeMsP95: round2(report.frameTimeMs.p95),
      frameTimeMsP99: round2(report.frameTimeMs.p99),
      overBudgetPct: report.overBudget ? round2(report.overBudget.pct) : null,
      frames: report.frames,
    },
    phasesMs: report.phasesMs,
    rows: [
      {
        filled: input.filled,
        fillSeconds: round2(input.fillSeconds),
        activeAtEnd: input.activeAtEnd,
      },
    ],
  };
  return JSON.stringify(envelope, null, 2);
}

/** Everything the orchestrator touches — implemented by App, faked in tests. */
export interface BenchDeps {
  now(): number;
  sleep(ms: number): Promise<void>;
  requestAnimationFrame(cb: (now: number) => void): unknown;
  /** Switch to stress mode at the target and return the effective target. */
  applyStressTarget(target: number): number;
  setSpawnRate(rate: number): void;
  activeCount(): number;
  startProfiler(): void;
  stopProfiler(): BenchProfileReport | null;
}

export interface BenchRunResult {
  json: string;
  /** Target after capacity clamping — what the run actually aimed for. */
  effectiveTarget: number;
  filled: boolean;
  fillSeconds: number;
  activeAtEnd: number;
  refreshHz: number;
  report: BenchProfileReport;
}

/**
 * Run one benchmark pass. Throws only on profiler failure; a fill that never
 * completes is reported as `filled: false` (band-refused placement is engine
 * truth — see danmaku-core#8), not an error.
 */
export async function runInPageBench(
  deps: BenchDeps,
  target: number,
  onProgress: (progress: BenchProgress) => void,
  labels: {
    filling: (filled: number, target: number) => string;
    settling: () => string;
    calibrating: () => string;
    measuring: () => string;
  },
  frameRate = 240,
): Promise<BenchRunResult> {
  // CTX-0052: calibrate on the idle page before stress fill — the shared
  // bench harness (run-browsers.sh) does this pre-fill so refreshHz is the
  // display's true ceiling (240.22 on this panel), not the workload-limited
  // throughput (153.96 at 10k churning). Previous inpage calibrated at full
  // density after fill+settle, folding 6ms jsBatch into rAF intervals and
  // depressing refreshHz by ~36% (202→153). With the ceiling honest, fps vs
  // refresh and overBudget become comparable across harnesses.
  onProgress({ phase: 'calibrating', detail: labels.calibrating() });
  const refreshHz = await measureCadence(1000, deps.requestAnimationFrame, deps.now);

  const effectiveTarget = deps.applyStressTarget(target);
  deps.setSpawnRate(BENCH_SPAWN_RATE);

  const fillStart = deps.now();
  let filled = false;
  while (deps.now() - fillStart < FILL_TIMEOUT_MS) {
    const active = deps.activeCount();
    if (active >= effectiveTarget) {
      filled = true;
      break;
    }
    onProgress({
      phase: 'filling',
      detail: labels.filling(active, effectiveTarget),
    });
    await deps.sleep(250);
  }
  const fillSeconds = (deps.now() - fillStart) / 1000;

  onProgress({ phase: 'settling', detail: labels.settling() });
  await deps.sleep(SETTLE_MS);

  onProgress({ phase: 'measuring', detail: labels.measuring() });
  deps.startProfiler();
  await deps.sleep(MEASURE_MS);
  const report = deps.stopProfiler();
  if (!report) throw new Error('FrameProfiler produced no report');

  const activeAtEnd = deps.activeCount();
  const json = buildBenchEnvelope({
    name: 'bakudan-inpage-benchmark',
    timestamp: new Date().toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    dpr: window.devicePixelRatio || 1,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    params: {
      stressTarget: effectiveTarget,
      spawnRate: BENCH_SPAWN_RATE,
      settleMs: SETTLE_MS,
      measureMs: MEASURE_MS,
      frameRate,
    },
    refreshHz,
    report,
    filled,
    fillSeconds,
    activeAtEnd,
  });

  return {
    json,
    effectiveTarget,
    filled,
    fillSeconds,
    activeAtEnd,
    refreshHz,
    report,
  };
}
