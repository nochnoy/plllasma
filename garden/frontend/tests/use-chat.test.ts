import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { Refused, type ChatWire, type Draft } from '../src/chat/api';
import { useChat } from '../src/composables/useChat';
import {
  GHOST,
  GHOST_NICK,
  LOBBY,
  PENDING,
  userpic,
  type ChatMessage,
  type Place,
  type Speaker,
} from '../src/chat/messages';

/**
 * What the chat keeps between two answers from the server (`useChat`): the log of the place the player is
 * in, what this moment of it shows, and the two things they can do about it — write a line, and switch who
 * they are writing as.
 *
 * No server and no browser are under these tests: the wire is a parameter of the composable
 * (`ChatOptions.wire`) and the timer is turned off (`every: 0`), which leaves the whole of the reading and
 * the writing to be checked against what the chat asks and what it does with each answer. The player is a
 * speaker handed in from above (`ChatOptions.speaker`), the way the page hands the handshake's answer
 * (`main.ts`): these tests are what the chat does with a player, not how the player was signed in. The
 * claims no other test can make are the ones these are really about: that a line the player has typed is
 * on screen before the server has seen it, and that a slow answer for a place they have left is not the
 * conversation they are reading now.
 */

/** A player as the handshake would have named them: the site's own id, nick and userpic. */
const MARAT: Speaker = { id: 2, nick: 'Марат', face: userpic('2') };

/** A line of the log with nothing in it but what the chat wonders about: an id and its place. */
function line(id: number, atStep: number | null = null): ChatMessage {
  return {
    id,
    tape: atStep === null ? LOBBY : 'run-1',
    atStep,
    userId: 9,
    nick: 'Марго',
    face: userpic('-'),
    ghost: false,
    parts: [{ kind: 'text', text: `строка ${id}` }],
    sentMs: 1000 + id,
  };
}

/** What each door of the fake wire answers with; a door with no rule answers with nothing at all. */
interface Rule {
  log?: (tape: string, after: number) => ChatMessage[] | Promise<ChatMessage[]>;
  send?: (draft: Draft) => ChatMessage | Promise<ChatMessage>;
}

/** A wire that answers by rule, and keeps every question it was asked. */
function fakeWire(rule: Rule = {}) {
  const asked = {
    log: [] as { tape: string; after: number }[],
    send: [] as Draft[],
  };
  const wire: ChatWire = {
    async auth() {
      // The handshake is the page's own first act (`main.ts`), done before a chat is ever made: a chat
      // that was asked to sign its player in would be one asking a question already answered.
      throw new Refused(0, 'the chat does not sign its player in');
    },
    async log(tape, after) {
      asked.log.push({ tape, after });
      return (await rule.log?.(tape, after)) ?? [];
    },
    async send(draft) {
      asked.send.push(draft);
      const written = await rule.send?.(draft);
      // A test that wants a send to land says what the server answers with; one that wants it to fail
      // makes the rule throw.
      if (!written) throw new Refused(0, 'the fake wire was not told what to answer');
      return written;
    },
    // The two doors of the window's own list of runs (`useRuns`), which the chat never opens: they are
    // here because they are part of what a wire is, and a wire that was asked would say so rather than
    // answer with a list or a tape this chat has no use for.
    async runs() {
      throw new Refused(0, 'the chat does not read the list of runs');
    },
    async tape() {
      throw new Refused(0, 'the chat does not fetch a run\'s tape');
    },
  };
  return { wire, asked };
}

/** A promise a test lands itself: what the chat does while the server has not answered. */
function held<T>() {
  let land: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    land = resolve;
  });
  return { promise, land };
}

/** Lets what the chat has asked for land: the fake wire answers at once, one turn of the loop later. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Where the player is: the lobby, unless a test says a run is on the tape. */
const AT_THE_LOBBY: Place = { tape: LOBBY, step: 0 };

