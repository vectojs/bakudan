# Bakudan Cinema Overlay and Laboratory UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Bakudan's generic peach settings UI with a video-first Cinema Overlay: normal viewing stays quiet, controls collapse into a bottom Command Deck, and all experiments live in an on-demand Lab Drawer.

**Architecture:** The Scene remains the only application UI surface. Reusable `DanmakuStatusBar`, `DanmakuCommandDeck`, `DanmakuLabDrawer`, and Lab panels come from `@vectojs/danmaku-kit` and consume injected app state, labels, theme, and callbacks. `App` owns state transitions and responsive geometry; panels own controls, not engine behavior. `DanmakuLayer` remains one VMT entity for up to 20K slots and reads engine Jelly scalars directly. `@vectojs/devtools` and the app plugin remain debug-only dynamic imports.

**Tech Stack:** VectoJS Scene/Entity, `@vectojs/ui`, `@vectojs/danmaku-core`, `@vectojs/danmaku-kit`, Canvas2D + batched WebGL/MSDF, TypeScript 7, Bun test, Vitest DevTools tests, Chromium/Firefox real-browser acceptance

---

## Dependencies

Complete the video catalog/profile plan first. Then execute `2026-08-01-danmaku-kit-package.md` and publish the reusable package. Complete and publish the danmaku-core Jelly plan before Task 7. Bakudan updates both packages to exact released versions; never patch `node_modules` or add an unpublished file dependency.

### Package ownership amendment

The reusable-package plan supersedes local file ownership in Tasks 2–7 below:

| Cinema component/model | Final owner |
| --- | --- |
| TrackProfile contracts and builder | `@vectojs/danmaku-kit/model` |
| TopStatusBar | `@vectojs/danmaku-kit/ui` as `DanmakuStatusBar` |
| CommandDeck | `@vectojs/danmaku-kit/ui` as `DanmakuCommandDeck` |
| LabDrawer and generic panel contracts | `@vectojs/danmaku-kit/ui` |
| Videos/Throughput/Interactions/DevTools info panels | `@vectojs/danmaku-kit/ui` |
| Bakudan theme/labels/catalog/profile values | Bakudan |
| App, StageBackground, DanmakuLayer, persistence, DevTools plugin | Bakudan |

Where a task below says to create a reusable component under `src/view`, implement and test its generic counterpart in the package plan, then make the Bakudan task an integration/cutover task. Do not deliver duplicate local implementations or compatibility re-exports.

### Task 1: Establish a single Cinema visual system and state contract

**Files:**

- Create: `src/view/theme.ts`
- Create: `src/view/viewState.ts`
- Create: `test/ViewState.test.ts`
- Modify: `index.html`

- [ ] **Step 1: Write failing view-state invariant tests**

Create `test/ViewState.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { initialViewState, normalizeViewState } from '../src/view/viewState';

describe('view state', () => {
  it('starts video-first with a collapsed laboratory', () => {
    const state = initialViewState();
    expect(state.mode).toBe('video');
    expect(state.labOpen).toBe(false);
    expect(state.activeLabTab).toBe('videos');
  });

  it('clamps throughput target to the active pool capacity', () => {
    const state = normalizeViewState(
      { ...initialViewState(), targetCount: 30_000 },
      { poolCapacity: 20_000 },
    );
    expect(state.targetCount).toBe(20_000);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
bun test test/ViewState.test.ts
```

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Define the approved visual tokens once**

Create `src/view/theme.ts`:

```ts
export const THEME = Object.freeze({
  ink: '#090c12',
  inkRaised: 'rgba(16, 21, 31, 0.94)',
  smoke: 'rgba(26, 33, 45, 0.88)',
  smokeSoft: 'rgba(31, 41, 55, 0.72)',
  line: 'rgba(148, 163, 184, 0.22)',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  coral: '#fb7185',
  coralHover: '#f43f5e',
  signalBlue: '#60a5fa',
  warning: '#fbbf24',
  danger: '#fb7185',
  success: '#34d399',
  radius: 14,
  fontUi: "500 13px 'Inter', system-ui, sans-serif",
  fontLabel: "600 11px 'Inter', system-ui, sans-serif",
  fontDisplay: "600 14px 'Outfit', 'Inter', sans-serif",
  fontMono: "500 11px 'JetBrains Mono', monospace",
});
```

