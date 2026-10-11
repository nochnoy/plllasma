<script setup lang="ts">
import { ref } from 'vue';
import type { Speaker } from '../chat/messages';

/**
 * The chat's field for a narrow window — the framed one, the field the chat has always worn: one
 * border around the whole of it with the speaker at its left end and the text box inside, and the
 * worded «Отправить» beside it. It is shown exactly while the window is too narrow for the painted
 * field (`ChatFieldDesktop.vue`), which the page swaps it for by the width of the window alone
 * (`useMinWidth` in `ChatPanel.vue`) — the two are one field to everyone standing in front of them:
 * the same speaking, the same sending, the same refusals.
 *
 * What the field does with a line is the panel's own business (`ChatPanel.vue`): the form only says
 * *that* it was sent, and the panel answers for what sending is — which is why the button empties
 * nothing and asks for nothing itself.
 */
const props = defineProps<{
  /** Who the next line will be signed by: the badge, the nickname and the way the triangle points. */
  speaker: Speaker;
  anonymous: boolean;
  /** Whether a line is already on its way: the button waits for it like the panel does. */
  sending: boolean;
}>();
/** What is typed, held by the panel — both fields write into the one it keeps. */
const typed = defineModel<string>({ required: true });
const emit = defineEmits<{
  submit: [];
  toggleSpeaker: [];
}>();

/** The text box, for the panel's sake: it takes the focus back after every line sent. */
const input = ref<HTMLInputElement | null>(null);

/** The panel focuses the field without knowing which of the two it is looking at. */
function focus(): void {
  input.value?.focus();
}
defineExpose({ focus });
</script>

<template>
  <!-- The framed field: one border around the whole of it, the speaker and the text box inside it
       neither of them drawing a border of their own, the button beside it wearing the border every
       worded button of the garden wears. -->
  <form class="chat-card__form" @submit.prevent="emit('submit')">
    <div class="chat-card__field">
      <button
        type="button"
        class="chat-card__speaker"
        :aria-pressed="props.anonymous"
        :aria-label="props.anonymous ? 'Писать от своего имени' : 'Писать от имени Привидения'"
        @click="emit('toggleSpeaker')"
      >
        <img class="chat-card__badge" :src="props.speaker.face" alt="" width="16" height="16" />
        <b class="chat-card__nick">{{ props.speaker.nick }}</b>
        <!-- The combobox's own triangle, pointing down while the player is themselves and up while
             they are the ghost. -->
        <svg class="chat-card__caret" viewBox="0 0 12 12" aria-hidden="true">
          <path :d="props.anonymous ? 'M2.6 7.7h6.8L6 4.2z' : 'M2.6 4.3h6.8L6 7.8z'" />
        </svg>
      </button>
      <input ref="input" v-model="typed" class="chat-card__input" type="text" aria-label="Сообщение" />
    </div>
    <!-- One line at a time is all the server is asked for, so the button waits for the last one. -->
    <button type="submit" class="chat-card__send" :disabled="props.sending">Отправить</button>
  </form>
</template>
