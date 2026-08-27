import type { CommandDeckGroupId } from '@vectojs/danmaku-kit/ui';
import type { StageBackgroundOptions } from '../StageBackground';

export const DESKTOP_POOL = 20_000;
export const MOBILE_POOL = 5_000;
export const MOBILE_BREAKPOINT = 768;
export const STATUS_UPDATE_INTERVAL_MS = 500;
/** Pointer must be this still before the freeze zone arms (moving cursor freezes nothing). */
export const FREEZE_QUIET_MS = 150;
/** Max hold per danmaku in the freeze zone; then it flows on — no permanent wall. */
export const FREEZE_HOLD_MS = 1800;
/** Zone padding around the pointer point, so grazing danmaku count as crossing. */
export const FREEZE_PAD_PX = 4;
export const A11Y_UPDATE_INTERVAL_MS = 2000;
export const DESKTOP_DRAWER_RATIO = 0.46;
export const MOBILE_DRAWER_RATIO = 0.69;
export const OVERLAY_MARGIN_DESKTOP = 16;
export const OVERLAY_MARGIN_MOBILE = 8;
export const COMMAND_DECK_MAX_WIDTH = 960;

// Compose / transport / utility clusters (danmaku-kit#15): the flat uniform-gap
// row read as one loose ~760px spread at desktop width, where modern players
// cluster controls into three plates. groupGap only widens boundaries BETWEEN
// clusters; intra-cluster spacing keeps the ordinary gap. The compact layout
// ignores grouping by design -- its two width-starved rows collapse clusters
// rather than risk unusable control widths.
export const COMMAND_DECK_GROUPS: readonly CommandDeckGroupId[][] = [
  ['input', 'send'],
  ['play', 'timeline', 'elapsed'],
  ['rate', 'lab'],
];
// Cluster-boundary separation. At the narrowest desktop viewport (768px ->
// deck 736px) fixed control widths plus two 24px boundaries still leave the
// flexible input well ~95px; below 768px compact takes over and ignores this.
export const COMMAND_DECK_GROUP_GAP_PX = 24;
export const FRAME_METRICS = ['fps', 'frame-time'] as const;
export const DRAW_METRICS = ['gl-runs', 'gl-glyphs', 'canvas-slots'] as const;
export const DISTRIBUTIONS = ['steady', 'bursty'] as const;
export const EFFECT_IDS = ['glow', 'gradient', 'rainbow', 'outline'] as const;
export const RENDER_CLASSES = ['backend', 'glyphs', 'canvas'] as const;

export type AppMode = 'stress' | 'video';
export type LabTab = 'videos' | 'throughput' | 'benchmark' | 'interactions' | 'devtools';
export type FrameMetricId = (typeof FRAME_METRICS)[number];
export type DrawMetricId = (typeof DRAW_METRICS)[number];
export type DistributionId = (typeof DISTRIBUTIONS)[number];
export type EffectId = (typeof EFFECT_IDS)[number];
export type RenderClassId = (typeof RENDER_CLASSES)[number];

export interface AppOptions {
  stageBackground?: import('../StageBackground').StageBackground;
  stageBackgroundOptions?: StageBackgroundOptions;
}

export interface CinemaLayoutSnapshot {
  status: { x: number; y: number; width: number; height: number };
  command: {
    x: number;
    y: number;
    width: number;
    height: number;
    controls: ReturnType<import('@vectojs/danmaku-kit/ui').DanmakuCommandDeck['layoutSnapshot']>;
  };
  drawer: {
    x: number;
    y: number;
    width: number;
    height: number;
    open: boolean;
    childCount: number;
  };
}

export interface ViewSnapshot {
  mode: AppMode;
  labOpen: boolean;
  activeLabTab: LabTab;
  videoId: string;
  profileId: string;
  videoLoadState: import('@vectojs/danmaku-kit/model').VideoLoadState;
}