No component may introduce a second hard-coded palette. Forced-colors branches may use CSS system color names because they are an accessibility mode, not a theme.

- [ ] **Step 4: Define normalized app-facing UI state**

In `viewState.ts`, define `LabTab = 'videos' | 'throughput' | 'interactions' | 'devtools'`, playback/load/error state, profile/target/rate state, and effect toggles. `initialViewState()` returns video mode, collapsed Lab Drawer, Videos tab, paused default source, and a 5K target. `normalizeViewState` clamps counts/rates and clears impossible drag/hover selections.

Keep callbacks separate in `ViewActions`; do not put Entity references or functions into serializable state.

- [ ] **Step 5: Update page metadata and the only allowed DOM styling**

In `index.html`:

- Change title/description to “Bakudan — Video Danmaku Laboratory”.
- State “up to 20,000 concurrent danmaku” instead of 5,000 at 60fps.
- Change `--bg-color` to `#090c12`.
- Keep the DOM limited to the background host, `<video>`, and one app `<canvas>` plus VectoJS's runtime layers.
- Change `#bakudan-bg > video` to `object-fit: contain` and give the host a black background so portrait clips letterbox instead of distort.

- [ ] **Step 6: Format, test, and commit**

```bash
bun run format
bun test test/ViewState.test.ts
bun run format:check
bun run lint

git add src/view/theme.ts src/view/viewState.ts test/ViewState.test.ts index.html
git commit -m "feat: define Cinema Overlay state and theme"
```

### Task 2: Build the low-noise Top Status Bar

**Files:**

- Create: `src/view/TopStatusBar.ts`
- Create: `test/TopStatusBar.test.ts`

- [ ] **Step 1: Write failing semantic and update tests**

Test a single entity with no focusable children:

```ts
it('projects one polite status region with the visible summary', () => {
  const bar = new TopStatusBar();
  bar.setStatus({ fps: 119.6, active: 4_980, capacity: 20_000, backend: 'WebGL/MSDF' });
  const attrs = bar.getA11yAttributes();
  expect(attrs.role).toBe('status');
  expect(attrs.live).toBe('polite');
  expect(attrs.label).toContain('4,980 of 20,000');
  expect(attrs.label).toContain('WebGL/MSDF');
});
```

- [ ] **Step 2: Implement one compact status entity**

`TopStatusBar extends Entity` and stores mutable primitive values. `setStatus` updates only changed values and calls `scene.markDirty()` once. `render` draws:

- `BAKUDAN` in `THEME.fontDisplay`.
- State pill (`VIDEO`, `STRESS`, `LOADING`, `PAUSED`, `ERROR`) with icon-independent text.
- FPS, active/capacity, and backend in mono type.
- A thin coral line only for the active-state marker.

Default height: 34 px desktop, 44 px mobile. Elide lower-priority FPS detail below 480 px, but keep the accessible label complete.

- [ ] **Step 3: Add an inspectable descriptor**

`getDevtoolsDescriptor()` returns groups for playback state, active/capacity, FPS, and backend. It must not enumerate PoolSlots.

- [ ] **Step 4: Format, test, and commit**

```bash
bun run format
bun test test/TopStatusBar.test.ts

git add src/view/TopStatusBar.ts test/TopStatusBar.test.ts
git commit -m "feat: add Cinema status bar"
```

### Task 3: Replace Dock and PlayerControls with the Command Deck

**Files:**

- Create: `src/view/CommandDeck.ts`
- Create: `test/CommandDeck.test.ts`
- Read behavior from: `src/view/Dock.ts`, `src/view/PlayerControls.ts`

- [ ] **Step 1: Write failing layout and action tests**

Cover three contracts:

1. Desktop layout is a single 56 px row.
2. Mobile layout is two rows and every button remains inside width.
3. Enter and Send dispatch the same trimmed text exactly once.

Expose `layoutSnapshot()` returning primitive bounds for `input`, `send`, `play`, `timeline`, `rate`, and `lab`; tests assert all are inside the deck and non-overlapping.

