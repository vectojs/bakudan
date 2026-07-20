import { Entity, type IRenderer } from '@vectojs/core';

type BgMode = 'none' | 'ambient' | 'video';

/**
 * The stage background layer.
 *
 * This is a DOM layer (`#bakudan-bg`, z-index 0), NOT canvas-painted: the
 * danmaku moved to a stacked WebGL canvas (z1) that must sit ABOVE the
 * background but BELOW the Canvas2D UI (z2), and the 2D canvas can't hold the
 * background without covering the GL danmaku. Ambient mode is a CSS gradient
 * (class `ambient`); video mode attaches a real `<video>` element the browser
 * composites directly (also removes a full-screen per-frame `drawImage`).
 *
 * It remains an `Entity` (added to the scene) purely for lifecycle symmetry;
 * `render()` is a no-op. The video-track sync still reads `currentTime`/
 * `seek()`/`play()`/`pause()` exactly as before — those work identically on a
 * DOM `<video>`.
 */
export class StageBackground extends Entity {
  width = 1920;
  height = 1080;
  private _mode: BgMode = 'ambient';
  private _video: HTMLVideoElement | null = null;
  private _videoSrc: string | null = null;
  private _endedCallback: (() => void) | null = null;
  private readonly _host: HTMLElement | null;

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  constructor() {
    super();
    void this._videoSrc;
    this._host = typeof document !== 'undefined' ? document.getElementById('bakudan-bg') : null;
    this._applyModeClass();
  }

  /** Background mode. Setting it toggles the DOM host's CSS + video visibility. */
  get mode(): BgMode {
    return this._mode;
  }
  set mode(m: BgMode) {
    if (this._mode === m) return;
    this._mode = m;
    this._applyModeClass();
  }

  /** Reflect the current mode onto the DOM host (gradient vs. video vs. blank). */
  private _applyModeClass(): void {
    if (!this._host) return;
    this._host.classList.toggle('ambient', this._mode === 'ambient');
    if (this._video) this._video.style.display = this._mode === 'video' ? 'block' : 'none';
  }

  /**
   * Set a video source for the background layer. The `<video>` element is
   * created, loaded, and its canvas-draw-compatible frames are drawn via
   * renderer.drawImage each frame. Does NOT auto-play — call `play()`
   * explicitly so the video-danmaku track and the visible playhead start
   * from the same known state (autoplay-and-fire-danmaku-immediately would
   * race against `DanmakuTrack.seek(0)`).
   */
  async setVideo(src: string): Promise<void> {
    this.stopVideo();
    const video = document.createElement('video');
    video.src = src;
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('error', onError);
        reject(new Error(`Failed to load video: ${src}`));
      };
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('error', onError);
    });
    this._video = video;
    this._videoSrc = src;
    // Mount into the DOM background layer so the browser composites it directly
    // (z0, beneath the GL danmaku). Visible only while mode === 'video'.
    video.style.display = this._mode === 'video' ? 'block' : 'none';
    this._host?.appendChild(video);
  }

  stopVideo(): void {
    if (this._video) {
      this._removeEndedListener();
      this._video.pause();
      this._video.removeAttribute('src');
      this._video.load();
      this._video.remove();
      this._video = null;
      this._videoSrc = null;
    }
  }

  /** Play the background video. No-op if none is loaded. */
  async play(): Promise<void> {
    await this._video?.play();
  }

  /** Pause the background video. No-op if none is loaded. */
  pause(): void {
    this._video?.pause();
  }

  get paused(): boolean {
    return this._video?.paused ?? true;
  }

  /** Current playback position in seconds, or 0 if no video is loaded. */
  get currentTime(): number {
    return this._video?.currentTime ?? 0;
  }

  /** Total duration in seconds, or 0 if metadata hasn't loaded yet. */
  get duration(): number {
    return this._video?.duration ?? 0;
  }

  /** Jump to an absolute time in seconds, clamped to `[0, duration]`. */
  seek(t: number): void {
    if (!this._video) return;
    const d = this._video.duration || Infinity;
    this._video.currentTime = Math.max(0, Math.min(t, d));
  }

  get playbackRate(): number {
    return this._video?.playbackRate ?? 1;
  }

  set playbackRate(rate: number) {
    if (this._video) this._video.playbackRate = rate;
  }

  /** True once the video has metadata loaded and is ready to seek/play. */
  get isVideoReady(): boolean {
    return !!this._video && this._video.readyState >= 1;
  }

  /** Register a listener for the underlying `<video>` element's `ended` event. */
  onEnded(cb: () => void): void {
    // Remove any previous listener to prevent accumulation
    this._removeEndedListener();
    this._endedCallback = cb;
    this._video?.addEventListener('ended', cb);
  }

  private _removeEndedListener(): void {
    if (this._endedCallback && this._video) {
      this._video.removeEventListener('ended', this._endedCallback);
    }
    this._endedCallback = null;
  }

  /**
   * No-op: the background is a DOM layer (CSS gradient + `<video>`), composited
   * beneath the GL danmaku canvas. Kept so `StageBackground` stays a valid
   * scene `Entity` for lifecycle/resize symmetry.
   */
  render(_renderer: IRenderer): void {
    // intentionally empty — see class docstring
  }

  override destroy(): void {
    this.stopVideo();
    super.destroy();
  }
}
