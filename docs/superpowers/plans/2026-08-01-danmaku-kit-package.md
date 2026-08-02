# Danmaku Kit Reusable Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven task execution with specification and quality review after each task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a sibling `@vectojs/danmaku-kit` package that owns reusable danmaku track models and canvas-native laboratory UI while Bakudan keeps only concrete product data, branding, renderer integration, and app orchestration.

**Architecture:** The package has two dependency layers behind focused exports: pure model utilities depend only on `@vectojs/danmaku-core`; UI components depend on VectoJS Core/UI plus those model contracts. Every visual string, theme token, catalog/profile list, state value, and action enters through typed options. No package module imports Bakudan, embeds a Bakudan asset URL, or owns application persistence.

**Tech Stack:** TypeScript 7, Bun, tsup, VectoJS Scene/Entity, `@vectojs/ui`, `@vectojs/danmaku-core`, Bun test, oxfmt, oxlint, Changesets, CarryCtx

---

## Repository boundary

Create a separate Git repository at `vectojs-native/danmaku/danmaku-kit`, alongside `danmaku-core` and `bakudan`. Use `danmaku-core` as the package-tooling template. Package name: `@vectojs/danmaku-kit`. GitHub remote creation/push happens only after the package is complete and locally verified.

### Task 1: Bootstrap a real package repository and public boundaries

**Files:**

- Create: `vectojs-native/danmaku/danmaku-kit/package.json`
- Create: `vectojs-native/danmaku/danmaku-kit/tsconfig.json`
- Create: `vectojs-native/danmaku/danmaku-kit/tsconfig.build.json`
- Create: `vectojs-native/danmaku/danmaku-kit/.gitignore`
- Create: `vectojs-native/danmaku/danmaku-kit/.oxfmtrc.json`
- Create: `vectojs-native/danmaku/danmaku-kit/oxlintrc.json`
- Create: `vectojs-native/danmaku/danmaku-kit/bunfig.toml`
- Create: `vectojs-native/danmaku/danmaku-kit/lefthook.yml`
- Create: `vectojs-native/danmaku/danmaku-kit/commitlint.config.mjs`
- Create: `vectojs-native/danmaku/danmaku-kit/.markdownlint-cli2.jsonc`
- Create: `vectojs-native/danmaku/danmaku-kit/LICENSE`
- Create: `vectojs-native/danmaku/danmaku-kit/src/index.ts`
- Create: `vectojs-native/danmaku/danmaku-kit/test/public-api.test.ts`

- [ ] **Step 1: Initialize the sibling repository and CarryCtx**

Create the directory, initialize `main`, copy only toolchain configuration shapes from `danmaku-core`, then run:

```bash
git init -b main
carryctx init
carryctx agent register --name omp --provider oh-my-pi
carryctx --agent omp session start
```

Create one CarryCtx task titled `danmaku-kit: extract reusable laboratory package`, make the minimal repository-baseline commit, then create its feature worktree at `.worktrees/ctx-XXXX` with branch `carryctx/ctx-XXXX-package`.

- [ ] **Step 2: Define package metadata and focused exports**

Use:

```json
{
  "name": "@vectojs/danmaku-kit",
  "version": "0.1.0",
  "description": "Reusable track-profile models and canvas-native laboratory UI for VectoJS danmaku applications.",
  "license": "MIT",
  "publishConfig": { "access": "public" },
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./model": {
      "types": "./dist/model.d.ts",
      "import": "./dist/model.mjs",
      "require": "./dist/model.js"
    },
    "./ui": {
      "types": "./dist/ui.d.ts",
      "import": "./dist/ui.mjs",
      "require": "./dist/ui.js"
    }
  }
}
```

Build the three entry points `src/index.ts`, `src/model.ts`, and `src/ui.ts` with tsup. Declare `@vectojs/core`, `@vectojs/ui`, and `@vectojs/danmaku-core` as peer dependencies and development dependencies at the exact currently verified versions.

- [ ] **Step 3: Write a failing public API test**

`test/public-api.test.ts` imports the planned symbols from `../src/model` and `../src/ui`:

```ts
expect(typeof buildProfiledTrack).toBe('function');
expect(typeof DanmakuStatusBar).toBe('function');
expect(typeof DanmakuCommandDeck).toBe('function');
expect(typeof DanmakuLabDrawer).toBe('function');
```

Run only that test and verify it fails before implementation.

- [ ] **Step 4: Commit the package baseline**

