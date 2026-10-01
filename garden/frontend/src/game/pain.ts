import type { Doll } from './doll';

/**
 * How much a pose hurts, source by source, and how far each source has to go to count as what.
 *
 * The doll is the movie's ragdoll: twelve particles, twenty joints, and nothing in the rig that says
 * what a joint is *for*. It can therefore be read for shape but not for strain, so what this module
 * measures is the four things that strain a gymnast, each in its own degrees and each on its own
 * ladder — a back arched over at the neck, at the waist, at the hips, and a pair of legs pulled into a
 * split. The pose is read because it is the whole state there is: no events, no history, no score.
 *
 * Every source is read into one of five steps — nothing, *worry*, *hard*, *extreme*, and *beyond* —
 * and the steps do **not** add up: a pose is as bad as its worst source, so "hard" in the back with
 * "extreme" in the legs is an extreme pose (see `docs/pain.md`, and {@link PainState} for what the card
 * shows). The thresholds below are the port's own; what they are calibrated *against* is the rig, and
 * every one of them is quoted in the same degrees the pose is measured in.
 */

/** A point of the rig, in the world's own coordinates. */
interface Vec {
  readonly x: number;
  readonly y: number;
}

/**
 * The eight rig points a pose is read from, by the names `guy.generated.ts` gave the particles: the
 * four joints of her spine, and both legs.
 */
export interface PosePoints {
  readonly head: Vec;
  readonly neck: Vec;
  readonly stomach: Vec;
  readonly pants: Vec;
  readonly knee1: Vec;
  readonly foot1: Vec;
  readonly knee2: Vec;
  readonly foot2: Vec;
}

/**
 * How bad one source of pain is, in steps. Not a scale from 0 to 1 any more: the steps have names
 * because the card's own rules are written in them (see {@link PainState}).
 */
export type PainLevel = 0 | 1 | 2 | 3 | 4;

/** Nothing hurts. */
export const CALM: PainLevel = 0;
/** Enough to be worth a face: what the sources are calibrated to show first. */
export const WORRY: PainLevel = 1;
/** Hard work — a pose being held against the body's own limits. */
export const HARD: PainLevel = 2;
/** Where the rig itself stops: the extreme of what this body can be bent into. */
export const EXTREME: PainLevel = 3;
/** Past the rig's own limits, which only a pull held against the solver reaches. */
export const BEYOND: PainLevel = 4;

/**
 * The most her back can arch, in degrees: what the rig itself allows the three joints the arch is read
 * from, added up. `guy.generated.ts` lets the neck bend 0.5 rad backwards, the waist 0.4 and the hip
 * 0.3, so 1.2 rad — 68.75 degrees — is as far as this body goes. `tests/pain.test.ts` reads those three
 * limits back out of the rig, so this number cannot drift away from the body it describes.
 *
 * Nothing is measured against it any more — the sources have their own ladders — but it is the number
 * the ladders are calibrated to: the extreme step of the arch sits where the rig's own limit does.
 */
export const ARCH_EXTREME_DEG = (1.2 * 180) / Math.PI;
/**
 * How far her back is already arched in the pose the rig was authored in, in degrees: a few degrees of
 * slack at her neck and her hips, which her waist gives back. It is the zero of the scale.
 */
export const ARCH_AT_REST_DEG = 8.53;
/** Her thighs are this far apart in the pose the rig was authored in, so a spread is measured from it. */
export const SPREAD_AT_REST_DEG = 48;
/** The angle between her thighs in a full split: one straight line, heel to heel. */
export const SPLIT_DEG = 180;
/**
 * What {@link splitOf} reads in the pose the rig was authored in, in its own degrees.
 *
 * Measured off the rig rather than worked out: the authored stance puts one hip at -18.46 degrees and
 * the other at +29.50, so the tighter of the two legs is 18.46 degrees off the pelvis's own axis — and
 * the measure counts a split twice that, 36.93 (rounded, so that the authored pose reads a clean zero
 * rather than a hundredth of a degree of a split). Her own stance is not a split, so this is subtracted;
 * `tests/pain.test.ts` reads both hips back out of the rig so the two cannot drift apart.
 */
export const SPLIT_AT_REST_DEG = 36.93;

