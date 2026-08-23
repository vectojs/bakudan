import { describe, expect, it } from 'bun:test';
import type { VideoSelection, VideoSourceDescriptor } from '@vectojs/danmaku-kit/model';
import {
  DEFAULT_VIDEO_ID,
  LOCAL_FILE_VIDEO_ID,
  VIDEO_CATALOG,
  resolveVideoSelection,
  videoById,
} from '../src/model/VideoCatalog';

describe('VideoCatalog', () => {
  const defaultDescriptor: VideoSourceDescriptor = VIDEO_CATALOG[0]!;

  it('contains five immutable test entries with unique ids', () => {
    expect(VIDEO_CATALOG).toHaveLength(5);
    expect(new Set(VIDEO_CATALOG.map((entry) => entry.id)).size).toBe(5);
    expect(Object.isFrozen(VIDEO_CATALOG)).toBe(true);
    expect(VIDEO_CATALOG.every((entry) => Object.isFrozen(entry))).toBe(true);
  });

  it('uses verified HTTPS CDN sources and names a default track profile', () => {
    for (const entry of VIDEO_CATALOG) {
      expect(entry.source.kind).toBe('cdn');
      expect(entry.source.url.startsWith('https://cdn.vectojs.org/bakudan/video/')).toBe(true);
      expect(entry.defaultTrackProfileId.length).toBeGreaterThan(0);
    }
  });

  it('preserves attribution for CC BY derivatives', () => {
    const attributed = VIDEO_CATALOG.filter((entry) => entry.attribution);
    expect(attributed).toHaveLength(4);
    expect(attributed.every((entry) => entry.attribution!.license === 'CC BY 3.0')).toBe(true);
    expect(attributed.every((entry) => entry.attribution!.url.startsWith('https://'))).toBe(true);
  });

  it('resolves the default id and rejects unknown ids', () => {
    expect(defaultDescriptor.id).toBe(DEFAULT_VIDEO_ID);
    expect(videoById(DEFAULT_VIDEO_ID)?.id).toBe(DEFAULT_VIDEO_ID);
    expect(videoById('missing')).toBeUndefined();
    const missingSelection: VideoSelection = { kind: 'catalog', id: 'missing' };
    expect(() => resolveVideoSelection(missingSelection)).toThrow('Unknown video catalog id');
  });

  it('resolves catalog ids and normalized custom URLs without conflating them', () => {
    expect(resolveVideoSelection({ kind: 'catalog', id: 'flower-seek-loop' }).id).toBe(
      'flower-seek-loop',
    );
    const custom = resolveVideoSelection({
      kind: 'custom',
      url: 'https://EXAMPLE.test:443/a.mp4#frame',
    });
    const equivalent = resolveVideoSelection({ kind: 'custom', url: 'https://example.test/a.mp4' });
    expect(custom.id.startsWith('custom-')).toBe(true);
    expect(custom.id).toBe(equivalent.id);
    expect(custom.source.kind).toBe('external');
  });

  it('accepts blob: object URLs as custom sources with stable per-URL ids', () => {
    const blob = 'blob:http://localhost:4173/7c9d6a1e-1f2a-4b8e-9c3d-0a5b7e9d1f2c';
    const resolved = resolveVideoSelection({ kind: 'custom', url: blob });
    // Object URLs bypass fetch-normalization by design: they must survive
    // resolution byte-for-byte so StageBackground receives the same URL.
    expect(resolved.source.url).toBe(blob);
    expect(resolved.source.kind).toBe('external');
    expect(resolved.id.startsWith('custom-')).toBe(true);
    // Stable across repeated resolution, distinct per URL (two uploads are
    // never conflated by the same-selection comparison).
    expect(resolveVideoSelection({ kind: 'custom', url: blob }).id).toBe(resolved.id);
    const second = resolveVideoSelection({
      kind: 'custom',
      url: 'blob:http://localhost:4173/ffff6a1e-1f2a-4b8e-9c3d-0a5b7e9d1f2c',
    });
    expect(second.id.startsWith('custom-')).toBe(true);
    expect(second.id).not.toBe(resolved.id);
  });

  it('keeps the synthetic local-file row out of the resolvable CDN catalog', () => {
    expect(videoById(LOCAL_FILE_VIDEO_ID)).toBeUndefined();
    expect(VIDEO_CATALOG.some((entry) => entry.id === LOCAL_FILE_VIDEO_ID)).toBe(false);
  });
});
