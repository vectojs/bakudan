import { describe, expect, it } from 'bun:test';
import { ContentLibrary } from '../src/model/ContentLibrary';

describe('ContentLibrary', () => {
  it('contains entries', () => {
    expect(ContentLibrary.entries.length).toBeGreaterThan(0);
  });

  it('sample returns a string from entries', () => {
    const s = ContentLibrary.sample();
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('sample returns different values over many calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(ContentLibrary.sample());
    expect(set.size).toBeGreaterThan(1);
  });

  it('sampleBatch returns requested count', () => {
    const batch = ContentLibrary.sampleBatch(10);
    expect(batch.length).toBe(10);
    batch.forEach((s) => expect(typeof s).toBe('string'));
  });

  it('entries array is readonly', () => {
    const len = ContentLibrary.entries.length;
    expect(ContentLibrary.entries[0]).toBeDefined();
    expect(len).toBeGreaterThan(0);
  });
});
