import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, type Ref } from 'vue';
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
 * The list of runs the chat's window keeps (`useRuns`): every run the server holds, read while the window
 * is open, and one row's own run, which is what a click on the row is asking for — a file, for a run that is
 * over, and what has arrived so far of it plus every second after, for a run that is still being played.
 *
 * No server and no browser are under these tests: the two wires are parameters (`RunsOptions.wire`,
 * `RunsOptions.stream`) and every timer is either off (`every: 0`, `liveEvery: 0`) or the test's own
 * (`vi.useFakeTimers`), which leaves the whole of what the list asks and what it does with each answer to be
 * checked. The claims no other test can make are the ones these are really about: that nothing at all is
 * asked before the window opens, that picking a row is one run on its way rather than two, that a run which
 * is still being played is asked past the last slice this page has and never for the same slice twice, and
 * that a read which fails leaves the rows that were there.
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

/** A run with nothing in it but what a row is drawn from: a name of its own and a length. */
function run(id: string, live = false): Run {
  return { id, name: `прогон ${id}`, author: 'Марго', steps: 250, stepMs: 20, live };
}

/** What each door of the fake wire answers with; a door with no rule answers with nothing at all. */
interface Rule {
  runs?: () => Run[] | Promise<Run[]>;
  tape?: (id: string) => string | Promise<string>;
}

