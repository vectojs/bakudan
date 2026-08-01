import { Entity, Scene } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core';
import { DanmakuPool, Scheduler } from '@vectojs/danmaku-core';
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
import {
  DEFAULT_VIDEO_ID,
  VIDEO_CATALOG,
  resolveVideoSelection,
  videoById,
} from '../model/VideoCatalog';
import type { CharacterEffects, PoolSlot, PresetId } from '../model/types';
import { DanmakuAnnouncer } from './DanmakuAnnouncer';
import { ACTION_BTN_WIDTH, DanmakuLayer, hitAction } from './DanmakuLayer';
import { loadMSDFAtlas } from './MSDFAtlas';
import { ParticleSystem } from './ParticleSystem';
import { StageBackground } from './StageBackground';
import type { StageBackgroundOptions } from './StageBackground';
import { BAKUDAN_THEME, cinemaLabelsFor } from './cinemaConfig';

const DESKTOP_POOL = 5000;
const MOBILE_POOL = 1000;
const MOBILE_BREAKPOINT = 768;
const STATUS_UPDATE_INTERVAL_MS = 500;
const A11Y_UPDATE_INTERVAL_MS = 2000;
const INTERACTIVE_IDLE_MS = 1500;
const DESKTOP_DRAWER_RATIO = 0.46;
const MOBILE_DRAWER_RATIO = 0.69;
const OVERLAY_MARGIN_DESKTOP = 16;
const OVERLAY_MARGIN_MOBILE = 8;
const COMMAND_DECK_MAX_WIDTH = 960;
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
      this.app.hasAmbientAnimation ||
      this.app.hasActiveParticles
    );
  }
}

class ParticleOverlay extends Entity {
  isPointInside(_gx: number, _gy: number): boolean {
    return false;
  }