/**
 * Where each source's steps begin, in the source's own degrees — one number per step above "nothing".
 *
 * The neck and the waist wear the same three steps, and both stop at "extreme": a neck bent that far is
 * as bad as a neck gets, and there is no "beyond" for it to reach. The hips are read going back only
 * (see {@link extensionOf}) and are the quickest of the three to "hard" — a hip levered off its pelvis
 * goes wrong sooner than a spine does.
 *
 * The split's own steps are the player's own reading of its measure in play, which is why its first
 * step is so close to zero and the last is so far out: the legs open a great deal before they are in a
 * split at all, and only the shapes past the line (`docs/pain.md` has the poses) are worth the top
 * step. `tests/pain.test.ts` holds the shapes and the step each one lands on.
 */
export const NECK_STEPS: readonly number[] = [40, 60, 70];
export const WAIST_STEPS: readonly number[] = [40, 60, 70, 100];
export const HIP_STEPS: readonly number[] = [40, 50, 70, 100];
export const SPLIT_STEPS: readonly number[] = [1, 40, 75, 100];
/**
 * What a folded knee adds to a split, which is a step per bend: the split's own ladder counts the hips
 * only, and a split with the *back* leg's knee folded up is worse than the same split with it straight.
 * A knee folded past a right angle is one step, a heel on the thigh is two.
 */
export const SPLIT_KNEE_STEPS: readonly number[] = [100, 153];

/**
 * What a pose measures, in degrees — the numbers {@link poseSources} is built from.
 *
 * The first three are signed joint angles, positive towards her back, so a forward fold reads negative
 * in them.
 */
export interface PoseAngles {
  /** How far her head is tipped back, at the neck. */
  readonly head: number;
  /** How far the small of her back is arched, at the waist. */
  readonly spine: number;
  /** The hip extension both legs share: a bridge extends both, a split extends one and folds the other. */
  readonly hips: number;
  /** The hips one leg at a time, signed the same way: what a split is read from. */
  readonly hip1: number;
  readonly hip2: number;
  /** The three joints above, each counted only when it is back: how arched over she is in total. */
  readonly arch: number;
  /** How far the thighs are pulled apart, over and above the pose the rig was authored in. */
  readonly spread: number;
  /** Each knee's own fold, and the more folded of the two: 0 is a straight leg, 180 a heel on the hip. */
  readonly knee1: number;
  readonly knee2: number;
  readonly knee: number;
}

/** One source of pain: what it measures, and which step that is. */
export interface PainSource {
  /** The source's own degrees, in the units its ladder is written in. */
  readonly amount: number;
  readonly level: PainLevel;
}

/** All four sources of one pose. */
export interface PoseSources {
  /** Her neck, tipped back. */
  readonly neck: PainSource;
  /** The small of her back, arched. */
  readonly waist: PainSource;
  /** A hip levered away from its pelvis, backwards. */
  readonly hip: PainSource;
  /** Both legs pulled apart. */
  readonly split: PainSource & {
    /** Which of her knees the split's own bonus is read from: the thigh that is behind her. */
    readonly back: 'knee1' | 'knee2';
  };
}

/** Degrees per radian, as hard-coded in the original (`57.29578`). */
const DEG = 180 / Math.PI;

/**
 * The unit vector from `a` to `b`, or a zero vector when the two points sit on top of each other — a
 * bone has no direction then, and every angle measured from it comes out as no bend at all.
 */
function unit(a: Vec, b: Vec): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
}

/** `v` turned a quarter turn the way her back lies from the top of her torso. */
function quarter(v: Vec): Vec {
  return { x: -v.y, y: v.x };
}

/**
 * The direction her back faces, in a pose: the torso turned a quarter turn the way her knees do *not*
 * fold. It is the axis every angle in {@link poseAngles} is signed against, and the side a doll is put
 * down *on* when the game lays her out on the floor of the hall.
 *
 * That it is a quarter turn of `pants -> neck` — and which way round — is not a guess about the artwork:
 * `guy.generated.ts` records which side each of her knees may bend, a knee bends forwards, and the
 * torso's own up axis turns towards her back in the screen's positive direction (see `docs/pain.md`).
 */
export function backFrom(pants: Vec, neck: Vec): Vec {
  return quarter(unit(pants, neck));
}

/** The same for a whole pose, which is the shape the rest of this module reads poses in. */
export function backOf(points: PosePoints): Vec {
  return backFrom(points.pants, points.neck);
}

/** The signed angle from `from` to `to`, in degrees: a quarter turn towards her back is +90. */
function turn(from: Vec, to: Vec): number {
  return Math.atan2(from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y) * DEG;
}

/**
 * How far `bone` has turned from the direction it rests in, positive towards her back.
 *
 * The sense of the turn depends on the bone's own rest direction: a bone that rests pointing up her
 * torso arches back by turning the way her back lies, and one that rests pointing down — a thigh, a
 * shin — by turning the other way, because her back is one direction however the bone happens to be
 * drawn. `back` is that direction, as {@link poseAngles} works it out.
 */
