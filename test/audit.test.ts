import { describe, it, expect } from 'bun:test';
import { Scene, Entity } from '@vectojs/core';
import { auditScene } from '@vectojs/devtools';

describe('audit', () => {
  it('passes auditScene on an empty scene', () => {
    const c = document.createElement('canvas');
    const scene = new Scene(c, { maxFPS: 0, maxDPR: 1 });
    const result = auditScene(scene);
    expect(result).toEqual([]);
    scene.destroy();
  });

  it('passes auditScene with mock entities added', () => {
    const c = document.createElement('canvas');
    const scene = new Scene(c, { maxFPS: 0, maxDPR: 1 });
    const entity = new (class extends Entity {
      constructor() {
        super();
        this.label = 'test-entity';
      }
    })();
    scene.add(entity);
    const result = auditScene(scene);
    expect(Array.isArray(result)).toBe(true);
    scene.destroy();
  });
});
