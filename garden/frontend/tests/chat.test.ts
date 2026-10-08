import { describe, expect, it } from 'vitest';
import {
  badgeSrc,
  GHOST,
  GHOST_NICK,
  lastMessages,
  LOBBY,
  playerMessage,
  PENDING,
  reachedAt,
  TICKER_LINES,
  userpic,
  type ChatMessage,
  type Place,
  type Speaker,
} from '../src/chat/messages';
import { labelWords, linkedRuns, RUN_WORD } from '../src/chat/messages';

/**
 * The chat's own rules — as opposed to its wire (`chat-api.test.ts`) and to what it keeps between two
 * answers from the server (`use-chat.test.ts`): which lines the strip shows, which of them a playback has
 * reached, and what a line the player has just typed is made of before the server has answered it.
 *
 * None of this touches a server, a clock or a browser: it is arithmetic over the shapes in
 * `chat/messages.ts` and `chat/runs.ts`, and both views of the chat read the same list, so every claim
 * below is about the whole of what the interface draws.
 */

/** A player as the handshake would have named them: the site's own id, nick and userpic. */
const MARAT: Speaker = { id: 2, nick: 'Марат', face: userpic('2') };

/** A message with nothing in it but an id and its place. */
function fake(id: number, atStep: number | null = null): ChatMessage {
  return {
    id,
    tape: atStep === null ? LOBBY : 'run-1',
    atStep,
    userId: id + 10,
    nick: `ник${id}`,
    face: userpic(`${id + 10}`),
    ghost: false,
    parts: [{ kind: 'text', text: `текст${id}` }],
    sentMs: 1000 + id,
  };
}

describe('the strip of the last few messages', () => {
  it('shows the four newest messages, oldest of them first', () => {
    const log = [1, 2, 3, 4, 5, 6].map((id) => fake(id));
    expect(lastMessages(log, TICKER_LINES).map((message) => message.id)).toEqual([3, 4, 5, 6]);
  });

  it('shows fewer when the log is shorter than its own four lines', () => {
    expect(lastMessages([fake(1), fake(2)], TICKER_LINES).map((message) => message.id)).toEqual([1, 2]);
  });

  it('shows nothing when there is nothing to show', () => {
    expect(lastMessages([], TICKER_LINES)).toEqual([]);
  });

  it('hands back the messages themselves, not copies of them', () => {
    const log = [fake(1)];
    expect(lastMessages(log, TICKER_LINES)[0]).toBe(log[0]);
  });
});

describe('what a playback has reached', () => {
  it('shows a line about the run as a whole from the very first step', () => {
    // No step on the line is the line being about the run the player is watching rather than about a
    // moment of it: it is in front of them before the playhead has moved at all.
    expect(reachedAt([fake(1, null)], 0).map((message) => message.id)).toEqual([1]);
  });

  it('holds an anchored line back until the playhead stands on its step', () => {
    expect(reachedAt([fake(1, 5)], 4)).toEqual([]);
    expect(reachedAt([fake(1, 5)], 5).map((message) => message.id)).toEqual([1]);
  });

  it('lets a line written earlier in the run stay up', () => {
    const log = [fake(1, 2), fake(2, 9), fake(3, null)];
    expect(reachedAt(log, 6).map((message) => message.id)).toEqual([1, 3]);
  });

  it('shows the whole lobby, since none of it is anchored', () => {
    const lobby = [fake(1), fake(2), fake(3)];
    expect(reachedAt(lobby, 0).map((message) => message.id)).toEqual([1, 2, 3]);
  });

  it('keeps the order the server gave, which is the order a chat reads in', () => {
    const log = [fake(1, 3), fake(2, null), fake(3, 1)];
    expect(reachedAt(log, 5).map((message) => message.id)).toEqual([1, 2, 3]);
  });

  it('is a filter rather than a copy of the log', () => {
    const log = [fake(1, 9)];
    expect(reachedAt(log, 10)[0]).toBe(log[0]);
  });
});

