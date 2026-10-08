import { DEFAULT_CHARACTER, type Character } from './characters';
import { PART_ASSETS, type PartName } from './parts.generated';
import { PainState } from './pain-state';
import { maskCovers, type PartMasks } from './part-mask';
import { Extractor, type SkinPart } from './vm/extractor';
import { PEngine2D } from './vm/engine';
import type { AngledConstraint, Constraint } from './vm/constraint';
import type { Particle2D } from './vm/particle';

/**
 * One doll: the rig the extractor builds out of the SWF's display list, plus the character whose
 * artwork is drawn over it and the pose it was authored in.
 *
 * The original movie assembled exactly one of these at load time and never touched it again. The
 * toolbar can drop in more, so the rig is wrapped in a class here — but nothing about the rig itself
 * changed: the twelve particles, the twenty angular joints and the eleven skin parts are the
 * movie's own, and every doll shares the world's engine, which is what lets a rope tie itself to
 * one doll and hold it. The character it carries is a look and nothing else: it says whose sprites
 * the scene draws and whose alpha the picking tests, and every character's rig is the same rig.
 *
 * A doll draws nothing itself; the scene builds one sprite per skin part for it.
 */
export class Doll {
  /** Whose artwork this doll is drawn with. */
  readonly character: Character;
  readonly particles: readonly Particle2D[];
  readonly skin: readonly SkinPart[];
  /**
   * The face her card wears: her pose, read into sources of pain and then put through the nine-picture
   * machine that decides what the player sees (`pain-state.ts`). The world steps it with the rest of the
   * doll, so it is the doll's own clock rather than the renderer's.
   */
  readonly pain: PainState;
  /** Every plain joint of the rig, so the doll can be taken apart again. */
  private readonly constraints: readonly Constraint[];
  /**
   * The angled half: those live in their own engine list. Readable from outside because they are what
   * the rig's angles *are* — every reading of the pose goes through them (see `poseAngles`).
   */
  readonly angledJoints: readonly AngledConstraint[];
  /** Authored positions, for {@link respawn}. */
  private readonly rest: readonly { x: number; y: number }[];

  private constructor(
    character: Character,
    particles: Particle2D[],
    skin: SkinPart[],
    constraints: Constraint[],
    angled: AngledConstraint[],
    random: () => number,
  ) {
    this.character = character;
    this.particles = particles;
    this.skin = skin;
    this.angledJoints = angled;
    this.constraints = constraints;
    this.rest = particles.map((p) => ({ x: p.x, y: p.y }));
    // The face is the one part of a doll that leaves anything to chance, and its stream comes from the
    // world rather than from the browser: a run has to be replayable (see `Random` in `tape.ts`).
    this.pain = new PainState(random);
  }

  /** Hands her own clock the stream a run's randomness comes from — see `World.useRandom`. */
  useRandom(random: () => number): void {
    this.pain.useRandom(random);
  }

  /**
   * Builds a rig and registers it with the engine, `offset` world pixels from where the movie
   * authored it. The character is what the rig is *dressed* in — it does not change the rig in any
   * way. Returns null when the engine's particle budget cannot take another doll — the engine drops
   * its oldest particle past its cap, and that would tear a rig in half.
   */
  static spawn(
    engine: PEngine2D,
    offset: { x: number; y: number } = { x: 0, y: 0 },
    character: Character = DEFAULT_CHARACTER,
    random: () => number = Math.random,
  ): Doll | null {
    const extractor = new Extractor();
    extractor.extract();
    if (engine.particles.length + extractor.particles.length > PEngine2D.MAXPARTICLES) return null;
    for (const p of extractor.particles) {
      // Both positions, or the offset becomes a velocity: Verlet reads the difference between where a
      // particle is and where it was, so a rig moved by moving only `x`/`y` arrives at its new spot
      // travelling at the speed it was teleported with — a doll put down away from the middle of the
      // world would fling herself at the nearest wall.
      p.x += offset.x;
      p.y += offset.y;
      p.oldx += offset.x;
      p.oldy += offset.y;
    }
    const plain = extractor.constraints.filter((c) => !('isAngled' in c));
    const doll = new Doll(character, extractor.particles, extractor.skin, plain, extractor.angledConstraints, random);
    for (const p of doll.particles) engine.addParticle(p);
    for (const c of doll.angledJoints) engine.addAngledConstraint(c);
    for (const c of plain) engine.addConstraint(c);
    return doll;
  }

