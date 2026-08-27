import { describe, expect, it } from 'bun:test';
import {
  buildBenchEnvelope,
  measureCadence,
  runInPageBench,
  type BenchDeps,
  type BenchProfileReport,
} from '../src/model/InPageBench';

/** Drive measureCadence with a scripted rAF: each entry is one frame's timestamp. */
async function cadenceFrom(intervalsMs: number[]): Promise<number> {
  const stamps: number[] = [0];
  for (const interval of intervalsMs) stamps.push(stamps[stamps.length - 1]! + interval);
  let index = 1;
  // The budget equals the last stamp, so the final scripted frame terminates
  // the loop — a script that runs dry before the deadline would never resolve.
  return measureCadence(
    stamps[stamps.length - 1]!,
    (cb) => {
      if (index < stamps.length) cb(stamps[index++]!);
    },
    () => 0,
  );
}

describe('measureCadence', () => {
  it('means hitch-filtered rAF intervals: a missed vsync is dropped, not averaged in', async () => {
    // 240Hz period 4.1667ms with one 3x hitch; the hitch must not drag the
    // estimate down (that would inflate every derived expected-frame count).
    const period = 1000 / 240;
    const hitches = await cadenceFrom([period, period, period * 3, period, period]);
    expect(hitches).toBeCloseTo(1000 / ((period * 4) / 4), 0);
  });

  it('reports 0 when no frames arrive at all', async () => {
    expect(await cadenceFrom([])).toBe(0);
  });
});

const REPORT: BenchProfileReport = {
  frames: 1903,
  fps: { mean: 238.4, p5: 240, p50: 240 },
  frameTimeMs: { p50: 4.17, p95: 4.17, p99: 8.35 },
  overBudget: { pct: 3.18 },
  phasesMs: { 'draw.jsBatch': { p50: 0.86, p95: 1.2, max: 3.1 } },
};

function fakeDeps(overrides: Partial<BenchDeps> = {}): {
  deps: BenchDeps;
  calls: string[];
} {
  const calls: string[] = [];
  let active = 0;
  let clock = 0;
  const deps: BenchDeps = {
    // The clock advances 1s per read: the fill loop polls once per 250ms
    // sleep, so ~150 reads exhaust the 150s deadline without real waiting.
    now: () => (clock += 1000),
    sleep: async () => {
      calls.push('sleep');
      // Each sleep advances the fill: 250ms per tick at 2000/s = 500/tick.
      active = Math.min(5000, active + 500);
    },
    // One 1s frame per registration: the delta is filtered as a hitch, so
    // calibration resolves to 0 — fine for the orchestrator, which only
    // forwards the number into the envelope.
    requestAnimationFrame: (cb) => {
      cb((clock += 1000));
    },
    applyStressTarget: (target) => {
      calls.push(`stress:${target}`);
      return Math.min(target, 5000);
    },
    setSpawnRate: (rate) => void calls.push(`rate:${rate}`),
    activeCount: () => active,
    startProfiler: () => void calls.push('profiler:start'),
    stopProfiler: () => {
      calls.push('profiler:stop');
      return REPORT;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('runInPageBench', () => {
  it('fills, settles, calibrates, measures, and returns an envelope', async () => {
    const { deps, calls } = fakeDeps();
    const phases: string[] = [];
    const result = await runInPageBench(deps, 5000, (p) => void phases.push(p.phase), {
      filling: (filled, target) => `fill ${filled}/${target}`,
      settling: () => 'settle',
      calibrating: () => 'cal',
      measuring: () => 'measure',
    });
    expect(result.filled).toBe(true);
    expect(result.effectiveTarget).toBe(5000);
    expect(result.activeAtEnd).toBe(5000);
    expect(calls[0]).toBe('stress:5000');
    expect(calls[1]).toBe('rate:2000');
    expect(calls).toContain('profiler:start');
    expect(calls).toContain('profiler:stop');
    // CTX-0052: calibrating moved to idle before fill so refreshHz is the true display ceiling (240), not workload-limited 153 at 10k.
    expect(phases[0]).toBe('calibrating');
    expect(phases[1]).toBe('filling');
    expect(phases.at(-1)).toBe('measuring');
    const parsed = JSON.parse(result.json) as { summary: { fpsP50: number } };
    expect(parsed.summary.fpsP50).toBe(240);
  });

  it('reports filled=false when the pool never reaches the target', async () => {
    // now() advances 1s per call so the 150s fill deadline expires after ~150
    // polls while activeCount stays pinned below target.
    let ticks = 0;
    const { deps } = fakeDeps({
      now: () => (ticks += 1000),
      sleep: async () => {},
    });
    const result = await runInPageBench(deps, 20000, () => {}, {
      filling: () => '',
      settling: () => '',
      calibrating: () => '',
      measuring: () => '',
    });
    expect(result.filled).toBe(false);
    expect(result.activeAtEnd).toBeLessThan(20000);
  });

  it('throws when the profiler produces no report', async () => {
    const { deps } = fakeDeps({ stopProfiler: () => null });
    await expect(
      runInPageBench(deps, 5000, () => {}, {
        filling: () => '',
        settling: () => '',
        calibrating: () => '',
        measuring: () => '',
      }),
    ).rejects.toThrow('FrameProfiler');
  });
});

describe('buildBenchEnvelope', () => {
  it('carries environment, params, summary, and the single row', () => {
    const json = buildBenchEnvelope({
      name: 'bakudan-inpage-benchmark',
      timestamp: '2026-08-26T00:00:00.000Z',
      url: 'https://bakudan.vectojs.org/',
      userAgent: 'test-agent',
      hardwareConcurrency: 24,
      dpr: 1.6,
      viewport: { width: 1587, height: 863 },
      params: {
        stressTarget: 5000,
        spawnRate: 2000,
        settleMs: 1500,
        measureMs: 8000,
      },
      refreshHz: 240.123456,
      report: REPORT,
      filled: true,
      fillSeconds: 2.5,
      activeAtEnd: 5000,
    });
    const parsed = JSON.parse(json) as Record<string, never>;
    expect(parsed['schemaVersion']).toBe(1);
    expect((parsed['environment'] as { refreshHz: number }).refreshHz).toBe(240.12);
    expect((parsed['summary'] as { overBudgetPct: number }).overBudgetPct).toBe(3.18);
    expect((parsed['rows'] as unknown[]).length).toBe(1);
  });

  it('exports a null overBudget rather than dropping the field', () => {
    const json = buildBenchEnvelope({
      name: 'n',
      timestamp: 't',
      url: 'u',
      userAgent: 'ua',
      hardwareConcurrency: null,
      dpr: 1,
      viewport: { width: 0, height: 0 },
      params: { stressTarget: 1, spawnRate: 1, settleMs: 1, measureMs: 1 },
      refreshHz: 60,
      report: { ...REPORT, overBudget: null },
      filled: false,
      fillSeconds: 0,
      activeAtEnd: 0,
    });
    const parsed = JSON.parse(json) as { summary: { overBudgetPct: unknown } };
    expect('overBudgetPct' in parsed.summary).toBe(true);
    expect(parsed.summary.overBudgetPct).toBeNull();
  });
});
