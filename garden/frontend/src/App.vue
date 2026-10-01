<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChatPanel from './components/ChatPanel.vue';
import ChatTicker from './components/ChatTicker.vue';
import TapeTimeline from './components/TapeTimeline.vue';
import { useChat } from './composables/useChat';
import { useGame } from './composables/useGame';
import { useLiveRun } from './composables/useLiveRun';
import { useRuns } from './composables/useRuns';
import { useTape } from './composables/useTape';
import type { User } from './auth';
import type { Speaker } from './chat/messages';
import { userpic } from './chat/messages';
import type { Run } from './chat/runs';
import type { Tape } from './game/tape';
import type { Tool } from './game/world';

/**
 * Who is playing, as the site answered for this page's token (`main.ts` waits out the handshake on a
 * black screen before any of this is mounted). The game has no players of its own: every line sent
 * and every run recorded is by this one, and the one choice they still have about it is to wear the
 * ghost's name for a line at a time (`useChat`).
 */
const props = defineProps<{ user: User }>();

/** The player as the chat speaks of them: the site's own name and face for them, nothing chosen here. */
const player: Speaker = { id: props.user.id, nick: props.user.nick, face: userpic(props.user.icon) };

const host = ref<HTMLElement | null>(null);
/** The frame the bar is measured against: the scene is the stage's own box, and the bar sits in it. */
const scene = ref<HTMLElement | null>(null);
const { game, error } = useGame(host);

/**
 * The tape: whether a run is being written or watched, where the playhead is, and the three things the tape's
 * own bar does about it (`TapeTimeline.vue`). Like the tool, none of it is state this component keeps — the
 * engine owns the run and pushes a report (`useTape`), and what is left here is where the timeline goes.
 *
 * A run is not something the player starts from the bar any more: the first touch of a doll begins one, and
 * the server is handed it as it is played (`useLiveRun`, below).
 */
const { tape, togglePlay, seek, unload } = useTape(game);

/**
 * Where the interface goes: the world's own top left corner in the scene's coordinates, how much the
 * world shrinks it to fit inside itself, and how big it is once it is there (see `Scene.hud`). It is
 * part of the world, not of the window: the bar sits in the hall's corner whatever the window is doing,
 * and its column runs the whole height of the hall — which is what puts the chat's own button at the
 * foot of it, in the bottom left corner of the picture. Its width is the whole of the world across, less
 * the two insets, which is the foot the tape's own bar is centred on and measured against
 * (`TapeTimeline.vue`): a question only the world can answer.
 */
const hud = ref({ x: 0, y: 0, scale: 1, width: 0, height: 0 });
/**
 * Whether there is a world to measure yet. Until the renderer is up the bar is not shown at all, so
 * it never flashes in the window's own corner on the way there — the world is not there either.
 */
const placed = ref(false);

/** Puts the interface in the world's corner: the renderer's own numbers, less where the scene begins. */
function placeToolbar(): void {
  const frame = game.value?.hud();
  const box = scene.value?.getBoundingClientRect();
  if (!frame || !box) return;
  hud.value = {
    x: frame.x - box.left,
    y: frame.y - box.top,
    scale: frame.scale,
    width: frame.width,
    height: frame.height,
  };
  placed.value = true;
}

// The engine is built asynchronously, so the corner is asked for as soon as there is one to ask.
watch(game, placeToolbar, { immediate: true });

let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!host.value) return;
  // The world is fitted to the stage, so anything that changes the canvas's own size — the window,
  // the zoom, a panel opening — moves the corner the bar hangs off: this catches all of them.
  observer = new ResizeObserver(placeToolbar);
  observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());

/** The selected tool. The arrow is the drag that used to be the whole of the game. */
const tool = ref<Tool>('drag');

// The engine is built asynchronously, so the tool is pushed to it whenever either of them changes:
// a button clicked while the renderer is still loading is not lost.
watch([game, tool], () => game.value?.setTool(tool.value));

// ...and it is taken back from the engine whenever the world picks one of its own: adding something,
// or deleting something, puts the arrow back in the player's hand, and the buttons have to follow.
watch(
  game,
  (engine) => {
    if (engine) {
      engine.onToolChange = (next) => {
        tool.value = next;
      };
      // The corner the bar hangs off is the view's, and the view moves for reasons the window does not know
      // about either — a tape's own room taking over, for one (`Game.onViewChange`).
      engine.onViewChange = placeToolbar;
    }
  },
  { immediate: true },
);

