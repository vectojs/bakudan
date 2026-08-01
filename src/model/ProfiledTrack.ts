import type { CharacterEffects, PresetId, TimedDanmakuEntry } from '@vectojs/danmaku-core';

export interface TrackProfile {
  id: string;
  label: string;
  averagePerSecond: number;
  peakPerSecond: number;
  clusterRatio: number;
  maxEntries: number;
  presetWeights: Partial<Record<PresetId, number>>;
  effectWeights?: Partial<Record<keyof CharacterEffects, number>>;
}

export interface ProfiledTimedDanmakuEntry extends TimedDanmakuEntry {
  effects: CharacterEffects;
}

export interface ResolvedTrackDistribution {
  entries: number;
  presetCounts: Partial<Record<PresetId, number>>;
  effectCounts: Partial<Record<keyof CharacterEffects, number>>;
}

export interface ProfiledTrackResult {
  entries: ProfiledTimedDanmakuEntry[];
  resolved: ResolvedTrackDistribution;
}

export interface ProfiledTrackOptions {
  sampleText: () => string;
  random?: () => number;
}

interface WeightedRow<T extends string> {
  value: T;
  upperBound: number;
}

interface WeightedTable<T extends string> {
  rows: WeightedRow<T>[];
  total: number;
}

const EFFECT_KEYS: readonly (keyof CharacterEffects)[] = ['glow', 'gradient', 'rainbow', 'outline'];

function compileWeights<T extends string>(weights: Partial<Record<T, number>>): WeightedTable<T> {
  const rows: WeightedRow<T>[] = [];
  let total = 0;
  for (const [value, rawWeight] of Object.entries(weights) as Array<[T, number | undefined]>) {
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    total += weight;
    rows.push({ value, upperBound: total });
  }
  if (rows.length === 0 || total <= 0) throw new Error('weighted distribution is empty');
  return { rows, total };
}

function unitRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value <= 0) return Number.EPSILON;
  return Math.min(value, 1 - Number.EPSILON);
}

function weightedPick<T extends string>(table: WeightedTable<T>, random: () => number): T {
  const cursor = unitRandom(random) * table.total;
  for (const row of table.rows) {
    if (cursor <= row.upperBound) return row.value;
  }
  return table.rows[table.rows.length - 1]!.value;
}

function sampleEffects(
  weights: TrackProfile['effectWeights'],
  random: () => number,
): CharacterEffects {
  return {
    glow: unitRandom(random) < (weights?.glow ?? 0),
    gradient: unitRandom(random) < (weights?.gradient ?? 0),
    rainbow: unitRandom(random) < (weights?.rainbow ?? 0),
    outline: unitRandom(random) < (weights?.outline ?? 0),
  };
}

function clampTime(time: number, duration: number): number {
  return Math.max(0.1, Math.min(time, duration - 0.1));
}

function boundedGaussian(random: () => number, radius: number): number {
  const magnitude = Math.sqrt(-2 * Math.log(unitRandom(random)));
  const sample = magnitude * Math.cos(2 * Math.PI * unitRandom(random)) * radius;
  return Math.max(-radius * 3, Math.min(sample, radius * 3));
}

function increment<T extends string>(counts: Partial<Record<T, number>>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function resolveTrackDistribution(
  entries: readonly ProfiledTimedDanmakuEntry[],
): ResolvedTrackDistribution {
  const presetCounts: Partial<Record<PresetId, number>> = {};
  const effectCounts: Partial<Record<keyof CharacterEffects, number>> = {};
  for (const entry of entries) {
    increment(presetCounts, entry.preset ?? 'scroll');
    for (const key of EFFECT_KEYS) {
      if (entry.effects[key]) increment(effectCounts, key);
    }
  }
  return { entries: entries.length, presetCounts, effectCounts };
}

export function buildProfiledTrack(
  duration: number,
  profile: TrackProfile,
  options: ProfiledTrackOptions,
): ProfiledTrackResult {
  if (!Number.isFinite(duration) || duration <= 0.2) {
    return { entries: [], resolved: { entries: 0, presetCounts: {}, effectCounts: {} } };
  }

  const maxEntries = Math.max(0, Math.floor(profile.maxEntries));
  const requestedEntries = Math.max(0, Math.round(duration * profile.averagePerSecond));
  const entryCount = Math.min(requestedEntries, maxEntries);
  if (entryCount === 0) {
    return { entries: [], resolved: { entries: 0, presetCounts: {}, effectCounts: {} } };
  }

  const random = options.random ?? Math.random;
  const presetTable = compileWeights(profile.presetWeights);
  const clusterRatio = Math.max(0, Math.min(profile.clusterRatio, 1));
  const clusteredEntries = Math.min(entryCount, Math.round(entryCount * clusterRatio));
  const baselineEntries = entryCount - clusteredEntries;
  const peakCapacity = Math.max(1, Math.round(profile.peakPerSecond));
  const peakCount =
    clusteredEntries === 0 ? 0 : Math.max(1, Math.ceil(clusteredEntries / peakCapacity));
  const peakRadius = Math.min(0.75, duration / Math.max(8, peakCount * 8));
  const entries = new Array<ProfiledTimedDanmakuEntry>(entryCount);
  let writeIndex = 0;

  const createEntry = (time: number): ProfiledTimedDanmakuEntry => ({
    time: clampTime(time, duration),
    text: options.sampleText(),
    preset: weightedPick(presetTable, random),
    effects: sampleEffects(profile.effectWeights, random),
  });

  for (let index = 0; index < baselineEntries; index++) {
    const interval = duration / baselineEntries;
    const center = (index + 0.5) * interval;
    const jitter = (unitRandom(random) - 0.5) * interval * 0.5;
    entries[writeIndex++] = createEntry(center + jitter);
  }

  for (let index = 0; index < clusteredEntries; index++) {
    const peakIndex = index % peakCount;
    const center = ((peakIndex + 1) * duration) / (peakCount + 1);
    entries[writeIndex++] = createEntry(center + boundedGaussian(random, peakRadius));
  }

  entries.sort((left, right) => left.time - right.time);
  return { entries, resolved: resolveTrackDistribution(entries) };
}
