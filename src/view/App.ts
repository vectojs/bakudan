import { ReactionStore } from '../model/ReactionStore';
import { type HoveredAction, SelectionHotspots } from './SelectionHotspots';
import { installKeyboardShortcuts } from './KeyboardShortcuts';

import { Entity, Scene } from '@vectojs/core';
import { DanmakuPool, Scheduler } from '@vectojs/danmaku-core';
import type { CharacterEffects, PoolSlot, PresetId } from '@vectojs/danmaku-core';
import { VideoSourceError } from '@vectojs/danmaku-kit/model';
import type { VideoLoadState, VideoSelection } from '@vectojs/danmaku-kit/model';
import {
  DanmakuCommandDeck,
  DanmakuLabDrawer,
  DanmakuStatusBar,
  DevToolsInfoPanel,
  InteractionsPanel,
  ThroughputPanel,
  VideosPanel,
} from '@vectojs/danmaku-kit/ui';
import type {
  CommandDeckGroupId,
  DanmakuStatusKind,
  DevToolsAvailability,
  VideoCatalogRow,
} from '@vectojs/danmaku-kit/ui';
import { ContentLibrary } from '../model/ContentLibrary';
import { FrameProfiler } from '../model/FrameProfiler';
import { PRESET_TRANSLATIONS, detectBrowserLanguage, t } from '../model/i18n';
import type { Language } from '../model/i18n';
import { generateLargeTimedTrack } from '../model/demoTimedTrack';
import { ProfiledDanmakuTrack, TRACK_PROFILES } from '../model/TrackProfiles';
import { saveUserDanmaku } from '../model/UserDanmakuStore';
import {
  DEFAULT_VIDEO_ID,
  VIDEO_CATALOG,
  resolveVideoSelection,
  videoById,
} from '../model/VideoCatalog';
import { DanmakuAnnouncer } from './DanmakuAnnouncer';
import {
  exitFullscreenIn,
  fullscreenElementOf,
  installFullscreenListeners,
  requestFullscreenOn,
} from './Fullscreen';

import {
  DanmakuLayer,
  paintOrderKey,
  PILL_BASELINE_FACTOR,
  PILL_COPY_OFFSET_PX,
  PILL_HEIGHT_PX,
  PILL_WIDTH_PX,
} from './DanmakuLayer';
import { loadMSDFAtlas } from './MSDFAtlas';
import type { StageBackgroundOptions } from './StageBackground';
import { BAKUDAN_THEME, cinemaLabelsFor } from './cinemaConfig';

const DESKTOP_POOL = 20_000;
const MOBILE_POOL = 5_000;
const MOBILE_BREAKPOINT = 768;
const STATUS_UPDATE_INTERVAL_MS = 500;
const A11Y_UPDATE_INTERVAL_MS = 2000;
const DESKTOP_DRAWER_RATIO = 0.46;
const MOBILE_DRAWER_RATIO = 0.69;
const OVERLAY_MARGIN_DESKTOP = 16;
const OVERLAY_MARGIN_MOBILE = 8;
const COMMAND_DECK_MAX_WIDTH = 960;
// Compose / transport / utility clusters (danmaku-kit#15): the flat uniform-gap
// row read as one loose ~760px spread at desktop width, where modern players
// cluster controls into three plates. groupGap only widens boundaries BETWEEN
// clusters; intra-cluster spacing keeps the ordinary gap. The compact layout
// ignores grouping by design -- its two width-starved rows collapse clusters
// rather than risk unusable control widths.
const COMMAND_DECK_GROUPS: readonly CommandDeckGroupId[][] = [
  ['input', 'send'],
  ['play', 'timeline', 'elapsed'],
  ['rate', 'lab'],
];
// Cluster-boundary separation. At the narrowest desktop viewport (768px ->
// deck 736px) fixed control widths plus two 24px boundaries still leave the
// flexible input well ~95px; below 768px compact takes over and ignores this.
const COMMAND_DECK_GROUP_GAP_PX = 24;
const FRAME_METRICS = ['fps', 'frame-time'] as const;
const DRAW_METRICS = ['gl-runs', 'gl-glyphs', 'canvas-slots'] as const;
const DISTRIBUTIONS = ['steady', 'bursty'] as const;
const EFFECT_IDS = ['glow', 'gradient', 'rainbow', 'outline'] as const;
const RENDER_CLASSES = ['backend', 'glyphs', 'canvas'] as const;

type AppMode = 'stress' | 'video';

type LabTab = 'videos' | 'throughput' | 'interactions' | 'devtools';
type FrameMetricId = (typeof FRAME_METRICS)[number];
type DrawMetricId = (typeof DRAW_METRICS)[number];
type DistributionId = (typeof DISTRIBUTIONS)[number];
type EffectId = (typeof EFFECT_IDS)[number];
type RenderClassId = (typeof RENDER_CLASSES)[number];

import { StageBackground } from './StageBackground';

export interface AppOptions {
  stageBackground?: StageBackground;
  stageBackgroundOptions?: StageBackgroundOptions;
}

class Ticker extends Entity {
  constructor(readonly app: App) {
    super();
  }

  isPointInside(_gx: number, _gy: number): boolean {
    return false;
  }

  render(): void {}

  update(dt: number): void {
    this.app.frame(dt);
  }

  hasPendingAnimations(): boolean {
    return (
      this.app.pool.activeCount > 0 ||
      this.app.isDragging ||
      this.app.isVideoPlaying ||
      this.app.hasAmbientAnimation
    );
  }
}

export class App {
  readonly scene: Scene;
  readonly pool: DanmakuPool;
  readonly scheduler: Scheduler;

  private stageW = 0;
  private stageH = 0;
  private isMobile = false;

  private bg: StageBackground;
  private danmakuLayer!: DanmakuLayer;
  private announcer: DanmakuAnnouncer;
  private statusBar!: DanmakuStatusBar;
  private commandDeck!: DanmakuCommandDeck;
  private labDrawer!: DanmakuLabDrawer<LabTab>;
  private videosPanel!: VideosPanel<string>;
  private throughputPanel!: ThroughputPanel<DistributionId, FrameMetricId, DrawMetricId>;
  private interactionsPanel!: InteractionsPanel<PresetId, EffectId, RenderClassId>;
  private devtoolsPanel!: DevToolsInfoPanel;
  private ticker: Ticker | null = null;
  private started = false;
  private destroyed = false;
  private _profSpawnRate: number | null = null;
  private _profTargetCount: number | null = null;
  private _profMode: string | null = 'video';

  /** Exposed so render-heavy nodes can mark their own phases. */
  readonly profilerRef = () => this.profiler;

  private profiler = new FrameProfiler(() => ({
    activeDanmaku: this.pool.activeCount,
    ratePerSec: this._profSpawnRate,
    targetCount: this._profTargetCount,
    mode: this._profMode,
    glyphCacheHitPct: Math.round(this._measureTextHitRate * 10) / 10,
    drawPath: this.danmakuLayer ? { ...this.danmakuLayer.drawStats } : undefined,
    heapUsedMB: this._heapUsedMB,
    userAgent: navigator.userAgent,
  }));