- [ ] **Step 2: Define one callback contract**

```ts
export interface CommandDeckCallbacks {
  onSend: (text: string) => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onRateChange: (rate: number) => void;
  onToggleLab: () => void;
}
```

- [ ] **Step 3: Implement the desktop deck**

Compose `Input`, `Button`, `Slider`, `Dropdown`, and `Text` within one `Entity`/`Stack` hierarchy:

- Input accessible label/placeholder: “Send a danmaku”.
- Send button label: “Send”.
- Play button label: “Play” or “Pause”; never an unlabeled glyph.
- Timeline `Slider.label = 'Video position'`.
- Rate `Dropdown.label = 'Playback rate'`, options `0.5×`, `1×`, `1.5×`, `2×`.
- Lab button label: “Open laboratory” or “Close laboratory”.

Render the deck with `THEME.inkRaised`, a 1 px `THEME.line` border, coral Send action, blue timeline progress, and no blur/backdrop CSS.

- [ ] **Step 4: Implement deterministic responsive layout**

`setCompact(compact: boolean)` switches without reconstructing controls:

- Desktop: width 760, height 56, one row.
- Mobile: width supplied by App, height 106, comment row at y=8 and playback row at y=57.
- Input gets remaining width after fixed Send/Lab actions; minimum 156 px.
- At widths below 360, rate moves to the second row but keeps a minimum 64 px hit area.

Use explicit numeric assignments; do not rely on CSS or `window` reads inside the component.

- [ ] **Step 5: Preserve live playback updates**

Add `setPlaybackState({ currentTime, duration, playing, rate, disabled })`. Update slider range/value, time text, labels, and disabled states without recreating any control or event handler. A failed/absent video disables playback controls while the comment input remains usable.

- [ ] **Step 6: Format, test, and commit**

```bash
bun run format
bun test test/CommandDeck.test.ts

git add src/view/CommandDeck.ts test/CommandDeck.test.ts
git commit -m "feat: add responsive Command Deck"
```

### Task 4: Build the tabbed Lab Drawer shell

**Files:**

- Create: `src/view/LabDrawer.ts`
- Create: `src/view/lab/LabPanel.ts`
- Create: `test/LabDrawer.test.ts`

- [ ] **Step 1: Write failing open/close, tab, and focus-order tests**

Test:

- Drawer starts hidden and contributes no focusable descendants.
- Opening exposes four text-labelled tabs in order: Videos, Throughput, Interactions, DevTools.
- Selecting one tab leaves exactly one panel visible.
- Escape invokes `onClose`.
- Mobile bounds fit between status bar and Command Deck.

- [ ] **Step 2: Define the panel contract**

```ts
export interface LabPanel {
  readonly entity: Entity;
  readonly tab: LabTab;
  setAvailableBounds(width: number, height: number): void;
  setState(state: Readonly<AppViewState>): void;
}
```

- [ ] **Step 3: Implement the shell without HTML overlays**

`LabDrawer extends Entity` owns:

- Header title “DANMAKU LAB”.
- One `Tabs` component with full-word labels: Videos, Throughput, Interactions, DevTools.
- A Close button with visible label “Close”.
- One panel entity as each `TabItem.content`; a panel that can overflow owns its own single `ScrollView`.

Use `Tabs.onChange` for state updates and `Tabs.selectTab` for programmatic selection. Reuse its built-in `role="tab"` hotspots, roving tabindex, arrow/Home/End keyboard behavior, visibility management, and horizontal overflow; do not hand-roll tab buttons or keyboard routing. `setOpen` toggles visibility on the entire drawer tree.

- [ ] **Step 4: Implement desktop/mobile geometry**

- Desktop: width 420, x = viewport width − width − 16, y = 54, bottom = Command Deck y − 12.
- Mobile: x = 8, width = viewport width − 16, y = 60, bottom = Command Deck y − 8.
- Never let height fall below 180; if the viewport is smaller, the content scrolls rather than escaping the drawer.

- [ ] **Step 5: Format, test, and commit**

