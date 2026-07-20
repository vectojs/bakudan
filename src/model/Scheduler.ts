import type { PresetId, PresetState, DanmakuParams } from './types';
import { DanmakuPool } from './DanmakuPool';
import { PRESETS } from './presets';
import { ContentLibrary } from './ContentLibrary';

const LINE_HEIGHT = 36;
const LANE_GAP = 4;
const DEFAULT_SPAWN_RATE = 300;
const LANE_SAFETY_MARGIN = 1.3;

interface LaneState {
  occupied: boolean;
  /** Trailing edge position:
   *  scroll/glitch/sine: left edge (slot.x) — what a following danmaku approaches
   *  reverse: right edge (slot.x + slot.width) */
  trailingX: number;
  /** Width of the current occupant in px */
  width: number;
  /** Speed in px/s */
  speed: number;
  isReverse: boolean;
}

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

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

/**
 * Culling margin in px. A danmaku whose slot.x + slot.width < -MARGIN or
 * slot.x > stageWidth + MARGIN is considered off-screen and deactivated.
 * Must match the culling check in tick().
 */
const CULL_MARGIN = 200;
const MIN_SPAWN_GAP = 50;

function isScrollPreset(preset: PresetId): boolean {
  return preset === 'scroll' || preset === 'reverse' || preset === 'glitch' || preset === 'sine';
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
  showcasePhysics = false;

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
    const state: PresetState = {
      time: performance.now(),
      cursorX: cursorState.cursorX,
      cursorY: cursorState.cursorY,
      pointerActive: cursorState.pointerActive,
    };
    const W = this.stageWidth;
    const H = this.stageHeight;
    const poolSlots = this.pool.slots;

    for (const ls of this.lanes) {
      ls.occupied = false;
    }

    for (let i = 0; i < poolSlots.length; i++) {
      const slot = poolSlots[i];
      if (!slot.active) continue;

      const slotPreset = slot.params.preset || presetId;
      const presetFn = PRESETS[slotPreset] || PRESETS.scroll;
      if (!slot.paused) {
        presetFn(slot, dt, state, W, H);
      }

      if (this.showcasePhysics) {
        if (!slot.params.presetParams) slot.params.presetParams = {};
        if (slot.params.presetParams.vy === undefined) {
          slot.params.presetParams.vy = -100 - Math.random() * 200;
          slot.params.presetParams.gravity = 600 + Math.random() * 400;
        }
        const seconds = dt / 1000;
        slot.params.presetParams.vy += slot.params.presetParams.gravity * seconds;
        slot.y += slot.params.presetParams.vy * seconds;
        const ground = H - 80;
        if (slot.y > ground) {
          slot.y = ground;
          slot.params.presetParams.vy = -Math.abs(slot.params.presetParams.vy) * 0.7;
        }
      }

      if (slot.x + slot.width < -CULL_MARGIN || slot.x > W + CULL_MARGIN) {
        this.pool.deactivate(i);
        continue;
      }

      if (isScrollPreset(slot.params.preset)) {
        const ls = this.lanes[slot.lane];
        if (ls) {
          const isRev = slot.params.preset === 'reverse';
          const rightEdge = slot.x + slot.width;
          const leftEdge = slot.x;
          
          if (!ls.occupied) {
            ls.occupied = true;
            ls.isReverse = isRev;
            ls.trailingX = isRev ? leftEdge : rightEdge;
            ls.width = slot.width;
            ls.speed = slot.params.speed;
          } else {
            if (isRev) {
              if (leftEdge < ls.trailingX) {
                ls.trailingX = leftEdge;
                ls.width = slot.width;
                ls.speed = slot.params.speed;
              }
            } else {
              if (rightEdge > ls.trailingX) {
                ls.trailingX = rightEdge;
                ls.width = slot.width;
                ls.speed = slot.params.speed;
              }
            }
          }
        }
      }
    }

    const deficit = this.targetCount - this.pool.activeCount;
    if (deficit <= 0) return 0;

    this.spawnAccumulator += (this.spawnRate * dt) / 1000;
    let spawned = 0;
    while (this.spawnAccumulator >= 1 && spawned < deficit) {
      const lane = this._assignLane(presetId);
      this.spawnAccumulator -= 1;
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
    const slateColors = [
      '#f8fafc',
      '#cbd5e1',
      '#94a3b8',
      '#38bdf8',
      '#60a5fa',
      '#818cf8',
      '#a78bfa',
      '#34d399',
    ];
    const color = slateColors[Math.floor(Math.random() * slateColors.length)];
    const params: DanmakuParams = {
      text,
      color,
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

  private _occupyLane(
    lane: number,
    slot: { x: number; width: number; params: DanmakuParams },
  ): void {
    const ls = this.lanes[lane];
    if (!ls) return;
    ls.occupied = true;
    if (isScrollPreset(slot.params.preset)) {
      ls.trailingX = slot.params.preset === 'reverse' ? slot.x : slot.x + slot.width;
      ls.width = slot.width;
      ls.speed = slot.params.speed;
      ls.isReverse = slot.params.preset === 'reverse';
    }
  }

  private _computeLanes(): void {
    const laneCount = Math.floor(this.stageHeight / (LINE_HEIGHT + LANE_GAP));
    this.lanes = Array.from({ length: laneCount });
    for (let i = 0; i < laneCount; i++) {
      this.lanes[i] = {
        occupied: false,
        trailingX: 0,
        width: 0,
        speed: 0,
        isReverse: false,
      };
    }
  }

  /**
   * Kinematic safety check: can a new danmaku (spawned at the entry edge
   * with speed `newSpeed`) share this lane with the current occupant
   * without ever visually overlapping?
   *
   * Two conditions must hold:
   *   1. **Minimum gap** — the new spawn's rightward boundary (its nearest
   *      edge to the moving occupant) must be at least `MIN_SPAWN_GAP` px
   *      from the occupant's approaching edge at spawn time. This is a hard
   *      floor that prevents immediate on-top-of rendering.
   *   2. **Kinematic** — if `newSpeed > ls.speed` (the new one is faster),
   *      the time it takes for the new to close the gap must exceed the
   *      occupant's remaining time on stage, scaled by `LANE_SAFETY_MARGIN`.
   *      If the new is slower or equal-speed, the gap never closes and the
   *      lane is unconditionally safe (subject to rule 1).
   */
  private _isLaneSafe(lane: number, newSpeed: number, isReverse: boolean): boolean {
    const ls = this.lanes[lane];
    if (!ls.occupied) return true;

    // Already past culling boundary — treat as free
    if (isReverse) {
      if (ls.trailingX - ls.width > this.stageWidth + CULL_MARGIN) return true;
    } else {
      if (ls.trailingX + ls.width < -CULL_MARGIN) return true;
    }

    if (ls.speed <= 0) return false;

    let gap: number;
    let exitTime: number;

    if (isReverse) {
      // Both move right. New right edge at -20. Old left edge at trailingX - width.
      // gap = old left edge - new right edge
      gap = ls.trailingX - ls.width + 20;
      exitTime = (this.stageWidth + CULL_MARGIN - (ls.trailingX - ls.width)) / ls.speed;
    } else {
      // Both move left. New left edge at stageWidth + 20. Old right edge at trailingX + width.
      // gap = new left edge - old right edge
      gap = this.stageWidth + 20 - (ls.trailingX + ls.width);
      exitTime = (ls.trailingX + ls.width + CULL_MARGIN) / ls.speed;
    }

    // Rule 1: minimum spawn gap
    if (gap < MIN_SPAWN_GAP) return false;

    // Rule 2: kinematic — if slower- or equal-speed, they never collide
    if (newSpeed <= ls.speed) return true;

    const catchTime = gap / (newSpeed - ls.speed);
    return catchTime > exitTime * LANE_SAFETY_MARGIN;
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

    const n = this.lanes.length;
    const isReverse = presetId === 'reverse';

    // Pass 1: free lane (round-robin)
    for (let k = 0; k < n; k++) {
      const i = (this._laneRoundRobin + k) % n;
      if (!this.lanes[i].occupied) {
        this._laneRoundRobin = (i + 1) % n;
        return i;
      }
    }

    // Pass 2: lane that passes MIN_SPAWN_GAP + kinematic safety
    const newSpeed = 150 + Math.random() * 150;
    for (let k = 0; k < n; k++) {
      const i = (this._laneRoundRobin + k) % n;
      if (this._isLaneSafe(i, newSpeed, isReverse)) {
        this._laneRoundRobin = (i + 1) % n;
        return i;
      }
    }

    // Pass 3: all occupied and no safe slot — round-robin distributes load
    // evenly so a single hot lane doesn't absorb all overflow
    const i = this._laneRoundRobin % n;
    this._laneRoundRobin = (i + 1) % n;
    return i;
  }


}