  /** Null only between construction and the store's first assignment below. */
  private _reactionStore: ReactionStore | null = null;
  private _selectedSlotId: number | null = null;
  /** Which action of the selected danmaku's pill the pointer is over. */
  private _hoveredAction: HoveredAction = null;
  /**
   * Persisted like count of the selected danmaku, cached here so the render
   * path never calls ReactionStore.get() per frame (it parses localStorage).
   */
  private _selectedLikeCount = 0;
  private readonly _selectionHotspots: SelectionHotspots;

  private _disposeShortcuts: (() => void) | null = null;
  private _disposeFullscreen: (() => void) | null = null;
  private _isFullscreen = false;

  private labOpen = false;

  private activeLabTab: LabTab = 'videos';
  private distributionId: DistributionId = 'steady';
  private videoLoadState: VideoLoadState = { status: 'idle' };
  private currentVideoSelection: VideoSelection = {
    kind: 'catalog',
    id: DEFAULT_VIDEO_ID,
  };
  private pendingVideoSelection: VideoSelection | null = null;
  private pendingTrackProfileId: string | null = null;
  /**
   * Live blob: object URLs minted for local uploads, newest last. The active
   * source's URL stays listed; everything else is revoked once a swap lands
   * (or on destroy), so a failed load keeps the previous video usable.
   */
  private _localObjectUrls: string[] = [];
  private devtoolsAvailability: DevToolsAvailability = import.meta.env.DEV
    ? 'reload-required'
    : 'unavailable';
  private _viewportTop = 0;
  private _viewportBottom: number | null = null;

  private mode: AppMode = 'video';
  private danmakuTrack!: ProfiledDanmakuTrack;
  private videoLoading = false;
  private _videoBuffering = false;
  private _videoRequestId = 0;
  private _stressTargetBeforeVideo = 500;

  // Language and stable video/profile identity.
  currentLang: Language;
  currentVideoId = DEFAULT_VIDEO_ID;
  currentTrackProfileId = videoById(DEFAULT_VIDEO_ID)!.defaultTrackProfileId;

  private _frameTimeMs = 16.67;
  private _measureTextHitRate = 100;
  private _heapUsedMB: number | null = null;

  /** True while a danmaku is being dragged. */
  get isDragging(): boolean {
    return this._dragSlot !== null;
  }

  /** True while a background video is actively playing. */
  get isVideoPlaying(): boolean {
    return this.mode === 'video' && this.bg.isVideoReady && !this.bg.paused;
  }

  /**
   * True while the background itself needs a redraw every frame.
   *
   * Always `false` today, deliberately. The DOM background layer shows either
   * a `<video>` element — already covered by `isVideoPlaying` — or the page
   * surface itself; neither gives the canvas anything new to draw, so no
   * background state forces frames.
   *
   * This getter previously returned `true` for the removed ambient-gradient
   * background mode, then its default. That single stale predicate defeated
   * render-on-demand for the whole app: `hasPendingAnimations()` never went
   * false at idle, so the scene stayed pinned at `maxFPS: 240` forever and the
   * status bar's own "idle throttle" state was unreachable. Keep the seam — if
   * an animated background ever ships, this is where it gets reported.
   */
  get hasAmbientAnimation(): boolean {
    return false;
  }

  private activePreset: PresetId = 'scroll';
  private effects: CharacterEffects = {
    glow: false,
    gradient: false,
    rainbow: false,
    outline: false,
  };
  private pointerX = 0;
  private pointerY = 0;
  private pointerActive = false;

  private _interactiveMode = false;
  private _dragSlot: PoolSlot | null = null;
  private _dragOffX = 0;
  private _dragOffY = 0;

  private _frameAccumMs = 0;
  private _frameCount = 0;
  private _lastFps = 60;
  private _lastA11y = 0;

  constructor(scene: Scene, options: AppOptions = {}) {
    this.scene = scene;
    this.currentLang = detectBrowserLanguage();

    const isMobileInit = window.innerWidth < MOBILE_BREAKPOINT;
    const poolCap = isMobileInit ? MOBILE_POOL : DESKTOP_POOL;
    this.isMobile = isMobileInit;

    this.pool = new DanmakuPool(poolCap);
    this.scheduler = new Scheduler(
      this.pool,
      window.innerWidth,
      window.innerHeight,
      isMobileInit ? 200 : 500,
      // Inject the localized meme content — the engine ships no wording.
      { textSampler: () => ContentLibrary.sample() },
    );

    // Reactions key off the default video until a real selection re-keys the
    // store — stress mode must be able to like/copy too, not just video mode.
    this._reactionStore = new ReactionStore(this.currentVideoId);
    this._selectionHotspots = new SelectionHotspots({
      onLikeToggle: () => this._handleLikeToggle(),
      onCopy: () => this._handleCopy(),
      onDismiss: () => this.dismiss(),
      likeLabel: () => 'Like Danmaku',
      copyLabel: () => 'Copy Danmaku Text',
    });
    this.scene.add(this._selectionHotspots);

    this.bg = options.stageBackground ?? new StageBackground(options.stageBackgroundOptions);
    this.bg.onBufferingChange((buffering) => {
      if (this.destroyed) return;
      this._videoBuffering = buffering;
      // No markDirty() here: the kit's setStatus() marks the scene dirty itself
      // whenever the state actually changes.
      this._syncStatus();
    });
    this.announcer = new DanmakuAnnouncer();
    this._stressTargetBeforeVideo = isMobileInit ? 200 : 500;
    this._profTargetCount = this._stressTargetBeforeVideo;
    this._profSpawnRate = this.scheduler.rate;
    this.scheduler.setTargetCount(0);

    const initialProfile = TRACK_PROFILES.get(this.currentTrackProfileId)!;
    const initialTrack = generateLargeTimedTrack(15, initialProfile, this.currentVideoId);
    this.danmakuTrack = new ProfiledDanmakuTrack(initialTrack.entries);

    // One batch-painting node for the entire stress pool (see DanmakuLayer).
    this.danmakuLayer = new DanmakuLayer(this.pool, () => ({
      w: this.stageW,
      h: this.stageH,
      interactive: this._interactiveMode,
      hoveredAction: this._hoveredAction,
      likeCount: this._selectedLikeCount,
      pausedLabel: cinemaLabelsFor(this.currentLang).kit.status.paused,
      // Top-bar safe zone (round 3): chips must never paint under the opaque
      // status bar - the r2 QA hover capture had a chip vanish behind it.
      // Read live from the placed kit bar rather than duplicating its height.
      safeTop: this.statusBar ? this.statusBar.y + this.statusBar.height : 0,
    }));
    this.danmakuLayer.profiler = this.profiler;
    // Wrap the GL renderer's flush() so the GPU submit is timed separately from
    // the JS batching loop. Scene calls flush() once per render pass, after every
    // node has pushed its quads — so this isolates drawArrays + buffer upload.
    const pr = (this.scene as unknown as { pointRenderer?: { flush: () => void } }).pointRenderer;
    if (pr && !(pr as { __profWrapped?: boolean }).__profWrapped) {
      const orig = pr.flush.bind(pr);
      pr.flush = () => {
        this.profiler.beginPhase('gpu.flush');
        orig();
        this.profiler.endPhase('gpu.flush');
      };
      (pr as { __profWrapped?: boolean }).__profWrapped = true;
    }

    scene.add(this.bg);
    scene.add(this.danmakuLayer);
    scene.add(this.announcer);
    this._buildUI();
  }

