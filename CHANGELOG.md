# Changelog

## 0.7.0 - 2026-08-27

### Added

- **Hybrid HTML shell** — `body.hybrid` CSS Grid with `#stage-container` island. `Scene` now mounts with `disableWindowResize:true` + `ResizeObserver` per `Scene.ts:269,2967`, so the stage fills the Grid cell rather than the viewport. Header (`src/view/html/HeaderBar.ts`), command deck (`src/view/html/CommandDeck.ts`) and lab drawer (`src/view/html/lab/*` 5 tabs) are vanilla HTML/CSS — no kit UI chrome for chrome — while `DanmakuLayer` remains the single-Entity batch (z0 video → z1 WebGL/MSDF → z2 Canvas2D special).
- **App decomposition** — `src/view/app/{types,AppVideo,AppLayout,AppPointer,AppSelection,AppBenchmark}.ts` extracts 1200 lines from `App.ts:1810`; `App.ts` stays as facade for `happy-dom` tests, future wiring to `app/*` deferred to `CTX-0030` cleanup.

### Changed

- **Chrome is HTML, stage is canvas** — status fps/backend, transport (play/timeline/rate/input+Send/Lab), and lab `Videos/Throughput/Interactions/Benchmark/DevTools` are now semantic HTML with native `role`/`aria-live` and mobile two-row deck via media query. Lab sheet is `position:fixed 46vh desktop / 69vh mobile` with `transform` spring.
- **Layout is CSS** — `src/styles/{shell,header,command,lab}.css` replace 900 lines of hand-rolled `_layoutCinema`/`_hitsOverlay`/`debugHitsLab` canvas math; `onResize` now reads `stageContainer.getBoundingClientRect()` instead of `window.innerWidth`.
- **Peer kit** — `@vectojs/danmaku-kit:0.8.0` kept exact for canvas fallback, added `peer ^0.8.0 optional:true` (chrome no longer requires `kit/ui`).

### Fixed

- **Overlay hit-test drift** — drawer/command hit regions now read `getBoundingClientRect()`/`getLayoutInfo()` instead of breakpoint guesses (stageH-500 was 236px off at 1600px).
- **Destroy / showOverlay double-add** — `destroy()` and `_buildUI` now branch on `labDrawer` vs `labDrawerHTML` and `statusBar` vs `headerBar`, `commandDeck` vs `commandDeckHTML`; `setLabOpen`/`setActiveLabTab` and `getCinemaLayoutSnapshot` handle both.

### Performance

- **200 tests / 52 modules** — `bun test` 200 pass (was 167 + 6 fail), `vite build` 17.26kB CSS + 477kB JS (gzip 3.18kB + 137kB). `lighthouse --preset=desktop` **98/96/100/91** (perf/a11y/bp/seo) vs shell adds no per-frame JS.



## 0.6.0 - 2026-08-24

### Added

- **Fullscreen mode**: press `f` (or `F`) to toggle fullscreen; state
  re-synchronizes on `fullscreenchange`, failures are announced through the
  status region, and labels ship in all five languages.
- **Paused micro-chip**: hovering a danmaku in stress mode now shows a
  localized "paused" chip pinned to its top-right corner instead of an
  anonymous gray veil.
- **Complete zh-TW / ja / ko labels**: Traditional Chinese no longer falls
  back to simplified characters and Japanese/Korean no longer fall back to
  English.

### Changed

- **Sharper HiDPI rendering**: the backing store now renders at up to
  `min(devicePixelRatio, 2)` instead of a fixed 1x, so canvas text stays
  crisp on HiDPI displays and under browser zoom; fallback-rasterized text
  (emoji, out-of-atlas glyphs, user-sent) re-keys to the live pixel ratio.
- **Steady idle cadence**: render-on-demand idle now holds core's default
  60fps floor instead of sleeping at 2fps; engine pins updated to
  `@vectojs/core` 1.38.1, `@vectojs/ui` 2.19.2, `@vectojs/devtools` 0.11.1.
- **Coherent visual chrome**: selection outlines, hover veils, and the
  action bar paint from shared DANMAKU_CHROME theme tokens with a single
  rose accent and one radius scale; the status/action-bar surface is fully
  opaque; raised controls (Play/Lab/rate/inputs) gained contrast;
  success/warning pills neutralized to slate so only loading and error
  carry color signals.

