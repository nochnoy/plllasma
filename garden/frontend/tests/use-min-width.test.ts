import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useMinWidth } from '../src/composables/useMinWidth';

/**
 * The one question the two bodies of the chat's field are swapped by (`ChatPanel.vue`): whether the
 * window is at least so wide. No window is under these tests — the media query is a fake with a
 * `matches` of its own and a way to turn it over, which is all the composable ever asks of it: the
 * answer read at the start, and the answer kept current while the caller lives.
 */

/** A media query as the composable sees it: a matches, a listener list, and a way to change. */
function fakeQuery(initial: boolean) {
  const hearers = new Set<(event: { matches: boolean }) => void>();
  return {
    matches: initial,
    addEventListener: (_: string, hear: (event: { matches: boolean }) => void) => hearers.add(hear),
    removeEventListener: (_: string, hear: (event: { matches: boolean }) => void) => hearers.delete(hear),
    say(matches: boolean) {
      this.matches = matches;
      for (const hear of hearers) hear({ matches });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMinWidth', () => {
  it('answers with what the query says at the moment it is asked', () => {
    const query = fakeQuery(true);
    vi.stubGlobal('window', { matchMedia: vi.fn(() => query) });
    const scope = effectScope();
    expect(scope.run(() => useMinWidth(785))?.value).toBe(true);
  });

  it('keeps the answer current while the caller lives, and stops when it does not', () => {
    const query = fakeQuery(false);
    vi.stubGlobal('window', { matchMedia: vi.fn(() => query) });
    const scope = effectScope();
    const wide = scope.run(() => useMinWidth(785));
    expect(wide?.value).toBe(false);
    query.say(true);
    expect(wide?.value).toBe(true);
    query.say(false);
    expect(wide?.value).toBe(false);
    // The caller is gone: the listening goes with it, so a later change is nobody's to read.
    scope.stop();
    query.say(true);
    expect(wide?.value).toBe(false);
  });

  it('asks for the line it was given, and only ever one query', () => {
    const query = fakeQuery(true);
    const matchMedia = vi.fn(() => query);
    vi.stubGlobal('window', { matchMedia });
    const scope = effectScope();
    scope.run(() => useMinWidth(785));
    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 785px)');
  });
});
