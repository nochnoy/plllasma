import { getCurrentInstance, onBeforeUnmount, watch, type Ref } from 'vue';
import { liveApi, type LiveWire } from '../live/api';
import type { TapeSlice } from '../game/tape';
import type { Game, TapeReport } from '../game/game';

/**
 * The run this page is playing, handed to the server as it is played.
 *
 * A run begins by itself — the player's first touch of a doll (`Game.pressAt`) — so there is nothing for the
 * player to press here either, and nothing to watch: this reads the engine's own report (`useTape`) for a run
 * that has begun, opens it on the server, hands it a slice a second, and finishes it when the page goes away.
 *
 * What it is *for* is that somebody else can watch. The server keeps a run's head and pastes its slices onto
 * it as they arrive, so the tape of a run that is still going is the run so far, and the row a list draws for
 * it says it is still being played (`runs.ts`). Reading a run that way is the chat window's own business
 * (`useRuns`); a run the server never heard of is a run nobody watched, which is nobody's business but this
 * one's — so a failure here is one line in the console and nothing else, and the game the player is playing
 * is not the recording's.
 */
export interface LiveRunOptions {
  /** The wire the run goes over (`live/api.ts`): the real one, unless a test brings its own. */
  wire?: LiveWire;
  /** How often the run is asked what it has written, in milliseconds: the slice's own second by default. */
  every?: number;
  /** The nickname this page plays under: who the run is written under, read once when it begins. */
  author: () => string;
  /** The clock, for a run's own name and its own `recorded_ms`. A test brings its own. */
  now?: () => number;
}

/**
 * How often the run is asked for what it has written, in milliseconds: a second, which is what one slice of a
 * run is worth (`TAPE_SLICE_STEPS`), so the two ends agree about what a slice is.
 *
 * It is a timer rather than a watch of the run's own step count, because a run with nothing happening in it
 * writes nothing at all (`Game.runIsIdle`): there is no step to watch, and asking on a timer and being handed
 * nothing back is the right answer then — the run is standing still, and the silence is the run.
 */
const ASK_MS = 1000;

