import { describe, expect, it } from 'vitest';
import type { Doll } from '../src/game/doll';
import {
  Random,
  TAPE_FORMAT,
  TAPE_PAUSE_STEPS,
  TAPE_SLICE_STEPS,
  TAPE_STEP_MS,
  TapePlayer,
  TapeRecorder,
  appendSlice,
  decodeTape,
  dollRow,
  encodeTape,
  seededRandom,
  tapeBytes,
  tapeFrom,
  type Tape,
  type TapeHead,
  type TapeSlice,
} from '../src/game/tape';
import { World } from '../src/game/world';
import { FACE } from '../src/game/pain-state';

/**
 * The tape: a run of the world written down, and played back.
 *
 * What is tested here is the promise the whole format is for — that a run recorded once is the same run
 * when it is played again, to the number — and the three things that promise rests on: that the rows a
 * recorder writes are the world's own poses quarter-pixel for quarter-pixel, that the stillnesses of a
 * run are pauses rather than rows of zeros, and that a file holds the run whole and refuses a file that
 * does not.
 *
 * The harness below is deliberately not `Game`: the game owns the loop, the canvas, the pointer and the
 * keyboard, and none of that is available in Node. What it does instead is run the two loops `Game` runs
 * — `liveStep` and `tapeStep` — against a plain `World`, in the same order and with the same calls into
 * it. The game's own doorways are the same ones, and the browser smoke test (`tools/smoke.mjs`) is
 * where the shipped loop is exercised whole.
 */

/** A world with one doll lying on the floor of it. */
function hall(): { world: World; doll: Doll } {
  const world = new World();
  const doll = world.addDoll({ x: 0, y: 0 });
  if (!doll) throw new Error('the engine refused a doll');
  world.layDown(doll);
  return { world, doll };
}

/**
 * Whether the world stands exactly where the last step left it, and nothing is in a hand — the world's
 * own half of what a pause is (`Game.standingStill`, with the harness's own notion of a held pointer).
 */
function standingStill(world: World, hand: boolean): boolean {
  if (hand || world.dragged !== null || world.draft !== null) return false;
  return world.engine.particles.every(
    (p) => Math.abs(p.x - p.oldx) + Math.abs(p.y - p.oldy) < 1e-6,
  );
}

/**
 * One step of a live world with a tape being written, in `Game.liveStep`'s own order: the run's row is
 * read before the step is taken, then the world steps.
 */
function liveStep(world: World, recorder: TapeRecorder, hand = false): void {
  recorder.step(world.dolls, standingStill(world, hand));
  world.step(TAPE_STEP_MS);
}

/**
 * One step of a playback, in `Game.tapeStep`'s own shape: the edits of the step, then the row the
 * recorder wrote for it, put straight into the world (`World.writePose`).
 */
function tapeStep(world: World, player: TapePlayer): void {
  player.walk((edit) => {
    if (edit[1] === 'doll') world.addDoll(undefined, { id: edit[2], name: edit[3], folder: edit[4] });
  }, (row) => world.writePose(row));
}

/** One thing the player did, at the step the world will read it after. */
interface Act {
  readonly step: number;
  readonly do: (world: World) => void;
}

/**
 * The doings of the run the tests below record: she is taken hold of and hauled up and across, let go
 * of, a rope is drawn from the air onto her and left holding her, and the rest of the run is the
 * world's own — dragging her, which is what a run mostly is.
 */
function script(): Act[] {
  const acts: Act[] = [{ step: 20, do: (world) => world.press(40, -20) }];
  for (let step = 21; step <= 60; step++) {
    acts.push({ step, do: (world) => world.moveTo(40 + (step - 20) * 4, -20 - (step - 20) * 3) });
  }
  acts.push({ step: 61, do: (world) => world.releaseAt(200, -140) });
  return acts;
}

/**
 * The scripted run, written down: the world's own odds are seeded from `seed`, the stage as it stands
 * is the tape's first moment, and the acts above are done to the world at their own steps — which is
 * `Game`'s loop, minus the canvas, the pointer and the keyboard. What a *hand* is doing between a
 * press and its release is what keeps the world from being taken for a still one.
 */
