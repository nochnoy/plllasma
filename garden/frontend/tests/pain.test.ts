import { describe, expect, it } from 'vitest';
import type { Doll } from '../src/game/doll';
import {
  ARCH_AT_REST_DEG,
  ARCH_EXTREME_DEG,
  BEYOND,
  CALM,
  EXTREME,
  HARD,
  SPLIT_AT_REST_DEG,
  SPLIT_DEG,
  SPREAD_AT_REST_DEG,
  WORRY,
  dollSources,
  poseAngles,
  poseSources,
  rigPoints,
  splitOf,
  type PainLevel,
  type PosePoints,
  type PoseSources,
} from '../src/game/pain';
import { FACE } from '../src/game/pain-state';
import { Extractor } from '../src/game/vm/extractor';
import { World } from '../src/game/world';

/**
 * The pain of a pose, source by source: the four things `pain.ts` reads a rig for. Everything is
 * measured from the rig's own geometry — there is nothing else to measure it from — so these tests pin
 * down the three things that could drift: which way her back is, where each ladder's steps sit, and what
 * a pair of legs is worth.
 *
 * The angles are signed from her body rather than from the screen, so the tests build poses out of a
 * standing rig and turn one joint at a time, the way `docs/pain.md` works them out.
 */

/**
 * The worst step of pain the pose she is in is worth — the number the card is decided by. It is the same
 * reading the world hands her own machine every step (`dollSources`, `pain.ts`), taken here so a test can
 * ask what a rig it has posed by hand is worth without waiting for the world to hand anything over; a rig
 * that cannot be read at all is read as nothing, the way the machine reads it.
 */
function worstStep(doll: Doll): PainLevel {
  const sources = dollSources(doll);
  const levels = sources
    ? [sources.neck.level, sources.waist.level, sources.hip.level, sources.split.level]
    : [];
  return (levels.length ? Math.max(...levels) : 0) as PainLevel;
}

/**
 * Swings both of a doll's legs about her pelvis, the way a pull does, `deg` degrees the way her back
 * lies — the direction that extends her hips (`docs/pain.md`).
 */
function swingLegs(doll: Doll, deg: number): void {
  const pelvis = doll.joint('pants');
  if (!pelvis) throw new Error('the rig is missing a pelvis');
  for (const name of ['knee1', 'foot1', 'knee2', 'foot2']) {
    const part = doll.joint(name);
    if (!part) throw new Error(`the rig is missing a ${name}`);
    const swung = turned(part, pelvis, deg);
    part.x = swung.x;
    part.y = swung.y;
  }
}

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

/** The angle between two directions, in degrees: the same measure the model takes of her thighs. */
function between(a: Vec, b: Vec): number {
  return Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) * (180 / Math.PI);
}

/**
 * Her rig as the movie authored it, stood up the screen: her spine on the y axis, her feet a little
 * apart. She has twelve particles and the eight read here are the ones a pose needs. The overrides
 * are how a pose is built bone by bone, since a bone is only ever its two points.
 */
function standing(overrides: Partial<PosePoints> = {}): PosePoints {
  return {
    head: { x: 0, y: -120 },
    neck: { x: 0, y: -90 },
    stomach: { x: 0, y: -50 },
    pants: { x: 0, y: 0 },
    knee1: { x: -20, y: 60 },
    foot1: { x: -20, y: 120 },
    knee2: { x: 20, y: 60 },
    foot2: { x: 20, y: 120 },
    ...overrides,
  };
}

/**
 * The standing pose with her waist arched `spine` degrees back and her head `head` more than that.
 *
 * The waist turns the upper torso about the belly, the way a waist bends, so the pelvis stays where
 * it is and the small of her back is what arches.
 */
function arched(pose: PosePoints, spine: number, head: number): PosePoints {
  const neck = turned(pose.neck, pose.stomach, spine);
  return {
    ...pose,
    neck,
    head: turned(turned(pose.head, pose.stomach, spine), neck, head),
  };
}