/** A wire that answers by rule, and keeps every question it was asked. */
function fakeWire(rule: Rule = {}) {
  const asked = { runs: 0, tape: [] as string[] };
  const wire: ChatWire = {
    // The page's own handshake, and the two doors of the chat's own log, which this list never opens:
    // they are here because they are part of what a wire is, and a list that asked about them would be
    // a list that had gone wrong.
    async auth() {
      throw new Refused(0, 'the list does not sign anybody in');
    },
    async log() {
      throw new Refused(0, 'the list does not read the log');
    },
    async send() {
      throw new Refused(0, 'the list does not write anything');
    },
    async runs() {
      asked.runs += 1;
      return (await rule.runs?.()) ?? [];
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

/** The stream door as a test that is *not* watching anything has it: asked, it says so rather than answering. */
function neverStreamed(): never {
  throw new Refused(0, 'the fake wire was not told what a watched run answers with');
}

/**
 * A wire for a run that is still being played, with every ask kept: the watching half of `fakeWire`.
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
function streamed(id: string, head: TapeHead | null, slices: LiveSlice[], live = true): LiveStream {
  return {
    run: {
      id,
      name: `прогон ${id}`,
      author: 'Марго',
      steps: slices.reduce((total, one) => total + one.steps, 0),
      stepMs: TAPE_STEP_MS,
      live,
    },
    head,
    slices,
  };
}

/**
 * A run that is still being played, as the server of these tests has it: the seconds that have happened, and
 * the answer a viewer gets for asking past the last slice it has.
 *
 * It is the server's own arithmetic rather than a list of canned answers, and deliberately so: what the list
 * of runs has to get right is exactly the asking *past* — `after` is the last slice this page has — and a fake
 * that answered the same slice over again would let a page paste one second of a run on twice and still pass
 * (`Store.Chunks` in `backend/internal/store` is the real arithmetic).
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

/** A promise a test lands itself: what the list does while a tape is on its way down. */
function held<T>() {
  let land: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    land = resolve;
  });
  return { promise, land };
}

/**
 * Lets what the list has asked for land: the fake wire answers at once, one turn of the loop later.
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
 * The list with a window that is already open — which is what most of these tests are about — and everything
 * each of its two doors was asked, as the lists this returns.
 *
 * `setup.play` is a parameter because one test's own failure is the whole point of it (a tape that came down
 * and that the game could not read); every other test's is the `played` this returns. The run's own tape, as
 * the engine has it, is what `grew` holds — one entry per answer the stream door gave, whether or not the
 * tape grew by it, because a run that has stopped being played is something the engine is told, too.
 */
async function openedList(rule: Rule = {}, setup: Setup = {}) {
  const { wire, asked } = fakeWire(rule);
  const { wire: streaming, asked: watched } = fakeStream(setup.live);
  const played: { run: Run; tape: string }[] = [];
  const grew: { run: Run; tape: Tape }[] = [];
  const showing = ref(true);
  const list = useRuns(showing, {
    wire,
    stream: streaming,
    every: 0,
    liveEvery: setup.liveEvery ?? 0,
    play: setup.play ?? ((one, tape) => played.push({ run: one, tape })),
    grow: (one, tape) => grew.push({ run: one, tape }),
  });
  await settled();
  return { list, asked, watched, played, grew, showing };
}

/** What a test tells `openedList` about besides the list's own rule. */
interface Setup {
  /** The rule the stream door answers by, for a test that watches a run that is still being played. */
  live?: StreamRule;
  /**
   * How often the run being watched is asked what it has written, in milliseconds: off by default, so that
   * nothing ticks behind a test that is not about the ticking.
   */
  liveEvery?: number;
  /** What `play` does with a run's tape, for the one test whose own failure is the point of it. */
  play?: (one: Run, tape: string) => void;
}

/**
 * Reads the list again the way a player does — the window shut and then opened — which is two turns of the
 * loop rather than one: a watcher whose value came back to where it was never runs its callback at all, so
 * a shut and an open in the same turn would be one turn that asked nothing.
 */
async function reopened(showing: Ref<boolean>): Promise<void> {
  showing.value = false;
  await settled();
  showing.value = true;
  await settled();
}


describe('the list, read while the window is open', () => {
  it('reads nothing at all until the window is open', async () => {
    const { wire, asked } = fakeWire({ runs: () => [run('run-1')] });
    const showing = ref(false);
    const list = useRuns(showing, { wire, every: 0, play: () => undefined, grow: () => undefined });
    await settled();
    expect(asked.runs).toBe(0);
    expect(list.runs.value).toEqual([]);

    // A page nobody has asked anything of does not ask the server, and the window opens onto the list as
    // it stands now rather than onto one a timer happened to leave behind.
    showing.value = true;
    await settled();
    expect(asked.runs).toBe(1);
    expect(list.runs.value.map((one) => one.id)).toEqual(['run-1']);
  });

  it('reads it again on a timer while it stays open, and stops once the window is shut', async () => {
    vi.useFakeTimers();
    try {
      const { wire, asked } = fakeWire({ runs: () => [run('run-1')] });
      const showing = ref(true);
      useRuns(showing, { wire, every: 1000, play: () => undefined, grow: () => undefined });
      await vi.advanceTimersByTimeAsync(0);
      expect(asked.runs).toBe(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(asked.runs).toBe(4);

      // Shut: a page left asking after the player has stopped looking is a page doing nothing for anybody.
      showing.value = false;
      await vi.advanceTimersByTimeAsync(3000);
      expect(asked.runs).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads it again the moment the window is opened again, not at the next tick of nothing', async () => {
    vi.useFakeTimers();
    try {
      const { wire, asked } = fakeWire({ runs: () => [run('run-1')] });
      const showing = ref(true);
      useRuns(showing, { wire, every: 1000, play: () => undefined, grow: () => undefined });
      await vi.advanceTimersByTimeAsync(0);

      showing.value = false;
      await vi.advanceTimersByTimeAsync(100);
      showing.value = true;
      await vi.advanceTimersByTimeAsync(0);
      expect(asked.runs).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the order the server gave, which is the newest first', async () => {
    const { list } = await openedList({ runs: () => [run('run-3'), run('run-2'), run('run-1')] });
    expect(list.runs.value.map((one) => one.id)).toEqual(['run-3', 'run-2', 'run-1']);
  });

  it('has nothing to draw and nothing to say when there are no runs at all', async () => {
    const { list } = await openedList();
    expect(list.runs.value).toEqual([]);
    expect(list.error.value).toBeNull();
    expect(list.opening.value).toBeNull();
  });
});

describe('a row picked', () => {
  /** The file a run of these tests answers with: not a tape this game would play, but a tape, as text. */
  const FILE = '{"format":"garden-tape/2","step":20,"steps":250,"seed":1,"stage":{"engine":{"speed":1,"gravity":0.0011,"fric":0.9993,"clamp":true},"dolls":[],"ropes":[]},"frames":[250],"edits":[]}';

  it('fetches that run\'s own tape and hands it on with the run it came from', async () => {
    const { list, asked, played } = await openedList({ runs: () => [run('run-1')], tape: () => FILE });
    const row = list.runs.value[0];
    await list.choose(row);

    expect(asked.tape).toEqual(['run-1']);
    expect(played).toEqual([{ run: row, tape: FILE }]);
    expect(list.error.value).toBeNull();
    expect(list.opening.value).toBeNull();
  });

  it('says which row is waiting for its own answer while the tape is on its way down', async () => {
    const onItsWay = held<string>();
    const { list } = await openedList({ runs: () => [run('run-1')], tape: () => onItsWay.promise });
    const picking = list.choose(list.runs.value[0]);
    // Nothing has been awaited of the wire: the row answers the finger before the server has.
    expect(list.opening.value).toBe('run-1');

    onItsWay.land(FILE);
    await picking;
    expect(list.opening.value).toBeNull();
  });

  it('asks for one tape at a time: a second row pressed meanwhile is not a second file', async () => {
    const onItsWay = held<string>();
    const { list, asked, played } = await openedList({
      runs: () => [run('run-1'), run('run-2')],
      tape: () => onItsWay.promise,
    });
    const [first, second] = list.runs.value;
    const picking = list.choose(first);
    await settled();
    await list.choose(second);

    expect(asked.tape).toEqual(['run-1']);
    expect(played).toEqual([]);

    onItsWay.land(FILE);
    await picking;
    expect(played.map((one) => one.run.id)).toEqual(['run-1']);
  });

  it('plays nothing and blames the player\'s own connection when the request never landed', async () => {
    const { list, played } = await openedList({
      runs: () => [run('run-1')],
      tape: () => {
        throw new Refused(0, 'Failed to fetch');
      },
    });
    await list.choose(list.runs.value[0]);
    expect(played).toEqual([]);
    expect(list.error.value).toBe('Прогон не дозвонился до сервера.');
    expect(list.opening.value).toBeNull();
  });

  it('blames the server rather than the connection when the door did not open', async () => {
    const { list } = await openedList({
      runs: () => [run('run-1')],
      tape: () => {
        throw new Refused(404, 'no recording run-1');
      },
    });
    await list.choose(list.runs.value[0]);
    expect(list.error.value).toBe('Сервер не отдал этот прогон.');
  });

  it('says the tape itself was unreadable when it came down and the game could not play it', async () => {
    // The third thing that can go wrong, and the one that is not the server's doing: the file arrived, and
    // what `play` does with it — the engine's own `loadTape`, which throws on a file this build cannot play
    // — is what failed. Blaming the server here would say something the player can check is untrue.
    const { list, asked } = await openedList(
      { runs: () => [run('run-1')], tape: () => FILE },
      {
        play: () => {
          throw new Error('the tape is not a run of this game');
        },
      },
    );
    await list.choose(list.runs.value[0]);
    expect(asked.tape).toEqual(['run-1']);
    expect(list.error.value).toBe('Прогон скачался, но игра не смогла его прочитать.');
  });
});

describe('a row that is still being played', () => {
  it('asks the run what it has so far rather than for a file it has not got', async () => {
    // A run in progress has no file of its own until it is over: what it has is a head and however many
    // seconds of it have happened (`LiveWire.stream`), and the row's own word for it (`live`) is what says so.
    const server = watchedRun();
    server.second();
    const { list, asked, watched, played } = await openedList(
      { runs: () => [run('run-1', true)] },
      { live: server.answer },
    );
    await list.choose(list.runs.value[0]);

    expect(asked.tape).toEqual([]);
    // Two asks, and the second is the first tick of the run's own asking: the run-so-far is what has happened
    // since *nothing*, and the one after it is what has happened since that (`follow`).
    expect(watched).toEqual([
      { id: 'run-1', after: -1 },
      { id: 'run-1', after: 0 },
    ]);
    expect(played).toHaveLength(1);
    expect(list.error.value).toBeNull();
  });

  it('hands the head and the slices that have arrived over as one tape: the run so far', async () => {
    const server = watchedRun();
    server.second();
    server.second();
    const { list, played } = await openedList({ runs: () => [run('run-1', true)] }, { live: server.answer });
    await list.choose(list.runs.value[0]);

    // What the engine is handed is a run as a file, exactly as it would be if the run were over: it has no
    // other way of reading one (`loadTape`).
    const soFar = decodeTape(played[0].tape);
    expect(soFar.seed).toBe(HEAD.seed);
    expect(soFar.stage).toEqual(HEAD.stage);
    expect(soFar.steps).toBe(100);
    expect(played[0].run).toEqual(list.runs.value[0]);
  });

  it('asks again a second later, past the slice it has, and hands on the tape it has grown into', async () => {
    vi.useFakeTimers();
    try {
      const server = watchedRun();
      server.second();
      const { list, watched, grew } = await openedList(
        { runs: () => [run('run-1', true)] },
        { live: server.answer, liveEvery: 1000 },
      );
      await list.choose(list.runs.value[0]);
      server.second();
      await vi.advanceTimersByTimeAsync(1000);
      server.second();
      await vi.advanceTimersByTimeAsync(1000);

      // What is asked past is the last slice this page has, and never the slice itself: a second of the run
      // arriving twice would be pasted on twice, and the run would grow by a second that had already happened.
      expect(watched.map((one) => one.after)).toEqual([-1, 0, 0, 1]);
      expect(grew.map((one) => one.tape.steps)).toEqual([50, 100, 150]);
      expect(grew.map((one) => one.run.live)).toEqual([true, true, true]);
      list.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops asking once the server says the run is over', async () => {
    vi.useFakeTimers();
    try {
      const server = watchedRun();
      server.second();
      const { list, watched, grew } = await openedList(
        { runs: () => [run('run-1', true)] },
        { live: server.answer, liveEvery: 1000 },
      );
      await list.choose(list.runs.value[0]);
      server.second();
      server.ends();
      await vi.advanceTimersByTimeAsync(5000);

      // Three asks and no more: the run is over, and the tape has all of it. It is the *row* that says so,
      // with the same answer that carried the last slice, which is how the engine hears it too.
      expect(watched.map((one) => one.after)).toEqual([-1, 0, 0]);
      expect(grew.map((one) => one.tape.steps)).toEqual([50, 100]);
      expect(grew.map((one) => one.run.live)).toEqual([true, false]);
      list.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops asking when the tape comes off the timeline', async () => {
    vi.useFakeTimers();
    try {
      const server = watchedRun();
      server.second();
      const { list, watched } = await openedList(
        { runs: () => [run('run-1', true)] },
        { live: server.answer, liveEvery: 1000 },
      );
      await list.choose(list.runs.value[0]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(watched).toHaveLength(3);

      // What the page calls when the run is put away, or when the player starts a run of their own
      // (`App.vue`): a run that is not on the timeline any more is a run nobody is watching.
      list.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(watched).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing in the window when a second of it does not arrive, and asks again', async () => {
    vi.useFakeTimers();
    try {
      const server = watchedRun();
      server.second();
      let asked = 0;
      const { list, grew } = await openedList(
        { runs: () => [run('run-1', true)] },
        {
          live: (id, after) => {
            asked += 1;
            if (asked === 2) throw new Refused(0, 'Failed to fetch');
            return server.answer(id, after);
          },
          liveEvery: 1000,
        },
      );
      await list.choose(list.runs.value[0]);
      server.second();
      await vi.advanceTimersByTimeAsync(1000);

      // The second that did not arrive is a second the tape does not grow by, not a run that went away: the
      // page hands on what it has, the asking goes on, and the reason is the console's.
      expect(grew.map((one) => one.tape.steps)).toEqual([100]);
      expect(list.error.value).toBeNull();
      expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
      list.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a run the server calls live and gives no head for', async () => {
    // The head is what a tape of such a run is built *from* (`tapeFrom`), and a run without one is not a run
    // this build can play: the sentence is the same one a file it cannot read gets.
    const server = watchedRun(null);
    const { list, played, grew } = await openedList(
      { runs: () => [run('run-1', true)] },
      { live: server.answer },
    );
    await list.choose(list.runs.value[0]);

    expect(played).toEqual([]);
    expect(grew).toEqual([]);
    expect(list.error.value).toBe('Прогон скачался, но игра не смогла его прочитать.');
    expect(list.opening.value).toBeNull();
  });
});

describe('a read that did not land', () => {
  it('leaves the rows that were there standing, and says what is wrong with the list', async () => {
    // A list that went blank because one request did not land would be worse than a list that is a few
    // seconds out of date: the sentence below the title is what says it is not being added to.
    const rule: Rule = { runs: () => [run('run-1'), run('run-2')] };
    const { list, showing } = await openedList(rule);
    expect(list.runs.value.map((one) => one.id)).toEqual(['run-1', 'run-2']);

    rule.runs = () => {
      throw new Refused(0, 'Failed to fetch');
    };
    await reopened(showing);

    expect(list.runs.value.map((one) => one.id)).toEqual(['run-1', 'run-2']);
    expect(list.error.value).toBe('Список прогонов не дозвонился до сервера.');
  });

  it('tells a request that never landed from a door that did not open', async () => {
    const offline = await openedList({
      runs: () => {
        throw new Refused(0, 'Failed to fetch');
      },
    });
    expect(offline.list.error.value).toBe('Список прогонов не дозвонился до сервера.');

    const refused = await openedList({
      runs: () => {
        throw new Refused(500, 'the recordings could not be read');
      },
    });
    expect(refused.list.error.value).toBe('Сервер не отдал список прогонов.');
  });

  it('leaves the server\'s own sentence in the console, where somebody can act on it', async () => {
    await openedList({
      runs: () => {
        throw new Refused(500, 'the recordings could not be read');
      },
    });
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
  });

  it('forgets the reason once the list is answered again', async () => {
    const rule: Rule = {
      runs: () => {
        throw new Refused(0, 'Failed to fetch');
      },
    };
    const { list, showing } = await openedList(rule);
    expect(list.error.value).not.toBeNull();

    rule.runs = () => [run('run-1')];
    await reopened(showing);

    expect(list.error.value).toBeNull();
    expect(list.runs.value.map((one) => one.id)).toEqual(['run-1']);
  });
});

