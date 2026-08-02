# Bakudan Video-First Cinema Overlay Design

**Status:** Approved for implementation  
**Date:** 2026-08-01  
**CarryCtx task:** CTX-0008  
**Approved direction:** Cinema Overlay, normal collapsed viewing state

## 1. Product definition

Bakudan is a video-first danmaku laboratory built with VectoJS. Its primary experience is watching synchronized danmaku over video. It also exposes explicit laboratory scenarios for high-throughput rendering, visual effects, and pointer interaction.

The redesign must not turn Bakudan into a conventional dashboard. Video owns the stage. Controls remain quiet until needed, and diagnostics appear in a single on-demand Lab Drawer. The existing one-entity `DanmakuLayer` and WebGL/MSDF glyph-batching architecture remain the performance foundation.

### Goals

- Make synchronized video playback the default experience.
- Provide five reliable built-in test videos with actual media durations of approximately 60 seconds, plus custom URL loading.
- Raise the desktop danmaku capacity to 20,000 and mobile capacity to 5,000.
- Make the existing motion presets, effects, and interactions understandable and testable.
- Complete the currently inert Jelly showcase.
- Preserve and expose the distinction between WebGL batch, Canvas2D fallback, and special rendering paths.
- Replace the current peach settings UI with the approved dark Cinema Overlay language.
- Make desktop and 390×844 mobile layouts fully usable, keyboard accessible, and auditable through `@vectojs/devtools`.

### Non-goals

- User accounts or a remote comment service.
- Server-side video upload or transcoding.
- HLS or DASH adaptive streaming.
- A backend persistence layer.
- Representing every pool slot as a VMT `Entity`.
- Rewriting the renderer without a measured bottleneck.
- Promising that 20,000 comments with every Canvas2D special effect enabled will sustain 240 Hz.

## 2. Experience hierarchy

Bakudan has three scenario families. They may be combined, but every report names the active scenario and draw-path mix.

1. **Video** — the default. A selected video, synchronized track profile, playback controls, density timeline, and user-sent comments.
2. **Throughput** — fixed 5K, 10K, and 20K desktop workloads, with device-appropriate mobile presets and explicit frame-budget reporting.
3. **Interactions & Effects** — hover pause, drag, reactions, repulsion, gravity, Jelly, and visual effects, with a bounded workload when the selected paths are not batch-safe.

Video remains visible and keeps playing when the Lab Drawer opens. The drawer changes laboratory configuration; it does not replace the stage.

## 3. Information architecture

```text
App
├── VideoCatalog
├── PlaybackState
├── TrackProfileState
├── LabScenarioState
├── StageBackground
├── DanmakuLayer
├── TopStatusBar
├── CommandDeck
└── LabDrawer
    ├── VideosPanel
    ├── ThroughputPanel
    ├── InteractionsPanel
    └── DevtoolsPanel
```

### 3.1 Reusable package boundary

The redesign ships reusable domain behavior as one sibling package rather than leaving reusable canvas UI inside the Bakudan app:

```text
@vectojs/danmaku-core
└── renderer-agnostic pool, scheduler, presets, track, and Jelly state

@vectojs/danmaku-kit
├── pure TrackProfile generation and generic video-source contracts
├── themed StatusBar, CommandDeck, and LabDrawer
└── generic Videos, Throughput, and Interactions panel contracts

bakudan
├── concrete licensed R2 video catalog, brand theme, labels, and i18n
├── StageBackground, DanmakuLayer, App orchestration, and persistence adapter
└── app-specific DevTools plugin and acceptance scenarios
```

`@vectojs/danmaku-kit` depends on `@vectojs/core`, `@vectojs/ui`, and `@vectojs/danmaku-core`. It receives theme, labels, catalog/profile data, state, and callbacks through typed options. It must not import Bakudan, embed Bakudan copy or CDN URLs, or re-export app-specific behavior. `@vectojs/danmaku-core` remains zero-dependency and never acquires VectoJS UI concerns.

`App` remains the coordinator, but catalog data, track profiles, scenario state, and visual tokens move out of component constructors. Bakudan injects its concrete data and branding into `@vectojs/danmaku-kit`; components receive state and callbacks through narrow options rather than reading unrelated application fields.

