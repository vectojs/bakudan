# Changelog

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