The feature branch may temporarily keep the failing API test while subsequent tasks immediately implement every named export. The delivered branch must never end with a stub, placeholder, or failing test.

### Task 2: Extract pure TrackProfile and video-source contracts

**Files:**

- Create: `src/model/trackProfile.ts`
- Create: `src/model/videoSource.ts`
- Create: `src/model.ts`
- Create: `test/trackProfile.test.ts`
- Create: `test/videoSource.test.ts`
- Modify after the video-plan implementation: `bakudan/src/model/TrackProfiles.ts`
- Modify after the video-plan implementation: `bakudan/src/model/types.ts`

- [ ] **Step 1: Move generic contracts, do not copy them**

After Bakudan's video-plan branch has focused tests passing, move these generic definitions into the package:

- `TrackProfile`.
- `ProfiledTimedDanmakuEntry`.
- `ResolvedTrackDistribution`.
- `ProfiledTrackResult`.
- `buildProfiledTrack` and its injected `random`/`sampleText` dependencies.
- Generic `VideoSourceDescriptor`, load-state, and typed source-error contracts.

Keep these in Bakudan:

- `VIDEO_CATALOG` and all R2 URLs/attribution.
- The four concrete `TRACK_PROFILES` values and localized labels.
- Versioned `localStorage` persistence.
- `StageBackground` and native video ownership.

- [ ] **Step 2: Preserve deterministic behavior tests in the package**

Move the deterministic sequence, sorted-time, maximum-count, invalid-weight, exact preset/effect total, and boundary-duration tests to `danmaku-kit/test/trackProfile.test.ts`. Add a test proving model modules import no `@vectojs/core` or `@vectojs/ui` symbols.

- [ ] **Step 3: Replace Bakudan implementations with package imports**

Bakudan imports model symbols from `@vectojs/danmaku-kit/model`. Delete the moved source definitions; do not leave aliases or re-exports. Bakudan tests retain only concrete catalog/profile/persistence/integration assertions.

- [ ] **Step 4: Run focused model tests in both repositories**

```bash
# danmaku-kit
bun test test/trackProfile.test.ts test/videoSource.test.ts

# bakudan
bun test test/VideoCatalog.test.ts test/UserDanmakuStore.test.ts test/VideoSelection.test.ts
```

Expected: all pass and no duplicate generic implementation remains.

### Task 3: Implement themeable Status Bar and Command Deck

**Files:**

- Create: `src/ui/theme.ts`
- Create: `src/ui/status/DanmakuStatusBar.ts`
- Create: `src/ui/command/DanmakuCommandDeck.ts`
- Create: `src/ui.ts`
- Create: `test/DanmakuStatusBar.test.ts`
- Create: `test/DanmakuCommandDeck.test.ts`

- [ ] **Step 1: Define injected theme and labels**

```ts
export interface DanmakuKitTheme {
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  signal: string;
  warning: string;
  danger: string;
  success: string;
  radius: number;
  fontUi: string;
  fontLabel: string;
  fontDisplay: string;
  fontMono: string;
}
```

`DanmakuKitLabels` supplies every visible/action label. The package may export an accessible neutral default theme/English label set for quick starts, but Bakudan injects its own exact theme and localized labels.

- [ ] **Step 2: Implement `DanmakuStatusBar`**

Reuse the Cinema plan contract: one low-noise Entity, primitive state updates, polite complete status label, compact layout, forced-colors paint, and `getDevtoolsDescriptor()`. It must not know Bakudan's name; product label enters through options.

- [ ] **Step 3: Implement `DanmakuCommandDeck`**

Reuse `Input`, `Button`, `Slider`, `Dropdown`, and `Text`. Inject actions and labels. Preserve desktop/mobile layouts, explicit accessible names, Enter/Send equivalence, playback state updates, and no reconstruction on resize.

- [ ] **Step 4: Run focused UI behavior tests**

Test semantic labels, state updates, callback dispatch, compact bounds, non-overlap, disabled playback state, and forced-colors branches. Do not test source text or incidental token values.

### Task 4: Implement Lab Drawer and generic Lab panel components

**Files:**

- Create: `src/ui/lab/DanmakuLabDrawer.ts`
- Create: `src/ui/lab/LabPanel.ts`
- Create: `src/ui/lab/VideosPanel.ts`
- Create: `src/ui/lab/ThroughputPanel.ts`
- Create: `src/ui/lab/InteractionsPanel.ts`
- Create: `src/ui/lab/DevToolsInfoPanel.ts`
- Create: `test/DanmakuLabDrawer.test.ts`
- Create: `test/LabPanels.test.ts`

