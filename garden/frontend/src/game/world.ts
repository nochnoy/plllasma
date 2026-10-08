import { DEFAULT_CHARACTER, type Character } from './characters';
import { Doll } from './doll';
import { backFrom, dollSources } from './pain';
import { beadCount, createAnchor, MAX_STRETCH, Rope, SOLVE_PASSES, type Anchor, type RopeHit } from './rope';
import type { PartMasks } from './part-mask';
import { ceilingFor, STAGE_BOTTOM, STAGE_HEIGHT, STAGE_WIDTH, visibleTop, WALL_HEIGHT, WALL_WIDTH } from './stage';
import { dollRigs, TAPE_SCALE, type TapeStage } from './tape';
import { PEngine2D } from './vm/engine';
import type { SkinPart } from './vm/extractor';

/** What a click on the stage does. The toolbar picks one of these. */
export type Tool = 'drag' | 'rope';

/**
 * Where a freshly added doll goes: the first of these spots that is clear of everything else, in
 * world pixels. They are laid out around the middle of the stage, which is where the doll the movie
 * starts with ends up. Once every spot is taken the last one is reused — dolls do not collide with
 * each other or with the blocks (the original's collision was for its balls), so overlap is only a
 * cosmetic matter.
 */
const DOLL_SPOTS: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: -160, y: -80 },
  { x: 160, y: -80 },
  { x: -160, y: 80 },
  { x: 160, y: 80 },
];
/** How far a thing has to be from a spot for it to count as free, in world pixels. */
const DOLL_CLEARANCE = 130;
/**
 * How far a spot is kept from the walls, in world pixels: half a doll, so that a doll put down there
 * is not holding on to the wall when she appears (see `freeSpot`).
 */
const SPOT_INSET = 60;
/** How close a click has to land to a rope to count as a click on it, in world pixels. */
const ROPE_GRAB_RADIUS = 8;
/** How close a click has to land to a knot for the arrow tool to take hold of it, in world pixels. */
const ANCHOR_GRAB_RADIUS = 13;
/**
 * The original's own grab test: every particle within `sqrt(1500)` world units of the pointer is taken hold of,
 * which is what makes a press on the doll pick up a handful of her rather than one joint — and what the press
 * routing reads when the tool is the arrow ({@link World.press}).
 */
const GRAB_RADIUS_SQ = 1500;
/** A rope shorter than this is not worth drawing; the second click is then simply ignored. */
const MIN_ROPE_LENGTH = 6;
/**
 * At most this many projection sweeps per step. A sweep stops as soon as every rope is inside its
 * budget, so the usual rope costs one or two; the ceiling only matters when a rope is pulled hard
 * against a doll that is being dragged the other way.
 */
const MAX_SETTLE_SWEEPS = 6;

/**
 * A unit vector along `(dx, dy)`. A rig folded onto a point has no direction at all, and a caller with
 * one is better served by *some* direction than by a NaN: that one reads as pointing right.
 */