/**
 * The chat: the four lines beside the bar's own chat button, the window that button opens, and the
 * server both of them read (`chat/api.ts`) — the conversation of the lobby, which is the only place this
 * page has a name for. A line is anchored at a step of a recording (`useChat`) and this is where the
 * place would be said, but this page reads the lobby: the recordings are what the window's own list
 * reaches, and playing one of them is what `useRuns` does here.
 *
 * Who a line is sent as is the field's own business (`useChat`), which is why the speaker and the
 * anonymity come from here rather than from the window itself — the player as the site named them
 * (`user`), or the ghost — and why the chat's own error is the one aliased below: the engine's is the
 * game's.
 */
const {
  messages,
  ticker,
  open,
  anonymous,
  speaker,
  sending,
  send,
  error: chatError,
  openChat,
  closeChat,
  toggleAnonymous,
} = useChat(undefined, { speaker: player });

/**
 * The runs the window lists beside the conversation, and what picking one does: it goes onto the timeline as
 * the game's own run, which is what makes somebody else's run a run this page watches (`useRuns`).
 *
 * The list is read while the window is open and not before, and the window is shut on the way in: a playback
 * is not something to read a chat over, and the world's own row — the bar of tools and the chat's strip —
 * comes back with the tape's own bar when the run is put away (`TapeTimeline.vue`). A run that is still being
 * played goes on arriving after that, and what stops it is the tape's own report rather than the window
 * (`stopWatching`, below).
 */
const { runs, error: runsError, opening: runOpening, choose: chooseRun, stop: stopWatching } = useRuns(open, {
  play: playRun,
  grow: growRun,
});

/**
 * A run picked off that list, walking: `loadTape` is the game's own reading of the run the server handed over
 * — one file for a run that is over, and the head and the slices a run that is still being played has so far
 * (`useRuns`), which are a tape before they are a file — and the playhead starts at the beginning, so what the
 * player watches is that run rather than wherever the world had been left.
 */
function playRun(_run: Run, tapeFile: string): void {
  const engine = game.value;
  if (!engine) return;
  engine.loadTape(tapeFile);
  engine.play();
  closeChat();
}

/**
 * A run that was being watched has more of itself: the tape the page has pasted together goes to the engine,
 * which puts it under the walk (`Game.growTape`) — and with it the row the server last wrote about the run,
 * because whether the run is still being played is what decides whether a walk at the end of the tape waits
 * there for the rest of it or stops there (`playFrame`).
 */
function growRun(run: Run, tape: Tape): void {
  game.value?.growTape(tape, run.live);
}

// A run that is not on the timeline any more is a run nobody is watching: the tape's own report says so
// (`useTape`), and what takes a tape off is its own bar's «Закрыть» — which is also the door the player
// comes back through, to their own scene and their own interrupted run (`Game.unload`).
watch(
  () => tape.value.loaded,
  (loaded) => {
    if (!loaded) stopWatching();
  },
);

/**
 * The run this page is playing, handed to the server as it is played (`useLiveRun`): it begins with the first
 * touch of a doll and is finished when the window goes away. Nothing of it is on screen — what is being
 * written is nobody's playback, and the bar of tools has no button for it any more.
 *
 * Who a run is written under is who the site says is playing: the token carries it, and the server
 * answers for it at its own door — deliberately *not* the field's anonymous switch, which is about the
 * chat's own lines rather than about who played (`useChat`).
 */
const { end: endRun } = useLiveRun(game, tape);

// The window going away is the end of the run. A page put in the back/forward cache is *not* an ending — the
// player may come back to a world that is still writing its run — and `persisted` is what says which it is.
function leavePage(event: PageTransitionEvent): void {
  if (!event.persisted) void endRun();
}
onMounted(() => window.addEventListener('pagehide', leavePage));
onBeforeUnmount(() => window.removeEventListener('pagehide', leavePage));
</script>

