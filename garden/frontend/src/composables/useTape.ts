import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { Game, TapeReport } from '../game/game';

/**
 * What the timeline looks like when there is nothing on it.
 *
 * It is the state of a world with no tape — not a loading state and not an error — so it is also what is shown
 * for the frame or two before the engine exists, while `useGame` is still building the renderer.
 */
const NOTHING_ON_THE_TAPE: TapeReport = {
  recording: false,
  playing: false,
  loaded: false,
  step: 0,
  steps: 0,
  seeking: false,
  seed: 0,
  bytes: 0,
};

/**
 * The tape, as the interface sees it: whether a run is being written or watched, where the playhead is, and the
 * three things the tape's own bar does about it — play, seek and put away (`TapeTimeline.vue`).
 *
 * The engine owns all of it (`Game.record` and the rest) and pushes a report whenever something changes, so this
 * is a mirror rather than a second copy: nothing here decides anything, and the buttons ask the engine to do what
 * they say rather than setting a flag the engine would have to notice. That is the same arrangement the toolbar
 * has with `Tool` (`App.vue`), and the same reason: the world is the engine's, and Vue only draws it.
 *
 * A run is *not* started from here: the first touch of a doll begins one (`Game.pressAt`), and what such a run is
 * for is the server rather than the timeline (`frontend/src/live/`).
 */
export function useTape(game: Ref<Game | null>) {
  const tape = ref<TapeReport>(NOTHING_ON_THE_TAPE);

  // The engine is built asynchronously, so its push is taken as soon as there is a report to take; until then
  // the timeline is empty, which is the truth about a world with no tape on it.
  watch(
    game,
    (engine) => {
      tape.value = NOTHING_ON_THE_TAPE;
      if (engine) {
        engine.onTapeChange = (report) => {
          tape.value = report;
        };
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (game.value) game.value.onTapeChange = null;
  });

  /**
   * The play button of the tape's own bar: plays the run that is on the timeline, and stops one that is walking.
   *
   * It is only ever up while a run is on the timeline (`TapeTimeline.vue`), which is why it has no `disabled`
   * state: a press that gets through is always a press with a tape to play.
   */
  function togglePlay(): void {
    const engine = game.value;
    if (!engine) return;
    if (tape.value.playing) engine.stopPlaying();
    else engine.play();
  }

  /** Where the slider was dragged to, in steps: the engine winds the run there (`Game.seek`). */
  function seek(step: number): void {
    game.value?.seek(step);
  }

  /**
   * The timeline's own close: the tape comes off it, and the world goes back to being the player's.
   */
  function unload(): void {
    game.value?.unload();
  }

  return { tape, togglePlay, seek, unload };
}
