# Bakudan Video Catalog and Track Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reliable five-video test catalog, atomic video switching, deterministic weighted danmaku track profiles, and video-scoped user-comment persistence before the Cinema Overlay replaces the existing controls.

**Architecture:** Curated video metadata and profile values live in focused Bakudan model modules. Pure TrackProfile generation and generic video-source contracts move to `@vectojs/danmaku-kit/model`; `StageBackground` performs candidate-first source switching so failures preserve playback. Package-owned weighted generation wraps `DanmakuTrack` without claiming unsupported engine behavior. Public media is processed in `tmp/` and hosted on VectoJS R2; no new video binary enters Git.

**Tech Stack:** TypeScript 7, VectoJS Scene/Entity, native HTMLVideoElement, Bun test + happy-dom, FFmpeg/ffprobe, Cloudflare R2 via wrangler

---

## Dependency and execution order

Run in the Bakudan CTX-0008 worktree after the Jelly core package version is known, but this plan does not require Jelly to build. Complete its focused behavior first, then execute `2026-08-01-danmaku-kit-package.md` to move the pure TrackProfile builder and generic source contracts into the sibling package. This plan is not complete until Bakudan imports those released package APIs with no duplicate implementation. The concrete `VIDEO_CATALOG`, `TRACK_PROFILES`, persistence, StageBackground, and App integration remain here for the Cinema Overlay plan.

### Task 1: Prepare and publish five licensed test clips

**Files:**

- Temporary only: `tmp/video-sources/*`
- Cloudflare R2 objects: `cdn-vectojs/bakudan/video/*`
- No Git-tracked media files

- [ ] **Step 1: Create the ignored working directory**

```bash
mkdir -p tmp/video-sources
```

Expected: directory exists under the Bakudan repository and remains ignored by Git.

- [ ] **Step 2: Download the exact licensed sources**

```bash
curl -L "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" \
  -o tmp/video-sources/flower-source.mp4
curl -L "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" \
  -o tmp/video-sources/bbb-source.mp4
curl -L "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" \
  -o tmp/video-sources/sintel-source.mp4
curl -L "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" \
  -o tmp/video-sources/tears-source.mp4
```

Licensing recorded in catalog metadata:

- MDN flower asset: CC0 1.0.
- Big Buck Bunny: Blender Foundation, CC BY 3.0.
- Sintel: Blender Foundation, CC BY 3.0.
- Tears of Steel: Blender Foundation, CC BY 3.0.

Do not proceed if the official project license pages no longer support those terms.

- [ ] **Step 3: Produce bounded browser-test derivatives**

Use H.264 High profile-compatible video, AAC audio, `yuv420p`, and fast-start metadata:

```bash
ffmpeg -y -i tmp/video-sources/flower-source.mp4 -t 15 \
  -vf "scale=1280:-2:force_original_aspect_ratio=decrease,format=yuv420p" \
  -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart \
  tmp/video-sources/flower-seek-loop.mp4

ffmpeg -y -ss 30 -i tmp/video-sources/bbb-source.mp4 -t 30 \
  -vf "scale=1280:-2:force_original_aspect_ratio=decrease,format=yuv420p" \
  -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart \
  tmp/video-sources/bbb-motion.mp4

ffmpeg -y -ss 45 -i tmp/video-sources/sintel-source.mp4 -t 30 \
  -vf "scale=1280:-2:force_original_aspect_ratio=decrease,format=yuv420p" \
  -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart \
  tmp/video-sources/sintel-low-light.mp4

ffmpeg -y -ss 70 -i tmp/video-sources/tears-source.mp4 -t 30 \
  -vf "scale=1280:-2:force_original_aspect_ratio=decrease,format=yuv420p" \
  -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart \
  tmp/video-sources/tears-live-action.mp4

ffmpeg -y -ss 55 -i tmp/video-sources/sintel-source.mp4 -t 15 \
  -vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=720:1280,format=yuv420p" \
  -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart \
  tmp/video-sources/sintel-portrait.mp4
```

If a source has no audio stream, rerun its command with `-an`; do not synthesize silence.

- [ ] **Step 4: Verify duration, dimensions, codec, and fast-start playback**