```bash
bun run format
bun test test/LabDrawer.test.ts

git add src/view/LabDrawer.ts src/view/lab/LabPanel.ts test/LabDrawer.test.ts
git commit -m "feat: add tabbed Lab Drawer"
```

### Task 5: Implement the Videos Lab panel and source states

**Files:**

- Create: `src/view/lab/VideosPanel.ts`
- Create: `test/VideosPanel.test.ts`
- Modify: `src/model/i18n.ts`

- [ ] **Step 1: Write failing catalog, custom URL, and error-action tests**

Assert that the panel:

- Selects by video ID rather than URL label.
- Shows source metadata/test tags/attribution.
- Sends a normalized custom URL only after explicit Load.
- Keeps the current entry selected while `candidateVideoId` is loading.
- Emits distinct Retry and Choose another source actions on typed failure.

- [ ] **Step 2: Define exact callbacks**

```ts
export interface VideosPanelCallbacks {
  onSelectCatalogVideo: (videoId: string) => void;
  onLoadCustomUrl: (url: string) => void;
  onRetryVideo: () => void;
  onChooseAnotherVideo: () => void;
  onTrackProfileChange: (profileId: string) => void;
}
```

- [ ] **Step 3: Compose labelled VectoJS controls**

Use a `Dropdown` for the five catalog videos (`label = 'Test video'`), a second dropdown for Track Profile (`label = 'Track profile'`), an `Input` for custom URL, and a Load button. Render a source card with duration/aspect/test tags and attribution text.

Do not insert raw HTML, external iframes, or a native `<select>`.

- [ ] **Step 4: Render explicit state feedback**

- Loading: “Loading {title}…” plus candidate URL host.
- Error: exact typed reason plus Retry and Choose another source.
- CORS/codec error: explain what the browser rejected; preserve current video.
- Successful custom URL with missing metadata: refuse the atomic switch and keep current playback.

Use text and shape together; color alone never distinguishes state.

- [ ] **Step 5: Complete translations and accessible names**

Add all panel labels/actions/errors to the five existing languages. Set `Dropdown.label` and `Slider.label` directly. Icon-only controls are prohibited.

- [ ] **Step 6: Format, test, and commit**

```bash
bun run format
bun test test/VideosPanel.test.ts

git add src/view/lab/VideosPanel.ts src/model/i18n.ts test/VideosPanel.test.ts
git commit -m "feat: add video laboratory panel"
```

### Task 6: Implement Throughput controls and 20K/5K ceilings

**Files:**

- Create: `src/view/lab/ThroughputPanel.ts`
- Create: `test/ThroughputPanel.test.ts`
- Modify: `src/view/App.ts:21-24,100-114,220-232,500-508`
- Modify: `src/view/FrameProfiler.ts`

- [ ] **Step 1: Write failing ceiling and telemetry tests**

Test the panel with capacities 20,000 and 5,000:

```ts
it.each([
  [20_000, [5_000, 10_000, 20_000]],
  [5_000, [1_000, 2_500, 5_000]],
])('clamps presets and slider to capacity %i', (capacity, expectedPresets) => {
  const panel = new ThroughputPanel(capacity, callbacks);
  expect(panel.capacityPresets).toEqual(expectedPresets);
  expect(panel.maxTarget).toBe(capacity);
});
```

Also assert the resolved Track Profile distribution totals equal generated entries and that the profiler report includes active draw-path counters.

- [ ] **Step 2: Raise and centralize pool limits**

In `App.ts`:

```ts
const DESKTOP_POOL = 20_000;
const MOBILE_POOL = 5_000;
const MOBILE_BREAKPOINT = 768;
```

Construct exactly one `DanmakuPool` at the initial device class. Derive every target slider/preset maximum from `pool.capacity`; remove all remaining hard-coded 5,000/1,000 limits from UI callbacks.

- [ ] **Step 3: Implement the Throughput panel**

Controls:

- Target slider with `label = 'Active danmaku target'`, dynamic max.
- Spawn-rate slider with `label = 'Spawn rate per second'`.
- Capacity preset buttons.
- Profile distribution readout: preset/effect counts from `ProfiledTrackResult.resolved`.
- Live draw-path split: GL runs/glyphs, Canvas2D blits/fillText, special count.
- Frame p50/p99 and inside-budget percentage from `FrameProfiler`.

