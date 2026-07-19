import { Input, Button, Stack } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import { t, type Language } from '../model/i18n';

export interface DockCallbacks {
  onSend: (text: string) => void;
  onTogglePanel: () => void;
}

export class Dock extends Stack {
  private _input: Input;

  constructor(lang: Language, opts: DockCallbacks) {
    super({ direction: 'horizontal', gap: 8 });
    this.width = 600;
    this.height = 48;
    this.padding = 8;

    this._input = new Input({
      placeholder: t('dock.placeholder', lang),
      width: 468,
    });
    this._input.height = 32;
    this.add(this._input);

    const sendBtn = new Button(t('dock.send', lang));
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

  override render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill('#ffffff'); // White panel backdrop matching gallery
    renderer.stroke('rgba(69, 60, 56, 0.15)', 1.5);
    renderer.restore();
    super.render(renderer);
  }
}
