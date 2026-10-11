import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useMusic, type MusicTrack } from '../src/composables/useMusic';
import type { TapeReport } from '../src/game/game';

/**
 * What the garden's music is asked, and when (`useMusic`): one track, the stage's own, begun with
 * the run — the first touch of a doll — and never again in a session, and ended by every move
 * between the garden's screens, hushing whatever is sounding over two seconds and stopping it
 * there.
 *
 * No browser is under these tests: the track is a fake that remembers every asking (`makeTrack`)
 * and the clock is the test's own (`now`), so what is checked is the rules alone — that nothing
 * sounds before the run begins, that the music is asked for once and never twice, that a tape on
 * the timeline keeps it silent, and that a move is a fall and then a stop. That nothing loops is
 * the asking itself: the fake is never played twice, and the page's own track is made with `loop`
 * off for good.
 *
 * The console is where a music that could not sound says so, and one test below makes it say: it
 * is watched, so that a run of these is quiet.
 */
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const garden of gardens) garden.stop();
  gardens.length = 0;
});

/** Every garden these tests have opened, torn down with the test that opened it. */
const gardens: { stop: () => void }[] = [];

/** A fake track: every asking remembered, sound in the test's own hands. */
class FakeTrack implements MusicTrack {
  asked = 0;
  sounding = false;
  volume = 1;

  get paused(): boolean {
    return !this.sounding;
  }

  play(): Promise<void> {
    this.asked++;
    this.sounding = true;
    return Promise.resolve();
  }

  pause(): void {
    this.sounding = false;
  }
}

/**
 * A garden of the test's own: its location, its tape's reports, and the fake the page is told is
 * its music.
 */
function theGarden() {
  const location = ref<1 | 2 | 3 | 4>(1);
  const tape = ref<TapeReport>({
    recording: false,
    playing: false,
    loaded: false,
    step: 0,
    steps: 0,
    seeking: false,
    seed: 0,
    bytes: 0,
  });
  const scene = new FakeTrack();
  let clock = 0;
  const scope = effectScope();
  scope.run(() =>
    useMusic(location, tape, {
      makeTrack: () => scene,
      now: () => clock,
    }),
  );
  const garden = {
    location,
    scene,
    /** What the engine would push: a report with these words said over the last one. */
    report(over: Partial<TapeReport>): void {
      tape.value = { ...tape.value, ...over };
    },
    /** Moves the clock and the fake timers together, as one page moves them. */
    pass(ms: number): void {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    stop: () => scope.stop(),
  };
  gardens.push(garden);
  return garden;
}

describe('useMusic', () => {
  it('is silent until the run begins, and then sounds once a session and never again', async () => {
    const garden = theGarden();
    expect(garden.scene.asked).toBe(0);
    garden.report({ recording: true });
    await nextTick();
    expect(garden.scene.sounding).toBe(true);
    // A run ends and another begins, and the music does not come back with it.
    garden.report({ recording: false });
    garden.report({ recording: true });
    await nextTick();
    expect(garden.scene.asked).toBe(1);
  });

  it('does not begin under a tape on the timeline', async () => {
    const garden = theGarden();
    garden.report({ loaded: true });
    garden.report({ recording: true });
    await nextTick();
    expect(garden.scene.asked).toBe(0);
  });

  it('hushes over two seconds of a move, and stops there', async () => {
    const garden = theGarden();
    garden.report({ recording: true });
    await nextTick();
    garden.location.value = 2;
    await nextTick();
    garden.pass(1000);
    expect(garden.scene.sounding).toBe(true);
    expect(garden.scene.volume).toBeCloseTo(0.5);
    garden.pass(1000);
    expect(garden.scene.sounding).toBe(false);
    expect(garden.scene.volume).toBe(0);
    // And quiet stays quiet: no move brings the track back.
    garden.location.value = 3;
    await nextTick();
    garden.pass(2000);
    expect(garden.scene.asked).toBe(1);
  });

  it('hushes for a tape going onto the timeline', async () => {
    const garden = theGarden();
    garden.report({ recording: true });
    await nextTick();
    garden.report({ loaded: true });
    await nextTick();
    garden.pass(2000);
    expect(garden.scene.sounding).toBe(false);
    expect(garden.scene.volume).toBe(0);
  });
});
