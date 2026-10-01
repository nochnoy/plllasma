/**
 * Port of the original movie's `Particle2D` / `MCParticle` (DoAction[8]).
 *
 * A particle stores its current position plus the previous one, which is all a Verlet
 * integrator needs. The original's `MCParticle` also carried a movie clip so the point could be
 * drawn (those were the bouncing balls); the parts that remain here only need the physics state
 * and the display-list name, which is what the extractor matches skin parts and `p3` against.
 */
export class Particle2D {
  x: number;
  y: number;
  /** Position at the end of the previous step — this is the Verlet velocity. */
  oldx: number;
  oldy: number;
  /** Collision radius. The original sets `rad = mass * 12`. */
  rad = 1;
  mass = 1;
  /** Name of the display-list child this particle was extracted from. */
  name: string | null = null;
  /**
   * Whether the world's walls hold this particle (see `PEngine2D.clampToWorld`).
   *
   * A port extension, and the one place a rope and a body differ: the walls are the body's — they are
   * what keeps the doll in the room — while a rope is the player's own drawing and is nailed wherever
   * they clicked, in the scenery around the walls as readily as in the play area. A bead pulled back
   * inside the walls would take its whole rope with it, so the chain of a rope is left where it was put
   * and only the body is confined. Every particle the extractor builds is clamped, which is to say
   * every part of every doll; a rope's beads and knots are the ones that are not.
   */
  clamped = true;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.oldx = x;
    this.oldy = y;
  }
}
