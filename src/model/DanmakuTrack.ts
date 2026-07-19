import type { TimedDanmakuEntry } from './types';

/**
 * Drives pre-authored, timestamp-pinned danmaku in lockstep with video
 * playback. Call `seek(t)` whenever the video's current time changes
 * discontinuously (user drags the scrubber, or on load), and `sync(t)` every
 * frame during normal playback to get the entries that should fire between
 * the previous and current time.
 *
 * Entries are sorted by `time` ascending once at construction so `sync()`
 * can advance a single cursor forward without re-scanning already-fired
 * entries — needed because a video can be running at up to several hundred
 * spawns/sec of *scheduler* danmaku while this track independently ticks
 * once per rendered frame.
 */
export class DanmakuTrack {
  private readonly entries: TimedDanmakuEntry[];
  /** Index of the next not-yet-fired entry under forward playback. */
  private _cursor = 0;
  private _lastTime = 0;

  constructor(entries: TimedDanmakuEntry[]) {
    this.entries = [...entries].sort((a, b) => a.time - b.time);
  }

  get length(): number {
    return this.entries.length;
  }

  /**
   * Reposition the cursor to match a discontinuous time change (scrubbing,
   * seeking, initial load) WITHOUT firing any entries. Unlike `sync()`,
   * this never returns danmaku to spawn — jumping forward 10 minutes should
   * not dump every skipped comment onto the screen at once, and jumping
   * backward should not refire comments already shown moments ago. Only
   * entries whose `time` is strictly greater than `t` will fire on the
   * next forward `sync()` call.
   */
  seek(t: number): void {
    this._lastTime = t;
    // Binary search for the first entry with time > t.
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.entries[mid].time <= t) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this._cursor = lo;
  }

  /**
   * Advance playback to `t` and return every entry whose `time` falls in
   * `(previousTime, t]`. Call once per frame with the video's current
   * `currentTime` during normal (non-seeking) playback — works correctly
   * under any playback rate, since it only compares timestamps, never
   * wall-clock frame deltas.
   *
   * If `t` is behind the last synced time (the video looped, or a seek
   * wasn't announced via `seek()`), this re-seeks defensively instead of
   * returning entries out of order.
   */
  sync(t: number): TimedDanmakuEntry[] {
    if (t < this._lastTime) {
      this.seek(t);
      return [];
    }
    this._lastTime = t;
    const fired: TimedDanmakuEntry[] = [];
    while (this._cursor < this.entries.length && this.entries[this._cursor].time <= t) {
      fired.push(this.entries[this._cursor]);
      this._cursor++;
    }
    return fired;
  }

  /** Reset to the beginning, as if the track had never played. */
  reset(): void {
    this._cursor = 0;
    this._lastTime = 0;
  }
}
