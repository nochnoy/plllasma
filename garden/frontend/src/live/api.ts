import { siteToken } from '../auth';
import { Refused, apiBase, crossing } from '../chat/api';
import { asRun, type Run, type WireRun } from '../chat/runs';
import type { TapeEdit, TapeFrame, TapeHead, TapeSlice } from '../game/tape';

/**
 * The wire a run that is still being played goes over: the four doors of the server that are about recordings
 * rather than about talking (`backend/internal/api/server.go`) — opening a run, handing it one slice of
 * itself, finishing it, and reading back what it has so far.
 *
 * It is deliberately not the chat's own wire (`chat/api.ts`), although it is the same server and the same
 * crossing (`crossing`): the chat is messages and this is a run, and a page that never touches a doll never
 * opens anything here. What travels over it are the game's own shapes — a head (`TapeHead`) and slices
 * (`TapeSlice`) — and the names on the wire are the server's own, kept in the types below so that the
 * conversion happens here once rather than in whoever sends.
 *
 * The last of the four doors is the other way round from the other three: reading what a run has so far, a
 * slice at a time, which is how a window watches somebody else's run while it is still being played
 * ({@link LiveWire.stream}). It lives here rather than on the chat's own wire although the chat's window is
 * what uses it, because what it carries is a run rather than a conversation.
 */

/**
 * A slice as the server writes one: the tape's own three fields (`TapeSlice`) with the number the slice
 * arrived under, which is the sender's own and is what a viewer asks past (`LiveWire.stream`).
 */
interface WireSlice {
  seq: number;
  steps: number;
  frames: TapeFrame[];
  edits: TapeEdit[];
}

/**
 * What the doors of this wire answer with: a run's own row, and — from the door a run is watched through —
 * the head its tape was opened with and the slices that have arrived since.
 */
interface WireAnswer {
  recording?: WireRun;
  head?: TapeHead | null;
  chunks?: WireSlice[] | null;
}

/** What a run is opened with besides its head: the one thing a list draws about it. Who played it is
 * nobody the wire's to say — the token carrying the call is, and the server answers for it at its own
 * door. */
export interface LiveRunDraft {
  /** What the run was called when it was written down. A list reads it and does not draw it. */
  name: string;
  /** When the run started, in milliseconds since the epoch: the row's own `recorded_ms`. */
  recordedMs: number;
}

/**
 * A slice of a live run as the server hands it back: the piece of the run, and the number it arrived under.
 *
 * It is a `TapeSlice` with the sender's own number on it — which is what a *viewer* needs and a sender does
 * not: the number is how the next ask says what it already has (`LiveWire.stream`), and a viewer that has
 * been watching a run from its beginning holds every number from zero up.
 */
export interface LiveSlice extends TapeSlice {
  readonly seq: number;
}

/**
 * A run that is still being played, as one viewer is handed it: the run's own row, the head its tape was
 * opened with, and the slices it has after the one the viewer asked past ({@link LiveWire.stream}).
 *
 * A viewer that has just arrived asks past nothing at all and is answered the whole run so far, so a run that
 * began before this page did is still watched from its own beginning.
 */
export interface LiveStream {
  /** The run as a row of the window's own list reads it: its id, its numbers, whether it is still going. */
  readonly run: Run;
  /**
   * The head of its tape — its format, its step, its seed and its stage — which is all a viewer has of a run
   * before the first slice arrives. Null for a run that was uploaded whole, which never grows by slices.
   */
  readonly head: TapeHead | null;
  /** What has arrived since the slice the viewer asked past, in the order it was played; empty if nothing. */
  readonly slices: LiveSlice[];
}

/**
 * The whole of what a run is asked of the server, both ways round: sending one as it is played, and reading
 * one back while it is still going.
 *
 * Sending is a head and then slices, and the calls are those two things: `open` keeps the head and answers
 * the address the slices go to, and `slice` adds one second of the run to it. Nothing tells the server the
 * run is over except the last slice (`end`), and nothing has to: a run whose slices stop arriving stops being
 * live on its own (`liveGraceMs` in `backend/internal/store`).
 *
 * Reading is the same two things the other way round (`stream`): the head a run was opened with, and the
 * slices of it that have arrived since the one its viewer already has.
 */
