import '../../styles/help.css';
import { BAKUDAN_THEME } from '../cinemaConfig';
import type { Language } from '../../model/i18n';

export interface HelpModalOptions {
  onClose: () => void;
  language?: Language;
  title?: string;
}

type HelpBinding = { keys: string[]; description: string };
type HelpSection = { title: string; bindings: HelpBinding[] };

/**
 * Canonical key-binding table for Bakudan.
 * Keep in sync with KeyboardShortcuts.decodeShortcut and LabDrawer tablist keys.
 * Descriptions are shown verbatim in the modal; keys are rendered as <kbd>.
 */
export const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Playback & Timeline',
    bindings: [
      { keys: ['Space', 'k'], description: 'Play / Pause' },
      { keys: ['ArrowLeft'], description: 'Seek backward 5 s' },
      { keys: ['ArrowRight'], description: 'Seek forward 5 s' },
      { keys: ['j'], description: 'Seek backward 10 s' },
      { keys: ['l'], description: 'Seek forward 10 s' },
      { keys: ['Home'], description: 'Seek to start (0 %)' },
      { keys: ['End'], description: 'Seek to end (100 %)' },
      {
        keys: ['0', '1', '…', '9'],
        description: 'Seek to 0 % – 90 % of duration',
      },
      { keys: ['f'], description: 'Toggle fullscreen' },
    ],
  },
  {
    title: 'System',
    bindings: [
      { keys: ['?'], description: 'Show this help (Shift + /)' },
      {
        keys: ['Escape'],
        description: 'Close help / clear selection / close Lab',
      },
    ],
  },
  {
    title: 'Lab Drawer (when tab bar is focused)',
    bindings: [
      { keys: ['ArrowLeft', 'ArrowRight'], description: 'Previous / Next tab' },
      { keys: ['ArrowUp', 'ArrowDown'], description: 'Previous / Next tab' },
      { keys: ['Home'], description: 'First tab' },
      { keys: ['End'], description: 'Last tab' },
    ],
  },
];

function helpTitleFor(lang: Language): string {
  switch (lang) {
    case 'zh-CN':
      return '键盘快捷键';
    case 'zh-TW':
      return '鍵盤快捷鍵';
    case 'ja':
      return 'キーボードショートカット';
    case 'ko':
      return '키보드 단축키';
    default:
      return 'Keyboard Shortcuts';
  }
}

function helpSubtitleFor(lang: Language): string {
  switch (lang) {
    case 'zh-CN':
      return '将鼠标悬停在图标上可查看提示；支持键盘操作。';
    case 'zh-TW':
      return '將滑鼠懸停在圖示上可查看提示；支援鍵盤操作。';
    case 'ja':
      return 'アイコンにカーソルを合わせるとヒントが表示されます。';
    case 'ko':
      return '아이콘 위에 마우스를 올리면 힌트를 볼 수 있습니다.';
    default:
      return 'Hover any icon for its tooltip — every control is also reachable by keyboard.';
  }
}

/**
 * Accessible global Help modal.
 *
 * - role="dialog" aria-modal="true" aria-labelledby title
 * - Focus trap (Tab / Shift+Tab loop), Escape to close
 * - Overlay click (outside dialog) closes
 * - Restores focus to the trigger on close
 * - Hidden by default (hidden + aria-hidden)
 */
export class HelpModal {
  readonly element: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly bodyEl: HTMLElement;
  private readonly opts: HelpModalOptions;
  private openState = false;
  private previousFocus: HTMLElement | null = null;
  private trapCleanup: (() => void) | null = null;
  private destroyed = false;