function record(world: World, seed: number, acts: readonly Act[], steps: number): Tape {
  world.useRandom(new Random(seed).next);
  const recorder = new TapeRecorder(seed, world.snapshot());
  const byStep = new Map<number, Act[]>();
  for (const act of acts) {
    byStep.set(act.step, [...(byStep.get(act.step) ?? []), act]);
  }
  let hand = false;
  for (let step = 0; step < steps; step++) {
    for (const act of byStep.get(step) ?? []) {
      act.do(world);
      hand = step >= 20 && step < 61;
    }
    liveStep(world, recorder, hand);
  }
  return recorder.finish();
}

/**
 * A tape played into a world from its own beginning, the way `Game` plays one: the stage is put back,
 * and every step is the tape's own row written into the world — no physics anywhere in it.
 *
 * What comes back is the world's own row at every step of the walk, which is what a playback is: the
 * rows the recorder wrote, nothing else. A recorder or player that dropped a row, doubled one, or
 * measured a delta from the wrong place cannot pass this, because the rows are the run.
 */
function play(world: World, tape: Tape): number[][] {
  const player = new TapePlayer(tape);
  world.restore(tape.stage);
  const rows: number[][] = [];
  const keep = (row: readonly number[]): void => {
    rows.push([...row]);
  };
  while (!player.done) {
    tapeStep(world, player);
    keep(dollRow(world.dolls));
  }
  return rows;
}

/** The rows a recorder wrote, one per step of the run, pauses held open for the steps they cover. */
function recordedRows(tape: Tape): number[][] {
  const rows: number[][] = [];
  let row: number[] | null = null;
  for (const record of tape.frames) {
    if (typeof record === 'number') {
      if (row === null) throw new Error('a pause before any row');
      for (let i = 0; i < record; i++) rows.push(row);
    } else {
      row = row && row.length === record.length ? row.map((v, i) => v + record[i]) : [...record];
      rows.push(row);
    }
  }
  return rows;
}

describe('the tape as a file', () => {
  it('reads back exactly what it wrote', () => {
    const { world } = hall();
    const tape = record(world, 7, script(), 240);
    const file = encodeTape(tape);
    const back = decodeTape(file);
    expect(back.frames).toEqual(tape.frames);
    expect(back.edits).toEqual(tape.edits);
    expect(back.stage).toEqual(tape.stage);
    expect(back.seed).toBe(tape.seed);
    expect(back.steps).toBe(tape.steps);
    // ...and writing it again gives the same file, to the character: a tape is a thing that can be copied.
    expect(encodeTape(back)).toBe(file);
  });

  it('refuses a file that is not a tape this build can play', () => {
    const { world } = hall();
    const tape = record(world, 10, script(), 60);
    const file = JSON.parse(encodeTape(tape)) as Record<string, unknown>;
    expect(() => decodeTape('{}')).toThrow(/not a/);
    expect(() => decodeTape('nonsense')).toThrow(/not JSON/);
    expect(() => decodeTape(JSON.stringify({ ...file, step: 16 }))).toThrow(/steps at 16/);
    expect(() => decodeTape(JSON.stringify({ ...file, frames: undefined }))).toThrow(/missing/);
    // The records have to cover exactly the length the tape says it is: a tape with a piece missing
    // from it is not a shorter run but a different one.
    expect(() => decodeTape(JSON.stringify({ ...file, steps: file.steps as number + 1 }))).toThrow(/cover/);
    expect(() => decodeTape(JSON.stringify({ ...file, frames: [1, 2] }))).toThrow(/two pauses/);
    expect(() => decodeTape(JSON.stringify({ ...file, frames: [0.5] }))).toThrow(/not a pause/);
    expect(() => decodeTape(JSON.stringify({ ...file, edits: [[5, 'block']] }))).toThrow(/not a doll/);
    expect(decodeTape(JSON.stringify(file)).format).toBe(TAPE_FORMAT);
  });

  it('costs a few kilobytes a second of a busy run, and nothing at all of a still one', () => {
    const { world } = hall();
    const tape = record(world, 9, script(), 240);
    const seconds = (240 * TAPE_STEP_MS) / 1000;
    // A dragged doll is the busiest a one-doll run gets: twenty-four deltas and a face a step, and the
    // deltas of a drag are one- and two-figure numbers. The stage is a few hundred bytes, once, and
    // a run of lying-still costs one whole number per stillness rather than a row a step.
    expect(tapeBytes(tape) / seconds, 'bytes a second, a dragged doll').toBeLessThan(8192);
    const { world: quiet } = hall();
    const still = record(quiet, 9, [], 240);
    // A run in which nothing ever happened after the doll was laid down: one row — the first, written
    // whole — and one pause covering the other 239 steps.
    expect(still.frames).toHaveLength(2);
    expect(still.frames[1]).toBe(239);
    expect(tapeBytes(still)).toBeLessThan(1024);
  });
});