export interface LiveWire {
  /**
   * Opens a run that is to arrive as it is played, and answers the id its slices are sent to.
   *
   * What is sent is the head of a tape that does not exist yet (`TapeHead`): its format, its step, the seed
   * its run's own odds came from, and the stage it started on. Nothing is stored of the run itself until a
   * slice arrives, and a run whose player closed the window before sending one is a run with nothing in it.
   */
  open(head: TapeHead, run: LiveRunDraft): Promise<string>;
  /**
   * Hands one slice of a run over, while the run goes on.
   *
   * `seq` counts from zero and is the *sender's* own number, which is what makes a slice that was sent twice
   * — an answer that never came back — arrive once: the number is the slice (`Store.AppendChunk`), and the
   * slice handed over again under the number it already had does not grow the run twice.
   */
  slice(id: string, seq: number, slice: TapeSlice): Promise<void>;
  /**
   * The last slice of a run: the one that ends it.
   *
   * It is a call of its own because it is sent on the way *out* of a page — a window being closed, a phone
   * going to sleep — where a request has to outlive the page that made it (`keepalive`), and because the
   * server takes it differently: a slice after one marked as the last is refused (`ErrSealed`).
   */
  end(id: string, seq: number, slice: TapeSlice): Promise<void>;
  /**
   * What a run that is still being played has so far: the head its tape was opened with, and the slices that
   * have arrived after the one the caller already has.
   *
   * This is the door a window watches somebody else's run through while it is still going, and it is asked
   * over and over — once a second, which is what one slice of a run is worth (`TAPE_SLICE_STEPS`) — for as
   * long as the run goes on. `after` is the number of the last slice the caller has, and a caller that has
   * none asks past -1: the answer is then the head and every slice of the run, which is what a window that
   * has just arrived asks for.
   */
  stream(id: string, after: number): Promise<LiveStream>;
  /**
   * The run's own word in the chat: which line of the log is the run's, and what that line says. A page
   * writes both at once, the moment its run begins — the line having just been posted with a link to the
   * run in it — and rewrites the words as the play goes on, so the link says what the run is doing rather
   * than what it did. Either half may be left alone; the server takes the words from the run's own player
   * and nobody else (`ErrForbidden` in `backend/internal/store`).
   */
  chat(id: string, note: { message?: number; label?: string }): Promise<void>;
}

/**
 * The wire as the page uses it: `base` is where the API is (`apiBase`), `take` is `fetch` except in a
 * test, which brings its own, and the token is the session's own (`siteToken`) — the recorder is as
 * signed in as the talker is, and the run it sends is by whoever the token says is playing.
 */
export function liveApi(base: string = apiBase(), take: typeof fetch = fetch, token: string = siteToken()): LiveWire {
  const fetchText = crossing(base, take, token);

  /** One door that answers with JSON, as the value it answered: the recording side has no other kind. */
  async function ask(path: string, init?: RequestInit): Promise<WireAnswer | null> {
    return JSON.parse(await fetchText(path, init)) as WireAnswer | null;
  }

  /** One slice, as the body the door takes: the tape's own numbers under the server's own names. */
  function body(seq: number, slice: TapeSlice, last: boolean): RequestInit {
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seq, steps: slice.steps, frames: slice.frames, edits: slice.edits, last }),
    };
  }

  /** The id of a run the server has just been handed, or a refusal saying it named none. */
  function idOf(answer: WireAnswer | null): string {
    if (!answer?.recording?.id) throw new Refused(0, 'the server took a run without naming it');
    return answer.recording.id;
  }

  /**
   * The run an answer is about, or a refusal saying the server answered about no run at all: a door that did
   * not say which run it is talking about has not answered.
   */
  function runOf(answer: WireAnswer | null): Run {
    if (!answer?.recording) throw new Refused(0, 'the server answered about no run');
    return asRun(answer.recording);
  }

  return {
    async open(head, run) {
      return idOf(
        await ask('/recordings/live', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: run.name, recorded_ms: run.recordedMs, head }),
        }),
      );
    },

    async slice(id, seq, slice) {
      await ask(`/recordings/${encodeURIComponent(id)}/chunks`, body(seq, slice, false));
    },

    async end(id, seq, slice) {
      // `keepalive` is what makes this one different: it is sent as the page is going away, and a request
      // that is cancelled with its own window would end the run nowhere but in the console.
      await ask(`/recordings/${encodeURIComponent(id)}/chunks`, { ...body(seq, slice, true), keepalive: true });
    },

    async stream(id, after) {
      // `after` is always a number here, `-1` for a viewer that has nothing yet: the server reads the query
      // the way the store does, where anything below zero is a viewer with no slice behind it at all.
      const answer = await ask(`/recordings/${encodeURIComponent(id)}/chunks?after=${Math.round(after)}`);
      return {
        run: runOf(answer),
        head: answer?.head ?? null,
        slices: (answer?.chunks ?? []).map((one) => ({
          seq: one.seq,
          steps: one.steps,
          frames: one.frames,
          edits: one.edits,
        })),
      };
    },

    async chat(id, note) {
      await ask(`/recordings/${encodeURIComponent(id)}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(note),
      });
    },
  };
}
