import { describe, expect, it, vi } from 'vitest';
import { ref, shallowRef, type Ref } from 'vue';
import {
  Random,
  TAPE_FORMAT,
  TAPE_PAUSE_STEPS,
  TAPE_SLICE_STEPS,
  TAPE_STEP_MS,
  TapeRecorder,
  appendSlice,
  decodeTape,
  encodeTape,
  tapeFrom,
  tapeSeed,
  type Tape,
  type TapeHead,
  type TapeSlice,
} from '../src/game/tape';
import { World } from '../src/game/world';
import { useLiveRun } from '../src/composables/useLiveRun';
import { Refused } from '../src/chat/api';
import { liveApi, type LiveRunDraft, type LiveWire } from '../src/live/api';
import { Game, type TapeReport } from '../src/game/game';

/**
 * A run that is still being played: the slices of it the recording side hands over, and the page that hands
 * them over.
 *
 * Two promises are what this holds. The first is the tape's own: a run sent as slices *is* the run — the
 * server pastes a slice's frames and edits onto the ones before it (`assemble` in
 * `backend/internal/store`), so a run of a few seconds has to decode back into exactly the records and
 * length of one written whole. The second is the page's: a run in progress is opened once, grows a second
 * at a time, is handed over again rather than lost when a request fails, and is finished — with whatever
 * it still owes — when it stops being written.
 *
 * What is *not* here is the engine's own half of a run. Which touch of a doll starts one, and where the world
 * takes a pause instead of the minutes the player was away (`Game.pressAt`, `Game.runIsIdle`), live in the
 * shipped frame loop and belong to `tools/smoke.mjs`, where a real window presses a real doll. The one piece
 * of the engine's half that *is* here is what a watch costs the player: their scene and their run are put
 * aside for another player's tape and come back when it is put away — which needs no renderer to ask about
 * (`the player's own game, put aside for a watch`, below).
 */

/** A world with one doll lying on the floor of it, and the run of it being written. */
function hall(): { world: World; recorder: TapeRecorder } {
  const world = new World();
  const doll = world.addDoll({ x: 0, y: 0 });
  if (!doll) throw new Error('the engine refused a doll');
  world.layDown(doll);
  const seed = tapeSeed();
  world.useRandom(new Random(seed).next);
  return { world, recorder: new TapeRecorder(seed, world.snapshot()) };
}

/** One step of a live world with a run being written, in `Game.liveStep`'s own order. */
function liveStep(world: World, recorder: TapeRecorder, still = false): void {
  recorder.step(world.dolls, still);
  world.step(TAPE_STEP_MS);
}

/** Steps a run with the player busy: the doll is held and moved every step, so a row is written each step. */
function drag(world: World, recorder: TapeRecorder, steps: number): void {
  const doll = world.dolls[0];
  if (!doll) throw new Error('the engine refused a doll');
  const at = doll.centre;
  world.press(at.x, at.y);
  for (let i = 0; i < steps; i++) {
    world.moveTo(at.x + i * 3, at.y - i * 2);
    liveStep(world, recorder, false);
  }
  world.releaseAt(at.x + steps * 3, at.y - steps * 2);
}

/**
 * The slices of a run pasted together the way the server pastes them (`assemble` in
 * `backend/internal/store`): the head, the length its slices add up to, and the two lists end to end.
 *
 * This is the store's promise rather than a second implementation of it — the file a run sent in slices
 * becomes — and it is the thing the client's own writing has to be right for.
 */
function assembled(head: TapeHead, slices: readonly TapeSlice[]): string {
  const steps = slices.reduce((total, slice) => total + slice.steps, 0);
  const frames = slices.flatMap((slice) => slice.frames);
  const edits = slices.flatMap((slice) => slice.edits);
  return JSON.stringify({ ...head, steps, frames, edits });
}

/** The engine as the uploader sees it, in the ref a composable is handed: a head, and the slices in order. */
function engineOf(recorder: TapeRecorder | null): Ref<Game | null> {
  return shallowRef<Game | null>({
    liveHead: () => recorder?.head ?? null,
    liveSlice: (every: number = TAPE_SLICE_STEPS) => recorder?.takeSlice(every) ?? null,
  } as unknown as Game);
}