  /** Compose package surfaces once with Bakudan-owned data and actions. */
  private _buildUI(): void {
    const labels = cinemaLabelsFor(this.currentLang);
    const catalog: VideoCatalogRow[] = VIDEO_CATALOG.map((entry) => ({
      ...entry,
      metadata: [
        { label: 'Duration', value: `${entry.durationHint}s` },
        { label: 'Aspect', value: `${entry.aspectRatio}` },
        { label: 'Coverage', value: entry.testTags.join(', ') || 'custom' },
      ],
      attribution: entry.attribution
        ? `${entry.attribution.label} · ${entry.attribution.license} · ${entry.attribution.url}`
        : '',
    }));
    const profiles = [...TRACK_PROFILES.values()].map((profile) => ({
      id: profile.id,
      label: profile.label,
      description:
        `${profile.averagePerSecond}/s average · ${profile.peakPerSecond}/s peak · ` +
        `${Math.round(profile.clusterRatio * 100)}% clustered`,
    }));

    this.statusBar = new DanmakuStatusBar({
      width: window.innerWidth,
      product: labels.kit.product,
      labels: labels.kit,
      theme: BAKUDAN_THEME,
      compact: this.isMobile,
    });
    this.commandDeck = new DanmakuCommandDeck({
      width: Math.min(COMMAND_DECK_MAX_WIDTH, Math.max(1, window.innerWidth - 32)),
      labels: labels.kit,
      theme: BAKUDAN_THEME,
      compact: this.isMobile,
      labOpen: this.labOpen,
      groups: COMMAND_DECK_GROUPS,
      groupGap: COMMAND_DECK_GROUP_GAP_PX,
      callbacks: {
        onSend: (text) => this._onUserSend(text),
        onPlayPause: () => this._togglePlayback(),
        onSeek: (time) => this._onSeek(time),
        onRateChange: (rate) => {
          this.bg.playbackRate = rate;
          this._syncPlaybackState();
        },
        onToggleLab: () => this.setLabOpen(!this.labOpen),
      },
    });
    this.videosPanel = new VideosPanel({
      theme: BAKUDAN_THEME,
      labels: labels.panels.videos,
      state: {
        source: this.currentVideoSelection,
        profileId: this.currentTrackProfileId,
        loadState: this.videoLoadState,
      },
      catalog,
      profiles,
      onChoose: (selection) => this.selectVideo(selection.source, selection.profileId),
      // Kit 0.8.0 renders its own local-file upload button when this is set;
      // the kit owns the picker, App owns the blob: object-URL lifecycle.
      onUploadFile: (file) => this._onLocalFilePicked(file),
      onRetry: () => this._retryVideo(),
    });
    this.throughputPanel = new ThroughputPanel({
      theme: BAKUDAN_THEME,
      labels: labels.panels.throughput,
      state: this._throughputState(),
      distributions: [
        { id: 'steady', label: 'Steady' },
        { id: 'bursty', label: 'Bursty' },
      ],
      frameMetrics: [
        { id: 'fps', label: 'FPS' },
        { id: 'frame-time', label: 'Frame ms' },
      ],
      drawMetrics: [
        { id: 'gl-runs', label: 'GL runs' },
        { id: 'gl-glyphs', label: 'GL glyphs' },
        { id: 'canvas-slots', label: 'Canvas slots' },
      ],
      targetRange: { min: 0, max: this.pool.capacity, step: 100 },
      quickTargets: this.isMobile
        ? [
            { value: 1000, label: '1K' },
            { value: 2500, label: '2.5K' },
            { value: 5000, label: '5K' },
          ]
        : [
            { value: 5000, label: '5K' },
            { value: 10_000, label: '10K' },
            { value: 20_000, label: '20K' },
          ],
      rateRange: { min: 1, max: 2000, step: 10 },
      onTargetChange: (target) => {
        this.applyStressTarget(target);
      },
      onRateChange: (rate) => {
        this._setAppMode('stress');
        this._profSpawnRate = rate;
        this.scheduler.setSpawnRate(rate);
        this._syncThroughputState();
      },
      onDistributionChange: (distributionId) => {
        this.distributionId = distributionId;
        this._syncThroughputState();
      },
    });
    this.interactionsPanel = new InteractionsPanel({
      theme: BAKUDAN_THEME,
      labels: labels.panels.interactions,
      state: this._interactionsState(),
      presets: (Object.keys(PRESET_TRANSLATIONS[this.currentLang]) as PresetId[]).map((id) => ({
        id,
        label: PRESET_TRANSLATIONS[this.currentLang][id],
      })),
      effects: EFFECT_IDS.map((id) => ({
        id,
        label: t(`fx.${id}`, this.currentLang),
      })),
      renderClasses: [
        { id: 'backend', label: 'Backend' },
        { id: 'glyphs', label: 'MSDF glyphs' },
        { id: 'canvas', label: 'Canvas fallbacks' },
      ],
      onPresetChange: (presetId) => {
        this.activePreset = presetId;
        this._syncInteractionsState();
      },
      onEffectChange: (effectId, enabled) => {
        this.effects[effectId] = enabled;
        this.scheduler.activeEffects = { ...this.effects };
        this._syncInteractionsState();
      },
    });
    this.devtoolsPanel = new DevToolsInfoPanel({
      theme: BAKUDAN_THEME,
      labels: labels.panels.devtools,
      state: {
        availability: this.devtoolsAvailability,
        canReload: import.meta.env.DEV,
      },
      onReload: () => this._loadDevtools(),
    });
    this.labDrawer = new DanmakuLabDrawer<LabTab>({
      theme: BAKUDAN_THEME,
      labels: labels.kit.lab,
      panels: [
        { id: 'videos', label: labels.kit.lab.videos, panel: this.videosPanel },
        {
          id: 'throughput',
          label: labels.kit.lab.throughput,
          panel: this.throughputPanel,
        },
        {
          id: 'interactions',
          label: labels.kit.lab.interactions,
          panel: this.interactionsPanel,
        },
        {
          id: 'devtools',
          label: labels.kit.lab.devtools,
          panel: this.devtoolsPanel,
        },
      ],
      open: this.labOpen,
      activeTab: this.activeLabTab,
      onOpenChange: (open) => this.setLabOpen(open),
      onActiveTabChange: (tabId) => this.setActiveLabTab(tabId),
    });

    this._syncStatus();
    this._syncPlaybackState();
    this.scene.showOverlay(this.statusBar);
    this.scene.showOverlay(this.commandDeck);
    this.scene.showOverlay(this.labDrawer);
  }

  selectVideo(selection: VideoSelection, requestedProfileId?: string): void {
    const sameSource = this._sameVideoSelection(selection, this.currentVideoSelection);
    const profileId = requestedProfileId ?? resolveVideoSelection(selection).defaultTrackProfileId;
    if (sameSource && profileId === this.currentTrackProfileId) {
      if (this.mode !== 'video') {
        this._setAppMode('video');
        this._togglePlayback();
      }
      return;
    }
    if (sameSource) {
      this._onTrackProfileChange(profileId);
      return;
    }
    this._loadVideoSelection(selection, profileId);
  }

