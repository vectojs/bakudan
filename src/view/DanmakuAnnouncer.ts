import { Entity } from '@vectojs/core';

/**
 * A dedicated non-visual Entity that projects a `role="status"` (implicit
 * aria-live="polite") shadow node into the DOM as an aggregate a11y summary
 * of the danmaku stream — avoids the cost of 5,000 per-entity
 * getContentProjection() mirror nodes while keeping screen readers informed.
 *
 * - interactive=true + a11yFullViewport=true ensures a shadow node is
 *   projected even though width/height are zero.
 * - pointerEvents='none' prevents the full-viewport node from capturing
 *   clicks/taps over the stage.
 * - role='status' is not in the auto-tabindex interactive-role list, so the
 *   announcer does not pull focus.
 * - The Scheduler assigns this entity's `label` at a throttled cadence; the
 *   existing dirty-checked a11ySyncInterval picks it up.
 */
export class DanmakuAnnouncer extends Entity {
  isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  constructor() {
    super();
    this.interactive = true;
    this.a11yFullViewport = true;
  }

  getA11yAttributes() {
    return {
      role: 'status',
      label: this._announcement,
      pointerEvents: 'none' as const,
    };
  }

  private _announcement = 'Bakudan danmaku playground ready.';

  /** Called by Scheduler at a throttled interval to update the summary. */
  setSummary(summary: string): void {
    this._announcement = summary;
  }

  render(): void {
    // Intentionally empty — this entity produces no visual output.
  }
}
