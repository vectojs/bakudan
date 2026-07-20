import { Stack, Button, Slider, Dropdown, Text } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';

export interface PlayerControlsCallbacks {
  onPlayPause: () => void;
  onSeek: (t: number) => void;
  onRateChange: (rate: number) => void;
}

const RATE_LABELS = ['0.5x', '1x', '1.5x', '2x'];
const RATE_MAP: Record<string, number> = {
  '0.5x': 0.5,
  '1x': 1,
  '1.5x': 1.5,
  '2x': 2,
};

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export class PlayerControls extends Stack {
  private _playBtn: Button;
  private _progress: Slider;
  private _timeLabel: Text;
  private _duration = 0;
  private _seeking = false;

  // Timeline danmaku density wave
  private _densityBuckets: number[] = [];

  constructor(callbacks: PlayerControlsCallbacks) {
    super({ direction: 'horizontal', gap: 10 });
    this.width = 640;
    this.height = 44;
    this.padding = 8;

    this._playBtn = new Button('▶', {
      bg: 'rgba(255, 126, 95, 0.1)',
      hoverBg: 'rgba(255, 126, 95, 0.25)',
      color: '#ff7e5f',
    });
    this._playBtn.width = 36;
    this._playBtn.height = 28;
    this._playBtn.on('click', callbacks.onPlayPause);
    this.add(this._playBtn);

    this._progress = new Slider({
      min: 0,
      max: 1,
      value: 0,
      step: 0.01,
      trackColor: 'rgba(69, 60, 56, 0.15)',
      progressColor: '#ff7e5f',
      handleColor: '#ffffff',
    });
    this._progress.width = 340;
    this._progress.height = 20;

    this._progress.on('pointerdown', () => {
      this._seeking = true;
    });
    this._progress.on('pointerup', () => {
      this._seeking = false;
    });
    this._progress.on('change', (e: any) => callbacks.onSeek(e.value));
    this.add(this._progress);

    this._timeLabel = new Text('0:00 / 0:00', { font: '12px monospace', color: '#453c38' });
    this.add(this._timeLabel);

    const rateDropdown = new Dropdown(RATE_LABELS, {
      value: '1x',
      bg: 'rgba(255, 255, 255, 0.95)',
      color: '#453c38',
      radius: 6,
    });
    rateDropdown.width = 64;
    (rateDropdown as any).button.hoverBg = 'rgba(255, 126, 95, 0.1)';
    rateDropdown.on('change', (e: any) => callbacks.onRateChange(RATE_MAP[e.value]));
    this.add(rateDropdown);
  }

  /** Compute danmaku density histogram buckets for visual wave */
  setDanmakuDensity(times: number[]): void {
    const bucketsCount = 80;
    this._densityBuckets = Array.from({ length: bucketsCount }, () => 0);
    if (times.length === 0 || this._duration === 0) return;
    for (const t of times) {
      const idx = Math.min(bucketsCount - 1, Math.floor((t / this._duration) * bucketsCount));
      if (idx >= 0) this._densityBuckets[idx]++;
    }
    const maxVal = Math.max(...this._densityBuckets, 1);
    this._densityBuckets = this._densityBuckets.map((v) => v / maxVal);
  }

  setPlaybackState(currentTime: number, duration: number, paused: boolean): void {
    this._duration = duration;
    this._playBtn.label = paused ? '▶' : '⏸';
    if (!this._seeking) {
      this._progress.max = duration || 1;
      this._progress.value = currentTime;
    }
    this._timeLabel.setText(`${formatTime(currentTime)} / ${formatTime(duration)}`);
  }

  get duration(): number {
    return this._duration;
  }

  override render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 10);
    renderer.fill('rgba(255, 255, 255, 0.85)');
    renderer.stroke('rgba(255, 126, 95, 0.2)', 1.5);
    renderer.restore();

    // Draw the high-heat danmaku density wave behind the slider
    if (this._densityBuckets.length > 0) {
      renderer.save();
      renderer.setGlobalAlpha(0.35);
      const sliderX = 54;
      const sliderY = 12;
      const sliderW = 340;
      const sliderH = 20;

      renderer.beginPath();
      renderer.moveTo(sliderX, sliderY + sliderH);
      for (let i = 0; i < this._densityBuckets.length; i++) {
        const x = sliderX + (i / (this._densityBuckets.length - 1)) * sliderW;
        const y = sliderY + sliderH - this._densityBuckets[i] * sliderH * 0.95;
        renderer.lineTo(x, y);
      }
      renderer.lineTo(sliderX + sliderW, sliderY + sliderH);
      renderer.closePath();
      renderer.fill('#ff7e5f');
      renderer.restore();
    }

    super.render(renderer);
  }
}