  constructor(container: HTMLElement, opts: HelpModalOptions) {
    this.opts = opts;
    this.element = container;

    // Theme CSS vars
    for (const [k, v] of Object.entries({
      '--bakudan-surface': BAKUDAN_THEME.surface,
      '--bakudan-surface-raised': BAKUDAN_THEME.surfaceRaised,
      '--bakudan-border': BAKUDAN_THEME.border,
      '--bakudan-text': BAKUDAN_THEME.text,
      '--bakudan-text-muted': BAKUDAN_THEME.textMuted,
      '--bakudan-accent': BAKUDAN_THEME.accent,
      '--bakudan-accent-hover': BAKUDAN_THEME.accentHover,
      '--bakudan-focus-ring': BAKUDAN_THEME.focusRing,
      '--bakudan-font-ui': BAKUDAN_THEME.fontUi,
      '--bakudan-font-mono': BAKUDAN_THEME.fontMono,
      '--bakudan-font-label': BAKUDAN_THEME.fontLabel,
      '--bakudan-font-display': BAKUDAN_THEME.fontDisplay,
    })) {
      container.style.setProperty(k, v as string);
    }

    container.classList.add('bakudan-help-overlay');
    container.hidden = true;
    container.setAttribute('aria-hidden', 'true');
    // Overlay semantics are handled by the inner dialog; container is presentation
    container.setAttribute('role', 'presentation');

    // Dialog — the actual accessible modal
    this.dialog = document.createElement('div');
    this.dialog.className = 'bakudan-help__dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.tabIndex = -1;

    const lang = opts.language ?? 'en';
    const header = document.createElement('div');
    header.className = 'bakudan-help__header';

    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.flexDirection = 'column';
    titleWrap.style.gap = '2px';
    titleWrap.style.minWidth = '0';

    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'bakudan-help__title';
    this.titleEl.id = 'bakudan-help-title';
    this.titleEl.textContent = opts.title ?? helpTitleFor(lang);
    this.dialog.setAttribute('aria-labelledby', this.titleEl.id);

    const subtitle = document.createElement('p');
    subtitle.className = 'bakudan-help__subtitle';
    subtitle.textContent = helpSubtitleFor(lang);

    titleWrap.append(this.titleEl, subtitle);
    header.append(titleWrap);

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'bakudan-help__close';
    this.closeButton.textContent = '×';
    this.closeButton.setAttribute('aria-label', 'Close help');
    this.closeButton.setAttribute('data-testid', 'help-close');
    this.closeButton.addEventListener('click', this.handleClose);
    header.append(this.closeButton);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'bakudan-help__body';
    this.buildSections();

    const footer = document.createElement('div');
    footer.className = 'bakudan-help__footer';
    const hint = document.createElement('p');
    hint.className = 'bakudan-help__hint';
    hint.textContent =
      lang === 'zh-CN'
        ? '提示：按 ? 打开帮助，按 Escape 关闭'
        : lang === 'zh-TW'
          ? '提示：按 ? 開啟說明，按 Escape 關閉'
          : lang === 'ja'
            ? 'ヒント：? でヘルプを開く、Escape で閉じる'
            : lang === 'ko'
              ? '힌트: ? 로 도움말 열기, Escape 로 닫기'
              : 'Tip: press ? to open help • Esc to close • icons have tooltips';
    footer.append(hint);

    this.dialog.append(header, this.bodyEl, footer);
    container.replaceChildren(this.dialog);

    // Overlay click closes (only when clicking the backdrop itself)
    container.addEventListener('click', this.handleOverlayClick);
  }

  private buildSections(): void {
    this.bodyEl.replaceChildren();
    for (const section of HELP_SECTIONS) {
      const sec = document.createElement('section');
      sec.className = 'bakudan-help__section';

      const title = document.createElement('h3');
      title.className = 'bakudan-help__section-title';
      title.textContent = section.title;
      sec.append(title);

      const table = document.createElement('table');
      table.className = 'bakudan-help__table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const thKey = document.createElement('th');
      thKey.textContent = 'Key';
      const thDesc = document.createElement('th');
      thDesc.textContent = 'Action';
      headRow.append(thKey, thDesc);
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement('tbody');
      for (const row of section.bindings) {
        const tr = document.createElement('tr');
        const tdKey = document.createElement('td');
        tdKey.setAttribute('data-testid', 'help-key-cell');
        // Render each key as <kbd>, joined by separator
        row.keys.forEach((k, idx) => {
          if (idx > 0) {
            const sep = document.createElement('span');
            sep.className = 'bakudan-help__sep';
            sep.textContent = '/';
            sep.setAttribute('aria-hidden', 'true');
            tdKey.append(sep);
          }
          const kbd = document.createElement('kbd');
          kbd.className = 'bakudan-help__kbd';
          kbd.textContent = k;
          tdKey.append(kbd);
        });
        const tdDesc = document.createElement('td');
        tdDesc.textContent = row.description;
        tdDesc.setAttribute('data-testid', 'help-desc-cell');
        tr.append(tdKey, tdDesc);
        tbody.append(tr);
      }
      table.append(tbody);
      sec.append(table);
      this.bodyEl.append(sec);
    }
  }

