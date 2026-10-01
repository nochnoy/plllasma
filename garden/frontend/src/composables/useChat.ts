import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue';
import { chatApi, Refused, type ChatWire, type Draft } from '../chat/api';
import {
  GHOST,
  lastMessages,
  LOBBY,
  playerMessage,
  PLAYER_NICK,
  PENDING,
  reachedAt,
  speakerFor,
  TICKER_LINES,
  WINDOW_LINES,
  type ChatMessage,
  type Place,
} from '../chat/messages';

/**
 * The chat, as the interface sees it: the log of where the player is, whether the window is open, who
 * they are writing as, and the things the two views do about it.
 *
 * The log is the server's (`chat/api.ts`) rather than a mock any more, and it is read rather than pushed:
 * once when the page comes up, again whenever the place changes — a recording's conversation and the
 * lobby are two of them — and on a timer after that, because the chat is other people's as much as the
 * player's. What is kept here is a copy of it, and every catch-up is only what has been written since.
 *
 * Keeping the log here rather than in the components is what lets the strip and the window be two views
 * of one thing: the strip is the last {@link TICKER_LINES} lines of what this moment of the place shows
 * ({@link reachedAt}), and the window is the whole of the same thing.
 */
export interface ChatOptions {
  /** The wire the chat speaks on (`chat/api.ts`): the real one, unless a test brings its own. */
  wire?: ChatWire;
  /**
   * The name the player is playing under, as the auth dialog answered it (`NickDialog`); '' is a player who
   * gave none, who speaks as the ghost. Defaults to the name the chat has always had for them.
   */
  nick?: string;
  /** How often to catch up on what has been written, in milliseconds; 0 never does, which a test wants. */
  every?: number;
}

/** How long the chat lets other people talk before it asks what they said. */
const CATCH_UP_MS = 2000;

/**
 * Where the player is when nothing is loaded on the tape: the lobby, which has no timeline at all, so
 * the step here is one nothing anchored will ever be read against.
 *
 * It is the default rather than what `App.vue` passes, because a `useChat` that no run is watching is not
 * a special case — it is the game before anything is recorded or played.
 */
function atTheLobby(): Place {
  return { tape: LOBBY, step: 0 };
}

