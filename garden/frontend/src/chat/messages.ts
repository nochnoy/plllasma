/**
 * The chat: what the player reads on the strip beside the bar, and what the window that strip opens is
 * made of.
 *
 * Nothing here talks to anybody — the wire is `chat/api.ts` — but the shapes are the server's
 * (`backend/internal/store`), because the log is the server's: a message is written by one visitor,
 * hangs on a recording or on the lobby, and may sit at a step of that recording. What the interface
 * draws is a nickname, the 16×16 badge that goes before it, and a body that is a run of parts rather
 * than a string, which is what lets a gif sit in the middle of a sentence.
 */

/**
 * A gif an author dropped into the middle of what they were writing. Animated, and drawn at its own
 * size wherever it appears — in the strip, in the window, or in both at once.
 */
export interface GifPart {
  kind: 'gif';
  /** The file to draw, under the app's own base. */
  file: string;
  /** What the picture says, for the readers it never reaches. */
  alt: string;
}

/** A run of ordinary text: the whole of what the player's own field produces. */
export interface TextPart {
  kind: 'text';
  text: string;
}

/** What a message body is made of, in order. */
export type MessagePart = GifPart | TextPart;

/** The lobby: the conversation of a place with no recording under it. */
export const LOBBY = '';

/**
 * Where a message belongs, as the interface knows it: the recording it hangs on — {@link LOBBY} for
 * none — and where the playback is, in steps.
 *
 * The step is only read for a line that is anchored (`atStep`); a lobby line has none and is always in
 * front of the player.
 */
export interface Place {
  tape: string;
  step: number;
}

/**
 * One message, as the strip and the window both read it.
 *
 * The id is the server's, and is what the two lists are keyed by; a line the player has just sent and
 * the server has not answered yet is {@link PENDING} — drawn at once, and replaced by the server's own
 * line the moment it arrives.
 */
export interface ChatMessage {
  id: number;
  /** The recording it hangs on, or {@link LOBBY}. */
  tape: string;
  /** The step of that recording it is about, or null when it is about the run as a whole. */
  atStep: number | null;
  /** Who wrote it. */
  nick: string;
  /** Their badge, 16×16 on screen: the file's own name, under `assets/chat` ({@link badgeSrc}). */
  badge: string;
  /** Whether it was written as the ghost: the name is the field's business, this is what says so. */
  ghost: boolean;
  /** What they wrote. */
  parts: readonly MessagePart[];
  /** When the server took it, in Unix milliseconds. */
  sentMs: number;
}

/** The id of a line the player has sent and the server has not answered yet. */
export const PENDING = 0;

/** How many messages the strip along the bottom of the window shows: its four lines. */
export const TICKER_LINES = 4;

/**
 * How many lines the window holds: the tail of the log, which is all the server sends
 * (`store.messageLimit` in `backend/internal/store`) and all a visit keeps. A conversation is read rather
 * than archived, and a page left open for hours holds the same fifty a page just opened is sent.
 */
export const WINDOW_LINES = 50;

/**
 * Who is speaking: a nickname and the badge that goes with it.
 *
 * The two travel together wherever one of them is drawn — a message wears both, and so does the
 * player's own field — which is why they are one thing here rather than two arguments everywhere.
 */
export interface Speaker {
  nick: string;
  badge: string;
}

/** Who the player speaks as. There is no signing in, so the chat is one more nickname in the list. */
export const PLAYER_NICK = 'Ты';

/**
 * Who the player speaks as when the chat is anonymous: a name and a badge of their own, and the only
 * speaker here that is not a person. Nobody's messages change when it is picked — what changes is who
 * the next one is signed by.
 */
export const GHOST_NICK = 'Привидение';

/**
 * Where the chat's own pictures live — the same base the renderer builds its asset paths off.
 *
 * A badge travels as the file's own name rather than as a path, because the name is the same in every
 * build of the port and a path is not: the base it is read under belongs to whoever is reading. The
 * gifs a body may hold are paths already (`assets/chat/*.gif`), since a body is written by a player
 * rather than by the game.
 */
export function badgeSrc(badge: string): string {
  return `${import.meta.env.BASE_URL}assets/chat/${badge}`;
}

/** The two badges the field switches between. */
export const PLAYER_BADGE = 'badge-player.gif';
export const GHOST_BADGE = 'badge-ghost.gif';

/** The player as themselves, and the player as the ghost: the two the field switches between. */
export const PLAYER: Speaker = { nick: PLAYER_NICK, badge: PLAYER_BADGE };
export const GHOST: Speaker = { nick: GHOST_NICK, badge: GHOST_BADGE };

/**
 * Who speaks under a name: the player under a name of their own, or the ghost when there is no name at all
 * — which is what the auth dialog's empty field leaves behind, and what a page whose question was never
 * answered is.
 *
 * The two fixed speakers are handed back as they are rather than rebuilt from their parts, so that a line
 * is signed by the player's own name or by the ghost's and never by a third one that merely looks like
 * both: `useChat` holds what is left of the log by identity in places, and two equal nicknames are not
 * the same speaker.
 */
export function speakerFor(nick: string): Speaker {
  const trimmed = nick.trim();
  if (trimmed === PLAYER_NICK) return PLAYER;
  if (!trimmed) return GHOST;
  return { nick: trimmed, badge: PLAYER_BADGE };
}

/** The last `count` messages, oldest first: what the strip shows, and the order a chat reads in. */
export function lastMessages(messages: readonly ChatMessage[], count: number): ChatMessage[] {
  return messages.slice(Math.max(0, messages.length - count));
}

/**
 * What a playback has reached: the lines a moment of a run shows.
 *
 * A line about the run as a whole (`atStep === null`) is in front of the player from the first step —
 * it is about the run they are watching rather than about a moment of it — and an anchored line
 * appears the moment the playhead passes its step. Every line of the lobby is of the first kind, so
 * this is also the whole answer for a place with no tape on it.
 */
export function reachedAt(messages: readonly ChatMessage[], step: number): ChatMessage[] {
  return messages.filter((message) => message.atStep === null || message.atStep <= step);
}

/**
 * What the player just typed, as a line of its own, before the server has answered: text only — gifs
 * come from the list of them the field offers — and {@link PENDING} for an id, which is what tells
 * `useChat` to replace this line rather than to draw it beside the server's own one.
 *
 * It hangs where the player is: on the run that is loaded and at the step the playhead is standing on,
 * or on the lobby, where there is no step to speak of. That is what makes a line written during a
 * playback point at the moment it was written about.
 */
export function playerMessage(
  typed: string,
  speaker: Speaker,
  place: Place,
  ghost: boolean,
): ChatMessage {
  return {
    id: PENDING,
    tape: place.tape,
    atStep: place.tape === LOBBY ? null : place.step,
    nick: speaker.nick,
    badge: speaker.badge,
    ghost,
    parts: [{ kind: 'text', text: typed }],
    sentMs: Date.now(),
  };
}