/** Her legs together and straight down: the stance a split and a kneel are both built from. */
function legsDown(): PosePoints {
  return standing({
    knee1: { x: 0, y: 60 },
    foot1: { x: 0, y: 120 },
    knee2: { x: 0, y: 60 },
    foot2: { x: 0, y: 120 },
  });
}

/** The standing pose with both hips extended `deg` degrees: both thighs go back under a level pelvis. */
function extended(deg: number): PosePoints {
  const base = standing();
  return {
    ...base,
    knee1: turned(base.knee1, base.pants, -deg),
    foot1: turned(base.foot1, base.pants, -deg),
    knee2: turned(base.knee2, base.pants, -deg),
    foot2: turned(base.foot2, base.pants, -deg),
  };
}

/**
 * Her legs swung about the pelvis: one thigh `hip1` degrees back and the other `hip2` forward, and
 * either knee folded out of the straight line of its own thigh by `knee1` and `knee2` degrees.
 *
 * The angles are the ones the table under the toolbar prints — the hips of the two legs, signed
 * positive towards her back — so a pose can be written the way a player reads it off the screen. The
 * legs start from `legsDown`, where both hips read zero.
 */
function split(hip1: number, hip2: number, knee1 = 0, knee2 = 0): PosePoints {
  const base = legsDown();
  const swing = (point: Vec, deg: number): Vec => turned(point, base.pants, -deg);
  const kneeB = swing(base.knee2, hip2);
  return {
    ...base,
    knee1: swing(base.knee1, hip1),
    foot1: turned(swing(base.foot1, hip1), swing(base.knee1, hip1), -knee1),
    knee2: kneeB,
    foot2: turned(swing(base.foot2, hip2), kneeB, -knee2),
  };
}

/** A doll on the stage, put down the way the world's own default puts one down. */
function authoredDoll(): Doll {
  const doll = new World().addDoll({ x: 0, y: 0 });
  if (!doll) throw new Error('the engine refused a doll');
  return doll;
}

/** What one source of pain of a pose is worth, as the level `poseSources` reads it at. */
function levelOf(sources: PoseSources, source: keyof PoseSources): PainLevel {
  return sources[source].level;
}

/**
 * The most the rig lets one joint bend backwards, in degrees, read out of the movie's own data by the
 * three particles the joint ties together (the joint's own two ends and the third point its angle is
 * measured against).
 *
 * That is where {@link ARCH_EXTREME_DEG} comes from: the body's own answer, not a round number. The
 * rig is the movie's, so the three limits are the original author's — see the joint table in
 * `docs/pain.md`.
 */
function archLimit(p1: string, p2: string, p3: string): number {
  const extractor = new Extractor();
  extractor.extract();
  const joint = extractor.angledConstraints.find(
    (candidate) =>
      candidate.p1.name === p1 && candidate.p2.name === p2 && candidate.p3.name === p3,
  );
  if (!joint) throw new Error(`the rig has no joint ${p1}->${p2} against ${p3}`);
  return (joint.maxang * 180) / Math.PI;
}

/** The pose the movie authored, read off a fresh doll: twelve particles, eight of them read here. */
function authored(): PosePoints {
  const points = rigPoints(authoredDoll());
  if (!points) throw new Error('the rig is missing a joint a pose is read from');
  return points;
}

