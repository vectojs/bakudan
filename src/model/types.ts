// The danmaku engine types now live in the published @vectojs/danmaku-core
// package (pool, scheduler, presets, track). Re-export them so existing app
// imports (`../model/types`) keep working, and add the view-only types that
// belong to the app rather than the renderer-agnostic engine.
export type {
  PresetId,
  ShowcasePresetId,
  DanmakuParams,
  CharacterEffects,
  PoolSlot,
  PresetState,
  PresetFn,
  TimedDanmakuEntry,
} from '@vectojs/danmaku-core';
export { DEFAULT_EFFECTS, createDefaultParams, PRESET_COLORS } from '@vectojs/danmaku-core';

/** Heads-up-display metrics — a view concern, kept in the app. */
export interface HUDData {
  fps: number;
  frameTime: number;
  entityCount: number;
  heapUsedMB: number | null;
  gcSavedCount?: number;
  measureTextHitRate?: number;
}
