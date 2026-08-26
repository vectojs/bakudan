import { ReactionStore } from '../model/ReactionStore';
import { BenchmarkPanel } from './BenchmarkPanel';
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
import { DEFAULT_VIDEO_ID, VIDEO_CATALOG, videoById } from '../model/VideoCatalog';
import { DanmakuAnnouncer } from './DanmakuAnnouncer';
import {
  exitFullscreenIn,
  fullscreenElementOf,
  installFullscreenListeners,
  requestFullscreenOn,
} from './Fullscreen';

import { DanmakuLayer } from './DanmakuLayer';
import { loadMSDFAtlas } from './MSDFAtlas';
import { BAKUDAN_THEME, cinemaLabelsFor } from './cinemaConfig';
import { StageBackground } from './StageBackground';

import {
  A11Y_UPDATE_INTERVAL_MS,
  COMMAND_DECK_GROUP_GAP_PX,
  COMMAND_DECK_GROUPS,
  COMMAND_DECK_MAX_WIDTH,
  DESKTOP_POOL,
  EFFECT_IDS,
  MOBILE_BREAKPOINT,
  MOBILE_POOL,
  STATUS_UPDATE_INTERVAL_MS,
  type AppMode,
  type DistributionId,
  type DrawMetricId,
  type EffectId,
  type FrameMetricId,
  type LabTab,
  type RenderClassId,
} from './app/types';
import * as AppBenchmark from './app/AppBenchmark';
import * as AppLayout from './app/AppLayout';
import * as AppPointer from './app/AppPointer';
import * as AppSelection from './app/AppSelection';
import * as AppVideo from './app/AppVideo';