  /**
   * Enter stress mode at the given target pool count.
   *
   * The single entry point for driving stress mode programmatically: the
   * throughput panel's target callback and the `?stress=<n>` startup seam in
   * `main.ts` both land here, so the bench harness exercises exactly the code
   * path a user's panel interaction does.
   */
  applyStressTarget(target: number): void {
    this._setAppMode('stress');
    this._stressTargetBeforeVideo = target;
    this._profTargetCount = target;
    this.scheduler.setTargetCount(target);
    this._syncThroughputState();
  }

  /**
   * True while the given source URL is a blob: object URL minted by this app
   * for a local upload. Such sources are session-local by construction.
   */
  private _isLocalUploadUrl(url: string): boolean {
    return url.startsWith('blob:') && this._localObjectUrls.includes(url);
  }

  /**
   * A local file handed over by the kit panel's upload button becomes a
   * session-local blob: object URL routed through the custom-source pipeline.
   */
  private _onLocalFilePicked(file: File): void {
    const url = URL.createObjectURL(file);
    this._localObjectUrls.push(url);
    // Custom selection => unique per upload (UUID inside the URL), so the
    // same-selection comparison cannot mistake two files for one another.
    this.selectVideo({ kind: 'custom', url });
  }

  /**
   * Revoke the tracked object URL unless it is the now-active source. Called
   * only after StageBackground actually swapped; a failed load keeps the old
   * video alive on its still-needed blob.
   */
  private _pruneLocalObjectUrl(activeUrl: string | null): void {
    for (const url of this._localObjectUrls) {
      if (url !== activeUrl) URL.revokeObjectURL(url);
    }
    this._localObjectUrls = activeUrl ? [activeUrl] : [];
  }

  private _retryVideo(): void {
    if (!this.pendingVideoSelection || !this.pendingTrackProfileId) return;
    this._loadVideoSelection(this.pendingVideoSelection, this.pendingTrackProfileId);
  }

  private _loadVideoSelection(selection: VideoSelection, requestedProfileId?: string): void {
    const candidate = resolveVideoSelection(selection);
    const profileId = requestedProfileId ?? candidate.defaultTrackProfileId;
    const profile = TRACK_PROFILES.get(profileId);
    if (!profile) throw new Error(`Unknown track profile id: ${profileId}`);

    const requestId = ++this._videoRequestId;
    this.pendingVideoSelection = selection;
    this.pendingTrackProfileId = profileId;
    this.videoLoading = true;
    this.videoLoadState = { status: 'loading', candidateId: candidate.id };
    this._setAppMode('video');
    this._clearSelection();
    this._setAppMode('video');
    this._syncVideosState();
    this._syncStatus();
    this._syncPlaybackState();
    void this.bg
      .setVideo(candidate.source.url)
      .then(() => {
        if (requestId !== this._videoRequestId || this.destroyed) return;
        this.videoLoading = false;
        // The old source is fully disposed at this point (setVideo swapped),
        // so its object URL can go. On failure we skip pruning: the previous
        // video keeps playing from its still-live blob.
        this._pruneLocalObjectUrl(selection.kind === 'custom' ? selection.url : null);
        this._reactionStore = new ReactionStore(candidate.id, {
          memoryOnly: this._isLocalUploadUrl(candidate.source.url),
        });
        this.currentVideoSelection = selection;
        this.currentVideoId = candidate.id;
        this.currentTrackProfileId = profile.id;
        const duration = this.bg.duration || candidate.durationHint;
        this._installVideoTrack(duration, candidate.id, profile.id);
        this.videoLoadState = { status: 'ready', sourceId: candidate.id };
        this.pendingVideoSelection = null;
        this.pendingTrackProfileId = null;
        this.bg.onEnded(() => {
          this._syncPlaybackState();
          this._syncStatus();
        });
        this._syncVideosState();
        this._syncPlaybackState();
        this._syncStatus();
        void this.bg
          .play()
          .then(() => {
            // Re-sync on success too: the sync above ran before play() resolved,
            // so the status still says 'paused' for a video now playing.
            if (requestId !== this._videoRequestId || this.destroyed) return;
            this._syncPlaybackState();
            this._syncStatus();
          })
          .catch((error: unknown) => {
            const sourceError = this._asVideoSourceError(error);
            if (sourceError.code !== 'playback-rejected') this._announceVideoError(sourceError);
            this._syncPlaybackState();
            this._syncStatus();
          });
        this.scene.markDirty();
      })
      .catch((error: unknown) => {
        if (requestId !== this._videoRequestId || this.destroyed) return;
        const sourceError = this._asVideoSourceError(error);
        this.videoLoading = false;
        this.videoLoadState = {
          status: 'error',
          candidateId: candidate.id,
          error: sourceError,
        };
        this._announceVideoError(sourceError);
        this._syncVideosState();
        this._syncPlaybackState();
        this._syncStatus();
      });
  }

  private _onTrackProfileChange(profileId: string): void {
    const profile = TRACK_PROFILES.get(profileId);
    if (!profile || profileId === this.currentTrackProfileId) return;
    this.currentTrackProfileId = profileId;
    if (this.bg.isVideoReady) {
      this._clearSelection();
      const currentTime = this.bg.currentTime;
      this._installVideoTrack(this.bg.duration || 15, this.currentVideoId, profileId);
      this.danmakuTrack.seek(currentTime);
    }
    this._syncVideosState();
    this.scene.markDirty();
  }

  private _installVideoTrack(duration: number, videoId: string, profileId: string): void {
    const profile = TRACK_PROFILES.get(profileId);
    if (!profile) throw new Error(`Unknown track profile id: ${profileId}`);
    const profiledTrack = generateLargeTimedTrack(duration, profile, videoId);
    this.danmakuTrack = new ProfiledDanmakuTrack(profiledTrack.entries);
  }