function dorsal(rest: Vec, bone: Vec, back: Vec): number {
  const fell = quarter(rest).x * back.x + quarter(rest).y * back.y;
  return (fell < 0 ? -1 : 1) * turn(rest, bone);
}

/**
 * Reads a pose: the angles of {@link PoseAngles}, all in degrees.
 *
 * The direction every angle here is signed against is her back, {@link backOf}.
 *
 * Each angle on its own:
 *
 * - `head` is the neck: how far the head bone has tipped back off the spine it sits on;
 * - `spine` is the waist: the same for the upper torso off the pelvis;
 * - `hips` is the average of the two thighs' extension, and `hip1`/`hip2` are those two on their own,
 *   measured against the pelvis's own axis rather than the torso's — the torso's axis swings when the
 *   waist bends, and the hip is not the joint that moved. A bridge arches the small of the back with
 *   *both* hips extended, while a split extends one hip and folds the other, and what a split does to
 *   the spine is nothing at all;
 * - `spread` is the angle between her thighs, less the one the rig was authored with — she stands
 *   with her feet apart, and that is not a stretch;
 * - `knee` is the more folded knee, in degrees away from straight.
 *
 * The authored pose reads as near zero: her joints hold a few degrees of slack, so her own stance is
 * not a pose to be in trouble in.
 */
export function poseAngles(points: PosePoints): PoseAngles {
  const pelvis = unit(points.stomach, points.pants);
  const waist = unit(points.pants, points.stomach);
  const chest = unit(points.stomach, points.neck);
  const head = unit(points.neck, points.head);
  const thigh1 = unit(points.pants, points.knee1);
  const shin1 = unit(points.knee1, points.foot1);
  const thigh2 = unit(points.pants, points.knee2);
  const shin2 = unit(points.knee2, points.foot2);
  const back = backOf(points);

  const neck = dorsal(chest, head, back);
  const lower = dorsal(waist, chest, back);
  const hip1 = dorsal(pelvis, thigh1, back);
  const hip2 = dorsal(pelvis, thigh2, back);
  const knee1 = Math.abs(turn(thigh1, shin1));
  const knee2 = Math.abs(turn(thigh2, shin2));
  return {
    head: neck,
    spine: lower,
    hips: (hip1 + hip2) / 2,
    hip1,
    hip2,
    arch: Math.max(0, neck) + Math.max(0, lower) + Math.max(0, (hip1 + hip2) / 2),
    spread: Math.max(0, Math.abs(turn(thigh1, thigh2)) - SPREAD_AT_REST_DEG),
    knee1,
    knee2,
    knee: Math.max(knee1, knee2),
  };
}

/** The split of a pose: how far the legs are opened, which thigh is behind, and what that is worth. */
interface SplitReading {
  /** The opening, in the degrees {@link SPLIT_STEPS} is written in. */
  readonly amount: number;
  /** Which of her knees the split's own knee bonus is read from. */
  readonly back: 'knee1' | 'knee2';
  /** The steps of the split's own ladder, before the knee has its say ({@link kneelBonus}). */
  readonly level: PainLevel;
}

/**
 * The split: how far her legs are pulled apart, in degrees, and which thigh is the one behind her.
 *
 * Measured as the *tighter* of her two hips going its own way off the pelvis's axis, counted twice: two
 * legs wide apart each carry half of a split, and the pose only goes as far as the leg that is not
 * there yet. That is what tells the shapes apart, and neither the angle between the thighs nor the gap
 * between the two hips does it on its own:
 *
 * - the angle between the thighs cannot tell a past split from one that is merely not there yet (both
 *   are 180 once one leg swings past the other, because an angle between two directions is never more);
 * - the gap between the hips calls a front thigh folded onto her chest as wide as a split, while the
 *   leg behind her has barely moved;
 * - and the *average* of the two — what {@link PoseSources.hip} reads, and which is right for a bridge —
 *   cancels a split out completely, because a split extends one hip and folds the other.
 *
 * Two legs both folded the same way are not a split at all (there is nothing between them to open), and
 * neither is her own stance, so both read zero.
 *
 * The thigh that is behind her is the one the split's knee bonus is read from: a split with the back
 * leg's knee folded up is worse than the same split with it straight ({@link SPLIT_KNEE_STEPS}).
 */
