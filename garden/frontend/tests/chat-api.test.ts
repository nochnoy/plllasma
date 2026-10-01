import { describe, expect, it, vi } from 'vitest';
import { apiBase, chatApi, Refused, type Draft } from '../src/chat/api';
import { LOBBY } from '../src/chat/messages';

/**
 * The chat's own wire (`chat/api.ts`): the crossing between the server's names and the names the
 * interface draws with, and nothing else. There is no server under these tests — the client takes its own
 * `fetch` as a parameter for exactly this reason — so what is checked here is the whole of what the chat
 * puts on the wire: the address it asks for, the body it posts, and what an answer of each shape turns
 * into.
 *
 * These are the chat's own doors — the log of a place and a line the player writes; the window's list of
 * runs and one run's own tape are the two more of them (`chat/api.ts`, and `use-runs.test.ts` for what
 * they are kept by). `backend/internal/api/server.go` is the other side of all four, and the mistakes a
 * reader would notice first have tests of their own: a lobby line growing a tape it has not got, an
 * omission read as a value, and a refusal read as though it had been an answer.
 */

/** One request as the client made it, kept so a test can read back the address and the body. */
interface Asked {
  url: string;
  init?: RequestInit;
}

/** What the fake server says: a status, and a body that may be a value, raw text, or nothing at all. */
interface Reply {
  status?: number;
  statusText?: string;
  body?: unknown;
}

/** A server of one answer: it hands back what a test wrote, and remembers what it was asked. */
function fakeServer(...answers: Reply[]) {
  const asked: Asked[] = [];
  const take = (async (input: RequestInfo | URL, init?: RequestInit) => {
    asked.push({ url: String(input), init });
    const reply = answers[Math.min(asked.length - 1, answers.length - 1)] ?? {};
    const body =
      reply.body === undefined ? '' : typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
    return new Response(body, { status: reply.status ?? 200, statusText: reply.statusText ?? 'OK' });
  }) as typeof fetch;
  return { take, asked };
}

/** What was posted, as the server would read it. */
function posted(asked: Asked): Record<string, unknown> {
  return JSON.parse(String(asked.init?.body)) as Record<string, unknown>;
}

/** A line as the server writes one: a line of the lobby. */
const WIRE_LINE = {
  id: 12,
  nick: 'Марго',
  badge: 'badge-margo.gif',
  parts: [{ kind: 'text', text: 'привет' }],
  sent_ms: 1750000000000,
};

/** A run as the server writes one (`store.Recording`): the numbers a row is drawn from, and the rest. */
const WIRE_RUN = {
  id: 'run-2',
  name: 'второй прогон',
  author: 'Марго',
  steps: 250,
  step_ms: 20,
  seed: 4242,
  bytes: 8192,
  recorded_ms: 1750000000000,
  uploaded_ms: 1750000001000,
};

