<script setup lang="ts">
import { ref } from 'vue';
import type { Speaker } from '../chat/messages';

/**
 * The chat's field for a window wide enough for the picture — the painted one: the stone frame of
 * `assets/chat-bg.png` *is* the field, and everything alive stands on it transparent. The text box
 * sits over the dark field of the picture (74;38 of it, 570×58 — the dark the picture itself
 * draws), the speaker at its left end just as the framed field wears it; the sending button sits
 * over the picture's own shield (656;18, 84×94) and draws nothing — the shield is the button. The
 * picture answers the pointer for it: under the cursor the hover face (`chat-hover.png`, the shield
 * lit) shows over the rest, and while it is held down the press face (`chat-press.png`, the shield
 * sunk) does instead — the light of the hover face lies wider than the shield, so a press shows
 * *instead of* it, never inside it. Three pictures of one size standing exactly on each other, so
 * nothing moves when they change.
 *
 * The picture's own size is the field's size: 785×113, at one width only — a window narrower than
 * that is the framed field's (`ChatFieldMobile.vue`), and the page swaps the two by the width of
 * the window alone (`useMinWidth` in `ChatPanel.vue`). What a line does when it is sent is the
 * panel's own business (`ChatPanel.vue`): the form only says *that* it was sent.
 */
const props = defineProps<{
  /** Who the next line will be signed by: the badge, the nickname and the way the triangle points. */
  speaker: Speaker;
  anonymous: boolean;
  /** Whether a line is already on its way: the shield waits for it like the worded button does. */
  sending: boolean;
}>();
/** What is typed, held by the panel — both fields write into the one it keeps. */
const typed = defineModel<string>({ required: true });
const emit = defineEmits<{
  submit: [];
  toggleSpeaker: [];
}>();

/** The page's asset base, where the field's own pictures hang — the same one the locations build from. */
const base = import.meta.env.BASE_URL ?? '/';

/** The text box, for the panel's sake: it takes the focus back after every line sent. */
const input = ref<HTMLInputElement | null>(null);

/** The panel focuses the field without knowing which of the two it is looking at. */
function focus(): void {
  input.value?.focus();
}
defineExpose({ focus });
</script>

<template>
  <!-- The painted field: the picture first — the rest of it, and over it the two faces the shield's
       button answers the pointer with, all three exactly on each other and none of them taking the
       pointer — then the text box over the dark of the picture, and the shield itself last. -->
  <form class="chat-card__form chat-card__form--desktop" @submit.prevent="emit('submit')">
    <img
      class="chat-card__face chat-card__face--rest"
      :src="`${base}assets/chat-bg.png`"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
    <img
      class="chat-card__face chat-card__face--hover"
      :src="`${base}assets/chat-hover.png`"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
    <img
      class="chat-card__face chat-card__face--press"
      :src="`${base}assets/chat-press.png`"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
    <div class="chat-card__field chat-card__field--desktop">
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
    <!-- One line at a time is all the server is asked for, so the shield waits for the last one. It
         says itself where its word would be: the picture draws the button, so the button is given
         its name to be read by. -->
    <button
      type="submit"
      class="chat-card__send chat-card__send--desktop"
      :disabled="props.sending"
      aria-label="Отправить"
    ></button>
  </form>
</template>
