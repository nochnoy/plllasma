import { describe, expect, it } from 'vitest';
import type { Doll } from '../src/game/doll';
import {
  BEYOND,
  CALM,
  EXTREME,
  WORRY,
  dollSources,
  type PainLevel,
  type PainSource,
  type PoseSources,
} from '../src/game/pain';
import { FACE } from '../src/game/pain-state';
import { ENLIGHTENMENT_MS, FEATS, FeatState, OVERSPLIT_DEGREES } from '../src/game/feat-state';
import { World } from '../src/game/world';
import { Game } from '../src/game/game';

/**
 * The machine that says what the run's own line in the chat says (`feat-state.ts`): seven poses
 * worth a word, each word with a weight, the line only ever climbing to a heavier word, and the
 * enlightenment held for its three seconds over everything else.
 *
 * The poses are built the way `tests/pain.test.ts` builds them — joints written onto a real rig,
 * angles turned towards her back — so what a test calls a split is the pose the model itself would
 * measure as one. Time is the world's own 20 ms step, and the floor is the engine's own bottom
 * edge, read off the world rather than assumed.
 */

/** The world's own step, as `World.step` runs it: 20 ms of real time per frame. */
const STEP = 20;

interface Vec {
  readonly x: number;
  readonly y: number;
}

/** A point turned about a centre by `deg`, the way a screen angle grows: towards her back. */
function turned(point: Vec, centre: Vec, deg: number): Vec {
  const radians = (deg * Math.PI) / 180;
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return {
    x: centre.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: centre.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

/** A doll on a world's stage, in the pose the movie authored — the base every test pose is built from. */
function aDoll(): { world: World; doll: Doll } {
  const world = new World();
  const doll = world.addDoll({ x: 0, y: 0 });
  if (!doll) throw new Error('the engine refused a doll');
  return { world, doll };
}

/** Writes joints onto a doll's own rig, standing still: a pose is only ever its points. */
function poseDoll(doll: Doll, points: Partial<Record<string, Vec>>): void {
  for (const [name, at] of Object.entries(points)) {
    const joint = doll.joint(name);
    if (!joint || !at) throw new Error(`the rig is missing a ${name}`);
    // Both of a particle's positions, or the pose arrives as a fling: Verlet reads the difference
    // between them as the velocity of the step (`World.layDown` sets scenes the same way).
    joint.x = at.x;
    joint.y = at.y;
    joint.oldx = at.x;
    joint.oldy = at.y;
  }
}

/** The rig stood up the screen: her spine on the y axis, her feet a little apart, her arms out. */
function standUp(doll: Doll): void {
  poseDoll(doll, {
    head: { x: 0, y: -120 },
    neck: { x: 0, y: -90 },
    stomach: { x: 0, y: -50 },
    pants: { x: 0, y: 0 },
    knee1: { x: -20, y: 60 },
    foot1: { x: -20, y: 120 },
    knee2: { x: 20, y: 60 },
    foot2: { x: 20, y: 120 },
    arm1: { x: -40, y: -60 },
    hand1: { x: -70, y: -55 },
    arm2: { x: 40, y: -60 },
    hand2: { x: 70, y: -55 },
  });
}

/**
 * Her legs swung straight about the pelvis: one thigh `hip1` degrees towards her back and the other
 * `hip2` towards her front, knees straight — the angles the hips themselves are read in, so a pose
 * is written the way a player would read it off the screen.
 */
function legsSwung(doll: Doll, hip1: number, hip2: number): void {
  const spun = (deg: number): ((p: Vec) => Vec) => {
    const radians = (-deg * Math.PI) / 180;
    return (p) => ({
      x: p.x * Math.cos(radians) - p.y * Math.sin(radians),
      y: p.x * Math.sin(radians) + p.y * Math.cos(radians),
    });
  };
  const front = spun(hip1);
  const back = spun(hip2);
  poseDoll(doll, {
    knee1: front({ x: 0, y: 60 }),
    foot1: front({ x: 0, y: 120 }),
    knee2: back({ x: 0, y: 60 }),
    foot2: back({ x: 0, y: 120 }),
  });
}

/**
 * Her waist arched `deg` degrees back — the upper torso turned about the belly, the way a waist
 * bends, the pelvis staying where it is.
 */
function archBack(doll: Doll, deg: number): void {
  const belly = { x: 0, y: -50 };
  poseDoll(doll, {
    neck: turned({ x: 0, y: -90 }, belly, deg),
    head: turned({ x: 0, y: -120 }, belly, deg),
  });
}

/** Her arms raised past her head: the pose a backbend is told apart from a bridge by. */
function armsUp(doll: Doll): void {
  poseDoll(doll, {
    arm1: { x: -30, y: -140 },
    hand1: { x: -45, y: -180 },
    arm2: { x: 30, y: -140 },
    hand2: { x: 45, y: -180 },
  });
}

/** Her arms reaching down to the floor beside her feet: the pose a bridge is. */
function armsDown(doll: Doll): void {
  poseDoll(doll, {
    arm1: { x: -10, y: 30 },
    hand1: { x: -30, y: 100 },
    arm2: { x: 10, y: 30 },
    hand2: { x: 30, y: 100 },
  });
}

/** Both knees and both feet flat on the floor of the world, give or take its own tolerance. */
function planted(doll: Doll, floorY: number): void {
  poseDoll(doll, {
    knee1: { x: 30, y: floorY - 7 },
    foot1: { x: 20, y: floorY - 1 },
    knee2: { x: -30, y: floorY - 7 },
    foot2: { x: -20, y: floorY - 1 },
  });
}

/** What a posed doll's own sources read, so a test can check the pose it built is the one it meant. */
function sourcesOf(doll: Doll): PoseSources {
  const sources = dollSources(doll);
  if (!sources) throw new Error('the rig cannot be read');
  return sources;
}

/** Sources built to order, the way the face machine's own tests build them (`pain-state.test.ts`). */
function sourcesAt(
  levels: Partial<Record<'neck' | 'waist' | 'hip' | 'split', PainLevel>> = {},
): PoseSources {
  const source = (name: 'neck' | 'waist' | 'hip' | 'split'): PainSource => {
    const level = levels[name] ?? CALM;
    return { amount: level * 100, level };
  };
  return {
    neck: source('neck'),
    waist: source('waist'),
    hip: source('hip'),
    split: { ...source('split'), back: 'knee1' },
  };
}

/** Runs the machine for `ms` of world time, the way the game runs it. */
function run(state: FeatState, doll: Doll | null, floorY: number, ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += STEP) state.step(doll, floorY, STEP);
}

describe('the poses the markers are read from', () => {
  it('a wide-enough opening of the thighs is a split and nothing more', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    // One leg 35 degrees back and the other 125 forward: the thighs are 160 apart — past the bar
    // the lightest word waits at — while the split's own ladder has only reached its first step.
    legsSwung(doll, 35, -125);
    const sources = sourcesOf(doll);
    expect(doll.thighAngle()).toBeGreaterThanOrEqual(OVERSPLIT_DEGREES);
    expect(sources.split.level).toBe(WORRY);
    expect(sources.waist.level).toBe(CALM);
    const state = new FeatState();
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.split);
    expect(state.said?.label).toBe('Сделал шпагат');
  });

  it('a spine arched to the extreme step is a backbend, with the arms out of the bridge\'s way', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    archBack(doll, 75);
    armsUp(doll);
    expect(sourcesOf(doll).waist.level).toBe(EXTREME);
    const state = new FeatState();
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.backbend);
    expect(state.said?.label).toBe('Сделал бэкбенд');
  });

  it('a split arrived at the extreme step is an oversplit', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    legsSwung(doll, 90, -90);
    expect(sourcesOf(doll).split.level).toBe(BEYOND);
    const state = new FeatState();
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.oversplit);
    expect(state.said?.label).toBe('Сделал перешпагат');
  });

  it('hands and feet below the body, arched to the extreme step, is a bridge', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    archBack(doll, 75);
    armsDown(doll);
    const state = new FeatState();
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.bridge);
    expect(state.said?.label).toBe('Сделал мостик');
  });

  it('one leg below the body and the other above the head, in a split, is a затяжка', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    archBack(doll, 75);
    // One leg straight down under her and the other swung 175 degrees, past vertical and above her
    // head — a vertical split, which the split's own ladder cannot even see (it reads the hips
    // apart, and these are in a line), so the thighs' own angle is what the marker reads.
    legsSwung(doll, 0, -175);
    expect(doll.thighAngle()).toBeGreaterThanOrEqual(OVERSPLIT_DEGREES);
    expect(sourcesOf(doll).waist.level).toBe(EXTREME);
    const state = new FeatState();
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.suspension);
    expect(state.said?.label).toBe('Сделал затяжку');
  });

  it('knees and feet flat on the floor of the world, arched, is a triplefold', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    archBack(doll, 75);
    planted(doll, world.engine.maxy);
    expect(sourcesOf(doll).waist.level).toBe(EXTREME);
    const state = new FeatState();
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.triplefold);
    expect(state.said?.label).toBe('Сделал трипплфолд');
  });

  it('the seventh portrait is the enlightenment, whatever the pose underneath it', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    doll.pain.step(sourcesAt({ neck: BEYOND, split: BEYOND }), STEP);
    expect(doll.pain.shown).toBe(FACE.super);
    const state = new FeatState();
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.superflex);
    expect(state.said?.label).toBe('Достиг супергибкости');
  });

  it('a doll that is not there is a pose that is nothing', () => {
    const state = new FeatState();
    state.step(null, 207, STEP);
    expect(state.shown).toBeNull();
    expect(state.said).toBeNull();
  });
});

