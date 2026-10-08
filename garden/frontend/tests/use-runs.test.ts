import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Refused, type ChatWire } from '../src/chat/api';
import type { Run } from '../src/chat/runs';
import { useRuns } from '../src/composables/useRuns';
import {
  TAPE_FORMAT,
  TAPE_STEP_MS,
  decodeTape,
  type Tape,
  type TapeHead,
} from '../src/game/tape';
import type { LiveSlice, LiveStream, LiveWire } from '../src/live/api';

/**
 * What following a run is (`useRuns`): one id — a link in the chat, or the page's own address — and
 * that run onto the timeline, walking. A run that is over comes down as one file; a run that is
 * still being played comes down as what it has so far and keeps arriving a second at a time, pasted
 * onto the tape already under the walk.
 *
 * No server and no browser are under these tests: the two wires are parameters (`RunsOptions.wire`,
 * `RunsOptions.stream`) and every timer is either off (`liveEvery: 0`) or the test's own
 * (`vi.useFakeTimers`), which leaves the whole of what the following asks and what it does with each
 * answer to be checked. The claims no other test can make are the ones these are really about: that
 * nothing is asked until a link is followed, that following one is one run on its way rather than
 * two, that a run which is still being played is asked past the last slice this page has and never
 * for the same slice twice, and that the tape handed to the engine is the run the slices make when
 * they are pasted together.
 *
 * The console is where the server's own sentence goes (`useRuns` warns before it says anything in the
 * player's language) and no test below is about it but two: it is watched, so that a run of these is quiet.
 */
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** What each door of the fake wire answers with; a door with no rule answers with nothing at all. */
interface Rule {
  tape?: (id: string) => string | Promise<string>;
}

/** A wire that answers by rule, and keeps every question it was asked. */
function fakeWire(rule: Rule = {}) {
  const asked = { tape: [] as string[] };
  const wire: ChatWire = {
    // The page's own handshake and the chat's own doors, which the following of a run never opens:
    // they are here because they are part of what a wire is, and a follower that asked about them
    // would be a page that had gone wrong.
    async auth() {
      throw new Refused(0, 'the following does not sign anybody in');
    },
    async log() {
      throw new Refused(0, 'the following does not read the log');
    },
    async send() {
      throw new Refused(0, 'the following does not write anything');
    },
    async runs() {
      throw new Refused(0, 'the following does not read the list of runs');
    },
    async runsByIds() {
      throw new Refused(0, 'the following does not read the rows of runs');
    },
    async tape(id) {
      asked.tape.push(id);
      const file = await rule.tape?.(id);
      // A test that wants a tape to land says what the file is; one that wants it to fail throws instead.
      if (file === undefined) throw new Refused(0, 'the fake wire was not told what to answer');
      return file;
    },
  };
  return { wire, asked };
}

/** What the door a run is watched through answers with, for a test that watches one. */
type StreamRule = (id: string, after: number) => LiveStream | Promise<LiveStream>;

/**
 * The stream door as a test that is *not* watching anything has it: asked, it says so rather than answering.
 */
function neverStreamed(): never {
  throw new Refused(0, 'the fake wire was not told what a watched run answers with');
}

/**
 * A wire for watching runs, with every ask kept: the streaming half of `fakeWire`.
 *
 * The three doors a viewer never opens are here all the same, and each of them refuses: a page watching
 * somebody else's run writes nothing of it, so a viewer that reached one of them is a page that has gone
 * wrong, and a test that wants that failure should read it rather than get it by accident.
 */
function fakeStream(rule: StreamRule = neverStreamed) {
  const asked: { id: string; after: number }[] = [];
  const wire: LiveWire = {
    async open() {
      throw new Refused(0, 'a viewer does not open a run');
    },
    async slice() {
      throw new Refused(0, 'a viewer does not write a run');
    },
    async end() {
      throw new Refused(0, 'a viewer does not finish a run');
    },
    async chat() {
      throw new Refused(0, 'a viewer does not say a run');
    },
    async stream(id, after) {
      asked.push({ id, after });
      return rule(id, after);
    },
  };
  return { wire, asked };
}

/** The head of the run a test watches: a tape's own four things, and nothing that has happened in it yet. */
const HEAD: TapeHead = {
  format: TAPE_FORMAT,
  step: TAPE_STEP_MS,
  seed: 4242,
  // Only ever written out and read back as JSON by these tests (`encodeTape`), so what a stage *is* is not
  // what any of them is about: the world's own stages are `game.ts`'s business and are covered there.
  stage: { engine: { speed: 1, gravity: 0.0011, fric: 0.9993, clamp: true }, dolls: [], ropes: [] },
};

/** One slice of a run as the server hands it back: a second of it, under the number it arrived at. */
function slice(seq: number, steps = 50): LiveSlice {
  return { seq, steps, frames: [steps], edits: [] };
}

