import { describe, expect, it } from 'bun:test';
import { DanmakuTrack } from '../src/model/DanmakuTrack';
import type { TimedDanmakuEntry } from '../src/model/types';

function makeEntries(): TimedDanmakuEntry[] {
  return [
    { time: 1, text: 'one' },
    { time: 3, text: 'three' },
    { time: 5, text: 'five' },
    { time: 7, text: 'seven' },
    { time: 9, text: 'nine' },
  ];
}

describe('DanmakuTrack', () => {
  it('fires entries in order as time advances forward', () => {
    const track = new DanmakuTrack(makeEntries());
    expect(track.sync(0)).toEqual([]);
    expect(track.sync(1)).toEqual([{ time: 1, text: 'one' }]);
    expect(track.sync(2)).toEqual([]);
    expect(track.sync(4)).toEqual([{ time: 3, text: 'three' }]);
  });

  it('fires multiple entries at once when time jumps forward within sync (fast playback rate)', () => {
    const track = new DanmakuTrack(makeEntries());
    // High playback rate can advance past several entries between frames —
    // sync() must still fire all of them in order, not just the closest.
    const fired = track.sync(6);
    expect(fired.map((e) => e.text)).toEqual(['one', 'three', 'five']);
  });

  it('accepts entries out of input order and sorts them at construction', () => {
    const track = new DanmakuTrack([
      { time: 5, text: 'five' },
      { time: 1, text: 'one' },
      { time: 3, text: 'three' },
    ]);
    const fired = track.sync(10);
    expect(fired.map((e) => e.text)).toEqual(['one', 'three', 'five']);
  });

  it('seek() forward does not flood fired entries on the next sync', () => {
    const track = new DanmakuTrack(makeEntries());
    track.seek(6); // jump straight to 6s, skipping entries at 1, 3, 5
    // The skipped entries must never fire again.
    expect(track.sync(6)).toEqual([]);
    // Only entries strictly after the seek point fire from here on.
    expect(track.sync(7)).toEqual([{ time: 7, text: 'seven' }]);
  });

  it('seek() backward does not refire entries already shown', () => {
    const track = new DanmakuTrack(makeEntries());
    track.sync(6); // fires 'one', 'three', 'five'
    track.seek(2); // user drags the scrubber back to 2s
    // 'one' (time=1) is before the seek point and must not refire.
    const fired = track.sync(4);
    expect(fired.map((e) => e.text)).toEqual(['three']);
  });

  it('sync() defensively re-seeks if time goes backward without an explicit seek() call', () => {
    const track = new DanmakuTrack(makeEntries());
    track.sync(8); // fires everything through 'seven'
    // Video looped back to 0 without the caller announcing a seek.
    const fired = track.sync(2);
    expect(fired).toEqual([]);
    // Forward playback from here resumes firing correctly.
    expect(track.sync(3)).toEqual([{ time: 3, text: 'three' }]);
  });

  it('reset() returns the track to its initial unfired state', () => {
    const track = new DanmakuTrack(makeEntries());
    track.sync(9);
    track.reset();
    expect(track.sync(1)).toEqual([{ time: 1, text: 'one' }]);
  });

  it('length reports the total entry count', () => {
    const track = new DanmakuTrack(makeEntries());
    expect(track.length).toBe(5);
  });

  it('handles an empty entry list without throwing', () => {
    const track = new DanmakuTrack([]);
    expect(track.sync(100)).toEqual([]);
    track.seek(50);
    expect(track.sync(100)).toEqual([]);
  });
});
