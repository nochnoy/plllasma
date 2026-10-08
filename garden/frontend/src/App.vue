<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChatPanel from './components/ChatPanel.vue';
import ChatTicker from './components/ChatTicker.vue';
import TapeTimeline from './components/TapeTimeline.vue';
import { useChat } from './composables/useChat';
import { useGame } from './composables/useGame';
import { useLiveRun } from './composables/useLiveRun';
import { useRunStates } from './composables/useRunStates';
import { useRuns } from './composables/useRuns';
import { useTape } from './composables/useTape';
import type { User } from './auth';
import type { Speaker } from './chat/messages';
import { linkedRuns, userpic } from './chat/messages';
import type { Run } from './chat/runs';
import type { Tape } from './game/tape';
import type { Tool } from './game/world';

/**
 * Who is playing, as the site answered for this page's token (`main.ts` waits out the handshake on a
 * black screen before any of this is mounted). The game has no players of its own: every line sent
 * and every run recorded is by this one, and the one choice they still have about it is to wear
 * the ghost's name for a line at a time (`useChat`).
 */
const props = defineProps<{ user: User }>();

/** The player as the chat speaks of them: the site's own name and face for them, nothing chosen here. */
const player: Speaker = { id: props.user.id, nick: props.user.nick, face: userpic(props.user.icon) };

/**
 * Where in the garden the player is: one of three screens laid side by side in the order they are
 * numbered. Each screen is one window in its own right, standing in the row by its own transform
 * (`placeOf`) — the whole of the garden is never one wide thing that has to be carried; it is three
 * window-sized layers, and a move is all three of them translated the same way at once, which reads
 * exactly as one place panned across. Going deeper (1→2→3) the whole picture travels to the left;
 * coming back, to the right.
 *
 * Because each screen carries itself — its own layer, its own transform, nothing nested inside
 * anything wider — the motion belongs to the browser's compositor and to nothing else. What the
 * compositor does not carry is the *arrival*: the chat's screen, the heaviest of the three, comes
 * with work of its own — the runs' list read off the server and drawn, the scroll settled at the
 * newest line, the field taking focus — and work that lands in the middle of a pan, however little
 * it is, is a pan that arrives in pieces. So the pan carries the screen bare: the arrival work waits
 * until the pan is over (`settled` below), and the move to the chat is then as light as every other
 * move — a picture sliding in over nothing but its own scenery.
 *
 * The first screen is the threshold the player lands on — its own picture (`assets/bg-1.png`), the
 * one sentence about the place, and the «Сцена» button that is the way in. The second is the stage
 * itself, which is all the game there is: the hall (`assets/bg-2.png`, the world the renderer
 * draws), the doll, the bar of tools and the chat's strip. The third is the chat's own screen over
 * `assets/bg-3.png` — everything the window it used to be was, said over its own scenery in the
 * chat's own colour rather than on paper — and the way into it is the bar's chat button and the
 * strip alike.
 *
 * On the first and the third there is nothing of the game at all — no doll, no bar, no physics to
 * watch — just the screen each of them is. The stage's own clock stands still for as long as the
 * player is away from it: the world waits exactly where it was left, and a run being written is not
 * recording the away time (`Game.suspend`).
 */
const location = ref<1 | 2 | 3>(1);

/**
 * How long a move from one screen to the next takes, in milliseconds: the 0.38s of `.location`'s
 * own transition (`src/styles.css`), said here with a frame's worth of slack. A player who asks for
 * reduced motion gets no transition at all — the garden *cuts* from one screen to the next — so the
 * wait is nothing and the arrival work happens at once.
 */
const PAN_MS = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400;

/**
 * Whether the last move's pan is over. A move starts it (`false` at the click) and the clock ends it
 * (`true` a `PAN_MS` later) — and it is the one thing the chat's own arrival work waits on, because
 * work done while the garden is still moving is work the player watches happen in instalments.
 */
const settled = ref(true);
let settleTimer: number | null = null;

// Every move re-arms the wait; a move made before the last one settled (a quick change of mind)
// starts its own clock over, and the arrival work of the screen left in between never happens.
watch(location, (at, was) => {
  if (at === was) return;
  settled.value = false;
  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    settled.value = true;
  }, PAN_MS);
});
onBeforeUnmount(() => {
  if (settleTimer !== null) clearTimeout(settleTimer);
});