```bash
for file in tmp/video-sources/{flower-seek-loop,bbb-motion,sintel-low-light,tears-live-action,sintel-portrait}.mp4; do
  ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,width,height,pix_fmt \
    -of json "$file"
done
```

Expected:

- All video streams report `h264` and `yuv420p`.
- Landscape clips are no wider than 1280 px.
- Portrait clip is 720×1280.
- Durations are 15 or 30 seconds within normal container tolerance.

- [ ] **Step 5: Upload to R2 with stable keys**

```bash
wrangler r2 object put cdn-vectojs/bakudan/video/flower-seek-loop.mp4 \
  --file tmp/video-sources/flower-seek-loop.mp4 --content-type video/mp4 --remote
wrangler r2 object put cdn-vectojs/bakudan/video/bbb-motion.mp4 \
  --file tmp/video-sources/bbb-motion.mp4 --content-type video/mp4 --remote
wrangler r2 object put cdn-vectojs/bakudan/video/sintel-low-light.mp4 \
  --file tmp/video-sources/sintel-low-light.mp4 --content-type video/mp4 --remote
wrangler r2 object put cdn-vectojs/bakudan/video/tears-live-action.mp4 \
  --file tmp/video-sources/tears-live-action.mp4 --content-type video/mp4 --remote
wrangler r2 object put cdn-vectojs/bakudan/video/sintel-portrait.mp4 \
  --file tmp/video-sources/sintel-portrait.mp4 --content-type video/mp4 --remote
```

- [ ] **Step 6: Verify every CDN response before writing code references**

```bash
for name in flower-seek-loop bbb-motion sintel-low-light tears-live-action sintel-portrait; do
  curl -fsSI "https://cdn.vectojs.org/bakudan/video/$name.mp4"
done
```

Expected for every object: HTTP 200, `content-type: video/mp4`, a stable `content-length`, and byte-range support from the CDN path. Record the five verified URLs and source-license evidence in CarryCtx.

### Task 2: Define the catalog contract and curated entries

**Files:**

- Create: `src/model/VideoCatalog.ts`
- Create: `test/VideoCatalog.test.ts`
- Modify: `src/model/types.ts`

- [ ] **Step 1: Write failing catalog invariants**

Create `test/VideoCatalog.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { DEFAULT_VIDEO_ID, VIDEO_CATALOG, videoById } from '../src/model/VideoCatalog';

describe('VideoCatalog', () => {
  it('contains five stable test entries with unique ids', () => {
    expect(VIDEO_CATALOG).toHaveLength(5);
    expect(new Set(VIDEO_CATALOG.map((entry) => entry.id)).size).toBe(5);
  });

  it('uses HTTPS CDN sources and names a default track profile', () => {
    for (const entry of VIDEO_CATALOG) {
      expect(entry.source.kind).toBe('cdn');
      expect(entry.source.url.startsWith('https://cdn.vectojs.org/bakudan/video/')).toBe(true);
      expect(entry.defaultTrackProfileId.length).toBeGreaterThan(0);
    }
  });

  it('preserves attribution for CC BY derivatives', () => {
    const attributed = VIDEO_CATALOG.filter((entry) => entry.attribution);
    expect(attributed).toHaveLength(4);
    expect(attributed.every((entry) => entry.attribution!.license === 'CC BY 3.0')).toBe(true);
  });

  it('resolves the default id and rejects unknown ids', () => {
    expect(videoById(DEFAULT_VIDEO_ID)?.id).toBe(DEFAULT_VIDEO_ID);
    expect(videoById('missing')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
bun test test/VideoCatalog.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add shared catalog types**

Add to `src/model/types.ts`:

```ts
export type VideoTestTag =
  | 'motion'
  | 'bright'
  | 'low-light'
  | 'animation'
  | 'portrait'
  | 'seek-loop';

export interface VideoAttribution {
  label: string;
  url: string;
  license: 'CC BY 3.0';
}

export interface VideoCatalogEntry {
  id: string;
  title: string;
  source: { kind: 'cdn' | 'external'; url: string };
  durationHint: number;
  aspectRatio: number;
  testTags: VideoTestTag[];
  defaultTrackProfileId: string;
  attribution?: VideoAttribution;
}
```

- [ ] **Step 4: Implement the five immutable entries**

Create `src/model/VideoCatalog.ts` with the verified CDN URLs:

```ts
import type { VideoCatalogEntry } from './types';

