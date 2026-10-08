import { AngledConstraint, Constraint } from './constraint';
import { Particle2D } from './particle';

/**
 * Port of the original movie's `PEngine2D` (DoAction[9]) plus the solver methods the movie adds
 * to its prototype in DoAction[10].
 *
 * Everything here is a straight transcription of the ActionScript; the constants (0.0011,
 * 0.9993, the 0.3 of the angular relax, the 30% grab) are the original's, and the update order
 * — Verlet, hold, then two solver iterations — is the original's too. The goal is that the doll
 * moves exactly like the SWF, so nothing here is tuned by feel.
 *
 * Coordinates are the movie's own: the origin is the centre of the stage, +x right and +y down,
 * in the same pixels the rig was authored in.
 */
export class PEngine2D {
  static readonly MAXPARTICLES = 256;

  /** Time scale the original exposes on the arrow keys (`PEng.speed`). */
  speed = 1;
  gravity = 0.0011;
  fric = 0.9993;

  /**
   * The box every clamped particle is kept inside: `minx..maxx` for the sides, `maxy` for the floor, and
   * `miny` for the ceiling above the picture.
   *
   * The width is not fixed: a narrow screen shows a narrower world, and the walls come in with it
   * (see {@link setWallWidth}); the floor is the hall's own, so it never moves. The ceiling stands a
   * fixed margin over the *visible* top edge, out of the frame (`ceilingFor` in `stage.ts`).
   */
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;

  /**
   * The balls every clamped particle is pushed out of, as the movie's `Track` kept them: things with a
   * position and a radius, which the engine reads and never writes ({@link collision}).
   *
   * In the movie they were movie clips of their own, made and recycled by `Track` as the doll fell; in
   * the port they are the scene's (`World.balls`), which is what knows when to make one and where. What
   * the engine keeps is the list the movie's own collision read: a ball is a point and a radius here, and
   * nothing about it moves in this file.
   */
  balls: readonly { x: number; y: number; rad: number }[] = [];

  readonly particles: Particle2D[] = [];
  readonly constraints: Constraint[] = [];
  readonly angledConstraints: AngledConstraint[] = [];

  /** Particles the pointer is dragging — the original's `onHold`. */
  onHold: Particle2D[] | null = null;
  /** Pointer position in world coordinates, i.e. the original's `_root._xmouse/_ymouse`. */
  mouseX = 0;
  mouseY = 0;

  /** Milliseconds the last `update` was asked to advance, after clamping and `speed`. */
  timeFactor = 0;

  /**
   * Whether `update` keeps the particles inside the world box.
   *
   * This one is a port extension: the original had the same `minx..maxy` fields and clamped y to
   * `maxy` inside its unused `hackContraint`, but it never needed the walls, because its bouncing
   * balls kept the doll in play. With the balls gone the box is what keeps her on screen, so it is
   * on by default — and switched off when replaying recorded runs of the original.
   */
  clampToWorldEnabled = true;

  constructor(width: number, height: number) {
    this.minx = -width / 2;
    this.miny = -height / 2;
    this.maxx = width / 2;
    this.maxy = height / 2;
  }

  /**
   * Moves the two side walls onto a play area `width` wide, keeping them centred on the world.
   *
   * This is what makes the room follow the screen: a window too narrow for the whole hall shows less
   * of it, and the walls stand closer together so that what the doll runs into is still inside the
   * picture the player is looking at (`wallsFor` in `stage.ts`). A particle left outside the new box is
   * pulled in by the next {@link clampToWorld}, exactly as if she had been dropped against the wall.
   */
  setWallWidth(width: number): void {
    this.minx = -width / 2;
    this.maxx = width / 2;
  }

  /**
   * Moves the ceiling onto the line a view of the picture puts it at (`ceilingFor` in `stage.ts`): the
   * third wall that follows the window, and the only one that is never in the picture. It is a line in
   * the open air above the hall rather than an edge of anything, so nothing is drawn along it.
   */
  setCeiling(y: number): void {
    this.miny = y;
  }

  // -------------------------------------------------------------- construction

  addConstraint(c: Constraint): void {
    this.constraints.push(c);
  }

  addAngledConstraint(c: AngledConstraint): void {
    this.angledConstraints.push(c);
  }

