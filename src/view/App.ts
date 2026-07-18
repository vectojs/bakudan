import { Scene } from '@vectojs/core';

export class App {
  readonly scene: Scene;
  // @ts-expect-error — read in Task 9+
  private _width = 0;
  // @ts-expect-error — read in Task 9+
  private _height = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  onResize(width: number, height: number): void {
    this._width = width;
    this._height = height;
  }

  onViewportChange(_vp: VisualViewport): void {
    // Stub — will be implemented in Task 12
  }

  start(): void {
    // Stub — will be implemented incrementally
  }
}