/**
 * A game with no renderer: the engine, the world and the tape's own state, and nothing drawn.
 *
 * `Game.create` needs a canvas for its scene, and everything about putting the player's game aside for a
 * watch needs none of it — the world, the recorder and the timeline's own flags live without one, and every
 * door the test uses reaches the renderer only through `?.`, which is null here by construction. The
 * constructor is private because a real game is `create`'d, not `new`'d; `Reflect.construct` is the test's
 * own way in, for the same reason a real page never constructs one by hand.
 */
function bareGame(): Game {
  return Reflect.construct(Game, [null]) as Game;
}

/** One step of a live world, through the engine's own door (`Game.liveStep`): what the frame loop does. */
function live(game: Game): void {
  (game as unknown as { liveStep(): void }).liveStep();
}

/** One step of a watched tape (`Game.playFrame`): what the frame loop does while a run is on the timeline. */
function watched(game: Game): void {
  (game as unknown as { playFrame(dt: number): void }).playFrame(TAPE_STEP_MS);
}

/** Takes the doll by a handful and drags her about, through the world's own doors, for so many steps. */
function dragGame(game: Game, steps: number): void {
  const doll = game.world.dolls[0];
  if (!doll) throw new Error('the engine refused a doll');
  const at = doll.centre;
  game.world.press(at.x, at.y);
  for (let i = 0; i < steps; i++) {
    game.world.moveTo(at.x + i * 3, at.y - i * 2);
    live(game);
  }
  game.world.releaseAt(at.x + steps * 3, at.y - steps * 2);
}

/**
 * Another player's run, as a file: a world of its own — with a second doll on the stage, so its stage is
 * visibly not this player's — and a seed of its own.
 */
function foreignTape(): string {
  const world = new World();
  const doll = world.addDoll({ x: 0, y: 0 });
  if (!doll) throw new Error('the engine refused a doll');
  world.layDown(doll);
  const second = world.addDoll({ x: 160, y: -80 });
  if (!second) throw new Error('the engine refused a second doll');
  const seed = tapeSeed();
  world.useRandom(new Random(seed).next);
  const recorder = new TapeRecorder(seed, world.snapshot());
  drag(world, recorder, TAPE_SLICE_STEPS);
  return encodeTape(recorder.finish());
}

/** A report as the uploader reads it: whether a run is being written, and nothing else. */
function report(recording: boolean): TapeReport {
  return {
    recording,
    playing: false,
    loaded: false,
    step: 0,
    steps: 0,
    seeking: false,
    seed: 0,
    bytes: 0,
  };
}

/** A wire that writes down what it was asked for, and refuses the call it is told to. */
function wireOf(refuseAt = 0): {
  wire: LiveWire;
  opened: { head: TapeHead; run: LiveRunDraft }[];
  sent: { id: string; seq: number; slice: TapeSlice }[];
  ended: { id: string; seq: number; slice: TapeSlice }[];
} {
  const opened: { head: TapeHead; run: LiveRunDraft }[] = [];
  const sent: { id: string; seq: number; slice: TapeSlice }[] = [];
  const ended: { id: string; seq: number; slice: TapeSlice }[] = [];
  let calls = 0;
  const wire: LiveWire = {
    async open(head, run) {
      opened.push({ head, run });
      return 'run-1';
    },
    async slice(id, seq, slice) {
      calls++;
      if (calls === refuseAt) throw new Error('the slice did not arrive');
      sent.push({ id, seq, slice });
    },
    async end(id, seq, slice) {
      ended.push({ id, seq, slice });
    },
    // The door a run is *read* back through, which the page that is writing one never opens: what watches a
    // run is another window, and a writer that reached for this would be a page that had gone wrong.
    async stream() {
      throw new Error('the page writing a run does not watch it');
    },
  };
  return { wire, opened, sent, ended };
}