## 4. Default Cinema Overlay

### 4.1 Stage

The video fills the available stage without distortion. Use `object-fit: contain`. Letterboxed space uses a low-detail, blurred treatment derived from the same video source where practical; a neutral Ink fallback is acceptable while the frame is unavailable.

Danmaku remain above the video and below product UI:

```text
video background (z0)
WebGL/MSDF danmaku (z1)
Canvas2D special danmaku + product UI (z2)
```

### 4.2 Top status bar

The top bar contains only:

- Bakudan wordmark.
- Current mode/status pill.
- Current video and track-profile label.
- Compact FPS, frame-time, and live-count values.

It must not become a full profiler. Detailed metrics belong in the Lab Drawer.

### 4.3 Command Deck

The bottom Command Deck is the primary control surface:

- Play/pause.
- Density waveform timeline and seek playhead.
- Current time and duration.
- Playback rate.
- Danmaku input and Send action.
- Lab Drawer toggle.

The density waveform is the visual signature of the redesign. It encodes real track density rather than acting as decoration.

After two seconds without pointer, keyboard, focus, or playback interaction, the top bar and Command Deck reduce to 22% opacity. Pointer activity, keyboard input, or focus restores them within 120 ms. Controls remain present in the accessibility projection while visually quiet. Reduced-motion mode changes these transitions to immediate state changes.

### 4.4 Lab Drawer

The drawer rises from the bottom without pausing or recreating the video. On desktop it occupies approximately 46% of the viewport, leaving the upper video visible. On mobile it becomes a 69% bottom sheet with an explicit close action and gesture-compatible drag affordance.

Tabs:

- **Videos**
- **Throughput**
- **Interactions**
- **DevTools**

Opening or closing the drawer must preserve video time, playback state, track cursor, input contents, and scenario configuration.

## 5. Visual language

### 5.1 Palette

| Token          | Value     | Use                                 |
| -------------- | --------- | ----------------------------------- |
| Ink            | `#07090d` | Stage and overlay base              |
| Smoke          | `#121722` | Elevated controls and drawer panels |
| Pulse          | `#f43f5e` | Play, Send, active playback state   |
| Signal         | `#60a5fa` | Focus, density signal, diagnostics  |
| Warn           | `#f59e0b` | Budget or fallback warnings only    |
| Stable         | `#4ade80` | Verified healthy state only         |
| Primary text   | `#f8fafc` | Active labels and values            |
| Secondary text | `#8d99aa` | Supporting labels                   |

Pulse and Signal have distinct semantics. Neither is used as general decoration. Warnings and healthy-state colors appear only when their state applies.

### 5.2 Typography

No new font dependency is required.

- Outfit: wordmark and drawer section titles.
- Inter: controls, video labels, and explanatory copy.
- JetBrains Mono: metrics, time values, counts, and diagnostic labels.

Typography settings are centralized in theme tokens. Components must not define unrelated font shorthands ad hoc.

### 5.3 Surfaces and focus

- Product surfaces use dark translucent fills over video, restrained blur, and one-pixel light borders.
- Focus uses a visible Signal-blue double ring and is never represented by color fill alone.
- Errors occupy the component that failed and name the recovery action.
- Toasts are reserved for transient success such as copying a report; they do not carry actionable failures.

### 5.4 Motion

One orchestrated sequence defines the experience:

1. Video enters over 180 ms while controls are immediately usable.
2. Controls quiet after the idle threshold.
3. Activity restores controls over 120 ms.
4. Lab Drawer uses a spring transition and does not affect playback.

Avoid independent decorative animations. Danmaku motion is already the dominant movement.

## 6. Responsive behavior

### Desktop

- Command Deck remains centered with a practical maximum width.
- Input takes a bounded share of the deck; timeline retains priority.
- Drawer content may use multi-column video cards and split panels.

### Mobile, 390×844 baseline

- Command Deck becomes two rows.
- First row: play, timeline, Lab.
- Second row: input and Send.
- Send and Lab remain entirely within the viewport.
- The compact top bar hides secondary metrics but retains playback state and one frame-health value.
- Video cards use two columns.
- Drawer content scrolls inside the bottom sheet.
- No Help button overlaps the command surface.

