<script setup lang="ts">
import type { ChatMessage } from '../chat/messages';
import type { Run } from '../chat/runs';
import ChatLine from './ChatLine.vue';

/**
 * The chat's own strip: the last few messages, standing beside the bar's chat button — the world's own
 * bottom left corner, where that button is the last of the bar's three. It is the part of the
 * chat the player reads while the game runs.
 *
 * It is a button as well as a block of text: a click anywhere on the lines opens the chat, so the way
 * in is not the bar's own button alone — and a link to a run inside one of the lines is therefore the
 * strip's to wear rather than its own door: the lines are handed no `open`, so the link draws
 * underlined like its twin in the window but a click on it is a click on the strip, which is the way
 * to where the link can be followed. It lies over the hall rather than on paper, so it is the
 * chat's colour and nothing else — no frame, no fill (see `.chat-strip` in `styles.css`).
 */
defineProps<{ messages: readonly ChatMessage[]; runs?: ReadonlyMap<string, Run> | null }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button type="button" class="chat-strip" aria-label="Открыть чат" @click="$emit('open')">
    <ChatLine v-for="message in messages" :key="message.id" :message="message" :runs="runs" />
  </button>
</template>
