/**
 * Global keyboard shortcut layer.
 *
 * ## Why this listens on the window rather than on an Entity
 *
 * `@vectojs/core` dispatches `keydown` only to the Entity whose projected a11y
 * element currently has DOM focus (`Scene.ts:3787`). That is exactly right for
 * per-control keys — a focused `Slider` owning Arrow keys, a focused `Dropdown`
 * owning Escape — but it cannot express an *application* shortcut, which by
 * definition must fire when nothing in particular is focused. There is no
 * scene-level key dispatch in core today, so the only place a global shortcut
 * can be observed is the window.
 *
 * The paradigm cost is contained deliberately: this module never reads layout
 * from the DOM, never queries for elements, and never styles anything. It reads
 * one fact the engine does not expose (which element owns the keyboard) and
 * translates key presses into intents. All resulting state changes go through
 * `App`'s public methods, so behaviour stays testable without a browser.
 */

/** A single decoded user intent. Pure data — no side effects, no DOM. */
export type ShortcutIntent =
  | { kind: 'togglePlayback' }
  | { kind: 'seekBy'; seconds: number }
  | { kind: 'seekToFraction'; fraction: number }
  | { kind: 'seekToEdge'; edge: 'start' | 'end' }
  | { kind: 'dismiss' };

/** The subset of a keyboard event this layer decides from. */
export interface ShortcutKeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Decode a key press into an intent, or `null` to let it through untouched.
 *
 * Bindings follow the conventions a media player is expected to honour, so they
 * need no discovery: Space/`k` toggle, `j`/`l` and arrows seek, `0`–`9` jump to
 * a percentage, Home/End to the edges, Escape dismisses.
 *
 * Any chord carrying a modifier is ignored so browser and OS shortcuts keep
 * working — Cmd/Ctrl+R must reload, not seek. Shift is exempted from that rule
 * only where it is not a chord but a magnitude (`Shift` is never required by a
 * binding here, so it too is rejected, keeping the rule simple and total).
 */
export function decodeShortcut(e: ShortcutKeyInput): ShortcutIntent | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;

  switch (e.key) {
    case ' ':
    case 'Spacebar': // Legacy name, still emitted by some IME/mobile stacks.
    case 'k':
    case 'K':
      return { kind: 'togglePlayback' };

    case 'ArrowLeft':
      return { kind: 'seekBy', seconds: -5 };
    case 'ArrowRight':
      return { kind: 'seekBy', seconds: 5 };
    case 'j':
    case 'J':
      return { kind: 'seekBy', seconds: -10 };
    case 'l':
    case 'L':
      return { kind: 'seekBy', seconds: 10 };

    case 'Home':
      return { kind: 'seekToEdge', edge: 'start' };
    case 'End':
      return { kind: 'seekToEdge', edge: 'end' };

    case 'Escape':
      return { kind: 'dismiss' };

    default:
      break;
  }

  // 0-9 jump to that tenth of the timeline, matching every mainstream player.
  if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
    return {
      kind: 'seekToFraction',
      fraction: (e.key.charCodeAt(0) - 48) / 10,
    };
  }

  return null;
}

/**
 * Roles whose projected element owns the keyboard while focused.
 *
 * Mirrors core's own `INTERACTIVE_A11Y_ROLES` (`index.mjs:1324`). A focused
 * `Slider` must keep its Arrow keys and a focused `Dropdown` its Escape, so a
 * global shortcut must stand down for these.
 */
const KEYBOARD_OWNING_ROLES: ReadonlySet<string> = new Set([
  'button',
  'switch',
  'checkbox',
  'radio',
  'link',
  'tab',
  'menuitem',
  'slider',
  'combobox',
  'option',
  'listbox',
  'textbox',
  'searchbox',
  'spinbutton',
]);

/**
 * True when `el` is a control that should consume the key itself.
 *
 * Text entry is the case that matters most: the danmaku composer is a real
 * projected `<input>`, and typing a space in it must insert a space rather than
 * pause the video.
 */
export function ownsKeyboard(el: Element | null): boolean {
  if (!el) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;

  if (el instanceof HTMLElement && el.isContentEditable) return true;

  const role = el.getAttribute('role');
  if (role && KEYBOARD_OWNING_ROLES.has(role)) return true;

  return false;
}

/** Side-effecting operations a decoded intent needs. Implemented by `App`. */
export interface ShortcutTarget {
  /** Whether playback shortcuts currently apply (video mode, loaded, ready). */
  readonly playbackShortcutsEnabled: boolean;
  togglePlayback(): void;
  seekBy(seconds: number): void;
  seekToFraction(fraction: number): void;
  seekToEdge(edge: 'start' | 'end'): void;
  /** Returns true when something was actually dismissed. */
  dismiss(): boolean;
}

/**
 * Apply an intent to a target.
 *
 * Returns true when the intent was consumed, which the caller turns into
 * `preventDefault()` — so Space does not additionally scroll the page. An
 * intent that could not act (seeking with no video loaded) is *not* consumed,
 * leaving default behaviour intact rather than silently swallowing the key.
 */
export function applyShortcut(intent: ShortcutIntent, target: ShortcutTarget): boolean {
  if (intent.kind === 'dismiss') return target.dismiss();

  if (!target.playbackShortcutsEnabled) return false;

  switch (intent.kind) {
    case 'togglePlayback':
      target.togglePlayback();
      return true;
    case 'seekBy':
      target.seekBy(intent.seconds);
      return true;
    case 'seekToFraction':
      target.seekToFraction(intent.fraction);
      return true;
    case 'seekToEdge':
      target.seekToEdge(intent.edge);
      return true;
  }
}

/**
 * Install the shortcut layer on `window`.
 *
 * Returns a disposer; call it from the owner's `destroy()` so a re-mounted app
 * does not accumulate listeners.
 */
export function installKeyboardShortcuts(target: ShortcutTarget): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    if (ownsKeyboard(document.activeElement)) return;

    const intent = decodeShortcut(e);
    if (!intent) return;

    if (applyShortcut(intent, target)) e.preventDefault();
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
