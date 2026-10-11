<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { ChatMessage, Speaker } from '../chat/messages';
import type { Run } from '../chat/runs';
import ChatLine from './ChatLine.vue';
import ChatFieldMobile from './ChatFieldMobile.vue';
import ChatFieldDesktop from './ChatFieldDesktop.vue';
import { useMinWidth } from '../composables/useMinWidth';

/**
 * The chat's own screen — the third of the garden's locations, arrived over the world from the
 * right (`App.vue`): a heading, the log under one scroll, and the field at the foot.
 * The heading's right end is the way to the fourth — «Гиблиотека», the archive of every run the
 * server holds — which is the chat's own door out rather than the game's.
 * Messages are read from the top down, so the newest one is at the bottom and the scroll keeps itself
 * there; the field is where the eye already is, so the text in it takes the focus when the screen
 * arrives and again after every line sent.
 *
 * The screen is transparent — the world stands behind every line of it, and its words are the chat's
 * own colour — and its one scroll carries the conversation alone: the runs are not a list beside it
 * any more but links inside it, one line per run, drawn from the run's own row (`useRunStates`) and
 * followed wherever the page was told they go (`open`, which is the tape coming down and the garden
 * panning to the stage). What a link says is what its run is saying — «начал гнуть», «сделал
 * перешпагат» — and a run still being played says so beside its words.
 *
 * The field's own left end says who is speaking: the badge the next line will wear, the nickname, and a
 * triangle like the one on a combobox. Pressing any part of that swaps the player for the ghost and back
 * (see `useChat`) — the field is the only place anonymity is decided, so it is the only place it is
 * shown, and nothing already said changes. The field itself is one thing with two bodies: a window wide
 * enough for the picture wears the painted stone of `assets/chat-bg.png` (`ChatFieldDesktop.vue`), a
 * narrower one wears the framed field the chat has always had (`ChatFieldMobile.vue`) — the window's
 * width alone decides (`useMinWidth`), and everything the field does is the same in either.
 *
 * Sending is a function rather than an event because the field has to wait for its answer: the line
 * stands in the log at once (`useChat`, which is why the field is emptied on the spot — the screen
 * answers the finger rather than a round trip), and the text is put back if the server turned out not to
 * take it. A refusal then costs the player nothing but the reading of the error line. Following a link
 * is a function for the same reason, with nothing to wait for but the link itself: the tape coming down
 * is `useRuns`' own business, and this component only hands the id on.
 */
const props = defineProps<{
  /**
   * Whether the player is at the chat — the screen is arrived at and left by the garden panning to it
   * and away (`App.vue`), and the component stays mounted in its pane once first visited: this is how
   * it knows the moment to take the field and settle the scroll, each time the screen comes round.
   */
  open: boolean;
  messages: readonly ChatMessage[];
  /** The rows of the runs the log links, by id: what a link draws itself from (`useRunStates`). */
  runs: ReadonlyMap<string, Run>;
  speaker: Speaker;
  anonymous: boolean;
  /** Why the last thing the chat tried did not happen, or null while nothing has gone wrong. */
  error: string | null;
  /** Whether a line is already on its way: one at a time is all the server is ever asked for. */
  sending: boolean;
  send: (typed: string) => Promise<boolean>;
  /** What following a link to a run does: the page's own door onto a playback (`App.vue`). */
  openRun: (id: string) => void;
}>();
const emit = defineEmits<{
  close: [];
  toggleSpeaker: [];
  openArchive: [];
}>();

const typed = ref('');
/** The screen's own scroll: the one that carries the log. */
const scroll = ref<HTMLElement | null>(null);
/** The field the screen's lines are written in — whichever of the two bodies the window is wearing. */
const field = ref<{ focus(): void } | null>(null);
/**
 * Enough window for the painted field: it is 785 px of picture, and a window narrower than that
 * wears the framed one instead — the two are one field to everyone standing in front of them
 * (`ChatFieldMobile.vue` / `ChatFieldDesktop.vue`), and which of them is mounted is the window's
 * width alone.
 */
const paintedField = useMinWidth(785);

/** The newest message is the one to read: keep the screen's own scroll at its bottom. */
function toBottom(): void {
  void nextTick(() => {
    const box = scroll.value;
    if (box) box.scrollTop = box.scrollHeight;
  });
}