/**
 * Where a screen sits while the player is at `location`: its own place in the row, as that many
 * windows left (negative) or right of the one being stood at. The screen the player is on is at
 * zero, its neighbours a window away each, and every move re-places all three at once.
 */
function placeOf(screen: 1 | 2 | 3): { transform: string } {
  return { transform: `translateX(${(screen - location.value) * 100}%)` };
}

/** The page's asset base, where the three locations' own pictures hang — the same one the renderer builds from. */
const base = import.meta.env.BASE_URL ?? '/';

const host = ref<HTMLElement | null>(null);
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
 * Where the interface goes: the world's own top left corner in the pane's own coordinates, how much the
 * world shrinks it to fit inside itself, and how big it is once it is there (see `Scene.hud`). It is
 * part of the world, not of the window: the bar hangs in the hall's top left corner whatever the window
 * is doing, because it is laid out along the head of a frame that is as tall as the hall — which is what
 * puts the buttons at the top of the picture and leaves the foot of it clear. Its width is the whole of
 * the world across, less the two insets, which is the foot the tape's own bar is centred on and measured
 * against (`TapeTimeline.vue`): a question only the world can answer.
 */
const hud = ref({ x: 0, y: 0, scale: 1, width: 0, height: 0 });
/**
 * Whether there is a world to measure yet. Until the renderer is up the bar is not shown at all, so
 * it never flashes in the window's own corner on the way there — the world is not there either.
 */
const placed = ref(false);

/**
 * Puts the interface in the world's corner: the renderer's own numbers, less where the pane the canvas
 * fills begins.
 *
 * The pane rather than the page, because the interface and the canvas it is measured against travel
 * together: both are inside the stage's pane, and the panes strip is moved by a transform — which every
 * `getBoundingClientRect` on the page answers for. The difference of two boxes moved by the same
 * transform is the number the transform never touched, so the corner this works out is the pane's own
 * and stays right however far the panes have been carried and whenever they are asked.
 */
function placeToolbar(): void {
  const frame = game.value?.hud();
  const box = host.value?.getBoundingClientRect();
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

// ...and it is taken back from the engine on the one occasion the world changes it by itself: coming
// home from a watched run puts back the tool the player left with (`Game.homeAgain`), and the buttons
// have to follow.
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
      // An engine that comes up while the player is elsewhere starts stood still, like any leaving of
      // the stage does (`suspend`).
      if (location.value !== 2) engine.suspend();
    }
  },
  { immediate: true },
);

/**
 * The stage's own clock is the player's presence at it. Panning to another of the garden's screens
 * stands the world still — a run being written waits at the step it had got to, and nothing of the
 * away time is recorded (`Game.suspend`); coming back sets it going again exactly where it stood
 * (`Game.resume`). A playback is not held by this: a tape walks its own clock, and what it plays is
 * the stage's own content and nothing else — the pan itself was never the run's to carry.
 */
watch(location, (at, was) => {
  if (at === was) return;
  if (at === 2) game.value?.resume();
  else game.value?.suspend();
});

/**
 * The chat: the four lines under the bar, the screen the bar's chat button and those lines are both the
 * way into, and the server both of them read (`chat/api.ts`) — the conversation of the lobby, which is
 * the only place this page has a name for. A line is anchored at a step of a recording (`useChat`) and
 * this is where the place would be said, but this page reads the lobby: the recordings are what the
 * screen's own list reaches, and playing one of them is what `useRuns` does here.
 *
 * Who a line is sent as is the field's own business (`useChat`), which is why the speaker and the
 * anonymity come from here rather than from the screen itself — the player as the site named them
 * (`user`), or the ghost — and why the chat's own error is the one aliased below: the engine's is the
 * game's.
 */
const {
  messages,
  ticker,
  anonymous,
  speaker,
  sending,
  send,
  announce,
  error: chatError,
  toggleAnonymous,
} = useChat(undefined, { speaker: player });

/**
 * Whether the player is at the chat *and the pan that brought them there is over* — the moment the
 * screen's own arrival work happens: the scroll settles at the newest line and the field takes focus
 * (`ChatPanel`). Being there is not enough — arriving is a two-part thing, the travel and the work,
 * and this is the boundary between them.
 */
