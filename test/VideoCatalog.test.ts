import { describe, expect, it } from 'bun:test';
import type { VideoSelection, VideoSourceDescriptor } from '@vectojs/danmaku-kit/model';
import {
  DEFAULT_VIDEO_ID,
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
});
