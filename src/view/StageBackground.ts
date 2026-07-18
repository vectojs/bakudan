import { Entity, type IRenderer } from '@vectojs/core';

type BgMode = 'none' | 'ambient' | 'video';

export class StageBackground extends Entity {
  width = 1920;
  height = 1080;
  mode: BgMode = 'ambient';
  private _video: HTMLVideoElement | null = null;
  private _videoSrc: string | null = null;
  private _t = 0;

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
   * renderer.drawImage each frame.
   */
  async setVideo(src: string): Promise<void> {
    this.stopVideo();
    const video = document.createElement('video');
    video.src = src;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.setAttribute('playsinline', '');
    await video.play();
    this._video = video;
    this._videoSrc = src;
  }

  stopVideo(): void {
    if (this._video) {
      this._video.pause();
      this._video.removeAttribute('src');
      this._video.load();
      this._video = null;
      this._videoSrc = null;
    }
  }

  render(renderer: IRenderer): void {
    if (this.mode === 'video' && this._video && this._video.readyState >= 2) {
      renderer.drawImage(this._video, 0, 0, this.width, this.height);
      return;
    }

    if (this.mode === 'ambient') {
      this._t += 0.005;
      // Subtle deep-blue gradient animation
      const grad = renderer.createLinearGradient(0, 0, this.width, this.height, [
        { stop: 0, color: '#0f1420' },
        {
          stop: 0.5,
          color: `hsl(${220 + Math.sin(this._t) * 5}, 20%, ${8 + Math.cos(this._t * 1.3) * 2}%)`,
        },
        { stop: 1, color: '#1a2233' },
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

    // "none" mode — flat dark background
    renderer.beginPath();
    renderer.moveTo(0, 0);
    renderer.lineTo(this.width, 0);
    renderer.lineTo(this.width, this.height);
    renderer.lineTo(0, this.height);
    renderer.closePath();
    renderer.fill('#0f1420');
  }

  override destroy(): void {
    this.stopVideo();
    super.destroy();
  }
}