const atChat = computed(() => location.value === 3 && settled.value);

/**
 * Whether the chat's screen paints its contents at all: the log, the field — everything
 * but the scenery. It comes on with `atChat`, once the pan is over, and goes off only once a *later*
 * move has finished — so the screen slides in bare (nothing of the chat to carry or to paint while
 * it moves) and slides away still looking like the place it was, emptying only after it is out of
 * sight. A latch rather than a mirror of `atChat`, because the two edges want opposite delays: on
 * the way in the content waits for the arrival, on the way out it waits for the departure.
 */
const chatShown = ref(false);

// The latch follows the settle: whenever a pan ends, the chat's screen shows its contents if the
// player stopped on it, and empties if they did not.
watch(settled, (still) => {
  if (still) chatShown.value = location.value === 3;
});

/**
 * The runs the chat's lines link, as the chat knows them: their words and whether they are still
 * being played, fetched for exactly the ids the log is showing (`useRunStates`). This is what makes
 * a line that links a run a living thing rather than a dead one — the run's own label changes as the
 * play goes on, and the line changes underneath it without the log ever being rewritten.
 */
const { rows: runRows } = useRunStates(() => linkedRuns(messages.value));

/**
 * What following a run is, and what it does: it goes onto the timeline as the game's own run, which
 * is what makes somebody else's run a run this page watches (`useRuns`).
 *
 * The way in is a link in the chat or the page's own address (`?run=`) — there is no list to pick
 * from, the chat's lines are the list. The chat is left on the way in either way: a playback is not
 * something to read a chat over, and the world's own row — the bar of tools and the chat's strip —
 * comes back with the tape's own bar when the run is put away (`TapeTimeline.vue`). A run that is
 * still being played goes on arriving after that, and what stops it is the tape's own report rather
 * than the screen (`stopWatching`, below).
 */
const { open: openRun, stop: stopWatching } = useRuns({
  play: playRun,
  grow: growRun,
});

/** What a link in the chat is followed by: the run it names, onto the timeline and walking. */
function followTheLink(id: string): void {
  void openRun(id);
}

/**
 * A run asked for, walking: `loadTape` is the game's own reading of the run the server handed over
 * — one file for a run that is over, and the head and the slices a run that is still being played has so far
 * (`useRuns`), which are a tape before they are a file — and the playhead starts at the beginning, so what the
 * player watches is that run rather than wherever the world had been left.
 *
 * And the player is brought to the stage to watch it — following a link is the one thing the chat does
 * that is the game's, and what it opens onto is the run. The address is told the run as well, so that
 * what the player is watching is what the player can hand to somebody else (`setRunInUrl`).
 */
function playRun(id: string, tapeFile: string): void {
  const engine = game.value;
  if (!engine) return;
  engine.loadTape(tapeFile);
  engine.play();
  location.value = 2;
  setRunInUrl(id);
}

/**
 * A run that was being watched has more of itself: the tape the page has pasted together goes to the engine,
 * which puts it under the walk (`Game.growTape`) — and with it whether the run is still being
 * played, because that is what decides whether a walk at the end of the tape waits there for the rest
 * of it or stops there (`playFrame`).
 */
function growRun(run: Run, tape: Tape): void {
  game.value?.growTape(tape, run.live);
}

// A run that is not on the timeline any more is a run nobody is watching: the tape's own report says so
// (`useTape`), and what takes a tape off is its own bar's «Закрыть» — which is also the door the player
// comes back through, to their own scene and their own interrupted run (`Game.unload`). The address is
// told too: a page no longer watching a run is a page whose address should not say it is.
watch(
  () => tape.value.loaded,
  (loaded) => {
    if (!loaded) {
      stopWatching();
      setRunInUrl(null);
    }
  },
);