The UI reports measured state only; it must not promise “240Hz” or auto-lower a user's requested target.

- [ ] **Step 4: Preserve the known activation hotspot**

Do not optimize or replace `DanmakuPool._findFree()` in this task. Add a profiler phase around large activation bursts if none exists and label the report “activation scan” so near-20K one-time fill cost is not misread as a draw regression.

- [ ] **Step 5: Format, run focused tests, and commit**

```bash
bun run format
bun test test/ThroughputPanel.test.ts test/FrameProfiler.test.ts

git add src/view/lab/ThroughputPanel.ts src/view/App.ts src/view/FrameProfiler.ts test/ThroughputPanel.test.ts
git commit -m "feat: expose 20K throughput laboratory"
```

### Task 7: Implement Interactions and real Jelly rendering

**Files:**

- Create: `src/view/lab/InteractionsPanel.ts`
- Create: `src/view/jellyTransform.ts`
- Create: `test/JellyTransform.test.ts`
- Modify: `src/view/DanmakuLayer.ts:219-373,376-441`
- Modify: `src/view/App.ts:571-600,806-862`

- [ ] **Step 1: Update the released core dependency**

```bash
bun add @vectojs/danmaku-core@<released-version>
```

Replace `<released-version>` with the exact version from the Jelly plan. Verify `package.json` and `bun.lock` contain that version; no range may resolve back to 0.1.0.

- [ ] **Step 2: Write failing pure transform tests**

Create `jellyTransform.ts` around an anchor-preserving rectangle transform and test neutral, stretch, squash, and inverse horizontal behavior:

```ts
expect(transformGlyphRect({ x: 10, y: 20, width: 30, height: 40 }, 25, 40, 1, 1)).toEqual({
  x: 10,
  y: 20,
  width: 30,
  height: 40,
});

const stretched = transformGlyphRect({ x: 10, y: 20, width: 30, height: 40 }, 25, 40, 0.8, 1.2);
expect(stretched.x).toBeCloseTo(13);
expect(stretched.y).toBeCloseTo(16);
expect(stretched.width).toBeCloseTo(24);
expect(stretched.height).toBeCloseTo(48);
```

- [ ] **Step 3: Implement the Interactions panel**

Controls are grouped, not a flat checkbox wall:

- Motion presets: Scroll, Reverse, Top, Bottom, Sine, Rotation, Glitch, Repulsion.
- Simulation: Physics, Jelly.
- Visual effects: Glow, Gradient, Rainbow, Outline.
- Actions: Hover to pause, Drag, Like, Particle reaction, Copy.

Every checkbox has an explicit text label. Jelly invokes `scheduler.showcaseJelly`; it is not a local UI animation.

- [ ] **Step 4: Apply Jelly to the WebGL glyph path**

For each plain GL glyph, use `transformGlyphRect` with an anchor at the danmaku center/baseline and pass transformed x/y/w/h to `glr.addGlyph`. Neutral scales preserve the existing fast path values. Do not allocate a rectangle object per glyph in production: implement an inline numeric helper/output tuple reused by the loop or inline the formula after the pure helper test establishes it.

- [ ] **Step 5: Apply Jelly to Canvas2D and special paths**

Wrap bitmap/fillText/special drawing in:

```ts
renderer.save();
renderer.translate(anchorX, anchorY);
renderer.scale(slot.jellyScaleX, slot.jellyScaleY);
renderer.translate(-anchorX, -anchorY);
// existing draw operation
renderer.restore();
```

Do not double-transform rotation glyphs. User highlight boxes and hover actions stay attached to the transformed comment. Update draw-path telemetry so Jelly-transformed rows count as `special` only if they leave the GL batch; the GL Jelly path should remain batched.

- [ ] **Step 6: Excite drag-release and pointer interactions**

On drag release, call `scheduler.exciteJelly(slot.id, 0.45)`. Spawn is already handled by the scheduler; repulsion is handled by the preset. Toggling Jelly off immediately returns active rows to neutral through the core contract.

- [ ] **Step 7: Add renderer-path regression coverage**

