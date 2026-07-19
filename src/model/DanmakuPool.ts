import { createDefaultParams, type DanmakuParams, type PoolSlot } from './types';

export class DanmakuPool {
  readonly capacity: number;
  readonly slots: PoolSlot[];
  private _activeCount = 0;
  private _activeIdsCache: number[] | null = null;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.slots = Array.from({ length: capacity }) as PoolSlot[];
    for (let i = 0; i < capacity; i++) {
      this.slots[i] = this._createEmptySlot(i);
    }
  }

  get activeCount(): number {
    return this._activeCount;
  }

  /**
   * Activate up to `params.length` free slots and return the exact slots
   * that were activated, in the same order as `params`.
   *
   * Callers must use this return value (not `getActiveIds()`) to find the
   * newly-activated slot: `getActiveIds()` returns slots in ascending index
   * order, which does not correspond to activation order once slots have
   * been freed and recycled out of order (a low free index can be filled
   * while high indices are still occupied by older, unrelated danmaku).
   */
  activateBatch(params: DanmakuParams[]): PoolSlot[] {
    const activated: PoolSlot[] = [];
    for (const p of params) {
      const slot = this._findFree();
      if (!slot) break;
      this._resetSlot(slot);
      slot.active = true;
      slot.params = p;
      slot.age = 0;
      activated.push(slot);
      this._activeCount++;
      this._activeIdsCache = null;
    }
    return activated;
  }

  deactivate(slotId: number): void {
    if (slotId < 0 || slotId >= this.capacity) return;
    if (!this.slots[slotId].active) return;
    this.slots[slotId].active = false;
    this._activeCount--;
    this._activeIdsCache = null;
  }

  deactivateBatch(ids: number[]): void {
    for (const id of ids) this.deactivate(id);
  }

  getActiveIds(): number[] {
    if (this._activeIdsCache) return this._activeIdsCache;
    const ids: number[] = [];
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i].active) ids.push(i);
    }
    this._activeIdsCache = ids;
    return ids;
  }

  reset(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i].active = false;
    }
    this._activeCount = 0;
    this._activeIdsCache = null;
  }

  private _findFree(): PoolSlot | null {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.slots[i].active) return this.slots[i];
    }
    return null;
  }

  private _resetSlot(s: PoolSlot): void {
    s.active = false;
    s.params = createDefaultParams();
    s.x = 0;
    s.y = 0;
    s.width = 0;
    s.rotation = 0;
    s.opacity = 1;
    s.age = 0;
    s.lane = 0;
    for (let i = 0; i < s.charAngles.length; i++) s.charAngles[i] = 0;
  }

  private _createEmptySlot(id: number): PoolSlot {
    return {
      id,
      active: false,
      params: createDefaultParams(),
      x: 0,
      y: 0,
      width: 0,
      rotation: 0,
      opacity: 1,
      age: 0,
      lane: 0,
      charAngles: new Float64Array(64),
    };
  }
}
