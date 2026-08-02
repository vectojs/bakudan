# Selected Danmaku and Adaptive Packing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manually persistent selected-comment controls, local reactions, adaptive mixed-size vertical packing, and actual approximately 60-second curated media to Bakudan.

**Architecture:** `@vectojs/danmaku-core` owns reusable vertical-band allocation and interaction-lock state. Bakudan owns selection orchestration, Canvas2D interaction chrome, accessibility hotspots, stable per-video reaction persistence, and licensed CDN media. Wave 1 runs the core, Bakudan interaction, and media slices in parallel; Wave 2 integrates the released core contract and browser-smokes the complete path.

**Tech Stack:** TypeScript 7, Bun, VectoJS Scene/UI, Canvas2D + WebGL/MSDF, localStorage, HTMLMediaElement, Cloudflare R2, FFmpeg.

---

## File map

### `@vectojs/danmaku-core`

- `src/model/types.ts`: public stable content ID, allocated vertical geometry, and interaction-lock fields.
- `src/model/DanmakuPool.ts`: reset every new field when a slot is recycled.
- `src/model/Scheduler.ts`: preallocated vertical-band occupancy and safe mixed-size assignment.
- `src/model/presets/{scroll,reverse,sine,glitch,repulsion,top,bottom}.ts`: use allocated `baseY` rather than fixed 40px rows.
- `src/model/presets/index.ts`: unchanged public preset map; only source implementations change.

### Bakudan

- `src/model/ReactionStore.ts`: versioned per-video like state with in-memory fallback.
- `src/model/UserDanmakuStore.ts`: persist UUID-backed user comment identity.
- `src/model/demoTimedTrack.ts`: deterministic generated identity and merged user identity.
- `src/model/VideoCatalog.ts`: final R2 URLs and metadata hints for approximately 60-second media.
- `src/view/DanmakuLayer.ts`: selected comment final pass, outline, compact action pill, and geometry helpers.
- `src/view/SelectionHotspots.ts`: two pooled, transparent accessibility action hotspots.
- `src/view/App.ts`: single-selection state machine, reaction/clipboard dispatch, teardown, and mode/source cleanup.
- `src/view/cinemaConfig.ts`: localized Like/Unlike/Copy/Copied/Clipboard unavailable labels.
- `index.html`: no new DOM; existing single-canvas/video stack remains authoritative.

## Wave 1: parallel foundations

### Task 1: Core adaptive vertical-band allocator

**Repository:** `vectojs-native/danmaku/danmaku-core`

**Files:**

- Modify: `src/model/types.ts`
- Modify: `src/model/DanmakuPool.ts`
- Modify: `src/model/Scheduler.ts`
- Modify: `src/model/presets/scroll.ts`
- Modify: `src/model/presets/reverse.ts`
- Modify: `src/model/presets/sine.ts`
- Modify: `src/model/presets/glitch.ts`
- Modify: `src/model/presets/repulsion.ts`
- Modify: `src/model/presets/top.ts`
- Modify: `src/model/presets/bottom.ts`

- [ ] **Step 1: Extend the public slot contract**

Add the following optional content field to `DanmakuParams` and allocated fields to `PoolSlot`:

```ts
export interface DanmakuParams {
  contentId?: string;
  // existing fields remain unchanged
}

export interface PoolSlot {
  baseY: number;
  verticalBandStart: number;
  verticalBandCount: number;
  interactionLocked?: boolean;
  // existing fields remain unchanged
}
```

`baseY` is the preset's neutral text-box top. Band start/count describe the full reserved motion/effect extent and remain stable for the slot lifetime.

- [ ] **Step 2: Reset all allocated and interaction fields**

`DanmakuPool._resetSlot()` must set `baseY`, `verticalBandStart`, and `verticalBandCount` to zero and clear `interactionLocked`. `_createEmptySlot()` initializes the numeric fields. A recycled pool index must never keep another comment's content ID because `params` is replaced by `createDefaultParams()`.

- [ ] **Step 3: Replace fixed lanes with reusable bands**

Use `VERTICAL_BAND_PX = 4` and `VERTICAL_GAP_PX = 2`. Preallocate `BandState[]` on construction/resize; reset fields in place each frame. Compute each request from `fontSize * 1.2`, plus symmetric motion/effect insets. Sine reserves its configured amplitude. Outline, glow, glitch, and rotation receive conservative outsets. The allocator scans top-down except `bottom`, which scans bottom-up.

