<script setup lang="ts">
import { runReading, type Run } from '../chat/runs';

/**
 * The rows of the runs, drawn wherever a list of them is: the column beside the conversation, and the
 * window the whole of the list opens in its own right (`RunsDialog.vue`). One component, because a row is
 * the same thing in both places — a way into a run rather than something to read — and the drawing of it
 * is one thing to keep, not two.
 *
 * A row is who played the run and how long it is — or that it is still being played, which is the server's
 * own word for a run somebody is in the middle of (`runs.ts`) and not a clock this page works out for
 * itself. A row whose tape is on its way down is dimmed rather than taken away: the list is where the
 * finger is, and a row that vanished would be the one the player pressed.
 *
 * Picking is said rather than done, because there is nothing here to wait for: what a row asks for is
 * `useRuns`'s own business, and both places that draw this list hand it on unchanged.
 */
defineProps<{
  /** The runs to draw, newest first: the rows, in the order they were given. */
  runs: readonly Run[];
  /** The run whose tape is on its way down, or null: the row that is waiting for its own answer. */
  opening: string | null;
}>();
const emit = defineEmits<{
  /** A row pressed: that run, whose tape is asked for and handed to the engine (`useRuns`). */
  choose: [run: Run];
}>();
</script>

<template>
  <div class="chat-runs">
    <button
      v-for="run in runs"
      :key="run.id"
      type="button"
      class="chat-run"
      :class="{ 'is-live': run.live, 'is-opening': opening === run.id }"
      :aria-busy="opening === run.id"
      @click="emit('choose', run)"
    >
      <!-- A cassette: the run as a thing on a tape, drawn like the bar's own tools rather than
           filled, with the two reels inside it. -->
      <svg class="icon chat-run__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.6 5.4h16.8v13.2H3.6z" />
        <circle cx="8.5" cy="12.6" r="2.3" />
        <circle cx="15.5" cy="12.6" r="2.3" />
      </svg>
      <b class="chat-run__nick">{{ run.author }}</b>
      <span class="chat-run__reading">{{ runReading(run) }}</span>
    </button>
    <p v-if="!runs.length" class="chat-runs__none">Пока ничего не записано.</p>
  </div>
</template>