const BLENDER_ATTRIBUTION = {
  url: 'https://studio.blender.org/films/',
  license: 'CC BY 3.0' as const,
};

export const VIDEO_CATALOG: readonly VideoCatalogEntry[] = Object.freeze([
  {
    id: 'flower-seek-loop',
    title: 'Flower Seek Loop',
    source: { kind: 'cdn', url: 'https://cdn.vectojs.org/bakudan/video/flower-seek-loop.mp4' },
    durationHint: 15,
    aspectRatio: 16 / 9,
    testTags: ['bright', 'seek-loop'],
    defaultTrackProfileId: 'natural-peaks',
  },
  {
    id: 'bbb-motion',
    title: 'Big Buck Bunny · Motion',
    source: { kind: 'cdn', url: 'https://cdn.vectojs.org/bakudan/video/bbb-motion.mp4' },
    durationHint: 30,
    aspectRatio: 16 / 9,
    testTags: ['motion', 'animation'],
    defaultTrackProfileId: 'peak-event',
    attribution: { ...BLENDER_ATTRIBUTION, label: 'Big Buck Bunny · Blender Foundation' },
  },
  {
    id: 'sintel-low-light',
    title: 'Sintel · Low Light',
    source: { kind: 'cdn', url: 'https://cdn.vectojs.org/bakudan/video/sintel-low-light.mp4' },
    durationHint: 30,
    aspectRatio: 16 / 9,
    testTags: ['low-light', 'animation'],
    defaultTrackProfileId: 'style-showcase',
    attribution: { ...BLENDER_ATTRIBUTION, label: 'Sintel · Blender Foundation' },
  },
  {
    id: 'tears-live-action',
    title: 'Tears of Steel · Live Action',
    source: { kind: 'cdn', url: 'https://cdn.vectojs.org/bakudan/video/tears-live-action.mp4' },
    durationHint: 30,
    aspectRatio: 16 / 9,
    testTags: ['motion', 'low-light'],
    defaultTrackProfileId: 'flood',
    attribution: { ...BLENDER_ATTRIBUTION, label: 'Tears of Steel · Blender Foundation' },
  },
  {
    id: 'sintel-portrait',
    title: 'Sintel · Portrait Crop',
    source: { kind: 'cdn', url: 'https://cdn.vectojs.org/bakudan/video/sintel-portrait.mp4' },
    durationHint: 15,
    aspectRatio: 9 / 16,
    testTags: ['portrait', 'animation'],
    defaultTrackProfileId: 'natural-peaks',
    attribution: { ...BLENDER_ATTRIBUTION, label: 'Sintel derivative · Blender Foundation' },
  },
]);

export const DEFAULT_VIDEO_ID = 'flower-seek-loop';

export function videoById(id: string): VideoCatalogEntry | undefined {
  return VIDEO_CATALOG.find((entry) => entry.id === id);
}
```

- [ ] **Step 5: Format and run the catalog test**

```bash
bun run format
bun test test/VideoCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the catalog**

```bash
git add src/model/types.ts src/model/VideoCatalog.ts test/VideoCatalog.test.ts
git commit -m "feat: add licensed video catalog"
```

### Task 3: Build deterministic weighted track profiles

**Files:**

- Create: `src/model/TrackProfiles.ts`
- Create: `test/TrackProfiles.test.ts`
- Modify: `src/model/demoTimedTrack.ts`

- [ ] **Step 1: Write failing profile-generation tests**

