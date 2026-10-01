<script setup lang="ts">
import { onMounted, ref } from 'vue';

/**
 * The question the game asks before it has a name for whoever is playing (`App.vue`): who are you?
 *
 * There is no signing in behind it and nothing to check: the answer is a nickname and nothing else, and it
 * is what the chat signs this page's lines with from here on (`useChat.setNick`). The field takes the
 * focus, because the answer is the whole of what this dialog is for.
 *
 * An empty field is an answer too. It is the ghost's own name (Привидение), which is what the chat calls
 * somebody who gave none, so the button never refuses a press — a question about a name is not a door to
 * be kept out by, and the game is one press of «Играть» away whichever way it is answered.
 */
const emit = defineEmits<{
  /** The name the player answered with, trimmed; '' is the ghost's own, which the chat knows the name of. */
  choose: [nick: string];
}>();

const typed = ref('');
const field = ref<HTMLInputElement | null>(null);

onMounted(() => field.value?.focus());

/** The one thing this dialog does: hand the name on, and be gone — a name, not a form. */
function answer(): void {
  emit('choose', typed.value.trim());
}
</script>

<template>
  <!-- The chat window's own shape, because this is a question the chat asks: a card over the world, with
       the field at its foot. There is no cross, since there is nothing to go back to before it. -->
  <div class="chat-window">
    <section class="chat-card chat-card--asking" role="dialog" aria-modal="true" aria-label="Как вас зовут?">
      <div class="chat-card__log">
        <p><b class="chat-card__nick">Как вас зовут?</b></p>
        <small>Пустое поле — играть как Привидение.</small>
      </div>
      <form class="chat-card__form" @submit.prevent="answer">
        <div class="chat-card__field">
          <input ref="field" v-model="typed" class="chat-card__input" type="text" aria-label="Ник" />
        </div>
        <button type="submit" class="chat-card__send">Играть</button>
      </form>
    </section>
  </div>
</template>
