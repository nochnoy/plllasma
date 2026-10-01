<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Run } from '../chat/runs';
import RunsList from './RunsList.vue';

/**
 * The whole list of runs in a window of its own: what «Ещё...» under the column beside the conversation
 * opens (`ChatPanel.vue`), for when there are more runs than that column is tall enough to say.
 *
 * It is the chat's own window over again, with the conversation taken out: the same paper, the same cross,
 * the same rows (`RunsList.vue`) — all of them rather than the first fifty, which is the only difference
 * and the whole of why the door exists. Nothing is read for it that the chat has not read already: the runs
 * it draws are the same newest hundred the column is cut from (`useRuns`), and asking the server for more
 * would be an archive rather than a door.
 *
 * Picking a row is the column's own picking handed on unchanged, and the window goes with it: a playback is
 * not something to read a list over, and the chat's own window is shut on the way in for the same reason
 * (`App.vue`).
 */
defineProps<{
  /** Every run the window keeps, newest first (`useRuns`): the rows, all of them. */
  runs: readonly Run[];
  /** The run whose tape is on its way down, or null: the row that is waiting for its own answer. */
  opening: string | null;
  /** A row pressed: that run, whose tape is asked for and handed to the engine (`useRuns`). */
  choose: (run: Run) => void;
}>();
const emit = defineEmits<{ close: [] }>();

const shut = ref<HTMLButtonElement | null>(null);

onMounted(() => shut.value?.focus());
</script>

<template>
  <div class="chat-window" @click.self="emit('close')">
    <section class="chat-card chat-card--runs" role="dialog" aria-modal="true" aria-label="Прогоны">
      <header class="chat-card__head">
        <h2 class="chat-card__title">Прогоны</h2>
        <button
          ref="shut"
          type="button"
          class="chat-card__close"
          aria-label="Закрыть список прогонов"
          @click="emit('close')"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" />
          </svg>
        </button>
      </header>
      <div class="chat-card__body">
        <div class="chat-card__runs">
          <RunsList :runs="runs" :opening="opening" @choose="choose" />
        </div>
      </div>
    </section>
  </div>
</template>