export function useChat(place: () => Place = atTheLobby, options: ChatOptions = {}) {
  const wire = options.wire ?? chatApi();
  const every = options.every ?? CATCH_UP_MS;

  /**
   * The log of the place, whole and in the order the server gave it: the shapes of `messages.ts`, with
   * the server's own ids, so that a catch-up is a question about an id rather than about a length.
   */
  const log = ref<ChatMessage[]>([]);
  /** Whether the window the chat button opens is on screen. */
  const open = ref(false);
  /** Whether the player is writing as the ghost. Only what is sent from now on is signed by it. */
  const anonymous = ref(false);
  /** Why the last thing the chat tried did not happen, in the player's own language, or null. */
  const error = ref<string | null>(null);
  /** Whether a line is on its way to the server: a second press in the meantime would be a second line. */
  const sending = ref(false);

  /**
   * The name the player is playing under. It is not `anonymous`: that switch is the field's own, and this
   * is what the auth dialog answered with — a name of the player's own, or nothing at all for the ghost's.
   */
  const nick = ref(options.nick ?? PLAYER_NICK);

  /**
   * Who the next line will be sent as, and who the field is showing: the ghost while the field says so, and
   * otherwise the player under whatever name the chat has for them ({@link speakerFor}).
   */
  const speaker = computed(() => (anonymous.value ? GHOST : speakerFor(nick.value)));

  /**
   * What this moment of the place shows — which is the whole of what both views draw.
   *
   * In the lobby that is the whole conversation. On a run it is what the playhead has reached
   * ({@link reachedAt}): everything said about the run itself, which is about what the player is
   * watching, plus what has been said about the steps already played. A line written during a playback
   * is anchored at the step it was written at, so this is also what stops a window from reading a
   * conversation ahead of the run it belongs to.
   */
  const messages = computed(() => reachedAt(log.value, place().step));

  /** The strip's own four lines, newest at the bottom — the way a chat reads. */
  const ticker = computed(() => lastMessages(messages.value, TICKER_LINES));

  /** One past the last id read: what a catch-up asks the server for. */
  function highest(): number {
    return log.value.reduce((last, message) => Math.max(last, message.id), 0);
  }

  /**
   * The whole log of where the player is: read when the page comes up and whenever the place changes,
   * since a recording's conversation and the lobby's are two different ones.
   */
  async function load(): Promise<void> {
    const { tape } = place();
    try {
      const list = await wire.log(tape, 0);
      // A slow answer for a place the player has been and left is not the conversation they are reading
      // now: the answer that stands is the one for the tape they are on.
      if (place().tape !== tape) return;
      log.value = list;
      error.value = null;
    } catch (err) {
      blame(err);
    }
  }

  /**
   * What has been written since the last line read: how a chat stays a chat without a socket.
   *
   * A line that arrives twice — a catch-up and a send crossing on the wire — is kept once, by id, so that
   * the strip never shows the same sentence twice. What is kept is the tail of it
   * ({@link WINDOW_LINES}), the same fifty the server sends a page that has just arrived: the log is what
   * is being read, and an hour of it staying open does not make it an archive.
   */
  async function catchUp(): Promise<void> {
    const { tape } = place();
    const after = highest();
    try {
      const list = await wire.log(tape, after);
      if (place().tape !== tape || !list.length) return;
      log.value = lastMessages([...log.value, ...list.filter((message) => message.id > after)], WINDOW_LINES);
    } catch (err) {
      blame(err);
    }
  }

  /**
   * What went wrong, in the player's own language.
   *
   * The server's sentences are English and about the request (`Refused`), which is right for whoever is
   * holding the other end of the wire and not for the person at the window — so the fact is what the
   * window is told, and the sentence goes to the console, where whoever can do something about it is
   * looking anyway.
   */
  function blame(err: unknown): void {
    console.warn('[free-falling-girl] the chat could not reach the server:', err);
    error.value = err instanceof Refused && err.status === 0
      ? 'Чат не дозвонился до сервера.'
      : 'Сервер не принял это: попробуйте ещё раз.';
  }

  /**
   * What the player sent.
   *
   * An empty field sends nothing, and a line goes up at once under {@link PENDING} — the strip answers
   * the finger the way a chat does rather than after a round trip, and the next line may be typed while
   * this one is still on its way. The server's own line replaces it when it lands; when it does not, the
   * pending line is taken back and the reason is shown, and `true` from here is what clears the field.
   *
   * Where the line hangs is the place: anchored at the step the playhead is standing on while a run is
   * loaded, which is what makes it a line *about* that moment, and in the lobby unanchored — there is no
   * step to sit at there, and the server would refuse one.
   */
  async function send(typed: string): Promise<boolean> {
    const trimmed = typed.trim();
    if (!trimmed || sending.value) return false;
    const where: Place = place();
    const draft: Draft = {
      tape: where.tape,
      atStep: where.tape === LOBBY ? null : where.step,
      nick: speaker.value.nick,
      badge: speaker.value.badge,
      ghost: anonymous.value,
      parts: [{ kind: 'text', text: trimmed }],
    };
    sending.value = true;
    log.value = [...log.value, playerMessage(trimmed, speaker.value, where, anonymous.value)];
    try {
      const written = await wire.send(draft);
      log.value = log.value.map((message) => (message.id === PENDING ? written : message));
      error.value = null;
      return true;
    } catch (err) {
      log.value = log.value.filter((message) => message.id !== PENDING);
      blame(err);
      return false;
    } finally {
      sending.value = false;
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null;

  /** Reads the log where the player is, and starts asking about it again on a timer. */
  function start(): void {
    void load();
    if (every > 0) timer = setInterval(() => void catchUp(), every);
  }

  /** Stops the timer: a page taken down with one running is a timer nobody can stop. */
  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  // The conversation belongs to the place: a run put on the tape is another log, and the strip is the new
  // one from the first answer. The step of the place is deliberately not watched, or a playback would
  // re-read the whole log on every one of its steps — what a run shows of it moves by itself (`messages`).
  watch(() => place().tape, () => void load());

  // A `useChat` that is not inside a component has no moment of its own to stop at — which is a test
  // rather than a page, and the only caller that ever has to say `stop` itself.
  if (getCurrentInstance()) onBeforeUnmount(stop);

  start();

  return {
    /** What the player reads: the strip's last few lines of it, and the whole window. */
    messages,
    ticker,
    open,
    anonymous,
    /** The name the player is playing under, '' for the ghost's own: what the field's left end shows. */
    nick,
    speaker,
    error,
    sending,
    openChat: () => {
      open.value = true;
    },
    closeChat: () => {
      open.value = false;
    },
    /** The field's own switch: the player as themselves, or the player as the ghost. */
    toggleAnonymous: () => {
      anonymous.value = !anonymous.value;
    },
    /**
     * The auth dialog's answer (`NickDialog`): the name this page plays under from here on, and — for an
     * empty one — the ghost's, which is what the chat calls somebody who gave no name at all. What has
     * already been said is left alone: only the lines sent from now on wear the new name.
     */
    setNick: (chosen: string) => {
      nick.value = chosen.trim();
      anonymous.value = nick.value === '';
    },
    /** What the player sent: `true` once the server has it, which is what clears the field. */
    send,
    /** Reads the log again from the beginning: what a caller reaches for when it suspects a gap. */
    refresh: load,
    /** Asks what has been written since the last line read, without being on a timer to do it. */
    catchUp,
    /** The whole log, unfiltered by where the playhead is: the window draws `messages` instead. */
    log,
    stop,
  };
}

