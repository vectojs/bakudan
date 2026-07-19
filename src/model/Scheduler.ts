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

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

/**
 * Measure a danmaku's rendered pixel width using a single shared offscreen
 * canvas context. Called at spawn time (not at view-sync time) so
 * `slot.width` is correct from the instant a slot is activated — culling
 * (`x + width < -200`) and lane-gap checks both depend on it being right
 * immediately, before the next Scheduler.tick() or App view sync runs.
 */
function measureWidth(text: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.6;
  if (!sharedMeasureCtx) {
    const canvas = document.createElement('canvas');
    sharedMeasureCtx = canvas.getContext('2d');
  }
  if (!sharedMeasureCtx) return text.length * fontSize * 0.6;
  sharedMeasureCtx.font = `400 ${fontSize}px system-ui, sans-serif`;
  return sharedMeasureCtx.measureText(text).width + 4;
}

export class Scheduler {
  readonly pool: DanmakuPool;
  private stageWidth: number;
  private stageHeight: number;
  private targetCount: number;
  private spawnRate: number;
  private lanes: LaneState[] = [];
  private spawnAccumulator = 0;
  private _laneRoundRobin = 0;

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
    const [slot] = this.pool.activateBatch([params]);
    if (!slot) return false;
    slot.lane = lane;
    slot.width = measureWidth(params.text, params.fontSize);
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
    this._occupyLane(lane, slot);
    return true;
  }

  private _spawnOne(presetId: PresetId, lane: number): boolean {
    const text = ContentLibrary.sample();
    const fontSize = 16 + Math.random() * 20;
    const params: DanmakuParams = {
      text,
      color: `hsl(${Math.random() * 360}, 60%, 80%)`,
      fontSize,
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
    const [slot] = this.pool.activateBatch([params]);
    if (!slot) return false;
    slot.lane = lane;
    slot.width = measureWidth(text, fontSize);
    slot.x = this.stageWidth + 20;
    this._occupyLane(lane, slot);
    return true;
  }

  /**
   * Mark a lane occupied and immediately record its `lastX` from the just-
   * spawned slot. Without this, `lastX` would only update on the NEXT
   * tick's update pass, so several spawns within the same tick (spawnRate
   * can produce dozens per frame) would all read the same stale `lastX`
   * (0 by default) and collapse onto lane 0.
   */
  private _occupyLane(
    lane: number,
    slot: { x: number; width: number; params: DanmakuParams },
  ): void {
    this.lanes[lane].occupied = true;
    if (slot.params.preset === 'scroll' || slot.params.preset === 'reverse') {
      this.lanes[lane].lastX = slot.x + slot.width;
    }
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
    if (this.lanes.length === 0) return -1;
    // Scan starting from a rotating offset (not always index 0) so lane
    // occupancy spreads evenly across the full stage height. Scanning from
    // 0 every time means lane 0 wins whenever it's free, and under heavy
    // spawn load (many spawns per tick) low-index lanes get reused far more
    // often than high-index ones — visually the danmaku pile up near the
    // top of the stage instead of filling it.
    const minGap = 200;
    const n = this.lanes.length;
    for (let k = 0; k < n; k++) {
      const i = (this._laneRoundRobin + k) % n;
      if (!this.lanes[i].occupied || this.lanes[i].lastX < this.stageWidth - minGap) {
        this._laneRoundRobin = (i + 1) % n;
        return i;
      }
    }
    this._laneRoundRobin = (this._laneRoundRobin + 1) % n;
    return Math.floor(Math.random() * n);
  }

  private _releaseLane(lane: number): void {
    if (lane >= 0 && lane < this.lanes.length) {
      this.lanes[lane].occupied = false;
    }
  }
}
