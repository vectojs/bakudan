import { describe, it, expect } from 'bun:test';
import { Scene } from '@vectojs/core';
import { auditScene } from '@vectojs/devtools';

describe('audit', () => {
  it('passes auditScene on an empty scene', () => {
    const c = document.createElement('canvas');
    const scene = new Scene(c, { maxFPS: 0, maxDPR: 1 });
    const result = auditScene(scene);
    expect(result).toEqual([]);
    scene.destroy();
  });
});