### Fixed

- **Selection & action bar rebuilt**: liking works again (reactions now key
  on text), the action bar no longer turns invisible and unclickable after
  being dismissed, Escape dismisses even while a pill button holds focus,
  taps survive a resting pointer, overlapping danmaku are picked in paint
  order rather than slot order, hover resumes after moving off the bar, and
  selecting freezes the danmaku with the bar anchored until it expires or
  is dismissed.
- **Pointer coordinates at DPR > 1**: hit-testing (hover, click-select,
  pill actions, drag, overlay routing) scaled client pixels by the
  backing-store ratio, so on HiDPI every hit landed below-right of the
  cursor and hover missed entirely; pointers now map to world units.
- **Status bar gap**: the status bar sat 16px below the visual-viewport
  top, letting video and danmaku pass behind it; it is pinned flush to the
  top.

### Performance

- **Stress fps regression fixed**: the paused chip paid an uncached
  `measureText` per hovered slot per pass (~103k calls in 3s on the 5,000
  pool, halving fps); plate width is memoized per label - stress at 5,000
  returns to the vsync target from ~120fps p50.

## 0.5.0

### Performance — WebGL/MSDF GPU text path (the real 5,000-danmaku fix)

- **5,000 danmaku now run at ~130fps, up from ~28fps** (measured on an RTX 4060
  at 2560×1600, real `requestAnimationFrame` cadence). This is the fix the
  v0.4.0 glyph-bitmap cache could not deliver: the true bottleneck was never
  text _shaping_, it was **per-danmaku draw calls + overdraw fill-rate**.
  Swapping 5,000 `fillText` for 5,000 `drawImage` (v0.4.0) changed nothing
  because both issue 5,000 draws over the same overlapping pixels. Routing
  glyphs through the stacked WebGL layer batches the **entire frame into ~1 GPU
  draw call**, which un-starves the GPU (previously idle at ~20–34% util).
- **How**: enable `Scene`'s `pointBackend:'webgl'`; load a committed MSDF atlas
  (`public/msdf/atlas.{png,json}`, generated by `scripts/gen-msdf-atlas.mjs`
  from Noto Sans CJK SC — 430 glyphs covering the ContentLibrary + printable
  ASCII); `DanmakuLayer` lays each run out with `MSDFFont.layout` (cached per
  `text×fontSize`) and pushes quads via `scene.pointRenderer.addGlyph`.
- **Fallbacks (Canvas2D glyph-bitmap cache)**: emoji (color glyphs, not MSDF),
  any out-of-atlas user-typed glyph, and user-sent danmaku (so their highlight
  box stays behind the text). Verified A/B in one session: GL 134fps vs
  Canvas2D fallback 28fps at 5,000.
- **Layer restructure for correct z-order**: the background moved off the shared
  2D canvas to its own DOM layer (`#bakudan-bg`, z0) — a CSS gradient for
  ambient mode and a real `<video>` element for video mode (which also removes
  a full-screen per-frame `drawImage`). Stack is now background (z0) → WebGL
  danmaku (z1) → Canvas2D special-pass danmaku + HUD/panel UI (z2), so danmaku
  correctly sit above the background but below the UI. Video-track sync is
  unchanged (reads the same `<video>` `currentTime`/`seek`/`play`/`pause`).
- Automatically falls back to the full Canvas2D path if WebGL2 is unavailable.

## 0.4.0

### Performance — glyph-bitmap cache (the 5,000-danmaku bottleneck)

- **Text is now blitted, not re-shaped, every frame.** At 5,000 danmaku the
  dominant cost was 5,000 native `ctx.fillText()` calls per frame — each one
  re-shapes the string, re-parses the CSS color, and rasterizes glyphs on the
  CPU main thread. A GPU profile showed the card starved and downclocked while
  the main thread was pegged in native (`(program)`) code; a fixed-font
  reference impl hit 58fps precisely because it avoided per-draw font/color
  churn. The batched pass now rasterizes each distinct `(text, fontSize, color)`
  run to a small offscreen canvas exactly once (`TextBitmapCache`), then every
  subsequent frame draws it with a single GPU `drawImage`. This converts CPU
  text shaping into a bitmap copy — exactly what a GPU-starved frame needs.
