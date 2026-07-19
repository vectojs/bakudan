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

/**
 * Video transport bar: play/pause, a seekable progress slider, playback
 * rate selector, and an elapsed/duration readout. Positioned by the caller
 * (App) just above the Dock, only visible in video mode.
 */
export class PlayerControls extends Stack {
  private _playBtn: Button;
  private _progress: Slider;
  private _timeLabel: Text;
  private _duration = 0;
  /** True while the user is actively dragging the progress handle — App
   * should not overwrite `_progress.value` from the video's currentTime
   * during this window, or the drag would visibly fight playback. */
  private _seeking = false;

  constructor(callbacks: PlayerControlsCallbacks) {
    super({ direction: 'horizontal', gap: 10 });
    this.width = 640;
    this.height = 44;
    this.padding = 8;

    this._playBtn = new Button('▶');
    this._playBtn.width = 36;
    this._playBtn.height = 28;
    this._playBtn.on('click', callbacks.onPlayPause);
    this.add(this._playBtn);

    this._progress = new Slider({ min: 0, max: 1, value: 0, step: 0.01 });
    this._progress.width = 340;
    this._progress.height = 20;
    // Slider fires 'change' continuously while dragging (once per
    // pointermove), not just on release — track drag lifetime via its own
    // pointerdown/pointerup so setPlaybackState() doesn't fight the drag by
    // snapping the handle back to the video's currentTime mid-gesture.
    this._progress.on('pointerdown', () => {
      this._seeking = true;
    });
    this._progress.on('pointerup', () => {
      this._seeking = false;
    });
    this._progress.on('change', (e: any) => callbacks.onSeek(e.value));
    this.add(this._progress);

    this._timeLabel = new Text('0:00 / 0:00', { font: '12px monospace', color: '#cbd5e1' });
    this.add(this._timeLabel);

    const rateDropdown = new Dropdown(RATE_LABELS, { value: '1x' });
    rateDropdown.width = 64;
    rateDropdown.on('change', (e: any) => callbacks.onRateChange(RATE_MAP[e.value]));
    this.add(rateDropdown);
  }

  /** Called every frame in video mode to reflect the video element's real state. */
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

  /** `Stack` draws nothing itself — see Dock/ControlCenter for the same note. */
  override render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 10);
    renderer.fill('#1e2536');
    renderer.stroke('rgba(148,163,184,0.4)', 1.5);
    renderer.restore();
    super.render(renderer);
  }
}