/** A run as the stream door answers about it: its row, the head of its tape, and what has arrived since. */
function streamed(id: string, head: TapeHead | null, slices: LiveSlice[], live = true, label = ''): LiveStream {
  return {
    run: {
      id,
      name: `прогон ${id}`,
      author: 'Марго',
      steps: slices.reduce((total, one) => total + one.steps, 0),
      stepMs: TAPE_STEP_MS,
      live,
      label,
    },
    head,
    slices,
  };
}

/**
 * A run that is still being played, as the server of these tests has it: the seconds that have happened, and
 * the answer a viewer gets for asking past the last slice it has.
 *
 * It is the server's own arithmetic rather than a list of canned answers, and deliberately so: what the
 * following has to get right is exactly the asking *past* — `after` is the last slice this page has — and a
 * fake that answered the same slice over again would let a page paste one second of a run on twice and still
 * pass (`Store.Chunks` in `backend/internal/store` is the real arithmetic).
 */
function watchedRun(head: TapeHead | null = HEAD) {
  const slices: LiveSlice[] = [];
  const state = { live: true, seq: 0 };
  return {
    /** Another second of the run: what its player does next, as far as a viewer is concerned. */
    second(steps = 50): void {
      slices.push(slice(state.seq++, steps));
    },
    /** The run is over: its player has stopped, and the server says so from now on. */
    ends(): void {
      state.live = false;
    },
    /** The door itself: the head, and the slices the viewer has not got, in the order they were played. */
    answer: (id: string, after: number): LiveStream =>
      streamed(
        id,
        head,
        slices.filter((one) => one.seq > after),
        state.live,
      ),
  };
}

/** A promise a test lands itself: what the following does while a tape is on its way down. */
function held<T>() {
  let land: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    land = resolve;
  });
  return { promise, land };
}

/**
 * Lets what the following has asked for land: the fake wire answers at once, one turn of the loop later.
 *
 * A test of a run being watched runs on `vi.useFakeTimers`, because the asking is a timer, and a `setTimeout`
 * of its own would then never fire: under fake timers this advances them instead, which is the same thing —
 * everything that was waiting on a turn of the loop is done with.
 */
async function settled(): Promise<void> {
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
  else await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The following, wired up the way the page wires it, and everything its two doors were asked. `play` is
 * a parameter because one test's own failure is the whole point of it (a tape that came down and that the
 * game could not read); every other test's is the `played` this returns. The run's own tape, as the engine
 * has it, is what `grew` holds — one entry per answer the stream door gave, whether or not the tape grew
 * by it, because a run that has stopped being played is something the engine is told, too.
 */
async function following(rule: Rule = {}, setup: { live?: StreamRule; liveEvery?: number; play?: (id: string, tape: string) => void } = {}) {
  const { wire, asked } = fakeWire(rule);
  const { wire: streaming, asked: watched } = fakeStream(setup.live);
  const played: { id: string; tape: string }[] = [];
  const grew: { run: Run; tape: Tape }[] = [];
  const list = useRuns({
    wire,
    stream: streaming,
    liveEvery: setup.liveEvery ?? 0,
    play: setup.play ?? ((id, tape) => played.push({ id, tape })),
    grow: (one, tape) => grew.push({ run: one, tape }),
  });
  await settled();
  return { list, asked, watched, played, grew };
}

/**
 * A run that is over, as the stream door answers about it: no head, because its tape is a file rather
 * than a head with slices after it.
 */
function overWith(id: string): StreamRule {
  return () => streamed(id, null, [], false);
}

describe('a link followed', () => {
  /** The file a run of these tests answers with: not a tape this game would play, but a tape, as text. */
  const FILE = '{"format":"garden-tape/2","step":20,"steps":250,"seed":1,"stage":{"engine":{"speed":1,"gravity":0.0011,"fric":0.9993,"clamp":true},"dolls":[],"ropes":[]},"frames":[250],"edits":[]}';

  it('fetches that run\'s own tape and hands it on with the id it was asked for', async () => {
    const { list, asked, played } = await following({ tape: () => FILE }, { live: overWith('run-1') });
    await list.open('run-1');

    expect(asked.tape).toEqual(['run-1']);
    expect(played).toEqual([{ id: 'run-1', tape: FILE }]);
    expect(list.error.value).toBeNull();
    expect(list.opening.value).toBeNull();
  });

  it('says which run is waiting for its own answer while the tape is on its way down', async () => {
    const onItsWay = held<string>();
    const { list } = await following({ tape: () => onItsWay.promise }, { live: overWith('run-1') });
    const opening = list.open('run-1');
    await settled();
    expect(list.opening.value).toBe('run-1');

    onItsWay.land(FILE);
    await opening;
    expect(list.opening.value).toBeNull();
  });

  it('follows one link at a time: a second ask while the first is on its way down is not even made', async () => {
    const onItsWay = held<string>();
    const { list, asked } = await following({ tape: () => onItsWay.promise }, { live: overWith('run-1') });
    const first = list.open('run-1');
    await settled();
    await list.open('run-2');
    await settled();
    expect(asked.tape).toEqual(['run-1']);

    onItsWay.land(FILE);
    await first;
    // And the second link can be followed once the first has landed: the door was busy, not shut.
    await list.open('run-2');
    expect(asked.tape).toEqual(['run-1', 'run-2']);
  });

  it('says a refusal in the player\'s own language, and hands nothing to the engine', async () => {
    // A door that was told nothing throws — the same shape a server that would not answer has.
    const { list, played } = await following({}, { live: overWith('run-1') });
    await list.open('run-1');
    expect(played).toEqual([]);
    expect(list.error.value).toBe('Запись не дозвонилась до сервера.');
    expect(list.opening.value).toBeNull();
  });

  it('is handed to the engine as the game\'s own reading of it, not as the page\'s', async () => {
    // The one failure that is the engine's own rather than the wire's: a tape the game cannot decode
    // came down perfectly well, and it is the handing-over that throws.
    const { list, played } = await following({ tape: () => FILE }, {
      live: overWith('run-1'),
      play: () => {
        throw new Error('not a run this build can play');
      },
    });
    await list.open('run-1');
    expect(played).toEqual([]);
    expect(list.error.value).toBe('Запись скачалась, но игра не смогла её прочитать.');
  });
});

