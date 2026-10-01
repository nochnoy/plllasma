<script setup lang="ts">
import type { ChatMessage } from '../chat/messages';

/**
 * One message, drawn the same way wherever it appears: the writer's face, their nickname in bold, a
 * colon and a space, and then the body — text with the odd gif standing in it.
 *
 * A line is a `span` rather than a paragraph of its own, because it is drawn inside a block that is
 * itself a control — the strip beside the bar is a button — and a button may hold nothing but a run of
 * text and pictures. It is laid out as a block all the same (see `.chat-line` in `styles.css`).
 *
 * The face is a ready `src` on the message (`messages.ts`): the writer's userpic the site keeps — or
 * the ghost's badge, over the same writer, for a line the field sent as the ghost's. A body's gifs
 * arrive as paths already, since a body is written by a player rather than by the game.
 *
 * The face carries no `alt`: the nickname is written right beside it, and a reader that hears the
 * message twice is worse off than one that only hears the name.
 */
defineProps<{ message: ChatMessage }>();
</script>

<template>
  <span class="chat-line">
    <img class="chat-line__badge" :src="message.face" alt="" width="16" height="16" />
    <b>{{ message.nick }}</b>:
    <template v-for="(part, index) in message.parts" :key="index"
      ><img v-if="part.kind === 'gif'" class="chat-line__gif" :src="part.file" :alt="part.alt" width="16" height="16" /><template
        v-else
        >{{ part.text }}</template
      ></template
    >
  </span>
</template>
