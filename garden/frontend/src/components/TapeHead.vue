<script setup lang="ts">
import { whenWritten, type Entry } from '../chat/archive';

/**
 * The head of the playback screen, along the top of the world while a run is on the tape
 * (`App.vue`): the way out at the world's own top left corner, and beside it the run's own byline —
 * who played it, with the face the site keeps for them, and when it was kept.
 *
 * The way out is the chat's own worded button rather than the tape bar's old «Закрыть» at its other
 * end: what the button ends is not a box but a *place* — the mode a timeline up puts the stage in —
 * and the chat's own way back is what that reads as, the same pill, the same arrow, the same word.
 * Where it leads is where the run was followed from, which is the page's business (`cameFrom` in
 * `App.vue`), not this component's.
 *
 * The byline arrives when the view door answers (`useRuns.watched`), a moment after the run itself
 * has started walking: a playback does not wait to be signed, and a head with nothing in it yet is
 * only the button, in its place, already.
 */
defineProps<{
  /** The run being watched, as the view door answered with it — or null while it has not answered. */
  run: Entry | null;
}>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <!-- The head itself: the button at the world's own corner, the byline beside it — both in the
       interface's own place, at the top of the frame the bar of tools usually hangs from. It takes
       no clicks of its own beyond the button: the stage under it stays the player's. -->
  <header class="tape-head">
    <button type="button" class="chat-card__back" aria-label="Назад" @click="emit('close')">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11.2 5.2 4.4 12l6.8 6.8M4.9 12h14.6" />
      </svg>
      Назад
    </button>
    <p v-if="run" class="tape-head__byline">
      <img class="tape-head__badge" :src="run.face" alt="" width="16" height="16" />
      <b class="tape-head__nick">{{ run.author }}</b>
      <span class="tape-head__when">{{ whenWritten(run.whenMs) }}</span>
    </p>
  </header>
</template>
