import { A11yAttributes, LayoutControlledProperty } from '@vectojs/core';
import { UIComponent } from '@vectojs/ui';

/** WCAG 2.5.8 minimum target size, so a hotspot never collapses below it. */
const MIN_TOUCH_TARGET_PX = 24;

/**
 * Off-scene park position for the whole hotspots container while no danmaku is
 * selected. Children are zeroed at the same time (see `hide`), so the composed
 * world rect always sits far outside the viewport and core's projection gate
 * hides the elements — a parked container alone was not enough: `place` used to
 * write children in world coordinates, composing to an on-screen rect that
 * stayed clickable over unrelated content.
 */
const HIDDEN_X = -100000;

function hits(
  rect: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export interface SelectionHotspotsOptions {
  onLikeToggle: () => void;
  onCopy: () => void;
  /** Escape pressed while a hotspot holds focus dismisses the selection. */
  onDismiss: () => void;
  likeLabel: () => string;
  copyLabel: () => string;
}

/** Which pill action the pointer is currently over, for hover feedback. */
export type HoveredAction = 'like' | 'copy' | null;

export class SelectionHotspots extends UIComponent {
  public liked = false;
  private readonly _likeHotspot: TransparentAction;
  private readonly _copyHotspot: TransparentAction;

  constructor(options: SelectionHotspotsOptions) {
    super();
    this.interactive = false;

    const visible = () => this.x > HIDDEN_X;
    this._likeHotspot = new TransparentAction(
      () => options.likeLabel(),
      options.onLikeToggle,
      options.onDismiss,
      () => this.liked,
      visible,
    );
    this._copyHotspot = new TransparentAction(
      () => options.copyLabel(),
      options.onCopy,
      options.onDismiss,
      () => false,
      visible,
    );

    this.add(this._likeHotspot);
    this.add(this._copyHotspot);
    this.hide();
  }

  /**
   * Which action the given scene point falls on, or `null`. Derived from the
   * same rects the hotspots occupy, so hover feedback can never highlight one
   * button while the click lands on another.
   */
  public hitAction(x: number, y: number): HoveredAction {
    if (this._likeHotspot.width > 0 && hits(this._likeHotspot, x, y)) return 'like';
    if (this._copyHotspot.width > 0 && hits(this._copyHotspot, x, y)) return 'copy';
    return null;
  }

  /**
   * Park the bar off-scene: container far outside the viewport AND both
   * children zeroed. Either half alone leaves a ghost — a parked container
   * with placed children composes back on-screen, and zeroed children on an
   * unparked container stay in the tab order.
   */
  public hide(): void {
    this.x = HIDDEN_X;
    this.y = 0;
    for (const child of [this._likeHotspot, this._copyHotspot]) {
      child.x = 0;
      child.y = 0;
      child.width = 0;
      child.height = 0;
    }
  }

  /**
   * Position the two hotspots over the action pill as it is actually drawn.
   *
   * Coordinates are scene/world units. The container origin is reset first so
   * child rects are world rects — `place` after `hide` must compose back to the
   * pill position, which is exactly what the old park-at-x-only approach broke.
   *
   * @param x       Pill left edge, in scene units.
   * @param y       Pill top edge. This is the pill's own top, not the danmaku's
   *                origin — the pill is offset below the text.
   * @param height  Pill height; both hotspots span it fully.
   * @param copyDx  Horizontal offset of the copy glyph from `x`. The like
   *                hotspot ends here and the copy hotspot begins here, so the
   *                split follows the painted glyphs instead of assuming an even
   *                halving.
   * @param width   Total pill width, used to size the copy hotspot's remainder.
   */
  public place(x: number, y: number, height: number, copyDx: number, width: number): void {
    if (this.x !== 0 || this.y !== 0) {
      this.x = 0;
      this.y = 0;
    }
    const likeWidth = Math.max(MIN_TOUCH_TARGET_PX, copyDx);
    const copyWidth = Math.max(MIN_TOUCH_TARGET_PX, width - copyDx);

    this._likeHotspot.x = x;
    this._likeHotspot.y = y;
    this._likeHotspot.width = likeWidth;
    this._likeHotspot.height = height;

    this._copyHotspot.x = x + copyDx;
    this._copyHotspot.y = y;
    this._copyHotspot.width = copyWidth;
    this._copyHotspot.height = height;
  }

  public override render(): void {
    // Canvas rendering happens in DanmakuLayer; this exists only for focus and hit testing
  }
}

class TransparentAction extends UIComponent {
  constructor(
    private readonly _label: () => string,
    private readonly _action: () => void,
    private readonly _dismiss: () => void,
    private readonly _checked: () => boolean,
    private readonly _visible: () => boolean,
  ) {
    super();
    this.interactive = true;

    this.on('click', () => this._action());
    // Bilibili's bar closes on Escape no matter which of its buttons holds
    // focus — the global shortcut layer deliberately stands down whenever a
    // role="button" owns the keyboard, so the bar must handle Escape itself.
    this.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._dismiss();
        return;
      }
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        e.preventDefault();
        this._action();
      }
    });
  }

  public override getLayoutControlledProperties(): ReadonlyArray<LayoutControlledProperty> {
    return ['x', 'y', 'width', 'height'];
  }

  public getA11yAttributes(): A11yAttributes {
    return {
      role: 'button',
      checked: this._checked(),
      label: this._label(),
      tabIndex: this._visible() ? 0 : -1,
    };
  }

  public override render(): void {
    // handled by DanmakuLayer
  }
}
