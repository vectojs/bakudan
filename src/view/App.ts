import { Scene, Entity } from '@vectojs/core';
import { DanmakuPool } from '../model/DanmakuPool';
import { Scheduler } from '../model/Scheduler';
import { DanmakuTrack } from '../model/DanmakuTrack';
import { DEMO_TIMED_TRACK } from '../model/demoTimedTrack';
import type { PresetId, CharacterEffects } from '../model/types';
import { StageBackground } from './StageBackground';
import { DanmakuEntity } from './DanmakuEntity';
import { DanmakuAnnouncer } from './DanmakuAnnouncer';
import { Dock } from './Dock';
import { ControlCenter } from './ControlCenter';
import { HUD } from './HUD';
import { PlayerControls } from './PlayerControls';

const DESKTOP_POOL = 5000;
const MOBILE_POOL = 1000;
const MOBILE_BREAKPOINT = 768;
const HUD_UPDATE_INTERVAL_MS = 500;
const A11Y_UPDATE_INTERVAL_MS = 2000;
const PANEL_WIDTH = 280;
const INTERACTIVE_IDLE_MS = 1500;
const DEMO_VIDEO_SRC = '/video/demo-clip.mp4';

type AppMode = 'stress' | 'video';

class Ticker extends Entity {
  constructor(private app: App) {
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
    return true;
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
  private danmakuEntities: DanmakuEntity[] = [];
  private announcer: DanmakuAnnouncer;
  private hud: HUD;
  private dock: Dock;
  private controlCenter: ControlCenter;
  private playerControls: PlayerControls;
  private panelOpen = false;

  private mode: AppMode = 'stress';
  private danmakuTrack: DanmakuTrack;
  private videoLoading = false;
  private videoLoadFailed = false;
  /** Restore the stress-test spawn target when switching back from video
   * mode, since video mode zeroes it out (the track drives spawns itself,
   * not the random-fill scheduler). */
  private _stressTargetBeforeVideo = 500;

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
  private _dragEntity: DanmakuEntity | null = null;
  private _dragOffX = 0;
  private _dragOffY = 0;

  private _frameAccumMs = 0;
  private _frameCount = 0;
  private _lastFps = 60;
  private _lastA11y = 0;

  constructor(scene: Scene) {
    this.scene = scene;

    const isMobileInit = window.innerWidth < MOBILE_BREAKPOINT;
    const poolCap = isMobileInit ? MOBILE_POOL : DESKTOP_POOL;
    this.isMobile = isMobileInit;

    this.pool = new DanmakuPool(poolCap);
    this.scheduler = new Scheduler(
      this.pool,
      window.innerWidth,
      window.innerHeight,
      isMobileInit ? 200 : 500,
    );

    this.bg = new StageBackground();
    this.announcer = new DanmakuAnnouncer();
    this.hud = new HUD();
    this.danmakuTrack = new DanmakuTrack(DEMO_TIMED_TRACK);
    this._stressTargetBeforeVideo = isMobileInit ? 200 : 500;
    this.dock = new Dock({
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
    this.controlCenter = new ControlCenter(PANEL_WIDTH, 600, {
      onPresetChange: (p) => {
        this.activePreset = p;
      },
      onStressCountChange: (n) => this.scheduler.setTargetCount(n),
      onStressRateChange: (r) => this.scheduler.setSpawnRate(r),
      onEffectToggle: (key) => {
        this.effects[key] = !this.effects[key];
      },
      onToggleShowcase: () => {},
      onBgModeChange: (mode) => {
        if (this.mode === 'video') return; // video mode owns bg.mode
        this.bg.mode = mode;
        if (mode !== 'video') {
          this.bg.stopVideo();
        }
      },
      onPresetParamChange: () => {},
      onFpsCapChange: (fps) => {
        this.scene.maxFPS = fps;
      },
      onAppModeChange: (m) => this._setAppMode(m),
    });

    for (let i = 0; i < poolCap; i++) {
      const de = new DanmakuEntity();
      this.danmakuEntities.push(de);
    }

    scene.add(this.bg);
    scene.add(this.announcer);
    // UI chrome uses the overlay root, not the main tree: danmaku entities
    // are continuously scene.add()-ed as new ones spawn, and each newly
    // added entity draws AFTER (on top of) everything already in the main
    // tree. A HUD/Dock/panel added once at startup would end up buried
    // under every danmaku spawned afterward. showOverlay() bypasses main-
    // tree ordering and clipping so UI chrome always stays on top.
    scene.showOverlay(this.hud);
    scene.showOverlay(this.dock);
  }

  onResize(width: number, height: number): void {
    this.stageW = width;
    this.stageH = height;
    this.isMobile = width < MOBILE_BREAKPOINT;
    this.scheduler.resize(width, height);

    this.bg.width = width;
    this.bg.height = height;
    this.hud.alignToStage(width);

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
  }

  frame(dt: number): void {
    this._frameAccumMs += dt;
    this._frameCount++;
    if (this._frameAccumMs >= HUD_UPDATE_INTERVAL_MS) {
      this._lastFps = Math.round((this._frameCount / this._frameAccumMs) * 1000);
      this.hud.data.fps = this._lastFps;
      this.hud.data.frameTime = this._frameAccumMs / this._frameCount;
      this.hud.data.entityCount = this.pool.activeCount;
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

    if (!this._dragEntity) {
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

    if (this._interactiveMode && !this._dragEntity) {
      this._updateHover();
    }

    for (let i = 0; i < this.pool.capacity; i++) {
      const slot = this.pool.slots[i];
      const de = this.danmakuEntities[i];
      if (slot.active) {
        if (!de.parent) {
          de.slot = slot;
          de.boundParams = slot.params;
          de.interactive = true;
          this.scene.add(de);
        } else if (de.boundParams !== slot.params) {
          // Same pool index recycled within the same tick (deactivate +
          // reactivate before the view sync ran, e.g. a danmaku scrolled
          // off-screen and a new one spawned into the same slot before
          // App.frame() got to sync entities). Re-bind so hovered/liked
          // state from the previous occupant doesn't leak onto new content.
          de.slot = slot;
          de.boundParams = slot.params;
          de.hovered = false;
          de.liked = false;
        }
        if (!this._dragEntity) {
          de.x = slot.x;
          de.y = slot.y;
        }
        de.interactive = this._interactiveMode;
        slot.params.effects = { ...this.effects };
      } else {
        if (de.parent) {
          this.scene.remove(de);
          de.slot = null;
          de.hovered = false;
          de.interactive = false;
          de.dragging = false;
        }
      }
    }

    if (!this._interactiveMode) {
      for (const de of this.danmakuEntities) {
        if (de.hovered) {
          de.hovered = false;
        }
      }
    }
  }

  private _updateHover(): void {
    for (const de of this.danmakuEntities) {
      if (!de.slot?.active || !de.interactive) continue;
      const localX = this.pointerX - de.x;
      const localY = this.pointerY - de.y;
      const w = (de.slot.width || 80) + de.actionBtnWidth;
      const h = (de.slot.params.fontSize || 24) * 1.4;
      de.hovered = localX >= 0 && localX <= w && localY >= 0 && localY <= h;
    }
  }

  /**
   * Switch between the random-fill stress-test scheduler and timestamp-
   * pinned video-track playback. The two are mutually exclusive: video
   * mode zeroes the scheduler's random-fill target (userSpawn() calls from
   * DanmakuTrack entries still flow through the same pool/lane machinery),
   * and switching back restores whatever target was active before.
   */
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
          .setVideo(DEMO_VIDEO_SRC)
          .then(() => {
            this.videoLoading = false;
            this.bg.onEnded(() => {
              this.playerControls.setPlaybackState(this.bg.currentTime, this.bg.duration, true);
            });
          })
          .catch(() => {
            this.videoLoading = false;
            this.videoLoadFailed = true;
            this.announcer.setSummary('Video failed to load. Falling back to ambient background.');
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

  /** Advance the video-danmaku track and reflect the video element's
   * transport state into the PlayerControls UI. Called once per frame
   * while in video mode. */
  private _frameVideo(): void {
    if (this.videoLoadFailed || !this.bg.isVideoReady) {
      return;
    }
    const t = this.bg.currentTime;
    const fired = this.danmakuTrack.sync(t);
    for (const entry of fired) {
      this.scheduler.userSpawn({
        text: entry.text,
        color: entry.color ?? '#f1f5f9',
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
  }

  private _onUserSend(text: string): void {
    this.scheduler.userSpawn({
      text,
      color: '#f1f5f9',
      fontSize: 24,
      speed: 200,
      opacity: 0.9,
      preset: this.activePreset,
      presetParams: {},
      effects: { ...this.effects },
    });
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
      this.dock.width = Math.min(600, W - PANEL_WIDTH - 32);
      this.dock.x = (W - PANEL_WIDTH - this.dock.width) / 2;
      this.dock.y = H - 60;
    }
  }

  /** Positioned directly above the Dock, sharing its horizontal span. */
  private _layoutPlayerControls(W: number, H: number): void {
    if (this.isMobile) {
      this.playerControls.width = W - 16;
      this.playerControls.x = 8;
      this.playerControls.y = H - 60 - 52;
    } else {
      this.playerControls.width = Math.min(640, W - PANEL_WIDTH - 32);
      this.playerControls.x = (W - PANEL_WIDTH - this.playerControls.width) / 2;
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
      if (this.panelOpen) {
        this.controlCenter.x = W - PANEL_WIDTH;
        if (!this.controlCenter.parent) this.scene.showOverlay(this.controlCenter);
      } else {
        this.controlCenter.x = W;
        if (!this.controlCenter.parent) this.scene.showOverlay(this.controlCenter);
      }
    }
  }

  private _findEntityAtPointer(): DanmakuEntity | null {
    for (const de of this.danmakuEntities) {
      if (!de.slot?.active || !de.interactive) continue;
      const localX = this.pointerX - de.x;
      const localY = this.pointerY - de.y;
      const w = (de.slot.width || 80) + de.actionBtnWidth;
      const h = (de.slot.params.fontSize || 24) * 1.4;
      if (localX >= 0 && localX <= w && localY >= 0 && localY <= h) {
        return de;
      }
    }
    return null;
  }

  private _setupPointerTracking(): void {
    const canvas = (this.scene as any).canvas as HTMLCanvasElement | undefined;
    if (!canvas) return;

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerX = e.clientX - rect.left;
      this.pointerY = e.clientY - rect.top;
      this._lastPointerMove = performance.now();
      if (!this._interactiveMode) {
        this._interactiveMode = true;
      }

      if (this._dragEntity) {
        this._dragEntity.x = this.pointerX - this._dragOffX;
        this._dragEntity.y = this.pointerY - this._dragOffY;
        this.scene.markDirty();
      }
    });

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointerActive = true;
      if (!this._interactiveMode) return;

      const de = this._findEntityAtPointer();
      if (!de || !de.slot) return;

      const localX = this.pointerX - de.x;
      const action = de.hitAction(localX);
      if (action === 'like') {
        de.liked = !de.liked;
        this.scene.markDirty();
        return;
      }
      if (action === 'copy') {
        navigator.clipboard.writeText(de.slot.params.text).catch(() => {});
        return;
      }

      this._dragEntity = de;
      this._dragOffX = this.pointerX - de.x;
      this._dragOffY = this.pointerY - de.y;
      de.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointerup', () => {
      this.pointerActive = false;
      if (this._dragEntity) {
        this._dragEntity.dragging = false;
        this._dragEntity = null;
      }
    });

    canvas.addEventListener('pointerleave', () => {
      this.pointerActive = false;
      if (this._dragEntity) {
        this._dragEntity.dragging = false;
        this._dragEntity = null;
      }
    });
  }
}