// The screen arriving in the window is the field's own moment, every time it does — and the first
// time is no different: the panel is put in its place in the garden before the player ever arrives
// at it (`App.vue`), so mounting takes no focus from the stage and the arrival itself is what puts
// it in the field, with the scroll settled at the newest line.
/** Arriving at the screen is the field's own moment, every time: the scroll settles at the newest
 * line and the field takes the focus — and the first time is no different, because the panel is put
 * in its place in the garden before the player ever arrives at it (`App.vue`). */
function arrived(): void {
  toBottom();
  field.value?.focus();
}
watch(() => props.open, arrived, { immediate: true });
watch(() => props.messages.length, toBottom);
// The window changing its width across the field's own line swaps the two bodies — and takes the
// focus with the field that left. While the player is at the chat, the field that arrives takes it
// back: the text keeps its place (both fields write into the same `typed`), and the caret is where
// it was before the window moved.
watch(paintedField, () => {
  if (props.open) field.value?.focus();
});

async function submit(): Promise<void> {
  const text = typed.value.trim();
  if (!text || props.sending) return;
  typed.value = '';
  field.value?.focus();
  if (!(await props.send(text))) typed.value = text;
}
</script>

<template>
  <!-- The screen itself: transparent over the world, its words in the chat's own colour, with the way
       back at the left of its heading rather than a cross at the end of it — what it leaves is a
       place, the stage, and a way back is what a place is left by. -->
  <section class="chat-card chat-card--full" aria-label="Чат с привидениями">
    <header class="chat-card__head">
      <button type="button" class="chat-card__back" aria-label="Назад к сцене" @click="emit('close')">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11.2 5.2 4.4 12l6.8 6.8M4.9 12h14.6" />
        </svg>
        Назад
      </button>
      <h2 class="chat-card__title">Чат с привидениями</h2>
      <!-- The way to the archive: every run the server holds, as a table of its own over the same
           scenery — the one thing the conversation itself does not reach, because the lines it is
           showing are the last fifty and the runs are all of them. It stands at the right of the
           heading, across the screen from the way back, and is the door the archive is entered by
           (`App.vue`, the fourth location). Its drawing is the way it goes — further along the
           garden, to the right, the same arrow the threshold's own «Сцена» says its way with. -->
      <button type="button" class="chat-card__archive" aria-label="Гиблиотека" @click="emit('openArchive')">
        Гиблиотека
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12.8 5.2 19.6 12l-6.8 6.8M19.1 12H4.5" />
        </svg>
      </button>
    </header>
      <!-- The one scroll of the window, carrying the conversation: the runs are links in it rather
           than a list beside it, so there is nothing else to read and no second scrollbar to hunt
           for the end of one in. -->
      <div ref="scroll" class="chat-card__body">
        <div class="chat-card__log">
        <!-- One message, one block: the space after a line is the space after the whole of it, and a
             line is hovered as one thing. -->
        <div v-for="message in messages" :key="message.id" class="chat-entry">
          <ChatLine :message="message" :runs="runs" :open="openRun" />
        </div>
      </div>
      </div>
      <!-- What the chat could not do, in the player's own language: the server says it in English and
           about the request, which is for whoever reads logs rather than for whoever is playing. It stands
           beside the field rather than up in the log among other people's messages, and it stays there
           while the log scrolls. -->
      <p v-if="error" class="chat-card__error" role="alert">{{ error }}</p>
      <!-- The field is one thing with two bodies, and the window's width alone decides which of them
           stands: a window wide enough for the picture wears the painted field
           (`ChatFieldDesktop.vue`), a narrower one the framed field (`ChatFieldMobile.vue`). Both
           write into the same `typed`, both send the same way, and both take the focus the screen
           gives its field — the panel holds whichever is mounted by its exposed `focus`. -->
      <ChatFieldDesktop
        v-if="paintedField"
        ref="field"
        v-model="typed"
        :speaker="speaker"
        :anonymous="anonymous"
        :sending="sending"
        @submit="submit"
        @toggle-speaker="emit('toggleSpeaker')"
      />
      <ChatFieldMobile
        v-else
        ref="field"
        v-model="typed"
        :speaker="speaker"
        :anonymous="anonymous"
        :sending="sending"
        @submit="submit"
        @toggle-speaker="emit('toggleSpeaker')"
      />
    </section>
</template>