  render(renderer: IRenderer): void {
    ParticleSystem.render(renderer);
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
  private particleOverlay: ParticleOverlay | null = null;
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

  private labOpen = false;
  private activeLabTab: LabTab = 'videos';
  private distributionId: DistributionId = 'steady';
  private videoLoadState: VideoLoadState = { status: 'idle' };
  private currentVideoSelection: VideoSelection = { kind: 'catalog', id: DEFAULT_VIDEO_ID };
  private pendingVideoSelection: VideoSelection | null = null;
  private pendingTrackProfileId: string | null = null;
  private devtoolsAvailability: DevToolsAvailability = import.meta.env.DEV
    ? 'reload-required'
    : 'unavailable';
  private _viewportTop = 0;
  private _viewportBottom: number | null = null;

  private mode: AppMode = 'video';
  private danmakuTrack!: ProfiledDanmakuTrack;
  private videoLoading = false;
  private _videoRequestId = 0;
  private _stressTargetBeforeVideo = 500;

  // Language and stable video/profile identity.
  currentLang: Language;
  currentVideoId = DEFAULT_VIDEO_ID;
  currentTrackProfileId = videoById(DEFAULT_VIDEO_ID)!.defaultTrackProfileId;

  private _particlesActive = false;
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

  /** True while the ambient gradient background is animating. */
  get hasAmbientAnimation(): boolean {
    return this.bg.mode === 'ambient';
  }

  /** True while there are active explosion particles. */
  get hasActiveParticles(): boolean {
    return this._particlesActive;
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
  private _lastPointerMove = 0;
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

    this.bg = options.stageBackground ?? new StageBackground(options.stageBackgroundOptions);
    this.bg.mode = 'video';
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
    this.particleOverlay = new ParticleOverlay();
    scene.showOverlay(this.particleOverlay);
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
      rateRange: { min: 1, max: 2000, step: 10 },
      onTargetChange: (target) => {
        this._setAppMode('stress');
        this._stressTargetBeforeVideo = target;
        this._profTargetCount = target;
        this.scheduler.setTargetCount(target);
        this._syncThroughputState();
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
      effects: EFFECT_IDS.map((id) => ({ id, label: t(`fx.${id}`, this.currentLang) })),
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
        { id: 'throughput', label: labels.kit.lab.throughput, panel: this.throughputPanel },
        {
          id: 'interactions',
          label: labels.kit.lab.interactions,
          panel: this.interactionsPanel,
        },
        { id: 'devtools', label: labels.kit.lab.devtools, panel: this.devtoolsPanel },
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
    if (sameSource && profileId === this.currentTrackProfileId) return;
    if (sameSource) {
      this._onTrackProfileChange(profileId);
      return;
    }
    this._loadVideoSelection(selection, profileId);
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
    this._syncVideosState();
    this._syncStatus();
    this._syncPlaybackState();

    void this.bg
      .setVideo(candidate.source.url)
      .then(() => {
        if (requestId !== this._videoRequestId || this.destroyed) return;
        this.videoLoading = false;
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
        void this.bg.play().catch((error: unknown) => {
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
    if (this.bg.paused) return 'paused';
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
        this.devtoolsPanel.setState({ availability: 'available', canReload: false });
      })
      .catch(() => {
        if (this.destroyed) return;
        this.devtoolsAvailability = 'unavailable';
        this.devtoolsPanel.setState({ availability: 'unavailable', canReload: false });
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
    this.statusBar.y = viewportTop + margin;
    this.commandDeck.setCompact(compact).setWidth(deckWidth);
    this.commandDeck.x = Math.max(margin, (this.stageW - deckWidth) / 2);

    const drawerHeight = Math.round(
      viewportHeight * (compact ? MOBILE_DRAWER_RATIO : DESKTOP_DRAWER_RATIO),
    );
    const drawerY = viewportBottom - drawerHeight;
    this.labDrawer.setAvailableBounds({ width: this.stageW, height: drawerHeight });
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

    this.profiler.beginPhase('particles.update');
    this._particlesActive = ParticleSystem.update(dt);
    this.profiler.endPhase('particles.update');

    if (!this._dragSlot) {
      const now = performance.now();
      if (now - this._lastPointerMove > INTERACTIVE_IDLE_MS) {
        this._interactiveMode = false;
      }
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

    const slots = this.pool.slots;

    if (!this._interactiveMode) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.hovered) {
          s.hovered = false;
          s.paused = s.dragging;
        }
      }
    }
    this.profiler.endPhase('app.frame(js)');
  }

  private _updateHover(): void {
    let foundTop = false;
    const slots = this.pool.slots;
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      if (!s.active) continue;
      if (!foundTop) {
        const localX = this.pointerX - s.x;
        const localY = this.pointerY - s.y;
        if (localX >= 0 && localY >= 0) {
          const w = (s.width || 80) + (s.hovered ? ACTION_BTN_WIDTH : 0);
          const h = (s.params.fontSize || 24) * 1.4;
          if (localX <= w && localY <= h) {
            if (!s.hovered) {
              s.hovered = true;
              s.paused = true;
            }
            foundTop = true;
            continue;
          }
        }
      }
      if (s.hovered) {
        s.hovered = false;
        s.paused = s.dragging;
      }
    }
  }

  private _setAppMode(mode: AppMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this._profMode = mode;
    if (mode === 'video') {
      this.scheduler.setTargetCount(0);
      this.bg.mode = 'video';
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
        color: entry.color ?? '#453c38', // warm-charcoal default color
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
    this.bg.seek(t);
    this.danmakuTrack.seek(t);
    // While paused the loop is idle (no pending animation), so the new video
    // frame won't repaint on its own — force one.
    this._syncPlaybackState();
    this.scene.markDirty();
  }

  private _onUserSend(text: string): void {
    const time = this.mode === 'video' ? this.bg.currentTime : 0;
    const entry = {
      time: Math.round(time * 10) / 10,
      text,
      color: '#453c38',
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
      saveUserDanmaku(this.currentVideoId, entry);
      const duration = this.bg.duration || 15;
      this._installVideoTrack(duration, this.currentVideoId, this.currentTrackProfileId);
      this.danmakuTrack.seek(this.bg.currentTime);
    }
  }

  /** Topmost active danmaku slot whose box (plus action strip) is under the
   *  pointer. Scans back-to-front so the most-recently-drawn wins. */
  private _findSlotAtPointer(): PoolSlot | null {
    const slots = this.pool.slots;
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      if (!s.active) continue;
      const localX = this.pointerX - s.x;
      const localY = this.pointerY - s.y;
      if (localX >= 0 && localY >= 0) {
        const w = (s.width || 80) + (s.hovered ? ACTION_BTN_WIDTH : 0);
        const h = (s.params.fontSize || 24) * 1.4;
        if (localX <= w && localY <= h) {
          return s;
        }
      }
    }
    return null;
  }

  private readonly _handlePointerMove = (event: PointerEvent): void => {
    const canvas = this.scene.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    this.pointerX = (event.clientX - rect.left) * scaleX;
    this.pointerY = (event.clientY - rect.top) * scaleY;
    this._lastPointerMove = performance.now();
    this._interactiveMode = true;
    if (this._dragSlot) {
      this._dragSlot.x = this.pointerX - this._dragOffX;
      this._dragSlot.y = this.pointerY - this._dragOffY;
      this.scene.markDirty();
    }
  };

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    this.pointerActive = true;
    const inCommandDeck =
      this.pointerX >= this.commandDeck.x &&
      this.pointerX <= this.commandDeck.x + this.commandDeck.width &&
      this.pointerY >= this.commandDeck.y &&
      this.pointerY <= this.commandDeck.y + this.commandDeck.height;
    const inLab =
      this.labOpen &&
      this.pointerX >= this.labDrawer.x &&
      this.pointerX <= this.labDrawer.x + this.labDrawer.width &&
      this.pointerY >= this.labDrawer.y &&
      this.pointerY <= this.labDrawer.y + this.labDrawer.height;
    if (this.labOpen && !inLab && !inCommandDeck) {
      this.setLabOpen(false);
      return;
    }
    if (inLab || inCommandDeck || !this._interactiveMode) return;

    const slot = this._findSlotAtPointer();
    if (!slot) return;
    const localX = this.pointerX - slot.x;
    const action = slot.hovered ? hitAction(slot, localX) : null;
    if (action === 'like') {
      slot.liked = !slot.liked;
      ParticleSystem.spawnExplosion(this.pointerX, this.pointerY, slot.params.color);
      this.scene.markDirty();
      return;
    }
    if (action === 'copy') {
      void navigator.clipboard?.writeText(slot.params.text).catch(() => {});
      ParticleSystem.spawnExplosion(this.pointerX, this.pointerY, '#f43f5e');
      return;
    }

    this._dragSlot = slot;
    slot.dragging = true;
    slot.paused = true;
    this._dragOffX = this.pointerX - slot.x;
    this._dragOffY = this.pointerY - slot.y;
    this.scene.canvas.setPointerCapture(event.pointerId);
  };

  private readonly _handlePointerEnd = (): void => {
    this.pointerActive = false;
    if (!this._dragSlot) return;
    this._dragSlot.dragging = false;
    this._dragSlot.paused = this._dragSlot.hovered;
    this._dragSlot = null;
  };

  private _setupPointerTracking(): void {
    const canvas = this.scene.canvas;
    canvas.addEventListener('pointermove', this._handlePointerMove);
    canvas.addEventListener('pointerdown', this._handlePointerDown);
    canvas.addEventListener('pointerup', this._handlePointerEnd);
    canvas.addEventListener('pointerleave', this._handlePointerEnd);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._videoRequestId++;
    const canvas = this.scene.canvas;
    canvas.removeEventListener('pointermove', this._handlePointerMove);
    canvas.removeEventListener('pointerdown', this._handlePointerDown);
    canvas.removeEventListener('pointerup', this._handlePointerEnd);
    canvas.removeEventListener('pointerleave', this._handlePointerEnd);
    this.labDrawer.setOpen(false);
    if (this.statusBar.parent) this.scene.hideOverlay(this.statusBar);
    if (this.commandDeck.parent) this.scene.hideOverlay(this.commandDeck);
    if (this.labDrawer.parent) this.scene.hideOverlay(this.labDrawer);
    if (this.particleOverlay?.parent) this.scene.hideOverlay(this.particleOverlay);
    if (this.ticker?.parent) this.scene.remove(this.ticker);
    if (this.announcer.parent) this.scene.remove(this.announcer);
    if (this.danmakuLayer.parent) this.scene.remove(this.danmakuLayer);
    this.bg.destroy();
    if (this.bg.parent) this.scene.remove(this.bg);
    this.ticker = null;
    this.particleOverlay = null;
  }
}
