import { ReactionStore } from '../model/ReactionStore';
import { runInPageBench, type BenchProgress } from '../model/InPageBench';
import { BenchmarkPanel, type BenchmarkPanelState } from './BenchmarkPanel';
import { type HoveredAction, SelectionHotspots } from './SelectionHotspots';
import { installKeyboardShortcuts } from './KeyboardShortcuts';
import { LabDrawerHTML } from './html/lab/LabDrawer';
import { VideosPanelHTML } from './html/lab/VideosPanel';
import { ThroughputPanelHTML } from './html/lab/ThroughputPanel';
import { InteractionsPanelHTML } from './html/lab/InteractionsPanel';
import { BenchmarkPanelHTML } from './html/lab/BenchmarkPanel';
import { DevToolsPanelHTML } from './html/lab/DevToolsPanel';

import { Entity, Scene } from '@vectojs/core';
import { DanmakuPool, Scheduler } from '@vectojs/danmaku-core';
import type { CharacterEffects, PoolSlot, PresetId } from '@vectojs/danmaku-core';
import { VideoSourceError } from '@vectojs/danmaku-kit/model';
import type { VideoLoadState, VideoSelection } from '@vectojs/danmaku-kit/model';
import type { ProfiledTimedDanmakuEntry } from '../model/TrackProfiles';
import {
  DanmakuCommandDeck,
  DanmakuLabDrawer,
  DanmakuStatusBar,
  DevToolsInfoPanel,
  InteractionsPanel,
  ThroughputPanel,
  VideosPanel,
} from '@vectojs/danmaku-kit/ui';
import type { DanmakuStatusKind, DevToolsAvailability } from '@vectojs/danmaku-kit/ui';
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

import {
  DanmakuLayer,
  paintOrderKey,
  PILL_BASELINE_FACTOR,
  PILL_COPY_OFFSET_PX,
  PILL_HEIGHT_PX,
  PILL_PLATE_MARGIN_PX,
  PILL_PLATE_WIDTH_PX,
  PILL_WIDTH_PX,
} from './DanmakuLayer';
import { loadMSDFAtlas } from './MSDFAtlas';
import type { StageBackgroundOptions } from './StageBackground';
import { BAKUDAN_THEME, cinemaLabelsFor } from './cinemaConfig';
import { HeaderBar, type StatusState } from './html/HeaderBar';
import { CommandDeckHTML, type CommandDeckState } from './html/CommandDeck';

import * as AppVideo from './app/AppVideo';
import * as AppLayout from './app/AppLayout';
import {
  A11Y_UPDATE_INTERVAL_MS,
  COMMAND_DECK_GROUP_GAP_PX,
  COMMAND_DECK_GROUPS,
  COMMAND_DECK_MAX_WIDTH,
  DESKTOP_POOL,
  EFFECT_IDS,
  FREEZE_HOLD_MS,
  FREEZE_PAD_PX,
  FREEZE_QUIET_MS,
  MOBILE_BREAKPOINT,
  MOBILE_POOL,
  STATUS_UPDATE_INTERVAL_MS,
} from './app/types';
import type {
  AppMode,
  DistributionId,
  DrawMetricId,
  EffectId,
  FrameMetricId,
  LabTab,
  RenderClassId,
} from './app/types';

import { StageBackground } from './StageBackground';

export interface AppOptions {
  stageBackground?: StageBackground;
  stageBackgroundOptions?: StageBackgroundOptions;
  /**
   * Skip the default catalog video autoload at start(). Video export sets
   * this: a hanging remote fetch would keep the exporter's networkidle0 from
   * ever firing, and the clip targets stress mode anyway (a DOM <video> is
   * wall-clock and cannot be driven by step()).
   */
  skipVideoAutoload?: boolean;
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
  private statusBar: DanmakuStatusBar | null = null;
  private headerBar: HeaderBar | null = null;
  private commandDeck: DanmakuCommandDeck | null = null;
  private commandDeckHTML: CommandDeckHTML | null = null;
  private labDrawer!: DanmakuLabDrawer<LabTab>;
  private labDrawerHTML: LabDrawerHTML | null = null;
  private videosPanelHTML: VideosPanelHTML | null = null;
  private throughputPanelHTML: ThroughputPanelHTML | null = null;
  private interactionsPanelHTML: InteractionsPanelHTML | null = null;
  private devtoolsPanelHTML: DevToolsPanelHTML | null = null;
  private benchPanelHTML: BenchmarkPanelHTML | null = null;
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
  private readonly _skipVideoAutoload: boolean;

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
  // P1: video lane saturation retry queue + metrics (20-40% bursts at 60Hz)
  private _videoSpawnDropped = 0;
  private _videoSpawnTotal = 0;
  private _videoRetryQueue: ProfiledTimedDanmakuEntry[] = [];
  // P3-1: video preset font tier distribution (mirrors Scheduler.FONT_TIERS)
  private readonly _videoFontTiers = [18, 24, 30] as const;

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

