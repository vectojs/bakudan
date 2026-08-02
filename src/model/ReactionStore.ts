export interface LocalReaction {
  liked: boolean;
  count: number;
}

const STORAGE_PREFIX = 'bakudan:v1:reactions:';

export class ReactionStore {
  private readonly memoryFallback = new Map<string, LocalReaction>();
  private readonly storageKey: string;

  constructor(videoId: string) {
    this.storageKey = `${STORAGE_PREFIX}${encodeURIComponent(videoId)}`;
  }
  get(commentId: string): LocalReaction {
    const data = this._readData();
    const entry = data[commentId];
    if (entry) return { liked: entry.liked, count: entry.count };
    return this.memoryFallback.get(commentId) ?? { liked: false, count: 0 };
  }

  toggle(commentId: string): LocalReaction {
    const current = this.get(commentId);
    const next: LocalReaction = {
      liked: !current.liked,
      count: Math.max(0, current.count + (current.liked ? -1 : 1)),
    };
    this.memoryFallback.set(commentId, next);

    const data = this._readData();
    data[commentId] = next;
    this._writeData(data);
    return next;
  }

  clear(): void {
    this.memoryFallback.clear();
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore
    }
  }

  private _readData(): Record<string, LocalReaction> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        localStorage.removeItem(this.storageKey);
        return {};
      }
      const valid: Record<string, LocalReaction> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object') {
          const v = value as Partial<LocalReaction>;
          if (typeof v.liked === 'boolean' && typeof v.count === 'number' && v.count >= 0) {
            valid[key] = { liked: v.liked, count: Math.floor(v.count) };
          }
        }
      }
      return valid;
    } catch {
      return {};
    }
  }

  private _writeData(data: Record<string, LocalReaction>): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      // Quota / privacy failures leave memory fallback authoritative for this session
    }
  }
}