describe('the pose the movie authored', () => {
  it('is painless: every source of it reads nothing', () => {
    const angles = poseAngles(authored());
    const sources = poseSources(authored());
    // A few degrees of slack at her neck and her hips and eight at her knees: no stretch anywhere, and
    // the arch her own stance has is the zero of the scale, measured here off the rig itself.
    expect(angles.arch).toBeCloseTo(ARCH_AT_REST_DEG, 1);
    expect(angles.knee).toBeLessThan(20);
    expect(levelOf(sources, 'neck')).toBe(CALM);
    expect(levelOf(sources, 'waist')).toBe(CALM);
    expect(levelOf(sources, 'hip')).toBe(CALM);
    expect(levelOf(sources, 'split')).toBe(CALM);
    expect(dollSources(authoredDoll())).toEqual(sources);
  });

  it('is what the split measure is zeroed against', () => {
    const angles = poseAngles(authored());
    // Her stance is not a split, but it is not a line either: one hip rests 18.46 degrees off the
    // pelvis's axis and the other 29.50, and it is the *tighter* of the two that the measure counts —
    // twice, because a split carries half of itself on each leg.
    expect(angles.hip1).toBeCloseTo(-18.46, 2);
    expect(angles.hip2).toBeCloseTo(29.5, 2);
    expect(2 * Math.min(Math.abs(angles.hip1), Math.abs(angles.hip2))).toBeCloseTo(
      SPLIT_AT_REST_DEG,
      2,
    );
    expect(splitOf(angles).amount).toBe(0);
  });

  it('is where the measure of her spread comes from', () => {
    const points = authored();
    const thigh = (knee: Vec): Vec => ({ x: knee.x - points.pants.x, y: knee.y - points.pants.y });
    // The angle between the thighs of the authored stance, measured here without the model's helpers:
    // her feet are apart as she stands, and a spread is measured over and above that.
    expect(between(thigh(points.knee1), thigh(points.knee2))).toBeCloseTo(SPREAD_AT_REST_DEG, 0);
    expect(poseAngles(points).spread).toBe(0);
  });
});

describe('which way her back is', () => {
  it('is the way the rig will not let her joints bend, and a tilt towards it is what hurts', () => {
    // The movie's own data blocks both of her knees from folding one way (`da >= -0.1`) and blocks her
    // neck from being tipped far the other (`da <= 0.5`): a knee folds forwards, so the side the knee
    // cannot go is her back. For a body standing up the screen that side is +x, which is where the
    // torso's own up axis turned a quarter turn ends up — see `docs/pain.md`.
    const points = authored();
    const rest = poseAngles(points).head;
    const tilted = (deg: number): number =>
      poseAngles({ ...points, head: turned(points.head, points.neck, deg) }).head - rest;
    expect(tilted(30)).toBeCloseTo(30, 6);
    expect(tilted(-30)).toBeCloseTo(-30, 6);
    // Backwards is an arch, forwards is a fold: only one of them is pain.
    expect(levelOf(poseSources({ ...points, head: turned(points.head, points.neck, 45) }), 'neck'))
      .toBe(WORRY);
    expect(levelOf(poseSources({ ...points, head: turned(points.head, points.neck, -45) }), 'neck'))
      .toBe(CALM);
  });
});

