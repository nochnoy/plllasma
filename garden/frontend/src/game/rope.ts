import type { Doll } from './doll';
import type { PEngine2D } from './vm/engine';
import { Constraint } from './vm/constraint';
import { Particle2D } from './vm/particle';

/**
 * Ropes are this port's own addition — the original movie has none — so unlike everything in
 * `vm/`, the numbers here are not read out of the SWF, they are what a rope is supposed to look and
 * behave like:
 *
 *  - the chain is a joint every {@link SEGMENT_LENGTH} world pixels and is drawn
 *    {@link ROPE_THICKNESS} world pixels thick;
 *  - it keeps the length it was drawn with: {@link MAX_STRETCH} is the most it may give under load;
 *  - it is inextensible but not unbendable, so it sags into a catenary whenever the tension drops.
 *
 * A rope's beads live in the engine's particle list — so they get the movie's own Verlet, damping,
 * world-box clamp and even the pointer grab, and the doll and the rope share one integrator — but
 * the chain's own constraints are *not* in the engine's constraint list: the engine relaxes only
 * twice per step, which is not enough for a long chain, and its distance solver would fight the
 * doll's rigid bones through the rope. `Rope.relax` is called by the world after the engine has
 * run, so the rope also has the last word on the joints it holds.
 */

/** Joint spacing of the chain, in world pixels. */
export const SEGMENT_LENGTH = 10;
/** How thick the rope is drawn, in world pixels. */
export const ROPE_THICKNESS = 4;
/** The rope may stretch this far before it is pulled back in — 5%, as specified. */
export const MAX_STRETCH = 1.05;
/** Relaxation passes the world runs per step. A chain needs more than the engine's two. */
export const SOLVE_PASSES = 24;
/**
 * Mass of one bead. Beads are deliberately much lighter than the body parts (0.5 .. 1.1): a rope
 * hanging from the stage must tug the doll, not the other way round. A feel knob, not SWF data.
 */
const BEAD_MASS = 0.25;
/** Mass of an end node: as heavy as a joint, so the knot stays where the player put it. */
const ANCHOR_MASS = 1;
/**
 * What a taut rope pulls its ends to, as a fraction of its own length. Just inside 100% on purpose: a
 * chain pulled to the very last fraction of its length would have no slack at all, and relaxation
 * would then stretch the links nearest the ends trying to reach a length the rope does not have. A
 * hair of slack leaves the taut rope a straight one, which is both what a rope looks like and a
 * state the solver can hold. The 5% is what a *link* may give under a load, not what the rope aims
 * for — so a rope under a full load still never looks stretched.
 */
const END_REACH = 0.999;
/**
 * How much of its length a rope lets a *dragged* knot use when the far end cannot come along.
 */
const DRAG_REACH = 0.998;

/**
 * How many links at either end of the chain belong to the end hanging there rather than to the rope's
 * own body: the cord right beside a knot is part of that knot, which is what a click near an end takes
 * hold of and drags. What lies between the two stretches is the rope's *middle* — the part of the
 * drawing with nothing of the player's on it, and so the part a click can take the whole rope away by
 * ({@link Rope.middleDistance}); see `World.press`.
 */
export const END_SEGMENTS = 2;

/** A click that landed on something a rope can be tied to. */
export interface RopeHit {
  /** The doll the end is tied to. */
  readonly holder: Doll;
  /** What the knot is glued to: the two ends of a body part. */
  readonly partners: readonly Particle2D[];
}

/**
 * One end of a rope.
 *
 * A nailed end (`holder === null`) is a point of the stage: its node is not in the engine at all, so
 * nothing in the simulation can move it — except the player, who can pick the knot up with the arrow
 * tool and put it down somewhere else. An end tied to a doll keeps a node of its own too, but that
 * node is glued to the spot it was clicked on by {@link ties}: distance constraints to the joints of
 * the thing under the click, which make the knot ride along with it and let the two pull on each
 * other. Two ties for a body part, where the bone is the line between them.
 */
export class Anchor {
  /** Where the rope ends. */
  readonly node: Particle2D;
  /** The doll this end is tied to, or null when the end is nailed to the stage. */
  holder: Doll | null = null;
  /** Constraints that glue the node to the joints it was clicked on (empty for a nail). */
  ties: Constraint[] = [];
  /** True when nothing but the player can move this end. */
  nailed = true;
  /** True while the player is dragging the knot about: its ties are left out until it is dropped. */
  dragging = false;
  /** The rope this is an end of. A draft end has none yet — its rope is built on the second click. */
  rope: Rope | null = null;

  constructor(x: number, y: number) {
    this.node = new Particle2D(x, y);
    this.node.mass = ANCHOR_MASS;
    // A knot is nailed where the player clicked, which is not always inside the walls: see
    // `Particle2D.clamped`.
    this.node.clamped = false;
  }