describe('the line only climbs', () => {
  it('keeps the heavier word when what comes is lighter or the same weight', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    const state = new FeatState();
    legsSwung(doll, 35, -125);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.said).toBe(FEATS.split);

    // A backbend weighs the same: the line keeps the words it had.
    standUp(doll);
    archBack(doll, 75);
    armsUp(doll);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.backbend);
    expect(state.said).toBe(FEATS.split);

    // An oversplit weighs more: the line takes it.
    standUp(doll);
    legsSwung(doll, 90, -90);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.said).toBe(FEATS.oversplit);

    // A bridge weighs the same as an oversplit, and a plain split less: neither moves the line.
    standUp(doll);
    archBack(doll, 75);
    armsDown(doll);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.bridge);
    expect(state.said).toBe(FEATS.oversplit);
    standUp(doll);
    legsSwung(doll, 35, -125);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.said).toBe(FEATS.oversplit);
  });

  it('says nothing while the pose is nothing worth a word', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    const state = new FeatState();
    run(state, doll, world.engine.maxy, 5000);
    expect(state.shown).toBeNull();
    expect(state.said).toBeNull();
  });

  it('starts over when a run does', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    const state = new FeatState();
    legsSwung(doll, 90, -90);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.said).toBe(FEATS.oversplit);
    state.reset();
    expect(state.shown).toBeNull();
    expect(state.said).toBeNull();
    // ...and the next run's line is earned afresh rather than inherited.
    legsSwung(doll, 35, -125);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.said).toBe(FEATS.split);
  });
});

