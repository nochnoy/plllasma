<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { ChatMessage, Speaker } from '../chat/messages';
import { badgeSrc } from '../chat/messages';
import { SIDEBAR_RUNS, type Run } from '../chat/runs';
import ChatLine from './ChatLine.vue';
import RunsDialog from './RunsDialog.vue';
import RunsList from './RunsList.vue';

/**
 * The window the chat button opens: a heading, the log and the runs under one scroll, and the field at the
 * foot. Messages are read from the top down, so the newest one is at the bottom and the scroll keeps itself
 * there; the field is where the eye already is, so the text in it takes the focus when the window opens and
 * again after every line sent.
 *
 * The window is the whole page, less the margin the world's own row is drawn inside of, and under its one
 * scroll it is two columns: the conversation takes the width, and the runs the server holds — one row each,
 * newest first — take a narrower column on the right. One scroll for both, because the two are read
 * together: the rows are as long as other people's playing, and a scrollbar of their own would be a second
 * place to look for the end of a conversation. The field stays where it is whatever has been said — it is
 * the one part of the window that has to be reached, not read.
 *
 * A row is a way into a run rather than something to read: pressing one brings that run's own tape down and
 * walks it (`useRuns`), which is the one thing the chat has to do with a recording that the conversation
 * itself cannot say. The column shows the first {@link SIDEBAR_RUNS} of the runs; when there are more, the
 * «Ещё...» under them opens the whole list in a window of its own (`RunsDialog.vue`) — a list of a hundred
 * rows beside a chat would be the taller of the two things, and the chat is what the window is for.
 *
 * The field's own left end says who is speaking: the badge the next line will wear, the nickname, and a
 * triangle like the one on a combobox. Pressing any of that swaps the player for the ghost and back
 * (see `useChat`) — the field is the only place anonymity is decided, so it is the only place it is
 * shown, and nothing already said changes.
 *
 * Sending is a function rather than an event because the field has to wait for its answer: the line
 * stands in the log at once (`useChat`, which is why the field is emptied on the spot — the strip
 * answers the finger rather than a round trip), and the text is put back if the server turned out not to
 * take it. A refusal then costs the player nothing but the reading of the error line. Picking a run is a
 * function for the same reason, with nothing to wait for but the row itself: the tape coming down is
 * `useRuns`'s own business, and this component only draws the result of it.
 */
const props = defineProps<{
  messages: readonly ChatMessage[];
  speaker: Speaker;
  anonymous: boolean;
  /** Why the last thing the chat tried did not happen, or null while nothing has gone wrong. */
  error: string | null;
  /** Whether a line is already on its way: one at a time is all the server is ever asked for. */
  sending: boolean;
  send: (typed: string) => Promise<boolean>;
  /** The runs the window keeps, newest first: the rows of the column, and of the whole list's window (`useRuns`). */
  runs: readonly Run[];
  /** The run whose tape is on its way down, or null: the row that is waiting for its own answer. */
  opening: string | null;
  /** Why the list of runs is empty or out of date, in the player's own language, or null. */
  runsError: string | null;
  /** A row pressed: that run, whose tape is asked for and handed to the engine (`useRuns`). */
  choose: (run: Run) => void;
}>();
const emit = defineEmits<{
  close: [];
  toggleSpeaker: [];
}>();

const typed = ref('');
/** The window's own scroll: the one that carries the log and the runs together. */
const scroll = ref<HTMLElement | null>(null);
const field = ref<HTMLInputElement | null>(null);
/** Whether the whole list of runs is on screen in its own window (`RunsDialog.vue`). */
const wholeList = ref(false);

/** What the column beside the conversation shows: the first of the runs, and only as many as a column is tall for. */
const listed = computed(() => props.runs.slice(0, SIDEBAR_RUNS));
/** Whether there are runs the column does not show, which is what «Ещё...» is the door on. */
const unlisted = computed(() => props.runs.length > listed.value.length);

/** The newest message is the one to read: keep the window's own scroll at its bottom. */
function toBottom(): void {
  void nextTick(() => {
    const box = scroll.value;
    if (box) box.scrollTop = box.scrollHeight;
  });
}

onMounted(() => {
  toBottom();
  field.value?.focus();
});
watch(() => props.messages.length, toBottom);