Each candidate span is safe only if every covered band is either free or passes the existing horizontal minimum-gap and catch-time check. Stress-spawned comments retain round-robin overflow when no safe span exists. `userSpawn()` returns `false` rather than overlapping when no safe span exists.

- [ ] **Step 4: Make spawn parameters precede placement**

Refactor `_spawnOne()` to choose text, font tier, speed, effects, and preset before requesting a span. Store `verticalBandStart`, `verticalBandCount`, and `baseY` on the activated slot, then mark every covered band with the slot's horizontal state.

- [ ] **Step 5: Make presets consume allocated geometry**

`scroll`, `reverse`, and `glitch` set `slot.y = slot.baseY`; `sine` offsets around `slot.baseY`; `repulsion` uses `slot.baseY` as its home. `top` and `bottom` preserve centered X and fade timing but use the scheduler-assigned Y. Remove duplicated `LINE_HEIGHT` and `LANE_GAP` constants from preset files.

- [ ] **Step 6: Isolate interaction-locked slots**

When `interactionLocked` is true, skip preset motion, gravity/Jelly integration, and band occupancy contribution. Do not deactivate a locked selected comment merely because another transform would have moved it. Once unlocked, the next tick resumes from its stored age and allocated base path.

- [ ] **Step 7: Smoke the package contract**

Run:

```bash
bun run build
bunx oxlint --deny-warnings src/model/types.ts src/model/DanmakuPool.ts src/model/Scheduler.ts src/model/presets/*.ts
```

Expected: declarations build, no lint warning, and the public package entry still exports `Scheduler`, `DanmakuPool`, `DanmakuParams`, and `PoolSlot`.

### Task 2: Bakudan selected-comment and reaction foundation

**Repository/worktree:** `vectojs-native/danmaku/bakudan/.worktrees/ctx-0008`

**Files:**

- Create: `src/model/ReactionStore.ts`
- Create: `src/view/SelectionHotspots.ts`
- Modify: `src/model/UserDanmakuStore.ts`
- Modify: `src/model/demoTimedTrack.ts`
- Modify: `src/view/DanmakuLayer.ts`
- Modify: `src/view/App.ts`
- Modify: `src/view/cinemaConfig.ts`

- [ ] **Step 1: Define stable reaction persistence**

Use a versioned key `bakudan:v1:reactions:<encoded-video-id>`. Expose:

```ts
export interface LocalReaction {
  liked: boolean;
  count: number;
}

export class ReactionStore {
  constructor(videoId: string);
  get(commentId: string): LocalReaction;
  toggle(commentId: string): LocalReaction;
  clear(): void;
}
```

Validate parsed objects and non-negative integer counts. Invalid storage for one video is removed without touching other video keys. Keep an in-memory map authoritative for the active session when localStorage reads or writes throw.

- [ ] **Step 2: Assign stable comment identities**

Persist `id: crypto.randomUUID()` on new user comments. For old stored comments without an ID, derive and persist a deterministic migration ID from normalized video ID, timestamp, text, and stable array index. Generate built-in tracks with a PRNG seeded by `videoId + profileId`, then assign `contentId = generated:<profile-id>:<index>` before merging. User entries expose `contentId = user:<uuid>`.

- [ ] **Step 3: Replace hover-only inline actions with selected chrome**

`DanmakuLayer` must accept the selected slot ID and reaction state. Exclude that slot from normal GL/plain/special buckets, draw it last on Canvas2D, add a Signal-colored outline around the text box, and draw a compact rounded pill below the left text edge. The pill contains Like/Unlike plus count and Copy. Clamp the complete selected rectangle to the current stage edges.

Export geometry helpers for body, like, and copy hit regions. Delete the old `ACTION_BTN_WIDTH` right-side strip and make `hitAction()` consume the selected pill geometry.

- [ ] **Step 4: Add pooled accessibility hotspots**

Create exactly two transparent focusable `UIComponent` children, one for Like/Unlike and one for Copy. They render nothing, update role/name/pressed/tabIndex from selection state, and expose at least 44×44 focus geometry around the compact visible controls. Set pointer behavior so App's canvas hit path still owns physical pointer input while AT-synthesized click invokes the same callbacks.

- [ ] **Step 5: Implement the single-selection state machine**

