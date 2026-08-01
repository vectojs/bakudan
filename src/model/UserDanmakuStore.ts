import type { CharacterEffects, TimedDanmakuEntry } from '@vectojs/danmaku-core';

const STORAGE_PREFIX = 'bakudan:v1:user-danmaku:';

export interface StoredUserDanmaku extends TimedDanmakuEntry {
  effects?: CharacterEffects;
}

export function storageKeyForVideo(videoId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(videoId)}`;
}

export function normalizeVideoUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.searchParams.sort();
  return url.href;
}

/**
 * Derive a stable local namespace with FNV-1a. This is not authentication,
 * collision resistance, or any other security boundary.
 */
export function videoIdForCustomUrl(value: string): string {
  const normalized = normalizeVideoUrl(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `custom-${hash.toString(16).padStart(8, '0')}`;
}

function isStoredEntry(value: unknown): value is StoredUserDanmaku {
  if (!value || typeof value !== 'object') return false;
  const entry = value as { time?: unknown; text?: unknown };
  return (
    typeof entry.time === 'number' &&
    Number.isFinite(entry.time) &&
    entry.time >= 0 &&
    typeof entry.text === 'string' &&
    entry.text.trim().length > 0
  );
}

export function loadUserDanmakus(videoId: string): StoredUserDanmaku[] {
  if (typeof localStorage === 'undefined') return [];
  const key = storageKeyForVideo(videoId);
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(key);
      return [];
    }
    return parsed.filter(isStoredEntry).sort((left, right) => left.time - right.time);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage access is unavailable; the in-memory fallback is empty.
    }
    return [];
  }
}

export function saveUserDanmaku(videoId: string, entry: StoredUserDanmaku): void {
  if (typeof localStorage === 'undefined' || !isStoredEntry(entry)) return;
  try {
    const entries = loadUserDanmakus(videoId);
    entries.push(entry);
    entries.sort((left, right) => left.time - right.time);
    localStorage.setItem(storageKeyForVideo(videoId), JSON.stringify(entries));
  } catch {
    // Quota and privacy-mode failures leave the current video store unchanged.
  }
}

export function clearUserDanmakus(videoId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKeyForVideo(videoId));
  } catch {
    // Storage access is unavailable; there is nothing else to clear.
  }
}