The layout derives child widths from the available container width. Fixed desktop Input widths are prohibited.

## 7. Video catalog

### 7.1 Catalog entry

Each built-in entry carries at least:

```ts
interface VideoCatalogEntry {
  id: string;
  title: string;
  source: { kind: 'cdn' | 'external'; url: string };
  durationHint?: number;
  aspectRatio?: number;
  testTags: Array<'motion' | 'bright' | 'low-light' | 'animation' | 'portrait' | 'seek-loop'>;
  defaultTrackProfileId: string;
  attribution?: { label: string; url: string; license: string };
}
```

Custom URLs create an ephemeral entry and are not added to the curated catalog.

### 7.2 Built-in coverage

Select four to six licensed clips covering:

- A seamless 60-second seek/replay loop.
- High-motion night or traffic footage.
- Bright water or sky footage.
- Low-light footage.
- Animation.
- A portrait or non-16:9 clip.

Only CC0, compatible Creative Commons, or otherwise explicitly reusable sources are eligible. Attribution is preserved in catalog metadata. New hosted assets live under `cdn.vectojs.org/bakudan/video/`; the implementation must verify HTTP 200, MIME type, range-request behavior, and browser playback before referencing them.

Every curated clip must be an actual approximately 60-second media object. The Command Deck reads the duration from loaded media metadata; it must not present a synthetic 60-second timeline over a shorter file. Longer source excerpts are preferred, while deterministic concatenated loops are acceptable for explicitly loop-oriented test footage. Only the selected candidate is loaded.

### 7.3 Atomic source switching

Do not stop or remove the active video before the candidate source has loaded metadata and proved playable.

```text
select entry
→ create candidate video
→ wait for metadata / playable state
→ create matching track
→ atomically swap candidate into the stage
→ dispose previous video
```

A failed candidate leaves the previous video and track untouched.

### 7.4 Custom URL errors

Distinguish at least:

- Network failure.
- Missing or invalid metadata.
- Unsupported codec/container.
- CORS restriction where detectable.
- Playback rejection.

The UI provides Retry and Choose another source. It never silently switches to a different catalog entry.

## 8. Track profiles and persistence

Built-in profiles:

- **Natural Peaks** — moderate baseline with clustered highlight moments.
- **Peak Event** — pronounced density spikes.
- **Flood** — sustained high density for video-overload testing.
- **Style Showcase** — controlled distribution across all motion presets.

A profile has a reusable `@vectojs/danmaku-kit` contract:

```ts
interface TrackProfile {
  id: string;
  label: string;
  averagePerSecond: number;
  peakPerSecond: number;
  clusterRatio: number;
  maxEntries: number;
  presetWeights: Partial<Record<PresetId, number>>;
  effectWeights?: Partial<Record<keyof CharacterEffects, number>>;
}

interface ResolvedTrackDistribution {
  entries: number;
  presetCounts: Partial<Record<PresetId, number>>;
  effectCounts: Partial<Record<keyof CharacterEffects, number>>;
}
```

`@vectojs/danmaku-kit` implements weighted generation through `buildProfiledTrack()` rather than claiming that `danmaku-core`'s current uniform `generateTimedTrack()` API supports weights. The package-owned generated entry type extends `TimedDanmakuEntry` with resolved effects; Bakudan wraps `DanmakuTrack` to preserve that metadata when entries fire. The builder records a `ResolvedTrackDistribution` beside the entries, and reports include the profile ID plus that exact resolved distribution.

User-sent comments are stored under a versioned, video-scoped key. Invalid stored data is discarded only for the affected video. A custom URL derives a stable local key from a normalized URL without treating that key as authentication or a globally stable identity.

The existing unused fixed demo track is either wired specifically to the curated 60-second loop or removed. It must not remain as misleading dead product data.

### 8.1 Reactions and stable comment identity

Every timed entry receives a stable content identifier before it enters the pool. Built-in profile entries use the video ID plus their deterministic track position; user-sent entries receive a persisted UUID. A slot reset clears both the identifier and transient interaction state so recycled pool indices never inherit another comment's reaction.