describe('an arch', () => {
  it('is bounded by the rig, which is where its extreme comes from', () => {
    // The three joints the arch counts, each read off the rig by the particles it ties: her neck, her
    // waist and one of her hips. What they allow backwards, added up, is as far as this body bends.
    const limits = [
      archLimit('head', 'neck', 'stomach'),
      archLimit('neck', 'stomach', 'pants'),
      archLimit('stomach', 'pants', 'knee1'),
    ];
    expect(limits.map((deg) => Number(deg.toFixed(2)))).toEqual([28.65, 22.92, 17.19]);
    expect(limits.reduce((sum, deg) => sum + deg, 0)).toBeCloseTo(ARCH_EXTREME_DEG, 6);
  });

  it('adds up her head, her waist and her hips, and reads each joint on its own ladder', () => {
    expect(poseAngles(arched(standing(), 30, 60)).arch).toBeCloseTo(90, 6);
    expect(poseAngles(arched(standing(), 20, 40)).arch).toBeCloseTo(60, 6);
    expect(poseAngles(arched(standing(), 30, 60)).head).toBeCloseTo(60, 6);
    expect(poseAngles(arched(standing(), 30, 60)).spine).toBeCloseTo(30, 6);

    // Her neck: three steps and no more, because a neck cannot arch further than the rig allows it.
    expect(levelOf(poseSources(arched(standing(), 0, 45)), 'neck')).toBe(WORRY);
    expect(levelOf(poseSources(arched(standing(), 0, 65)), 'neck')).toBe(HARD);
    expect(levelOf(poseSources(arched(standing(), 0, 75)), 'neck')).toBe(EXTREME);
    expect(levelOf(poseSources(arched(standing(), 0, 120)), 'neck')).toBe(EXTREME);
    // Her waist: the same three, and the small of her back is the one joint that goes past the rig.
    expect(levelOf(poseSources(arched(standing(), 45, 0)), 'waist')).toBe(WORRY);
    expect(levelOf(poseSources(arched(standing(), 65, 0)), 'waist')).toBe(HARD);
    expect(levelOf(poseSources(arched(standing(), 80, 0)), 'waist')).toBe(EXTREME);
    expect(levelOf(poseSources(arched(standing(), 110, 0)), 'waist')).toBe(BEYOND);
    // The two are separate sources: a hard waist under an extreme neck is read as both of them.
    const both = poseSources(arched(standing(), 65, 75));
    expect(levelOf(both, 'waist')).toBe(HARD);
    expect(levelOf(both, 'neck')).toBe(EXTREME);
  });

  it('counts both hips going back, which is what a bridge does to them', () => {
    // A hip is the smallest of the three arch joints — 17.19 degrees of it — so 15 of them is a pose
    // the rig would let her hold. Both legs went back, so both hips are read, and they read the same.
    expect(poseAngles(extended(15)).arch).toBeCloseTo(15, 6);
    expect(levelOf(poseSources(extended(15)), 'hip')).toBe(CALM);
    expect(poseAngles(extended(30)).hips).toBeCloseTo(30, 6);
    // Her hips' own ladder: a levered hip goes wrong sooner than a spine does.
    expect(levelOf(poseSources(extended(45)), 'hip')).toBe(WORRY);
    expect(levelOf(poseSources(extended(55)), 'hip')).toBe(HARD);
    expect(levelOf(poseSources(extended(80)), 'hip')).toBe(EXTREME);
    expect(levelOf(poseSources(extended(110)), 'hip')).toBe(BEYOND);
  });

  it('reads a hip going back, and not a fold: the rig gives a thigh seven times as much forward', () => {
    // The rig lets a thigh 17.19 degrees backwards and 120.32 forwards. What the ladder is about is the
    // direction the joint was not made for, so a leg folded up towards her chest — which is what a hip
    // is *for*, and what a ragdoll does with her legs as she falls — reads nothing at all, while the
    // same hip swung back reads its own step.
    expect(poseAngles(extended(-45)).arch).toBe(0);
    expect(levelOf(poseSources(extended(-45)), 'hip')).toBe(CALM);
    expect(levelOf(poseSources(extended(-110)), 'hip')).toBe(CALM);
    expect(levelOf(poseSources(extended(45)), 'hip')).toBe(WORRY);
    expect(levelOf(poseSources(extended(-45)), 'hip')).not.toBe(levelOf(poseSources(extended(45)), 'hip'));
  });

  it('does not add its joints up into one number any more', () => {
    // Three sources at hard are three sources at hard, not an extreme: what the card does with them is
    // the card's own business (`pain-state.ts`), and it reads the worst of them.
    const sources = poseSources(arched(standing(), 65, 65));
    expect(levelOf(sources, 'neck')).toBe(HARD);
    expect(levelOf(sources, 'waist')).toBe(HARD);
    expect(poseAngles(arched(standing(), 65, 65)).arch).toBeCloseTo(130, 6);
  });
});