  /** A point in the middle of the rig: enough to keep freshly added dolls from piling up. */
  get centre(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const p of this.particles) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(1, this.particles.length);
    return { x: x / n, y: y / n };
  }

  /** The rig's own joint names (`head`, `stomach`, `knee1`, ...), as named by the SWF. */
  joint(name: string): Particle2D | null {
    return this.particles.find((p) => p.name === name) ?? null;
  }

  /**
   * The angle between her two thighs, in degrees, measured off the joints as they are drawn: near zero
   * with her legs together, 180 in a full split. It is the number a rope and a determined hand move,
   * and the number the run's own line in the chat is told about when it has been worked past a split
   * (`Game.noteFeats`) — the same measurement the smoke test reads when it pulls her knees apart.
   *
   * Null when her rig is missing a leg, which no rig of ours is: a caller that cannot be told the
   * angle is a caller that has nothing to say about it.
   */
  thighAngle(): number | null {
    const legs = this.joints('pants', 'knee1', 'knee2');
    if (!legs) return null;
    const [pants, knee1, knee2] = legs;
    const first = { x: knee1.x - pants.x, y: knee1.y - pants.y };
    const second = { x: knee2.x - pants.x, y: knee2.y - pants.y };
    return (Math.abs(Math.atan2(first.x * second.y - first.y * second.x, first.x * second.x + first.y * second.y)) * 180) / Math.PI;
  }

  /**
   * Several joints at once, in the order asked for, or null if the rig is missing any of them — for a
   * caller that lays a whole chain of them out and would otherwise be checking every lookup (`World`).
   * A rig is built from the movie's own display list or not built at all, so the names it knows are
   * either all there or the rig is not one of ours.
   */
  joints(...names: readonly string[]): Particle2D[] | null {
    const found = names.map((name) => this.joint(name));
    if (found.some((p) => p === null)) return null;
    return found as Particle2D[];
  }

  /**
   * The body part whose artwork covers a point, topmost (last drawn) first — the part a rope gets
   * tied to when the player ties one to her, and what the end of a rope being drawn is read against
   * as it comes down on her.
   *
   * Two tests, cheapest first. The first is the artwork box: centred on the bone's midpoint,
   * `partLen` long along the bone and `depth` wide across it, which is the extent
   * `prepare-assets.mjs` baked. The second is the artwork itself — {@link maskCovers} against the
   * part's alpha, when the renderer has decoded it: the box is a rectangle, and the transparent
   * padding a part is baked into is far bigger than the body it holds, so a click only counts when
   * it lands on a texel the artwork actually covers. A part that fails either test is skipped and
   * the ones under it get their turn.
   *
   * `masks` are the masks of *this* doll's character — the rig is the movie's for every character,
   * so it is the caller that knows which artwork is drawn over it.
   */
  hitTest(x: number, y: number, masks: PartMasks | null = null): SkinPart | null {
    for (let i = this.skin.length - 1; i >= 0; i--) {
      const part = this.skin[i];
      const asset = PART_ASSETS[part.mc as PartName];
      const dx = part.p1.x - part.p2.x;
      const dy = part.p1.y - part.p2.y;
      const bone = Math.hypot(dx, dy);
      if (bone === 0) continue;
      const ux = dx / bone;
      const uy = dy / bone;
      const mx = (part.p1.x + part.p2.x) / 2;
      const my = (part.p1.y + part.p2.y) / 2;
      const along = (x - mx) * ux + (y - my) * uy;
      const across = -(x - mx) * uy + (y - my) * ux;
      if (Math.abs(along) > asset.partLen / 2 || Math.abs(across) > asset.depth / 2) continue;
      const mask = masks?.[part.mc];
      if (mask && !maskCovers(mask, asset, along, across)) continue;
      return part;
    }
    return null;
  }

  /** Back to the authored pose. */
  respawn(): void {
    this.particles.forEach((p, i) => {
      const rest = this.rest[i];
      p.x = rest.x;
      p.y = rest.y;
      p.oldx = rest.x;
      p.oldy = rest.y;
    });
  }

  /** Takes the rig out of the engine. */
  dispose(engine: PEngine2D): void {
    for (const p of this.particles) engine.removeParticleRef(p);
    for (const c of this.constraints) engine.removeConstraintRef(c);
    for (const c of this.angledJoints) engine.removeAngledConstraintRef(c);
  }
}