Bakudan stores reaction state under a separate versioned, video-scoped key. The compact selected-comment pill shows the local like count and toggles like/unlike without requiring an account or backend. A storage write failure preserves the current in-memory reaction for the session and never reports a persisted success that did not occur.

## 9. Throughput and pool scaling

Raise capacity to:

- Desktop: 20,000.
- Mobile: 5,000.

Expose 5K, 10K, and 20K desktop quick targets plus a bounded custom value. Mobile quick targets are 1K, 2.5K, and 5K.

Capacity is not accepted as complete until real-hardware measurement covers:

- Pool activation and free-slot lookup.
- `Scheduler.tick()`.
- Layer culling/bucketing.
- JS glyph batching.
- GPU submit.
- Pointer hit testing while interactive.
- Periodic HUD and accessibility summary work.
- Heap growth and steady-state allocation.

Potential `danmaku-core` changes, such as a free-list/cursor or lazy rotation state, require their own task and package changeset after profiling proves the need. Bakudan must not fork the engine implementation locally.

The current `DanmakuPool._findFree()` scans from index zero for every activation. Near a 20K target, this is the known expected activation hotspot: filling a pool can approach quadratic total scan work. The baseline must attribute this phase explicitly before it is interpreted as an application regression or replaced with a free-list/cursor.

A 20K target continues running when over budget and reports the result. It must not silently lower the target.

## 10. Interactions and effects

Existing motion presets remain available:

- Scroll, reverse, top, bottom, sine, rotation, glitch, and repulsion.

Existing effects remain available:

- Glow, gradient, rainbow, and outline.

Interactions:

- Hover to pause.
- Drag.
- Like and particle reaction.
- Copy.
- Pointer repulsion.
- Gravity showcase.
- Jelly spring showcase.

Jelly is in scope and must be implemented, not omitted. It receives a separate `danmaku-core` task, tests, changeset, and package release before Bakudan enables the control. The reusable engine contract adds explicit spring state to `PoolSlot` and a `Scheduler.showcaseJelly` path. Spawn, drag release, and pointer repulsion excite a damped squash/stretch response that returns to neutral. `DanmakuLayer` applies the resolved scale/offset to WebGL glyph quads and the equivalent Canvas2D transform, so Jelly remains batch-safe for atlas-backed text. Bakudan must not ship the control against a package version that lacks this behavior.

### 10.1 Selected-comment interaction

Clicking a comment freezes it at its current screen position and promotes it above every normal danmaku draw path. It leaves scheduler occupancy and all repulsion, gravity, and Jelly influence while selected, so other comments continue behind it without changing either trajectory. Only one comment may be selected.

The selected text gains a high-contrast outline. A compact pill directly below its left edge contains like/unlike with the local count and Copy. Like and Copy do not dismiss the selection. Clicking empty stage space, clicking the selected text again, or pressing Escape releases it back onto its original motion path. Selecting another comment atomically releases the previous one.

The promoted comment is removed from the WebGL/plain batch and drawn last on Canvas2D with its interaction chrome. Bakudan pools two transparent 44×44 accessibility hotspots for the actions; it does not create an Entity or DOM projection for every pool slot. Clipboard success is announced only after the Clipboard API resolves. Failure reports `Clipboard unavailable` rather than simulating success.

### 10.2 Adaptive vertical packing

Fixed 40px rows are replaced in `@vectojs/danmaku-core` by an allocation over reusable 2–4px vertical bands. A comment requests contiguous bands from its measured font box plus the outsets required by outline, glow, rotation, or motion amplitude. Presets read the assigned `baseY` instead of rebuilding Y from a fixed lane index every frame.

The scheduler reuses preallocated band state and creates no per-frame temporary arrays in the packing hot path. Normal video playback accepts only kinematically safe, vertically non-overlapping placements. Explicit Throughput stress scenarios retain round-robin overflow when every safe interval is occupied; they continue at the requested target and report the resulting frame budget rather than silently lowering density.

The panel labels each option's active render class: batch-safe, Canvas2D fallback, or special pass. Reports include the active split:

- GL runs and glyphs.
- Canvas2D blits and direct text draws.
- Special-run count.

## 11. DevTools integration

