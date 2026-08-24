import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Scene } from '@vectojs/core';
import { StageBackground } from '../src/view/StageBackground';
import { App } from '../src/view/App';
import {
  applyShortcut,
  decodeShortcut,
  installKeyboardShortcuts,
  ownsKeyboard,
} from '../src/view/KeyboardShortcuts';
import type { ShortcutIntent, ShortcutTarget } from '../src/view/KeyboardShortcuts';

function key(k: string, mods: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>> = {}) {
  return {
    key: k,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
  };
}

describe('decodeShortcut', () => {
  it('maps the transport keys a media player is expected to honour', () => {
    expect(decodeShortcut(key(' '))).toEqual({ kind: 'togglePlayback' });
    expect(decodeShortcut(key('k'))).toEqual({ kind: 'togglePlayback' });
    expect(decodeShortcut(key('K'))).toEqual({ kind: 'togglePlayback' });

    expect(decodeShortcut(key('ArrowLeft'))).toEqual({
      kind: 'seekBy',
      seconds: -5,
    });
    expect(decodeShortcut(key('ArrowRight'))).toEqual({
      kind: 'seekBy',
      seconds: 5,
    });
    expect(decodeShortcut(key('j'))).toEqual({ kind: 'seekBy', seconds: -10 });
    expect(decodeShortcut(key('l'))).toEqual({ kind: 'seekBy', seconds: 10 });

    expect(decodeShortcut(key('Home'))).toEqual({
      kind: 'seekToEdge',
      edge: 'start',
    });
    expect(decodeShortcut(key('End'))).toEqual({
      kind: 'seekToEdge',
      edge: 'end',
    });
    expect(decodeShortcut(key('f'))).toEqual({ kind: 'toggleFullscreen' });
    expect(decodeShortcut(key('F'))).toEqual({ kind: 'toggleFullscreen' });
    expect(decodeShortcut(key('Escape'))).toEqual({ kind: 'dismiss' });
  });

  it('maps digits to timeline fractions', () => {
    expect(decodeShortcut(key('0'))).toEqual({
      kind: 'seekToFraction',
      fraction: 0,
    });
    expect(decodeShortcut(key('5'))).toEqual({
      kind: 'seekToFraction',
      fraction: 0.5,
    });
    expect(decodeShortcut(key('9'))).toEqual({
      kind: 'seekToFraction',
      fraction: 0.9,
    });
  });

  it('ignores modified chords so browser and OS shortcuts keep working', () => {
    // Cmd/Ctrl+R must reload the page, not seek it.
    expect(decodeShortcut(key('r', { meta: true }))).toBeNull();
    expect(decodeShortcut(key(' ', { ctrl: true }))).toBeNull();
    expect(decodeShortcut(key('ArrowRight', { meta: true }))).toBeNull();
    expect(decodeShortcut(key('l', { alt: true }))).toBeNull();
    expect(decodeShortcut(key('5', { shift: true }))).toBeNull();
    expect(decodeShortcut(key('f', { meta: true }))).toBeNull();
  });

  it('leaves unbound keys alone', () => {
    expect(decodeShortcut(key('q'))).toBeNull();
    expect(decodeShortcut(key('Tab'))).toBeNull();
    expect(decodeShortcut(key('Enter'))).toBeNull();
    expect(decodeShortcut(key('F5'))).toBeNull();
  });
});

describe('ownsKeyboard', () => {
  it('yields to text entry, which is the case that actually breaks', () => {
    // The danmaku composer is a real projected <input>. Typing a space there
    // must insert a space, not pause the video.
    expect(ownsKeyboard(document.createElement('input'))).toBe(true);
    expect(ownsKeyboard(document.createElement('textarea'))).toBe(true);
    expect(ownsKeyboard(document.createElement('select'))).toBe(true);
  });

  it('yields to every role core treats as interactive', () => {
    // Mirrors core's INTERACTIVE_A11Y_ROLES: a focused Slider must keep its
    // Arrow keys and a focused Dropdown its Escape.
    for (const role of ['button', 'slider', 'combobox', 'checkbox', 'tab', 'option']) {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      expect(ownsKeyboard(el)).toBe(true);
    }
  });

  it('does not yield to non-interactive elements or to nothing focused', () => {
    expect(ownsKeyboard(null)).toBe(false);
    expect(ownsKeyboard(document.createElement('div'))).toBe(false);
    expect(ownsKeyboard(document.createElement('canvas'))).toBe(false);
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    expect(ownsKeyboard(status)).toBe(false);
  });
});