describe('a split', () => {
  /**
   * The poses the player reached in play, written the way the table under the toolbar prints them, and
   * what the ladder has to make of each. The steps themselves are the player's own reading of the row
   * (`SPLIT_STEPS`), so what is held here is the *amount* each shape comes to and the step it is worth:
   * the legs open a long way before the measure calls it anything, and a real split is already near the
   * top of the ladder.
   */
  const reached: readonly {
    readonly name: string;
    readonly pose: PosePoints;
    readonly amount: number;
    readonly level: PainLevel;
  }[] = [
    { name: '70 / -100, ноги врозь', pose: split(70, -100), amount: 103.07, level: BEYOND },
    { name: '90 / -120, перешпагат', pose: split(90, -120), amount: 143.07, level: BEYOND },
    { name: '140 / -140, мегашпагат', pose: split(140, -140), amount: 243.07, level: BEYOND },
    { name: '55 / -177, шпагат', pose: split(55, -177), amount: 73.07, level: HARD },
    {
      name: '55 / -177 и колено на 100',
      pose: split(55, -177, 100),
      amount: 73.07,
      level: EXTREME,
    },
    {
      name: '55 / -177 и колено на 153',
      pose: split(55, -177, 153),
      amount: 73.07,
      level: BEYOND,
    },
  ];

  it('reads her legs as far apart as the tighter of the two went, twice', () => {
    for (const { name, pose, amount, level } of reached) {
      const angles = poseAngles(pose);
      // The pose was built out of her own hips, so what is read back has to be what was put in: this is
      // what makes the numbers below a statement about the ladder rather than about the test's rig.
      expect(splitOf(angles).amount, name).toBeCloseTo(amount, 2);
      expect(levelOf(poseSources(pose), 'split'), name).toBe(level);
    }
  });

  it('calls a leg that swung past the other no wider than one that only reached it', () => {
    // Two legs in one line are 180 degrees apart however the rig got them there, and a front thigh
    // folded onto her chest is not a wider split than a split: it is the same split with the leg behind
    // her barely moved, so the measure counts the tighter leg and the pose goes no further.
    expect(splitOf(poseAngles(split(90, -90))).amount).toBeCloseTo(SPLIT_DEG - SPLIT_AT_REST_DEG, 2);
    expect(splitOf(poseAngles(split(55, -177))).amount).toBeLessThan(
      splitOf(poseAngles(split(90, -90))).amount,
    );
    // ...and a real past split, both legs past the line, is wider than both of them.
    expect(splitOf(poseAngles(split(140, -140))).amount).toBeGreaterThan(
      splitOf(poseAngles(split(90, -90))).amount,
    );
  });

  it('is not a bridge and not a pike: two legs that went the same way opened nothing', () => {
    // Her own stance and both of those read zero, whatever their angle: there is nothing between them
    // for a split to be made of.
    expect(splitOf(poseAngles(legsDown())).amount).toBe(0);
    expect(splitOf(poseAngles(extended(40))).amount).toBe(0);
    expect(splitOf(poseAngles(extended(-110))).amount).toBe(0);
    expect(levelOf(poseSources(extended(-110)), 'split')).toBe(CALM);
  });

  it('reads the knee of the leg that is behind her', () => {
    // One thigh behind her and one forward, with the legs open far enough that the split itself is
    // *hard* — the step below which the knee is not read at all (see {@link kneelBonus}). The leg that
    // is behind her is the one the bonus is read from, and the other one's knee does nothing at all.
    const behindFirst = split(45, -70, 120, 0);
    expect(splitOf(poseAngles(behindFirst)).back).toBe('knee1');
    expect(splitOf(poseAngles(behindFirst)).level).toBe(HARD);
    expect(levelOf(poseSources(behindFirst), 'split')).toBe(EXTREME);
    // The same two hips the other way round, so `hip2` is the one behind her and its knee is the one
    // that counts: the fold on the front leg changes nothing, and the fold on the back leg does.
    expect(splitOf(poseAngles(split(-70, 45))).back).toBe('knee2');
    expect(levelOf(poseSources(split(-70, 45)), 'split')).toBe(HARD);
    expect(levelOf(poseSources(split(-70, 45, 120, 0)), 'split')).toBe(HARD);
    expect(levelOf(poseSources(split(-70, 45, 0, 120)), 'split')).toBe(EXTREME);
  });

  it('needs the split: a folded knee on its own is a kneel, not a stretch', () => {
    const base = legsDown();
    const kneel = { ...base, foot2: turned(base.foot2, base.knee2, 120) };
    expect(poseAngles(kneel).knee).toBeCloseTo(120, 6);
    expect(splitOf(poseAngles(kneel)).amount).toBe(0);
    expect(levelOf(poseSources(kneel), 'split')).toBe(CALM);
    // Nor does it count on legs that are barely apart: the ladder's first step is a single degree, so a
    // doll lying down with her knees up would otherwise have a folded knee turn her into a hard split
    // out of nothing. The knee is read only once the split itself is one.
    expect(levelOf(poseSources(split(25, -25)), 'split')).toBe(WORRY);
    expect(levelOf(poseSources(split(25, -25, 120)), 'split')).toBe(WORRY);
    expect(levelOf(poseSources(split(25, -25, 0, 120)), 'split')).toBe(WORRY);
    // ...and the same knee in a real split is a step of its own, on the leg that is behind her — the
    // first one, in a symmetric split.
    expect(levelOf(poseSources(split(45, -70)), 'split')).toBe(HARD);
    expect(levelOf(poseSources(split(45, -70, 120)), 'split')).toBe(EXTREME);
    expect(levelOf(poseSources(split(45, -70, 0, 120)), 'split')).toBe(HARD);
  });
});