The visual panel is loaded dynamically only when debug mode is requested. Normal users must not download it as part of the main entry chunk.

`DanmakuLayer.getDevtoolsDescriptor()` exposes summary state on demand:

- Active, target, and capacity.
- Spawn rate.
- Draw-path counters.
- Atlas fallback ratio.
- Preset and effect distribution.
- Hovered, dragging, liked, and user-sent counts.
- Relevant cache sizes.

A debug-only Bakudan plugin contributes:

- Slot samples.
- Unexpected-fallback audit.
- Capacity/target audit.
- Track-profile summary.
- Counter reset and report export commands.
- Fixed-workload commands.

The plugin inspects the one `DanmakuLayer`; it does not project pool slots as entities.

Automated tests import `@vectojs/devtools/headless` for layout, accessibility, snapshot, event, GPU, and plugin audits.

## 12. Accessibility

- Every Dropdown and Slider has a projected accessible name, not only a visual sibling label.
- The closed Lab Drawer contributes no invisible focus targets.
- Tab order follows visible reading order.
- Command Deck actions remain reachable while controls are visually quiet.
- Video status and source errors use appropriate live-region semantics without announcing frame metrics continuously.
- The mobile bottom sheet traps focus only while behaving as a modal surface; otherwise it remains a non-modal region over the playing video.
- The selected comment exposes named Like/Unlike and Copy hotspots with at least 44×44 focus geometry even though the visible pill remains compact.
- Escape, blank-stage click, and repeated selection all return focus and motion predictably.
- Forced-colors mode repaints VectoJS controls with system colors.
- Reduced-motion mode removes spring and opacity interpolation while preserving state changes.

## 13. Error handling

- Candidate video failure preserves the active source.
- Track-profile failure falls back to a clearly identified synthetic profile.
- Corrupt persisted comments are isolated by video.
- WebGL/MSDF unavailability reports Canvas2D fallback honestly.
- Over-budget workloads continue and report; they do not auto-tune behind the user's back.
- A DevTools plugin failure is contained by the plugin protocol and cannot interrupt playback.
- Loading, empty, and failure states all provide a next action.

## 14. Verification

### Behavior

- App starts in the normal collapsed Cinema Overlay video state.
- Every curated source and a valid custom URL can load.
- Failed source switching preserves the current video.
- Play, pause, seek, rate, Send, and Lab Drawer work by pointer and keyboard.
- User comments persist per video.
- Desktop 20K and mobile 5K targets are selectable.
- Every displayed interaction/effect control has observable behavior.
- Selecting a comment freezes only that comment; unselected comments continue behind it without force or lane interaction.
- Like/unlike persists by stable video/comment identity, Copy reports real success or failure, and both actions remain below the selected text.
- Mixed 18px, 24px, and 30px comments use their measured vertical extents without overlap in Video mode; Throughput overflow remains explicit.
- Every curated source reports an actual metadata duration of approximately 60 seconds.

### VMT and accessibility

- `auditScene` has no unexpected findings at 1440×900, 2560×1600, and 390×844.
- `auditA11y` has no unnamed, clipped-focus, or reading-order findings.
- Snapshot diffs for opening and closing the drawer include only expected state and geometry changes.
- Event traces show complete seek, send, drawer, and drag transactions.
- Plugin audits report no unexpected fallback or target/capacity mismatch in their healthy fixtures.

### Browser and visual

- Chromium and Firefox.
- Desktop and 390×844 mobile.
- Playing, paused, loading, error, ended, drawer-open, and controls-idle states.
- Selected-comment and compact-pill states at stage edges.
- Dense mixed-size tracks with no full-width fixed-row gaps in Video mode.
- Keyboard navigation, reduced motion, and forced colors.
- Send and Lab controls remain inside the mobile viewport.

### Performance

Real-GPU runs cover:

```text
Desktop: 5K / 10K / 20K
Mobile:  1K / 2.5K / 5K
```

Record exact viewport, DPR, refresh rate, hardware, browser, active profile, and draw-path distribution. Report frame-time p50/p99 and the fraction of frames inside the measured refresh budget. Do not use headless FPS or a vsync-capped FPS value as the performance conclusion.