async function submit(): Promise<void> {
  const text = typed.value.trim();
  if (!text || props.sending) return;
  typed.value = '';
  field.value?.focus();
  if (!(await props.send(text))) typed.value = text;
}

/** A row pressed, in the column or in the whole list's window: the window of the whole list goes with it. */
function pick(run: Run): void {
  wholeList.value = false;
  props.choose(run);
}
</script>

<template>
  <div class="chat-window" @click.self="emit('close')">
    <section class="chat-card chat-card--full" role="dialog" aria-modal="true" aria-label="Чат привидений">
      <header class="chat-card__head">
        <h2 class="chat-card__title">Чат привидений</h2>
        <button type="button" class="chat-card__close" aria-label="Закрыть чат" @click="emit('close')">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" />
          </svg>
        </button>
      </header>
      <!-- The one scroll of the window, carrying both columns: the conversation and the runs are read
           together, and neither has a scrollbar of its own to hunt for the end of the other in. -->
      <div ref="scroll" class="chat-card__body">
        <!-- Two columns: the conversation, and the runs beside it. The conversation is the whole of what the
             chat is for, so it takes the width; the list is a column rather than a row of buttons so that a
             run's own reading stands at the end of a line the eye can follow. -->
        <div class="chat-card__columns">
          <div class="chat-card__log">
            <!-- One message, one block: the space after a line is the space after the whole of it, and a
                 line is hovered as one thing. -->
            <div v-for="message in messages" :key="message.id" class="chat-entry">
              <ChatLine :message="message" />
            </div>
          </div>
          <aside class="chat-card__runs" aria-label="Прогоны">
            <RunsList :runs="listed" :opening="opening" @choose="pick" />
            <!-- The rest of the list, one press away: fifty rows is what a column beside a conversation is
                 for, and the whole of it is a window of its own. -->
            <button v-if="unlisted" type="button" class="chat-runs__more" @click="wholeList = true">
              Ещё...
            </button>
            <!-- The list's own failures, which are not the conversation's: said in the column they belong to. -->
            <p v-if="runsError" class="chat-card__error" role="alert">{{ runsError }}</p>
          </aside>
        </div>
      </div>
      <!-- What the chat could not do, in the player's own language: the server says it in English and
           about the request, which is for whoever reads logs rather than for whoever is playing. It stands
           beside the field rather than up in the log among other people's messages, and it stays there
           while the log scrolls. -->
      <p v-if="error" class="chat-card__error" role="alert">{{ error }}</p>
      <!-- One frame around the whole of the field, the speaker included: the text box inside it has
           neither a frame nor a fill of its own, or the field would read as two boxes — and its own
           focus ring is drawn inside that frame rather than around the text alone. -->
      <form class="chat-card__form" @submit.prevent="submit">
        <div class="chat-card__field">
          <button
            type="button"
            class="chat-card__speaker"
            :aria-pressed="anonymous"
            :aria-label="anonymous ? 'Писать от своего имени' : 'Писать от имени Привидения'"
            @click="emit('toggleSpeaker')"
          >
            <img class="chat-card__badge" :src="badgeSrc(speaker.badge)" alt="" width="16" height="16" />
            <b class="chat-card__nick">{{ speaker.nick }}</b>
            <!-- The combobox's own triangle, pointing down while the player is themselves and up
                 while they are the ghost. -->
            <svg class="chat-card__caret" viewBox="0 0 12 12" aria-hidden="true">
              <path :d="anonymous ? 'M2.6 7.7h6.8L6 4.2z' : 'M2.6 4.3h6.8L6 7.8z'" />
            </svg>
          </button>
          <input ref="field" v-model="typed" class="chat-card__input" type="text" aria-label="Сообщение" />
        </div>
        <!-- One line at a time is all the server is asked for, so the button waits for the last one. -->
        <button type="submit" class="chat-card__send" :disabled="sending">Отправить</button>
      </form>
    </section>
    <!-- The whole list of runs, when «Ещё...» has been pressed: the same rows in a window of their own,
         over the chat's own rather than in it. -->
    <RunsDialog
      v-if="wholeList"
      :runs="runs"
      :opening="opening"
      :choose="choose"
      @close="wholeList = false"
    />
  </div>
</template>