function unit(dx: number, dy: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  return length < 1e-6 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

/**
 * One particle as a tape writes it down: where it is and where it was, four numbers together.
 *
 * Both, because Verlet's velocity *is* the difference between them — a particle put back from its position
 * alone arrives standing still — and a stage is a moment of a run rather than a picture.
 */
function placeOf(p: { x: number; y: number; oldx: number; oldy: number }): number[] {
  return [p.x, p.y, p.oldx, p.oldy];
}

/**
 * Writes places back into particles: `values` is a run of x, y, x, y, one group to a particle, and a
 * particle with no group of its own is left exactly where it is — which is what the last few numbers of a
 * rope being missing reads as, rather than as a crash.
 */
function writePlace(
  particles: readonly { x: number; y: number; oldx: number; oldy: number }[],
  values: readonly number[],
): void {
  for (let i = 0; i < particles.length; i++) {
    const x = values[i * 4];
    const y = values[i * 4 + 1];
    if (x === undefined || y === undefined) return;
    const particle = particles[i];
    particle.x = x;
    particle.y = y;
    // A place written without its previous one is a place standing still, which is what `Ball.step` and
    // `Anchor.place` mean by putting a thing down.
    particle.oldx = values[i * 4 + 2] ?? x;
    particle.oldy = values[i * 4 + 3] ?? y;
  }
}

/**
 * The stage: everything that lives on it, and the tools that put it there.
 *
 * The original movie had one doll, one engine and no notion of editing. This class is the port's own
 * layer — deliberately free of PixiJS and of Vue, so the whole of the stage can be tested in Node —
 * and it is the single source of truth the renderer draws from: `Game` routes pointers into it, and
 * `Scene` reconciles its sprites against `dolls` and draws `ropes` and `draft`.
 *
 * Adding and removing things is immediate: a doll or a rope is in the engine from the moment
 * `addDoll` / `finishRope` returns, and gone the moment `remove*` does.
 */
export class World {
  /**
   * One engine for everything: that is what lets a rope hold a doll, and a doll pull a rope.
   *
   * It is built with the *walls*, not with the world: `PEngine2D`'s box is `minx..maxx / miny..maxy`,
   * what `clampToWorld` keeps every particle inside — the rectangle the doll hits — and that rectangle
   * stands inside the picture (`WALL_MARGIN_X`/`Y` in `stage.ts`). The world is one size on every
   * screen, so the box it is born with is the box it keeps for the whole game: the widest play area
   * there is, under a ceiling `CEILING_MARGIN` (200 world pixels) over the top of the picture. How
   * much of it a
   * window shows is the renderer's own business (`stage.ts`), and no concern of the physics at all —
   * which is what makes a run recorded anywhere play back with the room it was recorded in: there is
   * only one room.
   */
  readonly engine = new PEngine2D(WALL_WIDTH, WALL_HEIGHT);
  readonly dolls: Doll[] = [];
  readonly ropes: Rope[] = [];
  /**
   * The stream the world's own randomness comes from: the times a doll's face holds. Every doll's
   * card draws from the same stream — one stream, so that there is one order of draws to reproduce
   * (see `Random` in `tape.ts`).
   *
   * It is `Math.random` until something hands over a seeded stream (`useRandom`), which is what a recording
   * does before its first step.
   */
  private random: () => number = Math.random;
  /** The rope being drawn, or null when nothing is being drawn. Its far end follows the mouse. */
  draft: Anchor | null = null;
  /** The knot the arrow tool is carrying about, or null. */
  dragged: Anchor | null = null;
  /** What the next click on the stage does. */
  tool: Tool = 'drag';
  /**
   * Alpha masks of the baked artwork, handed over by the renderer once its textures are up, keyed by
   * the folder the artwork was read from: two characters can share one sprite set, and the masks
   * belong to the artwork rather than to the character wearing it. The mask is what tells a click on
   * a part from a click on the transparent padding around it; without them (a Node test, or the first
   * frames before the textures have loaded) the artwork box decides.
   */
  private readonly masks = new Map<string, PartMasks>();

  constructor() {
    // The box the engine is born with has no ceiling of its own — the picture's top edge is not one, and
    // the port's stands 200 pixels above it (`CEILING_MARGIN` in `stage.ts`), over the top of
    // the one-and-only view of the world. The floor and the sides it does have: they are the widest play
    // area there is (see `WALL_MARGIN_X`/`Y` in `stage.ts`), and they never move again.
    this.engine.setCeiling(ceilingFor(visibleTop(STAGE_HEIGHT)));
  }

  /** Called by {@link Scene} with the alpha of every part of one character's artwork. */
  setPartMasks(folder: string, masks: PartMasks): void {
    this.masks.set(folder, masks);
  }

  /**
   * Hands the world the stream its own randomness comes from, and every doll on the stage with it.
   *
   * One stream for the lot of them rather than one each, and for one reason: a recording's weather
   * has one seed to its name, and what a run draws is the *order* of the draws. A recording seeds the
   * stream before its first step, which is what makes two recordings of the same session two runs.
   */
  useRandom(random: () => number): void {
    this.random = random;
    for (const doll of this.dolls) doll.useRandom(random);
  }

  // ------------------------------------------------------------------ editing

  /**
   * Puts another doll on the stage, dressed in a character's artwork. Returns null when the engine
   * has no room left for a rig.
   *
   * The spot comes first and the character last because a *where* is what a caller that only wants a
   * rig to play with has in mind (the toolbar's own "add her" takes a character, the tests take a
   * point), and every doll is a doll of the movie's own rig either way.
   */
  addDoll(
    offset: { x: number; y: number } = this.freeSpot(DOLL_SPOTS, DOLL_CLEARANCE),
    character: Character = DEFAULT_CHARACTER,
  ): Doll | null {
    const doll = Doll.spawn(this.engine, offset, character, this.random);
    if (!doll) return null;
    this.dolls.push(doll);
    return doll;
  }

  /**
   * Removes a doll and everything tied to it: a rope fastened to a doll has nothing left to hang
   * from, so it goes with the doll instead of dangling in mid-air.
   */
  removeDoll(doll: Doll): void {
    for (const rope of this.ropes.filter((candidate) => candidate.touches(doll))) this.removeRope(rope);
    doll.dispose(this.engine);
    const index = this.dolls.indexOf(doll);
    if (index >= 0) this.dolls.splice(index, 1);
  }

  removeRope(rope: Rope): void {
    rope.dispose(this.engine);
    const index = this.ropes.indexOf(rope);
    if (index >= 0) this.ropes.splice(index, 1);
  }

  /** Puts every doll back in its authored pose. */
  respawn(): void {
    for (const doll of this.dolls) doll.respawn();
  }

  // --------------------------------------------------------------------- tape

  /**
   * The whole stage as a snapshot writes it down (`TapeStage`): the engine's own numbers, then every
   * doll with her rig and her face, and the ropes on the stage.
   *
   * Where the physics reads a velocity out of a particle, both of its positions are written down — `x`,
   * `y` and the `oldx`/`oldy` before them — because a stage put back standing still is not the stage that
   * was there: a doll recorded in mid-fall and put back with no velocity falls differently from the one
   * that was recorded, and this stage is the player's own world being put aside as much as a tape's
   * opening moment.
   *
   * Two things are deliberately *not* in it: the tool, the pointer and the knot in hand — which are the
   * player's own doing — and the artwork's alpha masks, which are the renderer's and the same on both
   * sides of a playback.
   */
  snapshot(): TapeStage {
    return {
      engine: {
        speed: this.engine.speed,
        gravity: this.engine.gravity,
        fric: this.engine.fric,
        clamp: this.engine.clampToWorldEnabled,
      },
      dolls: this.dolls.map((doll) => ({
        id: doll.character.id,
        name: doll.character.name,
        folder: doll.character.folder,
        // One doll at a time, in the stage's own order: a rig is written down whole, doll by doll.
        rig: dollRigs([doll]),
        pain: doll.pain.state(),
      })),
      ropes: this.ropes.map((rope) => ({
        knots: [...placeOf(rope.start.node), ...placeOf(rope.end.node)],
        beads: rope.beads.flatMap((bead) => placeOf(bead)),
      })),
    };
  }

  /**
   * Puts the stage back as a snapshot wrote it down: everything on it now is taken off, the engine's
   * numbers are set, and then the stage is built again out of it — dolls and ropes, each of them with
   * both of its positions.
   *
   * The order is not arbitrary. A rope is *tied* rather than remembered, so it is built the way the
   * player's own clicks built it: the dolls have to be standing where they were before a knot can be
   * resolved to the part it was tied to (`createAnchor`). Everything else about the order is the
   * stage's own — a doll is picked before the one drawn over her.
   *
   * A stage that does not fit is not an error but a shortcoming of the engine, which has a particle budget
   * for the whole stage (`PEngine2D.MAXPARTICLES`): what does not fit is left out, exactly as it would have
   * been had the player asked for it by hand.
   */
  restore(stage: TapeStage): void {
    for (const rope of [...this.ropes]) this.removeRope(rope);
    for (const doll of [...this.dolls]) this.removeDoll(doll);
    this.draft = null;
    this.dragged = null;

    this.engine.speed = stage.engine.speed;
    this.engine.gravity = stage.engine.gravity;
    this.engine.fric = stage.engine.fric;
    this.engine.clampToWorldEnabled = stage.engine.clamp;
    // The hold is the pointer's, not the stage's.
    this.engine.onHold = null;

    for (const state of stage.dolls) {
      const doll = this.addDoll({ x: 0, y: 0 }, { id: state.id, name: state.name, folder: state.folder });
      if (!doll) break;
      writePlace(doll.particles, state.rig);
      doll.pain.load(state.pain);
    }
    for (const state of stage.ropes) {
      const knots = state.knots;
      if (knots.length < 8) continue;
      const start = createAnchor(knots[0], knots[1], this.hitRopeHolder(knots[0], knots[1]));
      const end = createAnchor(knots[4], knots[5], this.hitRopeHolder(knots[4], knots[5]));
      const distance = Math.hypot(end.node.x - start.node.x, end.node.y - start.node.y);
      if (distance < MIN_ROPE_LENGTH) continue;
      if (this.engine.particles.length + beadCount(start, end) > PEngine2D.MAXPARTICLES) break;
      const rope = new Rope(this.engine, start, end);
      this.ropes.push(rope);
      writePlace([start.node], knots.slice(0, 4));
      writePlace([end.node], knots.slice(4, 8));
      writePlace(rope.beads, state.beads);
    }
  }

  /**
   * Puts a row of a tape into the world: every doll's joints, and the face on every card — the whole
   * of one step of a playback, arriving as the numbers the recorder wrote (`dollRow`).
   *
   * The positions are written whole, and written *still* — `oldx`/`oldy` with them — because nothing
   * about a playback ever reads a velocity: the physics is the game's own and a tape is only its
   * picture. A row shorter than the stage is a file that lied about its cast, and what it does not
   * cover is left as it stands rather than torn apart by half a doll's worth of numbers.
   */
  writePose(row: readonly number[]): void {
    let at = 0;
    for (const doll of this.dolls) {
      for (const particle of doll.particles) {
        const x = row[at++];
        const y = row[at++];
        if (x === undefined || y === undefined) return;
        particle.x = x / TAPE_SCALE;
        particle.y = y / TAPE_SCALE;
        particle.oldx = particle.x;
        particle.oldy = particle.y;
      }
      const face = row[at++];
      if (face === undefined) return;
      doll.pain.wear(face);
    }
  }

  // -------------------------------------------------------------------- ropes

  /**
   * The first click of the rope tool: the rope is nailed — or tied to what was under the click —
   * where the player clicked, and from there on it is drawn out to the mouse until the second click
   * fixes it.
   */
  startRope(x: number, y: number): void {
    this.cancelRope();
    const point = this.onStage(x, y);
    this.draft = createAnchor(point.x, point.y, this.hitRopeHolder(point.x, point.y));
  }

  /**
   * The second click of the rope tool. The rope gets the length between the two clicks and both ends
   * stay exactly where they were clicked, so what the player drew is what they get. A click landing
   * on top of the first one is ignored — there would be no rope to speak of — and the draft stays
   * open for a proper second click.
   */
  finishRope(x: number, y: number): Rope | null {
    const start = this.draft;
    if (!start) return null;
    const point = this.onStage(x, y);
    const end = createAnchor(point.x, point.y, this.hitRopeHolder(point.x, point.y));
    const distance = Math.hypot(end.node.x - start.node.x, end.node.y - start.node.y);
    if (distance < MIN_ROPE_LENGTH) return null;
    if (this.engine.particles.length + beadCount(start, end) > PEngine2D.MAXPARTICLES) return null;
    this.draft = null;
    const rope = new Rope(this.engine, start, end);
    this.ropes.push(rope);
    return rope;
  }

  /** Throws away a rope that is only half drawn. */
  cancelRope(): void {
    this.draft = null;
  }

  // ----------------------------------------------------------------- the hand

  /**
   * A press on the stage at (`x`, `y`), routed by the tool in the player's hand: the rope tool lays one end of
   * a rope or ties the whole of it — and takes a rope away by the middle of its cord, the same press the
   * arrow takes one away with — and the arrow takes hold of a knot first, and only then the particles of the
   * doll, the original's own `onMouseDown`, which held every particle within `sqrt(1500)` of the point.
   *
   * The taking-away is both tools' own click rather than a bin to be picked first, because taking a rope
   * away is a thing done *with* a rope: whichever of the two the player is holding, a press on the middle of
   * a cord burns that rope away ({@link burnRopeAt}), and the tool stays in the player's hand either way
   * (`Scene.syncCursor` draws the cursor to match).
   *
   * The *ends* of a rope are not the rope's: a press near one is a press on the knot hanging there, which is
   * something the player can take hold of and carry, so those stay the knot's own (see `Rope.middleDistance`).
   * In the rope tool's own hand a burn comes first even while a rope is only half drawn: the draft stays
   * open for its second click, and the press spent itself on the rope under it.
   *
   * It belongs to the world rather than to the game because everything a press *does* is the world's own: the
   * tools, the picking, the hold, and the taking away. What the game adds is only where the pointer is, which is
   * a screen point brought into the world — and that is the one part of a press a tape can carry directly, so a
   * playback presses through this same door (`Game.replay`).
   *
   * Returns the rope the press took off the stage, so that the renderer can burst it where it stood, or null
   * when nothing was taken away — which is every press that ends in a hold, and every press on bare sky.
   */
  press(x: number, y: number): Rope | null {
    this.engine.mouseX = x;
    this.engine.mouseY = y;

    if (this.tool === 'rope') {
      const burned = this.burnRopeAt(x, y);
      if (burned) return burned;
      if (this.draft) this.finishRope(x, y);
      else this.startRope(x, y);
      return null;
    }

    const burned = this.burnRopeAt(x, y);
    if (burned) return burned;
    if (this.grabAnchor(x, y)) return null;
    this.engine.onHold = this.engine.particles.filter(
      (p) => (x - p.x) ** 2 + (y - p.y) ** 2 < GRAB_RADIUS_SQ,
    );
    return null;
  }

  /**
   * The pointer moved to (`x`, `y`): the original's `_xmouse`/`_ymouse` follow it, and a knot in the player's
   * hand comes with it — as far as its rope allows (`Anchor.dragTo`). A knot can be carried about while the world
   * is paused, which is why this is the pointer's doing rather than a step's.
   */
  moveTo(x: number, y: number): void {
    this.engine.mouseX = x;
    this.engine.mouseY = y;
    this.dragAnchorTo(x, y);
  }

  /**
   * The pointer let go at (`x`, `y`): a knot in hand is pinned exactly where it was dropped, and is tied to
   * whatever is under that spot — a body part, a stone's face, or the bare stage.
   */
  releaseAt(x: number, y: number): void {
    this.dropAnchor(x, y);
    this.engine.onHold = null;
  }

  /**
   * Where the rope being drawn currently reaches: the mouse, pulled onto the stage exactly like a
   * click would be, so the preview shows the rope the player is about to get.
   */
  draftEnd(): { x: number; y: number } {
    return this.onStage(this.engine.mouseX, this.engine.mouseY);
  }

  // -------------------------------------------------------------------- knots

  /**
   * The knot under a point, if the point is close enough to one — the ends of the ropes, in drawing
   * order. Both ends of every rope are pickable, tied or nailed: the arrow tool takes hold of one
   * here, and {@link dropAnchor} puts it down again.
   */
  pickAnchor(x: number, y: number): Anchor | null {
    let best: Anchor | null = null;
    let bestDistance = ANCHOR_GRAB_RADIUS;
    for (const rope of this.ropes) {
      for (const anchor of [rope.start, rope.end]) {
        const distance = Math.hypot(anchor.node.x - x, anchor.node.y - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = anchor;
        }
      }
    }
    return best;
  }

  /**
   * The arrow tool pressing on a knot: from here the knot follows the mouse (as far as its rope
   * allows) instead of the pointer grabbing the doll. Returns whether a knot was taken hold of.
   */
  grabAnchor(x: number, y: number): boolean {
    const anchor = this.pickAnchor(x, y);
    if (!anchor) return false;
    anchor.dragging = true;
    this.dragged = anchor;
    return true;
  }

  /**
   * Moves the knot in hand to a point of the stage, as far as its rope allows. Called from the
   * pointer rather than from the simulation, so a knot can be carried about while the game is paused.
   */
  dragAnchorTo(x: number, y: number): void {
    const anchor = this.dragged;
    if (!anchor) return;
    const point = this.onStage(x, y);
    anchor.dragTo(point.x, point.y);
  }

  /**
   * Lets go of a knot: it is pinned exactly where it was dropped and becomes part of whatever is
   * under that spot — a body part, or the bare stage.
   */
  dropAnchor(x: number, y: number): void {
    const anchor = this.dragged;
    if (!anchor) return;
    this.dragged = null;
    anchor.dragging = false;
    const point = this.onStage(x, y);
    const hit = this.hitRopeHolder(point.x, point.y);
    anchor.dragTo(point.x, point.y);
    anchor.tie(hit?.holder ?? null, hit?.partners ?? []);
    // Settle the chain onto its new knot at once. A knot can be let go of a long way from where its
    // beads are, and the frame after the drop should not be the one where the rope is seen catching
    // up with itself.
    const rope = anchor.rope;
    if (rope) this.settleRope(rope);
  }

  /** The knot the renderer should light up: the one in hand, or the one the arrow tool could take. */
  hoverAnchor(): Anchor | null {
    if (this.dragged) return this.dragged;
    if (this.tool !== 'drag') return null;
    return this.pickAnchor(this.engine.mouseX, this.engine.mouseY);
  }

  /**
   * The rope under the pointer that a press would take away: the one whose *middle* is under it, and
   * nothing at all while a knot is in hand — a click that is already carrying something spends itself on
   * putting that down. Both tools are offered it alike (`World.press`), so the renderer draws the
   * crosshair to match (`Scene.syncCursor`).
   */
  hoverRope(): Rope | null {
    if (this.dragged) return null;
    if (this.tool !== 'drag' && this.tool !== 'rope') return null;
    return this.pickRopeMiddle(this.engine.mouseX, this.engine.mouseY);
  }

  // ------------------------------------------------------------------ picking

  /**
   * What a rope end can be tied to under a point: a doll's body part, or nothing at all.
   */
  hitRopeHolder(x: number, y: number): RopeHit | null {
    const hit = this.hitDoll(x, y);
    if (hit) return { holder: hit.doll, partners: [hit.part.p1, hit.part.p2] };
    return null;
  }

  /** The doll part under a point: topmost doll first, topmost part first. */
  hitDoll(x: number, y: number): { doll: Doll; part: SkinPart } | null {
    for (let i = this.dolls.length - 1; i >= 0; i--) {
      const doll = this.dolls[i];
      const part = doll.hitTest(x, y, this.masks.get(doll.character.folder) ?? null);
      if (part) return { doll, part };
    }
    return null;
  }

  /** The rope under a point, if the point lands close enough to the drawn chain. */
  pickRope(x: number, y: number): Rope | null {
    let best: Rope | null = null;
    let bestDistance = ROPE_GRAB_RADIUS;
    for (const rope of this.ropes) {
      const distance = rope.distanceTo(x, y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rope;
      }
    }
    return best;
  }

  /**
   * The rope whose *middle* is under a point, if the point lands close enough to the cord: the rope a
   * press there takes away ({@link burnRopeAt}). A point on either end of a rope is not on this, however
   * close it is to the drawing — those are where the knots hang, and the knots are the player's to take
   * hold of (`Rope.middleDistance`).
   */
  private pickRopeMiddle(x: number, y: number): Rope | null {
    let best: Rope | null = null;
    let bestDistance = ROPE_GRAB_RADIUS;
    for (const rope of this.ropes) {
      const distance = rope.middleDistance(x, y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rope;
      }
    }
    return best;
  }

  /**
   * Lays a doll out on the floor of the room, on her back: her whole rig strung along the line the walls'
   * floor is, head one way and feet the other, with her arms folded down her body.
   *
   * Nothing here is left to the physics, and that is the point of it. A doll *dropped* on the floor lands
   * in whatever shape the fall leaves her in — one leg folded under her and the other out to the side,
   * which reads as a woman sitting rather than lying — and a doll *turned* onto the floor and let go
   * settles into the shape a rig with no thickness can lie in: every joint on one line, because that is
   * where gravity and the floor put them. The line is where she is laid, and the drawing of her is what
   * has thickness (see {@link Scene} and `docs/assets.md`), so it is the drawing that turns a line into a
   * woman lying on it.
   *
   * The layout is the rig's own: every bone is kept at the length the movie authored it with and laid
   * along the floor, in the order the rig runs — the pelvis in the middle, the spine towards the head, the
   * legs and the arms towards the feet — so every constraint in the engine is satisfied before the first
   * frame ('da' is zero at every joint: a straight spine and straight limbs are angles this rig allows).
   * A doll laid out this way does not move at all: gravity pulls each joint below the floor line, the
   * clamp holds it there, and neither the solver nor the clock has anything left to add.
   *
   * Where the line runs — which way her head ends up — is her own back rather than the screen
   * ({@link backOf}): a quarter turn from there puts her back down and her face up whichever way the rig
   * happens to be drawn.
   *
   * Her arms are part of the same layout: each is strung out from the neck the way her body runs, towards
   * her feet, and the two of them land on top of one another — which is what a side view of her lying
   * looks like, since `arm2` and `hand2` are the last two parts of the skin table and are drawn over her
   * own torso (the near arm) where `arm1` and `hand1` are the first two and are drawn under it (the far
   * one).
   *
   * None of it goes through {@link step}: this is setting a scene rather than playing one, so nothing
   * reaches the clocks — no pain is read into her card, and the first frame the player sees is her own
   * first frame. Both positions of every particle are written, so the laying out is a placement and not a
   * throw (Verlet reads a velocity out of where a particle *was*).
   */
  layDown(doll: Doll): void {
    // Her rig, joint by joint: the spine, both legs and both arms.
    const rig = doll.joints(
      'head', 'neck', 'stomach', 'pants',
      'knee1', 'foot1', 'knee2', 'foot2',
      'arm1', 'hand1', 'arm2', 'hand2',
    );
    if (!rig) return;
    const [head, neck, stomach, pants, knee1, foot1, knee2, foot2, arm1, hand1, arm2, hand2] = rig;
    const floor = this.engine.maxy;
    const back = backFrom(pants, neck);
    const turn = Math.PI / 2 - Math.atan2(back.y, back.x);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const up = unit(neck.x - pants.x, neck.y - pants.y);
    // Her own axis, turned onto the floor: the way her head lies is `along`, her feet the other way.
    const along = { x: up.x * cos - up.y * sin, y: up.x * sin + up.y * cos };
    // Every bone of the rig, and the way it runs: the spine from the pelvis towards the head, everything
    // else — legs and arms — towards the feet. Each starts where the one before it ended, so the order is
    // the rig's own, and the arms hang off the neck a bone at a time.
    const bones = [
      { from: pants, to: stomach, way: 1 },
      { from: stomach, to: neck, way: 1 },
      { from: neck, to: head, way: 1 },
      { from: pants, to: knee1, way: -1 },
      { from: knee1, to: foot1, way: -1 },
      { from: pants, to: knee2, way: -1 },
      { from: knee2, to: foot2, way: -1 },
      { from: neck, to: arm1, way: -1 },
      { from: arm1, to: hand1, way: -1 },
      { from: neck, to: arm2, way: -1 },
      { from: arm2, to: hand2, way: -1 },
    ];
    // Their lengths are read out of the pose she is in *before* anything is placed: a walk that measured
    // each bone as it went along would be measuring its own work.
    const lengths = bones.map((bone) => Math.hypot(bone.to.x - bone.from.x, bone.to.y - bone.from.y));
    pants.y = floor;
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      bone.to.x = bone.from.x + along.x * lengths[i] * bone.way;
      bone.to.y = floor;
    }
    // Centred on the stage rather than on wherever the rig was authored, on the floor line, and at rest.
    let middle = 0;
    for (const p of doll.particles) middle += p.x;
    middle /= Math.max(1, doll.particles.length);
    for (const p of doll.particles) {
      p.x -= middle;
      p.y = floor;
      p.oldx = p.x;
      p.oldy = p.y;
    }
  }

  // --------------------------------------------------------------- simulation

  /**
   * One simulation step: the movie's own engine first, then the ropes.
   *
   * With no ropes on the stage this is exactly `engine.update(elapsedMs)`, so the doll falls the way
   * the original's trace data says she does. Everything after that is the port's own: the ropes have
   * the last word — relaxed onto their rest length, then rectified so that no link ends the step more
   * than 5% long, then pulled shut at the ends so that a taut rope drags whatever is on both of them.
   *
   * One more thing is stepped here, and it is not physics: every doll's own face (`pain-state.ts`) is
   * advanced by the same elapsed time, reading the pose the step just left her in. It lives here rather
   * than in the renderer because it is a clock, and a clock in the renderer would tick with the display
   * rather than with the world — and because this way the whole of it is testable in Node.
   *
   * The faces are read **last**, after the ropes have had their say: what the painter draws is the pose
   * this step settled on, and a card has to be about the doll the player is looking at rather than
   * about the doll as she was before this step's rope pulled her. A step's worth of solving is small,
   * but a pose held still under a rope would otherwise be read one solve behind for as long as the
   * player holds it — and with the world paused nothing would ever catch up (see {@link observe}).
   *
   * The clock is what has to arrive here. A machine *re-read* with no time at all — `observe` — follows
   * a pose but cannot let go of one: every face it holds is held for a while (`pain-state.ts` counts the
   * seconds of an arrival, a break, a held extreme), so a world that only ever observed would leave her
   * wearing the last face anything gave her for good. See `tests/pain-state.test.ts`, which asks for a
   * face to come back after the trouble has passed.
   */
  step(elapsedMs: number): void {
    this.engine.update(elapsedMs);
    if (this.dragged) this.dragAnchorTo(this.engine.mouseX, this.engine.mouseY);
    if (this.ropes.length > 0) {
      for (let pass = 0; pass < SOLVE_PASSES; pass++) {
        for (const rope of this.ropes) rope.relax();
      }
      for (let sweep = 0; sweep < MAX_SETTLE_SWEEPS; sweep++) {
        let worst = 0;
        for (const rope of this.ropes) {
          rope.relax();
          worst = Math.max(worst, rope.capEnds(), rope.capLinks());
        }
        if (worst <= MAX_STRETCH) break;
      }
    }
    for (const doll of this.dolls) doll.pain.step(dollSources(doll), elapsedMs);
  }

  /**
   * Reads every doll's pose into her own face **without advancing its clock** — all a *paused* world does
   * (`Game.frame`), where nothing about a pose is stepped.
   *
   * Stepping a machine by nothing is not a no-op: it re-reads the pose, so a doll moved or posed while
   * the world is standing still — put back in her authored pose, put down on the stage, or taken hold of
   * and dragged along the floor — wears the face that pose is worth at once. Without this the world would
   * hold still while the pose was re-read all the same, and the card would be stuck on a face from before
   * the pause: a machine nothing re-reads stays on the last face anything gave it, however the player
   * poses her afterwards.
   *
   * It is a *reading* and not a step: no second of anything passes here, which is exactly why a world
   * that keeps stepping has to hand the machines their time through {@link step} instead.
   */
  observe(): void {
    for (const doll of this.dolls) doll.pain.step(dollSources(doll), 0);
  }

  /** The worst stretch any rope is under, as a ratio of its rest length (1 = unstretched). */
  longestStretch(): number {
    let worst = 0;
    for (const rope of this.ropes) worst = Math.max(worst, rope.maxStretch());
    return worst;
  }

  // ------------------------------------------------------------------ private

  /**
   * The arrow taking a rope off the stage: a press on the middle of a rope's cord burns the whole rope
   * away — the chain and its links with it, and both knots — and the rope is handed back so that the
   * renderer can burst it where it stood (`Scene.popRope`).
   *
   * Only the *middle* counts, so the ends stay the knots' own ground and the arrow keeps both of its jobs
   * on one rope: the knot under a press is picked up, the cord under it is taken away. A press that misses
   * every rope's middle takes nothing away and returns null, which is the signal that the press is still
   * free to become a hold.
   *
   * The doll is not something a click can take away at all: she is not something the player put on the
   * stage, she is the game, and a press on her is the press that takes hold of her.
   */
  private burnRopeAt(x: number, y: number): Rope | null {
    const rope = this.pickRopeMiddle(x, y);
    if (!rope) return null;
    this.removeRope(rope);
    return rope;
  }

  /**
   * Runs one rope to the shape it should be in: repeated sweeps of relaxation with the ends capped
   * and the links rectified, the same thing a step does, but as many times as it takes. This is for
   * the moments a rope is *placed* — a knot let go of, somewhere its beads are not — rather than for
   * the per-step solving, which has a budget of its own.
   */
  private settleRope(rope: Rope): void {
    const sweeps = rope.nodes.length + MAX_SETTLE_SWEEPS;
    for (let sweep = 0; sweep < sweeps; sweep++) {
      for (let pass = 0; pass < SOLVE_PASSES; pass++) rope.relax();
      if (Math.max(rope.capEnds(), rope.capLinks()) <= MAX_STRETCH) break;
    }
  }

  /**
   * A click brought onto the picture.
   *
   * The canvas is as big as the window, so a click can land in the letterbox around the hall, and what
   * the window shows is not the whole picture on a small screen either: a click in the band of scenery
   * outside the walls is outside the play area too. Neither is a reason to lose the click — the walls
   * are where the *doll* is kept, and a rope is the player's own drawing, so a knot may be nailed
   * anywhere the player can see: on the scenery, above the walls, up in the air (see
   * `Particle2D.clamped`, which is what keeps `clampToWorld` from dragging it back). What is left over
   * is the letterbox itself, out of sight behind the black, and a click out there is brought onto the
   * edge of what is drawn, since a knot where nothing is drawn would look like no knot at all.
   */
  private onStage(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.min(Math.max(x, -STAGE_WIDTH / 2), STAGE_WIDTH / 2),
      y: Math.min(Math.max(y, STAGE_BOTTOM - STAGE_HEIGHT), STAGE_BOTTOM),
    };
  }

  /** The first spot of a list that nothing else is standing on, pulled inside the walls of the room. */
  private freeSpot(spots: readonly { x: number; y: number }[], clearance: number): { x: number; y: number } {
    const occupied = (x: number, y: number): boolean => {
      const near = (other: { x: number; y: number }): boolean => Math.hypot(other.x - x, other.y - y) < clearance;
      return this.dolls.some((doll) => near(doll.centre));
    };
    const wall = Math.max(this.engine.maxx - SPOT_INSET, 0);
    const inside = (spot: { x: number; y: number }): { x: number; y: number } => ({
      x: Math.min(Math.max(spot.x, -wall), wall),
      y: spot.y,
    });
    for (const spot of spots) if (!occupied(spot.x, spot.y)) return inside(spot);
    return inside(spots[spots.length - 1]);
  }
}