/** The moment a run is opened at, and the name it is written under: the clock it began at. */
const at = Date.UTC(2026, 8, 27, 19, 12);
const clock = new Date(at);
const runName = `Прогон ${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;

describe('the slices of a run', () => {
  it('hands nothing over until a slice is worth having', () => {
    const { world, recorder } = hall();
    drag(world, recorder, TAPE_SLICE_STEPS - 1);
    expect(recorder.takeSlice(TAPE_SLICE_STEPS)).toBeNull();
    liveStep(world, recorder, false);
    expect(recorder.takeSlice(TAPE_SLICE_STEPS)?.steps).toBe(TAPE_SLICE_STEPS);
  });

  it('carries its own second, and no other second, in each slice', () => {
    const { world, recorder } = hall();
    const slices: TapeSlice[] = [];
    for (let second = 0; second < 3; second++) {
      drag(world, recorder, TAPE_SLICE_STEPS);
      const slice = recorder.takeSlice(TAPE_SLICE_STEPS);
      if (!slice) throw new Error('a second of a run did not make a slice');
      slices.push(slice);
    }
    // A slice's records cover exactly its own steps — a second apiece here, one row a step of a drag —
    // which is the whole of what makes a slice paste onto the one before it.
    for (const slice of slices) {
      const covered = slice.frames.reduce<number>((sum, record) => sum + (typeof record === 'number' ? record : 1), 0);
      expect(covered).toBe(slice.steps);
      expect(slice.steps).toBe(TAPE_SLICE_STEPS);
      expect(slice.frames.every((record) => Array.isArray(record))).toBe(true);
    }
  });

  it('hands each second over once, however often it is asked', () => {
    const { world, recorder } = hall();
    drag(world, recorder, TAPE_SLICE_STEPS);
    expect(recorder.takeSlice(TAPE_SLICE_STEPS)).not.toBeNull();
    expect(recorder.takeSlice(TAPE_SLICE_STEPS)).toBeNull();
    drag(world, recorder, TAPE_SLICE_STEPS);
    expect(recorder.takeSlice(TAPE_SLICE_STEPS)?.steps).toBe(TAPE_SLICE_STEPS);
  });

  it('adds up to the run itself: the same records, the same length', () => {
    const { world, recorder } = hall();
    const slices: TapeSlice[] = [];
    for (let second = 0; second < 3; second++) {
      drag(world, recorder, TAPE_SLICE_STEPS);
      const slice = recorder.takeSlice(TAPE_SLICE_STEPS);
      if (slice) slices.push(slice);
    }
    const tape = recorder.finish();
    const run = decodeTape(assembled(recorder.head, slices));
    expect(slices.reduce((total, slice) => total + slice.steps, 0)).toBe(tape.steps);
    expect(run.steps).toBe(tape.steps);
    expect(run.frames).toEqual(tape.frames);
    expect(run.edits).toEqual(tape.edits);
    expect(run.seed).toBe(tape.seed);
    expect(run.stage).toEqual(tape.stage);
  });

  it('takes a pause of its own instead of the minutes nothing happened in', () => {
    const { world, recorder } = hall();
    // A world left alone: every step of it changes nothing, and the recording is told so (`still`).
    for (let i = 0; i < TAPE_PAUSE_STEPS; i++) liveStep(world, recorder, true);
    expect(recorder.steps).toBe(TAPE_PAUSE_STEPS);
    expect(recorder.paused).toBe(false);

    liveStep(world, recorder, true);
    expect(recorder.paused).toBe(true);

    // Nothing is stepped at all while it is paused — `Game.frame` asks exactly this before stepping anything
    // — so the run grows by the wall clock instead (`TapeRecorder.idle`), and the stillness is one pause
    // in the file rather than a minute of rows nobody would watch.
    recorder.idle(TAPE_STEP_MS * 100);
    expect(recorder.steps).toBe(TAPE_PAUSE_STEPS + 1 + 100);

    // The first thing that happens puts the world — and the run — back into gear.
    liveStep(world, recorder, false);
    expect(recorder.paused).toBe(false);
    expect(recorder.steps).toBe(TAPE_PAUSE_STEPS + 2 + 100);
    const tape = recorder.finish();
    expect(tape.frames.filter((record) => typeof record === 'number')).toEqual([200]);
  });
});

describe('the page that hands a run over', () => {
  it('asks nothing of the server while no run is being written', async () => {
    vi.useFakeTimers();
    const { recorder } = hall();
    const { wire, opened, sent } = wireOf();
    const live = useLiveRun(engineOf(recorder), ref(report(false)), {
      wire,
      now: () => at,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(opened).toHaveLength(0);
    expect(sent).toHaveLength(0);
    live.stop();
  });

  it('opens a run with a head that has no run in it, and hands over a second at a time', async () => {
    vi.useFakeTimers();
    const { world, recorder } = hall();
    const { wire, opened, sent } = wireOf();
    const live = useLiveRun(engineOf(recorder), ref(report(true)), {
      wire,
      now: () => at,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(1);
    // A head is the four things a tape says about itself, and nothing that has happened yet: the server
    // refuses a head that carries a length, frames or edits (`readHead` in `internal/api`).
    expect(Object.keys(opened[0].head).sort()).toEqual(['format', 'seed', 'stage', 'step']);
    expect(opened[0].run).toEqual({ name: runName, recordedMs: at });

    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.map((one) => one.id)).toEqual(['run-1', 'run-1']);
    expect(sent.map((one) => one.seq)).toEqual([0, 1]);
    expect(sent.map((one) => one.slice.steps)).toEqual([TAPE_SLICE_STEPS, TAPE_SLICE_STEPS]);
    // One run however many seconds of it: the head is sent once, and the slices go to it.
    expect(opened).toHaveLength(1);
    live.stop();
  });

  it('hands a slice over again, under the number it already had, when it did not arrive', async () => {
    vi.useFakeTimers();
    const { world, recorder } = hall();
    const { wire, sent } = wireOf(1);
    const live = useLiveRun(engineOf(recorder), ref(report(true)), {
      wire,
      now: () => at,
    });
    await vi.advanceTimersByTimeAsync(0);
    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(1);
    expect(sent[0].seq).toBe(0);
    expect(sent[0].slice.steps).toBe(TAPE_SLICE_STEPS);
    live.stop();
  });

  it('finishes a run that is still being written: the tail of it, under a whole slice', async () => {
    vi.useFakeTimers();
    const { world, recorder } = hall();
    const { wire, ended } = wireOf();
    const live = useLiveRun(engineOf(recorder), ref(report(true)), {
      wire,
      now: () => at,
    });
    await vi.advanceTimersByTimeAsync(0);
    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    drag(world, recorder, 7);
    await live.end();
    expect(ended).toHaveLength(1);
    expect(ended[0].seq).toBe(1);
    expect(ended[0].slice.steps).toBe(7);
    live.stop();
  });

  it('ends a run that owes nothing with an empty last word, rather than not ending it', async () => {
    vi.useFakeTimers();
    const { world, recorder } = hall();
    const { wire, ended } = wireOf();
    const live = useLiveRun(engineOf(recorder), ref(report(true)), {
      wire,
      now: () => at,
    });
    await vi.advanceTimersByTimeAsync(0);
    // The run's last second went out whole — the final ask fell exactly on the end of the run — so the
    // ending has nothing of the run left to carry. It still goes out: a page closed a moment after its
    // last second would otherwise leave the run open on the server until the grace ran out, and a word
    // with nothing in it is what the server takes for exactly this (`readChunk` in `backend/internal/api`).
    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(recorder.takeSlice(TAPE_SLICE_STEPS)).toBeNull();
    await live.end();
    expect(ended).toHaveLength(1);
    expect(ended[0].seq).toBe(1);
    expect(ended[0].slice.steps).toBe(0);
    expect(ended[0].slice.frames).toEqual([]);
    live.stop();
  });

  it('finishes what it owes when the writing stops, and asks nothing after', async () => {
    vi.useFakeTimers();
    const { world, recorder } = hall();
    const { wire, sent, ended } = wireOf(1);
    const tape = ref(report(true));
    const live = useLiveRun(engineOf(recorder), tape, {
      wire,
      now: () => at,
    });
    await vi.advanceTimersByTimeAsync(0);
    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    // The slice that did not arrive is what the run is finished with, rather than a second of it dropped.
    tape.value = report(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ended).toHaveLength(1);
    expect(ended[0].seq).toBe(0);
    expect(ended[0].slice.steps).toBe(TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(3000);
    expect(sent).toHaveLength(0);
    live.stop();
  });

  it('keeps one run open across a watch: the same id, the next second, and no ending', async () => {
    vi.useFakeTimers();
    const { world, recorder } = hall();
    const { wire, opened, sent, ended } = wireOf();
    // The report says `recording` straight through a watch (`Game.recorder` is put aside, not ended), so the
    // tape ref never turns over here — which is the whole of what the uploader knows about a watch.
    const live = useLiveRun(engineOf(recorder), ref(report(true)), {
      wire,
      now: () => at,
    });
    await vi.advanceTimersByTimeAsync(0);
    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.map((one) => one.seq)).toEqual([0]);

    // The watch itself: nothing is written while another run has the world, so the asking — which goes on —
    // is handed nothing, and the run is neither finished nor opened a second time.
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(1);
    expect(ended).toHaveLength(0);
    expect(opened).toHaveLength(1);

    // ...and the player comes back to their game: the next second of the *same* run, under the same id.
    drag(world, recorder, TAPE_SLICE_STEPS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(opened).toHaveLength(1);
    expect(sent.map((one) => [one.id, one.seq])).toEqual([
      ['run-1', 0],
      ['run-1', 1],
    ]);
    expect(ended).toHaveLength(0);
    live.stop();
  });
});

describe('the door a run is watched through', () => {
  /** A `fetch` that answers one value and keeps every address it was asked for: the wire takes its own. */
  function fakeServer(body: unknown) {
    const asked: string[] = [];
    const take = (async (input: RequestInfo | URL) => {
      asked.push(String(input));
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    return { take, asked };
  }

  /** A head the server might hold, in the shape a tape's own head has. */
  const stage = { engine: { speed: 1, gravity: 0.0011, fric: 0.9993, clamp: true }, dolls: [], ropes: [] };

  it("asks past the last slice the viewer has, and reads the server's own names", async () => {
    const server = fakeServer({
      recording: { id: 'run-1', name: 'прогон', author: 'Марго', steps: 100, step_ms: TAPE_STEP_MS, live: true },
      head: { format: TAPE_FORMAT, step: TAPE_STEP_MS, seed: 77, stage },
      chunks: [{ seq: 3, steps: 50, frames: [[1, 2, 3], 47], edits: [] }],
    });
    const stream = await liveApi('/api', server.take).stream('run-1', 2);

    // `after` is the slice the viewer already has, and the answer is the server's own names turned into this
    // client's once, here — the row (`asRun`) and the slices (`WireSlice`) included.
    expect(server.asked).toEqual(['/api/recordings/run-1/chunks?after=2']);
    expect(stream.run).toEqual({
      id: 'run-1',
      name: 'прогон',
      author: 'Марго',
      steps: 100,
      stepMs: TAPE_STEP_MS,
      live: true,
    });
    expect(stream.head?.seed).toBe(77);
    expect(stream.slices).toEqual([{ seq: 3, steps: 50, frames: [[1, 2, 3], 47], edits: [] }]);
  });

  it('asks past nothing at all for a viewer that has just arrived, and has no slices then', async () => {
    // A viewer that arrives in the middle of a run has nothing behind it, and that is what asks for the whole
    // run so far: the head and every slice of it. The same answer is what a run with nothing in it yet gives.
    const server = fakeServer({
      recording: { id: 'run-2', name: 'прогон', author: 'Марго', steps: 0, step_ms: TAPE_STEP_MS, live: true },
      head: { format: TAPE_FORMAT, step: TAPE_STEP_MS, seed: 1, stage },
      chunks: [],
    });
    const stream = await liveApi('/api', server.take).stream('run-2', -1);

    expect(server.asked).toEqual(['/api/recordings/run-2/chunks?after=-1']);
    expect(stream.run.steps).toBe(0);
    expect(stream.run.live).toBe(true);
    expect(stream.slices).toEqual([]);
  });

  it('refuses an answer that is about no run at all', async () => {
    // A door that answers with slices of nothing — a proxy's own page, a server that has lost its run — is not
    // an answer: there is no row to say how long the run is and no head for a tape to be built from.
    const server = fakeServer({});
    await expect(liveApi('/api', server.take).stream('run-1', -1)).rejects.toThrow(Refused);
  });
});

describe('the run as somebody else watches it', () => {
  it("reads it back from the writer's own slices: the head, pasted, is the recorded run", () => {
    const { world, recorder } = hall();
    const slices: TapeSlice[] = [];
    for (let second = 0; second < 3; second++) {
      drag(world, recorder, TAPE_SLICE_STEPS);
      const slice = recorder.takeSlice(TAPE_SLICE_STEPS);
      if (!slice) throw new Error('a second of a run did not make a slice');
      slices.push(slice);
    }

    // The two ends of a live run, meeting: what the writer hands over (`takeSlice`) is what a watcher pastes on
    // (`appendSlice`), and what comes out of it is the tape the writer itself has — the same records, the same
    // length — which is the whole of what the slices are for.
    const watched = slices.reduce<Tape>((tape, slice) => appendSlice(tape, slice), tapeFrom(recorder.head));
    const recorded = recorder.finish();
    expect(watched.steps).toBe(recorded.steps);
    expect(watched.frames).toEqual(recorded.frames);
    expect(watched.edits).toEqual(recorded.edits);
    expect(watched.seed).toBe(recorded.seed);
    expect(watched.stage).toEqual(recorded.stage);
    // ...and the file of it is a run this build plays, read by the decoder a watcher would read it with.
    expect(decodeTape(encodeTape(watched)).frames).toEqual(recorded.frames);
  });
});

describe("the player's own game, put aside for a watch", () => {
  it('comes back with the tape: the scene as it was left, and the same run going on', () => {
    const game = bareGame();
    // The streams the world is handed, in order: a run's own weather, and then whatever the world is given
    // when the player comes back — which is what the assertion below is about, since a stream is a function
    // and only its identity says whether a run's odds went on where they were.
    const streams: (() => number)[] = [];
    const useRandom = game.world.useRandom;
    game.world.useRandom = (random: () => number) => {
      streams.push(random);
      useRandom.call(game.world, random);
    };

    game.record();
    dragGame(game, 30);
    const own = game.world.snapshot();
    const seed = game.liveHead()?.seed;
    const weather = streams.at(-1);

    // The watch: another player's tape takes the world, and the player's own run stands suspended under it —
    // neither ended (it is still the run being written) nor written into (the world is the watched run's).
    game.loadTape(foreignTape());
    game.play();
    expect(game.tapeState.loaded).toBe(true);
    expect(game.tapeState.recording).toBe(true);
    expect(game.world.dolls).toHaveLength(2);
    for (let i = 0; i < TAPE_SLICE_STEPS; i++) watched(game);

    // The tape comes off, and the player's own game comes back with it: the scene as it was left — dolls
    // and ropes and all — and the run that was being written, on as the same run rather than a new one.
    game.unload();
    expect(game.tapeState.loaded).toBe(false);
    expect(game.tapeState.recording).toBe(true);
    expect(game.liveHead()?.seed).toBe(seed);
    expect(game.world.snapshot()).toEqual(own);
    expect(game.world.dolls).toHaveLength(1);
    // The weather went on where it was: the stream the world was handed back is the one the run began with,
    // and not a fresh one — a re-seeded stream would restart its numbers, and the run that went on would
    // draw different odds at the same steps than the recording had drawn.
    expect(streams.at(-1)).toBe(weather);

    // ...and the run that went on is one run: the steps before the watch and after it are counted together,
    // and the watched run is not in it — the stage that went into the file is the player's own.
    dragGame(game, 20);
    const finished = game.stopRecording();
    expect(finished?.seed).toBe(seed);
    expect(finished?.steps).toBe(50);
    expect(finished?.edits).toEqual([]);
    // A playback of it is still exactly the run — the watch left nothing in the world the file cannot put back.
    const file = finished ? decodeTape(encodeTape(finished)) : null;
    expect(file?.steps).toBe(50);
  });

  it('puts a scene aside for a watch even when no run is being written', () => {
    const game = bareGame();
    const doll = game.world.dolls[0];
    if (!doll) throw new Error('the engine refused a doll');
    // A doll moved about by hand, no recording: the opening scene made into the player's own.
    game.world.press(doll.centre.x, doll.centre.y);
    game.world.moveTo(doll.centre.x + 80, doll.centre.y - 40);
    game.world.releaseAt(doll.centre.x + 80, doll.centre.y - 40);
    const own = game.world.snapshot();

    game.loadTape(foreignTape());
    game.play();
    game.unload();
    // The scene is the player's own again rather than the watched run's last state, and there is no run to
    // go on with — the first touch of a doll after this starts one, as the first touch before it would have.
    expect(game.world.snapshot()).toEqual(own);
    expect(game.tapeState.recording).toBe(false);
    expect(game.liveHead()).toBeNull();
  });
});

describe('the walk under a tape that grows', () => {
  /** Whether the walk has come to the end of what has arrived of the tape (`TapePlayer.done`). */
  function atTheEnd(game: Game): boolean {
    return (game as unknown as { player: { done: boolean } }).player.done;
  }

  it('is the same walk as the whole file: slices arriving late and bunched change nothing', () => {
    const { world, recorder } = hall();
    // A long, busy run: dragged about, let go, standing still for longer than a pause is worth, and dragged
    // about again — everything a walk has to reproduce exactly, and the kind of run a live watch is fed by.
    drag(world, recorder, 110);
    for (let i = 0; i < TAPE_PAUSE_STEPS + 30; i++) liveStep(world, recorder, true);
    drag(world, recorder, 140);
    // The run's slices as the writer hands them over — a second at a time — and the tail that ends it.
    const slices: TapeSlice[] = [];
    for (;;) {
      const slice = recorder.takeSlice(TAPE_SLICE_STEPS);
      if (!slice) break;
      slices.push(slice);
    }
    const tail = recorder.takeSlice(1);
    if (tail) slices.push(tail);
    const file = recorder.finish();
    expect(file.steps).toBe(110 + TAPE_PAUSE_STEPS + 30 + 140);

    // A watcher: the head first, and the slices pasted on as they arrive — one at a time, sometimes two at
    // once the way a slow network bunches them — with the walk catching up between arrivals and standing
    // at the end of what has arrived, which is where a playback waits for the rest of a live run.
    const watcher = bareGame();
    watcher.loadTape(encodeTape(tapeFrom(recorder.head)));
    watcher.play();
    let arrived = tapeFrom(recorder.head);
    let fed = 0;
    while (fed < slices.length) {
      const bunch = slices.slice(fed, fed + (fed % 3 === 2 ? 2 : 1));
      for (const slice of bunch) arrived = appendSlice(arrived, slice);
      fed += bunch.length;
      watcher.growTape(arrived, true);
      for (let guard = 0; !atTheEnd(watcher) && guard <= file.steps; guard++) watched(watcher);
      for (let i = 0; i < 3; i++) watched(watcher);
    }
    watcher.growTape(arrived, false);
    for (let guard = 0; !atTheEnd(watcher) && guard < 10; guard++) watched(watcher);

    // The same run as one file, walked straight through by a game of its own: two watchers of one run.
    // The world each ends standing in has to be the same world — every joint and every card — because a
    // tape that grows under a walk is not allowed to change one step of it.
    const straight = bareGame();
    straight.loadTape(encodeTape(file));
    straight.play();
    for (let guard = 0; !atTheEnd(straight) && guard <= file.steps; guard++) watched(straight);

    expect(watcher.tapeState.step).toBe(file.steps);
    expect(watcher.world.snapshot()).toEqual(straight.world.snapshot());
  });

  it("does not let the viewer's own tab disturb a watched run", () => {
    const { world, recorder } = hall();
    drag(world, recorder, 40);
    const watcher = bareGame();
    watcher.loadTape(encodeTape(recorder.finish()));
    watcher.play();
    for (let i = 0; i < 20; i++) watched(watcher);
    const before = watcher.world.snapshot();

    // The viewer's tab goes hidden — switched away from, another window over it — and the watched run's
    // world is nobody's to touch: a playback is the tape's picture, and there is no hand in it to drop.
    vi.stubGlobal('document', { hidden: true });
    (watcher as unknown as { onVisibility(): void }).onVisibility();
    vi.unstubAllGlobals();
    expect(watcher.world.snapshot()).toEqual(before);
  });
});
