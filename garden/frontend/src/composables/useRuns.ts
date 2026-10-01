import { getCurrentInstance, onBeforeUnmount, ref, type Ref, watch } from 'vue';
import { chatApi, Refused, type ChatWire } from '../chat/api';
import { KEPT_RUNS, type Run } from '../chat/runs';
import { appendSlice, encodeTape, tapeFrom, type Tape } from '../game/tape';
import { liveApi, type LiveWire } from '../live/api';

/**
 * The runs the chat's window lists, and what picking one does: the newest of the runs the server holds
 * (`KEPT_RUNS` of them), read while the window is open, and one row's own run, which is what a click on it
 * asks for.
 *
 * The list is read rather than pushed, the way the log is (`useChat`): once the moment the window opens,
 * and on a timer after that for as long as it stays open — which is not only about somebody else's run
 * being written while the player watches, it is also how a row stops saying a run is still being played
 * once the server says so.
 *
 * Picking a row is the second door, and there are two kinds of row it can be. A run that is over comes down
 * as one file (`ChatWire.tape`, the game's own tape byte for byte). A run that is *still being played* comes
 * down as what it has so far — a head and the slices of it that have happened (`LiveWire.stream`) — and the
 * rest of it follows, a slice at a time, pasted onto the tape that is already on the timeline
 * ({@link RunsOptions.grow}) for as long as the run goes on. That is the whole of what watching somebody
 * else's run is, and it is why this composable has two wires: the chat's own, and the recording side's.
 *
 * What goes onto the timeline is the caller's business ({@link RunsOptions.play}, which is the engine),
 * because this is the list of runs rather than the tape's engine. Nothing of either kind is read from the
 * server until somebody opens the window, and a run that is being watched is asked about until it ends or the
 * tape comes off the timeline (`stop`, which is what the page calls when it does).
 */
export interface RunsOptions {
  /** The wire the list is read over (`chat/api.ts`): the real one, unless a test brings its own. */
  wire?: ChatWire;
  /** The wire a run that is still being played is watched over (`live/api.ts`): the recording side's own. */
  stream?: LiveWire;
  /** How often to read the list again, in milliseconds; 0 never does, which a test wants. */
  every?: number;
  /**
   * How often a run that is still being played is asked what it has written, in milliseconds; 0 never does,
   * which a test wants. A second by default (`WATCH_MS`), which is what one slice of a run is worth.
   */
  liveEvery?: number;
  /**
   * What a run's own tape is handed to, together with the row it came from — the game's engine, in the only
   * caller there is (`App.vue`).
   *
   * It is the run as a *file*, whoever it came from: a run that is over arrives as one (`ChatWire.tape`), and
   * a run that is still being played arrives as the head and the slices of it that have happened
   * (`LiveWire.stream`), which are a tape before they are a file ({@link appendSlice}). The engine reads one
   * thing and the same either way, and what it does with it is the caller's.
   */
  play(run: Run, tape: string): void;
  /**
   * The run being watched has more of itself: the tape it has grown into, pasted together on this side
   * ({@link appendSlice}), and the row as the server last put it — which is what says whether the run is
   * still being played, and so whether the tape under the walk is going to grow again (`Game.growTape`).
   *
   * It is called only for a run that is still being played, and only after `play` has handed over the run so
   * far: what the caller does with the tape is put it under a playback that is already walking.
   */
  grow(run: Run, tape: Tape): void;
}

/**
 * How long the list lets other people play before it asks what they have left.
 *
 * Longer than the chat's own catch-up (`CATCH_UP_MS`) by a good deal: a run is a file on somebody's disk
 * rather than a sentence, so a list that is a few seconds out of date is a list that is right, and asking
 * about it every couple of seconds would be the whole of what a page left open does.
 */
const LIST_MS = 5000;

/**
 * How often a run that is still being played is asked what it has written, in milliseconds.
 *
 * A second, which is the same second the run itself is sent in: a slice of a run is worth a second
 * (`TAPE_SLICE_STEPS`), so asking twice as often would be asking twice for the same slice and asking half as
 * often would be watching a run in two-second jumps.
 */
const WATCH_MS = 1000;