/**
 * The run this page is playing, handed to the server as it is played (`useLiveRun`): it begins with the first
 * touch of a doll and is finished when the window goes away. Nothing of it is on screen — what is being
 * written is nobody's playback, and the bar of tools has no button for it any more.
 *
 * What *is* on screen is its saying: the moment the run opens, a line goes up in the chat linking it —
 * «Начал игру» — and the run is bound to that line, so that what it goes on to do can be said in the
 * same place (`announce` is how the saying reaches the log, and the engine's own word for a feat is
 * wired to it from inside the composable).
 *
 * Who a run is written under is who the site says is playing: the token carries it, and the server
 * answers for it at its own door — deliberately *not* the field's anonymous switch, which is about the
 * chat's own lines rather than about who played (`useChat`).
 */
const { end: endRun } = useLiveRun(game, tape, { say: announce });

// The window going away is the end of the run. A page put in the back/forward cache is *not* an ending — the
// player may come back to a world that is still writing its run — and `persisted` is what says which it is.
function leavePage(event: PageTransitionEvent): void {
  if (!event.persisted) void endRun();
}
onMounted(() => window.addEventListener('pagehide', leavePage));
onBeforeUnmount(() => window.removeEventListener('pagehide', leavePage));

/** The address's own name for a run: what a link's id is said by when the player hands the address to somebody. */
const RUN_PARAM = 'run';

/**
 * The run the address was opened on, or null when it was not: a link handed to another player, or to
 * the same one on another day. It survives the handshake untouched — the address is the page's own
 * business, and `?token=` beside it (`auth.ts`) is read the same way this is.
 */
function runInUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get(RUN_PARAM);
  return id && id.trim() ? id.trim() : null;
}

/**
 * Puts a run into the address, or takes it out — without moving the page: `replaceState`, because
 * following a link is not a place the player went to and the way back is not the way out of it. What
 * it is *for* is the copying: a player watching a run is a player holding an address that opens it,
 * and everything else the address carries (`?token=`, whatever comes next) is kept as it stood.
 */
