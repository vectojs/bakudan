import { describe, expect, it } from 'bun:test';
import {
  buildProfiledTrack,
  ProfiledDanmakuTrack,
  TRACK_PROFILES,
} from '../src/model/TrackProfiles';
import { generateLargeTimedTrack } from '../src/model/demoTimedTrack';
import { saveUserDanmaku } from '../src/model/UserDanmakuStore';

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe('TrackProfiles', () => {
  it('defines all four approved profiles', () => {
    expect([...TRACK_PROFILES.keys()]).toEqual([
      'natural-peaks',
      'peak-event',
      'flood',
      'style-showcase',
    ]);
  });

  it('returns sorted bounded entries plus an exact resolved distribution', () => {
    const result = buildProfiledTrack(20, TRACK_PROFILES.get('style-showcase')!, {
      random: sequence([0.1, 0.4, 0.7, 0.9]),
      sampleText: () => 'test',
    });
    const presetCounts: Record<string, number> = {};
    const effectCounts: Record<string, number> = {};
    for (const entry of result.entries) {
      presetCounts[entry.preset ?? 'scroll'] = (presetCounts[entry.preset ?? 'scroll'] ?? 0) + 1;
      for (const [key, enabled] of Object.entries(entry.effects)) {
        if (enabled) effectCounts[key] = (effectCounts[key] ?? 0) + 1;
      }
    }

    expect(result.entries.length).toBe(result.resolved.entries);
    expect(result.entries.every((entry) => entry.time >= 0.1 && entry.time <= 19.9)).toBe(true);
    expect(
      result.entries.every(
        (entry, index, all) => index === 0 || all[index - 1]!.time <= entry.time,
      ),
    ).toBe(true);
    expect(result.resolved.presetCounts).toEqual(presetCounts);
    expect(result.resolved.effectCounts).toEqual(effectCounts);
  });

  it('is deterministic when random and text sampling are injected', () => {
    const profile = TRACK_PROFILES.get('natural-peaks')!;
    const make = () =>
      buildProfiledTrack(15, profile, {
        random: sequence([0.2, 0.8, 0.3, 0.6]),
        sampleText: () => 'same',
      });
    expect(make()).toEqual(make());
  });

  it('clamps the resolved count to maxEntries', () => {
    const profile = { ...TRACK_PROFILES.get('flood')!, maxEntries: 7 };
    const result = buildProfiledTrack(30, profile, {
      random: () => 0.5,
      sampleText: () => 'bounded',
    });
    expect(result.entries).toHaveLength(7);
    expect(result.resolved.entries).toBe(7);
  });
  it('merges only the selected video comments and keeps the resolved counts exact', () => {
    localStorage.clear();
    saveUserDanmaku('video-a', { time: 2, text: 'kept', preset: 'top' });
    saveUserDanmaku('video-b', { time: 3, text: 'isolated', preset: 'bottom' });
    const result = generateLargeTimedTrack(
      5,
      { ...TRACK_PROFILES.get('natural-peaks')!, averagePerSecond: 0 },
      'video-a',
    );
    expect(result.entries.map((entry) => entry.text)).toEqual(['kept']);
    expect(result.resolved).toEqual({
      entries: 1,
      presetCounts: { top: 1 },
      effectCounts: {},
    });
  });
  it('preserves resolved effects through the typed track cursor', () => {
    const effects = { glow: true, gradient: false, rainbow: false, outline: true };
    const track = new ProfiledDanmakuTrack([
      { time: 0.5, text: 'styled', preset: 'scroll', effects },
    ]);

    expect(track.sync(0.5)).toEqual([{ time: 0.5, text: 'styled', preset: 'scroll', effects }]);
  });
});
