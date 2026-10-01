/**
 * The runs the chat's window lists beside the conversation: what a recording is, as the interface draws
 * one, and the two readings a row of that list is made of.
 *
 * Nothing here talks to anybody — the wire is `chat/api.ts` — and nothing here decides anything: the
 * shapes are the server's (`backend/internal/store`), which is a run with the numbers a list needs about
 * it and none of the tape itself, and whether a run is still being played is that server's own word for
 * it (`live`) rather than anything this side works out from a clock.
 *
 * Both of the wires that read a run read it the same way — the window's own list and one row's tape
 * (`chat/api.ts`), and the door a run that is still being played is watched through (`live/api.ts`) — so
 * the crossing out of the server's names happens once, in one function here ({@link asRun}).
 */

/** One run, as a row of the window's own list is drawn from it. */
export interface Run {
  /** The server's own name for the run: what its tape is asked for by when the row is picked. */
  id: string;
  /** What the run was called when it was written down. */
  name: string;
  /** The nickname it was recorded under, which is who the row is signed by. */
  author: string;
  /** How long it lasts, in the tape's own steps. */
  steps: number;
  /** How long one of those steps is, in milliseconds: what makes the count a length in seconds. */
  stepMs: number;
  /** Whether it is still being played: its last slice was recent enough to believe so. */
  live: boolean;
}

/**
 * A run as the server writes it (`store.Recording`): the same numbers under the server's own names, and
 * nothing of the tape.
 *
 * The rest of what the server says about a recording — its seed, its size, when it was played — is
 * deliberately not here either: nothing on screen has a use for it yet, and a field read and thrown away
 * would be a claim about a shape this client does not really know.
 */
export interface WireRun {
  id: string;
  name: string;
  author: string;
  steps: number;
  step_ms: number;
  live?: boolean;
}

/** A run as the interface reads it: the server's names turned into this module's own, omissions and all. */
export function asRun(wire: WireRun): Run {
  return {
    id: wire.id,
    name: wire.name,
    author: wire.author,
    steps: wire.steps,
    stepMs: wire.step_ms,
    live: wire.live ?? false,
  };
}

/**
 * The word a row wears while the run it stands for is still being played.
 *
 * It is the one reading on the list that is not a clock, because a live run's own length is still
 * growing: a number written beside it would be out of date before it was read.
 */
export const LIVE = 'Live';

/**
 * How many runs the window keeps, newest first: the list is what there is to watch, not an archive of
 * everything ever played, and a hundred rows is more runs than anybody reads before picking one.
 */
export const KEPT_RUNS = 100;

/**
 * How many of those the column beside the conversation shows before it says «Ещё...» and opens the whole
 * list in a window of its own (`RunsDialog.vue`): the column is beside a chat, not instead of it, and fifty
 * rows is as far down as it goes without being the taller of the two.
 */
export const SIDEBAR_RUNS = 50;

/**
 * How long a run lasts, as a clock to a tenth of a second: `0:04.0`, `1:02.4`.
 *
 * A tenth rather than a whole second, for the same reason the tape's own bar reads one out to a tenth
 * (`TapeTimeline.vue`): a step is a fiftieth of a second, so a whole-second clock would barely move
 * during a short run, and a reading that never changed would look like a list that had stopped.
 *
 * Rounded to a tenth before it is split into minutes and seconds rather than after, or a run a hair under
 * a minute would read `0:60.0`: the reading is a clock, and a clock has no sixtieth second.
 */
export function runLength(run: Run): string {
  const tenths = Math.round((run.steps * run.stepMs) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths - minutes * 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** What a row reads out: the word for a run that is still being played, and its own length otherwise. */
export function runReading(run: Run): string {
  return run.live ? LIVE : runLength(run);
}