describe('a run that is still being played', () => {
  it('is played from its head and the slices there are, pasted into one tape', async () => {
    vi.useFakeTimers();
    try {
      const live = watchedRun();
      live.second();
      live.second();
      const { list, played, grew } = await following({}, { live: live.answer, liveEvery: 1000 });
      await list.open('run-1');

      // What the engine is handed is a file — the run as one tape, decoded here to read what it says —
      // of exactly the two seconds the run had in it when the link was followed.
      expect(played).toHaveLength(1);
      const tape = decodeTape(played[0].tape);
      expect(tape.steps).toBe(100);
      // The following asks at once, too — and the answer had nothing new in it, so the engine is told
      // about the same tape with the run still going (`grow` is called whether or not anything grew).
      expect(grew).toHaveLength(1);
      expect(grew[0].tape.steps).toBe(100);
      expect(grew[0].run.live).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is asked past the last slice it has, a second at a time, and never for the same slice twice', async () => {
    vi.useFakeTimers();
    try {
      const live = watchedRun();
      live.second();
      const { list, watched, grew } = await following({}, { live: live.answer, liveEvery: 1000 });
      await list.open('run-1');
      // The opening ask is past nothing; the watching asks are past the last slice the page pasted on.
      expect(watched.map((one) => one.after)).toEqual([-1, 0]);

      live.second();
      await vi.advanceTimersByTimeAsync(1000);
      // The ask that came at the moment of opening had nothing new in it, so the timer's is past the
      // same last slice again — and it is the one that pastes the new second on, once.
      expect(watched.map((one) => one.after)).toEqual([-1, 0, 0]);
      expect(grew).toHaveLength(2);
      expect(grew[1].tape.steps).toBe(100);

      // A second with nothing in it — the run's player paused — is an answer like any other: the row
      // comes with it (the engine is told the run is still going), and the tape is the same tape.
      await vi.advanceTimersByTimeAsync(1000);
      expect(watched.map((one) => one.after)).toEqual([-1, 0, 0, 1]);
      expect(grew).toHaveLength(3);
      expect(grew[2].tape.steps).toBe(100);
      expect(grew[2].run.live).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops asking once the run is over, and says so to the engine with the last of it', async () => {
    vi.useFakeTimers();
    try {
      const live = watchedRun();
      live.second();
      const { list, watched, grew } = await following({}, { live: live.answer, liveEvery: 1000 });
      await list.open('run-1');

      live.second();
      live.ends();
      await vi.advanceTimersByTimeAsync(1000);
      expect(grew.at(-1)?.run.live).toBe(false);
      expect(grew.at(-1)?.tape.steps).toBe(100);

      await vi.advanceTimersByTimeAsync(5000);
      // The run's own ending is the end of the asking: what follows is the page's own business, not the
      // server's.
      expect(watched).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is left alone when the tape comes off the timeline, wherever the run itself has got to', async () => {
    vi.useFakeTimers();
    try {
      const live = watchedRun();
      live.second();
      const { list, watched } = await following({}, { live: live.answer, liveEvery: 1000 });
      await list.open('run-1');

      list.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(watched).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps watching through a failed ask, saying the trouble once', async () => {
    vi.useFakeTimers();
    try {
      const live = watchedRun();
      live.second();
      let refuse = false;
      const rule: StreamRule = (id, after) => {
        if (refuse) {
          refuse = false;
          throw new Refused(0, 'one ask did not land');
        }
        return live.answer(id, after);
      };
      const { list, watched, grew } = await following({}, { live: rule, liveEvery: 1000 });
      await list.open('run-1');

      refuse = true;
      await vi.advanceTimersByTimeAsync(1000);
      live.second();
      await vi.advanceTimersByTimeAsync(1000);
      // The failed ask is a gap in the asking, not an end to it — and the next one is past the last
      // slice that arrived, so nothing is pasted on twice.
      expect(watched).toHaveLength(4);
      expect(grew.at(-1)?.tape.steps).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });
});