export function useRuns(open: Ref<boolean>, options: RunsOptions) {
  const wire = options.wire ?? chatApi();
  const stream = options.stream ?? liveApi();
  const every = options.every ?? LIST_MS;
  const liveEvery = options.liveEvery ?? WATCH_MS;

  /** The newest of the runs the server holds, in the order it gave them: the first row is the last played. */
  const runs = ref<Run[]>([]);
  /** Why the last thing the list tried did not happen, in the player's own language, or null. */
  const error = ref<string | null>(null);
  /** The run whose tape is on its way down, or null: the row that is waiting for its own answer. */
  const opening = ref<string | null>(null);

  /**
   * The run being watched, or null: its own id, the tape this page has of it so far, and the number of the
   * last slice in that tape — which is what the next ask asks past (`after`).
   *
   * All three are plain variables rather than refs: nothing draws a run that is being watched, because what
   * is on screen is the tape itself and the engine pushes a report about that (`useTape`), and a second copy
   * of it here would be a second thing to keep in step.
   */
  let watching: string | null = null;
  let seen: Tape | null = null;
  let after = -1;
  /** Whether this run's own trouble has been said in the console: one line a run rather than one a second. */
  let told = false;

  /**
   * The list as it stands now.
   *
   * A read that fails leaves the rows that were there: a list that went blank because one request did not
   * land would be worse than a list that is a few seconds out of date, and the sentence is shown either
   * way. What is kept of a read that lands is the newest {@link KEPT_RUNS} of it — the list is what there
   * is to watch, and the whole of what was ever played is an archive rather than a door.
   */
  async function load(): Promise<void> {
    try {
      runs.value = (await wire.runs()).slice(0, KEPT_RUNS);
      error.value = null;
    } catch (err) {
      blame(err, aboutList);
    }
  }

  /**
   * A row picked: that run, and then whatever the caller does with it.
   *
   * There are two ways a run comes down, and the row's own word for whether it is still being played
   * (`Run.live`, which is the server's) is what decides which. A run that is over arrives as one file, the
   * tape the game plays as itself (`loadTape`). A run that somebody is still playing arrives as the head its
   * tape was opened with and the slices of it that have happened, which are put together into a tape here
   * ({@link tapeFrom}, {@link appendSlice}) and then grow a slice at a time (`follow`).
   *
   * One run at a time — a second click while the first is on its way down is the same run again, and a click
   * while one is being *watched* takes the timeline from it (`stopFollowing`) — and the row says which one is
   * on its way (`opening`) so that the window can answer the finger before the server has.
   */
  async function choose(run: Run): Promise<void> {
    if (opening.value !== null) return;
    opening.value = run.id;
    stopFollowing();
    try {
      if (!run.live) {
        const tape = await wire.tape(run.id);
        error.value = null;
        options.play(run, tape);
        return;
      }
      const soFar = await stream.stream(run.id, -1);
      if (!soFar.head) {
        // A run the server calls live and has no head for is a run nothing can be made of: the head is what a
        // tape is built *from*. The sentence said about it is the unreadable one, because what came down is
        // not a run this build can play (`blame`).
        throw new Error('the server calls this run live and gave it no head');
      }
      let tape = tapeFrom(soFar.head);
      let last = -1;
      for (const slice of soFar.slices) {
        tape = appendSlice(tape, slice);
        last = slice.seq;
      }
      error.value = null;
      options.play(run, encodeTape(tape));
      follow(soFar.run, tape, last);
    } catch (err) {
      blame(err, aboutRun);
    } finally {
      opening.value = null;
    }
  }

  /**
   * What went wrong, in the player's own language.
   *
   * The same split as the chat's own `blame`: a request that never landed is the player's connection and
   * a door that did not open is the server's own answer, and the server's English sentence is left in the
   * console, where whoever can do something about it is looking anyway.
   *
   * `about.unreadable` is the third thing a run can be, and the only reason a failure that is neither of
   * the two above is not always blamed on the server: the tape is fetched and then handed on, and a file
   * the game cannot read came down perfectly well (`decodeTape`, which throws a sentence of its own when
   * a file is not a run this build can play). A list has no such third thing — a list that came down is a
   * list — so it leaves the field out and falls back to the second sentence, which it can only reach by
   * being wrong about its own wire.
   */
  function blame(err: unknown, about: { offline: string; refused: string; unreadable?: string }): void {
    console.warn('[free-falling-girl] the runs could not be read:', err);
    if (err instanceof Refused) error.value = err.status === 0 ? about.offline : about.refused;
    else error.value = about.unreadable ?? about.refused;
  }

  /**
   * Watches a run that is still being played: the tape of it this page has put together, and the number of
   * the last slice in that tape.
   *
   * The run is asked about at once — the answer to that ask is what has happened since, which for a row picked
   * up mid-play is the next second of it — and every second after that, for as long as the run goes on
   * (`WATCH_MS`). It is a timer rather than a watch of the run's own numbers because a run with nothing
   * happening in it writes nothing at all: its player is away from the window, or asleep, and silence is then
   * the right answer rather than a sign that the run is over.
   */
  function follow(run: Run, tape: Tape, seq: number): void {
    watching = run.id;
    seen = tape;
    after = seq;
    told = false;
    void ask();
    if (liveEvery > 0) followTimer = setInterval(() => void ask(), liveEvery);
  }

  /**
   * One ask of the run being watched: what has arrived since the slice this page already has.
   *
   * What arrives is pasted onto what the page has ({@link appendSlice}) and handed to the caller, which is
   * what puts it under the playback already walking the run (`Game.growTape`). The row that goes with it is
   * the server's latest word about the run rather than the row the player pressed — it is what says how long
   * the run is now and whether it is still being played — and it is handed over whether or not anything
   * arrived, because a run that has stopped being played has to be *said* to have stopped: nothing else
   * reaches the engine when the last slice was the last one.
   *
   * The run's own ending is the end of the asking: the tape has all of it, the walk stops at its end, and
   * nothing more is coming (`stopFollowing`).
   *
   * A failure costs the run nothing but a second of it: the tape is left as it stands, the asking goes on, and
   * the reason is said once in the console (`blameFollow`).
   */
  async function ask(): Promise<void> {
    const watched = watching;
    const had = seen;
    if (watched === null || had === null) return;
    try {
      const answer = await stream.stream(watched, after);
      let tape = had;
      for (const slice of answer.slices) {
        tape = appendSlice(tape, slice);
        after = slice.seq;
      }
      seen = tape;
      options.grow(answer.run, tape);
      if (!answer.run.live) stopFollowing();
    } catch (err) {
      blameFollow(err);
    }
  }

  /**
   * Stops watching: the run is over, or the tape has come off the timeline, or another row has been picked.
   *
   * Nothing is said to the engine here, and nothing has to be. A run's own ending arrives with the last slice
   * — the row that comes with it is the one that says there is nothing more to wait for (`Game.growTape`) —
   * and a tape taken off the timeline takes the walk with it (`Game.unload`).
   */
  function stopFollowing(): void {
    if (followTimer !== null) clearInterval(followTimer);
    followTimer = null;
    watching = null;
    seen = null;
    after = -1;
  }

  /**
   * What went wrong while watching, once a run and in the console.
   *
   * Nobody at the window is told: the run is on the timeline and the player is watching it, so a second of it
   * that did not arrive is a second the tape does not grow by rather than a run that went away. The column the
   * list's own failures are said in is in a window that is shut by then as well — a row picked closes it
   * (`App.vue`) — and, like the recording side's own failures, once a run is enough: a page with no server
   * behind it would otherwise say so every second.
   */
  function blameFollow(err: unknown): void {
    if (told) return;
    told = true;
    console.warn('[free-falling-girl] the run could not be followed:', err);
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let followTimer: ReturnType<typeof setInterval> | null = null;

  /** Reads the list at once, and starts asking about it again on a timer. */
  function start(): void {
    void load();
    if (every > 0) timer = setInterval(() => void load(), every);
  }

  /** Stops the list's own timer: a page taken down with one running is a timer nobody can stop. */
  function stopList(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  /**
   * Stops asking the server anything: the list, and the run being watched. It is what the page calls when the
   * tape comes off the timeline (`App.vue`), because a run that is not on the timeline any more is a run
   * nobody is watching — and what takes a tape off is its own bar's «Закрыть», the same door the player
   * comes back through to their own game (`Game.unload`).
   */
  function stop(): void {
    stopList();
    stopFollowing();
  }

  // The list belongs to the window: it is read when the window opens and not before — a page nobody has
  // asked anything of does not ask the server, and a page that has closed the window stops asking. A run
  // being watched is deliberately not the window's business: picking a row shuts the window (`App.vue`), and
  // the run is watched off the timeline from then on, which is where it is put away.
  watch(open, (up) => (up ? start() : stopList()), { immediate: true });

  // A `useRuns` that is not inside a component has no moment of its own to stop at — which is a test
  // rather than a page, and the only caller that ever has to say `stop` itself.
  if (getCurrentInstance()) onBeforeUnmount(stop);

  return { runs, error, opening, choose, stop };
}

/** The list itself did not come down. */
const aboutList = { offline: 'Список прогонов не дозвонился до сервера.', refused: 'Сервер не отдал список прогонов.' };

/** A run's own tape did not come down, or came down as a file this build cannot play. */
const aboutRun = {
  offline: 'Прогон не дозвонился до сервера.',
  refused: 'Сервер не отдал этот прогон.',
  unreadable: 'Прогон скачался, но игра не смогла его прочитать.',
};
