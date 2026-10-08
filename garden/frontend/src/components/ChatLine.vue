<script setup lang="ts">
import { computed } from 'vue';
import { labelWords, RUN_LIVE, RUN_WORD, type ChatMessage, type MessagePart, type RunPart } from '../chat/messages';
import type { Run } from '../chat/runs';

/**
 * One message, drawn the same way wherever it appears: the writer's face, their nickname in bold, a
 * colon and a space, and then the body — text, the odd gif standing in it, and the odd link that
 * opens a recording.
 *
 * A line is a `span` rather than a paragraph of its own, because it is drawn inside a block that is
 * itself a control — the strip beside the bar is a button — and a button may hold nothing but a run of
 * text and pictures. It is laid out as a block all the same (see `.chat-line` in `styles.css`).
 *
 * The face is a ready `src` on the message (`messages.ts`): the writer's userpic the site keeps — or
 * the ghost's badge, over the same writer, for a line the field sent as the ghost's. A body's gifs
 * arrive as paths already, since a body is written by a player rather than by the game.
 *
 * A link to a run is the game's own saying rather than a player's, and what it draws is not in the
 * message at all: the run's row says what its line is saying right now (`label`) and whether it is
 * still being played, and the chat holds those rows for exactly the runs its lines link
 * (`useRunStates`). The last word of the saying is the link — «Начал **игру**», «Сделал
 * **перешпагат**» — and a run that is still going wears «(Идёт стрим)» beside its words, so a reader
 * knows the end of it is not in the link yet. Where the line is drawn inside the strip the link is
 * the strip's: a click anywhere on the strip opens the chat, so there is no second door inside the
 * first (`open` is simply not handed to the strip's lines).
 *
 * The face carries no `alt`: the nickname is written right beside it, and a reader that hears the
 * message twice is worse off than one that only hears the name.
 */
const props = defineProps<{
  message: ChatMessage;
  /** The rows of the runs these lines link, by id: what a run's link draws itself from (`useRunStates`). */
  runs?: ReadonlyMap<string, Run> | null;
  /** What following a run's link does: handed in by the window, and left out by the strip. */
  open?: ((id: string) => void) | null;
}>();

/** One part of the body as it is drawn: the part itself, or a run's link with its words worked out. */
type Drawn = Exclude<MessagePart, RunPart> | { kind: 'run'; part: RunPart; said: string; word: string; live: boolean };

/**
 * The body with every run's saying worked out — once, rather than by whoever draws it — because the
 * words come from the run's row rather than from the message, and a row that has not arrived is the
 * word every link starts as rather than nothing at all.
 */
const drawn = computed<Drawn[]>(() =>
  props.message.parts.map((part) => {
    if (part.kind !== 'run') return part;
    const run = props.runs?.get(part.run);
    if (!run) return { kind: 'run', part, said: '', word: RUN_WORD, live: false };
    const { said, word } = labelWords(run.label);
    return { kind: 'run', part, said, word, live: run.live };
  }),
);
</script>

<template>
  <span class="chat-line">
    <img class="chat-line__badge" :src="message.face" alt="" width="16" height="16" />
    <b>{{ message.nick }}</b>:
    <template v-for="(part, index) in drawn" :key="index"
      ><img v-if="part.kind === 'gif'" class="chat-line__gif" :src="part.file" :alt="part.alt" width="16" height="16" /><template
        v-else-if="part.kind === 'run'"
        >{{ part.said
        }}<a
          v-if="open"
          class="chat-line__run"
          :class="{ 'is-live': part.live }"
          href="#"
          :data-run="part.part.run"
          @click.prevent="open(part.part.run)"
          >{{ part.word }}</a
        ><span v-else class="chat-line__run" :data-run="part.part.run">{{ part.word }}</span
        >{{ part.live ? ` ${RUN_LIVE}` : '' }}</template
      ><template
        v-else
        >{{ part.text }}</template
      ></template
    >
  </span>
</template>