describe('the rows a recorder writes', () => {
  it('writes the first row whole and the rest as deltas, on the quarter-pixel grid', () => {
    const { world } = hall();
    const tape = record(world, 11, script(), 40);
    const first = tape.frames[0];
    expect(Array.isArray(first)).toBe(true);
    // The first row is the stage's own pose, whole and quantized: a doll of twelve joints, a face
    // and her enlightenment latch.
    expect(first).toEqual(dollRow(hall().world.dolls));
    // The world stands still until the drag begins at step 20 — one pause covering the waiting — and
    // every step of the drag after that is a row.
    expect(tape.frames[1]).toBe(19);
    expect(tape.frames.slice(2).every((record) => Array.isArray(record))).toBe(true);
    // Every number in the file is a whole number of quarter-pixels.
    for (const record of tape.frames) {
      if (typeof record === 'number') continue;
      expect(record.every((value) => Number.isInteger(value))).toBe(true);
    }
  });

  it('carries the enlightenment beside the face, and a playback dresses its cards out of it', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(13, world.snapshot());
    // The run reaches the seventh portrait, holds it a moment, and comes all the way back down: the
    // face moves on, the latch does not, and both are in every row.
    liveStep(world, recorder);
    const doll = world.dolls[0];
    doll.pain.wear(FACE.super);
    liveStep(world, recorder);
    doll.pain.wear(FACE.calm, true);
    for (let step = 0; step < 3; step++) liveStep(world, recorder);
    const tape = recorder.finish();
    const rows = recordedRows(tape);
    const [beyond, calm] = [rows[1], rows[2]];
    // A row is twelve pairs, a face and a latch: the step of the seventh portrait carries a one
    // beside it, and the steps after — whatever their faces — go on carrying it.
    expect(beyond.at(-2)).toBe(FACE.super);
    expect(beyond.at(-1)).toBe(1);
    expect(calm.at(-2)).toBe(FACE.calm);
    expect(calm.at(-1)).toBe(1);

    // Played back, the world wears those rows — and its own latch is up from the step the tape says
    // so, which is what the card is dressed from (`pickPortrait` in `characters.ts`).
    const { world: watched } = hall();
    for (const row of rows) watched.writePose(row);
    expect(watched.dolls[0].pain.enlightened).toBe(true);

    // A row of an older build carried no latch, and the face stands in for it: the seventh portrait
    // latched it live, so a playback of such a tape still comes out dressed the way the run was.
    const old = rows.map((row) => row.slice(0, -1));
    const { world: older } = hall();
    for (const row of old) older.writePose(row);
    expect(older.dolls[0].pain.enlightened).toBe(true);

    // ...and the breather of such a tape latches the extremality the same way: the row below is an
    // old-shape one — no latch column — with the breather as its face.
    const { world: formerly, doll: worn } = hall();
    const short = dollRow([worn]).slice(0, -1);
    formerly.writePose([...short.slice(0, -1), FACE.rest]);
    expect(worn.pain.extremeOnce).toBe(true);
    expect(worn.pain.enlightened).toBe(false);
  });

  it('takes a pause of its own instead of the rows nothing happened in', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(12, world.snapshot());
    // Ten steps of a world being dragged, then the hand goes away and the world settles and stops.
    world.press(40, -20);
    for (let step = 0; step < 10; step++) {
      world.moveTo(40 + step * 4, -20 - step * 3);
      liveStep(world, recorder, true);
    }
    world.releaseAt(80, -50);
    for (let step = 0; step < 500; step++) liveStep(world, recorder, false);
    const tape = recorder.finish();
    // The stillness is one number in the file — 490 still steps and whatever the settling took — and
    // no two pauses sit next to each other, because anything that closes one merges into it.
    const pauses = tape.frames.filter((record) => typeof record === 'number');
    expect(pauses).toHaveLength(1);
    expect(tape.steps).toBe(510);
    expect(tape.frames[tape.frames.length - 1]).toBeGreaterThan(TAPE_PAUSE_STEPS - 10);
    // The steps of the run are exactly the steps its records cover, pauses included: a pause is time
    // the run took, and the timeline of it says so.
    const covered = tape.frames.reduce<number>((sum, record) => sum + (typeof record === 'number' ? record : 1), 0);
    expect(covered).toBe(tape.steps);
  });

  it('grows a pause by the wall clock once the world has stopped being stepped', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(13, world.snapshot());
    liveStep(world, recorder, false);
    // The world stands still from the first step, and the frame loop stops stepping it on the word of
    // `paused` — the stillness arriving by the clock instead (`TapeRecorder.idle`).
    for (let step = 0; step < TAPE_PAUSE_STEPS; step++) liveStep(world, recorder, false);
    expect(recorder.paused).toBe(true);
    recorder.idle(20 * 137);
    recorder.idle(10); // ...and the odd half-step is kept for the next one, not thrown away.
    expect(recorder.steps).toBe(TAPE_PAUSE_STEPS + 1 + 137);
    const tape = recorder.finish();
    expect(tape.frames).toEqual([tape.frames[0], tape.steps - 1]);
  });

  it('writes a step of a creeping world as a row, not a pause', () => {
    const { world, doll } = hall();
    const recorder = new TapeRecorder(14, world.snapshot());
    liveStep(world, recorder, false);
    // A doll creeping a hundredth of a pixel a step: her quantized row does not change for a step or
    // two at a time, but the world's own reading of stillness says she is *moving* — and the caller's
    // word is the other half of what a pause is (`Game.standingStill`).
    const stomach = doll.joint('stomach');
    if (!stomach) throw new Error('the rig has no stomach');
    world.press(stomach.x, stomach.y);
    liveStep(world, recorder, true);
    world.releaseAt(stomach.x, stomach.y);
    for (let step = 0; step < 20; step++) {
      for (const particle of doll.particles) {
        particle.y -= 0.0125;
        particle.oldy = particle.y + 0.0125;
      }
      // Still to the quantized grid, and moving to the world: a step like this is a row, because a
      // pause that swallowed it would swallow the fall.
      recorder.step(world.dolls, false);
    }
    const tape = recorder.finish();
    // The rows the creep wrote are rows of zeros — the grid cannot see a hundredth of a pixel — but
    // they are *rows*, one a step, and never a pause.
    expect(tape.frames.some((record) => typeof record === 'number')).toBe(false);
    expect(tape.frames.slice(2).every((record) => Array.isArray(record))).toBe(true);
  });

  it('files a doll arriving mid-run, and writes the row after her whole', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(15, world.snapshot());
    for (let step = 0; step < 30; step++) liveStep(world, recorder, false);
    recorder.dollAdded('id', 'Вторая', 'folder');
    const added = world.addDoll({ x: 160, y: -80 }, { id: 'id', name: 'Вторая', folder: 'folder' });
    expect(added).not.toBeNull();
    for (let step = 0; step < 20; step++) liveStep(world, recorder, false);
    const tape = recorder.finish();
    // The stillness before she arrived is the one pause of the run; the edit says which character
    // arrived and at the step she takes effect before; and the row that follows is written whole,
    // because a doll who was not in the row before is not a distance away from it. A doll's share
    // of a row is twelve pairs, a face and her enlightenment latch: twenty-six numbers.
    expect(tape.edits).toEqual([[30, 'doll', 'id', 'Вторая', 'folder']]);
    expect(typeof tape.frames[1]).toBe('number');
    const after = tape.frames[2] as number[];
    expect(after).toHaveLength(26 * 2);
  });
});

