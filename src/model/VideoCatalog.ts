import type { VideoSelection, VideoSourceDescriptor } from '@vectojs/danmaku-kit/model';
import { normalizeVideoUrl, videoIdForCustomUrl } from './UserDanmakuStore';

export type VideoTestTag =
  | 'motion'
  | 'bright'
  | 'low-light'
  | 'animation'
  | 'portrait'
  | 'seek-loop';

export interface VideoAttribution {
  label: string;
  url: string;
  license: 'CC BY 3.0';
}

export interface VideoCatalogEntry extends VideoSourceDescriptor {
  durationHint: number;
  aspectRatio: number;
  testTags: readonly VideoTestTag[];
  defaultTrackProfileId: string;
  attribution?: VideoAttribution;
}

function immutableEntry(entry: VideoCatalogEntry): VideoCatalogEntry {
  Object.freeze(entry.source);
  Object.freeze(entry.testTags);
  if (entry.attribution) Object.freeze(entry.attribution);
  return Object.freeze(entry);
}

export const VIDEO_CATALOG: readonly VideoCatalogEntry[] = Object.freeze([
  immutableEntry({
    id: 'flower-seek-loop',
    title: 'Flower Seek Loop',
    source: {
      kind: 'cdn',
      url: 'https://cdn.vectojs.org/bakudan/video/flower-seek-loop-60s.mp4?v=20260801',
    },
    durationHint: 60,
    aspectRatio: 16 / 9,
    testTags: ['bright', 'seek-loop'],
    defaultTrackProfileId: 'natural-peaks',
  }),
  immutableEntry({
    id: 'bbb-motion',
    title: 'Big Buck Bunny · Motion',
    source: {
      kind: 'cdn',
      url: 'https://cdn.vectojs.org/bakudan/video/bbb-motion-60s.mp4?v=20260801',
    },
    durationHint: 60,
    aspectRatio: 16 / 9,
    testTags: ['motion', 'animation'],
    defaultTrackProfileId: 'peak-event',
    attribution: {
      label: 'Big Buck Bunny · Blender Foundation',
      url: 'https://peach.blender.org/about/',
      license: 'CC BY 3.0',
    },
  }),
  immutableEntry({
    id: 'sintel-low-light',
    title: 'Sintel · Low Light',
    source: {
      kind: 'cdn',
      url: 'https://cdn.vectojs.org/bakudan/video/sintel-low-light-60s.mp4?v=20260801',
    },
    durationHint: 60,
    aspectRatio: 16 / 9,
    testTags: ['low-light', 'animation'],
    defaultTrackProfileId: 'style-showcase',
    attribution: {
      label: 'Sintel · Blender Foundation',
      url: 'https://durian.blender.org/about/',
      license: 'CC BY 3.0',
    },
  }),
  immutableEntry({
    id: 'tears-live-action',
    title: 'Tears of Steel · Live Action',
    source: {
      kind: 'cdn',
      url: 'https://cdn.vectojs.org/bakudan/video/tears-live-action-60s.mp4?v=20260801',
    },
    durationHint: 60,
    aspectRatio: 16 / 9,
    testTags: ['motion', 'low-light'],
    defaultTrackProfileId: 'flood',
    attribution: {
      label: 'Tears of Steel · Blender Foundation',
      url: 'https://mango.blender.org/about/',
      license: 'CC BY 3.0',
    },
  }),
  immutableEntry({
    id: 'sintel-portrait',
    title: 'Sintel · Portrait Crop',
    source: {
      kind: 'cdn',
      url: 'https://cdn.vectojs.org/bakudan/video/sintel-portrait-60s.mp4?v=20260801',
    },
    durationHint: 60,
    aspectRatio: 9 / 16,
    testTags: ['portrait', 'animation'],
    defaultTrackProfileId: 'natural-peaks',
    attribution: {
      label: 'Sintel derivative · Blender Foundation',
      url: 'https://durian.blender.org/about/',
      license: 'CC BY 3.0',
    },
  }),
]);

export const DEFAULT_VIDEO_ID = 'flower-seek-loop';

export function videoById(id: string): VideoCatalogEntry | undefined {
  return VIDEO_CATALOG.find((entry) => entry.id === id);
}

export function resolveVideoSelection(selection: VideoSelection): VideoCatalogEntry {
  if (selection.kind === 'catalog') {
    const entry = videoById(selection.id);
    if (!entry) throw new Error(`Unknown video catalog id: ${selection.id}`);
    return entry;
  }

  const url = normalizeVideoUrl(selection.url);
  return {
    id: videoIdForCustomUrl(url),
    title: 'Custom Video',
    source: { kind: 'external', url },
    durationHint: 15,
    aspectRatio: 16 / 9,
    testTags: [],
    defaultTrackProfileId: 'natural-peaks',
  };
}
