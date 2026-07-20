import { Entity, type IRenderer } from '@vectojs/core';

type BgMode = 'none' | 'ambient' | 'video';

export class StageBackground extends Entity {
  width = 1920;
  height = 1080;
  mode: BgMode = 'ambient';
  private _video: HTMLVideoElement | null = null;
  private _videoSrc: string | null = null;
  private _t = 0;
  private _endedCallback: (() => void) | null = null;

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  constructor() {
    super();
    void this._videoSrc;
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
  }

  stopVideo(): void {
    if (this._video) {
      this._removeEndedListener();
      this._video.pause();
      this._video.removeAttribute('src');
      this._video.load();
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

  render(renderer: IRenderer): void {
    if (this.mode === 'video' && this._video && this._video.readyState >= 2) {
      renderer.drawImage(this._video, 0, 0, this.width, this.height);
      return;
    }

    if (this.mode === 'ambient') {
      this._t += 0.005;
      // Subtle light warm cream gradient animation matching gallery
      const grad = renderer.createLinearGradient(0, 0, this.width, this.height, [
        { stop: 0, color: '#faf8f6' },
        {
          stop: 0.4,
          color: `hsl(${18 + Math.sin(this._t) * 2}, 30%, ${96 + Math.cos(this._t * 1.3) * 1}%)`,
        },
        { stop: 0.7, color: '#fdf6f0' },
        { stop: 1, color: '#fef0e8' },
      ]);
      renderer.beginPath();
      renderer.moveTo(0, 0);
      renderer.lineTo(this.width, 0);
      renderer.lineTo(this.width, this.height);
      renderer.lineTo(0, this.height);
      renderer.closePath();
      renderer.fill(grad);
      return;
    }

    // "none" mode — flat warm cream background
    renderer.beginPath();
    renderer.moveTo(0, 0);
    renderer.lineTo(this.width, 0);
    renderer.lineTo(this.width, this.height);
    renderer.lineTo(0, this.height);
    renderer.closePath();
    renderer.fill('#faf8f6');
  }

  override destroy(): void {
    this.stopVideo();
    super.destroy();
  }
}
