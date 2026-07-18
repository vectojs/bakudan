import type { PresetId, PresetState, DanmakuParams } from './types';
import { DanmakuPool } from './DanmakuPool';
import { PRESETS } from './presets';
import { ContentLibrary } from './ContentLibrary';

const LINE_HEIGHT = 36;
const LANE_GAP = 4;
const DEFAULT_SPAWN_RATE = 300;

interface LaneState {
  occupied: boolean;
  lastX: number;
}

export class Scheduler {
  readonly pool: DanmakuPool;
  private stageWidth: number;
  private stageHeight: number;
  private targetCount: number;
  private spawnRate: number;
  private lanes: LaneState[] = [];
  private spawnAccumulator = 0;

  constructor(pool: DanmakuPool, stageWidth: number, stageHeight: number, targetCount: number) {
    this.pool = pool;
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    this.targetCount = targetCount;
    this.spawnRate = DEFAULT_SPAWN_RATE;
    this._computeLanes();
  }

  resize(width: number, height: number): void {
    this.stageWidth = width;
    this.stageHeight = height;
    this._computeLanes();
  }

  setTargetCount(n: number): void {
    this.targetCount = Math.max(0, n);
  }

  setSpawnRate(r: number): void {
    this.spawnRate = Math.max(1, r);
  }

  get target(): number {
    return this.targetCount;
  }

  get rate(): number {
    return this.spawnRate;
  }

  tick(
    dt: number,
    presetId: PresetId,
    cursorState: {
      cursorX: number;
      cursorY: number;
      pointerActive: boolean;
    },
  ): number {
    const preset = PRESETS[presetId];
    const state: PresetState = {
      time: performance.now(),
      cursorX: cursorState.cursorX,
      cursorY: cursorState.cursorY,
      pointerActive: cursorState.pointerActive,
    };
    const W = this.stageWidth;
    const H = this.stageHeight;
    const ids = this.pool.getActiveIds();

    for (const id of ids) {
      const slot = this.pool.slots[id];
      preset(slot, dt, state, W, H);

      if (slot.x + slot.width < -200 || slot.x > W + 200) {
        this.pool.deactivate(id);
        this._releaseLane(slot.lane);
        continue;
      }
      if (slot.params.preset === 'scroll' || slot.params.preset === 'reverse') {
        this.lanes[slot.lane].lastX = slot.x + slot.width;
      }
    }

    const deficit = this.targetCount - this.pool.activeCount;
    if (deficit <= 0) return 0;

    this.spawnAccumulator += (this.spawnRate * dt) / 1000;
    let spawned = 0;
    while (this.spawnAccumulator >= 1 && spawned < deficit) {
      this.spawnAccumulator -= 1;
      const lane = this._assignLane(presetId);
      const didSpawn = this._spawnOne(presetId, lane);
      if (!didSpawn) break;
      spawned++;
    }

    return spawned;
  }

  userSpawn(params: DanmakuParams): boolean {
    const lane = this._assignLane(params.preset);
    if (lane < 0) return false;
    const activated = this.pool.activateBatch([params]);
    if (activated === 0) return false;
    const newIds = this.pool.getActiveIds();
    const slot = this.pool.slots[newIds[newIds.length - 1]];
    slot.lane = lane;
    this.lanes[lane].occupied = true;
    switch (params.preset) {
      case 'scroll':
        slot.x = this.stageWidth + 20;
        break;
      case 'reverse':
        slot.x = -slot.width - 20;
        break;
      default:
        slot.x = this.stageWidth + 20;
    }
    return true;
  }

  private _spawnOne(presetId: PresetId, lane: number): boolean {
    const text = ContentLibrary.sample();
    const params: DanmakuParams = {
      text,
      color: `hsl(${Math.random() * 360}, 60%, 80%)`,
      fontSize: 16 + Math.random() * 20,
      speed: 150 + Math.random() * 150,
      opacity: 0.8 + Math.random() * 0.2,
      preset: presetId,
      presetParams: {},
      effects: {
        glow: false,
        gradient: false,
        rainbow: false,
        outline: false,
      },
    };
    const activated = this.pool.activateBatch([params]);
    if (activated === 0) return false;
    const newIds = this.pool.getActiveIds();
    const slot = this.pool.slots[newIds[newIds.length - 1]];
    slot.lane = lane;
    slot.x = this.stageWidth + 20;
    this.lanes[lane].occupied = true;
    return true;
  }

  private _computeLanes(): void {
    const laneCount = Math.floor(this.stageHeight / (LINE_HEIGHT + LANE_GAP));
    this.lanes = Array.from({ length: laneCount });
    for (let i = 0; i < laneCount; i++) {
      this.lanes[i] = { occupied: false, lastX: 0 };
    }
  }

  private _assignLane(presetId: PresetId): number {
    if (
      presetId === 'top' ||
      presetId === 'bottom' ||
      presetId === 'rotation' ||
      presetId === 'repulsion'
    ) {
      return Math.floor(Math.random() * this.lanes.length);
    }
    const minGap = 200;
    for (let i = 0; i < this.lanes.length; i++) {
      if (!this.lanes[i].occupied) return i;
      if (this.lanes[i].lastX < this.stageWidth - minGap) return i;
    }
    return Math.floor(Math.random() * this.lanes.length);
  }

  private _releaseLane(lane: number): void {
    if (lane >= 0 && lane < this.lanes.length) {
      this.lanes[lane].occupied = false;
    }
  }
}