In `App`, store one selected slot ID. Pointer click on an unselected slot selects it; click the selected body, blank stage, or `Escape` releases it; selecting a second slot releases the first atomically. Selection sets `interactionLocked = true` and preserves the current X/Y. Release clears the lock without changing age, speed, preset, or profile data.

Clear selection before seek/reset, source commit, transition to stress mode, slot deactivation, and destroy. Pointer leave must not release or resume a selected slot. Drag and hover behavior remains unchanged for unselected slots.

- [ ] **Step 6: Route Like and Copy through real state**

Like toggles `ReactionStore`, updates `slot.liked`, count, labels, and rendering without dismissing selection. Copy awaits `navigator.clipboard.writeText(slot.params.text)`. Announce `Copied` only after resolution and `Clipboard unavailable` on rejection. Both hotspot and canvas paths call the same methods.

- [ ] **Step 7: Smoke the selected path after the core contract is available**

Run Bakudan, select a moving comment, wait while another passes behind it, toggle Like twice, copy once, release with `Escape`, and select at both viewport edges. Expected: selected X/Y stays fixed, action pill remains below and in bounds, Like survives a video-track reinstall, and no hidden Entity/DOM is created per pool slot.

### Task 3: Actual approximately 60-second curated media

**Repository/worktree:** `vectojs-native/danmaku/bakudan/.worktrees/ctx-0008`

**Files:**

- Modify: `src/model/VideoCatalog.ts`
- Generate only under: `tmp/video-60s/`
- Upload only under: `cdn-vectojs/bakudan/video/`

- [ ] **Step 1: Inspect the five current source durations and codecs**

Use `ffprobe` on every current R2 URL and record duration, dimensions, codec, and pixel format. Preserve each catalog entry's current aspect-ratio purpose and attribution.

- [ ] **Step 2: Build real 60-second MP4 variants**

For sources shorter than 60 seconds, use deterministic stream looping/concatenation and trim to 60 seconds. Encode browser-safe H.264 + AAC where audio exists, `yuv420p`, fast-start metadata, and preserve portrait dimensions. Write every generated file under `tmp/video-60s/`; do not modify repository assets.

- [ ] **Step 3: Upload and verify R2 objects**

Upload each result with:

```bash
wrangler r2 object put cdn-vectojs/bakudan/video/<name>-60s.mp4 \
  --file tmp/video-60s/<name>-60s.mp4 \
  --content-type video/mp4 \
  --remote -y
```

Verify the public origin returns HTTP 200, `content-type: video/mp4`, `accept-ranges: bytes`, permissive read-only CORS, and metadata duration between 59.5 and 60.5 seconds.

- [ ] **Step 4: Cut the catalog to verified URLs**

Update all five URLs and `durationHint` values only after public verification. Keep current IDs, titles, track defaults, aspect ratios, test tags, attribution, and rollback semantics unchanged so persisted video-scoped state remains valid.

## Wave 2: integration after Wave 1 barrier

### Task 4: Release and consume the core contract

**Files:**

- Modify in core: `package.json`, `CHANGELOG.md`, `.changeset/<generated-name>.md`
- Modify in Bakudan: `package.json`, `bun.lock`

- [ ] **Step 1: Review the core diff against the approved contract**

Confirm no Bakudan copy, UI, localStorage, Canvas, or DOM dependency entered `@vectojs/danmaku-core`; verify fixed-row constants no longer control adaptive presets; verify interaction-locked slots skip all showcase mutation.

- [ ] **Step 2: Build, package, and release a SemVer minor**

Publish the reviewed core release through the repository's tag-triggered workflow. Confirm the registry tarball exposes the new type declarations before changing Bakudan.

- [ ] **Step 3: Install the exact released version in Bakudan**

Update the exact dependency, regenerate `bun.lock`, and remove any temporary type casts or local package links used during parallel work.

- [ ] **Step 4: Smoke the complete product path**

Launch production-equivalent Bakudan at 1440×900 and 390×844. Exercise video load, selection, Like/Unlike, Copy success/failure, Escape/blank release, source switch, stress switch, mixed 18/24/30px density, Lab Drawer, and 20K target selection. Verify all five videos report actual approximately 60-second metadata.

The permanent test additions, changesets, repository-wide gates, and release cleanup are intentionally gated until this smoke demonstrates the integrated behavior works.