export type {
  AppMode,
  LabTab,
  FrameMetricId,
  DrawMetricId,
  DistributionId,
  EffectId,
  RenderClassId,
};
export type { AppOptions } from './app/types';

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
  private benchPanel!: BenchmarkPanel;
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

  /**
   * In-page benchmark state. While a run is in flight, hover-freeze and drag
   * are suspended: a danmaku paused under a resting cursor would contaminate
   * exactly the figure the run exists to produce.
   */
  private _benchRunning = false;
  private _benchJson: string | null = null;
  private _benchCopied = false;
  private _benchStatusLine = '';
  private _benchResultLines: readonly string[] = [];
  /** Plateau detector: last active count and when it was first seen. */
  private _plateauActive = -1;
  private _plateauSince = 0;
  private _saturationLine: string | null = null;
  /** Rendered-frame cap; the Benchmark tab's selector writes Scene.maxFPS. */
  private _frameRate = 240;

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
  /** Freeze-zone bookkeeping: pointer stillness + per-slot hold timers. */
  private _lastPointerX = 0;
  private _lastPointerY = 0;
  private _pointerStillSince = 0;
  /**
   * Frame-accumulated clock for the freeze zone. performance.now() would work
   * in production but is uncontrollable in bun tests; dt sums to real time.
   */
  private _hoverNow = 0;
  private readonly _freezeState = new Map<number, { since: number; released: boolean }>();
  private pointerActive = false;

  private _interactiveMode = false;
  private _dragSlot: PoolSlot | null = null;
  private _dragOffX = 0;
  private _dragOffY = 0;

  private _frameAccumMs = 0;
  private _frameCount = 0;
  private _lastFps = 60;
  private _lastA11y = 0;

  constructor(scene: Scene, options: import('./app/types').AppOptions = {}) {
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
      // 2000/s sat exactly at the ~20k equilibrium (a 20k pool with a ~10s
      // lifetime exits ~2000/s), so the old cap could never fill a 20K
      // target: exits matched inflow and band-refused placement did the rest.
      // 6000/s lets inflow outrun exits between band openings.
      rateRange: { min: 1, max: this.isMobile ? 3000 : 6000, step: 10 },
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
    this.benchPanel = new BenchmarkPanel({
      theme: BAKUDAN_THEME,
      labels: labels.panels.benchmark,
      state: this._benchState(),
      onFrameRateChange: (hz) => {
        // Scene.maxFPS is public and settable at runtime (core docs: "Also
        // settable later via Scene.maxFPS").
        this._frameRate = hz;
        this.scene.maxFPS = hz;
        this._syncBenchState();
      },
      onRun: () => void this._runBenchmark(),
      onCopy: () => void this._copyBenchJson(),
      onDownload: () => this._downloadBenchJson(),
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
          id: 'benchmark',
          label: labels.panels.benchmark.tab,
          panel: this.benchPanel,
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

  // ---- Video facade (delegates to app/AppVideo) ----
  selectVideo(selection: VideoSelection, requestedProfileId?: string): void {
    AppVideo.selectVideo(this, selection, requestedProfileId);
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
    AppVideo.applyStressTarget(this, target);
  }

  private _isLocalUploadUrl(url: string): boolean {
    return AppVideo.isLocalUploadUrl(this, url);
  }

  private _onLocalFilePicked(file: File): void {
    AppVideo.onLocalFilePicked(this, file);
  }

  private _pruneLocalObjectUrl(activeUrl: string | null): void {
    AppVideo.pruneLocalObjectUrl(this, activeUrl);
  }

  private _retryVideo(): void {
    AppVideo.retryVideo(this);
  }

  private _loadVideoSelection(selection: VideoSelection, requestedProfileId?: string): void {
    AppVideo.loadVideoSelection(this, selection, requestedProfileId);
  }

  private _onTrackProfileChange(profileId: string): void {
    AppVideo.onTrackProfileChange(this, profileId);
  }

  private _installVideoTrack(duration: number, videoId: string, profileId: string): void {
    AppVideo.installVideoTrack(this, duration, videoId, profileId);
  }

  private _sameVideoSelection(a: VideoSelection, b: VideoSelection): boolean {
    return AppVideo.sameVideoSelection(a, b);
  }

  private _asVideoSourceError(error: unknown): VideoSourceError {
    return AppVideo.asVideoSourceError(error);
  }

  private _announceVideoError(error: VideoSourceError): void {
    AppVideo.announceVideoError(this, error);
  }

  // ---- Benchmark facade (delegates to app/AppBenchmark) ----
  private _throughputState() {
    return AppBenchmark.throughputState(this);
  }

  private _interactionsState() {
    return AppBenchmark.interactionsState(this);
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

  private _benchState() {
    return AppBenchmark.benchState(this);
  }

  private _syncBenchState(): void {
    AppBenchmark.syncBenchState(this);
  }

  private async _runBenchmark(): Promise<void> {
    return AppBenchmark.runBenchmark(this);
  }

  private async _copyBenchJson(): Promise<void> {
    return AppBenchmark.copyBenchJson(this);
  }

  private _downloadBenchJson(): void {
    AppBenchmark.downloadBenchJson(this);
  }

  private _updateSaturation(): void {
    AppBenchmark.updateSaturation(this);
  }

  private _statusKind(): DanmakuStatusKind {
    if (this.videoLoading) return 'loading';
    if (this.videoLoadState.status === 'error') return 'error';
    if (this.mode === 'stress') return 'stress';
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

  // ---- Layout facade (delegates to app/AppLayout) ----
  debugHitsLab(y: number): boolean {
    return AppLayout.debugHitsLab(this, y);
  }

  getCinemaLayoutSnapshot() {
    return AppLayout.getCinemaLayoutSnapshot(this);
  }

  onResize(width: number, height: number): void {
    AppLayout.onResize(this, width, height);
  }

  onViewportChange(viewport: VisualViewport): void {
    AppLayout.onViewportChange(this, viewport);
  }

  private _layoutCinema(): void {
    AppLayout.layoutCinema(this);
  }

  private _hitsOverlay(overlay: { x: number; y: number; width: number; height: number }): boolean {
    return AppLayout.hitsOverlay(this, overlay);
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
    this._hoverNow += dt;
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
      this._syncBenchState();
      this._syncInteractionsState();
      this._syncPlaybackState();
      this._updateSaturation();
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
    AppPointer.updateHover(this);
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
      if (!this._isLocalUploadUrl(this.bg.currentSource ?? '')) {
        saveUserDanmaku(this.currentVideoId, entry);
      }
      const duration = this.bg.duration || 15;
      this._installVideoTrack(duration, this.currentVideoId, this.currentTrackProfileId);
      this.danmakuTrack.seek(this.bg.currentTime);
    }
  }

  // ---- Selection facade (delegates to app/AppSelection) ----
  private _findSlotAtPointer(): PoolSlot | null {
    return AppSelection.findSlotAtPointer(this);
  }

  private _reactionId(s: PoolSlot): string {
    return AppSelection.reactionId(s);
  }

  private _handleTapStage(): void {
    AppSelection.handleTapStage(this);
  }

  private _clearSelection(): void {
    AppSelection.clearSelection(this);
  }

  private _handleLikeToggle(): void {
    AppSelection.handleLikeToggle(this);
  }

  private _handleCopy(): void {
    AppSelection.handleCopy(this);
  }

  private _handleTapVideo(): void {
    AppSelection.handleTapVideo(this);
  }

  // ---- Pointer facade (delegates to app/AppPointer) ----
  private readonly _handlePointerMove = (event: PointerEvent): void => {
    AppPointer.handlePointerMove(this, event);
  };

  private _handlePointerDown = (event: PointerEvent): void => {
    AppPointer.handlePointerDown(this, event);
  };

  private readonly _handlePointerEnd = (): void => {
    AppPointer.handlePointerEnd(this);
  };

  private readonly _handlePointerLeave = (): void => {
    AppPointer.handlePointerLeave(this);
  };

  private _setupPointerTracking(): void {
    AppPointer.setupPointerTracking(this);
  }

  // Keep facade fields/methods referenced for noUnusedLocals (delegated via host any)
  private _keepUsed(): void {
    void this._reactionStore;
    void this._benchRunning;
    void this._benchJson;
    void this._benchCopied;
    void this._benchStatusLine;
    void this._benchResultLines;
    void this._plateauActive;
    void this._plateauSince;
    void this._saturationLine;
    void this._frameRate;
    void this.distributionId;
    void this.pendingVideoSelection;
    void this.pendingTrackProfileId;
    void this._localObjectUrls;
    void this._viewportTop;
    void this._viewportBottom;
    void this._frameTimeMs;
    void this._lastPointerX;
    void this._lastPointerY;
    void this._pointerStillSince;
    void this._freezeState;
    void this._dragOffX;
    void this._dragOffY;
    void this._onTrackProfileChange;
    void this._sameVideoSelection;
    void this._syncVideosState;
    void this._hitsOverlay;
    void this._findSlotAtPointer;
    void this._reactionId;
    void this._handleTapStage;
    void this._handleTapVideo;
  }

  destroy(): void {
    this._keepUsed();
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
    canvas.removeEventListener('pointerleave', this._handlePointerLeave);
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
