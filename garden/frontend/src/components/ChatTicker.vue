<script setup lang="ts">
import type { ChatMessage } from '../chat/messages';
import ChatLine from './ChatLine.vue';

/**
 * The chat's own strip: the last few messages, standing beside the bar's chat button — the world's own
 * bottom left corner, where that button is the last of the bar's three. It is the part of the
 * chat the player reads while the game runs.
 *
 * It is a button as well as a block of text: a click anywhere on the lines opens the chat, so the way
 * in is not the bar's own button alone. It lies over the hall rather than on paper, so it is the
 * chat's colour and nothing else — no frame, no fill (see `.chat-strip` in `styles.css`).
 */
defineProps<{ messages: readonly ChatMessage[] }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button type="button" class="chat-strip" aria-label="Открыть чат" @click="$emit('open')">
    <ChatLine v-for="message in messages" :key="message.id" :message="message" />
  </button>
</template>
