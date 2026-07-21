import { Scene, Entity, type IRenderer } from '@vectojs/core';
import { DanmakuPool, Scheduler, DanmakuTrack } from '@vectojs/danmaku-core';
import { detectBrowserLanguage, type Language, t } from '../model/i18n';
import { generateLargeTimedTrack, saveUserDanmaku } from '../model/demoTimedTrack';
import { ContentLibrary } from '../model/ContentLibrary';
import type { PresetId, CharacterEffects } from '../model/types';
import { StageBackground } from './StageBackground';
import { DanmakuLayer, hitAction, ACTION_BTN_WIDTH } from './DanmakuLayer';
import { textBitmapStats } from './TextBitmapCache';
import { loadMSDFAtlas } from './MSDFAtlas';
import type { PoolSlot } from '../model/types';
import { DanmakuAnnouncer } from './DanmakuAnnouncer';
import { Dock } from './Dock';
import { ControlCenter } from './ControlCenter';
import { HUD } from './HUD';
import { PlayerControls } from './PlayerControls';
import { ParticleSystem } from './ParticleSystem';
import { HelpModal } from './HelpModal';
import { Button } from '@vectojs/ui';

const DESKTOP_POOL = 5000;
const MOBILE_POOL = 1000;
const MOBILE_BREAKPOINT = 768;
const HUD_UPDATE_INTERVAL_MS = 500;
const A11Y_UPDATE_INTERVAL_MS = 2000;
const PANEL_WIDTH = 280;
const INTERACTIVE_IDLE_MS = 1500;

