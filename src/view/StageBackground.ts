import { Entity, type IRenderer } from '@vectojs/core';
import { VideoSourceError } from '@vectojs/danmaku-kit/model';

type BgMode = 'none' | 'ambient' | 'video';

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
  private _candidateReject: ((error: VideoSourceError) => void) | null = null;
  private _endedCallback: (() => void) | null = null;
  private _buffering = false;
  private _bufferingCallback: ((buffering: boolean) => void) | null = null;
  private _bufferingListeners: Array<[string, () => void]> = [];
  private readonly _host: HTMLElement | null;
  private readonly _videoFactory: () => HTMLVideoElement;
  private _stageDestroyed = false;

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
    reject?.(new VideoSourceError('metadata-error', message));
  }

  private _mediaError(video: HTMLVideoElement, src: string): VideoSourceError {
    const code = video.error?.code;
    if (code === 2)
      return new VideoSourceError('network-error', `Network error loading video: ${src}`);
    return new VideoSourceError('media-error', `Unsupported or unreadable video: ${src}`);
  }

  async setVideo(src: string): Promise<void> {
    if (this._stageDestroyed)
      throw new VideoSourceError('metadata-error', 'Stage background is destroyed');
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
      const fail = (error: VideoSourceError) => {
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
          fail(new VideoSourceError('metadata-error', `Invalid video metadata: ${src}`));
          return;
        }
        cleanup();
        this._candidate = null;
        this._candidateReject = null;
        candidate.playbackRate = previousRate;
        const previous = this._video;
        this._removeEndedListener();
        this._removeBufferingListeners();
        this._video = candidate;
        this._videoSrc = src;
        this._setBuffering(false);
        this._attachBufferingListeners();
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
    this._removeBufferingListeners();
    this._disposeVideo(this._video);
    this._video = null;
    this._videoSrc = null;
    this._setBuffering(false);
  }

  async play(): Promise<void> {
    try {
      await this._video?.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Video playback was rejected';
      throw new VideoSourceError('playback-rejected', message);
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

  /**
   * Downloaded spans of the current source, in seconds.
   *
   * A plain array copy rather than the live `TimeRanges`: that object is only
   * readable through indexed `start(i)`/`end(i)` calls, is invalidated as the
   * browser buffers, and throws `INDEX_SIZE_ERR` on a stale index. Reading it
   * once per poll keeps the scrubber off a moving object.
   */
  get bufferedRanges(): { start: number; end: number }[] {
    const video = this._video;
    if (!video) return [];
    const ranges: { start: number; end: number }[] = [];
    for (let i = 0; i < video.buffered.length; i++) {
      try {
        ranges.push({
          start: video.buffered.start(i),
          end: video.buffered.end(i),
        });
      } catch {
        // The range list shrank between reading length and reading this index.
        break;
      }
    }
    return ranges;
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

  /**
   * True while the active video has stalled mid-stream waiting for data.
   *
   * Distinct from the initial load: `loadedmetadata` resolves after a few KB of
   * a progressive stream, so a long video can begin playing and then run out of
   * buffered data repeatedly. Callers surface this through the same status
   * channel as the initial load.
   */
  get isBuffering(): boolean {
    return this._buffering;
  }

  /**
   * Register a persistent buffering observer.
   *
   * Retained across video swaps, unlike {@link onEnded} which the caller
   * re-registers per load. The DOM listeners are rebound whenever the active
   * element changes, so a mid-stream stall is reported for every source without
   * the caller tracking element identity.
   */
  onBufferingChange(callback: (buffering: boolean) => void): void {
    this._bufferingCallback = callback;
    this._attachBufferingListeners();
  }

  private _setBuffering(buffering: boolean): void {
    if (this._buffering === buffering) return;
    this._buffering = buffering;
    this._bufferingCallback?.(buffering);
  }

  private _attachBufferingListeners(): void {
    this._removeBufferingListeners();
    const video = this._video;
    if (!video || !this._bufferingCallback) return;
    // `waiting`/`stalled` open a stall; `playing`/`canplay`/`seeked` close it.
    // `seeked` is load-bearing: a seek into an unbuffered region fires
    // `waiting`, and while paused it never fires `playing` to clear it.
    const listeners: Array<[string, () => void]> = [
      ['waiting', () => this._setBuffering(true)],
      ['stalled', () => this._setBuffering(true)],
      ['playing', () => this._setBuffering(false)],
      ['canplay', () => this._setBuffering(false)],
      ['seeked', () => this._setBuffering(false)],
    ];
    for (const [event, handler] of listeners) video.addEventListener(event, handler);
    this._bufferingListeners = listeners;
  }

  private _removeBufferingListeners(): void {
    if (this._video) {
      for (const [event, handler] of this._bufferingListeners) {
        this._video.removeEventListener(event, handler);
      }
    }
    this._bufferingListeners = [];
  }

  render(_renderer: IRenderer): void {}

  override destroy(): void {
    this._stageDestroyed = true;
    this.stopVideo();
    super.destroy();
  }
}