describe('the enlightenment holding over the machine', () => {
  it('overrides every other state for its three seconds, and then lets the pose back in', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    archBack(doll, 75);
    planted(doll, world.engine.maxy);
    const state = new FeatState();
    // The enlightenment arrives — the seventh portrait — over a pose that is itself a triplefold,
    // and the triplefold must not be read while the enlightenment holds.
    doll.pain.step(sourcesAt({ neck: BEYOND, split: BEYOND }), STEP);
    state.step(doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.superflex);
    doll.pain.step(sourcesAt(), STEP);
    run(state, doll, world.engine.maxy, ENLIGHTENMENT_MS - 3 * STEP);
    expect(state.shown).toBe(FEATS.superflex);
    // ...and not a step past its three seconds: the step the hold runs out on is still its own.
    run(state, doll, world.engine.maxy, 3 * STEP);
    expect(state.shown).toBe(FEATS.superflex);
    run(state, doll, world.engine.maxy, STEP);
    expect(state.shown).toBe(FEATS.triplefold);
    // The line, though, has said the heavier word and keeps it.
    expect(state.said).toBe(FEATS.superflex);
  });

  it('starts its three seconds over while the seventh portrait is still on', () => {
    const { world, doll } = aDoll();
    standUp(doll);
    const state = new FeatState();
    doll.pain.step(sourcesAt({ neck: BEYOND, split: BEYOND }), STEP);
    state.step(doll, world.engine.maxy, STEP);
    // 3.2 seconds of the portrait — past the hold's own three, so the hold re-armed rather than
    // wore out.
    run(state, doll, world.engine.maxy, 3200 - STEP);
    expect(doll.pain.shown).toBe(FACE.super);
    expect(state.shown).toBe(FEATS.superflex);
    // The portrait gone: nearly three seconds still stand between its last moment and the pose's
    // own word — a hold that had worn out at its first three seconds would have none of them.
    doll.pain.step(sourcesAt(), STEP);
    run(state, doll, world.engine.maxy, 2800);
    expect(state.shown).toBe(FEATS.superflex);
    run(state, doll, world.engine.maxy, 3 * STEP);
    expect(state.shown).toBeNull();
  });
});

