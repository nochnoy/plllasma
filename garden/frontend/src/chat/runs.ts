/**
 * What a recording is, as the interface draws one: the numbers a run's own line in the chat needs
 * about it — its id, whether it is still being played, and what its line is saying right now.
 *
 * Nothing here talks to anybody — the wire is `chat/api.ts` — and nothing here decides anything: the
 * shapes are the server's (`backend/internal/store`), which is a run with the numbers its link in the
 * chat is drawn from and none of the tape itself. Whether a run is still being played is that
 * server's own word for it (`live`) rather than anything this side works out from a clock, and the
 * words of its line are the run's own (`label`), rewritten by whoever is playing it as the play goes
 * on — the message in the log only carries the link (`RunPart` in `messages.ts`).
 *
 * Both of the wires that read a run read it the same way — the rows the chat asks for
 * (`chat/api.ts`), and the door a run that is still being played is watched through (`live/api.ts`) —
 * so the crossing out of the server's names happens once, in one function here ({@link asRun}).
 */

/** One run, as its link in the chat is drawn from it. */
export interface Run {
  /** The server's own name for the run: what its tape is asked for by when the link is followed. */
  id: string;
  /** What the run was called when it was written down. */
  name: string;
  /** The nickname it was recorded under, which is who the link's line is signed by. */
  author: string;
  /** How long it lasts, in the tape's own steps. */
  steps: number;
  /** How long one of those steps is, in milliseconds: what makes the count a length in seconds. */
  stepMs: number;
  /** Whether it is still being played: its last slice was recent enough to believe so. */
  live: boolean;
  /**
   * What the run's own line in the chat is saying: written when the run begins (`RUN_STARTED` in
   * `messages.ts`) and rewritten as the play goes on, so every window that shows the link shows the
   * run's latest word for itself. Empty when nobody has said anything yet, which the line draws its
   * own word for.
   */
  label: string;
}

/**
 * A run as the server writes it (`store.Recording`): the same numbers under the server's own names,
 * and nothing of the tape.
 *
 * The rest of what the server says about a recording — its seed, its size, when it was played, the
 * message its line is — is deliberately not here either: nothing on screen has a use for it, and a
 * field read and thrown away would be a claim about a shape this client does not really know.
 */
export interface WireRun {
  id: string;
  name: string;
  author: string;
  steps: number;
  step_ms: number;
  live?: boolean;
  label?: string;
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
    label: wire.label ?? '',
  };
}
