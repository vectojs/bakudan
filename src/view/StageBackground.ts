import { Entity, type IRenderer } from '@vectojs/core';

type BgMode = 'none' | 'ambient' | 'video';

export type VideoLoadErrorCode =
  | 'network-error'
  | 'media-error'
  | 'metadata-error'
  | 'playback-rejected';

export class VideoLoadError extends Error {
  constructor(
    readonly code: VideoLoadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VideoLoadError';
  }
}

export interface StageBackgroundOptions {
  host?: HTMLElement | null;
  videoFactory?: () => HTMLVideoElement;
}

/**
 * DOM-composited stage background. Video candidates load beside the active
 * element and replace it only after valid metadata is available.
 */
export class StageBackground extends Entity {
  width = 1920;
  height = 1080;
  private _mode: BgMode = 'ambient';
  private _video: HTMLVideoElement | null = null;
  private _videoSrc: string | null = null;
  private _candidate: HTMLVideoElement | null = null;
  private _candidateReject: ((error: VideoLoadError) => void) | null = null;
  private _endedCallback: (() => void) | null = null;
  private readonly _host: HTMLElement | null;
  private readonly _videoFactory: () => HTMLVideoElement;
  private _destroyed = false;

  constructor(options: StageBackgroundOptions = {}) {
    super();
    this._host =
      options.host === undefined
        ? typeof document !== 'undefined'
          ? document.getElementById('bakudan-bg')
          : null
        : options.host;
    this._videoFactory = options.videoFactory ?? (() => document.createElement('video'));
    this._applyModeClass();
  }

  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  get mode(): BgMode {
    return this._mode;
  }

  set mode(mode: BgMode) {
    if (this._mode === mode) return;
    this._mode = mode;
    this._applyModeClass();
  }

  get currentSource(): string | null {
    return this._videoSrc;
  }

  private _applyModeClass(): void {
    if (!this._host) return;
    this._host.classList.toggle('ambient', this._mode === 'ambient');
    if (this._video) this._video.style.display = this._mode === 'video' ? 'block' : 'none';
  }

  private _configureVideo(video: HTMLVideoElement, src: string): void {
    video.src = src;
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.style.display = 'none';
  }

  private _disposeVideo(video: HTMLVideoElement): void {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  private _cancelCandidate(message: string): void {
    const candidate = this._candidate;
    const reject = this._candidateReject;
    this._candidate = null;
    this._candidateReject = null;
    if (candidate) this._disposeVideo(candidate);
    reject?.(new VideoLoadError('metadata-error', message));
  }

  private _mediaError(video: HTMLVideoElement, src: string): VideoLoadError {
    const code = video.error?.code;
    if (code === 2)
      return new VideoLoadError('network-error', `Network error loading video: ${src}`);
    return new VideoLoadError('media-error', `Unsupported or unreadable video: ${src}`);
  }

  async setVideo(src: string): Promise<void> {
    if (this._destroyed)
      throw new VideoLoadError('metadata-error', 'Stage background is destroyed');
    if (this._videoSrc === src && this._video) return;
    this._cancelCandidate('Video candidate was superseded');

    const candidate = this._videoFactory();
    const previousRate = this._video?.playbackRate ?? 1;
    this._configureVideo(candidate, src);
    this._candidate = candidate;
    this._host?.appendChild(candidate);

    await new Promise<void>((resolve, reject) => {
      this._candidateReject = reject;
      const cleanup = () => {
        candidate.removeEventListener('loadedmetadata', onReady);
        candidate.removeEventListener('error', onError);
      };
      const fail = (error: VideoLoadError) => {
        cleanup();
        if (this._candidate === candidate) {
          this._candidate = null;
          this._candidateReject = null;
        }
        this._disposeVideo(candidate);
        reject(error);
      };
      const onReady = () => {
        if (this._candidate !== candidate) return;
        if (!Number.isFinite(candidate.duration) || candidate.duration <= 0) {
          fail(new VideoLoadError('metadata-error', `Invalid video metadata: ${src}`));
          return;
        }
        cleanup();
        this._candidate = null;
        this._candidateReject = null;
        candidate.playbackRate = previousRate;
        const previous = this._video;
        this._removeEndedListener();
        this._video = candidate;
        this._videoSrc = src;
        candidate.style.display = this._mode === 'video' ? 'block' : 'none';
        if (previous) this._disposeVideo(previous);
        resolve();
      };
      const onError = () => fail(this._mediaError(candidate, src));
      candidate.addEventListener('loadedmetadata', onReady);
      candidate.addEventListener('error', onError);
    });
  }

  stopVideo(): void {
    this._cancelCandidate('Video loading was cancelled');
    if (!this._video) return;
    this._removeEndedListener();
    this._disposeVideo(this._video);
    this._video = null;
    this._videoSrc = null;
  }

  async play(): Promise<void> {
    try {
      await this._video?.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Video playback was rejected';
      throw new VideoLoadError('playback-rejected', message);
    }
  }

  pause(): void {
    this._video?.pause();
  }

  get paused(): boolean {
    return this._video?.paused ?? true;
  }

  get currentTime(): number {
    return this._video?.currentTime ?? 0;
  }

  get duration(): number {
    return this._video?.duration ?? 0;
  }

  seek(time: number): void {
    if (!this._video) return;
    const duration = this._video.duration || Infinity;
    this._video.currentTime = Math.max(0, Math.min(time, duration));
  }

  get playbackRate(): number {
    return this._video?.playbackRate ?? 1;
  }

  set playbackRate(rate: number) {
    if (this._video) this._video.playbackRate = rate;
  }

  get isVideoReady(): boolean {
    return this._video !== null && this._video.readyState >= 1;
  }

  onEnded(callback: () => void): void {
    this._removeEndedListener();
    this._endedCallback = callback;
    this._video?.addEventListener('ended', callback);
  }

  private _removeEndedListener(): void {
    if (this._endedCallback && this._video) {
      this._video.removeEventListener('ended', this._endedCallback);
    }
    this._endedCallback = null;
  }

  render(_renderer: IRenderer): void {}

  override destroy(): void {
    this._destroyed = true;
    this.stopVideo();
    super.destroy();
  }
}