function recordingTarget(enabled = true) {
  const calls: string[] = [];
  const target: ShortcutTarget = {
    playbackShortcutsEnabled: enabled,
    togglePlayback: () => void calls.push('togglePlayback'),
    seekBy: (s) => void calls.push(`seekBy:${s}`),
    seekToFraction: (f) => void calls.push(`seekToFraction:${f}`),
    seekToEdge: (e) => void calls.push(`seekToEdge:${e}`),
    toggleFullscreen: () => void calls.push('toggleFullscreen'),
    dismiss: () => {
      calls.push('dismiss');
      return true;
    },
  };
  return { target, calls };
}

describe('applyShortcut', () => {
  it('routes each intent to its operation', () => {
    const cases: Array<[ShortcutIntent, string]> = [
      [{ kind: 'togglePlayback' }, 'togglePlayback'],
      [{ kind: 'seekBy', seconds: -5 }, 'seekBy:-5'],
      [{ kind: 'seekToFraction', fraction: 0.3 }, 'seekToFraction:0.3'],
      [{ kind: 'seekToEdge', edge: 'end' }, 'seekToEdge:end'],
      [{ kind: 'toggleFullscreen' }, 'toggleFullscreen'],
      [{ kind: 'dismiss' }, 'dismiss'],
    ];
    for (const [intent, expected] of cases) {
      const { target, calls } = recordingTarget();
      expect(applyShortcut(intent, target)).toBe(true);
      expect(calls).toEqual([expected]);
    }
  });

  it('does not consume playback keys while playback is unavailable', () => {
    const { target, calls } = recordingTarget(false);
    expect(applyShortcut({ kind: 'togglePlayback' }, target)).toBe(false);
    expect(applyShortcut({ kind: 'seekBy', seconds: 5 }, target)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('still dismisses while playback is unavailable', () => {
    // Escape closing a panel has nothing to do with whether a video is loaded.
    const { target, calls } = recordingTarget(false);
    expect(applyShortcut({ kind: 'dismiss' }, target)).toBe(true);
    expect(calls).toEqual(['dismiss']);
  });

  it('still toggles fullscreen while playback is unavailable', () => {
    // Fullscreen is a shell concern: it must work in stress mode and before a
    // video loads, exactly like Escape.
    const { target, calls } = recordingTarget(false);
    expect(applyShortcut({ kind: 'toggleFullscreen' }, target)).toBe(true);
    expect(calls).toEqual(['toggleFullscreen']);
  });

  it('reports an unconsumed dismiss so the key stays available', () => {
    const target: ShortcutTarget = {
      ...recordingTarget().target,
      dismiss: () => false,
    };
    expect(applyShortcut({ kind: 'dismiss' }, target)).toBe(false);
  });
});

describe('installKeyboardShortcuts', () => {
  const disposers: Array<() => void> = [];

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    document.body.replaceChildren();
  });

  function install(enabled = true) {
    const { target, calls } = recordingTarget(enabled);
    const dispose = installKeyboardShortcuts(target);
    disposers.push(dispose);
    return { calls, dispose };
  }

  function press(k: string, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', {
      key: k,
      cancelable: true,
      ...init,
    });
    window.dispatchEvent(event);
    return event;
  }

  it('acts on a bound key and prevents the default', () => {
    const { calls } = install();
    // Space would otherwise scroll the page as well as toggling playback.
    expect(press(' ').defaultPrevented).toBe(true);
    expect(calls).toEqual(['togglePlayback']);
  });

  it('leaves an unbound key untouched', () => {
    const { calls } = install();
    expect(press('q').defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('stands down while a text field has focus', () => {
    const { calls } = install();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    expect(press(' ').defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('stands down while a focused control owns the key', () => {
    const { calls } = install();
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');
    slider.tabIndex = 0;
    document.body.appendChild(slider);
    slider.focus();

    expect(press('ArrowRight').defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('respects an event a listener registered earlier already handled', () => {
    // Ordering matters: a listener added before the layer sees the key first,
    // and the layer must then stand down. A listener added after cannot help.
    const consumer = (e: KeyboardEvent): void => e.preventDefault();
    window.addEventListener('keydown', consumer);
    try {
      const { calls } = install();
      press(' ');
      expect(calls).toEqual([]);
    } finally {
      window.removeEventListener('keydown', consumer);
    }
  });

  it('does not prevent the default when the intent could not act', () => {
    const { calls } = install(false);
    expect(press(' ').defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('stops listening once disposed', () => {
    const { calls, dispose } = install();
    dispose();
    press(' ');
    expect(calls).toEqual([]);
  });
});

interface AppFixture {
  app: App;
  scene: Scene;
  host: HTMLElement;
  background: StageBackground;
  /** Videos created so far. videoFactory runs on setVideo, not construction. */
  videos: HTMLVideoElement[];
}

const appFixtures: AppFixture[] = [];

/** A ready, paused, 100s video so seek arithmetic has a real duration. */
function appFixture(duration = 100): AppFixture {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 1440 },
    innerHeight: { configurable: true, value: 900 },
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1440;
  canvas.height = 900;
  document.body.appendChild(canvas);
  const host = document.createElement('div');
  document.body.appendChild(host);

  const videos: HTMLVideoElement[] = [];
  const background = new StageBackground({
    host,
    videoFactory: () => {
      const element = document.createElement('video');
      Object.defineProperty(element, 'duration', {
        configurable: true,
        value: duration,
      });
      Object.defineProperty(element, 'readyState', {
        configurable: true,
        value: 1,
      });
      Object.defineProperty(element, 'pause', {
        configurable: true,
        value: mock(() => {}),
      });
      Object.defineProperty(element, 'load', {
        configurable: true,
        value: mock(() => {}),
      });
      videos.push(element);
      return element;
    },
  });

  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 1,
    disableWindowResize: true,
  });
  const app = new App(scene, { stageBackground: background });
  app.onResize(1440, 900);

  const fixture = { app, scene, host, background, videos };
  appFixtures.push(fixture);
  return fixture;
}

describe('App shortcut operations', () => {
  afterEach(() => {
    for (const { app, scene, host } of appFixtures.splice(0)) {
      app.destroy();
      scene.destroy();
      host.remove();
    }
    document.body.replaceChildren();
  });

  it('clamps the time it hands downstream, keeping video and track in step', async () => {
    // StageBackground.seek clamps for the <video> element (StageBackground.ts:186),
    // but _onSeek passes the same value to DanmakuTrack.seek, which stores it
    // unclamped (danmaku-core seek() sets _lastTime = t). An overshoot would
    // leave the track's notion of "now" past the video's, so App must clamp
    // before either sees it. Spying on background.seek observes exactly the
    // value App chose, independent of downstream clamping.
    const { app, background, videos } = appFixture(100);
    const ready = background.setVideo('https://example.test/clip.mp4');
    videos[0]!.dispatchEvent(new Event('loadedmetadata'));
    await ready;

    background.seek(50);
    const seen: number[] = [];
    const real = background.seek.bind(background);
    background.seek = (t: number): void => {
      seen.push(t);
      real(t);
    };

    app.seekBy(-80); // 50 - 80 = -30, must arrive as 0
    app.seekToEdge('end');
    app.seekBy(30); // 100 + 30 = 130, must arrive as 100

    expect(seen).toEqual([0, 100, 100]);
  });

  it('seeks to the requested fraction of the duration', async () => {
    const { app, background, videos } = appFixture(100);
    const ready = background.setVideo('https://example.test/clip.mp4');
    videos[0]!.dispatchEvent(new Event('loadedmetadata'));
    await ready;

    app.seekToFraction(0.25);
    expect(background.currentTime).toBe(25);
    app.seekToFraction(0);
    expect(background.currentTime).toBe(0);
  });

  it('does not seek at all before a duration is known', () => {
    // mode is 'video' but no source has loaded, so duration is 0/NaN. Seeking
    // to NaN would poison DanmakuTrack._lastTime, and every later comparison
    // against NaN is false, so the track would stop firing entirely.
    const { app, background } = appFixture();
    const seen: number[] = [];
    background.seek = (t: number): void => void seen.push(t);

    app.seekBy(10);
    app.seekToFraction(0.5);
    app.seekToEdge('end');

    expect(seen).toEqual([]);
  });

  it('reports playback shortcuts as unavailable until a video is ready', async () => {
    const { app, background, videos } = appFixture();
    expect(app.playbackShortcutsEnabled).toBe(false);

    const ready = background.setVideo('https://example.test/clip.mp4');
    videos[0]!.dispatchEvent(new Event('loadedmetadata'));
    await ready;
    expect(app.playbackShortcutsEnabled).toBe(true);
  });

  it('dismisses the lab drawer and reports whether anything was dismissed', () => {
    const { app } = appFixture();
    expect(app.dismiss()).toBe(false);

    app.setLabOpen(true);
    expect(app.dismiss()).toBe(true);
    expect(app.getViewSnapshot().labOpen).toBe(false);
    expect(app.dismiss()).toBe(false);
  });

  it('toggles document fullscreen, tracking change events and announcing errors', () => {
    // happy-dom ships no Fullscreen API at all, which doubles as the
    // "unsupported platform" case: the first assertion set exercises the
    // unavailable path, then the test installs stand-ins for a supporting
    // browser and drives request -> fullscreenchange -> exit.
    const { app } = appFixture();
    app.start(); // Listeners are installed by start(), like the shortcut layer.
    const summaries: string[] = [];
    (app as unknown as { announcer: { setSummary(s: string): void } }).announcer = {
      setSummary: (summary) => void summaries.push(summary),
    };
    expect(app.isFullscreen).toBe(false);

    // Unsupported API (nothing patched yet): the toggle announces failure
    // immediately instead of pretending a request was made.
    app.toggleFullscreen();
    expect(app.isFullscreen).toBe(false);
    expect(summaries.at(-1)).toContain('unavailable');

    // Now simulate a supporting browser.
    const request = mock(() => Promise.resolve());
    const exit = mock(() => Promise.resolve());
    Object.defineProperties(document.documentElement, {
      requestFullscreen: { configurable: true, value: request },
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exit,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
    const enterFullscreen = (): void => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: document.documentElement,
      });
    };
    const leaveFullscreen = (): void => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: null,
      });
    };
    try {
      app.toggleFullscreen();
      expect(request).toHaveBeenCalledTimes(1);

      enterFullscreen();
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(app.isFullscreen).toBe(true);
      expect(summaries.at(-1)).toContain('Entered');

      // While fullscreen, a toggle exits rather than requesting again.
      app.toggleFullscreen();
      expect(exit).toHaveBeenCalledTimes(1);

      leaveFullscreen();
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(app.isFullscreen).toBe(false);
      expect(summaries.at(-1)).toContain('Exited');
    } finally {
      leaveFullscreen();
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
      delete (document as unknown as Record<string, unknown>).exitFullscreen;
      delete (document as unknown as Record<string, unknown>).fullscreenElement;
    }
  });

  it('announces a fullscreenerror and re-syncs state from the document', () => {
    const { app } = appFixture();
    app.start();
    const summaries: string[] = [];
    (app as unknown as { announcer: { setSummary(s: string): void } }).announcer = {
      setSummary: (summary) => void summaries.push(summary),
    };

    document.dispatchEvent(new Event('fullscreenerror'));
    expect(app.isFullscreen).toBe(false);
    expect(summaries.at(-1)).toContain('unavailable');
  });
});
