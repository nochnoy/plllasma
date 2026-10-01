import { GUY_CHILDREN, type GuyChild } from '../guy.generated';
import { AngledConstraint, Constraint } from './constraint';
import { Particle2D } from './particle';

/**
 * Port of the original movie's `Extractor` (DoAction[4]).
 *
 * In the SWF the extractor walked the display list of the `guy` sprite: children marked
 * `is == "particle"` became particles (with the `mass` their clip actions had set), children
 * marked `constraint` / `angledConstraint` became constraints, and the pairs in the global
 * `skinDescription` table became the eleven drawn body parts.
 *
 * The port feeds it the same display list, baked from the SWF by `tools/guy-data.mjs` — the
 * algorithm below is the original's, including how a constraint's two ends are found (the
 * particles nearest the marker's two ends) and how its rest length is measured from them.
 */

/** One drawn part: a body sprite stretched between two particles. */
export interface SkinPart {
  p1: Particle2D;
  p2: Particle2D;
  /** Name of the artwork to draw (`hand`, `arm`, `leg`, `thigh`, `chest`, `head`, `stomach`). */
  mc: string;
}

export interface SkinItem {
  p1: string;
  p2: string;
  mc: string;
}

/**
 * The `skinDescription.items` table, in the order DoAction[0] builds it. The order is the draw
 * order (first pushed is drawn first, i.e. underneath): the forearm goes under the upper arm and
 * the shin under the thigh, which is what hides the seams where the artwork overlaps.
 *
 * `chest` is deliberately listed stomach-first while every other part is listed joint-first;
 * that reversal is what faces the torso artwork the right way round.
 */
export const SKIN_TABLE: readonly SkinItem[] = [
  { p1: 'arm1', p2: 'hand1', mc: 'hand' },
  { p1: 'neck', p2: 'arm1', mc: 'arm' },
  { p1: 'pants', p2: 'knee2', mc: 'thigh' },
  { p1: 'knee2', p2: 'foot2', mc: 'leg' },
  { p1: 'stomach', p2: 'neck', mc: 'chest' },
  { p1: 'neck', p2: 'head', mc: 'head' },
  { p1: 'stomach', p2: 'pants', mc: 'stomach' },
  { p1: 'knee1', p2: 'foot1', mc: 'leg' },
  { p1: 'pants', p2: 'knee1', mc: 'thigh' },
  { p1: 'neck', p2: 'arm2', mc: 'arm' },
  { p1: 'arm2', p2: 'hand2', mc: 'hand' },
];

/** Degrees per radian, as hard-coded in the original (`57.29578`). */
const DEG = 57.29578;

export class Extractor {
  readonly particles: Particle2D[] = [];
  readonly constraints: Constraint[] = [];
  readonly angledConstraints: AngledConstraint[] = [];
  readonly skin: SkinPart[] = [];

  extract(children: readonly GuyChild[] = GUY_CHILDREN, skinTable: readonly SkinItem[] = SKIN_TABLE): void {
    this.extractParticles(children);
    this.extractConstraints(children);
    this.extractSkin(skinTable);
  }

  /** Straight port of `extractParticles`: every child flagged as a particle, with its mass. */
  extractParticles(children: readonly GuyChild[]): void {
    for (const child of children) {
      if (child.is !== 'particle') continue;
      const p = new Particle2D(child.x, child.y);
      p.mass = child.mass || 1;
      p.rad = p.mass * 12;
      p.name = child.name;
      this.particles.push(p);
    }
  }

  /**
   * Straight port of `extractConstraints`. The marker clips carry a bar whose length and
   * direction are `_xscale` and `_rotation`; the particles nearest its origin and its far end are
   * the two joints it ties together, and the distance between them becomes the rest length.
   */
  extractConstraints(children: readonly GuyChild[]): void {
    for (const child of children) {
      const angled = child.is === 'angledConstraint';
      if (!angled && child.is !== 'constraint') continue;

      const radians = child.rotation / DEG;
      const xa = child.x + Math.cos(radians) * child.xscale;
      const ya = child.y + Math.sin(radians) * child.xscale;

      const p1 = this.findParticle(child.x, child.y);
      const p2 = this.findParticle(xa, ya);
      const dist = getDist(p1, p2);

      if (angled) {
        const p3 = this.particles.find((p) => p.name === child.p3);
        if (!p3) throw new Error(`constraint references unknown particle "${child.p3}"`);
        const c = new AngledConstraint(p1, p2, dist, p3, child.minang ?? 0, child.maxang ?? 0);
        if (child.inversed) c.inversed = true;
        this.constraints.push(c);
        this.angledConstraints.push(c);
      } else {
        this.constraints.push(new Constraint(p1, p2, dist));
      }
    }
  }

  /** The skin table names the two particles each drawn part spans. */
  extractSkin(skinTable: readonly SkinItem[]): void {
    for (const item of skinTable) {
      const p1 = this.particles.find((p) => p.name === item.p1);
      const p2 = this.particles.find((p) => p.name === item.p2);
      if (!p1 || !p2) throw new Error(`skin part ${item.mc} references unknown particles`);
      this.skin.push({ p1, p2, mc: item.mc });
    }
  }

  /** Nearest particle to a point, as the original's `findParticle` did (no distance limit). */
  findParticle(x: number, y: number): Particle2D {
    let best = Number.POSITIVE_INFINITY;
    let found: Particle2D | null = null;
    for (const p of this.particles) {
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        found = p;
      }
    }
    if (!found) throw new Error('no particles to match against');
    return found;
  }
}

function getDist(p1: Particle2D, p2: Particle2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}
