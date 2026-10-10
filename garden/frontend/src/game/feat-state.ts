import { EXTREME, dollSources } from './pain';
import { FACE } from './pain-state';
import type { Doll } from './doll';

/**
 * The run's own word for what the play is doing, as a machine over the pose rather than a one-off
 * threshold: seven poses worth a line, each with its own word and its own weight, and the line in
 * the chat is what the machine has said so far rather than whatever the pose reads as this instant.
 *
 * The markers, by weight:
 *
 * - «Сделал шпагат» (1) — her thighs opened past {@link OVERSPLIT_DEGREES}: the bar the line has
 *   carried since before it was a machine, kept where it was when the machine took the line over.
 * - «Сделал бэкбенд» (1) — the arch of her spine arrived at *extreme*, the step of the waist's own
 *   ladder the face machine shows `4.png` for on arrival.
 * - «Сделал перешпагат» (2) — the split itself arrived at *extreme*: the same step, on the split's
 *   ladder (`pain.ts` reads the two apart, because a split extends one hip and folds the other).
 * - «Сделал мостик» (2) — hands and feet below the body with the body arched at *extreme*: a bridge.
 * - «Сделал затяжку» (3) — one leg below the body and the other above the head, the legs in a
 *   split, the body arched at *extreme*: the vertical oversplit a rope hauls her into.
 * - «Сделал трипплфолд» (4) — both knees and both feet within {@link FLOOR_TOLERANCE_PX} of the
 *   floor of the physical world, the body arched at *extreme*: the fold that has nowhere lower to go.
 * - «Достиг супергибкости» (5) — the enlightenment: the face machine wearing `7.png`, its own word
 *   for two or more sources past their limits at once. Not measured here at all — the seventh
 *   portrait is the face machine's verdict, and this machine only repeats it.
 *
 * What the line says only climbs: a marker that weighs the same as or less than the words already
 * in the chat leaves them alone, so the line is the heaviest thing the run has done rather than a
 * chatter of every pose passed through. It is per run — a run begins with nothing said
 * (`Game.record` resets the machine) and ends with its heaviest word on it.
 *
 * The enlightenment outlives the pose that earned it: once reached, the machine's state is held for
 * {@link ENLIGHTENMENT_MS} whatever the pose does next, because a state that flickered away the
 * instant the ropes eased would not be a state the run had reached at all. For those three seconds
 * the enlightenment overrides every other reading; after them the pose is read again — and if she
 * is still at `7.png`, that is reaching it anew and the three seconds start over.
 */

/** One of the poses worth a line: the run's own word for it, and how much that word weighs. */
export interface Feat {
  readonly id: FeatId;
  /** What the line in the chat says — a sentence, because the chat says it as it is. */
  readonly label: string;
  /** How much the word weighs: a heavier one replaces the line, an equal or lighter one does not. */
  readonly weight: number;
}

/** The markers a pose can read as, in the order they are tried: heaviest first, ties in between. */
export type FeatId =
  | 'split'
  | 'backbend'
  | 'oversplit'
  | 'bridge'
  | 'suspension'
  | 'triplefold'
  | 'superflex';

/** The seven markers themselves, by the ids they are read as. */
export const FEATS = {
  split: { id: 'split', label: 'Сделал шпагат', weight: 1 },
  backbend: { id: 'backbend', label: 'Сделал бэкбенд', weight: 1 },
  oversplit: { id: 'oversplit', label: 'Сделал перешпагат', weight: 2 },
  bridge: { id: 'bridge', label: 'Сделал мостик', weight: 2 },
  suspension: { id: 'suspension', label: 'Сделал затяжку', weight: 3 },
  triplefold: { id: 'triplefold', label: 'Сделал трипплфолд', weight: 4 },
  superflex: { id: 'superflex', label: 'Достиг супергибкости', weight: 5 },
} as const satisfies Record<FeatId, Feat>;

/**
 * How far apart her knees have to open, in degrees, before the run is said to have put her in a
 * split — an oversplit, really, which is what a rope and a determined hand can work her into and
 * what the lightest of the run's own words is for. Her thighs rest against each other, so the angle
 * between them is near zero until somebody means it; 150 of the 180 a full split would take is a
 * pose nobody lands in by falling.
 */
export const OVERSPLIT_DEGREES = 150;

/**
 * How long the enlightenment holds once it has been reached, in milliseconds. The clock is the
 * world's own — the milliseconds a step is stepped by (`Game.liveStep`), not the display's — so a
 * run that is wound back and played again holds it for the same three seconds of run.
 */
export const ENLIGHTENMENT_MS = 3000;

/**
 * How close to the floor of the physical world both knees and both feet have to be for the fold to
 * count as a triplefold, in world pixels: ten of them above the engine's own bottom edge
 * (`PEngine2D.maxy`), the line the solver clamps her to. The shins lying flat are on it; anything
 * kneeling rather than folded is a world further up.
 */