  addParticle(p: Particle2D): void {
    if (this.particles.length > PEngine2D.MAXPARTICLES) this.removeParticle(0);
    this.particles.push(p);
  }

  removeParticle(index: number): void {
    this.particles.splice(index, 1);
  }

  /**
   * The three `...Ref` methods below are port extensions: the original knew how to drop its oldest
   * particle (`removeParticle` above, which is what its own cap does) and nothing else, because
   * nothing in the movie was ever taken apart. The editor removes whole dolls and ropes, and those
   * are found by identity, not by index — indices shift as soon as anything else is removed.
   */
  removeParticleRef(particle: Particle2D): void {
    const index = this.particles.indexOf(particle);
    if (index >= 0) this.particles.splice(index, 1);
  }

  removeConstraintRef(constraint: Constraint): void {
    const index = this.constraints.indexOf(constraint);
    if (index >= 0) this.constraints.splice(index, 1);
  }

  removeAngledConstraintRef(constraint: AngledConstraint): void {
    const index = this.angledConstraints.indexOf(constraint);
    if (index >= 0) this.angledConstraints.splice(index, 1);
  }

  // ---------------------------------------------------------------- simulation

  /**
   * Verlet step. The original computes `Math.pow(fric, timeFactor)` once per step and adds
   * `gravity * timeFactor * timeFactor` to y — not a force but a per-step displacement, which is
   * why `timeFactor` is squared and why the fall speed settles instead of growing forever.
   */
  verlet(): void {
    const tf = this.timeFactor;
    const damping = Math.pow(this.fric, tf);
    for (const p of this.particles) {
      const x = p.x;
      const y = p.y;
      p.x += (p.x - p.oldx) * damping;
      p.y += (p.y - p.oldy) * damping + this.gravity * tf * tf;
      p.oldx = x;
      p.oldy = y;
    }
  }

  /** The original's grab: a plain 30% positional lerp towards the mouse, for every held particle. */
  hold(): void {
    const held = this.onHold;
    if (held === null) return;
    for (const p of held) {
      p.x += (this.mouseX - p.x) * 0.3;
      p.y += (this.mouseY - p.y) * 0.3;
    }
  }

  /**
   * The original read the wall clock; the port is handed the elapsed milliseconds of a fixed
   * 50 Hz step instead, so runs are reproducible. The clamp at 40 ms and the `speed` multiplier
   * are the original's.
   */
  getTimeFactor(elapsedMs: number): number {
    const dt = Math.min(elapsedMs, 40);
    return dt * this.speed;
  }

  update(elapsedMs: number): void {
    this.timeFactor = this.getTimeFactor(elapsedMs);
    this.verlet();
    this.hold();
    // Two relaxation passes, exactly as the original's update() did: each one solves the constraints and
    // then pushes the doll out of the balls (a pass with no balls on the stage is the solver alone).
    for (let i = 0; i < 2; i++) {
      this.constrain();
      this.collision();
    }
    if (this.clampToWorldEnabled) this.clampToWorld();
  }