describe('the log the chat reads when it opens', () => {
  it('reads the whole log of the place the player is in', async () => {
    const { wire, asked } = fakeWire({ log: () => [line(1), line(2)] });
    const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
    await settled();
    expect(asked.log).toEqual([{ tape: LOBBY, after: 0 }]);
    expect(chat.log.value.map((message) => message.id)).toEqual([1, 2]);
    expect(chat.error.value).toBeNull();
  });

  it('reads a recording\'s own conversation when a run is loaded', async () => {
    const { wire, asked } = fakeWire({ log: () => [line(7, 3)] });
    const chat = useChat(() => ({ tape: 'run-1', step: 0 }), { wire, every: 0, speaker: MARAT });
    await settled();
    expect(asked.log).toEqual([{ tape: 'run-1', after: 0 }]);
    expect(chat.log.value.map((message) => message.id)).toEqual([7]);
  });

  it('shows what the playhead has reached, and the strip is the last four lines of it', async () => {
    const { wire } = fakeWire({ log: () => [line(1), line(2), line(3), line(4), line(5), line(6), line(7, 9)] });
    const at = ref(4);
    const chat = useChat(() => ({ tape: 'run-1', step: at.value }), { wire, every: 0, speaker: MARAT });
    await settled();
    expect(chat.messages.value.map((message) => message.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chat.ticker.value.map((message) => message.id)).toEqual([3, 4, 5, 6]);
    at.value = 9;
    expect(chat.messages.value.map((message) => message.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(chat.ticker.value.map((message) => message.id)).toEqual([4, 5, 6, 7]);
  });

  it('does not ask the server again for every step of a playback', async () => {
    // The step is deliberately not watched: a run re-read in full at each of its steps would be a request
    // per frame, and what a moment of the run shows moves by itself.
    const { wire, asked } = fakeWire({ log: () => [line(1)] });
    const at = ref(0);
    const chat = useChat(() => ({ tape: 'run-1', step: at.value }), { wire, every: 0, speaker: MARAT });
    await settled();
    at.value = 1;
    at.value = 2;
    await settled();
    expect(asked.log.length).toBe(1);
    expect(chat.messages.value.map((message) => message.id)).toEqual([1]);
  });
});

describe('catching up on what other people wrote', () => {
  it('asks only for what was written after the last line it has', async () => {
    const { wire, asked } = fakeWire({ log: () => [line(1), line(2)] });
    const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
    await settled();
    await chat.catchUp();
    expect(asked.log).toEqual([
      { tape: LOBBY, after: 0 },
      { tape: LOBBY, after: 2 },
    ]);
  });

  it('adds the new lines to the log', async () => {
    const answers: ChatMessage[][] = [[line(1)], [line(2), line(3)]];
    const { wire } = fakeWire({ log: () => answers.shift() ?? [] });
    const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
    await settled();
    await chat.catchUp();
    expect(chat.log.value.map((message) => message.id)).toEqual([1, 2, 3]);
  });

  it('keeps a line that arrived twice only once', async () => {
    // A line of the player's own comes back from a catch-up as well as from the send that wrote it.
    const answers: ChatMessage[][] = [[line(1)], [line(1), line(2)]];
    const { wire } = fakeWire({ log: () => answers.shift() ?? [] });
    const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
    await settled();
    await chat.catchUp();
    expect(chat.log.value.map((message) => message.id)).toEqual([1, 2]);
  });

  it('leaves the log alone when the answer has nothing new in it', async () => {
    const answers: ChatMessage[][] = [[line(1)], []];
    const { wire } = fakeWire({ log: () => answers.shift() ?? [] });
    const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
    await settled();
    const before = chat.log.value;
    await chat.catchUp();
    expect(chat.log.value).toBe(before);
  });

  it('asks for the whole log when it has nothing yet', async () => {
    const answers: ChatMessage[][] = [[], [line(1)]];
    const { wire, asked } = fakeWire({ log: () => answers.shift() ?? [] });
    const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
    await settled();
    await chat.catchUp();
    expect(asked.log[1]).toEqual({ tape: LOBBY, after: 0 });
    expect(chat.log.value.map((message) => message.id)).toEqual([1]);
  });
});

describe('a server the chat could not reach', () => {
  /** A console the tests read: the server's own sentence goes there rather than to the player. */
  function watching(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }

  it('says so in the player\'s own language, and keeps the log it has', async () => {
    const warn = watching();
    try {
      const { wire } = fakeWire({
        log: () => {
          throw new Refused(0, 'Failed to fetch');
        },
      });
      const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
      await settled();
      expect(chat.error.value).toBe('Чат не дозвонился до сервера.');
      expect(chat.log.value).toEqual([]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('tells a refusal of the server apart from a request that never landed', async () => {
    const warn = watching();
    try {
      const { wire } = fakeWire({
        log: () => {
          throw new Refused(500, 'the store fell over');
        },
      });
      const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
      await settled();
      expect(chat.error.value).toBe('Сервер не принял это: попробуйте ещё раз.');
    } finally {
      warn.mockRestore();
    }
  });

  it('forgets the reason once the chat is answered again', async () => {
    const answers: ChatMessage[][] = [];
    const warn = watching();
    try {
      const { wire } = fakeWire({
        log: () => {
          const answer = answers.shift();
          if (!answer) throw new Refused(0, 'Failed to fetch');
          return answer;
        },
      });
      const chat = useChat(() => AT_THE_LOBBY, { wire, every: 0, speaker: MARAT });
      await settled();
      expect(chat.error.value).not.toBeNull();
      answers.push([line(1)]);
      await chat.refresh();
      expect(chat.error.value).toBeNull();
      expect(chat.log.value.map((message) => message.id)).toEqual([1]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('a line the player sends', () => {
  /** A chat of the lobby that has read its log, with the send door answering by rule. */
  async function open(rule: Rule) {
    const made = fakeWire(rule);
    const chat = useChat(() => AT_THE_LOBBY, { wire: made.wire, every: 0, speaker: MARAT });
    await settled();
    return { chat, ...made };
  }

  it('is on screen before the server has seen it, and lands as the server\'s own line', async () => {
    const onItsWay = held<ChatMessage>();
    const { chat, asked } = await open({ send: () => onItsWay.promise });
    const sending = chat.send('привет');
    // Nothing has been awaited of the wire: the strip answers the finger, the way a chat does.
    expect(chat.log.value.map((message) => message.id)).toEqual([PENDING]);
    expect(chat.log.value[0].parts).toEqual([{ kind: 'text', text: 'привет' }]);
    expect(chat.sending.value).toBe(true);
    expect(asked.send.length).toBe(1);

    onItsWay.land(line(9));
    expect(await sending).toBe(true);
    // The server names the line, and its answer is the line: the pending one is gone rather than kept.
    expect(chat.log.value.map((message) => message.id)).toEqual([9]);
    expect(chat.sending.value).toBe(false);
  });

  it('is written once when a catch-up read it while the answer was still on the wire', async () => {
    // The line the player wrote can come back from a catch-up as well as from the send that wrote it, and
    // the crossing goes both ways: here the answer is still on its way when a catch-up reads the line the
    // server has already stored, so the line waits under `PENDING` for an answer that has — as far as the
    // log is concerned — already arrived.
    const onItsWay = held<ChatMessage>();
    const answers: ChatMessage[][] = [[], [line(1)]];
    const { chat } = await open({ log: () => answers.shift() ?? [], send: () => onItsWay.promise });
    const sending = chat.send('привет');
    expect(chat.log.value.map((message) => message.id)).toEqual([PENDING]);

    await chat.catchUp();
    expect(chat.log.value.map((message) => message.id)).toEqual([PENDING, 1]);

    onItsWay.land(line(1));
    expect(await sending).toBe(true);
    // The server's own line was already read: the one waiting under `PENDING` goes rather than being it
    // twice over.
    expect(chat.log.value.map((message) => message.id)).toEqual([1]);
  });

  it('goes out under the player\'s own token, trimmed, with the lobby as its place', async () => {
    const { chat, asked } = await open({ send: () => line(9) });
    await chat.send('  привет  ');
    // Who the line is by is nothing the line itself says any more: the wire carries the where and the
    // what, and the token — the same one the handshake settled — carries the who.
    expect(asked.send[0]).toEqual({
      tape: LOBBY,
      atStep: null,
      ghost: false,
      parts: [{ kind: 'text', text: 'привет' }],
    });
  });

  it('goes out anchored at the step of a run, which is what makes it about that moment', async () => {
    const { wire, asked } = fakeWire({ send: (draft) => line(9, draft.atStep) });
    const chat = useChat(() => ({ tape: 'run-1', step: 42 }), { wire, every: 0, speaker: MARAT });
    await settled();
    await chat.send('привет');
    expect(asked.send[0].tape).toBe('run-1');
    expect(asked.send[0].atStep).toBe(42);
    expect(chat.log.value[0].atStep).toBe(42);
  });

  it('is the player as the site named them, pending under their own face', async () => {
    const onItsWay = held<ChatMessage>();
    const { chat } = await open({ send: () => onItsWay.promise });
    expect(chat.speaker.value).toBe(MARAT);
    const sending = chat.send('привет');
    // The pending line is the player as the site named them, face and all, before the server has had
    // its own word about it.
    const sent = chat.log.value[0];
    expect(sent.nick).toBe('Марат');
    expect(sent.face).toBe(userpic('2'));
    expect(sent.userId).toBe(2);
    expect(sent.ghost).toBe(false);
    onItsWay.land(line(9));
    await sending;
  });

  it('goes out as the ghost once the field has been switched', async () => {
    const onItsWay = held<ChatMessage>();
    const { chat, asked } = await open({ send: () => onItsWay.promise });
    expect(chat.speaker.value).toBe(MARAT);
    chat.toggleAnonymous();
    expect(chat.speaker.value).toBe(GHOST);
    const sending = chat.send('привет');
    expect(asked.send[0].ghost).toBe(true);
    // The costume is drawn over the player, not sent in their place: the flag is all that changes on
    // the wire, and the ghost's own name and face are what the pending line wears.
    expect(chat.log.value[0].nick).toBe(GHOST_NICK);
    expect(chat.log.value[0].face).toBe(GHOST.face);
    onItsWay.land(line(9));
    await sending;
  });

  it('sends nothing at all when the field was left empty', async () => {
    const { chat, asked } = await open({ send: () => line(9) });
    expect(await chat.send('   ')).toBe(false);
    expect(asked.send).toEqual([]);
    expect(chat.log.value).toEqual([]);
  });

  it('is not sent twice while the first one is still on its way', async () => {
    const onItsWay = held<ChatMessage>();
    const { chat, asked } = await open({ send: () => onItsWay.promise });
    const sending = chat.send('раз');
    expect(await chat.send('два')).toBe(false);
    expect(asked.send.length).toBe(1);
    expect(chat.log.value.map((message) => message.id)).toEqual([PENDING]);
    onItsWay.land(line(9));
    await sending;
    expect(chat.log.value.map((message) => message.id)).toEqual([9]);
  });

  it('is taken back, with the reason shown, when the server will not take it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { chat } = await open({
        send: () => {
          throw new Refused(400, 'the run is 3000 steps long, so step 4000 is a moment no playback reaches');
        },
      });
      expect(await chat.send('привет')).toBe(false);
      expect(chat.log.value).toEqual([]);
      expect(chat.error.value).toBe('Сервер не принял это: попробуйте ещё раз.');
      expect(chat.sending.value).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('the place the chat belongs to', () => {
  it('reads the new conversation when a run is put on the tape', async () => {
    const { wire, asked } = fakeWire({ log: (tape) => (tape === LOBBY ? [line(1)] : [line(7, 3)]) });
    const place = ref<Place>(AT_THE_LOBBY);
    const chat = useChat(() => place.value, { wire, every: 0, speaker: MARAT });
    await settled();
    expect(chat.log.value.map((message) => message.id)).toEqual([1]);

    place.value = { tape: 'run-1', step: 0 };
    await settled();
    expect(asked.log.map((one) => one.tape)).toEqual([LOBBY, 'run-1']);
    expect(chat.log.value.map((message) => message.id)).toEqual([7]);
  });

  it('keeps a slow answer for a place the player has left out of the conversation they are reading now', async () => {
    const slow = held<ChatMessage[]>();
    const { wire } = fakeWire({ log: (tape) => (tape === LOBBY ? slow.promise : [line(7, 3)]) });
    const place = ref<Place>(AT_THE_LOBBY);
    const chat = useChat(() => place.value, { wire, every: 0, speaker: MARAT });

    place.value = { tape: 'run-1', step: 0 };
    await settled();
    expect(chat.log.value.map((message) => message.id)).toEqual([7]);

    // The lobby's answer arrives after the player has gone, and is not what a recording's chat shows.
    slow.land([line(1)]);
    await settled();
    expect(chat.log.value.map((message) => message.id)).toEqual([7]);
  });

  it('asks again on a timer while it is open, and stops asking when it is told to', async () => {
    vi.useFakeTimers();
    try {
      const { wire, asked } = fakeWire({ log: () => [line(1)] });
      const chat = useChat(() => AT_THE_LOBBY, { wire, every: 20, speaker: MARAT });
      await vi.advanceTimersByTimeAsync(0);
      // The read on opening, and then three catch-ups, each asking from the last line it read.
      expect(asked.log).toEqual([{ tape: LOBBY, after: 0 }]);
      await vi.advanceTimersByTimeAsync(60);
      expect(asked.log.map((one) => one.after)).toEqual([0, 1, 1, 1]);

      chat.stop();
      await vi.advanceTimersByTimeAsync(60);
      expect(asked.log.length).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