function setRunInUrl(id: string | null): void {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set(RUN_PARAM, id);
  else params.delete(RUN_PARAM);
  const asked = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${asked ? `?${asked}` : ''}`);
}

/**
 * An address opened on a run is a page opened on the run: not the threshold the garden starts at but
 * the stage, with the run already walking on it. It happens once — the engine arriving is late enough
 * for it (`useGame`), and anything the player goes on to do is their own going-on, not the address's.
 */
let openedTheAddress = false;
watch(game, (engine) => {
  const id = engine && !openedTheAddress ? runInUrl() : null;
  if (!id) return;
  openedTheAddress = true;
  location.value = 2;
  void openRun(id);
});
</script>

<template>
  <div class="scene">
    <!-- The garden's three screens, each in the row by its own transform (`placeOf`): one window each,
         neighbours of the one being stood at a window away to either side, and all three carried by
         the same move at once — the browser's compositor does the carrying, screen by screen, so the
         motion is one thing and whatever a screen is busy doing about its own arrival is another. -->
    <!-- The first: the threshold the player lands on. Nothing of the game is here at all — its own
         picture, the sentence the place is known by in the first third of the screen, and the way
         in. -->
    <section
      class="location location--intro"
      :style="[placeOf(1), { backgroundImage: `url(${base}assets/bg-1.png)` }]"
      aria-label="Сад"
    >
      <p class="intro__said">
        Говорят,<br />
        если ночью в саду<br />
        найти старую сцену,<br />
        раздеться и лечь на неё,<br />
        то станешь<br />
        очень гибкой...
      </p>
      <button type="button" class="intro__go" @click="location = 2">
        Сцена
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12.8 5.2 19.6 12l-6.8 6.8M19.1 12H4.5" />
        </svg>
      </button>
    </section>

    <!-- The second: the stage itself, the canvas and the interface hanging in its world. -->
    <section class="location location--stage" :style="placeOf(2)">
      <div ref="host" class="stage" />
      <!-- The interface, in the world's own corner: the bar, and the chat's block in the world's
           bottom left corner. The frame is as tall as the world, the buttons hang from its head, and
           the chat's four lines stand on its foot — all inside the world however small the window
           makes it.
           The frame is as wide as the world across, and the row is the *game's* own: while a run is
           on the tape there is no column here at all, and a bar along the world's own foot, centred
           on it, is what there is instead (`TapeTimeline.vue` — see `.hud`/`.tape` in
           `src/styles.css` for how the two share the frame). None of it is on the screen at all
           outside the stage: the other two screens are the player's, and the game waits where it
           was left. -->
      <div
        v-show="placed && location === 2"
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
              <!-- The bar of tools, hanging from the top of the world's own left edge: three buttons one
                   under the other, each a black square with a drawing of the hall's own wood in it.
                   Each also wears the word the player calls it — «Таскать», «Связывать», «Чатъ» — for the
                   pointer on it, which is the button's own name in the markup as much as it is what is drawn;
                   the word stands *beside* the square rather than over it, since a caption laid over a button
                   covers the very thing that button presses on (`.hint` in `src/styles.css`).
                   Which tool is in hand reads without any word at all: that button is the same square the
                   other way round, wood with a dark drawing and a dark edge. -->
              <div class="toolbar" role="toolbar" aria-label="Инструменты">
            <button
              type="button"
              class="tool"
              data-tool="drag"
              :class="{ 'is-active': tool === 'drag' }"
              :aria-pressed="tool === 'drag'"
              aria-label="Таскать"
              @click="tool = 'drag'"
            >
              <span class="hint">Таскать</span>
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
              aria-label="Связывать"
              @click="tool = 'rope'"
            >
              <span class="hint">Связывать</span>
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

            <!-- The chat: the lowest button of the bar, and the only one that picks no tool — it is the
                 way to the chat's own screen, the third of the garden's three, and it reads as pressed
                 while the player is there. -->
            <button
              type="button"
              class="tool"
              data-tool="chat"
              :class="{ 'is-active': location === 3 }"
              :aria-expanded="location === 3"
              aria-label="Чатъ"
              @click="location = 3"
            >
              <span class="hint">Чатъ</span>
              <!-- A comic bubble: a balloon with its tail swinging down to the left, and three dots waiting
                   inside it. Drawn rather than filled, so that the dots are holes in nothing. -->
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.6 3.2H17.4a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-6l-6 4.6 1.2-4.6a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z"
                />
                <path d="M8.4 9.7h.01M12 9.7h.01M15.6 9.7h.01" />
              </svg>
            </button>
              </div>

          <!-- The chat's own four lines, under the bar and against the same left edge: the block hangs
               off the column rather than off the chat's screen, so it stands in the hall's own corner,
               at the world's own scale, while the game is what the player is looking at. -->
          <ChatTicker :messages="ticker" :runs="runRows" @open="location = 3" />
          </div>

      <!-- The tape's own bar, along the foot of the world and centred on it: it is up while a run is loaded
           on the tape, which is the length of a playback and of the dragging about that follows one, and
           while it is up it is the *whole* of the interface's own row — the bar of tools is not on the
           screen at all then (`:.hud__row` above and `.tape` in `src/styles.css`).
           What it holds is the run's own play button, the way along it, and the way out. -->
      <TapeTimeline v-if="tape.loaded" :tape="tape" @play="togglePlay" @seek="seek" @close="unload" />
    </div>
    </section>

    <!-- The third: the chat's own screen, over its own scenery. Everything the window it used to be
         was is here — the conversation, the runs beside it, the field and its speaker — said in the
         chat's own colour over `assets/bg-3.png` rather than on paper, with the way back where the
         cross was. It stands in the row like the other two, one window right of the stage: leaving it
         is the conversation itself sliding away, and coming back finds the log, the scroll and the
         field where they were left.
         The panel itself is hidden for as long as the screen is moving (`chatShown`): the pan slides
         in the scenery alone, and the conversation is standing there when it stops — the screen's
         arrival work (its list being read, its field taking focus) happens to a screen that has
         already arrived. -->
    <section
      class="location location--chat"
      :style="[placeOf(3), { backgroundImage: `url(${base}assets/bg-3.png)` }]"
      aria-label="Чат с привидениями"
    >
      <ChatPanel
        v-show="chatShown"
        :open="atChat"
        :messages="messages"
        :runs="runRows"
        :speaker="speaker"
        :anonymous="anonymous"
        :error="chatError"
        :sending="sending"
        :send="send"
        :open-run="followTheLink"
        @close="location = 2"
        @toggle-speaker="toggleAnonymous"
      />
    </section>
  </div>
  <p v-if="error" class="error">{{ error }}</p>
</template>
