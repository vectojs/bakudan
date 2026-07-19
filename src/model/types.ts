export type PresetId =
  'scroll' | 'reverse' | 'top' | 'bottom' | 'sine' | 'rotation' | 'glitch' | 'repulsion';

export type ShowcasePresetId = 'physics' | 'jelly';

export interface DanmakuParams {
  text: string;
  color: string;
  fontSize: number;
  speed: number;
  opacity: number;
  preset: PresetId;
  presetParams: Record<string, number>;
  effects: CharacterEffects;
}

export interface CharacterEffects {
  glow: boolean;
  gradient: boolean;
  rainbow: boolean;
  outline: boolean;
}

export interface PoolSlot {
  id: number;
  active: boolean;
  params: DanmakuParams;
  x: number;
  y: number;
  width: number;
  rotation: number;
  opacity: number;
  age: number;
  lane: number;
  /** Per-character rotation offsets for the `rotation` preset. */
  charAngles: Float64Array;
}

export interface PresetState {
  time: number;
  cursorX: number;
  cursorY: number;
  pointerActive: boolean;
}

export type PresetFn = (
  slot: PoolSlot,
  dt: number,
  state: PresetState,
  stageWidth: number,
  stageHeight: number,
) => void;

export interface HUDData {
  fps: number;
  frameTime: number;
  entityCount: number;
  heapUsedMB: number | null;
  gcSavedCount?: number;
  measureTextHitRate?: number;
}

/** A single pre-authored danmaku pinned to a video timestamp (seconds). */
export interface TimedDanmakuEntry {
  /** Video time in seconds at which this danmaku should appear. */
  time: number;
  text: string;
  color?: string;
  fontSize?: number;
  speed?: number;
  preset?: PresetId;
}

export const DEFAULT_EFFECTS: CharacterEffects = {
  glow: false,
  gradient: false,
  rainbow: false,
  outline: false,
};

export function createDefaultParams(): DanmakuParams {
  return {
    text: '',
    color: '#f1f5f9',
    fontSize: 24,
    speed: 200,
    opacity: 0.9,
    preset: 'scroll',
    presetParams: {},
    effects: { ...DEFAULT_EFFECTS },
  };
}

export const PRESET_COLORS: Record<PresetId | ShowcasePresetId, string> = {
  scroll: '#f1f5f9',
  reverse: '#60a5fa',
  top: '#fbbf24',
  bottom: '#34d399',
  sine: '#a78bfa',
  rotation: '#f472b6',
  glitch: 'rgba(255,100,100,0.9)',
  repulsion: '#22d3ee',
  physics: '#fb923c',
  jelly: '#c084fc',
};
