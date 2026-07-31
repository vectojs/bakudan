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
    super({ direction: 'horizontal', gap: 10 });
    this.width = 620;
    this.height = 52;
    this.padding = 9;

    this._input = new Input({
      placeholder: t('dock.placeholder', lang),
      width: 480,
      bg: 'rgba(250, 248, 246, 0.95)',
      border: 'rgba(255, 126, 95, 0.2)',
      color: '#332a26',
      placeholderColor: 'rgba(113, 98, 90, 0.5)',
      selectionColor: 'rgba(255, 126, 95, 0.3)',
      font: "14px 'Inter', sans-serif",
    });
    this._input.height = 34;
    this._input.on('keydown', (e: any) => {
      const key = e.nativeEvent?.key;
      if (key === 'Enter') {
        const text = this._input.value.trim();
        if (text) {
          opts.onSend(text);
          this._input.value = '';
        }
      }
    });
    this.add(this._input);

    const sendBtn = new Button(t('dock.send', lang), {
      bg: '#ff7e5f',
      hoverBg: '#ff6b4a',
      color: '#ffffff',
      font: "600 13px 'Inter', sans-serif",
      radius: 8,
    });
    sendBtn.width = 68;
    sendBtn.height = 34;
    sendBtn.on('click', () => {
      const text = this._input.value.trim();
      if (text) {
        opts.onSend(text);
        this._input.value = '';
      }
    });
    this.add(sendBtn);

    const panelBtn = new Button('☰', {
      bg: 'rgba(255, 126, 95, 0.12)',
      hoverBg: 'rgba(255, 126, 95, 0.25)',
      color: '#ff7e5f',
      font: "600 14px 'Inter', sans-serif",
      radius: 8,
    });
    panelBtn.width = 38;
    panelBtn.height = 34;
    panelBtn.on('click', opts.onTogglePanel);
    this.add(panelBtn);
  }

  get inputValue(): string {
    return this._input.value;
  }

  override layout(): void {
    const w = this.width;
    super.layout();
    for (const c of this.children) {
      c.x += 9;
      c.y += 9;
    }
    this.width = w;
    this.height = 52;
  }

  render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 14);
    renderer.fill('rgba(255, 255, 255, 0.94)');
    renderer.stroke('rgba(255, 126, 95, 0.25)', 1);
    renderer.restore();
    super.render(renderer);
  }
}
