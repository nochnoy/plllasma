import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { MUTE_KEY, useMusic, type MusicTrack, type MuteStorage } from '../src/composables/useMusic';
import type { TapeReport } from '../src/game/game';

/**
 * What the garden's music is asked, and when (`useMusic`): one track, the stage's own, begun with
 * the run — the first touch of a doll — and never again in a session, ended by every move between
 * the garden's screens (hushing whatever is sounding over two seconds and stopping it there), and
 * muted by the player's own word, which the browser is asked to remember between visits.
 *
 * No browser is under these tests: the track is a fake that remembers every asking (`makeTrack`),
 * the storage is a pocket of the test's own (`storage`) and the clock is the test's own (`now`), so
 * what is checked is the rules alone — that nothing sounds before the run begins, that the music is
 * asked for once and never twice, that a tape on the timeline keeps it silent, that a move is a
 * fall and then a stop, and that the mute holds the music's place rather than ending it. That
 * nothing loops is the asking itself: the fake is never played twice, and the page's own track is
 * made with `loop` off for good.
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
 * A garden of the test's own: its location, its tape's reports, the fake the page is told is its
 * music, and the pocket the mute is remembered in — opened standing on whatever the last visit
 * left in it.
 */
function theGarden(rememberedMute = 'off') {
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
  const held = new Map<string, string>(rememberedMute ? [[MUTE_KEY, rememberedMute]] : []);
  const storage: MuteStorage = {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
  let clock = 0;
  const scope = effectScope();
  const music = scope.run(() =>
    useMusic(location, tape, {
      makeTrack: () => scene,
      storage,
      now: () => clock,
    }),
  )!;
  const garden = {
    location,
    scene,
    muted: music.muted,
    held,
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
    const full = garden.scene.volume;
    garden.location.value = 2;
    await nextTick();
    garden.pass(1000);
    expect(garden.scene.sounding).toBe(true);
    expect(garden.scene.volume).toBeCloseTo(full / 2);
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

  it('remembers the mute between visits, and opens standing on what was remembered', async () => {
    const garden = theGarden();
    expect(garden.muted.value).toBe(false);
    garden.muted.value = true;
    garden.muted.value = false;
    await nextTick();
    expect(garden.held.get(MUTE_KEY)).toBe('off');
    garden.muted.value = true;
    await nextTick();
    expect(garden.held.get(MUTE_KEY)).toBe('on');
    const quiet = theGarden('on');
    expect(quiet.muted.value).toBe(true);
  });

  it('holds the music for a run begun under the mute, and begins it with the mute coming off', async () => {
    const garden = theGarden('on');
    garden.report({ recording: true });
    await nextTick();
    expect(garden.scene.asked).toBe(0);
    garden.muted.value = false;
    await nextTick();
    expect(garden.scene.sounding).toBe(true);
    expect(garden.scene.asked).toBe(1);
  });

  it('takes sounding music whole and at once, and gives it back where it stood', async () => {
    const garden = theGarden();
    garden.report({ recording: true });
    await nextTick();
    const full = garden.scene.volume;
    garden.muted.value = true;
    await nextTick();
    expect(garden.scene.sounding).toBe(false);
    // The mute is a hand over the speaker, not an ending: the one sounding stands, not asked again.
    expect(garden.scene.asked).toBe(1);
    // A move made in the mute's silence is not the music's ending either.
    garden.location.value = 2;
    await nextTick();
    garden.muted.value = false;
    await nextTick();
    expect(garden.scene.sounding).toBe(true);
    expect(garden.scene.volume).toBe(full);
    // The giving-back is the track asked again — a pause undone is a second `play`, not a second
    // beginning: what stands at full volume is the one sounding, taken up where it was put down.
    expect(garden.scene.asked).toBe(2);
  });
});
