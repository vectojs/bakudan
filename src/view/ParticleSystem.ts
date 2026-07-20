import type { IRenderer } from '@vectojs/core';

export class ParticleSystem {
  private static MAX = 600;
  private static x = new Float64Array(ParticleSystem.MAX);
  private static y = new Float64Array(ParticleSystem.MAX);
  private static vx = new Float64Array(ParticleSystem.MAX);
  private static vy = new Float64Array(ParticleSystem.MAX);
  private static age = new Float64Array(ParticleSystem.MAX);
  private static maxAge = new Float64Array(ParticleSystem.MAX);
  private static active = new Uint8Array(ParticleSystem.MAX);
  private static color = Array.from<string>({ length: ParticleSystem.MAX });
  private static size = new Float64Array(ParticleSystem.MAX);

  /** Spawns a cluster of particles at (x, y) radiating outwards. */
  static spawnExplosion(x: number, y: number, baseColor: string): void {
    const count = 15 + Math.floor(Math.random() * 10);
    let spawned = 0;

    // Glassmorphic Peach theme colors
    const colors = [
      baseColor,
      '#ff7e5f', // peach
      '#feb47b', // warm peach-orange
      '#ff9a9e', // pink-peach
      '#ffffff', // white spark
    ];

    for (let i = 0; i < ParticleSystem.MAX && spawned < count; i++) {
      if (ParticleSystem.active[i] === 0) {
        ParticleSystem.active[i] = 1;
        ParticleSystem.x[i] = x;
        ParticleSystem.y[i] = y;

        // Radiate outwards
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 200;
        ParticleSystem.vx[i] = Math.cos(angle) * speed;
        ParticleSystem.vy[i] = Math.sin(angle) * speed - 50; // slight initial upward drift

        ParticleSystem.age[i] = 0;
        ParticleSystem.maxAge[i] = 0.4 + Math.random() * 0.5; // live for 0.4s to 0.9s
        ParticleSystem.color[i] = colors[Math.floor(Math.random() * colors.length)];
        ParticleSystem.size[i] = 2 + Math.random() * 4;
        spawned++;
      }
    }
  }

  /** Update active particles under gravity. */
  static update(dt: number): boolean {
    const seconds = dt / 1000;
    const gravity = 400; // px/s^2 pull down
    let hasActive = false;

    for (let i = 0; i < ParticleSystem.MAX; i++) {
      if (ParticleSystem.active[i] === 1) {
        ParticleSystem.age[i] += seconds;
        if (ParticleSystem.age[i] >= ParticleSystem.maxAge[i]) {
          ParticleSystem.active[i] = 0;
          continue;
        }

        // Apply physics
        ParticleSystem.vy[i] += gravity * seconds;
        ParticleSystem.x[i] += ParticleSystem.vx[i] * seconds;
        ParticleSystem.y[i] += ParticleSystem.vy[i] * seconds;

        hasActive = true;
      }
    }

    return hasActive;
  }

  /** Draw active particles. */
  static render(renderer: IRenderer): void {
    renderer.save();
    for (let i = 0; i < ParticleSystem.MAX; i++) {
      if (ParticleSystem.active[i] === 1) {
        const opacity = 1 - ParticleSystem.age[i] / ParticleSystem.maxAge[i];
        renderer.save();
        renderer.setGlobalAlpha(opacity);
        renderer.beginPath();
        renderer.roundRect(
          ParticleSystem.x[i],
          ParticleSystem.y[i],
          ParticleSystem.size[i],
          ParticleSystem.size[i],
          ParticleSystem.size[i] / 2,
        );
        renderer.fill(ParticleSystem.color[i]);
        renderer.restore();
      }
    }
    renderer.restore();
  }

  /** Deactivate all particles. */
  static reset(): void {
    ParticleSystem.active.fill(0);
  }
}