    this._skipVideoAutoload = options.skipVideoAutoload ?? false;
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
    // Keep private fields used via AppVideo/AppLayout host casts
    void this.pendingVideoSelection;
    void this.pendingTrackProfileId;
    void this._localObjectUrls;
    void this._viewportTop;
    void this._viewportBottom;
    void this._onTrackProfileChange;
    void this._sameVideoSelection;
    void this._syncVideosState;
    void AppVideo;
    void AppLayout;

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
      // In hybrid header mode the bar is HTML (44px desktop / 36px mobile).
      safeTop: this.headerBar
        ? this.isMobile
          ? 36
          : 44
        : this.statusBar
          ? this.statusBar.y + this.statusBar.height
          : 0,
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
    const catalog = VIDEO_CATALOG.map((entry) => ({
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

    const headerContainer = document.getElementById('bakudan-header');
    if (headerContainer) {
      this.headerBar = new HeaderBar(headerContainer, {
        getState: () => this._headerState(),
      });
    } else {
      this.statusBar = new DanmakuStatusBar({
        width: window.innerWidth,
        product: labels.kit.product,
        labels: labels.kit,
        theme: BAKUDAN_THEME,
        compact: this.isMobile,
      });
    }
    const commandContainer =
      typeof document !== 'undefined' ? document.getElementById('command-deck') : null;
    if (commandContainer) {
      this.commandDeckHTML = new CommandDeckHTML(commandContainer, {
        onTogglePlayback: () => this._togglePlayback(),
        onSeek: (time) => this._onSeek(time),
        onSeekDelta: (delta) => this.seekBy(delta),
        onRateChange: (rate) => {
          this.bg.playbackRate = rate;
          this._syncPlaybackState();
        },
        onSend: (text) => this._onUserSend(text),
        onLabToggle: () => this.setLabOpen(!this.labOpen),
        getState: () => this._commandDeckState(),
      });
    } else {
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
    }
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
        this._applyDistribution();
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

    const labContainer =
      typeof document !== 'undefined'
        ? (document.getElementById('lab-drawer') as HTMLElement | null)
        : null;
    if (labContainer) {
      // HTML lab drawer path (CTX-0029) — vanilla HTML, no kit UI chrome for the drawer itself.
      this.videosPanelHTML = new VideosPanelHTML({
        catalog,
        profiles,
        state: {
          source: this.currentVideoSelection,
          profileId: this.currentTrackProfileId,
          loadState: this.videoLoadState,
        },
        labels: labels.panels.videos,
        onChoose: (selection) => this.selectVideo(selection.source, selection.profileId),
        onUploadFile: (file) => this._onLocalFilePicked(file),
        onRetry: () => this._retryVideo(),
      });
      this.throughputPanelHTML = new ThroughputPanelHTML({
        state: this._throughputState(),
        isMobile: this.isMobile,
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
        rateRange: { min: 1, max: this.isMobile ? 3000 : 6000, step: 10 },
        labels: labels.panels.throughput,
        onTargetChange: (target) => this.applyStressTarget(target),
        onRateChange: (rate) => {
          this._setAppMode('stress');
          this._profSpawnRate = rate;
          this.scheduler.setSpawnRate(rate);
          this._syncThroughputState();
        },
        onDistributionChange: (distributionId) => {
          this.distributionId = distributionId as DistributionId;
          this._applyDistribution();
          this._syncThroughputState();
        },
      });
      this.interactionsPanelHTML = new InteractionsPanelHTML({
        state: {
          presetId: this.activePreset,
          effects: { ...this.effects },
          renderClasses: this._interactionsState().renderClasses,
        },
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
        labels: labels.panels.interactions,
        onPresetChange: (presetId) => {
          this.activePreset = presetId as PresetId;
          this._syncInteractionsState();
        },
        onEffectChange: (effectId, enabled) => {
          this.effects[effectId as EffectId] = enabled;
          this.scheduler.activeEffects = { ...this.effects };
          this._syncInteractionsState();
        },
      });
      this.devtoolsPanelHTML = new DevToolsPanelHTML({
        state: {
          availability: this.devtoolsAvailability,
          canReload: import.meta.env.DEV,
        },
        labels: labels.panels.devtools,
        onReload: () => this._loadDevtools(),
      });
      this.benchPanelHTML = new BenchmarkPanelHTML({
        state: {
          frameRate: this._frameRate,
          backendLabel: `${labels.panels.benchmark.renderer}: ${(this.scene as unknown as { pointRenderer?: unknown }).pointRenderer ? 'WebGL/MSDF' : 'Canvas2D'}`,
          running: this._benchRunning,
          statusLine: this._benchRunning ? this._benchStatusLine : labels.panels.benchmark.idle,
          resultLines: this._benchResultLines,
          saturationLine: this._saturationLine,
          copied: this._benchCopied,
        },
        labels: labels.panels.benchmark,
        onFrameRateChange: (hz) => {
          this._frameRate = hz;
          this.scene.maxFPS = hz;
          this._syncBenchState();
        },
        onRun: () => void this._runBenchmark(),
        onCopy: () => void this._copyBenchJson(),
        onDownload: () => this._downloadBenchJson(),
      });
      this.labDrawerHTML = new LabDrawerHTML(labContainer, {
        open: this.labOpen,
        activeTab: this.activeLabTab,
        onOpenChange: (open) => this.setLabOpen(open),
        onActiveTabChange: (tabId) => this.setActiveLabTab(tabId as LabTab),
        panels: [
          {
            id: 'videos',
            label: labels.kit.lab.videos,
            panel: this.videosPanelHTML,
          },
          {
            id: 'throughput',
            label: labels.kit.lab.throughput,
            panel: this.throughputPanelHTML,
          },
          {
            id: 'interactions',
            label: labels.kit.lab.interactions,
            panel: this.interactionsPanelHTML,
          },
          {
            id: 'benchmark',
            label: labels.panels.benchmark.tab,
            panel: this.benchPanelHTML,
          },
          {
            id: 'devtools',
            label: labels.kit.lab.devtools,
            panel: this.devtoolsPanelHTML,
          },
        ],
        labels: { title: labels.kit.lab.title, close: labels.kit.lab.close },
      });
    } else {
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
          this._applyDistribution();
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
          {
            id: 'videos',
            label: labels.kit.lab.videos,
            panel: this.videosPanel,
          },
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
    }

    this._syncStatus();
    this._syncPlaybackState();
    if (this.statusBar) this.scene.showOverlay(this.statusBar);
    if (this.commandDeck) this.scene.showOverlay(this.commandDeck);
    if (this.labDrawer) {
      this.scene.showOverlay(this.labDrawer);
    } else if (this.labDrawerHTML) {
      // HTML drawer is already in DOM; do not add as canvas overlay
    }
  }

  selectVideo(selection: VideoSelection, requestedProfileId?: string): void {
    AppVideo.selectVideo(this as unknown as App, selection, requestedProfileId);
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
    AppVideo.applyStressTarget(this as unknown as App, target);
  }

  /**
   * True while the given source URL is a blob: object URL minted by this app
   * for a local upload. Such sources are session-local by construction.
   */
  private _isLocalUploadUrl(url: string): boolean {
    return AppVideo.isLocalUploadUrl(this as unknown as App, url);
  }

  /**
   * A local file handed over by the kit panel's upload button becomes a
   * session-local blob: object URL routed through the custom-source pipeline.
   */
  private _onLocalFilePicked(file: File): void {
    AppVideo.onLocalFilePicked(this as unknown as App, file);
  }

  /**
   * Revoke the tracked object URL unless it is the now-active source. Called
   * only after StageBackground actually swapped; a failed load keeps the old
   * video alive on its still-needed blob.
   */
  private _pruneLocalObjectUrl(activeUrl: string | null): void {
    AppVideo.pruneLocalObjectUrl(this as unknown as App, activeUrl);
  }

  private _retryVideo(): void {
    AppVideo.retryVideo(this as unknown as App);
  }

  private _loadVideoSelection(selection: VideoSelection, requestedProfileId?: string): void {
    AppVideo.loadVideoSelection(this as unknown as App, selection, requestedProfileId);
  }

  private _onTrackProfileChange(profileId: string): void {
    AppVideo.onTrackProfileChange(this as unknown as App, profileId);
  }

  private _installVideoTrack(duration: number, videoId: string, profileId: string): void {
    AppVideo.installVideoTrack(this as unknown as App, duration, videoId, profileId);
  }

  private _sameVideoSelection(a: VideoSelection, b: VideoSelection): boolean {
    return AppVideo.sameVideoSelection(a, b);
  }

  private _asVideoSourceError(error: unknown): VideoSourceError {
    return AppVideo.asVideoSourceError(error);
  }

  private _announceVideoError(error: VideoSourceError): void {
    AppVideo.announceVideoError(this as unknown as App, error);
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
    const state = {
      source: this.currentVideoSelection,
      profileId: this.currentTrackProfileId,
      loadState: this.videoLoadState,
    };
    if (this.videosPanelHTML) this.videosPanelHTML.setState(state);
    else if (this.videosPanel) this.videosPanel.setState(state);
  }

  private _syncThroughputState(): void {
    const state = this._throughputState();
    if (this.throughputPanelHTML) this.throughputPanelHTML.setState(state);
    else if (this.throughputPanel) this.throughputPanel.setState(state);
  }

  private _applyDistribution(): void {
    // P2-1: wire distributionId to scheduler (steady vs bursty). Bursty bursts
    // inflow by 50% over the slider rate so the toggle is observable; steady
    // restores the slider-driven rate. Verify not regressed from CTX-0038.
    const anySched = this.scheduler as unknown as {
      distributionId?: string;
      setSpawnRate(r: number): void;
      rate: number;
    };
    anySched.distributionId = this.distributionId;
    const base =
      (this as unknown as { _profSpawnRate?: number })._profSpawnRate ?? this.scheduler.rate;
    if (this.distributionId === 'bursty') {
      const burstyRate = Math.min(6000, Math.max(base ?? 10, 10) * 1.5);
      if (Math.abs(this.scheduler.rate - burstyRate) > 0.5) {
        this.scheduler.setSpawnRate(burstyRate);
      }
    } else {
      const targetRate = base ?? this.scheduler.rate;
      if (Math.abs(this.scheduler.rate - targetRate) > 0.5) {
        this.scheduler.setSpawnRate(targetRate);
      }
    }
  }

  private _syncInteractionsState(): void {
    const state = this._interactionsState();
    if (this.interactionsPanelHTML) this.interactionsPanelHTML.setState(state);
    else if (this.interactionsPanel) this.interactionsPanel.setState(state);
  }

  private _benchState(): BenchmarkPanelState {
    const labels = cinemaLabelsFor(this.currentLang).panels.benchmark;
    const backend = (this.scene as unknown as { pointRenderer?: unknown }).pointRenderer
      ? 'WebGL/MSDF'
      : 'Canvas2D';
    return {
      frameRate: this._frameRate,
      backendLabel: `${labels.renderer}: ${backend}`,
      running: this._benchRunning,
      statusLine: this._benchRunning ? this._benchStatusLine : labels.idle,
      resultLines: this._benchResultLines,
      saturationLine: this._saturationLine,
      copied: this._benchCopied,
    };
  }

  private _syncBenchState(): void {
    const state = this._benchState();
    if (this.benchPanelHTML) this.benchPanelHTML.setState(state);
    else if (this.benchPanel) this.benchPanel.setState(state);
  }

  /**
   * Run the in-page benchmark at the current stress target. Hover-freeze and
   * drag are suspended for the duration: a danmaku paused under a resting
   * cursor would contaminate exactly the figure the run exists to produce.
   */
  private async _runBenchmark(): Promise<void> {
    if (this._benchRunning) return;
    const labels = cinemaLabelsFor(this.currentLang).panels.benchmark;
    this._benchRunning = true;
    this._benchCopied = false;
    this._benchResultLines = [];
    this._benchStatusLine = '';
    this._syncBenchState();
    try {
      const result = await runInPageBench(
        {
          now: () => performance.now(),
          sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
          requestAnimationFrame: (cb) => requestAnimationFrame(cb),
          applyStressTarget: (target) => {
            this.applyStressTarget(target);
            return Math.min(target, this.pool.capacity);
          },
          setSpawnRate: (rate) => {
            this._profSpawnRate = rate;
            this.scheduler.setSpawnRate(rate);
          },
          activeCount: () => this.pool.activeCount,
          startProfiler: () => this.profiler.start(),
          stopProfiler: () => this.profiler.stop(),
        },
        this._stressTargetBeforeVideo,
        (progress: BenchProgress) => {
          this._benchStatusLine = progress.detail;
          this._syncBenchState();
        },
        labels,
        this._frameRate,
      );
      this._benchJson = result.json;
      this._benchResultLines = labels.resultLines({
        fpsP50: result.report.fps.p50,
        frameTimeMsP99: result.report.frameTimeMs.p99,
        activeAtEnd: result.activeAtEnd,
        target: result.effectiveTarget,
        refreshHz: result.refreshHz,
        filled: result.filled,
      });
      this._benchStatusLine = '';
    } catch (error) {
      this._benchStatusLine = labels.benchFailed(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this._benchRunning = false;
      this._syncBenchState();
    }
  }

  private async _copyBenchJson(): Promise<void> {
    if (!this._benchJson) return;
    const labels = cinemaLabelsFor(this.currentLang).panels.benchmark;
    try {
      await navigator.clipboard.writeText(this._benchJson);
      this._benchCopied = true;
    } catch {
      this._benchCopied = false;
      this._benchStatusLine = labels.copyFailed;
    }
    this._syncBenchState();
  }

  private _downloadBenchJson(): void {
    if (!this._benchJson) return;
    const labels = cinemaLabelsFor(this.currentLang).panels.benchmark;
    const url = URL.createObjectURL(new Blob([this._benchJson], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = labels.downloadName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Plateau detector: in stress mode with the spawn slider maxed, an active
   * count that stops climbing while below target means band-refused
   * placement (danmaku-core#8) — say so instead of under-filling silently.
   */
  private _updateSaturation(): void {
    const labels = cinemaLabelsFor(this.currentLang).panels.benchmark;
    if (this.mode !== 'stress' || this._benchRunning) {
      this._saturationLine = null;
      this._plateauActive = -1;
      return;
    }
    const active = this.pool.activeCount;
    const target = this._stressTargetBeforeVideo;
    const maxed = this.scheduler.rate >= (this.isMobile ? 3000 : 6000);
    if (target > 0 && active < target && maxed) {
      if (active !== this._plateauActive) {
        this._plateauActive = active;
        this._plateauSince = performance.now();
      } else if (performance.now() - this._plateauSince > 4000) {
        this._saturationLine = labels.saturation(active, target);
        return;
      }
    } else {
      this._plateauActive = -1;
    }
    this._saturationLine = null;
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

  private _headerState(): StatusState {
    const kind = this._statusKind();
    const videoEntry = videoById(this.currentVideoId);
    const profile = TRACK_PROFILES.get(this.currentTrackProfileId);
    return {
      kind,
      videoTitle: videoEntry?.title ?? this.currentVideoId,
      trackProfileLabel: profile?.label ?? this.currentTrackProfileId,
      fps: this._lastFps,
      frameTime: this._frameTimeMs,
      liveCount: this.pool.activeCount,
      capacity: this.pool.capacity,
      backend: (this.scene as unknown as { pointRenderer?: unknown }).pointRenderer
        ? 'webgl'
        : 'canvas2d',
      language: this.currentLang,
    };
  }

  private _syncStatus(): void {
    if (this.headerBar) {
      this.headerBar.update(this._headerState());
      return;
    }
    if (!this.statusBar) return;
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

  private _commandDeckState(): CommandDeckState {
    return {
      isPlaying: this.isVideoPlaying,
      currentTime: this.bg.currentTime,
      duration: this.bg.duration,
      bufferedRanges: this.mode === 'video' ? this.bg.bufferedRanges : [],
      rate: this.bg.playbackRate,
      pendingSendText: '',
      labOpen: this.labOpen,
      disabled: this.mode !== 'video' || this.videoLoading || !this.bg.isVideoReady,
    };
  }

  private _syncPlaybackState(): void {
    if (this.commandDeckHTML) {
      this.commandDeckHTML.update(this._commandDeckState());
      return;
    }
    if (!this.commandDeck) return;
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
    if (this.labDrawer) this.labDrawer.setOpen(open);
    if (this.commandDeckHTML) this._syncPlaybackState();
    if (this.labDrawerHTML) this.labDrawerHTML.setOpen(open);
    this._layoutCinema();
    this.scene.markDirty();
  }

  setActiveLabTab(tabId: LabTab): void {
    if (this.activeLabTab === tabId) return;
    this.activeLabTab = tabId;
    if (this.labDrawerHTML) this.labDrawerHTML.setActiveTab(tabId);
    else if ((this as unknown as { labDrawer?: { setActiveTab: (t: string) => void } }).labDrawer)
      this.labDrawer.setActiveTab(tabId);
    this.scene.markDirty();
  }

  private _loadDevtools(): void {
    if (!import.meta.env.DEV || this.devtoolsAvailability === 'available') return;
    void import('@vectojs/devtools')
      .then(() => {
        if (this.destroyed) return;
        this.devtoolsAvailability = 'available';
        const state = {
          availability: 'available' as const,
          canReload: false,
        };
        if (this.devtoolsPanelHTML) this.devtoolsPanelHTML.setState(state);
        else if (this.devtoolsPanel) this.devtoolsPanel.setState(state);
      })
      .catch(() => {
        if (this.destroyed) return;
        this.devtoolsAvailability = 'unavailable';
        const state = {
          availability: 'unavailable' as const,
          canReload: false,
        };
        if (this.devtoolsPanelHTML) this.devtoolsPanelHTML.setState(state);
        else if (this.devtoolsPanel) this.devtoolsPanel.setState(state);
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
    return AppLayout.debugHitsLab(this as unknown as App, y);
  }

  getCinemaLayoutSnapshot() {
    return AppLayout.getCinemaLayoutSnapshot(this as unknown as App);
  }

  onResize(width: number, height: number): void {
    AppLayout.onResize(this as unknown as App, width, height);
  }

  onViewportChange(viewport: VisualViewport): void {
    AppLayout.onViewportChange(this as unknown as App, viewport);
  }

  /**
   * Hybrid shell (final, CTX-0030): stageW/H come from #stage-container's rect
   * via main.ts (disableWindowResize island). Grid owns header/footer, stage
   * is the canvas island. HTML chrome (headerBar, commandDeckHTML,
   * labDrawerHTML) is CSS-positioned; canvas overlays (statusBar,
   * commandDeck, labDrawer) remain only as fallback when HTML mounts are
   * missing (e.g. happy-dom tests). Keep fallback path intact.
   */
  private _layoutCinema(): void {
    AppLayout.layoutCinema(this as unknown as App);
  }

  /**
   * Hide every UI overlay for video export (`?export=1`): the clip should
   * carry the danmaku stage only. Irreversible by design — an exporting page
   * is never interacted with.
   */
  hideChrome(): void {
    if (this.statusBar?.parent) this.scene.hideOverlay(this.statusBar);
    if (this.commandDeck?.parent) this.scene.hideOverlay(this.commandDeck);
    const labDrawer = (this as unknown as { labDrawer?: Entity }).labDrawer as Entity | undefined;
    if (labDrawer?.parent) this.scene.hideOverlay(labDrawer);
    if (this.headerBar) {
      this.headerBar.destroy();
      this.headerBar = null;
    }
    if (this.commandDeckHTML) {
      this.commandDeckHTML.destroy();
      this.commandDeckHTML = null;
    }
    if (this.labDrawerHTML) {
      this.labDrawerHTML.destroy();
      this.labDrawerHTML = null;
    }
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
    if (!this._skipVideoAutoload) {
      this._loadVideoSelection(this.currentVideoSelection, this.currentTrackProfileId);
    }
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
    const slots = this.pool.slots;
    if (this._benchRunning) {
      // A danmaku frozen under a resting cursor would contaminate the run.
      for (let i = slots.length - 1; i >= 0; i--) {
        const s = slots[i]!;
        s.hovered = false;
        if (!s.interactionLocked) s.paused = false;
      }
      return;
    }
    const selected = this._selectedSlotId !== null ? slots[this._selectedSlotId] : null;

    if (selected?.active && selected.interactionLocked) {
      // Freeze is a property of selection, never a leftover of hover: a touch
      // tap or a click after idle has no hover state to inherit it from.
      selected.paused = true;
      // Anchor the bar on the pill DanmakuLayer._drawSelectedPill actually
      // paints. Bilibili-style: the bar floats CENTERED under the danmaku
      // text (not left-aligned with its first glyph), clamped to the stage so
      // a short danmaku near an edge cannot push the plate off-canvas. Draw
      // and hit-test both read these constants, so they cannot drift.
      const pillTop =
        Math.round(selected.y) +
        selected.params.fontSize * PILL_BASELINE_FACTOR -
        PILL_HEIGHT_PX / 2;
      const pillLeft = Math.round(
        Math.min(
          Math.max(selected.x + selected.width / 2 - PILL_WIDTH_PX / 2, PILL_PLATE_MARGIN_PX),
          Math.max(PILL_PLATE_MARGIN_PX, this.stageW - PILL_PLATE_WIDTH_PX - PILL_PLATE_MARGIN_PX),
        ),
      );
      this._selectionHotspots.liked = selected.liked ?? false;
      this._selectionHotspots.place(
        pillLeft,
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

    // Cursor freeze zone — TRANSIENT by design. The original point-in-box
    // freeze held every danmaku under a resting pointer forever, and the lane
    // walled up behind it. Now: a MOVING pointer freezes nothing; a resting
    // pointer freezes danmaku crossing it, but each slot holds at most
    // FREEZE_HOLD_MS, then releases and flows on (staying released while it
    // remains inside the zone, so it cannot re-freeze mid-queue). Leaving the
    // zone re-arms the slot; moving the pointer disarms everything at once.
    const now = this._hoverNow;
    if (
      Math.abs(this.pointerX - this._lastPointerX) > 2 ||
      Math.abs(this.pointerY - this._lastPointerY) > 2
    ) {
      this._lastPointerX = this.pointerX;
      this._lastPointerY = this.pointerY;
      this._pointerStillSince = now;
      this._freezeState.clear();
    }
    const zoneArmed = this.pointerActive && now - this._pointerStillSince >= FREEZE_QUIET_MS;

    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      if (!s.active || s.interactionLocked) {
        s.hovered = false;
        this._freezeState.delete(s.id);
        continue;
      }
      const inside =
        this.pointerX >= s.x - FREEZE_PAD_PX &&
        this.pointerX <= s.x + s.width + FREEZE_PAD_PX &&
        this.pointerY >= s.y - FREEZE_PAD_PX &&
        this.pointerY <= s.y + s.params.fontSize * 1.5 + FREEZE_PAD_PX;
      if (!inside) {
        // Out of the zone: forget the hold so a later re-entry freezes again.
        this._freezeState.delete(s.id);
        s.hovered = false;
        s.paused = Boolean(s.dragging);
        continue;
      }
      if (!zoneArmed) {
        s.hovered = false;
        s.paused = Boolean(s.dragging);
        continue;
      }
      let hold = this._freezeState.get(s.id);
      if (!hold) {
        hold = { since: now, released: false };
        this._freezeState.set(s.id, hold);
      } else if (!hold.released && now - hold.since >= FREEZE_HOLD_MS) {
        hold.released = true;
      }
      const frozen = !hold.released;
      s.hovered = frozen;
      s.paused = s.dragging || frozen;
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

  private _pickVideoFontSize(): number {
    // P3-1: distribute video danmaku across 18/24/30 instead of fixed 24
    // so bucket 24 does not hold 100% of video spawns.
    const tiers = this._videoFontTiers;
    return tiers[Math.floor(Math.random() * tiers.length)]!;
  }

  private _pickVideoSpeed(fontSize: number): number {
    // P3-1: vary speed with font-size correlation — larger reads slower
    const base = 160 + Math.random() * 120;
    return fontSize >= 30 ? base * 0.9 : fontSize <= 18 ? base * 1.1 : base;
  }

  private _frameVideo(): void {
    if (!this.bg.isVideoReady) return;
    const t = this.bg.currentTime;
    // Retry previously saturated spawns first (P1 requeue contract).
    if (this._videoRetryQueue.length > 0) {
      const pending = this._videoRetryQueue;
      this._videoRetryQueue = [];
      for (const entry of pending) {
        const ok = this.scheduler.userSpawn(
          {
            text: entry.text,
            color: entry.color ?? '#f8fafc',
            fontSize: entry.fontSize ?? this._pickVideoFontSize(),
            speed: entry.speed ?? this._pickVideoSpeed(entry.fontSize ?? 24),
            opacity: 0.9,
            preset: entry.preset ?? 'scroll',
            presetParams: {},
            effects: entry.effects ?? { ...this.effects },
          },
          false,
        );
        if (!ok) {
          this._videoRetryQueue.push(entry);
          this._videoSpawnDropped++;
        }
      }
    }
    const fired = this.danmakuTrack.sync(t);
    if (fired.length === 0) return;
    let droppedThisFrame = 0;
    for (const entry of fired) {
      this._videoSpawnTotal++;
      const fontSize = entry.fontSize ?? this._pickVideoFontSize();
      const speed = entry.speed ?? this._pickVideoSpeed(fontSize);
      const spawned = this.scheduler.userSpawn(
        {
          text: entry.text,
          color: entry.color ?? '#f8fafc',
          fontSize,
          speed,
          opacity: 0.9,
          preset: entry.preset ?? 'scroll',
          presetParams: {},
          effects: entry.effects ?? { ...this.effects },
        },
        false,
      );
      if (!spawned) {
        droppedThisFrame++;
        this._videoSpawnDropped++;
        // Requeue for next frame instead of silent drop (P1-1).
        this._videoRetryQueue.push({
          ...entry,
          fontSize,
          speed,
        } as ProfiledTimedDanmakuEntry);
      }
    }
    if (droppedThisFrame > 0) {
      // Log metric sampled to avoid spam — every 10th drop or burst >=3.
      if (this._videoSpawnDropped % 10 === 1 || droppedThisFrame >= 3) {
        console.warn(
          `[bakudan] video lane saturated: dropped ${droppedThisFrame}/${fired.length} this frame, total ${this._videoSpawnDropped}/${this._videoSpawnTotal}`,
        );
      }
      // Keep retry queue bounded: cap at 30 to avoid unbounded growth under
      // sustained flood (35/s) on a small stage.
      if (this._videoRetryQueue.length > 30) {
        this._videoRetryQueue.splice(0, this._videoRetryQueue.length - 30);
      }
    }
    // Playback UI is throttled to STATUS_UPDATE_INTERVAL_MS (500ms) via
    // frame()'s scheduled _syncPlaybackState batch — per-frame sync here
    // would write --progress + buffered-end CSS vars at rAF rate (240fps)
    // and is not needed for correctness. Seek/play handlers already sync
    // eagerly; ongoing time is reflected in the next 500ms tick.
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
    // P3-1: keep userSent at 24/200 for readability, but vary video fallback via
    // _pickVideo* elsewhere. User danmaku stays distinct size so it reads as owned.
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
    const spawned = this.scheduler.userSpawn(entry, true);
    if (!spawned) {
      // P1-2: userSpawn return was ignored, losing typed danmaku with no feedback.
      this._videoSpawnDropped++;
      console.warn('[bakudan] user danmaku lane saturated — not shown');
      this.announcer.setSummary(
        t('a11y.laneSaturated', this.currentLang) ?? 'Lane saturated — try again shortly',
      );
    }

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
    this.pointerActive = true;
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
    return AppLayout.hitsOverlay(this as unknown as App, overlay);
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
    const inCommandDeck = this.commandDeck
      ? this.mode === 'video' && this._hitsOverlay(this.commandDeck)
      : false;
    const inLab = this.labDrawerHTML
      ? this.labOpen && this.debugHitsLab(this.pointerY)
      : this.labOpen &&
          (
            this as unknown as {
              labDrawer?: {
                x: number;
                y: number;
                width: number;
                height: number;
              };
            }
          ).labDrawer
        ? this._hitsOverlay(
            (
              this as unknown as {
                labDrawer: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                };
              }
            ).labDrawer,
          )
        : false;

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
    if (this.labDrawer) this.labDrawer.setOpen(false);
    if (this.labDrawerHTML) this.labDrawerHTML.setOpen(false);
    if (this.statusBar?.parent) this.scene.hideOverlay(this.statusBar);
    if (this.headerBar) {
      this.headerBar.destroy();
      this.headerBar = null;
    }
    if (this.commandDeck?.parent) this.scene.hideOverlay(this.commandDeck);
    this.commandDeckHTML?.destroy();
    this.commandDeckHTML = null;
    if (this.labDrawerHTML) {
      this.labDrawerHTML.destroy();
      this.labDrawerHTML = null;
    } else if (this.labDrawer?.parent) {
      this.scene.hideOverlay(this.labDrawer);
    }
    if (this.ticker?.parent) this.scene.remove(this.ticker);
    if (this.announcer.parent) this.scene.remove(this.announcer);
    if (this.danmakuLayer.parent) this.scene.remove(this.danmakuLayer);
    this.bg.destroy();
    if (this.bg.parent) this.scene.remove(this.bg);
    this.ticker = null;
  }
}