- **Bounded, self-converging cache.** The stress pool samples a fixed ~177-string
  library across 3 font tiers and 8 colors, so the key space is bounded
  (~4.2k entries) and the steady-state hit rate approaches 100%. User-submitted
  danmaku add unbounded keys, so an insertion-order eviction cap (6,000 entries)
  keeps memory sane. Rasterization uses true glyph metrics
  (`actualBoundingBox*`) so emoji/ascender/descender overshoot never clips.
- **HUD now reports the glyph-cache hit rate** ("Glyph Cache … % hit") instead
  of the old width-measure cache — the more meaningful signal for this workload.
- Falls back to direct `fillText` when no bitmap can be produced (headless /
  non-DOM context), so behavior is unchanged where canvas rasterization is
  unavailable.

## 0.3.0

### Laboratory correctness + per-danmaku effects

- **Per-danmaku effects (brush model)**: toggling an effect in the panel now
  changes what NEW danmaku are born with; danmaku already on screen keep the
  effects they spawned with. Different effect types coexist on screen instead
  of a single global flag retro-applied to everything. Effects are stamped at
  spawn via `Scheduler.activeEffects`.
- **`gradient` effect implemented**: was a no-op (UI toggle did nothing).
  Danmaku now render with a vertical two-stop gradient (own color → warm gold).
- **`top`/`bottom` danmaku no longer immortal**: both presets omitted
  `slot.age += dt`, so their fade/exit logic never triggered and they piled up
  forever at screen center. Fixed — they now fade and cull like every preset.
- **User-sent highlight box restored**: the `userSent` flag rode on `params`
  but the batch layer reads `slot.userSent`, which was never set, so the
  highlight box never drew. `userSpawn` now propagates it onto the slot.
- **Paused seek repaints**: scrubbing the video timeline while paused left a
  stale frame (idle loop never redrew). `_onSeek` now marks the scene dirty.

### Performance

- **Uniform stress-spawn opacity**: stress danmaku spawned with a per-danmaku
  random alpha (0.8–1.0), forcing a `ctx.globalAlpha` change before nearly
  every `fillText` in the batch loop and breaking the Canvas2D text fast path.
  Stress danmaku now use opacity 1; fade-driven alpha (top/bottom) still runs
  in the low-count special pass.

### UI

- **Control panel spacing**: larger card padding/gaps (8→12, 12→16) and content
  insets so labels, sliders, dropdowns, and checkboxes have breathing room at
  100% zoom.
- **Honest HUD**: the engine-state line no longer hard-codes "(60fps)" — the
  real frame rate is already shown on the FPS line above it.

## 0.2.0

### Rendering architecture: single batch-painting danmaku layer

Replaced the per-danmaku scene-node model (one `Entity` per danmaku, up to
5,000 nodes added to the `Scene`) with a single `DanmakuLayer` node that
batch-paints the entire stress pool in one immediate-mode `render()` pass. The
scene walk now visits one node instead of ~5,003, eliminating per-node
transform composition, bounds allocation, `save()/restore()`, and culling
bookkeeping.

- **Per-danmaku interaction state** (`hovered`/`liked`/`dragging`/`userSent`)
  moved from the removed `DanmakuEntity` onto `PoolSlot`. Pointer hit-testing,
  hover, and drag now operate directly on pool slots.
- **Font-tier quantization**: stress-spawned danmaku use three discrete font
  sizes (18/24/30) instead of a continuous 16–36 range. Canvas2D re-shapes
  text and rasterizes glyphs per `ctx.font` value, so a continuous range
  thrashed the glyph cache at high counts. `DanmakuLayer` batches draws by
  font tier, setting `ctx.font` once per tier per frame.
- **Frustum culling fixed**: the previous cull read `scheduler.stageW`/`stageH`
  which never existed (always `undefined`), so nothing was culled. Added the
  getters and moved culling inline into the layer's draw loop.
- **Higher frame-rate ceiling**: `maxFPS` raised from 60 to 240 so the bench
  reflects the display's true refresh rate rather than an artificial cap.

Result: ~5,000 concurrent danmaku render at frame rates on par with a
hand-written zero-abstraction Canvas2D reference, while retaining VectoJS
scene composition, the accessible UI component overlay, and the a11y live
region — none of which the raw reference provides.

## 0.1.0

Initial danmaku stress-test playground.