<template>
  <div ref="scene" class="scene">
    <div ref="host" class="stage" />
    <!-- The interface, in the world's own corner: the bar, and the chat's block beside it. The bar is as
         tall as the world — its column runs the whole of the world's left edge, with the chat's own
         button at the foot of it — and the chat's block stands beside that button, so the row is
         bottom-aligned and both of them are inside the world however small the window makes it.
         The frame is as wide as the world across, and the row is the *game's* own: while a run is on the
         tape there is no row here at all, and a bar along the world's own foot, centred on it, is what
         there is instead (`TapeTimeline.vue` — see `.hud`/`.tape` in `src/styles.css` for how the two
         share the frame). -->
    <div
      v-show="placed"
      class="hud"
      :style="{
        left: `${hud.x}px`,
        top: `${hud.y}px`,
        width: `${hud.width}px`,
        height: `${hud.height}px`,
        transform: `scale(${hud.scale})`,
      }"
    >
      <div v-if="!tape.loaded" class="hud__row">
          <div class="toolbar" role="toolbar" aria-label="Инструменты">
            <button
              type="button"
              class="tool"
              data-tool="drag"
              :class="{ 'is-active': tool === 'drag' }"
              :aria-pressed="tool === 'drag'"
              aria-label="Перетаскивать"
              @click="tool = 'drag'"
            >
              <svg class="icon icon--solid" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 2.4v15.8l4.4-3.9 2.4 6.3 2.7-1-2.3-6.2h5.7z" />
              </svg>
            </button>

            <button
              type="button"
              class="tool"
              data-tool="rope"
              :class="{ 'is-active': tool === 'rope' }"
              :aria-pressed="tool === 'rope'"
              aria-label="Верёвка"
              @click="tool = 'rope'"
            >
              <!-- The rope itself: two knots on a cord that hangs a little. The stage's own proportions do not
                   fit a 22 px pictogram — there a knot is a shade over twice the cord's thickness
                   (`KNOT_RADIUS` in `scene.ts`, `ROPE_THICKNESS` in `rope.ts`) and the cord is barely longer
                   than a knot is wide, which together read as one bar with two beads stuck on it. So the cord
                   is drawn a unit thinner than that ratio asks for, and the knots are pushed out until they
                   nearly touch the pictogram's own edge: a knot is 7.2 of the 24 across, which leaves 3.8 and
                   20.2 for the centres, and 9.2 of cord between them. Further out the viewBox would slice both
                   knots flat. The cord sags a quarter of a knot at its middle, which is all a pictogram this
                   size can carry — the stage's own catenary is far deeper, and at 20 px a deep one reads as a
                   mistake rather than as weight. -->
              <svg class="icon icon--solid" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="3.8" cy="12" r="3.6" />
                <circle cx="20.2" cy="12" r="3.6" />
                <path class="cord" d="M3.8 12q8.2 3 16.4 0" />
              </svg>
            </button>

            <!-- The bin: the last of the tools, so it is never next to the arrow by accident. It takes ropes
                 and stones away, and leaves the doll alone (`World.deleteAt`). -->
            <button
              type="button"
              class="tool"
              data-tool="delete"
              :class="{ 'is-active': tool === 'delete' }"
              :aria-pressed="tool === 'delete'"
              aria-label="Удалять верёвки и блоки"
              @click="tool = 'delete'"
            >
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4.8 7h14.4M9.4 7V4.6h5.2V7M6.6 7l1 12.3h8.8L17.4 7M10.4 10.4v6M13.6 10.4v6" />
              </svg>
            </button>

            <!-- The chat: the last button of the bar, standing at the foot of its column — the world's own
                 bottom left corner — and the only one that picks no tool: it opens the window, and reads as
                 pressed while that window is up. -->
            <button
              type="button"
              class="tool tool--chat"
              data-tool="chat"
              :class="{ 'is-active': open }"
              :aria-expanded="open"
              aria-haspopup="dialog"
              aria-label="Чат"
              @click="openChat"
            >
              <!-- A comic bubble: a balloon with its tail swinging down to the left, and three dots waiting
                   inside it. Drawn rather than filled, like the bin, so that the dots are holes in nothing. -->
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.6 3.2H17.4a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-6l-6 4.6 1.2-4.6a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z"
                />
                <path d="M8.4 9.7h.01M12 9.7h.01M15.6 9.7h.01" />
              </svg>
            </button>
            </div>

          <!-- The chat's own four lines, beside that button: the strip hangs off the bar rather than off the
               window, so it stands in the hall's own corner, at the world's own scale, its bottom level with
               the button's. -->
          <ChatTicker :messages="ticker" @open="openChat" />
      </div>

      <!-- The tape's own bar, along the foot of the world and centred on it: it is up while a run is loaded
           on the tape, which is the length of a playback and of the dragging about that follows one, and
           while it is up it is the *whole* of the interface's own row — the bar of tools is not on the page
           at all then (`:.hud__row` above and `.tape` in `src/styles.css`).
           What it holds is the run's own play button, the way along it, and the way out. -->
      <TapeTimeline v-if="tape.loaded" :tape="tape" @play="togglePlay" @seek="seek" @close="unload" />
    </div>

    <!-- The window the chat opens is the one part of it that is not in the world: it is a dialog over
         the whole page — less the margin around the world's row — and it keeps its own size however the
         hall is scaled. Its left column is the conversation and its right one the runs the server holds,
         which is where a recording becomes a playback (`useRuns`). -->
    <ChatPanel
      v-if="open"
      :messages="messages"
      :speaker="speaker"
      :anonymous="anonymous"
      :error="chatError"
      :sending="sending"
      :send="send"
      :runs="runs"
      :opening="runOpening"
      :runs-error="runsError"
      :choose="chooseRun"
      @close="closeChat"
      @toggle-speaker="toggleAnonymous"
    />
  </div>
  <p v-if="error" class="error">{{ error }}</p>
</template>

