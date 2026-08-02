import { DEFAULT_EFFECTS, type CharacterEffects, type PresetId } from '@vectojs/danmaku-core';
import { ContentLibrary } from './ContentLibrary';
import {
  buildProfiledTrack,
  resolveTrackDistribution,
  type ProfiledTimedDanmakuEntry,
  type ProfiledTrackResult,
  type TrackProfile,
} from '@vectojs/danmaku-kit/model';
import { loadUserDanmakus, type StoredUserDanmaku } from './UserDanmakuStore';

export interface TimedTrackGenerationOptions {
  random?: () => number;
  sampleText?: () => string;
}

function resolvedEffects(entry: StoredUserDanmaku): CharacterEffects {
  const effects = entry.effects;
  if (
    effects &&
    typeof effects.glow === 'boolean' &&
    typeof effects.gradient === 'boolean' &&
    typeof effects.rainbow === 'boolean' &&
    typeof effects.outline === 'boolean'
  ) {
    return { ...effects };
  }
  return { ...DEFAULT_EFFECTS };
}

function mergeByTime(
  generated: readonly ProfiledTimedDanmakuEntry[],
  userEntries: readonly ProfiledTimedDanmakuEntry[],
): ProfiledTimedDanmakuEntry[] {
  const merged: ProfiledTimedDanmakuEntry[] = [];
  merged.length = generated.length + userEntries.length;
  let generatedIndex = 0;
  let userIndex = 0;
  let writeIndex = 0;
  while (generatedIndex < generated.length && userIndex < userEntries.length) {
    if (generated[generatedIndex]!.time <= userEntries[userIndex]!.time) {
      merged[writeIndex++] = generated[generatedIndex++]!;
    } else {
      merged[writeIndex++] = userEntries[userIndex++]!;
    }
  }
  while (generatedIndex < generated.length) merged[writeIndex++] = generated[generatedIndex++]!;
  while (userIndex < userEntries.length) merged[writeIndex++] = userEntries[userIndex++]!;
  return merged;
}

export function generateLargeTimedTrack(
  duration: number,
  profile: TrackProfile,
  videoId: string,
  options: TimedTrackGenerationOptions = {},
): ProfiledTrackResult {
  const generated = buildProfiledTrack(duration, profile, {
    random: options.random,
    sampleText: options.sampleText ?? (() => ContentLibrary.sample()),
  });
  const userEntries = loadUserDanmakus(videoId)
    .filter((entry) => entry.time <= duration)
    .map<ProfiledTimedDanmakuEntry>((entry) => ({
      ...entry,
      preset: (entry.preset ?? 'scroll') as PresetId,
      effects: resolvedEffects(entry),
    }));
  const entries = mergeByTime(generated.entries, userEntries);
  return { entries, resolved: resolveTrackDistribution(entries) };
}
