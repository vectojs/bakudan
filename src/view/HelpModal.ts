import { UIComponent, Card, Text, Button, Stack, ScrollView } from '@vectojs/ui';
import type { IRenderer, VectoJSEvent } from '@vectojs/core';
import { t, type Language } from '../model/i18n';

export class HelpModal extends UIComponent {
  private card: Card;
  private backdropColor: string;

  constructor(lang: Language, width: number, height: number) {
    super();
    this.width = width;
    this.height = height;
    this.interactive = true;
    this.backdropColor = 'rgba(250, 248, 246, 0.4)';

    const modalW = Math.min(500, width - 40);
    const modalH = Math.min(420, height - 40);
    this.card = new Card({
      width: modalW,
      height: modalH,
      bg: 'rgba(255, 255, 255, 0.95)',
      border: 'rgba(255, 126, 95, 0.2)',
      radius: 12,
    });

    this.card.x = (this.width - modalW) / 2;
    this.card.y = (this.height - modalH) / 2;

    const titleText = new Text(t('help.title', lang), {
      font: '700 18px sans-serif',
      color: '#453c38',
    });
    this.card.add(titleText.setPosition(24, 24));

    const closeBtn = new Button('✕', {
      bg: 'transparent',
      hoverBg: 'rgba(255, 126, 95, 0.15)',
      color: '#ff7e5f',
      radius: 12,
    });
    closeBtn.width = 24;
    closeBtn.height = 24;
    closeBtn.on('click', (e: VectoJSEvent) => {
      e.stopPropagation();
      void this.close();
    });
    this.card.add(closeBtn.setPosition(modalW - 48, 20));

    // Content
    const scrollView = new ScrollView({
      width: modalW - 48,
      height: modalH - 80,
    });
    this.card.add(scrollView.setPosition(24, 60));

    const stack = new Stack({ direction: 'vertical', gap: 16 });
    scrollView.add(stack);

    // Build the help text blocks
    const helpItems = [
      { title: t('help.item1.title', lang), desc: t('help.item1.desc', lang) },
      { title: t('help.item2.title', lang), desc: t('help.item2.desc', lang) },
      { title: t('help.item3.title', lang), desc: t('help.item3.desc', lang) },
      { title: t('help.item4.title', lang), desc: t('help.item4.desc', lang) },
    ];

    for (const item of helpItems) {
      const itemTitle = new Text(item.title, { font: '600 14px sans-serif', color: '#ff7e5f' });
      const itemDesc = new Text(item.desc, {
        font: '400 13px sans-serif',
        color: '#453c38',
        maxWidth: modalW - 64,
      });
      stack.add(itemTitle);
      stack.add(itemDesc);
    }

    this.add(this.card);

    this.card.scaleX = 0;
    this.card.scaleY = 0;

    this.on('click', (e: VectoJSEvent) => {
      const localX = e.localX ?? 0;
      const localY = e.localY ?? 0;
      if (
        localX < this.card.x ||
        localX > this.card.x + modalW ||
        localY < this.card.y ||
        localY > this.card.y + modalH
      ) {
        void this.close();
      }
      e.stopPropagation();
    });
    this.on('pointerdown', (e: VectoJSEvent) => e.stopPropagation());
  }

  protected override onMounted(): void {
    void this.card.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 180, damping: 14 });
  }

  public async close(): Promise<void> {
    await this.card.springTo({ scaleX: 0, scaleY: 0 }, { stiffness: 220, damping: 20 });
    this.scene?.hideOverlay(this);
  }

  public render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(this.backdropColor);
  }
}