Use a fake `IRenderer` and fake point renderer to assert:

- Neutral GL coordinates remain byte-equivalent to the old formula.
- Non-neutral GL coordinates and quad sizes change.
- Canvas2D receives one balanced save/translate/scale/restore sequence.
- 20K neutral slots still use the existing GL batch path, not Canvas2D per row.

- [ ] **Step 8: Format, test, and commit**

```bash
bun run format
bun test test/JellyTransform.test.ts test/DanmakuLayer.test.ts
bun run lint

git add package.json bun.lock src/view/lab/InteractionsPanel.ts src/view/jellyTransform.ts \
  src/view/DanmakuLayer.ts src/view/App.ts test/JellyTransform.test.ts test/DanmakuLayer.test.ts
git commit -m "feat: render interactive Jelly danmaku"
```

### Task 8: Add the debug-only Bakudan DevTools descriptor and plugin

**Files:**

- Create: `src/devtools/bakudanPlugin.ts`
- Create: `src/view/lab/DevToolsPanel.ts`
- Create: `test/BakudanDevtools.test.ts`
- Modify: `src/view/DanmakuLayer.ts`
- Modify: `src/main.ts:1-42`

- [ ] **Step 1: Write failing descriptor/plugin tests**

Test `DanmakuLayer.getDevtoolsDescriptor()` with a small pool and assert rows exist for:

- Active/target/capacity.
- Spawn rate.
- GL/Canvas2D/special draw split.
- Atlas coverage/fallback ratio.
- Preset/effect counts.
- Hovered/dragging/liked/user-sent counts.
- Relevant cache sizes.

Then register `bakudanPlugin`, select a `DanmakuLayer`, and verify the inspector returns a bounded slot sample rather than all slots.

- [ ] **Step 2: Implement the layer descriptor without O(capacity) work per refresh**

Cache aggregate counters during the existing render/update scans. `getDevtoolsDescriptor()` reads those counters and `pool.activeCount` only. It must not scan 20K slots when the panel refreshes.

- [ ] **Step 3: Implement the app plugin**

`src/devtools/bakudanPlugin.ts` exports:

```ts
export function registerBakudanDevtools(): () => void;
```

Register plugin ID `bakudan` with:

- Inspector `danmaku-layer` with a bounded default sample of 20 active slots.
- Audits for `unexpected-canvas-fallback`, `capacity-target-mismatch`, and `interactive-free-slot-distance`.
- Commands `reset-counters`, `sample-slots`, and `profile-burst`.

Commands are explicit; opening the panel never mutates app state.

- [ ] **Step 4: Keep all DevTools code out of the production entry chunk**

Change `main.ts`:

```ts
const debugEnabled = new URLSearchParams(window.location.search).has('debug');
if (debugEnabled) {
  const [{ attachDevtools }, { registerBakudanDevtools }] = await Promise.all([
    import('@vectojs/devtools'),
    import('./devtools/bakudanPlugin'),
  ]);
  registerBakudanDevtools();
  attachDevtools(scene, { traceEvents: true, showPerf: true });
}
```

Remove the static `@vectojs/devtools` import. The production bundle must contain neither panel code nor plugin registration.

- [ ] **Step 5: Implement the in-app DevTools Lab tab**

Production state explains that deep inspection is off and offers a text-labelled “Reload with DevTools” action that adds `?debug` while preserving the current URL path. Debug state shows what is available and the keyboard command to open the VectoJS panel. It does not duplicate the full inspector UI.

- [ ] **Step 6: Run package and bundle verification**

```bash
bun run format
bun test test/BakudanDevtools.test.ts
bun run build
```

Inspect Vite output: `@vectojs/devtools` and `bakudanPlugin` must be in lazy chunks and absent from the main entry chunk's static imports.

- [ ] **Step 7: Commit diagnostics integration**

```bash
git add src/devtools/bakudanPlugin.ts src/view/lab/DevToolsPanel.ts src/view/DanmakuLayer.ts \
  src/main.ts test/BakudanDevtools.test.ts
git commit -m "feat: add debug-only Bakudan diagnostics"
```

### Task 9: Cut App over to Cinema Overlay and delete the obsolete UI

**Files:**