  /**
   * Port of `collision`: every particle is put on the surface of any ball it is inside. The balls
   * themselves are untouched — in the movie they were scenery the doll bounced off, and the push is
   * what made her bounce, since Verlet reads the distance she is moved as the speed she leaves with.
   *
   * The movie's particle list was the doll's own joints, and this is that list: what a ball pushes here is
   * the doll, the rope beads and the stones — everything the stage can lay across a ball. The balls are
   * skipped, and that is the one place the port's copy differs from the movie's, which had no ball in the
   * list to skip: a ball that pushed another out of itself would be a ball that never rests on the floor,
   * and a ball pushed out of a *stone* is the stone's own business (`Block.collide`).
   *
   * A particle on a ball's own centre has no direction to be pushed in and is left alone; the original
   * would have divided by zero there.
   */
  collision(): void {
    const balls = this.balls;
    if (balls.length === 0) return;
    for (const p of this.particles) {
      if (balls.includes(p)) continue;
      for (const ball of balls) {
        const dx = p.x - ball.x;
        const dy = p.y - ball.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) continue;
        const radii = ball.rad + p.rad;
        if (distance >= radii) continue;
        p.x = ball.x + (dx / distance) * radii;
        p.y = ball.y + (dy / distance) * radii;
      }
    }
  }

  /** Angled constraints first, then the plain ones — the original's `constrain()`. */
  constrain(): void {
    for (const c of this.angledConstraints) this.satisfyAngConstraint(c);
    for (const c of this.constraints) this.satisfyConstraint(c);
  }

  /**
   * Keeps every particle inside `minx..maxx / miny..maxy`, the box the original's constructor computes
   * from the stage size — except the particles that are not the body (see {@link Particle2D.clamped}).
   *
   * The original's own `hackContraint` clamped y to `maxy` for the few constraints it was used on; with
   * the port's world having no ball *field* under the doll this is what keeps her in play. Switch it off
   * with {@link clampToWorldEnabled} to replay an unclamped run.
   *
   * **The top is a wall, but an unseen one.** The original's box was closed on all four sides, and the
   * port wants the doll to be hauled up and out of the picture rather than stopping at the frame like a
   * balloon on a string — so the ceiling stands above the picture, past the frame's own top edge
   * (`ceilingFor` in `stage.ts`), and is a wall only when she has gone as far out of the picture as
   * the port allows at all. What the player can see her hit is still the two sides and the floor.
   *
   * Note it clamps positions only, the way the original's `hackContraint` did: the velocity into
   * the wall is dropped by the next Verlet step, so she settles instead of bouncing.
   */
  clampToWorld(): void {
    for (const p of this.particles) {
      if (!p.clamped) continue;
      if (p.x < this.minx) p.x = this.minx;
      else if (p.x > this.maxx) p.x = this.maxx;
      if (p.y > this.maxy) p.y = this.maxy;
      else if (p.y < this.miny) p.y = this.miny;
    }
  }

  // -------------------------------------------------------------- angular joint

  /**
   * Port of `satisfyAngConstraint`. Keeps `p1 -> p2` at `restLength` and the angle between the
   * bones `p1 -> p2` and `p2 -> p3` inside `[minang, maxang]`, relaxing the angular error by a
   * third per call. Positions are set outright, so the joint is rigid where the angle is legal.
   */
  satisfyAngConstraint(c: AngledConstraint): void {
    const p1 = c.p1;
    const p2 = c.p2;
    const p3 = c.p3;

    const ang12 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const ang23 = Math.atan2(p3.y - p2.y, p3.x - p2.x);

    let da = ang12 - ang23;
    if (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;

    const restLength = c.restLength;
    const massSum = p1.mass + p2.mass;
    const w1 = p1.mass / massSum;
    const w2 = p2.mass / massSum;

    const mid = (c.maxang + c.minang) / 2;
    let corr = 0;
    if (!c.inversed) {
      const half = (c.maxang - c.minang) / 2;
      let d = mid - da;
      if (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (d > half) corr = d - half;
      else if (d < -half) corr = d + half;
    } else {
      if (da > c.minang && da < mid) corr = c.minang - da;
      if (da < c.maxang && da > mid) corr = c.maxang - da;
    }

    const target = ang12 + corr * 0.3;
    const nx = p1.x + (p2.x - p1.x) * w2;
    const ny = p1.y + (p2.y - p1.y) * w2;

    p1.x = nx + Math.cos(target + Math.PI) * restLength * w2;
    p1.y = ny + Math.sin(target + Math.PI) * restLength * w2;
    p2.x = nx + Math.cos(target) * restLength * w1;
    p2.y = ny + Math.sin(target) * restLength * w1;
  }

  // ------------------------------------------------------------- distance joint

  /**
   * Port of `satisfyConstraint` — the plain distance constraint. No child of this movie's rig
   * uses one (every marker is an angled constraint), so it is only here for completeness; note
   * the half-step relax, which is why the original ran the solver twice per frame.
   */
  satisfyConstraint(c: Constraint): void {
    const p1 = c.p1;
    const p2 = c.p2;
    const restLength = c.restLength;

    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const massSum = p1.mass + p2.mass;
    const w1 = p1.mass / massSum;
    const w2 = p2.mass / massSum;

    const wanted = dist + (dist - restLength);
    const k = ((dist - wanted) / dist) * 0.5;

    p2.x -= dx * k * w2;
    p2.y -= dy * k * w2;
    p1.x += dx * k * w1;
    p1.y += dy * k * w1;
  }
}