describe('a run played back', () => {
  it('is the run itself, row for row: a dragged, dropped and roped playback', () => {
    const { world } = hall();
    const tape = record(world, 12345, script(), 240);
    // Off the disk, rather than from memory: what a tape is played from is a file.
    const rows = play(new World(), decodeTape(encodeTape(tape)));
    expect(rows).toEqual(recordedRows(tape));
    expect(rows).toHaveLength(tape.steps);
  });

  it('carries the faces with the poses, and the dolls that arrive along the way', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(16, world.snapshot());
    // Drag her long enough for the face to have been through something, add a second doll mid-run,
    // and let them both settle: the cards and the cast are as much of the run as the joints are.
    const ankle = world.dolls[0].joint('foot1');
    if (!ankle) throw new Error('the rig has no foot');
    world.press(ankle.x, ankle.y);
    for (let step = 0; step < 150; step++) {
      world.moveTo(ankle.x + step * 2, ankle.y - step);
      liveStep(world, recorder, true);
    }
    world.releaseAt(ankle.x + 300, ankle.y - 150);
    recorder.dollAdded('id', 'Вторая', 'folder');
    world.addDoll({ x: 160, y: -80 }, { id: 'id', name: 'Вторая', folder: 'folder' });
    for (let step = 0; step < 200; step++) liveStep(world, recorder, false);
    const tape = recorder.finish();
    const rows = play(new World(), tape);
    expect(rows).toEqual(recordedRows(tape));
    // The faces were part of the rows, and at least one of them was not the calm one the run began on.
    const faces = new Set(rows.flatMap((row) => row.filter((_, i) => i % 25 === 24)));
    expect(faces.size).toBeGreaterThan(1);
  });

  it('plays a pause as the time it was: the playhead spends the pause in the one pose', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(17, world.snapshot());
    liveStep(world, recorder, false);
    for (let step = 0; step < 200; step++) liveStep(world, recorder, false);
    const tape = recorder.finish();
    const pause = tape.frames[tape.frames.length - 1] as number;
    expect(pause).toBe(200);
    expect(tape.steps).toBe(201);
    // Walking the tape spends exactly `pause` steps in the pose the stillness held, and arrives at the
    // end of the run with the world standing in it.
    const player = new TapePlayer(tape);
    const world2 = new World();
    world2.restore(tape.stage);
    let steps = 0;
    while (!player.done) {
      tapeStep(world2, player);
      steps++;
      expect(dollRow(world2.dolls)).toEqual(recordedRows(tape)[steps - 1]);
    }
    expect(steps).toBe(tape.steps);
  });

  it('winds to a step through the same rows a walk from the beginning goes through', () => {
    const { world } = hall();
    const tape = record(world, 18, script(), 240);
    const target = 173;
    const whole = play(new World(), tape);
    const player = new TapePlayer(tape);
    const world2 = new World();
    world2.restore(tape.stage);
    for (let step = 0; step < target; step++) tapeStep(world2, player);
    // A seek is the same walk, faster: the rows it lands in are the rows the run recorded, and the
    // world is standing in the one the asked-for step belongs to.
    expect(player.step).toBe(target);
    expect(dollRow(world2.dolls)).toEqual(whole[target - 1]);
  });
});