export function useLiveRun(game: Ref<Game | null>, tape: Ref<TapeReport>, options: LiveRunOptions) {
  const wire = options.wire ?? liveApi();
  const every = options.every ?? ASK_MS;
  const now = options.now ?? (() => Date.now());

  /** The run the server knows about, or null while there is none: what slices are sent to. */
  let id: string | null = null;
  /** The number of the next slice, counted from zero: the sender's own (`LiveWire.slice`). */
  let seq = 0;
  /** A slice that did not arrive, kept rather than dropped: it goes again under the number it had. */
  let owed: TapeSlice | null = null;
  /** Whether a send is on its way: one at a time, or a slow answer would put the run's seconds in order. */
  let busy = false;
  /** Whether this run's failure has been said in the console: one line a run rather than one a second. */
  let told = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** The name a run is written under: the clock it began at, which is what a list would show it as. */
  function nameFor(at: number): string {
    const clock = new Date(at);
    const two = (value: number): string => String(value).padStart(2, '0');
    return `Прогон ${two(clock.getHours())}:${two(clock.getMinutes())}`;
  }

  /** Two slices of one run as one: the steps added up, and the two lists put end to end. */
  function joined(first: TapeSlice, second: TapeSlice | null): TapeSlice {
    if (!second) return first;
    return {
      steps: first.steps + second.steps,
      frames: [...first.frames, ...second.frames],
      edits: [...first.edits, ...second.edits],
    };
  }


  /**
   * Opens the run the engine has just begun.
   *
   * The head is read off the engine rather than kept here (`Game.liveHead`): a run is the world's own, and
   * what crosses to the server is the shape a tape has before it has a step in it. A run that cannot be
   * opened is a run that is tried again on the next ask — a server that is not there yet is a server that may
   * be there in a second — and the name and `recorded_ms` it is opened with are the moment it began.
   */
  async function open(): Promise<void> {
    const head = game.value?.liveHead() ?? null;
    if (!head) return;
    const at = now();
    id = await wire.open(head, { name: nameFor(at), author: options.author(), recordedMs: at });
    seq = 0;
  }

  /**
   * Hands over what the run has written since the last slice, if anything: the one thing this does a second
   * while a run is going on.
   *
   * A slice that did not arrive is the next thing tried rather than a thing lost, and it goes under the number
   * it already had, so a send that half-happened is a send that happened once.
   */
  async function ask(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (id === null) {
        await open();
        return;
      }
      const slice = owed ?? game.value?.liveSlice() ?? null;
      if (!slice) return;
      // Kept until the server has it: a send that failed is the same slice again next time.
      owed = slice;
      await wire.slice(id, seq, slice);
      owed = null;
      seq++;
    } catch (err) {
      blame(err);
    } finally {
      busy = false;
    }
  }

  /**
   * The run as finished: whatever is left of it — a fraction of a second since the last slice — and the word
   * that ends it.
   *
   * It is called when the page goes away (a window being closed) and when the engine stops writing a run at
   * all (`stopRecording`). Watching somebody else's run is neither of those: the player's own run stands
   * suspended while the watched tape has the world and is not finished by it, so a player who comes back
   * from a watch keeps the run they had — the same id, the same count of slices — and what they do next
   * arrives as the next second of it. A slice that never went is part of the ending rather than a thing to
   * try again: there is no next time on the way out of a page.
   */
  async function end(): Promise<void> {
    const run = id;
    if (run === null) return;
    // Asking is over with the run: a window that is going away has no next second in it, and a run that
    // starts afterwards starts its own (`start`, from the engine's own report).
    stop();
    id = null;
    const tail = game.value?.liveSlice(1) ?? null;
    const piece = owed ? joined(owed, tail) : tail;
    owed = null;
    // The word that the run is over goes out whatever there is to carry it: a run whose last second went
    // out a moment before it ended owes nothing, and staying silent then would leave it open on the server
    // until the grace ran out — so the ending is sent as a slice with nothing in it, which is a slice the
    // server takes for exactly this (`readChunk` in `backend/internal/api`).
    const word = piece ?? { steps: 0, frames: [], edits: [] };
    try {
      await wire.end(run, seq, word);
    } catch (err) {
      blame(err);
    }
  }

  /**
   * What went wrong, once a run and in the console.
   *
   * Nobody at the window is told: a run that was not sent is a recording nobody is watching, and the game the
   * player is playing is not the recording's. Once rather than every second, because a page with no server at
   * all would otherwise say so a thousand times.
   */
  function blame(err: unknown): void {
    if (told) return;
    told = true;
    console.warn('[free-falling-girl] the run could not be sent:', err);
  }

  /** Reads the run at once and starts asking about it: what a run beginning does. */
  function start(): void {
    void ask();
    if (every > 0) timer = setInterval(() => void ask(), every);
  }

  /** Stops the timer: a page taken down with one running is a timer nobody can stop. */
  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  // The run belongs to the engine's own report: a run that has begun is opened and asked about, and a run
  // that is no longer being written — the engine told to stop, or the page going away — is finished and
  // left alone. A watch does not stop the writing: the report says `recording` straight through one, so the
  // asking (and the id it asks at) simply outlasts the silence, and the seconds that follow the watch are
  // numbered as the seconds before it were.
  watch(
    () => tape.value.recording,
    (writing) => {
      if (writing) {
        told = false;
        start();
        return;
      }
      stop();
      void end();
    },
    { immediate: true },
  );

  // A `useLiveRun` that is not inside a component has no moment of its own to stop at — which is a test
  // rather than a page, and the only caller that ever has to say `stop` itself.
  if (getCurrentInstance()) onBeforeUnmount(stop);

  return {
    /** Finishes the run now: what a page whose window is going away calls (`pagehide`). */
    end,
    stop,
  };
}