/**
 * A game with no renderer: the world and its dolls, and nothing drawn — everything the machine
 * needs, since what it says is the engine's own and not the renderer's. The constructor is private
 * because a real game is `create`d, not `new`d; `Reflect.construct` is the test's own way in, for
 * the same reason `editing.test.ts` uses it.
 */
function bareGame(): Game {
  return Reflect.construct(Game, [null]) as Game;
}

/** One step of the game's own word for itself (`Game.noteFeats`), at a world point in time. */
function note(game: Game): void {
  (game as unknown as { noteFeats(elapsedMs: number): void }).noteFeats(STEP);
}

/** The first doll of a game's stage, laid out by its own constructor. */
function theDoll(game: Game): Doll {
  const doll = game.world.dolls[0];
  if (!doll) throw new Error('the game opened without a doll');
  return doll;
}

describe('the game saying what the machine says', () => {
  it('rewrites the line through onFeat when the words change, and only then', () => {
    const game = bareGame();
    game.record();
    const heard: string[] = [];
    game.onFeat = (label) => heard.push(label);
    const doll = theDoll(game);
    standUp(doll);
    legsSwung(doll, 35, -125);
    note(game);
    note(game);
    note(game);
    expect(heard).toEqual(['Сделал шпагат']);
    standUp(doll);
    legsSwung(doll, 90, -90);
    note(game);
    expect(heard).toEqual(['Сделал шпагат', 'Сделал перешпагат']);
    // A lighter word after a heavier one changes nothing.
    standUp(doll);
    legsSwung(doll, 35, -125);
    note(game);
    expect(heard).toHaveLength(2);
  });

  it('starts the line over when a new run begins', () => {
    const game = bareGame();
    game.record();
    const heard: string[] = [];
    game.onFeat = (label) => heard.push(label);
    const doll = theDoll(game);
    standUp(doll);
    legsSwung(doll, 90, -90);
    note(game);
    expect(heard).toEqual(['Сделал перешпагат']);
    game.stopRecording();
    game.record();
    // The same weight as the word the run before it had said — a word only a reset line can say.
    standUp(doll);
    archBack(doll, 75);
    armsUp(doll);
    note(game);
    expect(heard).toEqual(['Сделал перешпагат', 'Сделал бэкбенд']);
  });

  it('says the enlightenment, and nothing after it — heavier than it there is nothing', () => {
    const game = bareGame();
    game.record();
    const heard: string[] = [];
    game.onFeat = (label) => heard.push(label);
    const doll = theDoll(game);
    standUp(doll);
    doll.pain.step(sourcesAt({ neck: BEYOND, split: BEYOND }), STEP);
    note(game);
    expect(heard).toEqual(['Достиг супергибкости']);
    // The portrait gone and a triplefold underneath: the state moves, the line does not.
    doll.pain.step(sourcesAt(), STEP);
    standUp(doll);
    archBack(doll, 75);
    planted(doll, game.world.engine.maxy);
    note(game);
    expect(heard).toHaveLength(1);
  });

  it('is not even measured while nobody is listening', () => {
    const game = bareGame();
    game.record();
    const doll = theDoll(game);
    standUp(doll);
    legsSwung(doll, 35, -125);
    note(game);
    // The pose is gone before anybody listens: had the world been asked about it, the word would
    // have been waiting on the line.
    standUp(doll);
    const heard: string[] = [];
    game.onFeat = (label) => heard.push(label);
    note(game);
    expect(heard).toEqual([]);
  });

  // The step that runs the machine is the world's own (`Game.liveStep` calls `noteFeats` after
  // `World.step`), but a pose worth a word is past the rig's own limits by definition — the pain
  // ladders put *extreme* where the rig stops — and no free-standing pose survives the solver that
  // pulls it back. Holding her there is a hand or a rope over real time, which is the browser smoke
  // test's own choreography (`tools/smoke.mjs`), not a unit test's.
});
