import type { Particle2D } from './particle';

/**
 * Port of the original movie's `Constraint` and `AngledConstraint` (DoAction[6]).
 *
 * A plain constraint keeps two particles a fixed distance apart. An angled constraint does the
 * same *and* clamps the angle between the bones `p1 -> p2` and `p2 -> p3` to `[minang, maxang]`
 * (radians), which is how the original's bones hold their pose.
 *
 * Every value is authored in the movie: `restLength` is the distance the marker's two ends had
 * at load time, the angles come from the marker's clip actions, and `p3` is the sibling clip it
 * points at.
 */
export class Constraint {
  constructor(
    readonly p1: Particle2D,
    readonly p2: Particle2D,
    readonly restLength: number,
  ) {}
}

export class AngledConstraint extends Constraint {
  /** Set by the extractor for children marked `angledConstraint`; the engine tests this. */
  readonly isAngled = true;
  /** The original's `inversed` flag. No constraint in this movie sets it, but the solver reads it. */
  inversed = false;

  constructor(
    p1: Particle2D,
    p2: Particle2D,
    restLength: number,
    readonly p3: Particle2D,
    readonly minang: number,
    readonly maxang: number,
  ) {
    super(p1, p2, restLength);
  }
}
