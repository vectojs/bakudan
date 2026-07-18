import { createDefaultParams, type DanmakuParams, type PoolSlot } from './types';

export class DanmakuPool {
  readonly capacity: number;
  readonly slots: PoolSlot[];
  private _idCounter = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.slots = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.slots[i] = this._createEmptySlot(i);
    }
  }

  get activeCount(): number {
    let c = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i].active) c++;
    }
    return c;
  }

  activateBatch(params: DanmakuParams[]): number {
    let activated = 0;
    for (const p of params) {
      const slot = this._findFree();
      if (!slot) break;
      this._resetSlot(slot);
      slot.active = true;
      slot.params = p;
      slot.age = 0;
      activated++;
    }
    return activated;
  }

  deactivate(slotId: number): void {
    if (slotId < 0 || slotId >= this.capacity) return;
    this.slots[slotId].active = false;
  }

  deactivateBatch(ids: number[]): void {
    for (const id of ids) this.deactivate(id);
  }

  getActiveIds(): number[] {
    const ids: number[] = [];
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i].active) ids.push(i);
    }
    return ids;
  }

  reset(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i].active = false;
    }
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
    s.charColors = [];
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
      charColors: [],
    };
  }
}
