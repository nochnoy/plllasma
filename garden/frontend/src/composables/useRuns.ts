import { getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import { chatApi, Refused, type ChatWire } from '../chat/api';
import type { Run } from '../chat/runs';
import { appendSlice, encodeTape, tapeFrom, type Tape } from '../game/tape';
import { liveApi, type LiveWire } from '../live/api';

/**
 * What picking a run is: one id — the id a link in the chat carries, or the one the page's address
 * was opened with — and that run onto the timeline, walking.
 *
 * There is no list to pick from any more: the chat's lines *are* the list, one line per run, written
 * the moment the run begins and linking it ever after (`useLiveRun`, `RunPart`). What is left here is
 * the picking itself, and it has two kinds of run to handle. A run that is over comes down as one
 * file (`ChatWire.tape`, the game's own tape byte for byte). A run that is *still being played* comes
 * down as what it has so far — a head and the slices of it that have happened (`LiveWire.stream`) —
 * and the rest of it follows, a slice at a time, pasted onto the tape that is already on the timeline
 * ({@link RunsOptions.grow}) for as long as the run goes on. That is the whole of what watching
 * somebody else's run is.
 *
 * What goes onto the timeline is the caller's business ({@link RunsOptions.play}, which is the engine,
 * in the only caller there is — `App.vue`), because this is the way into a run rather than the tape's
 * engine.
 */
export interface RunsOptions {
  /** The wire a run's file is read over (`chat/api.ts`): the real one, unless a test brings its own. */
  wire?: ChatWire;
  /** The wire a run that is still being played is watched over (`live/api.ts`): the recording side's own. */
  stream?: LiveWire;
  /**
   * How often a run that is still being played is asked what it has written, in milliseconds; 0 never
   * does, which a test wants. A second by default (`WATCH_MS`), which is what one slice of a run is
   * worth.
   */
  liveEvery?: number;
  /**
   * What a run's own tape is handed to ({@link open}), together with the id it was asked for.
   *
   * It is the run as a *file*, whoever it came from: a run that is over arrives as one
   * (`ChatWire.tape`), and a run that is still being played arrives as the head and the slices of it
   * that have happened (`LiveWire.stream`), which are a tape before they are a file
   * ({@link appendSlice}). The engine reads one thing and the same either way, and what it does with
   * it is the caller's.
   */
  play(id: string, tape: string): void;
  /**
   * The run being watched has more of itself: the tape it has grown into, pasted together on this side
   * ({@link appendSlice}), and the run's row as the server last put it — which is what says whether the
   * run is still being played, and so whether the tape under the walk is going to grow again
   * (`Game.growTape`).
   *
   * It is called only for a run that is still being played, and only after `play` has handed over the
   * run so far: what the caller does with the tape is put it under a playback that is already walking.
   */
  grow(run: Run, tape: Tape): void;
}

/**
 * How often a run that is still being played is asked what it has written, in milliseconds.
 *
 * A second, which is the same second the run itself is sent in: a slice of a run is worth a second
 * (`TAPE_SLICE_STEPS`), so asking twice as often would be asking twice for the same slice and asking
 * half as often would be watching a run in two-second jumps.
 */
const WATCH_MS = 1000;

/**
 * The sentences a run that would not open is refused with, in the player's own language: a request
 * that never landed is the player's connection and a door that did not open is the server's own
 * answer, and the server's English sentence is left in the console, where whoever can do something
 * about it is looking anyway (`blame`).
 */
const about = {
  offline: 'Запись не дозвонилась до сервера.',
  refused: 'Сервер не отдал запись.',
  unreadable: 'Запись скачалась, но игра не смогла её прочитать.',
};

export function useRuns(options: RunsOptions) {
  const wire = options.wire ?? chatApi();
  const stream = options.stream ?? liveApi();
  const liveEvery = options.liveEvery ?? WATCH_MS;

  /** Why the last run asked for did not open, in the player's own language, or null while none did. */
  const error = ref<string | null>(null);
  /**
   * The run whose tape is on its way down, or null: what a link waits for before it can be followed
   * again — one at a time is all the asking there is.
   */
  const opening = ref<string | null>(null);

  /**
   * The run being watched, or null: its own id, the tape this page has of it so far, and the number of
   * the last slice in that tape — which is what the next ask asks past (`after`).
   *
   * All three are plain variables rather than refs: nothing draws a run that is being watched, because
   * what is on screen is the tape itself and the engine pushes a report about that (`useTape`), and a
   * second copy of it here would be a second thing to keep in step.
   */
  let watching: string | null = null;
  let seen: Tape | null = null;
  let after = -1;
  /** Whether this run's own trouble has been said in the console: one line a run rather than one a second. */
  let told = false;

  /**
   * One run asked for by its id: whatever kind of run it is, it goes onto the timeline and starts
   * walking, and a run that is still being played goes on growing there for as long as it goes on.
   *
   * One at a time — a second ask while the first is on its way down is the same run again, and an ask
   * while one is being *watched* takes the timeline from it (`stopFollowing`).
   */
  async function open(id: string): Promise<void> {
    if (opening.value !== null) return;
    opening.value = id;
    stopFollowing();
    try {
      // The head is asked for first, because it is what says which kind of run this is: a run with a
      // head is a run that is still being played (`LiveWire.stream` answers `null` for one that was
      // uploaded whole), and a run without one is a file that was over before it arrived.
      const soFar = await stream.stream(id, -1);
      if (soFar.head) {
        let tape = tapeFrom(soFar.head);
        let last = -1;
        for (const slice of soFar.slices) {
          tape = appendSlice(tape, slice);
          last = slice.seq;
        }
        error.value = null;
        options.play(id, encodeTape(tape));
        follow(id, tape, last);
        return;
      }
      // A run that is over: one file, read as the game's own format and handed to the engine as it is.
      const tape = await wire.tape(id);
      error.value = null;
      options.play(id, tape);
    } catch (err) {
      blame(err);
    } finally {
      opening.value = null;
    }
  }

  /**
   * Watches a run that is still being played: the tape of it this page has put together, and the number
   * of the last slice in that tape.
   *
   * The run is asked about at once — the answer to that ask is what has happened since, which for a run
   * picked up mid-play is the next second of it — and every second after that, for as long as the run
   * goes on (`WATCH_MS`). It is a timer rather than a watch of the run's own numbers because a run
   * with nothing happening in it writes nothing at all: its player is away from the window, or asleep,
   * and silence is then the right answer rather than a sign that the run is over.
   */
  function follow(id: string, tape: Tape, seq: number): void {
    watching = id;
    seen = tape;
    after = seq;
    told = false;
    void ask();
    if (liveEvery > 0) followTimer = setInterval(() => void ask(), liveEvery);
  }

  /**
   * One ask of the run being watched: what has arrived since the slice this page already has.
   *
   * What arrives is pasted onto what the page has ({@link appendSlice}) and handed to the caller, which
   * is what puts it under the playback already walking the run (`Game.growTape`).
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
   * Stops watching: the run is over, the tape has come off the timeline, or another link has been followed.
   *
   * Nothing is said to the engine here, and nothing has to be. A run's own ending arrives with the last
   * slice — the row that comes with it is the one that says there is nothing more to wait for
   * (`Game.growTape`) — and a tape taken off the timeline takes the walk with it (`Game.unload`).
   */
  function stopFollowing(): void {
    if (followTimer !== null) clearInterval(followTimer);
    followTimer = null;
    watching = null;
    seen = null;
    after = -1;
  }

  /**
   * What went wrong, in the player's own language.
   *
   * The same split as the chat's own `blame`: a request that never landed is the player's connection
   * and a door that did not open is the server's own answer. `about.unreadable` is the third thing a
   * run can be, and the reason a failure that is neither of the two above is not always the server's
   * fault: the tape is fetched and then handed on, and a file the game cannot read came down
   * perfectly well (`decodeTape`, which throws a sentence of its own when a file is not a run this
   * build can play).
   */
  function blame(err: unknown): void {
    console.warn('[free-falling-girl] the run could not be opened:', err);
    if (err instanceof Refused) error.value = err.status === 0 ? about.offline : about.refused;
    else error.value = about.unreadable;
  }

  /**
   * What went wrong while watching, once a run and in the console.
   *
   * Nobody at the window is told: the run is on the timeline and the player is watching it, so a
   * second of it that did not arrive is a second the tape does not grow by rather than a run that
   * went away. Like the recording side's own failures, once a run is enough: a page with no server
   * behind it would otherwise say so every second.
   */
  function blameFollow(err: unknown): void {
    if (told) return;
    told = true;
    console.warn('[free-falling-girl] the run could not be followed:', err);
  }

  let followTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Stops asking the server anything. It is what the page calls when the tape comes off the timeline
   * (`App.vue`), because a run that is not on the timeline any more is a run nobody is watching — and
   * what takes a tape off is its own bar's «Закрыть», the same door the player comes back through to
   * their own game (`Game.unload`).
   */
  function stop(): void {
    stopFollowing();
  }

  // A `useRuns` that is not inside a component has no moment of its own to stop at — which is a test
  // rather than a page, and the only caller that ever has to say `stop` itself.
  if (getCurrentInstance()) onBeforeUnmount(stop);

  return { open, error, opening, stop };
}
