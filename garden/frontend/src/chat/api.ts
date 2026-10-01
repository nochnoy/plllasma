/**
 * The chat's own wire: the four calls the chat makes about the log and the runs, over four of the nine doors
 * the server opens (`backend/internal/api/server.go`) — the log of a place, the line written into it, the
 * list of runs the window draws beside that log, and one run's own tape, which is what picking a row off that
 * list asks for.
 *
 * The fifth door the window uses is deliberately not here: a run that is still being played is watched
 * through the recording side's own wire (`frontend/src/live/api.ts`, `LiveWire.stream`), which is about a run
 * rather than about talking.
 *
 * What is here is only the crossing. The shapes it crosses into are `messages.ts` and `runs.ts` — the same
 * types the interface draws — and the names on the wire are the server's own, snake_case and all, kept in
 * the `Wire*` types below so that the conversion happens once here rather than in every component that
 * reads a message.
 */
import { siteToken, type User } from '../auth';
import { GHOST, LOBBY, userpic, type ChatMessage, type MessagePart } from './messages';
import { asRun, type Run, type WireRun } from './runs';

/**
 * A door that did not open, with whatever the server said about it.
 *
 * A status of 0 stands for an answer that never came at all — no server, or a word that was not one —
 * which a caller cannot tell apart from the rest and does not need to: either way there is nothing to
 * draw and nothing to count.
 *
 * The sentence is the server's, and the server writes them in English (see `fail`): they are about the
 * request rather than for the player, so the window shows a Russian line of its own and keeps this one
 * for the console (`useChat`).
 */
export class Refused extends Error {
  readonly status: number;
  readonly sentence: string;

  constructor(status: number, sentence: string) {
    super(sentence);
    this.name = 'Refused';
    this.status = status;
    this.sentence = sentence;
  }
}

/**
 * A line on the wire, with the server's own omissions: a lobby line has no `tape` at all, and an
 * unanchored one has no `at_step`. Who wrote it is the `user_id` the server answered the writer's
 * token with, and the `nick` and `icon` are that player's own row — never anything the line itself
 * claimed, which is why a line on its way out carries no name at all.
 */
interface WireMessage {
  id: number;
  tape?: string;
  at_step?: number | null;
  user_id: number;
  nick: string;
  icon: string;
  ghost?: boolean;
  parts?: MessagePart[];
  sent_ms?: number;
}

/** A line the player has written, on its way out: `at_step` is null for the lobby, which has no steps. */
export interface Draft {
  tape: string;
  atStep: number | null;
  ghost: boolean;
  parts: readonly MessagePart[];
}

/**
 * The whole of what the chat asks the server for, in five calls — which is the point of it: what the
 * window and the strip see is one interface, so a test can be a fake wire rather than a fake server.
 */
export interface ChatWire {
  /**
   * The page's first call: the session's own token, and the player the site says owns it. It is the
   * handshake the page waits out on its black screen (`main.ts`), and the one call that has to come
   * before any other — every door of the server takes the token this call settles.
   */
  auth(): Promise<User>;
  /** The log of one place: everything written after `after`, which is 0 for the whole of it. */
  log(tape: string, after: number): Promise<ChatMessage[]>;
  /** One line, as the server took it down. */
  send(draft: Draft): Promise<ChatMessage>;
  /** Every run the server holds, newest first — which is the order the window's own list keeps. */
  runs(): Promise<Run[]>;
  /**
   * One run's own tape, as the file the game decodes (`decodeTape`).
   *
   * It is handed on as text rather than as a value on purpose: the tape is the game's own format, and
   * reading it is the decoder's job rather than this client's second opinion about it.
   */
  tape(id: string): Promise<string>;
}

/**
 * Where the API is, as the page sees it: beside the page itself, unless the build was told otherwise
 * (`VITE_API_BASE`).
 *
 * Beside the page rather than at the root of the site, because the whole app is built to be dropped into
 * any sub-directory (`base` in `vite.config.ts`): a copy of the game under `/garden/` talks to `/garden/api`,
 * which is the server put where the game is, and a copy served from the root talks to `/api`. In
 * development Vite answers that path by proxying to the Go server (`vite.config.ts`), which is what makes
 * one address work in both.
 */
