import type { TrackProfile } from '@vectojs/danmaku-kit/model';

export {
  buildProfiledTrack,
  ProfiledDanmakuTrack,
  resolveTrackDistribution,
  type ProfiledTimedDanmakuEntry,
  type ProfiledTrackOptions,
  type ProfiledTrackResult,
  type ResolvedTrackDistribution,
  type TrackProfile,
} from '@vectojs/danmaku-kit/model';

export const TRACK_PROFILES: ReadonlyMap<string, TrackProfile> = new Map([
  [
    'natural-peaks',
    {
      id: 'natural-peaks',
      label: 'Natural Peaks',
      averagePerSecond: 4,
      peakPerSecond: 10,
      clusterRatio: 0.55,
      maxEntries: 600,
      presetWeights: {
        scroll: 65,
        reverse: 8,
        top: 12,
        bottom: 8,
        sine: 5,
        glitch: 1,
        repulsion: 1,
      },
      effectWeights: {
        glow: 0.12,
        gradient: 0.08,
        rainbow: 0.03,
        outline: 0.16,
      },
    },
  ],
  [
    'peak-event',
    {
      id: 'peak-event',
      label: 'Peak Event',
      averagePerSecond: 8,
      peakPerSecond: 28,
      clusterRatio: 0.78,
      maxEntries: 1000,
      presetWeights: {
        scroll: 71,
        reverse: 7,
        top: 10,
        bottom: 5,
        sine: 5,
        glitch: 1,
        repulsion: 1,
      },
      effectWeights: { glow: 0.18, gradient: 0.1, rainbow: 0.04, outline: 0.2 },
    },
  ],
  [
    'flood',
    {
      id: 'flood',
      label: 'Flood',
      averagePerSecond: 18,
      peakPerSecond: 35,
      clusterRatio: 0.15,
      maxEntries: 2000,
      presetWeights: {
        scroll: 79,
        reverse: 6,
        top: 6,
        bottom: 4,
        sine: 3,
        glitch: 1,
        repulsion: 1,
      },
      effectWeights: {
        glow: 0.08,
        gradient: 0.05,
        rainbow: 0.02,
        outline: 0.12,
      },
    },
  ],
  [
    // CTX-0044: rotation removed — per-char save/rotate was ~10fps
    'style-showcase',
    {
      id: 'style-showcase',
      label: 'Style Showcase',
      averagePerSecond: 6,
      peakPerSecond: 12,
      clusterRatio: 0.4,
      maxEntries: 800,
      presetWeights: {
        scroll: 2,
        reverse: 1,
        top: 1,
        bottom: 1,
        sine: 1,
        glitch: 1,
        repulsion: 1,
      },
      effectWeights: { glow: 0.3, gradient: 0.25, rainbow: 0.2, outline: 0.35 },
    },
  ],
]);
