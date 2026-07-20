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
      bg: 'rgba(250, 248, 246, 0.8)',
      border: 'rgba(255, 126, 95, 0.15)',
      color: '#453c38',
      placeholderColor: 'rgba(69, 60, 56, 0.4)',
      selectionColor: 'rgba(255, 126, 95, 0.3)',
    });
    this._input.height = 32;
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
      hoverBg: '#feb47b',
      color: '#ffffff',
      radius: 8,
    });
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

    const panelBtn = new Button('☰', {
      bg: 'rgba(255, 126, 95, 0.1)',
      hoverBg: 'rgba(255, 126, 95, 0.25)',
      color: '#ff7e5f',
      radius: 8,
    });
    panelBtn.width = 36;
    panelBtn.height = 32;
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
      c.x += 8;
      c.y += 8;
    }
    this.width = w;
    this.height = 48;
  }

  render(renderer: IRenderer): void {
    renderer.save();
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill('rgba(255, 255, 255, 0.85)');
    renderer.stroke('rgba(255, 126, 95, 0.2)', 1.5);
    renderer.restore();
    super.render(renderer);
  }
}