describe('where the API is', () => {
  it('is beside the page, since a built game can be dropped into any sub-directory', () => {
    expect(apiBase().endsWith('/api')).toBe(true);
  });

  it('is the address a build was told, with a slash at its end taken off', () => {
    // `//messages` and `/messages` are two different paths, and a build may be told either shape.
    try {
      vi.stubEnv('VITE_API_BASE', '/garden/api/');
      expect(apiBase()).toBe('/garden/api');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('the log of one place', () => {
  it('is asked for beside the page, and says nothing about a place when it means the lobby', async () => {
    const server = fakeServer({ body: { messages: [] } });
    await chatApi('/api', server.take).log(LOBBY, 0);
    expect(server.asked[0].url).toBe('/api/messages');
  });

  it('names the recording when there is one, and asks only for what is new', async () => {
    const server = fakeServer({ body: { messages: [] } });
    await chatApi('/api', server.take).log('run-1', 7);
    expect(server.asked[0].url).toBe('/api/messages?tape=run-1&after=7');
  });

  it('reads a line of the server\'s into the names the interface draws with', async () => {
    const server = fakeServer({
      body: {
        messages: [
          {
            ...WIRE_LINE,
            tape: 'run-1',
            at_step: 42,
            ghost: true,
          },
        ],
      },
    });
    const [read] = await chatApi('/api', server.take).log('run-1', 0);
    expect(read).toEqual({
      id: 12,
      tape: 'run-1',
      atStep: 42,
      nick: 'Марго',
      badge: 'badge-margo.gif',
      ghost: true,
      parts: [{ kind: 'text', text: 'привет' }],
      sentMs: 1750000000000,
    });
  });

  it('gives a line of the lobby no step to speak of', async () => {
    // The server leaves out what a line has not got, and the omission is the answer: a lobby line is
    // about no moment, so it is in front of the player whatever step a playback stands at.
    const server = fakeServer({ body: { messages: [WIRE_LINE] } });
    const [read] = await chatApi('/api', server.take).log(LOBBY, 0);
    expect(read.tape).toBe(LOBBY);
    expect(read.atStep).toBeNull();
    expect(read.ghost).toBe(false);
    expect(read.sentMs).toBe(1750000000000);
  });

  it('takes an answer with no messages in it as an empty log', async () => {
    const wire = chatApi('/api', fakeServer({ body: { messages: null } }).take);
    expect(await wire.log(LOBBY, 0)).toEqual([]);
    const bare = chatApi('/api', fakeServer({ body: {} }).take);
    expect(await bare.log(LOBBY, 0)).toEqual([]);
  });

  it('holds a body the server wrote with no parts in it', async () => {
    const server = fakeServer({ body: { messages: [{ ...WIRE_LINE, parts: [], sent_ms: 1 }] } });
    const [read] = await chatApi('/api', server.take).log(LOBBY, 0);
    expect(read.parts).toEqual([]);
  });
});

describe('sending a line', () => {
  /** The line the player's own field hands the wire: text, as themselves, in the lobby. */
  const DRAFT: Draft = {
    tape: LOBBY,
    atStep: null,
    nick: 'Ты',
    badge: 'badge-player.gif',
    ghost: false,
    parts: [{ kind: 'text', text: 'привет' }],
  };

  it('posts the line under the server\'s own names', async () => {
    const server = fakeServer({ body: { message: { ...WIRE_LINE, id: 13 } } });
    await chatApi('/api', server.take).send(DRAFT);
    expect(server.asked[0].url).toBe('/api/messages');
    expect(server.asked[0].init?.method).toBe('POST');
    expect(server.asked[0].init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(posted(server.asked[0])).toEqual({
      tape: LOBBY,
      at_step: null,
      nick: 'Ты',
      badge: 'badge-player.gif',
      ghost: false,
      parts: [{ kind: 'text', text: 'привет' }],
    });
  });

  it('answers with the line as the server took it down, id and all', async () => {
    // The id is what the pending line is replaced by, so a server that names the line is the whole point.
    const server = fakeServer({ body: { message: { ...WIRE_LINE, id: 13 } } });
    const sent = await chatApi('/api', server.take).send(DRAFT);
    expect(sent.id).toBe(13);
    expect(sent.tape).toBe(LOBBY);
    expect(sent.nick).toBe('Марго');
  });

  it('refuses a line the server took without naming', async () => {
    const wire = chatApi('/api', fakeServer({ body: {} }).take);
    await expect(wire.send(DRAFT)).rejects.toThrow(Refused);
  });
});

describe('the list of runs the window draws', () => {
  it('is asked for at the recordings, and about no run of it in particular', async () => {
    const server = fakeServer({ body: { recordings: [] } });
    await chatApi('/api', server.take).runs();
    expect(server.asked[0].url).toBe('/api/recordings');
    expect(server.asked[0].init).toBeUndefined();
  });

  it('reads the numbers a row is drawn from, and nothing else the server said about it', async () => {
    // The tape's own size, its seed and when it was played are in the answer and none of them is read: a
    // list that kept a field it had no use for would be claiming a shape this client does not know.
    const server = fakeServer({ body: { recordings: [{ ...WIRE_RUN, live: true }] } });
    expect(await chatApi('/api', server.take).runs()).toEqual([
      { id: 'run-2', name: 'второй прогон', author: 'Марго', steps: 250, stepMs: 20, live: true },
    ]);
  });

  it('takes a run the server did not call live as one that has been played out', async () => {
    // `live` is the server's own word for a run somebody is still in the middle of (`store.Recording`), and
    // an omission is not a claim: a run that came down without it is a run that is over.
    const server = fakeServer({ body: { recordings: [WIRE_RUN] } });
    const [read] = await chatApi('/api', server.take).runs();
    expect(read.live).toBe(false);
  });

  it('takes an answer with no runs in it as an empty list', async () => {
    expect(await chatApi('/api', fakeServer({ body: {} }).take).runs()).toEqual([]);
    expect(await chatApi('/api', fakeServer({ body: { recordings: null } }).take).runs()).toEqual([]);
  });

  it('refuses a list the server would not hand over', async () => {
    const server = fakeServer({ status: 500, statusText: 'Internal Server Error' });
    await expect(chatApi('/api', server.take).runs()).rejects.toThrow(Refused);
  });
});

describe('one run\'s own tape', () => {
  it('is asked for by the run\'s own name, under the recordings', async () => {
    const server = fakeServer({ body: '{"format":"garden-tape/1"}' });
    await chatApi('/api', server.take).tape('run-2');
    expect(server.asked[0].url).toBe('/api/recordings/run-2');
    expect(server.asked[0].init).toBeUndefined();
  });

  it('is asked for under a name escaped, whatever the run was named', async () => {
    // A run's name is the server's own to choose, and this door has one path for all of them: a slash or a
    // question mark in a name is part of the name rather than the beginning of something else.
    const server = fakeServer({ body: '{}' });
    await chatApi('/api', server.take).tape('run/2?x=1');
    expect(server.asked[0].url).toBe('/api/recordings/run%2F2%3Fx%3D1');
  });

  it('answers with the file exactly as the server wrote it', async () => {
    // A tape is the game's own file, and it goes on to `decodeTape` as it arrived: no reading of it here,
    // and nothing tidied on the way — spacing and all.
    const file = '{\n  "format": "garden-tape/1",\n  "steps": 250\n}';
    const server = fakeServer({ body: file });
    expect(await chatApi('/api', server.take).tape('run-2')).toBe(file);
  });

  it('is a refusal carrying the server\'s own sentence when that run is not there', async () => {
    const server = fakeServer({ status: 404, statusText: 'Not Found', body: { error: 'no recording run-2' } });
    const refused = (await chatApi('/api', server.take).tape('run-2').catch((err: unknown) => err)) as Refused;
    expect(refused).toBeInstanceOf(Refused);
    expect(refused.status).toBe(404);
    expect(refused.sentence).toBe('no recording run-2');
  });
});

describe('a door that did not open', () => {
  it('is a refusal carrying the sentence the server wrote about it', async () => {
    const server = fakeServer({ status: 400, statusText: 'Bad Request', body: { error: 'дурная строка' } });
    const refused = (await chatApi('/api', server.take).log(LOBBY, 0).catch((err: unknown) => err)) as Refused;
    expect(refused).toBeInstanceOf(Refused);
    expect(refused.status).toBe(400);
    expect(refused.sentence).toBe('дурная строка');
    expect(refused.message).toBe('дурная строка');
  });

  it('is the status alone when the server said nothing about it', async () => {
    const server = fakeServer({ status: 500, statusText: 'Internal Server Error' });
    const refused = (await chatApi('/api', server.take).log(LOBBY, 0).catch((err: unknown) => err)) as Refused;
    expect(refused.status).toBe(500);
    expect(refused.sentence).toBe('500 Internal Server Error');
  });

  it('is a page rather than a value read as a refusal, not as an answer', async () => {
    // A door answered by a proxy's own page is a door the chat has nothing to draw from.
    const server = fakeServer({ status: 502, statusText: 'Bad Gateway', body: '<html>502</html>' });
    const refused = (await chatApi('/api', server.take).log(LOBBY, 0).catch((err: unknown) => err)) as Refused;
    expect(refused.status).toBe(502);
    expect(refused.sentence).toBe('502 Bad Gateway');
  });

  it('is a request that never landed, with no status to speak of', async () => {
    // Nothing to draw and nothing to count either way, which is why the two are one kind of failure.
    const take = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const refused = (await chatApi('/api', take).log(LOBBY, 0).catch((err: unknown) => err)) as Refused;
    expect(refused.status).toBe(0);
    expect(refused.sentence).toBe('Failed to fetch');
  });
});