describe('the pain of a pose', () => {
  it('is read off a doll that has been posed: a leg pulled aside hurts', () => {
    const doll = authoredDoll();
    let sources = dollSourcesRig(doll);
    expect(Math.max(sources.neck.level, sources.hip.level, sources.split.level)).toBe(CALM);
    // Swung aside the way the pointer drags her: the thigh turns about her pelvis — the whole leg
    // follows the hand, not just a knee or a foot — and it goes back over her own stance.
    const pants = doll.joint('pants');
    const knee = doll.joint('knee2');
    const foot = doll.joint('foot2');
    if (!pants || !knee || !foot) throw new Error('the rig is missing a leg');
    for (const part of [knee, foot]) {
      const swung = turned(part, pants, -110);
      part.x = swung.x;
      part.y = swung.y;
    }
    sources = dollSourcesRig(doll);
    expect(levelOf(sources, 'hip')).toBeGreaterThan(CALM);
    // ...and the split's own source waits for the second leg to open too, which is what makes a split
    // a pair of legs rather than one leg out to the side.
    expect(levelOf(sources, 'split')).toBe(CALM);
  });

  it('survive a pose that cannot be read: no joints, no pain', () => {
    const flat: PosePoints = {
      head: { x: 0, y: 0 },
      neck: { x: 0, y: 0 },
      stomach: { x: 0, y: 0 },
      pants: { x: 0, y: 0 },
      knee1: { x: 0, y: 0 },
      foot1: { x: 0, y: 0 },
      knee2: { x: 0, y: 0 },
      foot2: { x: 0, y: 0 },
    };
    const sources = poseSources(flat);
    expect(Object.values(sources).every((source) => source.level === CALM)).toBe(true);
    // ...and a doll whose rig is missing a joint it is read from is read as nothing at all, rather than
    // as a pose that hurts: the sources are read or they are not there.
    const doll = new World().addDoll({ x: 0, y: 0 });
    if (!doll) throw new Error('the engine refused a doll');
    const head = doll.joint('head');
    if (!head) throw new Error('the rig is missing a head');
    head.name = 'nothing';
    expect(dollSources(doll)).toBeNull();
  });
});