describe('a line the player has just typed', () => {
  /** Where a playback leaves the player: on a run, with the playhead standing on a step of it. */
  const ON_A_RUN: Place = { tape: 'run-1', step: 42 };
  /** Where the game is when there is nothing on the tape: no run to anchor a line to. */
  const AT_THE_LOBBY: Place = { tape: LOBBY, step: 0 };

  it('is the whole of what they typed, under the name the site knows them by', () => {
    const sent = playerMessage('привет', MARAT, AT_THE_LOBBY, false);
    expect(sent.nick).toBe('Марат');
    expect(sent.userId).toBe(2);
    expect(sent.parts).toEqual([{ kind: 'text', text: 'привет' }]);
  });

  it('is signed by whoever the field says is speaking', () => {
    const ghost = playerMessage('привет', GHOST, AT_THE_LOBBY, true);
    expect(ghost.nick).toBe(GHOST_NICK);
    expect(ghost.ghost).toBe(true);
    expect(playerMessage('привет', MARAT, AT_THE_LOBBY, false).ghost).toBe(false);
  });

  it('wears that speaker\'s own face, and the other one is never worn by mistake', () => {
    expect(playerMessage('привет', MARAT, AT_THE_LOBBY, false).face).toBe(MARAT.face);
    expect(playerMessage('привет', GHOST, AT_THE_LOBBY, true).face).toBe(GHOST.face);
    expect(GHOST.face).toBe('/i/ghost.gif');
    expect(MARAT.face).not.toBe(GHOST.face);
  });

  it('waits for an id of its own, and is nobody\'s yet', () => {
    const sent = playerMessage('привет', MARAT, AT_THE_LOBBY, false);
    expect(sent.id).toBe(PENDING);
    expect(sent.sentMs).toBeGreaterThan(0);
  });

  it('is anchored at the step the playhead is standing on', () => {
    const sent = playerMessage('привет', MARAT, ON_A_RUN, false);
    expect(sent.tape).toBe('run-1');
    expect(sent.atStep).toBe(42);
  });

  it('hangs on the lobby, where there is no step to sit at', () => {
    // A step would be refused there, and the lobby is read whole (`reachedAt`).
    const sent = playerMessage('привет', MARAT, { tape: LOBBY, step: 7 }, false);
    expect(sent.tape).toBe(LOBBY);
    expect(sent.atStep).toBeNull();
  });
});

describe('the face a message wears', () => {
  it('is one of the site\'s userpics, read from the root of the site itself', () => {
    // The game lives under the site the folder belongs to, whatever sub-directory the build was dropped
    // into: the path is the origin's own rather than the build's.
    expect(userpic('2')).toBe('/i/2.gif');
    expect(userpic('-')).toBe('/i/-.gif');
  });

  it('is the ghost\'s own userpic for the ghost, and only a gif of the body ever comes from the build', () => {
    // The ghost is one of the site's faces like every other speaker — `i/ghost.gif` — rather than a
    // picture of the game's own; what the build's own base holds is the gifs a message's body drops
    // into a sentence, which are the site's names carried under the build's roof (`badgeSrc`).
    expect(GHOST.face).toBe('/i/ghost.gif');
    expect(badgeSrc('laugh.gif')).toBe(`${import.meta.env.BASE_URL}assets/chat/laugh.gif`);
    expect(MARAT.face).not.toBe(badgeSrc(MARAT.face));
  });
});

describe('the words a run\'s link wears', () => {
  it('are the label\'s own, with the last word as the link', () => {
    // «Начал игру» links its игру and «Сделал перешпагат» its перешпагат: the noun rather than the verb
    // that merely reports it, so the link is the thing rather than the telling of it.
    expect(labelWords('Начал игру')).toEqual({ said: 'Начал ', word: 'игру' });
    expect(labelWords('Сделал перешпагат')).toEqual({ said: 'Сделал ', word: 'перешпагат' });
  });

  it('are one word whole when the label is one word, and never empty', () => {
    expect(labelWords('Стрим')).toEqual({ said: '', word: 'Стрим' });
    // A run whose row has not arrived — or whose label was never said — still reads as the thing it is:
    // the word the first label made the link of.
    expect(labelWords('')).toEqual({ said: '', word: RUN_WORD });
    expect(labelWords('  ')).toEqual({ said: '', word: RUN_WORD });
  });
});

describe('the runs the chat is interested in', () => {
  const AT_THE_LOBBY: Place = { tape: LOBBY, step: 0 };

  /** A line with a run's link in it, carrying nothing else. */
  function linked(id: string, nick = 'Марго'): ChatMessage {
    return { ...playerMessage('ничего', MARAT, AT_THE_LOBBY, false), nick, parts: [{ kind: 'run', run: id }] };
  }

  it('are the ones its lines link, each once, in the order they were first met', () => {
    const lines = [linked('b'), playerMessage('просто слова', MARAT, AT_THE_LOBBY, false), linked('a'), linked('b')];
    expect(linkedRuns(lines)).toEqual(['b', 'a']);
    expect(linkedRuns([])).toEqual([]);
  });
});