  /** Ties the knot to a holder, measuring the new ties from where the knot is at this moment. */
  tie(holder: Doll | null, partners: readonly Particle2D[]): void {
    this.holder = holder;
    this.nailed = holder === null;
    this.ties = holder
      ? partners.map((partner) => new Constraint(this.node, partner, distance(this.node, partner)))
      : [];
  }

  /**
   * Whether the rope may not move this end at all: a nail is a point of the stage, and a knot in the
   * player's hand is in their hand.
   */
  get rigid(): boolean {
    return this.nailed || this.dragging;
  }

  /**
   * Whether the rope may pull this end along when the player drags the other one. A doll's knot can
   * be pulled — dragging a rope she is tied to drags *her*, which is the point of a rope — while a
   * nail or a knot in hand cannot come.
   */
  get tuggable(): boolean {
    return !this.rigid;
  }

  /** Pins the knot somewhere: a dropped end stays exactly where it was let go. */
  place(x: number, y: number): void {
    this.node.x = x;
    this.node.y = y;
    this.node.oldx = x;
    this.node.oldy = y;
  }

  /**
   * Moves a knot the player is dragging.
   *
   * The rope takes the far end with it — that is what holding a rope by one end does — so the knot
   * follows the pointer wherever it goes, and the world's step then pulls whatever is on the other
   * end after it. The one thing the drag refuses is stretching the rope when that far end *cannot*
   * come: there the knot stops at the end of the rope's reach, exactly as a rope tied to a ring in
   * the wall would.
   */
  dragTo(x: number, y: number): void {
    const rope = this.rope;
    const other = rope?.other(this) ?? null;
    const held = other && !other.tuggable ? rope?.reachable(this.node, x, y) : null;
    if (held) this.place(held.x, held.y);
    else this.place(x, y);
  }
}

/** Turns a click into a rope end. `hit` is what `World.hitRopeHolder` reports, null for bare sky. */
export function createAnchor(x: number, y: number, hit: RopeHit | null): Anchor {
  const anchor = new Anchor(x, y);
  anchor.tie(hit?.holder ?? null, hit?.partners ?? []);
  return anchor;
}

