import { afterEach, describe, expect, it, mock } from 'bun:test';
import { CommandDeckHTML, type CommandDeckState } from '../src/view/html/CommandDeck';

function state(overrides: Partial<CommandDeckState> = {}): CommandDeckState {
  return {
    isPlaying: false,
    currentTime: 12.5,
    duration: 100,
    bufferedRanges: [{ start: 0, end: 40 }],
    rate: 1,
    pendingSendText: '',
    labOpen: false,
    disabled: false,
    ...overrides,
  };
}

describe('CommandDeckHTML', () => {
  let containers: HTMLElement[] = [];
  let decks: CommandDeckHTML[] = [];

  afterEach(() => {
    for (const deck of decks.splice(0)) deck.destroy();
    for (const c of containers.splice(0)) c.remove();
    document.body.replaceChildren();
  });

  function mount(optsOverrides: Partial<ConstructorParameters<typeof CommandDeckHTML>[1]> = {}): {
    container: HTMLElement;
    deck: CommandDeckHTML;
    opts: ConstructorParameters<typeof CommandDeckHTML>[1];
  } {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const opts = {
      onTogglePlayback: mock(() => {}),
      onSeek: mock(() => {}),
      onSeekDelta: mock(() => {}),
      onRateChange: mock(() => {}),
      onSend: mock(() => {}),
      onLabToggle: mock(() => {}),
      getState: () => state(),
      ...optsOverrides,
    } as unknown as ConstructorParameters<typeof CommandDeckHTML>[1];
    const deck = new CommandDeckHTML(container, opts);
    decks.push(deck);
    return { container, deck, opts };
  }

  it('play/pause toggle updates button aria-pressed', () => {
    const { deck, container } = mount();
    const playButton = container.querySelector('.bakudan-command__play') as HTMLButtonElement;
    expect(playButton).toBeTruthy();
    expect(playButton.getAttribute('aria-pressed')).toBe('false');
    expect(playButton.textContent).toBe('Play');

    deck.update(state({ isPlaying: true }));
    expect(playButton.getAttribute('aria-pressed')).toBe('true');
    expect(playButton.textContent).toBe('Pause');
    expect(playButton.getAttribute('aria-label')).toBe('Pause');

    deck.update(state({ isPlaying: false }));
    expect(playButton.getAttribute('aria-pressed')).toBe('false');
    expect(playButton.textContent).toBe('Play');
  });

  it('timeline seek calls onSeek with correct time', () => {
    const onSeek = mock(() => {});
    const { container } = mount({ onSeek } as never);
    const timeline = container.querySelector('.bakudan-command__timeline') as HTMLInputElement;
    expect(timeline).toBeTruthy();
    expect(timeline.getAttribute('role')).toBe('slider');
    expect(timeline.getAttribute('aria-valuenow')).toBe('12.5');

    // Simulate user dragging the native range
    timeline.value = '42.7';
    timeline.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0]![0]).toBeCloseTo(42.7, 5);

    // Second seek
    timeline.value = '0';
    timeline.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSeek).toHaveBeenCalledTimes(2);
    expect(onSeek.mock.calls[1]![0]).toBeCloseTo(0, 5);
  });
});