- Modify: `src/view/App.ts`
- Modify: `src/view/HelpModal.ts`
- Modify: `src/main.ts`
- Delete: `src/view/Dock.ts`
- Delete: `src/view/ControlCenter.ts`
- Delete: `src/view/PlayerControls.ts`
- Delete: `src/view/HUD.ts`
- Modify: `src/model/i18n.ts`

- [ ] **Step 1: Add a failing App state-transition smoke test**

Construct App with a test Scene and injected video factory. Assert:

- Initial mode is video.
- Lab Drawer is collapsed.
- Selecting a catalog video enters loading but retains current ID until success.
- Candidate success changes ID/profile and rebuilds the timed track.
- Candidate failure keeps the old ID and exposes retry state.
- Opening/closing Lab changes no scheduler target or video time.

- [ ] **Step 2: Build the new UI exactly once**

`App._buildUI()` creates `TopStatusBar`, `CommandDeck`, `LabDrawer`, the four panels, HelpModal, and DanmakuAnnouncer. Remove Dock, HUD, PlayerControls, and ControlCenter creation and state mirrors. Wire all callbacks through `ViewActions` to existing App methods.

- [ ] **Step 3: Make video the real initial experience**

During `start()`:

1. Set background mode to video.
2. Load `DEFAULT_VIDEO_ID` through the atomic candidate API.
3. Generate the default video's profile track after metadata succeeds.
4. Attempt muted autoplay.
5. If autoplay rejects, show a normal paused state with Play enabled; do not label it an error.

Stress mode remains available only in the Throughput panel.

- [ ] **Step 4: Implement one responsive layout owner**

In `onResize(width, height)`:

```ts
const compact = width < 768;
const statusMargin = compact ? 8 : 16;
const deckWidth = Math.min(compact ? width - 16 : 760, width - statusMargin * 2);
const deckHeight = compact ? 106 : 56;
const viewportBottom = this._viewportBottom ?? height;
```

Place status top-left, deck centered above `viewportBottom`, and drawer between them. Use `VisualViewport.offsetTop/height` on mobile so the software keyboard never covers Send. Re-layout without rebuilding Entities.

- [ ] **Step 5: Restyle HelpModal to the same system**

Use Ink/Smoke/Coral tokens and update instructions to explain the Command Deck, Lab tabs, source failures, and interactive comment actions. Keep `ScrollView`, focus order, keyboard close, and no DOM overlay.

- [ ] **Step 6: Delete old components with no aliases or shims**

Remove the four obsolete files and every import/reference. Do not leave deprecated re-exports, compatibility constructors, or peach-theme comments. Grep for `ControlCenter`, `PlayerControls`, `new Dock`, `new HUD`, `#ff7e5f`, and `rgba(255, 255, 255, 0.9` and remove UI remnants outside intentional danmaku colors.

- [ ] **Step 7: Format, run app tests/build, and commit cutover**

```bash
bun run format
bun run format:check
bun run lint
bun test
bun run build

git add src/view src/model/i18n.ts src/main.ts
git commit -m "feat: launch video-first Cinema Overlay"
```

### Task 10: Add responsive, accessibility, and browser interaction coverage

**Files:**

- Replace: `audit.test.ts`
- Delete: `test/_placeholder.test.ts`
- Create: `test/AppLayout.test.ts`
- Create: `test/CinemaOverlay.e2e.ts`
- Modify: `vite.config.ts` or test config only if existing commands require explicit e2e separation

- [ ] **Step 1: Replace placeholder coverage with behavior assertions**

`audit.test.ts` must instantiate the real App UI, not an empty Scene. Run `auditScene` at 1440×900 and 390×844 and assert no findings for:

- `no-accessible-name`.
- `keyboard-reachable-clipped`.
- `reading-order`.
- `clip-overflow` on focusable controls.

Delete `_placeholder.test.ts`.

- [ ] **Step 2: Add deterministic layout assertions**

`AppLayout.test.ts` uses primitive layout snapshots and asserts:

- Status, drawer, and Command Deck remain inside viewport.
- Open drawer does not overlap Command Deck.
- Send and Lab actions remain visible at 390×844.
- Desktop deck remains centered at 1440×900 and 2560×1600.
- `VisualViewport` keyboard offset raises the deck.

