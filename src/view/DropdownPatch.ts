import { Dropdown, Button, Stack } from '@vectojs/ui';
import { Entity, VectoJSEvent } from '@vectojs/core';

export function patchDropdownTheme(): void {
  (Dropdown.prototype as any).openMenu = function (this: any) {
    const scene = this.scene;
    if (!scene) return;
    const triggerBounds = this.getWorldBounds();
    const backdrop = new (class Backdrop extends Entity {
      isPointInside() {
        return true;
      }
      render() {}
    })('dropdown-backdrop');
    backdrop.width = scene.width;
    backdrop.height = scene.height;
    backdrop.interactive = true;
    backdrop.on('click', (e: VectoJSEvent) => {
      e.stopPropagation();
      this.closeMenu();
    });
    const menu = new Stack({ direction: 'vertical', gap: 2 });
    menu.x = triggerBounds.x;
    menu.y = triggerBounds.y + triggerBounds.height + 4;
    menu.width = triggerBounds.width;
    menu.height = this.options.length * 36 + (this.options.length - 1) * 2;
    menu.interactive = true;
    (menu as any).getA11yAttributes = () => ({ role: 'listbox', label: 'Options' });
    (menu as any).render = function (r: any) {
      r.save();
      r.beginPath();
      r.roundRect(0, 0, this.width, this.height, 8);
      r.fill('rgba(255, 255, 255, 0.98)');
      r.stroke('rgba(255, 126, 95, 0.2)', 1);
      r.restore();
      Stack.prototype.render.call(this, r);
    };
    this.options.forEach((opt: string, index: number) => {
      const item = new Button(opt, {
        bg: opt === this.selectedValue ? 'rgba(255, 126, 95, 0.25)' : 'transparent',
        color: '#453c38',
        radius: 6,
        font: '13px sans-serif',
      });
      item.id = `${this.id}-opt-${index}`;
      item.width = menu.width;
      item.height = 36;
      item.interactive = true;
      (item as any).getA11yAttributes = () => ({
        role: 'option',
        label: opt,
        selected: opt === this.selectedValue,
      });
      item.on('click', (e: VectoJSEvent) => {
        e.stopPropagation();
        this.selectOption(opt);
      });
      menu.add(item);
    });
    scene.showOverlay(backdrop);
    scene.showOverlay(menu);
    this.activeBackdrop = backdrop;
    this.activeMenu = menu;
    this.highlightedIndex = this.options.indexOf(this.selectedValue);
    this.updateMenuHighlight();
  };

  (Dropdown.prototype as any).updateMenuHighlight = function (this: any) {
    const menu = this.activeMenu;
    if (!menu) return;
    const children = menu.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as any;
      if (i === this.highlightedIndex) {
        child.bg = 'rgba(255, 126, 95, 0.4)';
      } else if (this.options[i] === this.selectedValue) {
        child.bg = 'rgba(255, 126, 95, 0.25)';
      } else {
        child.bg = 'transparent';
      }
    }
  };

  Button.prototype.render = function (this: any, r: any) {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, this.radius);
    r.fill(this.hovered ? this.hoverBg : this.bg);
    if (this.focused) {
      r.stroke('#ff7e5f', 2);
    }
    const textX = (this.width - this.textWidth) / 2;
    r.fillText(this.label, textX, this.height * 0.66, this.font, this.color);
  };
}
