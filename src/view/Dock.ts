import { Input, Button, Stack } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';

export interface DockCallbacks {
  onSend: (text: string) => void;
  onTogglePanel: () => void;
}

export class Dock extends Stack {
  private _input: Input;

  constructor(opts: DockCallbacks) {
    super({ direction: 'horizontal', gap: 8 });
    this.width = 600;
    this.height = 48;
    this.padding = 8;

    this._input = new Input({
      placeholder: 'Send a danmaku...',
      width: 468,
    });
    this._input.height = 32;
    this.add(this._input);

    const sendBtn = new Button('Send');
    sendBtn.width = 64;
    sendBtn.height = 32;
    sendBtn.on('click', () => {
      const text = this._input.value.trim();
      if (text) {
        opts.onSend(text);
        this._input.value = '';
      }
    });
    this.add(sendBtn);

    const panelBtn = new Button('☰');
    panelBtn.width = 36;
    panelBtn.height = 32;
    panelBtn.on('click', opts.onTogglePanel);
    this.add(panelBtn);
  }

  get inputValue(): string {
    return this._input.value;
  }

  /** `Stack` draws nothing itself — add a near-opaque backdrop so the send
   * bar visually separates from the scrolling danmaku behind it. A low-alpha
   * fill close in hue to the stage background lets bright danmaku text bleed
   * through and read as "no backdrop at all" even when it renders correctly. */
  override render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill('#1e2536');
    renderer.stroke('rgba(148,163,184,0.4)', 1.5);
    renderer.restore();
    super.render(renderer);
  }
}
