import { describe, expect, it } from 'vitest';
import {
  badgeSrc,
  GHOST,
  GHOST_NICK,
  lastMessages,
  LOBBY,
  playerMessage,
  PLAYER,
  PLAYER_NICK,
  PENDING,
  reachedAt,
  TICKER_LINES,
  type ChatMessage,
  type Place,
} from '../src/chat/messages';
import { LIVE, runLength, runReading, type Run } from '../src/chat/runs';
import { TAPE_STEP_MS } from '../src/game/tape';

/**
 * The chat's own rules — as opposed to its wire (`chat-api.test.ts`) and to what it keeps between two
 * answers from the server (`use-chat.test.ts`): which lines the strip shows, which of them a playback has
 * reached, and what a line the player has just typed is made of before the server has answered it.
 *
 * None of this touches a server, a clock or a browser: it is arithmetic over the shapes in
 * `chat/messages.ts` and `chat/runs.ts`, and both views of the chat read the same list, so every claim
 * below is about the whole of what the interface draws.
 */

/** A message with nothing in it but an id and its place. */
function fake(id: number, atStep: number | null = null): ChatMessage {
  return {
    id,
    tape: atStep === null ? LOBBY : 'run-1',
    atStep,
    nick: `ник${id}`,
    badge: 'badge-margo.gif',
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

  it('is the whole of what they typed, under their own nickname', () => {
    const sent = playerMessage('привет', PLAYER, AT_THE_LOBBY, false);
    expect(sent.nick).toBe(PLAYER_NICK);
    expect(sent.parts).toEqual([{ kind: 'text', text: 'привет' }]);
  });

  it('is signed by whoever the field says is speaking', () => {
    const ghost = playerMessage('привет', GHOST, AT_THE_LOBBY, true);
    expect(ghost.nick).toBe(GHOST_NICK);
    expect(ghost.ghost).toBe(true);
    expect(playerMessage('привет', PLAYER, AT_THE_LOBBY, false).ghost).toBe(false);
  });

  it('wears that speaker\'s own badge, and the other one is never worn by mistake', () => {
    expect(playerMessage('привет', PLAYER, AT_THE_LOBBY, false).badge).toBe(PLAYER.badge);
    expect(playerMessage('привет', GHOST, AT_THE_LOBBY, true).badge).toBe(GHOST.badge);
    expect(GHOST.badge).toContain('badge-ghost.gif');
    expect(PLAYER.badge).not.toBe(GHOST.badge);
  });

  it('waits for an id of its own, and is nobody\'s yet', () => {
    const sent = playerMessage('привет', PLAYER, AT_THE_LOBBY, false);
    expect(sent.id).toBe(PENDING);
    expect(sent.sentMs).toBeGreaterThan(0);
  });

  it('is anchored at the step the playhead is standing on', () => {
    const sent = playerMessage('привет', PLAYER, ON_A_RUN, false);
    expect(sent.tape).toBe('run-1');
    expect(sent.atStep).toBe(42);
  });

  it('hangs on the lobby, where there is no step to sit at', () => {
    // A step would be refused there, and the lobby is read whole (`reachedAt`).
    const sent = playerMessage('привет', PLAYER, { tape: LOBBY, step: 7 }, false);
    expect(sent.tape).toBe(LOBBY);
    expect(sent.atStep).toBeNull();
  });
});

describe('the badge a message wears', () => {
  it('is read under the app\'s own base, out of the chat\'s own folder', () => {
    const src = badgeSrc(PLAYER.badge);
    expect(src.startsWith(import.meta.env.BASE_URL)).toBe(true);
    expect(src.endsWith('assets/chat/badge-player.gif')).toBe(true);
  });

  it('is a path rather than the name the server sent', () => {
    // The name is the same in every build of the port and the base is not, which is why it is built here.
    expect(badgeSrc(GHOST.badge)).not.toBe(GHOST.badge);
  });

  it('is the same path the game builds its own assets off', () => {
    expect(badgeSrc('laugh.gif')).toBe(`${import.meta.env.BASE_URL}assets/chat/laugh.gif`);
  });
});

describe('the reading a row of the runs wears', () => {
  /** A run with nothing in it but what a reading is made of: a length, and whether it is still going. */
  function recorded(steps: number, live = false): Run {
    return { id: 'run-1', name: 'второй прогон', author: 'Марго', steps, stepMs: TAPE_STEP_MS, live };
  }

  it('is the run\'s own length as a clock, to a tenth of a second', () => {
    expect(runLength(recorded(250))).toBe('0:05.0');
    expect(runLength(recorded(3))).toBe('0:00.1');
    expect(runLength(recorded(0))).toBe('0:00.0');
  });

  it('fills the seconds out to two digits, so that a column of runs reads as one', () => {
    expect(runLength(recorded(1))).toBe('0:00.0');
    expect(runLength(recorded(75))).toBe('0:01.5');
    expect(runLength(recorded(2995))).toBe('0:59.9');
  });

  it('counts in minutes once a run is longer than one, with no sixtieth second', () => {
    // The tenth it is rounded to before it is split is what keeps a run a hair under a minute from reading
    // `0:60.0`: the reading is a clock rather than a number of seconds.
    expect(runLength(recorded(2999))).toBe('1:00.0');
    expect(runLength(recorded(3000))).toBe('1:00.0');
    expect(runLength(recorded(3120))).toBe('1:02.4');
    expect(runLength(recorded(9000))).toBe('3:00.0');
  });

  it('is the run\'s own steps at its own step length, not this build\'s', () => {
    // The step comes off the run the server described (`step_ms`, which is `store.Recording.StepMs`): a
    // tape counted in another step is still a length, and this is arithmetic rather than a lookup of what
    // this build happens to write its own tapes in (`TAPE_STEP_MS`).
    expect(runLength({ ...recorded(100), stepMs: 10 })).toBe('0:01.0');
    expect(runLength({ ...recorded(100), stepMs: 40 })).toBe('0:04.0');
  });

  it('is the word for a run still being played, not a length that is still growing', () => {
    // The one reading on the list that is not a clock: a live run's own length would be out of date before
    // it was read, so the row says what the server said about it (`live`, `LIVE`) instead.
    expect(runReading(recorded(250, true))).toBe(LIVE);
    expect(runReading(recorded(250))).toBe(runLength(recorded(250)));
  });
});
