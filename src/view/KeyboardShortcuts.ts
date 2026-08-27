/**
 * Global keyboard shortcut layer.
 *
 * ## Why this rides the scene keyboard channel (core >= 1.39.0)
 *
 * Application shortcuts must fire when nothing in particular is focused, and
 * `@vectojs/core` dispatched `keydown` only to the Entity whose projected a11y
 * element held DOM focus — so this layer originally hung a listener on
 * `window` and carried its own copy of core's keyboard-ownership rules. Core
 * 1.39.0 shipped the scene-level channel (`scene.on/off('keydown')`) with
 * exactly the suppression the workaround had to reimplement: native
 * `defaultPrevented`, key auto-repeat, and `ownsKeyboard(document.activeElement)`
 * (text-entry tags, contentEditable, interactive roles) all gate dispatch
 * inside the Scene before any handler runs. This module now registers on that
 * channel and owns only what is app policy: decoding keys into intents and
 * deciding whether an intent consumed the key.
 *
 * The paradigm cost stays contained: no DOM layout reads, no element queries,
 * no styling. All resulting state changes go through `App`'s public methods,
 * so behaviour stays testable without a browser (the install seam accepts any
 * `{ on, off }` pair).
 */

import type { SceneKeyEvent } from '@vectojs/core';

/** A single decoded user intent. Pure data — no side effects, no DOM. */
export type ShortcutIntent =
  | { kind: 'togglePlayback' }
  | { kind: 'seekBy'; seconds: number }
  | { kind: 'seekToFraction'; fraction: number }
  | { kind: 'seekToEdge'; edge: 'start' | 'end' }
  | { kind: 'toggleFullscreen' }
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
 * a percentage, Home/End to the edges, `f` toggles fullscreen, Escape dismisses.
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

    case 'f':
    case 'F':
      return { kind: 'toggleFullscreen' };

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

/** Side-effecting operations a decoded intent needs. Implemented by `App`. */
export interface ShortcutTarget {
  /** Whether playback shortcuts currently apply (video mode, loaded, ready). */
  readonly playbackShortcutsEnabled: boolean;
  togglePlayback(): void;
  seekBy(seconds: number): void;
  seekToFraction(fraction: number): void;
  seekToEdge(edge: 'start' | 'end'): void;
  /** Enter or leave document fullscreen. Works with or without a video. */
  toggleFullscreen(): void;
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
  // Fullscreen is a shell concern, orthogonal to whether a video is loaded.
  if (intent.kind === 'toggleFullscreen') {
    target.toggleFullscreen();
    return true;
  }

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
 * The slice of `Scene` the shortcut layer needs. Structural rather than a hard
 * `Scene` reference so tests can drive handlers without a browser.
 */
export interface ShortcutEventSource {
  on(event: 'keydown', callback: (e: SceneKeyEvent) => void): unknown;
  off(event: 'keydown', callback: (e: SceneKeyEvent) => void): unknown;
}

/**
 * Install the shortcut layer on `source` (the Scene in production).
 *
 * Suppression of defaultPrevented / auto-repeat / keyboard-owning focus is the
 * scene channel's job — see the module docstring. Returns a disposer; call it
 * from the owner's `destroy()` so a re-mounted app does not accumulate
 * listeners.
 *
 * Hybrid shell fallback: Scene's channel rides a window bubble listener gated
 * by ownsKeyboard(activeElement). When the app boots with focus on <body>
 * (or the a11y focusSentinel) the scene channel still fires, but if HTML
 * chrome steals focus on load (e.g., an autofocus input or a LabDrawer
 * focus-trap) or if the canvas lost its tabIndex, keys would silently die.
 * This install also taps window directly for the body case so Space/k/j/l/
 * Home/End/f/Escape stay live even before the canvas is focused; the handler
 * is idempotent via defaultPrevented so a double-dispatch does not toggle
 * twice.
 */
export function installKeyboardShortcuts(
  source: ShortcutEventSource,
  target: ShortcutTarget,
): () => void {
  const onKeyDown = (e: SceneKeyEvent): void => {
    const intent = decodeShortcut(e);
    if (!intent) return;

    if (applyShortcut(intent, target)) e.preventDefault();
  };

  source.on('keydown', onKeyDown);

  // Window fallback for the hybrid shell when document.activeElement is body
  // (nothing HTML owns focus). Scene's own window listener already handles
  // this, but this layer ensures coverage if the canvas has not yet been
  // focused or if a previous ownsKeyboard-suppressed element was removed and
  // focus fell to body without a new handler dispatch.
  const onWindowKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.repeat) return;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !(active as Element).hasAttribute?.('data-vecto-a11y-root')
    ) {
      return;
    }
    const intent = decodeShortcut(e as unknown as ShortcutKeyInput);
    if (!intent) return;
    if (applyShortcut(intent, target)) e.preventDefault();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onWindowKeyDown);
  }

  return () => {
    source.off('keydown', onKeyDown);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  };
}