  private readonly handleClose = (): void => {
    this.opts.onClose();
  };

  private readonly handleOverlayClick = (e: MouseEvent): void => {
    if (e.target === this.element) this.opts.onClose();
  };

  private installFocusTrap(): void {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (e: KeyboardEvent): void => {
      if (this.destroyed || !this.openState) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.opts.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = [...this.dialog.querySelectorAll<HTMLElement>(selector)].filter(
        (el) =>
          el.offsetParent !== null || el === document.activeElement || el === this.closeButton,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    this.dialog.addEventListener('keydown', onKeyDown);
    this.trapCleanup = () => this.dialog.removeEventListener('keydown', onKeyDown);
    // Also listen on overlay for Escape when focus is outside dialog but inside overlay
    const onOverlayKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.openState && !this.destroyed) {
        e.preventDefault();
        e.stopPropagation();
        this.opts.onClose();
      }
    };
    this.element.addEventListener('keydown', onOverlayKeyDown);
    const prevTrap = this.trapCleanup;
    this.trapCleanup = () => {
      prevTrap();
      this.element.removeEventListener('keydown', onOverlayKeyDown);
    };
  }

  private removeFocusTrap(): void {
    if (this.trapCleanup) {
      this.trapCleanup();
      this.trapCleanup = null;
    }
  }

  open(): void {
    if (this.destroyed || this.openState) return;
    this.openState = true;
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.element.hidden = false;
    this.element.setAttribute('aria-hidden', 'false');
    this.element.classList.add('bakudan-help-overlay--open');
    this.installFocusTrap();
    // Focus the close button so Esc and Tab are immediately available
    // and so screen readers announce the dialog title via aria-labelledby.
    this.closeButton.focus();
    // Fallback: if close button is not focusable (hidden), focus the dialog
    if (document.activeElement !== this.closeButton) this.dialog.focus();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.classList.remove('bakudan-help-overlay--open');
    this.removeFocusTrap();
    // Restore focus to the element that triggered the modal, if still in DOM
    const prev = this.previousFocus;
    this.previousFocus = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      // Defer one microtask so the closing animation/hidden does not steal focus
      queueMicrotask(() => {
        try {
          prev.focus({ preventScroll: true } as FocusOptions);
        } catch {
          prev.focus();
        }
      });
    }
  }

  get isOpen(): boolean {
    return this.openState;
  }

  setLanguage(lang: Language): void {
    this.titleEl.textContent = helpTitleFor(lang);
    // Rebuild subtitle/hint: simplest re-read from DOM? Rebuild body not needed — titles are static English, so only header matters
    const subtitle = this.dialog.querySelector('.bakudan-help__subtitle') as HTMLElement | null;
    if (subtitle) subtitle.textContent = helpSubtitleFor(lang);
    const hint = this.dialog.querySelector('.bakudan-help__hint') as HTMLElement | null;
    if (hint) {
      hint.textContent =
        lang === 'zh-CN'
          ? '提示：按 ? 打开帮助，按 Escape 关闭'
          : lang === 'zh-TW'
            ? '提示：按 ? 開啟說明，按 Escape 關閉'
            : lang === 'ja'
              ? 'ヒント：? でヘルプを開く、Escape で閉じる'
              : lang === 'ko'
                ? '힌트: ? 로 도움말 열기, Escape 로 닫기'
                : 'Tip: press ? to open help • Esc to close • icons have tooltips';
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeFocusTrap();
    this.closeButton.removeEventListener('click', this.handleClose);
    this.element.removeEventListener('click', this.handleOverlayClick);
    this.element.replaceChildren();
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.classList.remove('bakudan-help-overlay', 'bakudan-help-overlay--open');
    this.openState = false;
  }
}