- [ ] **Step 1: Implement the drawer with native `Tabs`**

`DanmakuLabDrawer` composes `@vectojs/ui` `Tabs`, a visible Close action, and injected `TabItem` contents. Reuse Tabs' roving tabindex, arrow/Home/End behavior, visibility management, and horizontal overflow. The closed drawer contributes no focusable descendants. Each long panel owns at most one `ScrollView`.

- [ ] **Step 2: Keep Videos data generic**

`VideosPanel` receives `readonly VideoOption[]`, selected/candidate IDs, profile options, metadata rows, typed load state, and callbacks. It renders no fixed URLs, attribution names, or product copy. Bakudan adapts its concrete catalog into these values.

- [ ] **Step 3: Keep Throughput and Interactions engine-facing**

`ThroughputPanel` receives capacity, target/rate, profile distribution, frame percentiles, and draw-path counters. `InteractionsPanel` receives preset/effect availability and active render-class labels. Neither panel scans pool slots, reaches into Scheduler, or owns App state.

- [ ] **Step 4: Keep DevTools production-safe**

`DevToolsInfoPanel` only renders injected debug availability and a reload/open callback. It never imports `@vectojs/devtools`; Bakudan owns the dynamic debug plugin.

- [ ] **Step 5: Test responsive and a11y contracts**

At 420 px drawer width and 374 px mobile content width, assert bounded controls, one visible panel, logical tab order, no unnamed Dropdown/Slider, and no closed-drawer focus targets.

### Task 5: Publish the package and cut Bakudan over cleanly

**Files:**

- Create: `README.md`
- Create: `.changeset/<generated-name>.md`
- Modify: `package.json`
- Modify: `bakudan/package.json`
- Modify: `bakudan/bun.lock`
- Delete from Bakudan: every generic implementation moved into the package

- [ ] **Step 1: Document public contracts and ownership**

README includes model-only and UI examples, peer versions, theme/label injection, lifecycle cleanup, responsive layout inputs, and a boundary table showing what remains app-owned. Examples must compile and must not use Bakudan URLs or branding.

- [ ] **Step 2: Add the initial minor changeset**

```markdown
---
'@vectojs/danmaku-kit': minor
---

Add reusable deterministic track profiles and themeable canvas-native status, command, and laboratory UI for VectoJS danmaku applications.
```

- [ ] **Step 3: Run package gates**

```bash
bun run format
bun run format:check
bun run lint
bun test
bun run build
bun run lint:md
```

Expected: all exit 0 and built declarations expose only public peer types.

- [ ] **Step 4: Create the remote and use tag-triggered release**

Create `github.com/vectojs/danmaku-kit`, push the reviewed branch through the normal PR/CI flow, merge, and follow the package's tag-triggered publish workflow. Verify the package registry resolves the exact released version.

- [ ] **Step 5: Update Bakudan to the released semver**

```bash
bun add @vectojs/danmaku-kit@<released-version>
```

Never use `file:`, a symlink, workspace override, or copied package source in delivered Bakudan. Delete every migrated implementation and rerun the focused Bakudan integration tests.

### Task 6: Verify reuse and package boundaries end to end

**Files:**

- Create: `test/boundaries.test.ts`
- Modify only for observed defects: affected package or Bakudan files

- [ ] **Step 1: Enforce import direction**

Add a boundary test or locked `knip`/dependency rule proving:

- `danmaku-kit/src/model/**` imports no VectoJS UI module.
- `danmaku-kit` imports no Bakudan path/module.
- Bakudan owns all `cdn.vectojs.org/bakudan/` literals.
- Normal Bakudan entry imports no `@vectojs/devtools` statically.

- [ ] **Step 2: Build a minimal second-consumer smoke Scene**

In a package test/demo fixture, mount StatusBar + CommandDeck + LabDrawer with a neutral theme, two in-memory video options, and fake callbacks. Drive it through VMT/role APIs to prove the components work without Bakudan globals, CSS, URLs, or App.

- [ ] **Step 3: Verify cleanup and production bundle behavior**

Destroy the fixture Scene and assert no listeners/a11y nodes survive. In Bakudan's production build, confirm shared package UI is included once, model-only imports do not retain unused panels, and DevTools remains lazy.

- [ ] **Step 4: Record CarryCtx evidence**

Record exact package version, public exports, dependency direction, second-consumer smoke result, Bakudan cutover commit, and any deliberately app-owned component in both repositories' CarryCtx tasks.