  private _sameVideoSelection(a: VideoSelection, b: VideoSelection): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'catalog' && b.kind === 'catalog') return a.id === b.id;
    return a.kind === 'custom' && b.kind === 'custom' && a.url === b.url;
  }

  private _asVideoSourceError(error: unknown): VideoSourceError {
    if (error instanceof VideoSourceError) return error;
    let code: VideoSourceError['code'] = 'media-error';
    let message = 'Video source failed';
    if (error && typeof error === 'object') {
      if ('code' in error) {
        const value = error.code;
        if (
          value === 'network-error' ||
          value === 'metadata-error' ||
          value === 'playback-rejected' ||
          value === 'media-error'
        ) {
          code = value;
        }
      }
      if ('message' in error && typeof error.message === 'string') message = error.message;
    }
    return new VideoSourceError(code, message);
  }

  private _announceVideoError(error: VideoSourceError): void {
    const key =
      error.code === 'network-error'
        ? 'video.error.network'
        : error.code === 'metadata-error'
          ? 'video.error.metadata'
          : error.code === 'playback-rejected'
            ? 'video.error.playback'
            : 'video.error.media';
    this.announcer.setSummary(t(key, this.currentLang));
  }

  private _throughputState() {
    const draw = this.danmakuLayer.drawStats;
    return {
      capacity: this.pool.capacity,
      target: this.scheduler.target,
      rate: this.scheduler.rate,
      distributionId: this.distributionId,
      framePercentiles: {
        fps: this._lastFps,
        'frame-time': this._frameTimeMs,
      },
      drawSplit: {
        'gl-runs': draw.glRuns,
        'gl-glyphs': draw.glGlyphs,
        'canvas-slots': draw.c2dBlits + draw.c2dFillText + draw.special,
      },
    };
  }

  private _interactionsState() {
    const draw = this.danmakuLayer.drawStats;
    return {
      presetId: this.activePreset,
      effects: { ...this.effects },
      renderClasses: {
        backend: (this.scene as unknown as { pointRenderer?: unknown }).pointRenderer
          ? 'WebGL + Canvas2D'
          : 'Canvas2D',
        glyphs: `${draw.glGlyphs}`,
        canvas: `${draw.c2dBlits + draw.c2dFillText + draw.special}`,
      },
    };
  }

  private _syncVideosState(): void {
    this.videosPanel.setState({
      source: this.currentVideoSelection,
      profileId: this.currentTrackProfileId,
      loadState: this.videoLoadState,
    });
  }

  private _syncThroughputState(): void {
    this.throughputPanel.setState(this._throughputState());
  }

  private _syncInteractionsState(): void {
    this.interactionsPanel.setState(this._interactionsState());
  }

  private _statusKind(): DanmakuStatusKind {
    if (this.videoLoading) return 'loading';
    if (this.videoLoadState.status === 'error') return 'error';
    if (this.mode === 'stress') return 'stress';
    // A mid-stream stall reuses 'loading': it is the same "waiting for data"
    // state as the initial fetch, and the kit already renders and announces
    // that kind. Ranked below an explicit pause, which is user intent.
    if (this.bg.paused) return 'paused';
    if (this._videoBuffering) return 'loading';
    return 'video';
  }

  private _syncStatus(): void {
    this.statusBar.setStatus({
      state: this._statusKind(),
      fps: this._lastFps,
      active: this.pool.activeCount,
      capacity: this.pool.capacity,
      backend: (this.scene as unknown as { pointRenderer?: unknown }).pointRenderer
        ? 'WebGL/MSDF'
        : 'Canvas2D',
    });
  }

  private _syncPlaybackState(): void {
    this.commandDeck.setPlaybackState({
      currentTime: this.bg.currentTime,
      duration: this.bg.duration,
      playing: this.isVideoPlaying,
      rate: this.bg.playbackRate,
      disabled: this.mode !== 'video' || this.videoLoading || !this.bg.isVideoReady,
      // Stress mode has no media, so an empty list clears any stale span left
      // over from a previous video source.
      buffered: this.mode === 'video' ? this.bg.bufferedRanges : [],
    });
  }

  setLabOpen(open: boolean): void {
    if (this.labOpen === open) return;
    this.labOpen = open;
    this.labDrawer.setOpen(open);
    this._layoutCinema();
    this.scene.markDirty();
  }

  setActiveLabTab(tabId: LabTab): void {
    if (this.activeLabTab === tabId) return;
    this.activeLabTab = tabId;
    this.labDrawer.setActiveTab(tabId);
    this.scene.markDirty();
  }

  private _loadDevtools(): void {
    if (!import.meta.env.DEV || this.devtoolsAvailability === 'available') return;
    void import('@vectojs/devtools')
      .then(() => {
        if (this.destroyed) return;
        this.devtoolsAvailability = 'available';
        this.devtoolsPanel.setState({
          availability: 'available',
          canReload: false,
        });
      })
      .catch(() => {
        if (this.destroyed) return;
        this.devtoolsAvailability = 'unavailable';
        this.devtoolsPanel.setState({
          availability: 'unavailable',
          canReload: false,
        });
      });
  }

  getViewSnapshot(): Readonly<{
    mode: AppMode;
    labOpen: boolean;
    activeLabTab: LabTab;
    videoId: string;
    profileId: string;
    videoLoadState: VideoLoadState;
  }> {
    return {
      mode: this.mode,
      labOpen: this.labOpen,
      activeLabTab: this.activeLabTab,
      videoId: this.currentVideoId,
      profileId: this.currentTrackProfileId,
      videoLoadState: this.videoLoadState,
    };
  }

  /**
   * Whether a pointer at `y` (scene units, horizontally centred) lands in the
   * laboratory drawer. Exposed so tests can pin the region against the drawer's
   * real laid-out rect rather than a breakpoint guess.
   */
  debugHitsLab(y: number): boolean {
    const previousX = this.pointerX;
    const previousY = this.pointerY;
    this.pointerX = this.stageW / 2;
    this.pointerY = y;
    const result = this.labOpen && this._hitsOverlay(this.labDrawer);
    this.pointerX = previousX;
    this.pointerY = previousY;
    return result;
  }

  getCinemaLayoutSnapshot() {
    return {
      status: {
        x: this.statusBar.x,
        y: this.statusBar.y,
        width: this.statusBar.width,
        height: this.statusBar.height,
      },
      command: {
        x: this.commandDeck.x,
        y: this.commandDeck.y,
        width: this.commandDeck.width,
        height: this.commandDeck.height,
        controls: this.commandDeck.layoutSnapshot(),
      },
      drawer: {
        x: this.labDrawer.x,
        y: this.labDrawer.y,
        width: this.labDrawer.width,
        height: this.labDrawer.height,
        open: this.labDrawer.isOpen,
        childCount: this.labDrawer.children.length,
      },
    };
  }

  onResize(width: number, height: number): void {
    this.stageW = width;
    this.stageH = height;
    this.isMobile = width < MOBILE_BREAKPOINT;
    this.scheduler.resize(width, height);
    this.bg.width = width;
    this.bg.height = height;
    this._layoutCinema();
    this.scene.markDirty();
  }

  onViewportChange(viewport: VisualViewport): void {
    this._viewportTop = viewport.offsetTop;
    this._viewportBottom = viewport.offsetTop + viewport.height;
    this._layoutCinema();
    this.scene.markDirty();
  }

  private _layoutCinema(): void {
    if (!this.statusBar || !this.commandDeck || !this.labDrawer) return;
    const margin = this.isMobile ? OVERLAY_MARGIN_MOBILE : OVERLAY_MARGIN_DESKTOP;
    const compact = this.isMobile;
    const viewportTop = Math.max(0, this._viewportTop);
    const viewportBottom = Math.min(
      this.stageH,
      Math.max(viewportTop, this._viewportBottom ?? this.stageH),
    );
    const viewportHeight = Math.max(0, viewportBottom - viewportTop);
    const deckWidth = Math.max(1, Math.min(COMMAND_DECK_MAX_WIDTH, this.stageW - margin * 2));
    this.statusBar.setCompact(compact).setWidth(Math.max(1, this.stageW - margin * 2));
    this.statusBar.x = margin;
    // Flush against the visible top boundary: viewportTop is already a boundary
    // coordinate (visualViewport.offsetTop, 0 unless pinch-zoom/keyboard shifts
    // it), so adding the overlay margin here opened a gap above the chrome that
    // video and danmaku passed through. Vertical breathing room belongs to the
    // bar itself, which centres its content in a fixed 34/44px height.
    this.statusBar.y = viewportTop;
    this.commandDeck.setCompact(compact).setWidth(deckWidth);
    this.commandDeck.x = Math.max(margin, (this.stageW - deckWidth) / 2);

    const drawerHeight = Math.round(
      viewportHeight * (compact ? MOBILE_DRAWER_RATIO : DESKTOP_DRAWER_RATIO),
    );
    const drawerY = viewportBottom - drawerHeight;
    this.labDrawer.setAvailableBounds({
      width: this.stageW,
      height: drawerHeight,
    });
    this.labDrawer.x = 0;
    this.labDrawer.y = drawerY;
    const commandBottom = this.labOpen ? drawerY - margin : viewportBottom - margin;
    this.commandDeck.y = Math.max(
      this.statusBar.y + this.statusBar.height + margin,
      commandBottom - this.commandDeck.height,
    );
  }

  start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    this._setupPointerTracking();
    this._disposeShortcuts = installKeyboardShortcuts(this.scene, this);
    this._disposeFullscreen = installFullscreenListeners(document, {
      onChange: (active) => this._handleFullscreenChange(active),
      onError: () => this._handleFullscreenError(),
    });
    this.ticker = new Ticker(this);
    this.scene.add(this.ticker);
    if (this.stageW === 0 || this.stageH === 0) {
      this.onResize(this.scene.width, this.scene.height);
    }
    this._loadVideoSelection(this.currentVideoSelection, this.currentTrackProfileId);
    void loadMSDFAtlas().then((atlas) => {
      if (atlas && !this.destroyed) {
        this.danmakuLayer.setMSDF(atlas);
        this.scene.markDirty();
      }
    });
  }

  frame(dt: number): void {
    this.profiler.beginPhase('app.frame(js)');
    if (this.profiler.isRunning) this.profiler.record(dt);
    this._frameAccumMs += dt;
    this._frameCount++;
    if (this._frameAccumMs >= STATUS_UPDATE_INTERVAL_MS) {
      this._lastFps = Math.round((this._frameCount / this._frameAccumMs) * 1000);
      this._frameTimeMs = this._frameAccumMs / this._frameCount;
      const { hits, misses } = this.danmakuLayer.rasterStats;
      const total = hits + misses;
      this._measureTextHitRate = total > 0 ? (hits / total) * 100 : 100;
      if (
        typeof performance !== 'undefined' &&
        'memory' in performance &&
        performance.memory &&
        typeof performance.memory === 'object' &&
        'usedJSHeapSize' in performance.memory &&
        typeof performance.memory.usedJSHeapSize === 'number'
      ) {
        this._heapUsedMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
      }
      this._syncStatus();
      this._syncThroughputState();
      this._syncInteractionsState();
      this._syncPlaybackState();
      this._frameAccumMs = 0;
      this._frameCount = 0;
    }

    if (Date.now() - this._lastA11y >= A11Y_UPDATE_INTERVAL_MS) {
      const latest = this.pool.slots
        .filter((slot) => slot.active)
        .slice(-3)
        .map((slot) => slot.params.text)
        .join(', ');
      this.announcer.setSummary(
        `${this.pool.activeCount} danmaku active. Latest: ${latest || 'none'}`,
      );
      this._lastA11y = Date.now();
    }

    if (this.mode === 'video') {
      this._frameVideo();
    }

    this.profiler.beginPhase('scheduler.tick');
    this.scheduler.tick(dt, this.activePreset, {
      cursorX: this.pointerX,
      cursorY: this.pointerY,
      pointerActive: this.pointerActive,
    });
    this.profiler.endPhase('scheduler.tick');

    if (this._interactiveMode && !this._dragSlot) {
      this._updateHover();
    }
    this.profiler.endPhase('app.frame(js)');
  }

  private _updateHover(): void {
    const slots = this.pool.slots;
    const selected = this._selectedSlotId !== null ? slots[this._selectedSlotId] : null;

    if (selected?.active && selected.interactionLocked) {
      // Freeze is a property of selection, never a leftover of hover: a touch
      // tap or a click after idle has no hover state to inherit it from.
      selected.paused = true;
      // Anchor the bar on the pill DanmakuLayer._drawSelectedPill actually
      // paints: baseline `fontSize * PILL_BASELINE_FACTOR` below s.y, glyphs at
      // rx / rx+20 / rx+60, total width PILL_WIDTH_PX. Both sides read these
      // constants, so draw and hit-test cannot drift again.
      const pillTop =
        Math.round(selected.y) +
        selected.params.fontSize * PILL_BASELINE_FACTOR -
        PILL_HEIGHT_PX / 2;
      this._selectionHotspots.liked = selected.liked ?? false;
      this._selectionHotspots.place(
        Math.round(selected.x),
        pillTop,
        PILL_HEIGHT_PX,
        PILL_COPY_OFFSET_PX,
        PILL_WIDTH_PX,
      );
      // Derive hover from the hotspots themselves, so the highlight and the
      // click target can never disagree.
      const hoveredAction = this._selectionHotspots.hitAction(this.pointerX, this.pointerY);
      if (hoveredAction !== this._hoveredAction) {
        this._hoveredAction = hoveredAction;
        this.scene.markDirty();
      }
    } else {
      // The selected slot expired or was recycled out from under us — dismiss
      // instead of leaving an action bar anchored to nothing.
      if (this._selectedSlotId !== null) this._clearSelection();
    }

    // Maintain per-slot hover unconditionally. It used to be skipped whenever
    // the pointer rested on the action bar, which left any danmaku hovered just
    // before the pointer moved onto the bar frozen in place forever.
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      if (!s.active || s.interactionLocked) {
        s.hovered = false;
        continue;
      }
      s.hovered =
        this.pointerX >= s.x &&
        this.pointerX <= s.x + s.width &&
        this.pointerY >= s.y &&
        this.pointerY <= s.y + s.params.fontSize * 1.5;
      s.paused = s.dragging || s.hovered;
    }
  }

  private _setAppMode(mode: AppMode): void {
    if (this.mode === mode) return;
    this._clearSelection();
    this.mode = mode;
    this._profMode = mode;
    if (mode === 'video') {
      this.scheduler.setTargetCount(0);
      this.danmakuTrack.seek(this.bg.currentTime);
    } else {
      this._stressTargetBeforeVideo = Math.max(0, this._stressTargetBeforeVideo);
      this.scheduler.setTargetCount(this._stressTargetBeforeVideo);
      this.bg.pause();
    }
    this._syncStatus();
    this._syncPlaybackState();
    this._syncThroughputState();
    this.scene.markDirty();
  }

  private _frameVideo(): void {
    if (!this.bg.isVideoReady) return;
    const t = this.bg.currentTime;
    const fired = this.danmakuTrack.sync(t);
    for (const entry of fired) {
      this.scheduler.userSpawn({
        text: entry.text,
        color: entry.color ?? '#f8fafc',
        fontSize: entry.fontSize ?? 24,
        speed: entry.speed ?? 200,
        opacity: 0.9,
        preset: entry.preset ?? 'scroll',
        presetParams: {},
        effects: entry.effects ?? { ...this.effects },
      });
    }
    this._syncPlaybackState();
  }

  private _togglePlayback(): void {
    if (this.bg.paused) {
      void this.bg
        .play()
        .catch((error: unknown) => this._announceVideoError(this._asVideoSourceError(error)))
        .finally(() => {
          this._syncPlaybackState();
          this._syncStatus();
        });
    } else {
      this.bg.pause();
      this._syncPlaybackState();
      this._syncStatus();
    }
  }

  private _onSeek(t: number): void {
    this._clearSelection();
    this.bg.seek(t);
    this.danmakuTrack.seek(t);
    // While paused the loop is idle (no pending animation), so the new video
    // frame won't repaint on its own — force one.
    this._syncPlaybackState();
    this.scene.markDirty();
  }

  /**
   * Whether playback keyboard shortcuts can act right now.
   *
   * Mirrors the `disabled` condition the command deck already computes for its
   * transport controls (`_syncPlaybackState`), so a key and a click are never
   * enabled at different times.
   */
  get playbackShortcutsEnabled(): boolean {
    return this.mode === 'video' && !this.videoLoading && this.bg.isVideoReady;
  }

  /** Toggle play/pause, announcing the resulting state. */
  togglePlayback(): void {
    const willPlay = this.bg.paused;
    this._togglePlayback();
    this.announcer.setSummary(t(willPlay ? 'a11y.playing' : 'a11y.paused', this.currentLang));
  }

  /** Seek by a signed offset in seconds, clamped to the loaded duration. */
  seekBy(seconds: number): void {
    const duration = this.bg.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const next = Math.min(duration, Math.max(0, this.bg.currentTime + seconds));
    this._onSeek(next);
    this._announceSeek(next, duration);
  }

  /** Seek to a fraction (0-1) of the loaded duration. */
  seekToFraction(fraction: number): void {
    const duration = this.bg.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const next = Math.min(duration, Math.max(0, duration * fraction));
    this._onSeek(next);
    this._announceSeek(next, duration);
  }

  /** Seek to the first or last frame of the loaded duration. */
  seekToEdge(edge: 'start' | 'end'): void {
    const duration = this.bg.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const next = edge === 'start' ? 0 : duration;
    this._onSeek(next);
    this._announceSeek(next, duration);
  }

  /** Whether an element is currently presented fullscreen. */
  get isFullscreen(): boolean {
    return this._isFullscreen;
  }

  /**
   * Enter or leave document fullscreen. Targets document.documentElement so
   * both canvas layers and every projected element stay visible. An entirely
   * unsupported API announces failure immediately; supported-but-rejected
   * requests arrive as `fullscreenerror` via _handleFullscreenError.
   */
  toggleFullscreen(): void {
    if (fullscreenElementOf(document) !== null) {
      exitFullscreenIn(document);
      return;
    }
    if (!requestFullscreenOn(document.documentElement)) {
      this._isFullscreen = false;
      this.announcer.setSummary(t('a11y.fullscreenError', this.currentLang));
    }
  }

  private _handleFullscreenChange(active: boolean): void {
    this._isFullscreen = active;
    this.announcer.setSummary(
      t(active ? 'a11y.fullscreenEntered' : 'a11y.fullscreenExited', this.currentLang),
    );
  }

  private _handleFullscreenError(): void {
    // A failed request leaves the previous element in charge; re-sync instead
    // of trusting that the failure means "still ours".
    this._isFullscreen = fullscreenElementOf(document) !== null;
    this.announcer.setSummary(t('a11y.fullscreenError', this.currentLang));
  }

  /**
   * Dismiss the topmost transient surface, innermost first: a selected danmaku
   * before the lab drawer. Returns true when something was actually dismissed,
   * so the caller can leave the key unhandled otherwise.
   */
  dismiss(): boolean {
    if (this._selectedSlotId !== null) {
      this._clearSelection();
      this.announcer.setSummary(t('a11y.selectionCleared', this.currentLang));
      return true;
    }
    if (this.labOpen) {
      this.setLabOpen(false);
      this.announcer.setSummary(t('a11y.labClosed', this.currentLang));
      return true;
    }
    return false;
  }

  private _announceSeek(time: number, duration: number): void {
    const fmt = (s: number): string => {
      const total = Math.max(0, Math.round(s));
      const mm = Math.floor(total / 60);
      const ss = total % 60;
      return `${mm}:${ss.toString().padStart(2, '0')}`;
    };
    this.announcer.setSummary(
      `${t('a11y.seeked', this.currentLang)} ${fmt(time)} / ${fmt(duration)}`,
    );
  }

  private _onUserSend(text: string): void {
    const time = this.mode === 'video' ? this.bg.currentTime : 0;
    const entry = {
      time: Math.round(time * 10) / 10,
      text,
      color: '#f8fafc',
      fontSize: 24,
      speed: 200,
      opacity: 0.9,
      preset: this.activePreset,
      presetParams: {},
      effects: { ...this.effects },
      userSent: true,
    };
    this.scheduler.userSpawn(entry, true);

    if (this.mode === 'video') {
      // A local upload's id hashes its blob: URL, which is dead after reload;
      // persisting would write entries no future session can ever list.
      if (!this._isLocalUploadUrl(this.bg.currentSource ?? '')) {
        saveUserDanmaku(this.currentVideoId, entry);
      }
      const duration = this.bg.duration || 15;
      this._installVideoTrack(duration, this.currentVideoId, this.currentTrackProfileId);
      this.danmakuTrack.seek(this.bg.currentTime);
    }
  }

  /**
   * Danmaku under the pointer, chosen by PAINT order. A click must land on the
   * glyph stack the user sees: plain slots bucketed by ascending font size,
   * then special-effect slots, exactly what `paintOrderKey` encodes for the
   * draw pass. The old reverse-slot-index scan picked whichever overlapping
   * danmaku happened to spawn last, which could sit visually underneath.
   */
  private _findSlotAtPointer(): PoolSlot | null {
    let best: PoolSlot | null = null;
    let bestKey = -1;
    for (const s of this.pool.slots) {
      if (!s.active || s.interactionLocked) continue;
      const localX = this.pointerX - s.x;
      if (
        localX < 0 ||
        localX > s.width ||
        this.pointerY < s.y ||
        this.pointerY > s.y + s.params.fontSize * 1.5
      ) {
        continue;
      }
      const key = paintOrderKey(s);
      if (key > bestKey) {
        bestKey = key;
        best = s;
      }
    }
    return best;
  }

  /** Stable reaction key for a slot. Engine params carry no `contentId`, so identical text shares its like count deliberately. */
  private _reactionId(s: PoolSlot): string {
    return s.params.contentId || `t:${s.params.text}`;
  }

  private _handleTapStage(): void {
    const slot = this._findSlotAtPointer();
    if (!slot) {
      this._clearSelection();
      this._handleTapVideo();
      return;
    }

    if (this._selectedSlotId !== null && this._selectedSlotId !== slot.id) {
      this._clearSelection();
    }

    if (!slot.interactionLocked) {
      slot.interactionLocked = true;
      slot.paused = true;
      this._selectedSlotId = slot.id;
      const rx = this._reactionStore!.get(this._reactionId(slot));
      slot.liked = rx.liked;
      this._selectedLikeCount = rx.count;
      this.scene.markDirty();
      return;
    }

    // If they clicked the already-selected slot body (not its actions), release it.
    this._clearSelection();
  }

  private _clearSelection(): void {
    if (this._selectedSlotId !== null) {
      const s = this.pool.slots[this._selectedSlotId];
      if (s) {
        s.interactionLocked = false;
        s.hovered = false;
        s.paused = false;
      }
      this._selectedSlotId = null;
      this._hoveredAction = null;
      this._selectedLikeCount = 0;
      // Park container AND zero children together; parking the container alone
      // left previously placed child rects composing back on-screen, where core
      // happily projected clickable buttons over unrelated content.
      this._selectionHotspots.hide();
      this.scene.markDirty();
    }
  }

  private _handleLikeToggle(): void {
    if (this._selectedSlotId === null || !this._reactionStore) return;
    const s = this.pool.slots[this._selectedSlotId];
    if (!s || !s.active) return;
    const rx = this._reactionStore.toggle(this._reactionId(s));
    s.liked = rx.liked;
    this._selectedLikeCount = rx.count;
    this.scene.markDirty();
  }

  private _handleCopy(): void {
    if (this._selectedSlotId === null) return;
    const s = this.pool.slots[this._selectedSlotId];
    if (!s || !s.active) return;
    const text = s.params.text;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(
        () => console.log('Copied'), // Toast wiring elided for focus
        () => console.warn('Clipboard unavailable'),
      );
    }
  }

  private _handleTapVideo(): void {
    return;
  }

  private readonly _handlePointerMove = (event: PointerEvent): void => {
    // Client px -> scene/world px. World units are LOGICAL CSS px -- the
    // renderer owns the backing-store scale internally -- so the correction
    // factor is the logical-to-CSS ratio, never canvas.width/rect.width:
    // since #29 raised the backing store to min(dpr, 2), that ratio equals
    // the device DPR and every hit-test reacted dpr-fold down-right of the
    // cursor (vectojs/bakudan#40).
    const rect = this.scene.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.scene.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.scene.height / rect.height : 1;
    this.pointerX = (event.clientX - rect.left) * scaleX;
    this.pointerY = (event.clientY - rect.top) * scaleY;
    this._interactiveMode = true;
    this.pointerX = (event.clientX - rect.left) * scaleX;
    this.pointerY = (event.clientY - rect.top) * scaleY;
    this._interactiveMode = true;
    if (this._dragSlot) {
      this._dragSlot.x = this.pointerX - this._dragOffX;
      this._dragSlot.y = this.pointerY - this._dragOffY;
      this.scene.markDirty();
    }
  };

  /**
   * Whether the current pointer position falls inside an overlay's real laid-out
   * rect. Reads the entity's own geometry so it can never drift from layout.
   */
  private _hitsOverlay(overlay: { x: number; y: number; width: number; height: number }): boolean {
    return (
      this.pointerX >= overlay.x &&
      this.pointerX <= overlay.x + overlay.width &&
      this.pointerY >= overlay.y &&
      this.pointerY <= overlay.y + overlay.height
    );
  }

  private _handlePointerDown = (event: PointerEvent) => {
    const canvas = this.scene.canvas;
    if (!canvas) return;
    // Same world-unit mapping as the move handler: logical CSS px, never
    // backing-store px (vectojs/bakudan#40).
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.scene.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.scene.height / rect.height : 1;
    this.pointerX = (event.clientX - rect.left) * scaleX;
    this.pointerY = (event.clientY - rect.top) * scaleY;

    // Ask the overlays where they actually are rather than re-deriving their
    // geometry from breakpoints. Both used to be guessed from stageH, and the
    // guesses drifted badly from _layoutOverlays: at 1600px tall the lab guess
    // (stageH - 500) sat 236px below the drawer's real top, so pointerdowns in
    // that band were treated as stage taps and stolen from the drawer; at 800px
    // tall it sat 132px above it, swallowing real stage taps instead.
    const inCommandDeck = this.mode === 'video' && this._hitsOverlay(this.commandDeck);
    const inLab = this.labOpen && this._hitsOverlay(this.labDrawer);

    if (this.labOpen && !inLab && !inCommandDeck) {
      this.setLabOpen(false);
      return;
    }

    // No `_interactiveMode` gate here: a pointer resting >1.5s used to swallow
    // the tap entirely, and hover-and-inspect invites exactly that pause. The
    // coordinates were refreshed from this very event above, so the tap always
    // acts on what is under the cursor right now.
    if (inLab || inCommandDeck) return;

    this._handleTapStage();

    // Synthetic pointers (automation, some pen/touch drivers) have no active
    // pointer id and this throws NotFoundError, killing everything after it.
    try {
      this.scene.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* no active pointer with that id — capture is best-effort */
    }
  };

  private readonly _handlePointerEnd = (): void => {
    this.pointerActive = false;
    if (!this._dragSlot) return;
    this._dragSlot.dragging = false;
    this._dragSlot.paused = this._dragSlot.hovered;
    this._dragSlot = null;
  };

  private readonly _handlePointerLeave = (): void => {
    this.pointerActive = false;
    this._interactiveMode = false;
    for (const s of this.pool.slots) s.hovered = false;
    this.scene.markDirty();
  };

  private _setupPointerTracking(): void {
    const canvas = this.scene.canvas;
    canvas.addEventListener('pointermove', this._handlePointerMove);
    canvas.addEventListener('pointerdown', this._handlePointerDown);
    canvas.addEventListener('pointerup', this._handlePointerEnd);
    canvas.addEventListener('pointercancel', this._handlePointerEnd);
    canvas.addEventListener('pointerleave', this._handlePointerLeave);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._videoRequestId++;
    this._pruneLocalObjectUrl(null);
    this._disposeShortcuts?.();
    this._disposeShortcuts = null;
    this._disposeFullscreen?.();
    this._disposeFullscreen = null;
    const canvas = this.scene.canvas;
    canvas.removeEventListener('pointermove', this._handlePointerMove);
    canvas.removeEventListener('pointerdown', this._handlePointerDown);
    canvas.removeEventListener('pointerup', this._handlePointerEnd);
    canvas.removeEventListener('pointerleave', this._handlePointerEnd);
    this.labDrawer.setOpen(false);
    if (this.statusBar.parent) this.scene.hideOverlay(this.statusBar);
    if (this.commandDeck.parent) this.scene.hideOverlay(this.commandDeck);
    if (this.labDrawer.parent) this.scene.hideOverlay(this.labDrawer);
    if (this.ticker?.parent) this.scene.remove(this.ticker);
    if (this.announcer.parent) this.scene.remove(this.announcer);
    if (this.danmakuLayer.parent) this.scene.remove(this.danmakuLayer);
    this.bg.destroy();
    if (this.bg.parent) this.scene.remove(this.bg);
    this.ticker = null;
  }
}
