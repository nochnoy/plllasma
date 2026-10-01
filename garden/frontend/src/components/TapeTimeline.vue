<script setup lang="ts">
import { computed } from 'vue';
import type { TapeReport } from '../game/game';
import { TAPE_STEP_MS } from '../game/tape';

/**
 * The tape's own bar, along the foot of the world: the way along a run, and the two things a player does with
 * one — set it walking, and put it away.
 *
 * It is drawn by the page rather than by the renderer, like the bar of tools, and it hangs inside the world's
 * own box for the same reason: the interface is part of the picture, and a control drawn at the window's own
 * size would sit out on the black beside a world scaled to fit. What the *slider* is, though, is a run's own
 * steps — a step of the tape, which is 20 ms of the world — so a drag is a seek rather than a scroll.
 *
 * Nothing here moves the world: the playhead arrives from the engine (`Game.onTapeChange`), and the button and
 * the slider ask the engine for what they say. What the component does own is how a run is *addressed* rather
 * than how it is measured: there is no clock on the bar, and what the clock said is still read out where it is
 * needed rather than shown (`length`, below) — a player does not read a run in seconds, they put the playhead
 * back where the interesting thing was and watch it again, which is what the way along it is for.
 *
 * The readings a run can be *measured* by — how faithfully a playback follows its recording, how big the file
 * is, how long it is — are not here and never were the player's: they are the debug panel's, which only exists
 * while somebody has asked for the desk (`DebugPanel.vue`) and which stays up over a playback.
 *
 * While this bar is up it is the whole of the interface's own row: the bar of tools and the chat's block give
 * up their room to it (`App.vue`), and the bar takes the foot of the world, centred on it, a button tall — see
 * `.tape` in `src/styles.css` for how it is measured against the world.
 */
const props = defineProps<{ tape: TapeReport }>();
const emit = defineEmits<{ play: []; seek: [step: number]; close: [] }>();

/**
 * A count of steps as a clock, to a tenth of a second: `0:04.0`, `1:02.4`.
 *
 * A tenth rather than a whole second because a step is a fiftieth of one: at a whole second the clock would
 * barely move during a short run, and a slider whose reading never changed would read as broken.
 */
function clock(steps: number): string {
  const seconds = (steps * TAPE_STEP_MS) / 1000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * The run as a length: where the playhead is, and how long the tape is, as the clock reads them.
 *
 * It is not drawn. It is what the slider *says* instead of showing — a range input reads its own value out to
 * whoever is using it, and a step count of `437` of `1150` says nothing about a run (`aria-valuetext`), while
 * a slider with no reading at all is one a player who cannot see it is dragging blind.
 */
const length = computed(() => `${clock(props.tape.step)} / ${clock(props.tape.steps)}`);
</script>

<template>
  <!--
    The bar: the run's own play button, the way along it, and the way out.

    Its three pieces stand at the foot of the world, in the order a player reads them — the run first, then the
    run itself, then the way back to the game — and its bottom edge is the world's own foot, which the bar of
    tools' column ends at too.
  -->
  <div class="tape" :class="{ 'is-seeking': tape.seeking }" role="group" aria-label="Запись на таймлайне">
    <button
      type="button"
      class="tape__play"
      :aria-label="tape.playing ? 'Остановить воспроизведение' : 'Воспроизвести'"
      :aria-pressed="tape.playing"
      @click="emit('play')"
    >
      <!-- A triangle while the run is standing still and two bars while it is walking: the two pictograms any
           player already knows, and the same solid drawing the tools' own icons are. -->
      <svg class="icon icon--solid" viewBox="0 0 24 24" aria-hidden="true">
        <path v-if="!tape.playing" d="M8.6 5.1 18.4 12l-9.8 6.9z" />
        <path v-else d="M8 5.4h3.1v13.2H8zM12.9 5.4H16v13.2h-3.1z" />
      </svg>
    </button>

    <!-- The way along the run, in a frame of the bar's own: the slider is the browser's control and is not
         drawn by anything here, so what makes it part of the bar is the black and the edge around it. -->
    <div class="tape__track">
      <input
        class="tape__slider"
        type="range"
        min="0"
        :max="Math.max(1, tape.steps)"
        :value="tape.step"
        step="1"
        aria-label="Позиция записи"
        :aria-valuetext="length"
        @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <button type="button" class="tape__close" @click="emit('close')">Закрыть</button>
  </div>
</template>