export function splitOf(angles: PoseAngles): SplitReading {
  const behind = angles.hip1 >= angles.hip2;
  const opening = Math.abs(angles.hip1) + Math.abs(angles.hip2) - Math.abs(angles.hip1 + angles.hip2);
  const amount = Math.max(0, opening - SPLIT_AT_REST_DEG);
  return {
    amount,
    back: behind ? 'knee1' : 'knee2',
    level: step(amount, SPLIT_STEPS),
  };
}

/** Which step a value has reached: how many of `steps` it is past, as a level. */
function step(amount: number, steps: readonly number[]): PainLevel {
  let level = 0;
  for (const threshold of steps) {
    if (amount >= threshold) level++;
  }
  return level as PainLevel;
}

/**
 * What the back leg's knee does to a split's own step: nothing at all until the split is one, and
 * otherwise {@link SPLIT_KNEE_STEPS} on top of it, up to the last step there is.
 *
 * The gate is the ladder's own second step — a pair of legs open far enough to be *hard* without any
 * help — and not "any step at all": the first step of this ladder is a single degree, so a doll lying
 * on the floor with her knees up and her legs two degrees apart would otherwise have a folded knee turn
 * that into *hard* out of nothing. The knee is what makes a *split* worse; it is not what makes lying
 * down hurt. See `docs/pain.md` for the poses this was checked against.
 */
function kneelBonus(splitLevel: PainLevel, backKnee: number): PainLevel {
  if (splitLevel < HARD) return splitLevel;
  return Math.min(BEYOND, splitLevel + step(backKnee, SPLIT_KNEE_STEPS)) as PainLevel;
}

/**
 * What her two hips are worth together, in the degrees {@link HIP_STEPS} is written in: the extension
 * they share, counted only when it goes *back*.
 *
 * Both legs going back together is a bridge or a bow, and that is what this ladder is about — a hip
 * levered away from its pelvis in the direction the joint was not made for. The other way is a fold,
 * and a fold is what a hip is *for*: the rig gives a thigh 17.19 degrees backwards and 120.32 forwards,
 * a difference of seven to one, and what that asymmetry means is that a leg pulled up towards her chest
 * and a leg swung out behind her are not the same movement at all. So a ragdoll tucking her knees up as
 * she falls reads nothing here, which is right — nothing about that shape hurts — while a pair of legs
 * swung back under a still pelvis reads {@link HIP_STEPS} in full.
 *
 * The average of the two is deliberate, and it is the one thing that tells a bridge from a split: a
 * bridge extends both hips the same way, so the average is each of them, and a split extends one while
 * folding the other, so the average cancels out and the *split's* own source is what reads it (see
 * {@link splitOf}).
 */
function extensionOf(angles: PoseAngles): number {
  return Math.max(0, angles.hips);
}

/** Reads one pose into the four sources of pain it holds, each with its own step. */
export function poseSources(points: PosePoints): PoseSources {
  const angles = poseAngles(points);
  const split = splitOf(angles);
  const backKnee = split.back === 'knee1' ? angles.knee1 : angles.knee2;
  return {
    neck: { amount: Math.max(0, angles.head), level: step(Math.max(0, angles.head), NECK_STEPS) },
    waist: { amount: Math.max(0, angles.spine), level: step(Math.max(0, angles.spine), WAIST_STEPS) },
    hip: {
      amount: extensionOf(angles),
      level: step(extensionOf(angles), HIP_STEPS),
    },
    split: {
      ...split,
      // The knee is a bonus step rather than part of the amount: the split's own ladder is a statement
      // about the legs' geometry, and a folded knee makes the pose worse rather than wider. It is the
      // *back* leg's knee — the one that is not the leg doing the folding — that counts, and it counts
      // only when there is a split to make worse: a kneel is a folded knee with nothing opened.
      level: kneelBonus(split.level, backKnee),
    },
  };
}

/** The pose points of one doll, or null if the rig is missing a joint a pose needs. */
export function rigPoints(doll: Doll): PosePoints | null {
  const head = doll.joint('head');
  const neck = doll.joint('neck');
  const stomach = doll.joint('stomach');
  const pants = doll.joint('pants');
  const knee1 = doll.joint('knee1');
  const foot1 = doll.joint('foot1');
  const knee2 = doll.joint('knee2');
  const foot2 = doll.joint('foot2');
  if (!head || !neck || !stomach || !pants || !knee1 || !foot1 || !knee2 || !foot2) return null;
  return { head, neck, stomach, pants, knee1, foot1, knee2, foot2 };
}

/** What one doll's pose is worth, source by source, or null when her rig cannot be read. */
export function dollSources(doll: Doll): PoseSources | null {
  const points = rigPoints(doll);
  return points ? poseSources(points) : null;
}