type AppMode = 'stress' | 'video';

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

  private bg!: StageBackground;
  private danmakuLayer!: DanmakuLayer;
  private announcer: DanmakuAnnouncer;
  private hud!: HUD;
  private dock!: Dock;
  private controlCenter!: ControlCenter;
  private playerControls!: PlayerControls;
  private helpBtn!: Button;
  private panelOpen = false;

  private mode: AppMode = 'stress';
  private danmakuTrack!: DanmakuTrack;
  private videoLoading = false;
  private videoLoadFailed = false;
  private _stressTargetBeforeVideo = 500;
  showcasePhysics = false;
  showcaseJelly = false;

  // Language & Video tracking state
  currentLang: Language;
  currentVideoUrl = '/video/demo-clip.mp4';

  // Sliding panel animation X coordinate
  private _panelX = 0;
  private _particlesActive = false;

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

  constructor(scene: Scene) {
    this.scene = scene;
    this.currentLang = detectBrowserLanguage();
    this._panelX = window.innerWidth; // start panel closed

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

    this.bg = new StageBackground();
    this.announcer = new DanmakuAnnouncer();
    this._stressTargetBeforeVideo = isMobileInit ? 200 : 500;

    // Default 15s track generator
    const initialTrack = generateLargeTimedTrack(15);
    this.danmakuTrack = new DanmakuTrack(initialTrack);

    // Initial build of UI controls
    this._buildUI();

    // One batch-painting node for the entire stress pool (see DanmakuLayer).
    this.danmakuLayer = new DanmakuLayer(this.pool, () => ({
      w: this.stageW,
      h: this.stageH,
      interactive: this._interactiveMode,
    }));

    scene.add(this.bg);
    scene.add(this.danmakuLayer);
    scene.add(this.announcer);
    scene.showOverlay(new ParticleOverlay());
  }

  /** Build or rebuild all UI overlay cards dynamically on lang/source change */
  private _buildUI(): void {
    if (this.hud?.parent) this.scene.hideOverlay(this.hud);
    if (this.dock?.parent) this.scene.hideOverlay(this.dock);
    if (this.controlCenter?.parent) this.scene.hideOverlay(this.controlCenter);
    if (this.playerControls?.parent) this.scene.hideOverlay(this.playerControls);
    if (this.helpBtn?.parent) this.scene.hideOverlay(this.helpBtn);

    this.hud = new HUD();
    this.hud.lang = this.currentLang;

    this.dock = new Dock(this.currentLang, {
      onSend: (text) => this._onUserSend(text),
      onTogglePanel: () => this._togglePanel(),
    });

    this.playerControls = new PlayerControls({
      onPlayPause: () => this._togglePlayback(),
      onSeek: (t) => this._onSeek(t),
      onRateChange: (r) => {
        this.bg.playbackRate = r;
      },
    });

    // Populate timeline curves
    this.playerControls.setPlaybackState(this.bg.currentTime, this.bg.duration, this.bg.paused);
    this.playerControls.setDanmakuDensity(this.danmakuTrack.getTimes());

    this.controlCenter = new ControlCenter(
      PANEL_WIDTH,
      this.stageH || 600,
      this.currentLang,
      this.currentVideoUrl,
      {
        onPresetChange: (p) => {
          this.activePreset = p;
        },
        onStressCountChange: (n) => this.scheduler.setTargetCount(n),
        onStressRateChange: (r) => this.scheduler.setSpawnRate(r),
        onEffectToggle: (key) => {
          // Brush semantics: the toggle changes what NEW danmaku are born
          // with. Danmaku already on screen keep their own effects, so
          // toggling rainbow, spawning some, then toggling glow yields a mix
          // of effect types on screen at once (the "laboratory" behaviour).
          this.effects[key] = !this.effects[key];
          this.scheduler.activeEffects = { ...this.effects };
        },
        onToggleShowcase: (preset, enabled) => {
          if (preset === 'physics') {
            this.showcasePhysics = enabled;
            this.scheduler.showcasePhysics = enabled;
          } else if (preset === 'jelly') {
            this.showcaseJelly = enabled;
          }
        },
        onBgModeChange: (mode) => {
          if (this.mode === 'video') return;
          this.bg.mode = mode;
          if (mode !== 'video') {
            this.bg.stopVideo();
          }
        },
        onVideoSourceChange: (url) => this._onVideoSourceChange(url),
        onPresetParamChange: () => {},
        onFpsCapChange: (fps) => {
          this.scene.maxFPS = fps;
        },
        onAppModeChange: (m) => this._setAppMode(m),
        onLanguageChange: (lang) => this._changeLanguage(lang),
        onTogglePanel: () => this._togglePanel(),
      },
    );

    // Sync position coordinate
    this.controlCenter.x = this._panelX;

    this.helpBtn = new Button(t('help.btn', this.currentLang), {
      bg: 'rgba(255, 255, 255, 0.85)',
      hoverBg: 'rgba(255, 126, 95, 0.1)',
      color: '#ff7e5f',
      radius: 18,
      font: '700 16px sans-serif',
    });
    this.helpBtn.width = 36;
    this.helpBtn.height = 36;
    this.helpBtn.on('click', () => {
      const modal = new HelpModal(this.currentLang, this.stageW, this.stageH);
      this.scene.showOverlay(modal);
    });

    this.scene.showOverlay(this.hud);
    this.scene.showOverlay(this.dock);
    this.scene.showOverlay(this.controlCenter);
    this.scene.showOverlay(this.helpBtn);

    if (this.mode === 'video') {
      this.scene.showOverlay(this.playerControls);
    }
  }

  private _onVideoSourceChange(url: string): void {
    if (this.currentVideoUrl === url) return;
    this.currentVideoUrl = url;
    this.videoLoading = true;
    this.bg.stopVideo();

    this.bg
      .setVideo(url)
      .then(() => {
        this.videoLoading = false;
        const duration = this.bg.duration || 15;

        // Dynamic timed track & density map
        const trackData = generateLargeTimedTrack(duration);
        this.danmakuTrack = new DanmakuTrack(trackData);

        this.playerControls.setPlaybackState(0, duration, true);
        this.playerControls.setDanmakuDensity(this.danmakuTrack.getTimes());

        this.bg.onEnded(() => {
          this.playerControls.setPlaybackState(this.bg.currentTime, this.bg.duration, true);
        });
        this.scene.markDirty();
      })
      .catch(() => {
        this.videoLoading = false;
        this.videoLoadFailed = true;
        this.announcer.setSummary('Video failed to load.');
      });
  }

  private _changeLanguage(lang: Language): void {
    if (this.currentLang === lang) return;
    this.currentLang = lang;
    this._buildUI();
    this.onResize(this.stageW, this.stageH);
    this.scene.markDirty();
  }

  onResize(width: number, height: number): void {
    this.stageW = width;
    this.stageH = height;
    this.isMobile = width < MOBILE_BREAKPOINT;
    this.scheduler.resize(width, height);

    this.bg.width = width;
    this.bg.height = height;
    this.hud.alignToStage(width);

    if (this.helpBtn) {
      this.helpBtn.x = 24;
      this.helpBtn.y = height - 24 - 36;
    }

    // Recalculate offscreen coordinate targets
    const targetPanelX = this.panelOpen ? width - PANEL_WIDTH : width;
    this._panelX = targetPanelX;
    this.controlCenter.x = this._panelX;

    this._layoutDock(width, height);
    this._layoutPanel(width, height);
    this._layoutPlayerControls(width, height);

    this.scene.markDirty();
  }

  onViewportChange(vp: VisualViewport): void {
    if (this.isMobile) {
      const vpBottom = vp.height + vp.offsetTop;
      this.dock.y = Math.max(0, vpBottom - 60);
      this.scene.markDirty();
    }
  }

  start(): void {
    this._setupPointerTracking();
    this.scene.add(new Ticker(this));
    // Load the MSDF atlas and hand it to the danmaku layer so plain text draws
    // through the batched WebGL glyph path. Async + best-effort: until it
    // resolves (or if it fails / WebGL is unavailable) the layer stays on the
    // Canvas2D glyph-bitmap fallback, so nothing blocks startup.
    void loadMSDFAtlas().then((atlas) => {
      if (atlas) {
        this.danmakuLayer.setMSDF(atlas);
        this.scene.markDirty();
      }
    });
  }

  frame(dt: number): void {
    this._frameAccumMs += dt;
    this._frameCount++;
    if (this._frameAccumMs >= HUD_UPDATE_INTERVAL_MS) {
      this._lastFps = Math.round((this._frameCount / this._frameAccumMs) * 1000);
      this.hud.data.fps = this._lastFps;
      this.hud.data.frameTime = this._frameAccumMs / this._frameCount;
      this.hud.data.entityCount = this.pool.activeCount;

      // Glyph-bitmap cache hit rate: the ratio of danmaku drawn as a cached
      // `drawImage` blit vs. re-rasterized this session. At steady state the
      // fixed content library is fully cached, so this pins near 100%.
      const hits = textBitmapStats.hits;
      const misses = textBitmapStats.misses;
      const total = hits + misses;
      this.hud.data.measureTextHitRate = total > 0 ? (hits / total) * 100 : 100;
      this.hud.data.gcSavedCount = Math.round(this.pool.activeCount * this._lastFps);

      if (
        typeof performance !== 'undefined' &&
        'memory' in performance &&
        (performance as any).memory
      ) {
        this.hud.data.heapUsedMB = Math.round((performance as any).memory.usedJSHeapSize / 1048576);
      }
      this._frameAccumMs = 0;
      this._frameCount = 0;
    }

    if (Date.now() - this._lastA11y >= A11Y_UPDATE_INTERVAL_MS) {
      const latest = this.pool.slots
        .filter((s) => s.active)
        .slice(-3)
        .map((s) => s.params.text)
        .join(', ');
      this.announcer.setSummary(
        `${this.pool.activeCount} danmaku active. Latest: ${latest || 'none'}`,
      );
      this._lastA11y = Date.now();
    }

    // 1. Update Particle Physics
    this._particlesActive = ParticleSystem.update(dt);

    // 2. Interpolate Panel Slide Transition
    const targetPanelX = this.panelOpen ? this.stageW - PANEL_WIDTH : this.stageW;
    if (this._panelX !== targetPanelX) {
      const speed = 1800; // px/sec
      const dist = targetPanelX - this._panelX;
      const step = Math.sign(dist) * speed * (dt / 1000);
      if (Math.abs(step) >= Math.abs(dist)) {
        this._panelX = targetPanelX;
      } else {
        this._panelX += step;
      }
      this.controlCenter.x = this._panelX;
      // Sync Dock & PlayerControls layout to match the active viewport bounds!
      this._layoutDock(this.stageW, this.stageH);
      this._layoutPlayerControls(this.stageW, this.stageH);
      this.scene.markDirty();
    }

    if (!this._dragSlot) {
      const now = performance.now();
      if (now - this._lastPointerMove > INTERACTIVE_IDLE_MS) {
        this._interactiveMode = false;
      }
    }

    if (this.mode === 'video') {
      this._frameVideo();
    }

    this.scheduler.tick(dt, this.activePreset, {
      cursorX: this.pointerX,
      cursorY: this.pointerY,
      pointerActive: this.pointerActive,
    });

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

    if (mode === 'video') {
      this._stressTargetBeforeVideo = this.scheduler.target;
      this.scheduler.setTargetCount(0);
      this.bg.mode = 'video';
      this.danmakuTrack.reset();
      this.videoLoadFailed = false;
      if (!this.videoLoading && !this.bg.isVideoReady) {
        this.videoLoading = true;
        this.bg
          .setVideo(this.currentVideoUrl)
          .then(() => {
            this.videoLoading = false;
            const duration = this.bg.duration || 15;

            // Generate localized timely track
            const trackData = generateLargeTimedTrack(duration);
            this.danmakuTrack = new DanmakuTrack(trackData);

            this.playerControls.setPlaybackState(0, duration, true);
            this.playerControls.setDanmakuDensity(this.danmakuTrack.getTimes());

            this.bg.onEnded(() => {
              this.playerControls.setPlaybackState(this.bg.currentTime, this.bg.duration, true);
            });
            this.scene.markDirty();
          })
          .catch(() => {
            this.videoLoading = false;
            this.videoLoadFailed = true;
            this.announcer.setSummary('Video failed to load.');
            this.bg.mode = 'ambient';
          });
      }
      if (!this.playerControls.parent) this.scene.showOverlay(this.playerControls);
    } else {
      this.scheduler.setTargetCount(this._stressTargetBeforeVideo);
      this.bg.mode = 'ambient';
      this.bg.pause();
      if (this.playerControls.parent) this.scene.hideOverlay(this.playerControls);
    }
    this._layoutPlayerControls(this.stageW, this.stageH);
    this.scene.markDirty();
  }

  private _frameVideo(): void {
    if (this.videoLoadFailed || !this.bg.isVideoReady) {
      return;
    }
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
        effects: { ...this.effects },
      });
    }
    this.playerControls.setPlaybackState(t, this.bg.duration, this.bg.paused);
  }

  private _togglePlayback(): void {
    if (this.bg.paused) {
      this.bg.play().catch(() => {});
    } else {
      this.bg.pause();
    }
  }

  private _onSeek(t: number): void {
    this.bg.seek(t);
    this.danmakuTrack.seek(t);
    // While paused the loop is idle (no pending animation), so the new video
    // frame won't repaint on its own — force one.
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
      saveUserDanmaku(entry);
      const duration = this.bg.duration || 15;
      const trackData = generateLargeTimedTrack(duration);
      this.danmakuTrack = new DanmakuTrack(trackData);
      this.danmakuTrack.seek(this.bg.currentTime);
      this.playerControls.setDanmakuDensity(this.danmakuTrack.getTimes());
    }
  }

  private _togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    this._layoutPanel(this.stageW, this.stageH);
    this.scene.markDirty();
  }

  private _layoutDock(W: number, H: number): void {
    if (this.isMobile) {
      this.dock.width = W - 16;
      this.dock.x = 8;
      this.dock.y = H - 60;
    } else {
      // remaining space is exactly the animated panel coordinate
      const remainingW = this._panelX;
      this.dock.width = Math.min(600, remainingW - 32);
      this.dock.x = (remainingW - this.dock.width) / 2;
      this.dock.y = H - 60;
    }
  }

  private _layoutPlayerControls(W: number, H: number): void {
    if (this.isMobile) {
      this.playerControls.width = W - 16;
      this.playerControls.x = 8;
      this.playerControls.y = H - 60 - 52;
    } else {
      const remainingW = this._panelX;
      this.playerControls.width = Math.min(640, remainingW - 32);
      this.playerControls.x = (remainingW - this.playerControls.width) / 2;
      this.playerControls.y = H - 60 - 52;
    }
  }

  private _layoutPanel(W: number, H: number): void {
    if (this.isMobile) {
      if (this.panelOpen) {
        this.controlCenter.height = H * 0.5;
        this.controlCenter.width = W;
        this.controlCenter.x = 0;
        this.controlCenter.y = H * 0.5;
        if (!this.controlCenter.parent) this.scene.showOverlay(this.controlCenter);
      } else {
        if (this.controlCenter.parent) this.scene.hideOverlay(this.controlCenter);
      }
    } else {
      this.controlCenter.height = H;
      this.controlCenter.y = 0;
      this.controlCenter.width = PANEL_WIDTH;
      // In desktop mode, controlCenter stays mounted overlay, X coordinate is animated via _panelX in frame()
      if (!this.controlCenter.parent) this.scene.showOverlay(this.controlCenter);
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

  private _setupPointerTracking(): void {
    const canvas = (this.scene as any).canvas as HTMLCanvasElement | undefined;
    if (!canvas) return;

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.pointerX = (e.clientX - rect.left) * scaleX;
      this.pointerY = (e.clientY - rect.top) * scaleY;
      this._lastPointerMove = performance.now();
      if (!this._interactiveMode) {
        this._interactiveMode = true;
      }

      if (this._dragSlot) {
        this._dragSlot.x = this.pointerX - this._dragOffX;
        this._dragSlot.y = this.pointerY - this._dragOffY;
        this.scene.markDirty();
      }
    });

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointerActive = true;
      if (!this._interactiveMode) return;

      // Click outside panel/dock to close
      if (this.panelOpen) {
        const clickInPanel =
          this.pointerX >= this._panelX && this.pointerX <= this._panelX + this.controlCenter.width;
        const clickInDock =
          this.pointerX >= this.dock.x &&
          this.pointerX <= this.dock.x + this.dock.width &&
          this.pointerY >= this.dock.y &&
          this.pointerY <= this.dock.y + this.dock.height;
        if (!clickInPanel && !clickInDock) {
          this._togglePanel();
          return;
        }
      }

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
        navigator.clipboard.writeText(slot.params.text).catch(() => {});
        ParticleSystem.spawnExplosion(this.pointerX, this.pointerY, '#ff7e5f');
        return;
      }

      this._dragSlot = slot;
      slot.dragging = true;
      slot.paused = true;
      this._dragOffX = this.pointerX - slot.x;
      this._dragOffY = this.pointerY - slot.y;
      canvas.setPointerCapture(e.pointerId);
    });

    const endDrag = (): void => {
      this.pointerActive = false;
      if (this._dragSlot) {
        this._dragSlot.dragging = false;
        this._dragSlot.paused = this._dragSlot.hovered;
        this._dragSlot = null;
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerleave', endDrag);
  }
}
