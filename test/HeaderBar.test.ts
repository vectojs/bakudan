import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { HeaderBar, type StatusState } from '../src/view/html/HeaderBar';
import { cinemaLabelsFor } from '../src/view/cinemaConfig';

function makeState(overrides: Partial<StatusState> = {}): StatusState {
  return {
    kind: 'video',
    videoTitle: 'Flower Seek Loop',
    trackProfileLabel: 'Natural Peaks',
    fps: 60,
    frameTime: 16.6,
    liveCount: 123,
    capacity: 5000,
    backend: 'webgl',
    language: 'en',
    ...overrides,
  };
}

describe('HeaderBar HTML header (CTX-0027)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('header');
    container.id = 'bakudan-header';
    document.body.appendChild(container);
  });

  afterEach(() => {
    // HeaderBar.destroy removes inner root; ensure clean DOM for next test
    container.remove();
    document.body.replaceChildren();
  });

  it('renders statusKind into pill text, class and a11y attributes', () => {
    const bar = new HeaderBar(container, { getState: () => makeState() });

    // All statusKinds are exercised against cinemaLabelsFor localization
    const kinds: Array<StatusState['kind']> = ['loading', 'error', 'stress', 'paused', 'video'];
    for (const kind of kinds) {
      bar.update(makeState({ kind, language: 'en' }));
      const pill = container.querySelector('.bakudan-header__pill') as HTMLElement | null;
      expect(pill).not.toBeNull();
      const expectedLabel = cinemaLabelsFor('en').kit.status[kind];
      expect(pill!.textContent).toBe(expectedLabel);
      expect(pill!.classList.contains(`bakudan-header__pill--${kind}`)).toBe(true);
      expect(pill!.dataset.kind).toBe(kind);
      expect(pill!.getAttribute('role')).toBe('status');
      expect(pill!.getAttribute('aria-live')).toBe('polite');
      expect(pill!.getAttribute('aria-label')).toBe(expectedLabel);
    }

    // Localized product wordmark stays in sync with language
    bar.update(makeState({ kind: 'video', language: 'zh-CN' }));
    const wordmark = container.querySelector('.bakudan-header__wordmark') as HTMLElement;
    expect(wordmark.textContent).toBe(cinemaLabelsFor('zh-CN').kit.product);

    bar.destroy();
    // Destroy removes the inner root but leaves container for reuse
    expect(container.querySelector('.bakudan-header')).toBeNull();
  });

  it('updates fps poll text and keeps a11y frames-per-second label', () => {
    const bar = new HeaderBar(container, {
      getState: () => makeState({ fps: 60 }),
    });

    bar.update(makeState({ fps: 60, frameTime: 16.6 }));
    const fpsEl = container.querySelector('.bakudan-header__metric--fps') as HTMLElement | null;
    expect(fpsEl).not.toBeNull();
    expect(fpsEl!.textContent).toContain('60');
    expect(fpsEl!.getAttribute('aria-label')).toBe('60 frames per second');

    // Simulate poll tick: fps climbs, frameTime shifts, live count grows
    bar.update(makeState({ fps: 144, frameTime: 6.9, liveCount: 4321, capacity: 5000 }));
    expect(fpsEl!.textContent).toContain('144');
    expect(fpsEl!.getAttribute('aria-label')).toBe('144 frames per second');

    const frameEl = container.querySelector('.bakudan-header__metric--frame') as HTMLElement | null;
    expect(frameEl).not.toBeNull();
    expect(frameEl!.textContent).toBe('6.9 ms');

    const liveEl = container.querySelector('.bakudan-header__metric--live') as HTMLElement | null;
    expect(liveEl).not.toBeNull();
    // activeSummary is locale-aware; check it contains both numbers
    expect(liveEl!.textContent).toContain('4,321');
    expect(liveEl!.getAttribute('aria-label')).toContain('live');

    bar.destroy();
  });
});
