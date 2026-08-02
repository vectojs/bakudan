import { A11yAttributes, LayoutControlledProperty } from '@vectojs/core';
import { UIComponent } from '@vectojs/ui';

export interface SelectionHotspotsOptions {
  onLikeToggle: () => void;
  onCopy: () => void;
  likeLabel: () => string;
  copyLabel: () => string;
}

export class SelectionHotspots extends UIComponent {
  public liked = false;
  private readonly _likeHotspot: TransparentAction;
  private readonly _copyHotspot: TransparentAction;

  constructor(options: SelectionHotspotsOptions) {
    super();
    this.interactive = false;

    this._likeHotspot = new TransparentAction(
      () => options.likeLabel(),
      options.onLikeToggle,
      () => this.liked,
    );
    this._copyHotspot = new TransparentAction(
      () => options.copyLabel(),
      options.onCopy,
      () => false,
    );

    this.add(this._likeHotspot);
    this.add(this._copyHotspot);
  }

  public place(x: number, y: number, likeWidth: number, copyWidth: number): void {
    const H = 44;
    const centerY = y + H / 2;

    this._likeHotspot.x = x;
    this._likeHotspot.y = centerY - H / 2;
    this._likeHotspot.width = Math.max(44, likeWidth);
    this._likeHotspot.height = H;

    this._copyHotspot.x = x + likeWidth;
    this._copyHotspot.y = centerY - H / 2;
    this._copyHotspot.width = Math.max(44, copyWidth);
    this._copyHotspot.height = H;
  }

  public override render(): void {
    // Canvas rendering happens in DanmakuLayer; this exists only for focus and hit testing
  }
}

class TransparentAction extends UIComponent {
  constructor(
    private readonly _label: () => string,
    private readonly _action: () => void,
    private readonly _checked: () => boolean,
  ) {
    super();
    this.interactive = true;
    // If pointerEvents is missing in the installed @vectojs/core, omit it for now

    this.on('click', () => this._action());
    this.on('keydown', (e: KeyboardEvent) => {
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
      tabIndex: 0,
    };
  }

  public override render(): void {
    // handled by DanmakuLayer
  }
}
