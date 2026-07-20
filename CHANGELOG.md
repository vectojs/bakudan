# Changelog

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