describe('a tape that is still being written', () => {
  /** The head of a run that is to arrive a slice at a time: what its player's own page opens it with. */
  function started(): TapeHead {
    const { world } = hall();
    return new TapeRecorder(19, world.snapshot()).head;
  }

  it('pastes a slice onto the run, and merges the pauses a heartbeat apart', () => {
    const head = started();
    const row = [1, -2, 3, -4, 0];
    const first: TapeSlice = { steps: 50, frames: [row, [0, 0, 0, 0, 0], 48], edits: [] };
    const second: TapeSlice = { steps: 50, frames: [50], edits: [] };
    const oneAtATime = appendSlice(appendSlice(tapeFrom(head), first), second);
    // The first slice ended in a stillness and the second began with one — a heartbeat closed the
    // first, the stillness went on — and what the viewer holds is the one pause the stillness is.
    expect(oneAtATime.frames).toEqual([row, [0, 0, 0, 0, 0], 98]);
    expect(oneAtATime.steps).toBe(100);
    // Nothing about the run is different for having arrived in pieces, and the run's own head is the
    // head's, untouched: a tape grown this way is the run, not a new one.
    expect(oneAtATime.seed).toBe(19);
    expect(oneAtATime.format).toBe(TAPE_FORMAT);
  });

  it('carries a walk on into what has arrived, and stops one that has nothing left', () => {
    const head = started();
    const soFar = appendSlice(tapeFrom(head), { steps: 50, frames: [Array(25).fill(1), 49], edits: [] });
    const player = new TapePlayer(soFar);
    const walked: number[][] = [];
    const walk = (): void => {
      while (!player.done) player.walk(() => {}, (row) => walked.push([...row]));
    };

    // A playback of a tape it has walked to the end stops there (`playFrame`): a run that is over does
    // not go on, and the playhead stays at the last step of the tape.
    walk();
    expect(walked).toHaveLength(50);
    expect(player.step).toBe(50);
    expect(player.done).toBe(true);

    // The same walk, with more of the run pasted on: it is not restarted and nothing is applied twice.
    player.grow(
      appendSlice(soFar, { steps: 50, frames: [Array(25).fill(2), 25, Array(25).fill(3), 23], edits: [] }),
    );
    expect(player.done).toBe(false);
    walk();
    expect(player.step).toBe(100);
    expect(walked).toHaveLength(100);
  });

  it('hands each second over once, however often it is asked', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(20, world.snapshot());
    world.press(40, -20);
    const drag = (steps: number): void => {
      for (let step = 0; step < steps; step++) {
        world.moveTo(40 + step * 2, -20 - step);
        liveStep(world, recorder, true);
      }
    };
    const slices: TapeSlice[] = [];
    const ask = (): void => {
      const slice = recorder.takeSlice(TAPE_SLICE_STEPS);
      if (slice) slices.push(slice);
    };
    // A second of dragging is handed over the moment it exists — and however often the page asks
    // between seconds, nothing more is: the slice in the making stays in the recorder's hand.
    drag(60);
    ask();
    ask();
    expect(slices).toHaveLength(1);
    expect(slices[0].steps).toBe(60);
    drag(40);
    ask();
    expect(slices).toHaveLength(1);
    drag(20);
    ask();
    ask();
    expect(slices).toHaveLength(2);
    expect(slices[1].steps).toBe(60);
    expect(slices.every((slice) => slice.frames.every((record) => Array.isArray(record)))).toBe(true);
    // The slices reassembled are the run the recorder finished, records and all — the server's own
    // paste (`assemble` in `backend/internal/store`) and the viewer's (`appendSlice`) are this too.
    const assembled = slices.reduce(appendSlice, tapeFrom(recorder.head));
    const finished = recorder.finish();
    expect(assembled.steps).toBe(finished.steps);
    expect(assembled.frames).toEqual(finished.frames);
    expect(assembled.stage).toEqual(finished.stage);
  });

  it('hands a long stillness over on the heartbeat, and everything on the tail', () => {
    const { world } = hall();
    const recorder = new TapeRecorder(21, world.snapshot());
    liveStep(world, recorder, false);
    for (let step = 0; step < 60; step++) liveStep(world, recorder, false);
    // A stillness short of the heartbeat is nobody's news: there is nothing to hand over.
    expect(recorder.takeSlice(TAPE_SLICE_STEPS)).toBeNull();
    // The world stops being stepped and the pause grows by the wall clock, past the heartbeat — one
    // number a minute of lying still, which is what a minute of nothing costs the wire.
    recorder.idle(TAPE_STEP_MS * 3000);
    const beat = recorder.takeSlice(TAPE_SLICE_STEPS);
    expect(beat).not.toBeNull();
    expect(beat?.steps).toBeGreaterThanOrEqual(3000);
    expect(beat?.frames[beat.frames.length - 1]).toBeGreaterThanOrEqual(3000);
    // The tail — `every` of one — hands over whatever is left, pause and all, and then nothing.
    recorder.idle(TAPE_STEP_MS * 30);
    const tail = recorder.takeSlice(1);
    expect(tail?.steps).toBeGreaterThanOrEqual(30);
    expect(recorder.takeSlice(1)).toBeNull();
  });
});