Create `test/TrackProfiles.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildProfiledTrack, TRACK_PROFILES } from '../src/model/TrackProfiles';

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe('TrackProfiles', () => {
  it('defines all four approved profiles', () => {
    expect([...TRACK_PROFILES.keys()]).toEqual([
      'natural-peaks',
      'peak-event',
      'flood',
      'style-showcase',
    ]);
  });

  it('returns sorted entries plus an exact resolved distribution', () => {
    const result = buildProfiledTrack(20, TRACK_PROFILES.get('style-showcase')!, {
      random: sequence([0.1, 0.4, 0.7, 0.9]),
      sampleText: () => 'test',
    });

    expect(result.entries.length).toBe(result.resolved.entries);
    expect(result.entries.every((entry, index, all) => index === 0 || all[index - 1]!.time <= entry.time)).toBe(true);
    expect(Object.values(result.resolved.presetCounts).reduce((sum, value) => sum + value, 0)).toBe(result.entries.length);
  });

  it('is deterministic when random and text sampling are injected', () => {
    const profile = TRACK_PROFILES.get('natural-peaks')!;
    const make = () => buildProfiledTrack(15, profile, {
      random: sequence([0.2, 0.8, 0.3, 0.6]),
      sampleText: () => 'same',
    });
    expect(make()).toEqual(make());
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

```bash
bun test test/TrackProfiles.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Define profile and generated-track contracts**

In `src/model/TrackProfiles.ts`, define:

```ts
import type { CharacterEffects, PresetId, TimedDanmakuEntry } from './types';

export interface TrackProfile {
  id: string;
  label: string;
  averagePerSecond: number;
  peakPerSecond: number;
  clusterRatio: number;
  maxEntries: number;
  presetWeights: Partial<Record<PresetId, number>>;
  effectWeights?: Partial<Record<keyof CharacterEffects, number>>;
}

export interface ProfiledTimedDanmakuEntry extends TimedDanmakuEntry {
  effects: CharacterEffects;
}

export interface ResolvedTrackDistribution {
  entries: number;
  presetCounts: Partial<Record<PresetId, number>>;
  effectCounts: Partial<Record<keyof CharacterEffects, number>>;
}

export interface ProfiledTrackResult {
  entries: ProfiledTimedDanmakuEntry[];
  resolved: ResolvedTrackDistribution;
}
```

- [ ] **Step 4: Implement weighted picking and deterministic generation**

Use injected randomness and no hidden global state:

```ts
function weightedPick<T extends string>(weights: Partial<Record<T, number>>, random: () => number): T {
  const rows = Object.entries(weights).filter(([, weight]) => Number(weight) > 0) as Array<[T, number]>;
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  if (rows.length === 0 || total <= 0) throw new Error('weighted distribution is empty');
  let cursor = random() * total;
  for (const [value, weight] of rows) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return rows[rows.length - 1]![0];
}

function effectSample(
  weights: TrackProfile['effectWeights'],
  random: () => number,
): CharacterEffects {
  return {
    glow: random() < (weights?.glow ?? 0),
    gradient: random() < (weights?.gradient ?? 0),
    rainbow: random() < (weights?.rainbow ?? 0),
    outline: random() < (weights?.outline ?? 0),
  };
}
```

`buildProfiledTrack` computes a bounded entry count from `averagePerSecond`, chooses evenly spaced peak centers, places `clusterRatio` of entries with a bounded Box–Muller offset around those centers, assigns weighted presets/effects, sorts by time, and increments exact preset/effect counters from the resolved entries. Clamp every time to `[0.1, duration - 0.1]` and every count to `maxEntries`.

Define the four approved profiles in insertion order in `TRACK_PROFILES: ReadonlyMap<string, TrackProfile>`.

- [ ] **Step 5: Replace the old generator wrapper**

Change `generateLargeTimedTrack` in `src/model/demoTimedTrack.ts` to accept a `TrackProfile`, call `buildProfiledTrack`, merge only the current video's saved user comments, sort once, and return `ProfiledTrackResult`. Remove the unused `DEMO_TIMED_TRACK` export unless it is wired exclusively to `flower-seek-loop` with a tested branch.

- [ ] **Step 6: Format and run model tests**

```bash
bun run format
bun test test/TrackProfiles.test.ts test/ContentLibrary.test.ts
```

Expected: PASS and deterministic output.

- [ ] **Step 7: Commit profile generation**

```bash
git add src/model/TrackProfiles.ts src/model/demoTimedTrack.ts test/TrackProfiles.test.ts
git commit -m "feat: add weighted track profiles"
```

### Task 4: Scope persisted user comments by video

**Files:**

- Create: `src/model/UserDanmakuStore.ts`
- Create: `test/UserDanmakuStore.test.ts`
- Modify: `src/model/demoTimedTrack.ts`