/** Beads a rope between two anchors will create — the world checks it has room for them. */
export function beadCount(from: Anchor, to: Anchor): number {
  return Math.max(1, Math.round(distance(from.node, to.node) / SEGMENT_LENGTH)) - 1;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One rope: the two anchors, the beads between them, and the chain that ties them together. */
export class Rope {
  /** Every joint of the chain, from the start anchor to the end anchor. */
  readonly nodes: Particle2D[];
  /** The joints this rope created inside the engine (everything between the two anchors). */
  readonly beads: Particle2D[];
  /** The chain itself: one constraint per pair of neighbouring joints. */
  readonly segments: Constraint[];
  /** Rest length of one segment. */
  readonly restLength: number;
  /** The length the player drew: `restLength * segments.length`. */
  readonly length: number;

  constructor(engine: PEngine2D, readonly start: Anchor, readonly end: Anchor) {
    const dx = end.node.x - start.node.x;
    const dy = end.node.y - start.node.y;
    const total = Math.hypot(dx, dy);
    // As many segments as fit a 10 px joint spacing; what they end up with is exactly the distance
    // the player drew, so both knots stay where they clicked.
    const count = Math.max(1, Math.round(total / SEGMENT_LENGTH));
    this.restLength = total / count;
    this.length = this.restLength * count;
    this.beads = [];
    for (let i = 1; i < count; i++) {
      const bead = new Particle2D(start.node.x + (dx * i) / count, start.node.y + (dy * i) / count);
      bead.mass = BEAD_MASS;
      // The chain is the player's drawing and goes where they drew it, walls or no walls.
      bead.clamped = false;
      this.beads.push(bead);
      engine.addParticle(bead);
    }
    this.nodes = [start.node, ...this.beads, end.node];
    this.segments = [];
    for (let i = 0; i < this.nodes.length - 1; i++) {
      this.segments.push(new Constraint(this.nodes[i], this.nodes[i + 1], this.restLength));
    }
    start.rope = this;
    end.rope = this;
  }

  /**
   * One relaxation pass over the chain and the knots' ties, both ways round: the rope holds its own
   * length, and a knot rides along with whatever it is tied to.
   *
   * The weighting is by inverse mass, and that one line gives the whole feel of the thing: a light
   * joint is moved before a heavy one, so a slack rope follows the doll and never pins her down, and
   * a taut one drags her because her joints take most of the correction.
   */
  relax(): void {
    for (const c of this.segments) this.relaxLink(c);
    if (!this.start.dragging) for (const c of this.start.ties) this.relaxTie(c);
    if (!this.end.dragging) for (const c of this.end.ties) this.relaxTie(c);
  }

  /**
   * A tie is the knot's grip on the thing it is tied to: a doll's joint is pulled along with the
   * knot, which is how the knot rides on the part it was clicked on.
   */
  private relaxTie(c: Constraint): void {
    this.relaxLink(c);
  }

  /**
   * One link or tie, relaxed: both of its ends move apart, in inverse-mass shares.
   */
  private relaxLink(c: Constraint): void {
    const a = c.p1;
    const b = c.p2;
    // For a tie, the knot's own mass decides: it is a light point riding on whatever it is tied to.
    const wa = this.mobility(a);
    const wb = this.mobility(b);
    const sum = wa + wb;
    if (sum === 0) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    // Two joints exactly on top of each other have no direction to separate along; skip them,
    // gravity and the neighbouring segments sort the chain out.
    if (length < 1e-6) return;
    const diff = (length - c.restLength) / length;
    a.x += dx * diff * (wa / sum);
    a.y += dy * diff * (wa / sum);
    b.x -= dx * diff * (wb / sum);
    b.y -= dy * diff * (wb / sum);
  }

  /**
   * The end of this rope that is not `anchor`.
   */
  other(anchor: Anchor): Anchor {
    return anchor === this.start ? this.end : this.start;
  }

  /**
   * The nearest point to (`x`, `y`) this rope can put `node` at, given where its other end is: a
   * rope of a fixed length cannot have its ends pulled apart, so a player dragging a knot whose far
   * end cannot come along is held to the circle the rope can actually reach. See {@link Anchor.dragTo}.
   */
  reachable(node: Particle2D, x: number, y: number): { x: number; y: number } {
    const other = node === this.start.node ? this.end.node : this.start.node;
    const dx = x - other.x;
    const dy = y - other.y;
    const distance = Math.hypot(dx, dy);
    const reach = this.length * DRAG_REACH;
    if (distance <= reach || distance === 0) return { x, y };
    return { x: other.x + (dx / distance) * reach, y: other.y + (dy / distance) * reach };
  }

  /**
   * The rope as a whole, in one projection: its ends may not be further apart than the rope is long.
   *
   * This is what a rope *does*: it takes the ends with it. A pull that has to be absorbed by a doll's
   * knot drags the doll (her knot is light and takes all of it), and a nailed end never gives at all —
   * so a rope nailed at both ends simply refuses to stretch.
   *
   * Returns how far the rope is stretched, as a ratio of its length (1 = exactly its own length).
   */
  capEnds(): number {
    const start = this.start.node;
    const end = this.end.node;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    const stretch = this.length === 0 ? 1 : distance / this.length;
    if (stretch <= END_REACH || distance === 0) return stretch;

    const wa = this.endMobility(this.start);
    const wb = this.endMobility(this.end);
    const sum = wa + wb;
    if (sum === 0) return stretch;
    const over = distance - this.length * END_REACH;
    const ux = dx / distance;
    const uy = dy / distance;
    // Each end moves *towards* the other: the direction `u` runs from the start to the end.
    this.pull(this.start, ux * over * (wa / sum), uy * over * (wa / sum));
    this.pull(this.end, -ux * over * (wb / sum), -uy * over * (wb / sum));
    return stretch;
  }

  /** What share of a pull an end takes: none for a nail or a knot in hand, the knot's own otherwise. */
  private endMobility(anchor: Anchor): number {
    if (anchor.nailed || anchor.dragging) return 0;
    return 1 / Math.max(anchor.node.mass, 0.05);
  }

  /** Gives an end its share of a pull. */
  private pull(anchor: Anchor, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    anchor.node.x += dx;
    anchor.node.y += dy;
  }

  /**
   * The same budget for a single link, enforced by walking the chain from both of its ends and
   * pulling joints back onto their links until none is more than 5% long.
   *
   * One walk in each direction is not quite enough: when the joint a walk has to move is one the
   * simulation may not touch — a nail, or a knot the player is carrying — that walk has to move the
   * joint on the other side of the link instead, which can stretch the link it just capped. So the
   * walks repeat until they have nothing left to correct, which for a chain of fixed length takes a
   * couple of rounds.
   *
   * It only ever *shortens* links, which is what keeps the rope's sag exactly as it was, and it is
   * also the pass that carries a pull along the whole chain in one step, which relaxation alone
   * would take dozens of sweeps to do.
   *
   * Returns the worst link stretch it saw, before rectifying.
   */
  capLinks(): number {
    let worst = 0;
    for (const c of this.segments) worst = Math.max(worst, distance(c.p1, c.p2) / this.restLength);
    if (worst <= MAX_STRETCH) return worst;
    const sources = this.walkSources();
    for (let round = 0; round < this.nodes.length; round++) {
      let corrections = 0;
      for (const index of sources) corrections += this.rectify(index, index === 0 ? 1 : -1);
      if (corrections === 0) break;
    }
    return worst;
  }

  /**
   * Where the walks start: at the end that cannot move, when there is one, so that the end that can
   * is the one taking up the slack — a knot on a doll gives, and that is how a taut rope drags her.
   * With both ends unable to move the walks still run, from both ends: a chain whose beads have been
   * left in a hairpin has to be combed out from the ends before relaxation can even it up again.
   */
  private walkSources(): number[] {
    const last = this.nodes.length - 1;
    const startFixed = this.isFixed(this.nodes[0]);
    const endFixed = this.isFixed(this.nodes[last]);
    if (startFixed && endFixed) return [0, last];
    if (startFixed) return [0];
    if (endFixed) return [last];
    return [0, last];
  }

  /**
   * Walks the chain from one joint towards the other, shortening any link that is over budget.
   * Returns how many links it had to correct.
   *
   * Only the joint a walk is *heading towards* is ever moved, and a link whose far joint may not be
   * moved at all is left alone — trying to cap it by shoving the joint behind it would stretch the
   * link it had just capped, and a walk that stretches as much as it shortens never settles. The
   * links next to a fixed end are the relaxation's business, not the walk's.
   */
  private rectify(from: number, step: 1 | -1): number {
    const cap = this.restLength * MAX_STRETCH;
    let corrections = 0;
    for (let i = from + step; i >= 0 && i < this.nodes.length; i += step) {
      const near = this.nodes[i - step];
      const far = this.nodes[i];
      if (this.isFixed(far)) continue;
      const dx = far.x - near.x;
      const dy = far.y - near.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= cap || dist === 0) continue;
      const scale = cap / dist;
      far.x = near.x + dx * scale;
      far.y = near.y + dy * scale;
      corrections++;
    }
    return corrections;
  }

  /** Length the chain currently spans, joints and all. */
  measuredLength(): number {
    let sum = 0;
    for (const c of this.segments) sum += distance(c.p1, c.p2);
    return sum;
  }

  /** How far the longest segment is stretched, as a ratio of its rest length. */
  maxStretch(): number {
    let worst = 0;
    for (const c of this.segments) worst = Math.max(worst, distance(c.p1, c.p2) / this.restLength);
    return worst;
  }

  /** Whether one of this rope's ends is tied to that doll. */
  touches(holder: Doll): boolean {
    return this.start.holder === holder || this.end.holder === holder;
  }

  /** Shortest distance from a point to the drawn chain — how a rope is picked out at all. */
  distanceTo(x: number, y: number): number {
    let best = Number.POSITIVE_INFINITY;
    for (const c of this.segments) {
      best = Math.min(best, pointSegmentDistance(x, y, c.p1.x, c.p1.y, c.p2.x, c.p2.y));
    }
    return best;
  }

  /**
   * Shortest distance from a point to the *middle* of the drawn chain: the stretch of cord that is
   * neither end's, {@link END_SEGMENTS} links in from either knot. A point on the end of a rope does
   * not read here however close it is — the ends are the knots' own ground — so this is what a click
   * that means the rope *itself* is measured against (`World.press`).
   *
   * Infinity for a rope with no middle at all, which is a chain of two links or fewer: there is
   * nothing on it that is not one of its ends. Such a rope is still a rope — it can be picked out and
   * tied to things, and its knots are still knots to take hold of — it is only its own body that it
   * does not have. A rope always keeps as many links in the middle as it can spare, so that a rope
   * drawn short is never all ends and nothing else.
   */
  middleDistance(x: number, y: number): number {
    const ends = Math.min(END_SEGMENTS, Math.floor((this.segments.length - 1) / 2));
    let best = Number.POSITIVE_INFINITY;
    for (let i = ends; i < this.segments.length - ends; i++) {
      const c = this.segments[i];
      best = Math.min(best, pointSegmentDistance(x, y, c.p1.x, c.p1.y, c.p2.x, c.p2.y));
    }
    return best;
  }

  /** Takes the beads back out of the engine. The anchors' nodes never were in it. */
  dispose(engine: PEngine2D): void {
    for (const bead of this.beads) engine.removeParticleRef(bead);
    this.start.rope = null;
    this.end.rope = null;
  }

  /**
   * Whether the chain may not move a node: a nail is a point of the stage, and an end the player is
   * dragging is in their hand — the chain has to shape itself around both.
   */
  private isFixed(node: Particle2D): boolean {
    const fixed = (anchor: Anchor): boolean => anchor.node === node && anchor.rigid;
    return fixed(this.start) || fixed(this.end);
  }

  /**
   * How far a node may be moved by a solve: a fixed end never moves, anything else moves more the
   * lighter it is — the usual inverse-mass weighting.
   */
  private mobility(node: Particle2D): number {
    if (this.isFixed(node)) return 0;
    return 1 / Math.max(node.mass, 0.05);
  }
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
