/**
 * FrameProfiler — collects a per-frame time series on demand, so a real-hardware
 * frame-pacing question can be answered with a distribution instead of a
 * glanced-at instantaneous FPS number.
 *
 * Why this exists: the HUD's FPS readout is a 500ms rolling average, which hides
 * jitter. On a 240Hz panel (4.17ms budget) an average of "117 FPS / 8.6ms" can
 * mean steady 2x-over-budget frames, or it can mean frames swinging between
 * 7 and 10ms — those have different causes and different fixes, and the average
 * cannot distinguish them. This records every frame delta, then reports
 * percentiles, the worst frames, and a histogram.
 *
 * Deliberately dependency-free and allocation-light while recording: it writes
 * into a pre-sized Float64Array so profiling does not itself create the GC
 * pressure it is trying to measure.
 */

export interface FrameProfileReport {
  /** Wall-clock ISO timestamp the run finished. */
  timestamp: string;
  durationMs: number;
  frames: number;
  /** Display refresh rate if the browser exposes it, else null. */
  screenHz: number | null;
  /** Frame budget implied by `screenHz` (1000/hz), else null. */
  budgetMs: number | null;
  devicePixelRatio: number;
  viewport: { w: number; h: number };
  /** Scene/app context so a report is interpretable months later. */
  context: {
    activeDanmaku: number;
    ratePerSec: number | null;
    /** Configured target count, vs `activeDanmaku` which is what's on screen. */
    targetCount: number | null;
    mode: string | null;
    glyphCacheHitPct: number | null;
    heapUsedMB: number | null;
    userAgent: string;
  };
  frameTimeMs: {
    mean: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    /** Standard deviation — the direct measure of the jitter being chased. */
    stdDev: number;
  };
  fps: { mean: number; p50: number; p5: number };
  /** Fraction of frames that exceeded the display budget. */
  overBudget: { count: number; pct: number } | null;
  /** The 10 worst frames, to spot GC or decode spikes. */
  worstFramesMs: number[];
  /** Frame-time histogram: label → count. */
  histogram: Record<string, number>;
}

const MAX_FRAMES = 4000;

export class FrameProfiler {
  private samples = new Float64Array(MAX_FRAMES);
  private count = 0;
  private startedAt = 0;
  private running = false;

  /** Supplied by the app so the report carries scene context. */
  constructor(private readonly readContext: () => FrameProfileReport['context']) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Frames captured so far — for a live "recording…" readout. */
  get captured(): number {
    return this.count;
  }

  start(): void {
    this.count = 0;
    this.startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    this.running = true;
  }

  /** Called once per frame with the frame delta in ms. */
  record(dtMs: number): void {
    if (!this.running) return;
    // Drop the first frame: it includes the click handler and start-up cost.
    if (this.count === 0 && dtMs > 100) return;
    this.samples[this.count++] = dtMs;
    if (this.count >= MAX_FRAMES) this.running = false;
  }

  /** Stop recording and compute the report. Returns null if nothing usable. */
  stop(): FrameProfileReport | null {
    this.running = false;
    if (this.count < 10) return null;

    const n = this.count;
    const sorted = Array.from(this.samples.subarray(0, n)).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))]!;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / n;

    const hz = this.screenHz();
    const budget = hz ? 1000 / hz : null;
    const over = budget === null ? null : sorted.filter((v) => v > budget).length;

    // Histogram buckets chosen around the high-refresh budgets that matter
    // (4.17ms @240Hz, 6.94 @144, 8.33 @120, 16.7 @60).
    const edges = [2, 4.17, 6.94, 8.33, 11.1, 16.7, 33.3];
    const labels = [
      '<2ms',
      '2-4.17ms (>=240fps)',
      '4.17-6.94ms (144-240)',
      '6.94-8.33ms (120-144)',
      '8.33-11.1ms (90-120)',
      '11.1-16.7ms (60-90)',
      '16.7-33.3ms (30-60)',
      '>33.3ms (<30fps)',
    ];
    const histogram: Record<string, number> = {};
    for (const l of labels) histogram[l] = 0;
    for (const v of sorted) {
      let bucket = edges.length;
      for (let i = 0; i < edges.length; i++) {
        if (v < edges[i]!) {
          bucket = i;
          break;
        }
      }
      histogram[labels[bucket]!] = (histogram[labels[bucket]!] ?? 0) + 1;
    }

    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      timestamp: new Date().toISOString(),
      durationMs: round(
        (typeof performance !== 'undefined' ? performance.now() : 0) - this.startedAt,
      ),
      frames: n,
      screenHz: hz,
      budgetMs: budget === null ? null : round(budget),
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      viewport:
        typeof window === 'undefined'
          ? { w: 0, h: 0 }
          : { w: window.innerWidth, h: window.innerHeight },
      context: this.readContext(),
      frameTimeMs: {
        mean: round(mean),
        p50: round(at(0.5)),
        p95: round(at(0.95)),
        p99: round(at(0.99)),
        min: round(sorted[0]!),
        max: round(sorted[n - 1]!),
        stdDev: round(Math.sqrt(variance)),
      },
      fps: {
        mean: round(1000 / mean),
        p50: round(1000 / at(0.5)),
        // p5 of FPS is the SLOW tail, so it comes from the p95 frame time.
        p5: round(1000 / at(0.95)),
      },
      overBudget: over === null ? null : { count: over, pct: round((over / n) * 100) },
      worstFramesMs: sorted.slice(-10).reverse().map(round),
      histogram,
    };
  }

  /**
   * Display refresh rate, MEASURED rather than queried. `screen.refreshRate` is
   * non-standard and absent in Chrome (verified), so it is inferred from the
   * fastest frames actually observed: the shortest deltas are vsync-limited, so
   * the 5th-percentile frame time approximates one refresh interval. Snapped to
   * a known panel rate when it lands close, since a slightly-off budget makes
   * the over-budget percentage misleading.
   */
  private screenHz(): number | null {
    if (this.count < 30) return null;
    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    // 5th percentile of frame time ~= one vsync interval (the frames that had
    // nothing to wait for beyond the display).
    const fastest = sorted[Math.floor(0.05 * this.count)]!;
    if (!(fastest > 0)) return null;
    const raw = 1000 / fastest;
    for (const known of [240, 165, 144, 120, 90, 75, 60, 30]) {
      if (Math.abs(raw - known) / known < 0.12) return known;
    }
    return Math.round(raw);
  }
}