- [ ] **Step 1: Write failing isolation and corruption tests**

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { loadUserDanmakus, saveUserDanmaku, storageKeyForVideo } from '../src/model/UserDanmakuStore';

beforeEach(() => localStorage.clear());

describe('UserDanmakuStore', () => {
  it('isolates entries by video id', () => {
    saveUserDanmaku('video-a', { time: 1, text: 'A' });
    saveUserDanmaku('video-b', { time: 2, text: 'B' });
    expect(loadUserDanmakus('video-a').map((entry) => entry.text)).toEqual(['A']);
    expect(loadUserDanmakus('video-b').map((entry) => entry.text)).toEqual(['B']);
  });

  it('drops only the corrupt video payload', () => {
    localStorage.setItem(storageKeyForVideo('bad'), '{');
    saveUserDanmaku('good', { time: 1, text: 'kept' });
    expect(loadUserDanmakus('bad')).toEqual([]);
    expect(loadUserDanmakus('good')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
bun test test/UserDanmakuStore.test.ts
```

Expected: FAIL because the scoped store does not exist.

- [ ] **Step 3: Implement versioned scoped keys and runtime validation**

Use:

```ts
const STORAGE_PREFIX = 'bakudan:v1:user-danmaku:';

export function storageKeyForVideo(videoId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(videoId)}`;
}
```

`loadUserDanmakus(videoId)` parses only arrays and keeps entries with finite non-negative `time` and non-empty string `text`. On parse/validation failure, remove only that video's key and return `[]`. `saveUserDanmaku(videoId, entry)` appends to that list.

For custom URLs, derive `videoId` from a normalized URL using a stable, non-cryptographic FNV-1a hash implemented in this module. The ID is local namespacing only; document that it is not authentication or a security boundary.

- [ ] **Step 4: Update profile merging**

Pass `videoId` into the app-side track builder wrapper. Merge only `loadUserDanmakus(videoId)` entries whose time is inside the candidate duration.

- [ ] **Step 5: Format and run persistence/profile tests**

```bash
bun run format
bun test test/UserDanmakuStore.test.ts test/TrackProfiles.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit scoped persistence**

```bash
git add src/model/UserDanmakuStore.ts src/model/demoTimedTrack.ts test/UserDanmakuStore.test.ts
git commit -m "feat: scope user danmaku by video"
```

### Task 5: Make StageBackground switching atomic

**Files:**

- Modify: `src/view/StageBackground.ts`
- Create: `test/StageBackground.test.ts`

- [ ] **Step 1: Write a failing candidate-preservation test**

Add a small `videoFactory` injection to the planned constructor and test with controllable video elements:

```ts
it('keeps the active video when a candidate fails', async () => {
  const host = document.createElement('div');
  host.id = 'bakudan-bg';
  document.body.appendChild(host);
  const videos: HTMLVideoElement[] = [];
  const bg = new StageBackground({
    host,
    videoFactory: () => {
      const video = document.createElement('video');
      videos.push(video);
      return video;
    },
  });

  const first = bg.setVideo('https://example.test/first.mp4');
  videos[0]!.dispatchEvent(new Event('loadedmetadata'));
  await first;
  expect(bg.currentSource).toBe('https://example.test/first.mp4');

  const second = bg.setVideo('https://example.test/bad.mp4');
  videos[1]!.dispatchEvent(new Event('error'));
  await expect(second).rejects.toMatchObject({ code: 'media-error' });
  expect(bg.currentSource).toBe('https://example.test/first.mp4');
  expect(host.contains(videos[0]!)).toBe(true);
  bg.destroy();
});
```

- [ ] **Step 2: Run and verify failure**

```bash
bun test test/StageBackground.test.ts
```

Expected: FAIL because switching currently removes the active video first and no typed error/current source exists.

- [ ] **Step 3: Define typed source errors and injectable construction**

Add:

```ts
export type VideoLoadErrorCode =
  | 'network-error'
  | 'media-error'
  | 'metadata-error'
  | 'playback-rejected';

export class VideoLoadError extends Error {
  constructor(readonly code: VideoLoadErrorCode, message: string) {
    super(message);
    this.name = 'VideoLoadError';
  }
}

export interface StageBackgroundOptions {
  host?: HTMLElement | null;
  videoFactory?: () => HTMLVideoElement;
}
```

The default factory is `() => document.createElement('video')`. Expose `currentSource` as a read-only getter.

- [ ] **Step 4: Implement candidate-first switching**

`setVideo(src)` must:

1. Create/configure a candidate without touching `_video`.
2. Wait for `loadedmetadata` and reject on `error`.
3. Append the candidate hidden to the host.
4. Copy current playback rate.
5. Swap `_video` and `_videoSrc` only after metadata succeeds.
6. Remove listeners, pause, clear, load, and remove the previous video.
7. Apply current mode visibility to the candidate.

If a candidate fails, remove only the candidate and leave current playback untouched. Update the stale method comment that still claims frames are drawn with `renderer.drawImage`.

- [ ] **Step 5: Add success, failure, and destroy coverage**

Cover successful replacement, candidate cleanup on error, previous-video disposal after success, playback-rate preservation, and `destroy()` removing whichever candidate/active video exists.

- [ ] **Step 6: Format and run focused tests**

```bash
bun run format
bun test test/StageBackground.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit atomic switching**

```bash
git add src/view/StageBackground.ts test/StageBackground.test.ts
git commit -m "fix: preserve video during source switching"
```

### Task 6: Integrate catalog and profiles into the current app state

**Files:**

- Modify: `src/view/App.ts`
- Modify: `src/view/ControlCenter.ts`
- Modify: `src/model/i18n.ts`
- Create: `test/VideoSelection.test.ts`

- [ ] **Step 1: Add a failing selection-state test around a pure helper**

Create a pure helper in `VideoCatalog.ts` and test it before wiring UI:

```ts
it('resolves catalog ids and ephemeral custom URLs without conflating them', () => {
  expect(resolveVideoSelection({ kind: 'catalog', id: 'flower-seek-loop' }).id).toBe(
    'flower-seek-loop',
  );
  const custom = resolveVideoSelection({ kind: 'custom', url: 'https://example.test/a.mp4' });
  expect(custom.id.startsWith('custom-')).toBe(true);
  expect(custom.source.kind).toBe('external');
});
```

- [ ] **Step 2: Replace URL identity with catalog identity in App**

Replace `currentVideoUrl` with:

```ts
currentVideoId = DEFAULT_VIDEO_ID;
currentTrackProfileId = videoById(DEFAULT_VIDEO_ID)!.defaultTrackProfileId;
```

Resolve the selected entry once in `_onVideoSourceChange`. Set `videoLoading` for the candidate, but update `currentVideoId`, track state, and playback controls only after `StageBackground.setVideo` resolves. On rejection, keep all current selection/playback state and expose the typed error message.

- [ ] **Step 3: Consume profiled entries when the video fires**

Store the generated `ProfiledTrackResult` and construct `DanmakuTrack` from `result.entries`. In `_frameVideo`, preserve entry-level effects:

```ts
effects: entry.effects ?? { ...this.effects },
```

Use the current `videoId` when loading/saving user comments.

- [ ] **Step 4: Make ControlCenter consume catalog/profile values directly**

Remove its local `VIDEO_SOURCES` constant. Pass `VIDEO_CATALOG`, the selected video ID, `TRACK_PROFILES`, and the selected profile ID into the constructor. Dropdown callbacks return IDs, not labels or URLs. Add accessible names to the two dropdowns while touching them.

- [ ] **Step 5: Update localized field labels and error text**

Add exact keys for Track Profile, Custom Video URL, Retry, Choose another source, and typed video errors across all five existing languages. English source strings remain the key reference; no raw English error is emitted from `App` into a localized panel.

- [ ] **Step 6: Run app gates**

```bash
bun run format
bun run format:check
bun run lint
bun test
bun run build
```

Expected: all pass; the existing UI can select all five catalog videos and profile IDs even before the Cinema Overlay visual replacement.

- [ ] **Step 7: Commit working multi-video behavior**

```bash
git add src/view/App.ts src/view/ControlCenter.ts src/model/i18n.ts test/VideoSelection.test.ts
git commit -m "feat: integrate video catalog and profiles"
```