describe('a doll whose trouble has passed', () => {
  it('lets go of it on the clock the world keeps', () => {
    // Every face the machine wears is worn for a while — an arrival for a second and a half to three, a
    // break for a second, a held extreme for as long as it is held — so the seconds have to reach the
    // machine, and `World.step` is what hands them over. A machine that were only ever *re-read*
    // (`World.observe`, which is all a paused world does) would follow a pose but never let one go: the
    // card would stand on the last face anything gave her for good.
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 });
    if (!doll) throw new Error('the engine refused a doll');
    for (let step = 0; step < 400; step++) world.step(20);

    // Put her into an extreme by hand — both legs swung back under her, which is the hips' ladder past
    // its last step — and read it *without* stepping the world (`observe`), so that the machine sees the
    // pose as it stands rather than as the solver would have it a step later.
    for (let step = 0; step < 120 && worstStep(doll) < EXTREME; step++) {
      swingLegs(doll, -2);
      world.observe();
    }
    expect(worstStep(doll)).toBeGreaterThanOrEqual(EXTREME);
    expect(doll.pain.shown).toBeGreaterThanOrEqual(FACE.arrival);

    // ...and then let the world run. It takes the pose away on its own in a step or two, and with it the
    // face: the machine counts its seconds from here.

    // Ten seconds of the world's own time is longer than any face the machine holds. What is left has to
    // be about the pose she is in *now* — and the extreme, with its arrival and its held face, has to be
    // over: nothing is being held, nothing is flickering, and the card is back on a face of its own.
    for (let step = 0; step < 500; step++) world.step(20);
    const state = doll.pain.snapshot();
    expect(state.worst).toBe(worstStep(doll));
    expect(state.extremeFor).toBe(0);
    expect(state.beyondFor).toBe(0);
    expect(state.flash).toBeNull();
    expect(state.flicker).toBeNull();
    expect(doll.pain.shown).toBeLessThanOrEqual(FACE.hard);
  });
});

/**
 * The lowest face a pose of a given step can be wearing, one per step: the machine holds a face for a
 * second or three after the pose that earned it has gone (`pain-state.ts`), so the card may be *higher*
 * than the pose is worth, never lower. A step of 3 is the extreme, which arrives on its own face.
 */
const LOWEST_FACE = [0, FACE.worry, FACE.hard, FACE.arrival, FACE.arrival];

describe('the pose and the card', () => {
  it('are two readings of one pose, and a world that is not stepping still reads both', () => {
    // The card is dressed from the doll's own machine (`pain-state.ts`), which the world feeds the same
    // measure the pose is read for — so a pose has to mean the same thing to both of them. The one way
    // they can be made to disagree for good is a world that holds still: the player poses her, and a
    // machine nothing re-reads stays on the face it had before. Hence `World.observe`, which is what a
    // paused world does instead of stepping (`Game.frame`).
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 });
    if (!doll) throw new Error('the engine refused a doll');
    for (let step = 0; step < 500; step++) world.step(20);
    world.observe();
    // Whatever a doll come to rest on the floor is worth, both halves are worth the same: her legs
    // settle a degree or two apart, which the split's own ladder reads at its first step, and the card
    // is on the face that step asks for.
    const atRest = worstStep(doll);
    expect(doll.pain.snapshot().worst).toBe(atRest);
    expect(doll.pain.shown).toBeGreaterThanOrEqual(LOWEST_FACE[atRest]);

    // Now pose her by hand until she is worth something on her hips' own ladder, and read both halves
    // again without stepping the world at all.
    let degrees = 0;
    while (worstStep(doll) < HARD && degrees < 200) {
      swingLegs(doll, -2);
      degrees += 2;
      world.observe();
    }
    const step = worstStep(doll);
    expect(step).toBe(HARD);
    expect(doll.pain.snapshot().worst).toBe(step);
    // The card may be *higher* than the pose asks for — the arrival face outlives the pose that earned
    // it, which is the whole of `pain-state.ts` — but never lower, and it is not still the face it was
    // wearing before the pose was made.
    expect(doll.pain.shown).toBeGreaterThanOrEqual(LOWEST_FACE[step]);
  });
});