describe("the world's own randomness", () => {
  it('draws the same numbers twice from one seed, and others from another', () => {
    const first = new Random(42);
    const same = new Random(42);
    const other = new Random(43);
    const draws = Array.from({ length: 8 }, () => first.next());
    expect(draws).toEqual(Array.from({ length: 8 }, () => same.next()));
    expect(draws).not.toEqual(Array.from({ length: 8 }, () => other.next()));
    expect(draws.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(seededRandom(42)()).toBe(new Random(42).next());
  });
});

/**
 * A stage with something of every kind on it: a doll worked into trouble and a rope from the air tied
 * to her.
 *
 * She is dragged by her ankle for eight seconds first, which is what gives her *face* a state worth
 * carrying — the machine behind the card is a clock (`pain-state.ts`), and a clock that a stage does
 * not put back would be the one thing about her a returning player got wrong.
 */
function furnished(): { world: World; doll: Doll } {
  const { world, doll } = hall();
  const ankle = doll.joint('foot1');
  if (!ankle) throw new Error('the rig has no foot');
  world.press(ankle.x, ankle.y);
  for (let step = 0; step < 400; step++) {
    world.moveTo(ankle.x + step * 2, ankle.y - step);
    world.step(TAPE_STEP_MS);
  }
  world.releaseAt(ankle.x, ankle.y);
  world.startRope(-200, -200);
  world.finishRope(ankle.x, ankle.y);
  for (let step = 0; step < 60; step++) world.step(TAPE_STEP_MS);
  return { world, doll };
}

describe('a stage put back', () => {
  it('comes back whole: the rig, the rope and the face', () => {
    const { world } = furnished();
    const stage = world.snapshot();
    const fresh = new World();
    fresh.restore(stage);
    expect(fresh.snapshot()).toEqual(stage);
    expect(fresh.dolls).toHaveLength(1);
    expect(fresh.ropes).toHaveLength(1);
    // A tape's own head never carries the ropes — they are not part of the picture it takes — while
    // the world's own snapshot, which is what puts a player's scene aside under a watch, does.
    expect(new TapeRecorder(22, stage).head.stage.ropes).toEqual([]);
  });

  it('goes on exactly as it would have: a stage put back is the same world', () => {
    const { world } = furnished();
    const fresh = new World();
    fresh.restore(world.snapshot());
    // The same odds on both sides, since both are now drawing from their own stream of one seed.
    world.useRandom(new Random(5).next);
    fresh.useRandom(new Random(5).next);
    for (let step = 0; step < 200; step++) {
      world.step(TAPE_STEP_MS);
      fresh.step(TAPE_STEP_MS);
    }
    expect(fresh.snapshot()).toEqual(world.snapshot());
  });
});

/**
 * A run of a minute, written the way the game writes one, and played back the way the game plays one.
 *
 * This is the test the whole format is for: a long, rough, chaotic run — hauled to the ceiling and
 * round the hall a dozen times, the card changing under it — and a playback that is the run itself,
 * row for row, with no drift to measure because there is nothing to drift.
 */
describe('a minute of a run', () => {
  it('plays a long rough run back row for row', () => {
    const { world, doll } = hall();
    const seed = 77;
    world.useRandom(new Random(seed).next);
    // Up to the ceiling first, and then taken by the waist and hauled about the hall twelve times:
    // what a ragdoll does between two drags is chaos, and the old format's whole-input promise was
    // measured in exactly that. Here the rows *are* the run, so chaos has nothing to amplify.
    for (const particle of doll.particles) {
      particle.y = world.engine.miny;
      particle.oldy = particle.y;
    }
    // The stage a tape carries is the world as it stands when the recording starts, so the snapshot
    // is taken after the pose above.
    const recorder = new TapeRecorder(seed, world.snapshot());
    const mouse = { x: 0.1234567890123, y: -0.9876543210987 };
    let steps = 0;
    const live = (hand: boolean): void => {
      liveStep(world, recorder, hand);
      steps++;
    };

    for (let round = 0; round < 12; round++) {
      const stomach = world.dolls[0].joint('stomach');
      mouse.x = (stomach?.x ?? 0) + 0.1234567890123;
      mouse.y = (stomach?.y ?? 0) - 0.0987654321098;
      world.press(mouse.x, mouse.y);

      for (let i = 0; i < 80; i++) {
        mouse.x += 1.234567891011;
        mouse.y -= 0.765432109876;
        world.moveTo(mouse.x, mouse.y);
        live(true);
      }
      world.releaseAt(mouse.x, mouse.y);

      for (let i = 0; i < 150; i++) live(false);
    }
    const tape = recorder.finish();
    expect(tape.steps).toBe(steps);
    // Off a file, and played by a *different* world: what is measured is the run and nothing else.
    const rows = play(new World(), decodeTape(encodeTape(tape)));
    expect(rows).toEqual(recordedRows(tape));
    expect(rows).toHaveLength(tape.steps);
    // A minute of dragging is a few hundred kilobytes at the very most — the one budget the format
    // has to keep to be worth its simplicity.
    expect(tapeBytes(tape)).toBeLessThan(1024 * 1024);
  });
});
