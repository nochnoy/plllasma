<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { whenWritten, type Entry } from '../chat/archive';
import { RUN_LIVE, RUN_STARTED } from '../chat/messages';

/**
 * The archive's own screen — the fourth of the garden's locations, arrived over the chat's scenery
 * from the left («Все записи» in the chat's own heading): every run the server holds as one list,
 * newest first, its words in the chat's own colour the way the conversation's are (`App.vue`).
 *
 * A line is three things said in one breath — when the run was kept, who played it (with the face
 * the site keeps for them, the way a line of the chat is signed), and the run's own word for
 * itself, the technical word of the recording («Начал игру», «Сделал шпагат») — and a line is
 * pressed rather than read: following it is the same thing following a link in the chat is
 * (`useRuns` through `App.vue`), a playback on at once and the way back here when it is put away.
 *
 * The list fills from the top: the rows that have arrived stand in the screen's one scroll, and
 * the end of them is watched for (`more` is the archive's own asking, a window of the list at a
 * time) so that reaching the bottom of what is drawn is what draws the next of it — until the
 * server says the list is over (`done`), which the last line of the list says in its turn.
 */
const props = defineProps<{
  /** The rows read so far, newest first (`useArchive`): the list, and nothing over or under it. */
  rows: readonly Entry[];
  /** Whether a window of the list is on its way down. */
  loading: boolean;
  /** Whether the list is over: no window past this one holds anything. */
  done: boolean;
  /** Why the last window did not arrive, in the player's own language, or null while none did. */
  error: string | null;
  /** The next window of the list, onto the end of the list (`useArchive.more`). */
  more: () => void;
  /** What pressing a row does: the page's own door onto a playback (`App.vue`). */
  openRun: (id: string) => void;
}>();
const emit = defineEmits<{ close: [] }>();

/** The screen's own scroll: the one that carries the list. */
const scroll = ref<HTMLElement | null>(null);
/** The end of the list, watched for: reaching it is what asks for the next window of rows. */
const sentinel = ref<HTMLElement | null>(null);

/**
 * The scroll's own asking: the last of the drawn rows watched for, and seen — which is the list
 * having been read to its end, or close enough that the rest is worth having ready. It asks freely,
 * because the asking guards itself (`useArchive.more` holds off a second ask while the first is on
 * its way and stops entirely once the list is over).
 */
let watcher: IntersectionObserver | null = null;
onMounted(() => {
  if (!sentinel.value || !scroll.value) return;
  watcher = new IntersectionObserver(
    (seen) => {
      if (seen.some((entry) => entry.isIntersecting)) props.more();
    },
    { root: scroll.value },
  );
  watcher.observe(sentinel.value);
});
onBeforeUnmount(() => watcher?.disconnect());
</script>

<template>
  <!-- The screen itself: the chat's own full-screen frame (`chat-card--full` — the transparent one
       over the scenery, its words in the chat's own colour), with the list where the conversation
       would be. The way back at the left of its heading is where the chat's own is, and leads to
       the chat: the archive is a room off it rather than a place of its own. -->
  <section class="chat-card chat-card--full archive" aria-label="Все записи">
    <header class="chat-card__head">
      <button type="button" class="chat-card__back" aria-label="Назад к чату" @click="emit('close')">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11.2 5.2 4.4 12l6.8 6.8M4.9 12h14.6" />
        </svg>
        Назад
      </button>
      <h2 class="chat-card__title">Все записи</h2>
    </header>
    <!-- The one scroll of the screen, carrying the whole list: the rows arrive a window at a time
         and the scroll carries them all, so that going back up is reading what was already read
         rather than asking for it again. -->
    <div ref="scroll" class="archive__body">
      <!-- The list itself: four fifths of the screen across and stood in the middle of it (the
           whole of it on a window too narrow for the slack to be worth having), one line per run —
           no columns and no headings over them, because a line says everything it is: the moment
           it was kept, the player who kept it with the face the site keeps for them, and the run's
           own word for itself — the same word a link in the chat wears, said the same way, with
           the same fallback for a run that has not said anything yet and the same «(Идёт стрим)»
           beside the words of one that is still going. The line is a control as well as a line:
           pressing it is following the run. -->
      <div class="archive__list">
        <div
          v-for="row in rows"
          :key="row.id"
          class="archive__row"
          :data-run="row.id"
          tabindex="0"
          :aria-label="`${row.author}, ${whenWritten(row.whenMs)}, ${row.label || RUN_STARTED}`"
          @click="openRun(row.id)"
          @keydown.enter="openRun(row.id)"
        >
          <span class="archive__when">{{ whenWritten(row.whenMs) }}</span>
          <img class="archive__badge" :src="row.face" alt="" width="16" height="16" />
          <b class="archive__nick">{{ row.author }}</b
          ><span class="archive__colon">:</span>
          <span class="archive__what">{{ row.label || RUN_STARTED }}{{ row.live ? ` ${RUN_LIVE}` : '' }}</span>
        </div>
        <!-- The last line of the list: the whole of it said as one word, worn as one more line —
             same height, same place — so that the end reads as read rather than announced. -->
        <div v-if="done && rows.length" class="archive__row archive__row--end">Всё</div>
      </div>
      <!-- What the list says about itself when it cannot speak in lines: why the last window did not
           come, that one is coming, or that there is nothing in the list to come for. -->
      <p v-if="error" class="archive__note" role="alert">{{ error }}</p>
      <p v-else-if="loading && !rows.length" class="archive__note">Записи читаются…</p>
      <p v-else-if="done && !rows.length" class="archive__note">Записей ещё нет.</p>
      <!-- The end of the drawn rows, seen when the scroll reaches it: nothing in itself, and the
           whole of the asking — the observer above watches it and asks for the next window. -->
      <div ref="sentinel" class="archive__sentinel" aria-hidden="true"></div>
    </div>
  </section>
</template>