export const FLOOR_TOLERANCE_PX = 10;

/**
 * The machine itself: the pose read into a marker every step of the world, the line that only
 * climbs, and the enlightenment held over both.
 *
 * It is stepped from the game's own live step (`Game.liveStep`) rather than from the renderer, and
 * timed in the same milliseconds the face machine is (`pain-state.ts`): the world's clock, stopped
 * while the world is. It watches the *first* doll — the one the movie starts with, the one the
 * smoke test pulls about — and a stage with no doll on it reads as nothing.
 */
export class FeatState {
  /** The marker the pose reads as right now, or the enlightenment held over it; null when none. */
  private worn: Feat | null = null;
  /** The run's own line so far: the weightiest marker said, kept until a weightier one comes. */
  private line: Feat | null = null;
  /**
   * Milliseconds the enlightenment still holds. Positive from the step `7.png` was shown until
   * three seconds of world have passed, during which the pose is not read at all — the state is the
   * enlightenment, whatever the ropes are doing to her in the meantime.
   */
  private enlightenLeft = 0;

  /** The marker the machine is in, for the tests and for anyone else who would rather ask than listen. */
  get shown(): Feat | null {
    return this.worn;
  }

  /** The run's line: what the chat should be saying now, once the words have been handed to it. */
  get said(): Feat | null {
    return this.line;
  }

  /** A run begins with nothing said: its line starts as the page's announcement of it and is earned from here. */
  reset(): void {
    this.worn = null;
    this.line = null;
    this.enlightenLeft = 0;
  }

  /**
   * Advances the machine by one step of the world, reading the first doll as the step left her.
   *
   * A doll that is not there, or whose rig cannot be read, is a pose that is nothing — the state
   * drops to null and the line keeps whatever it had, the same way a face machine unread is a face
   * machine unhurt rather than broken.
   */
  step(doll: Doll | null, floorY: number, elapsedMs: number): void {
    const dt = Math.max(0, elapsedMs);
    if (this.enlightenLeft > 0) {
      this.enlightenLeft -= dt;
      this.worn = FEATS.superflex;
    } else {
      this.worn = this.read(doll, floorY);
      if (this.worn === FEATS.superflex) this.enlightenLeft = ENLIGHTENMENT_MS;
    }
    // The line only climbs: an equal weight is the same rank of achievement, and a lighter one is a
    // step down from what the run has already been said to do.
    if (this.worn && (this.line === null || this.worn.weight > this.line.weight)) {
      this.line = this.worn;
    }
  }

  /**
   * What one pose reads as, heaviest first so that a pose answering two markers at once is the
   * weightier of them: a triplefold with the legs split is a triplefold, not also a затяжка.
   *
   * «Тело выгнуто до `4.png`» is read off the two arch sources — the waist and the hips — at the
   * *extreme* step of their own ladders, which is the step the face machine shows the arrival face
   * for; the split's own ladder is not an arch, and the neck alone does not make the body выгнуто.
   * The geometry around it is plain coordinates: the world's `y` grows downwards, so below is
   * greater, and the body a limb is below or above is her torso (`stomach`), the one bone of the
   * rig that is neither a limb nor an end of her.
   */
  private read(doll: Doll | null, floorY: number): Feat | null {
    if (!doll) return null;
    if (doll.pain.shown === FACE.super) return FEATS.superflex;
    const sources = dollSources(doll);
    const legs = doll.joints('head', 'stomach', 'knee1', 'foot1', 'knee2', 'foot2');
    if (!sources || !legs) return null;
    const [head, torso, knee1, foot1, knee2, foot2] = legs;
    const hands = doll.joints('hand1', 'hand2');
    const arched = sources.waist.level >= EXTREME || sources.hip.level >= EXTREME;
    const planted =
      knee1.y >= floorY - FLOOR_TOLERANCE_PX &&
      knee2.y >= floorY - FLOOR_TOLERANCE_PX &&
      foot1.y >= floorY - FLOOR_TOLERANCE_PX &&
      foot2.y >= floorY - FLOOR_TOLERANCE_PX;
    const suspended =
      (foot1.y > torso.y && foot2.y < head.y) || (foot2.y > torso.y && foot1.y < head.y);
    const angle = doll.thighAngle();

    if (arched && planted) return FEATS.triplefold;
    if (arched && suspended && angle !== null && angle >= OVERSPLIT_DEGREES) return FEATS.suspension;
    if (sources.split.level >= EXTREME) return FEATS.oversplit;
    if (
      arched &&
      hands &&
      hands[0].y > torso.y &&
      hands[1].y > torso.y &&
      foot1.y > torso.y &&
      foot2.y > torso.y
    ) {
      return FEATS.bridge;
    }
    if (sources.waist.level >= EXTREME) return FEATS.backbend;
    if (angle !== null && angle >= OVERSPLIT_DEGREES) return FEATS.split;
    return null;
  }
}