/** The sources of a doll already on the stage, or a thrown error: the tests above need the numbers. */
function dollSourcesRig(doll: Doll): PoseSources {
  const sources = dollSources(doll);
  if (!sources) throw new Error('the rig is missing a joint a pose is read from');
  return sources;
}

describe('how far a pose can be pulled', () => {
  /**
   * Six drags of a settled doll, each holding one joint out towards the side and a little off the
   * floor: the head, both feet and a knee. She is left to land first, where she is found, and
   * then that joint is taken and held; 600 steps of 20 ms is the two seconds the pull needs to settle.
   *
   * What a pull does to a ragdoll is not a matter of how far it goes: the sea of poses she settles into
   * is lumpy, so what is asked here is the most any of them reached, the way a player finds out by
   * trying again. The numbers are measured on the engine, as `docs/pain.md` records — and they are the
   * *room's* numbers as much as the pull's: a joint held out to a wall is a joint the solver cannot
   * walk away from, so these drags reach out to the 364 world pixels the walls stand at now (they stood
   * at 264 when the drags were first measured, and in the wider room the same pulls slide her along the
   * floor instead of arching her). The best of the six is a drag of a foot by (-480, -40) world pixels,
   * which leaves 117 degrees.
   */
  const drags: readonly { readonly joint: string; readonly dx: number; readonly dy: number }[] = [
    { joint: 'head', dx: -420, dy: -40 },
    { joint: 'head', dx: -460, dy: -80 },
    { joint: 'foot1', dx: -480, dy: -40 },
    { joint: 'foot2', dx: 400, dy: -100 },
    { joint: 'foot2', dx: 400, dy: -200 },
    { joint: 'knee2', dx: 460, dy: 60 },
  ];

  function pulled(drag: { joint: string; dx: number; dy: number }): { arch: number; worst: PainLevel } {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 });
    if (!doll) throw new Error('the engine refused a doll');
    for (let step = 0; step < 600; step++) world.step(20);
    const joint = doll.joint(drag.joint);
    if (!joint) throw new Error(`the rig is missing a ${drag.joint}`);
    world.engine.onHold = [joint];
    world.engine.mouseX = joint.x + drag.dx;
    world.engine.mouseY = joint.y + drag.dy;
    for (let step = 0; step < 400; step++) world.step(20);
    const points = rigPoints(doll);
    if (!points) throw new Error('the rig is missing a joint a pose is read from');
    const sources = poseSources(points);
    return {
      arch: poseAngles(points).arch,
      worst: Math.max(
        sources.neck.level,
        sources.waist.level,
        sources.hip.level,
        sources.split.level,
      ) as PainLevel,
    };
  }

  it('takes her past the limit the rig gives her, and the spine reads it', () => {
    // The solver relaxes a joint a third of the way at a time, so a joint held against a pull
    // overshoots the angle the rig gives it — which is what makes the top of the scale a pose the
    // player can actually drag her into rather than a limit nobody can touch. The best of the six is a
    // drag of a foot by (-480, -40) world pixels, out to the wall the room stands at, which leaves 117
    // degrees of arch, nearly twice the rig's own 68.8; it settles within two seconds of the pull and
    // then does not budge.
    const results = drags.map(pulled);
    expect(Math.max(...results.map((result) => result.arch))).toBeGreaterThan(ARCH_EXTREME_DEG);
    // A pull registers on the spine, and how far up its ladder it gets is `tests/pain.test.ts`'s ladder
    // table: a head held out sideways arches her neck past the rig's own 28.65 degrees and reads *hard*
    // — the extreme faces are the legs' business, which the split's own poses cover.
    expect(Math.max(...results.map((result) => result.worst))).toBe(HARD);
  });
});