- [ ] **Step 3: Add real-browser interaction scenarios**

Run against a local Vite server in Chromium and Firefox:

1. Default catalog video loads or exposes a typed retry state.
2. Play/Pause, seek, and rate update both state and native video.
3. Send by Enter and Send button each creates one user comment.
4. Open Lab, visit all four tabs, change video/profile/target/Jelly, close Lab.
5. Switch to a failing custom URL; old video remains.
6. Keyboard-only traversal reaches every action in logical order.
7. Pointer hover, drag release, like, copy, and repulsion produce trace events.

Use a local test video or intercepted CDN response for deterministic CI; do not make CI depend on public network availability.

- [ ] **Step 4: Exercise forced colors and reduced motion**

In both engines, emulate `prefers-reduced-motion: reduce` and forced colors where supported. Assert controls remain labelled, state text remains present, focus is visible, and no essential state relies on decorative animation.

- [ ] **Step 5: Run all automated gates**

```bash
bun run format
bun run format:check
bun run lint
bun run lint:md
bun test
bun run build
```

Expected: all pass with no warnings.

- [ ] **Step 6: Commit acceptance coverage**

```bash
git add audit.test.ts test vite.config.ts
git commit -m "test: cover Cinema Overlay interactions"
```

### Task 11: Verify real-hardware visual and performance acceptance

**Files:**

- Temporary evidence only: `tmp/cinema-overlay-review/*`
- Modify only if verification finds a real defect: affected source/test files
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Run browser visual review at required viewports**

Use the browser-harness workflow, not DOM screenshots as the source of layout truth. Inspect VMT geometry/a11y first, then capture evidence at:

- Chromium: 1440×900, 2560×1600, 390×844.
- Firefox: 1440×900, 390×844.
- Lab closed and Videos/Throughput/Interactions/DevTools tabs open.

Review hierarchy, text clipping, video letterboxing/cover behavior, status density, Command Deck focus, drawer/deck separation, and source error presentation.

- [ ] **Step 2: Run real-hardware throughput measurements**

Use the `hyprland-browser-bench` skill. Calibrate refresh rate per engine. Record frame-time p50/p99, inside-budget percentage, active count, draw-path split, renderer/backend, viewport, DPR, and refreshHz for:

- Desktop 5K, 10K, 20K plain GL/MSDF.
- Mobile viewport 1K, 2.5K, 5K.
- Mixed preset/effect profile at 5K.
- Jelly enabled at 5K and 20K.
- Canvas2D fallback-heavy profile.

Do not report headless FPS. Do not claim all 20K style combinations meet one performance contract; report each draw-path split.

- [ ] **Step 3: Verify production/debug bundle separation**

Run the production URL without `?debug`: no DevTools panel/plugin request or registration. Run with `?debug`: panel, VMT inspector, GPU phase timing, event trace, snapshot/diff, audit, plugin inspector, and commands all work.

- [ ] **Step 4: Fix only observed acceptance failures and rerun their scenario**

Any code change gets immediate `bun run format`, focused test, and browser reproduction. Do not add speculative animation, fallback, retry, or abstraction during polish.

- [ ] **Step 5: Add the app changeset and final gates**

Create:

```markdown
---
'bakudan': minor
---

Redesign Bakudan as a video-first Cinema Overlay with a responsive laboratory, curated test videos, weighted track profiles, 20K/5K throughput controls, real Jelly reactions, and debug-only diagnostics.
```

Run:

```bash
bun run format
bun run format:check
bun run lint
bun run lint:md
bun test
bun run build
```

- [ ] **Step 6: Commit verified release metadata**

```bash
git add .changeset src test audit.test.ts index.html package.json bun.lock
git commit -m "chore: prepare Cinema Overlay release"
```

- [ ] **Step 7: Record CarryCtx completion evidence**

Record exact browser versions, viewport/DPR/refreshHz, benchmark p50/p99 and draw split, a11y audit result, bundle split result, final commits, and remaining known hotspot (`DanmakuPool._findFree`) in progress notes and the final checkpoint.
