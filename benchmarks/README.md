# Benchmarks

Real-headed-browser benchmarks for bakudan, driven by the shared VectoJS
harness (`vectojs/benchmarks/run-browsers.sh`). Only numbers produced by that
runner are quotable — it owns window focus, a dedicated Hyprland workspace per
engine, Firefox's `layout.frame_rate` pref, fresh profiles, and the cadence
gate. CLI-driven or headless figures are not comparable and have historically
been wrong by up to 4x for Firefox.

## `stress-baseline/` — dual-engine stress baseline (CTX-0020)

Mounts the real `App`/`Scene` in stress mode at a parameterized pool count,
fills the pool, then reports the app's own `FrameProfiler` distribution
(fps p50/mean/p5, frame-time p50/p95/p99, over-budget %, per-phase costs:
`scheduler.tick`, `layer.cullBucket`, `draw.jsBatch`, `gpu.flush`) through the
shared result envelope with measured `refreshHz`, viewport/DPR, engine UA and
runId.

### The seam

`?stress=<n>` in the app URL enters stress mode after boot via
`App.applyStressTarget(n)` — the same method the throughput panel's target
slider drives (`src/view/App.ts`). The bench passes it as a runner param:

```bash
# from this repo root; VECTOJS_WORKSPACE must point at the workspace container
bun run benchmarks/stress-baseline/build.ts
VECTOJS_WORKSPACE=$PWD/../../.. \
  /mnt/data/Workspace/Projects/vectojs/vectojs/benchmarks/run-browsers.sh \
  "$PWD/benchmarks/stress-baseline" 8411 chrome firefox \
  --viewport 1280x720 --iterations 7 --param stress=5000
```

Arms: `--param stress=5000|10000|20000`. One invocation = one arm × both
engines × N iterations; the runner aggregates median/p90/MAD across processes
into `results/aggregate/`. Machine must be quiet (`loadavg < ~2`); record
loadavg beside any quoted figure.

### Why build.ts is not the monorepo's shared bundler

The shared `_shared/build.ts` redirects every bare `@vectojs/*` import to the
monorepo's **workspace source**. bakudan exact-pins published npm versions
(`@vectojs/core` 1.38.1, `@vectojs/ui` 2.19.2, `@vectojs/danmaku-core` 0.3.0,
`@vectojs/danmaku-kit` 0.8.0) and must measure what an external user
experiences, so this build uses plain node_modules resolution. It still shares
the envelope/cadence client by aliasing `vectojs-bench-client` →
`vectojs/benchmarks/_shared/client.ts` (located via `$VECTOJS_BENCH_SHARED` or
`$VECTOJS_WORKSPACE`), never a copy.

### Measurement shape

1. Production startup parity: `Scene(maxFPS: 240, maxDPR: min(dpr,2),
pointBackend 'webgl', a11ySyncInterval 100)`, `renderMode 'always'`.
2. `applyStressTarget(n)`; spawn rate held at the panel-max 2000/s for fill
   AND measurement (the default 300/s cannot sustain large pools against
   scroll-out exits — measured: a 2000 target settled at 1876 alive when
   restored; with ample inflow the scheduler tops up each deficit instantly,
   so steady state is exactly N alive).
3. Cadence gate runs **after** fill: the app idles at a deliberate ~60Hz
   (DEC-0001), so gating on an empty scene would time out by construction.
   For frame-bound arms (e.g. 20k) the gate honestly times out and the
   envelope carries that issue.
4. `calibrateRefreshRate()` under steady stress → `refreshHz` is the
   achievable ceiling this run was measured against.
5. 8s measured window; remote webfonts deliberately not loaded (no network
   weather in a baseline; both engines use their default sans fallback).

### Archived baselines

Raw JSON envelopes live in `vectojs-docs/forge/baselines/
bakudan-stress-<engine><majorver>-2026-08-24.json` (first quotable baseline;
all prior figures were single-engine CLI-driven prose — see
bakudan-docs/TODO.md PR #26).
