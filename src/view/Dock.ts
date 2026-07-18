import { Input, Button, Stack } from '@vectojs/ui';

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
}