export function apiBase(): string {
  const told: string | undefined = import.meta.env.VITE_API_BASE;
  const base = told ?? `${import.meta.env.BASE_URL}api`;
  // A base written with a trailing slash would otherwise double it and ask for `//messages`.
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/**
 * The doors, as `fetch` against a base, speaking for a token.
 *
 * The token is a parameter with a default (`siteToken`) because a test brings its own and a page has
 * no choice; the fetch itself is a parameter for the same reason: everything this client does — the
 * query it builds, the body it sends, the answer it reads — is worth holding on to, and the call
 * itself is the one part that is not.
 */
export function chatApi(base: string = apiBase(), take: typeof fetch = fetch, token: string = siteToken()): ChatWire {
  /** One request, as the text the server answered: the crossing itself is the module's own (`crossing`). */
  const fetchText = crossing(base, take, token);

  /** The same, as a value: every door but the tape's answers with one JSON value. */
  async function ask(path: string, init?: RequestInit): Promise<unknown> {
    return fromJSON(await fetchText(path, init));
  }

  return {
    async auth() {
      // The body is nothing and the token is the header it always is: this is the door that decides
      // what the header is worth, not one that carries anything of its own.
      const answer = (await ask('/auth', { method: 'POST' })) as { user?: Omit<User, 'id'> & { id?: number } } | null;
      if (!answer?.user || typeof answer.user.id !== 'number' || !answer.user.nick) {
        throw new Refused(0, 'the server answered a handshake without naming a player');
      }
      return { id: answer.user.id, nick: answer.user.nick, icon: answer.user.icon || '-' };
    },

    async log(tape, after) {
      const query = new URLSearchParams();
      // An absent `tape` is the lobby on the server's side, which is the one place a request may say
      // nothing: an empty string would only be trimmed there again. An `after` of 0 is the whole log.
      if (tape !== LOBBY) query.set('tape', tape);
      if (after > 0) query.set('after', String(after));
      const asked = query.toString();
      const answer = (await ask(`/messages${asked ? `?${asked}` : ''}`)) as {
        messages?: WireMessage[] | null;
      } | null;
      return (answer?.messages ?? []).map(line);
    },

    async send(draft) {
      const answer = (await ask('/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tape: draft.tape,
          at_step: draft.atStep,
          ghost: draft.ghost,
          parts: draft.parts,
        }),
      })) as { message?: WireMessage } | null;
      if (!answer?.message) throw new Refused(0, 'the server took a line without naming it');
      return line(answer.message);
    },

    async runs() {
      // No `tape` is asked for here: the list is the runs themselves, and a hundred of them being a
      // hundred files off a disk is the server's own business rather than this client's (`store.Recordings`).
      const answer = (await ask('/recordings')) as { recordings?: WireRun[] | null } | null;
      return (answer?.recordings ?? []).map(asRun);
    },

    async tape(id) {
      return fetchText(`/recordings/${encodeURIComponent(id)}`);
    },
  };
}

/**
 * A line as the interface reads it: the server's names turned into `messages.ts`'s, omissions and
 * all. The costume is put on here too — a ghost's line wears the ghost's own name and face over
 * whatever the server knows its writer by — so that no view ever has to ask what a `ghost` flag
 * means for the name and the picture beside it.
 */
function line(wire: WireMessage): ChatMessage {
  return {
    id: wire.id,
    tape: wire.tape ?? LOBBY,
    atStep: wire.at_step ?? null,
    userId: wire.user_id,
    nick: wire.ghost ? GHOST.nick : wire.nick,
    face: wire.ghost ? GHOST.face : userpic(wire.icon),
    ghost: wire.ghost ?? false,
    parts: wire.parts ?? [],
    sentMs: wire.sent_ms ?? 0,
  };
}

/**
 * One door of the server, as the text it answered, with the refusals of the API turned into `Refused`: the
 * door either opened or it did not.
 *
 * The text rather than a value, because one of these doors — a run's own tape — answers with the game's
 * own file rather than with JSON, and that file goes on to `decodeTape` exactly as it arrived.
 *
 * Every call carries the token, in the one header the server takes it from — the door that has not
 * been opened yet (`chatApi.auth`) is the door that asks what the token is worth, and it is a POST
 * with nothing else to say for exactly that reason.
 *
 * It is exported because this server has more than one wire: the chat's (`chatApi`, above) and the
 * recording side's (`frontend/src/live/api.ts`). A refusal is one thing whoever asked for what, and the
 * sentence the server writes is the same sentence in either console. `take` is `fetch`, except in a test,
 * which brings its own.
 */
export function crossing(base: string, take: typeof fetch, token: string = siteToken()): (path: string, init?: RequestInit) => Promise<string> {
  return async (path, init) => {
    let answer: Response;
    try {
      const headers = new Headers(init?.headers);
      if (token) headers.set('x-auth-token', token);
      answer = await take(`${base}${path}`, { ...init, headers });
    } catch (err) {
      throw new Refused(0, err instanceof Error ? err.message : String(err));
    }
    const text = await answer.text();
    if (!answer.ok) {
      throw new Refused(answer.status, sentenceOf(fromJSON(text)) ?? `${answer.status} ${answer.statusText}`);
    }
    return text;
  };
}

/**
 * An answer as a value: every door but the tape's answers with one JSON value, and a door that did not
 * open at all may answer with anything at all — a proxy's own page, an empty body, a word.
 */
function fromJSON(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** What the server said was wrong, as `fail` writes it (`{"error": "..."}`), or null if it said nothing. */
function sentenceOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { error } = body as { error?: unknown };
  return typeof error === 'string' && error ? error : null;
}
