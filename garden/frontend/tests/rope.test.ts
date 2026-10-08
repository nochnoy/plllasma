import { describe, expect, it } from 'vitest';
import type { Doll } from '../src/game/doll';
import { END_SEGMENTS, MAX_STRETCH, type Rope, SEGMENT_LENGTH } from '../src/game/rope';
import { STAGE_HEIGHT, STAGE_WIDTH, WALL_HEIGHT } from '../src/game/stage';
import { World } from '../src/game/world';

/**
 * The ropes are the port's own feature, so there is no SWF trace to check them against — what can
 * be checked is the handful of promises the player was given: a rope is a chain of ten-pixel
 * segments, it keeps the length it was drawn with (5% of give, no more), it sags when nothing pulls
 * on it, and an end tied to the doll holds her.
 *
 * The world is plain TypeScript, so all of this runs in Node with no browser in sight.
 */

/** The game runs fixed 20 ms steps. */
function run(world: World, ms: number): void {
  const steps = Math.round(ms / 20);
  for (let i = 0; i < steps; i++) world.step(20);
}

/** Draws a rope between two points with the world's own rope-tool calls. */
function tie(world: World, from: [number, number], to: [number, number]): Rope | null {
  world.startRope(from[0], from[1]);
  return world.finishRope(to[0], to[1]);
}

/** The middle of a body part's bone, which is where its artwork box is centred. */
function partCentre(doll: Doll, index: number): { x: number; y: number } {
  const part = doll.skin[index];
  return { x: (part.p1.x + part.p2.x) / 2, y: (part.p1.y + part.p2.y) / 2 };
}

/** Height of the whole stage's centre of mass — the number the smoke test watches fall. */
function centreOfMassY(world: World): number {
  let mass = 0;
  let y = 0;
  for (const p of world.engine.particles) {
    mass += p.mass;
    y += p.mass * p.y;
  }
  return mass === 0 ? 0 : y / mass;
}

describe('rope', () => {
  it('is a chain of ten-pixel segments exactly as long as it was drawn', () => {
    const world = new World();
    const rope = tie(world, [-100, 0], [100, 0]);
    expect(rope).not.toBeNull();
    expect(rope?.segments.length).toBe(20);
    expect(rope?.nodes.length).toBe(21);
    expect(rope?.restLength).toBeCloseTo(SEGMENT_LENGTH, 6);
    expect(rope?.length).toBeCloseTo(200, 6);
    // Both ends stay exactly where they were clicked.
    expect(rope?.start.node.x).toBe(-100);
    expect(rope?.start.node.y).toBe(0);
    expect(rope?.end.node.x).toBe(100);
    expect(rope?.end.node.y).toBe(0);
  });

  it('rounds the segment count so that the length is the one that was drawn', () => {
    const world = new World();
    const rope = tie(world, [0, 0], [0, 95]);
    expect(rope?.segments.length).toBe(10);
    expect(rope?.length).toBeCloseTo(95, 6);
    expect(Math.abs((rope?.restLength ?? 0) - SEGMENT_LENGTH)).toBeLessThan(SEGMENT_LENGTH / 2);
  });

  it('needs two separate clicks: a half-drawn rope can be abandoned', () => {
    const world = new World();
    world.startRope(-100, -100);
    expect(world.draft).not.toBeNull();
    expect(world.ropes).toHaveLength(0);
    expect(world.engine.particles).toHaveLength(0);
    // A second click on top of the first would make no rope, so it is ignored and the draft stays.
    expect(world.finishRope(-100, -100)).toBeNull();
    expect(world.draft).not.toBeNull();
    world.cancelRope();
    expect(world.draft).toBeNull();
    expect(world.engine.particles).toHaveLength(0);
  });

  it('nails a click anywhere in the picture, and one outside it onto its edge', () => {
    // The walls are where the doll is kept, not where a rope has to go: a knot may be nailed out in the
    // scenery around them, above them, or up in the air — the picture is the frame the player can see,
    // and a click past even that (the letterbox the window leaves) is brought onto the picture's edge,
    // since a knot where nothing is drawn would look like no knot at all.
    const world = new World();
    // Above the walls, which is still well inside the picture: the ceiling of the play area is above
    // the picture altogether, so what a click can reach and what the doll can reach are
    // not the same thing at all (`World.onStage` clamps to the picture, `clampToWorld` to the ceiling).
    world.startRope(world.engine.minx - 40, -WALL_HEIGHT / 2 - 40);
    expect(world.draft?.node.x).toBe(world.engine.minx - 40);
    expect(world.draft?.node.y).toBe(-WALL_HEIGHT / 2 - 40);
    world.cancelRope();

    world.startRope(-500, 400);
    expect(world.draft?.node.x).toBe(-STAGE_WIDTH / 2);
    expect(world.draft?.node.y).toBe(STAGE_HEIGHT / 2);
    const rope = world.finishRope(500, -400);
    expect(rope?.end.node.x).toBe(STAGE_WIDTH / 2);
    expect(rope?.end.node.y).toBe(-STAGE_HEIGHT / 2);
  });

  it('leaves a knot where it was nailed, walls or no walls', () => {
    // The chain of a rope is not the body: nothing drags a knot back inside the box the doll is kept in,
    // so a rope slung from the scenery above the walls stays slung there — and a bead of it is under no
    // obligation to the ceiling either, which is what lets a rope be drawn up out of the picture.
    const world = new World();
    // Above the walls — their own top is `WALL_HEIGHT / 2` — and inside the picture, which is the strip a
    // knot can actually be nailed in: the ceiling is further up than a click reaches.
    const above = -WALL_HEIGHT / 2 - 60;
    const rope = tie(world, [-200, above], [200, above]) as Rope;
    expect(rope).not.toBeNull();
    run(world, 1000);
    for (const node of rope.nodes) expect(node.y).toBeLessThan(world.engine.maxy);
    expect(rope.start.node.y).toBe(above);
    expect(rope.end.node.y).toBe(above);
  });
});

describe('rope ends', () => {
  it('ties itself to the doll when the click lands on her body', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 });
    expect(doll).not.toBeNull();
    const chest = partCentre(doll as Doll, 4);
    world.startRope(chest.x, chest.y);
    expect(world.draft?.holder).toBe(doll);
    expect(world.draft?.nailed).toBe(false);

    const rope = world.finishRope(-220, 150);
    expect(rope?.start.holder).toBe(doll);
    expect(rope?.end.holder).toBeNull();
    expect(rope?.end.nailed).toBe(true);
    // The knot is glued to the bone by two ties, one to each joint of the part.
    expect(rope?.start.ties).toHaveLength(2);
    // Empty sky is just a nail in the stage.
    expect(world.hitRopeHolder(-270, 190)).toBeNull();
  });

  it('holds the doll up instead of letting her drop to the floor', () => {
    const free = new World();
    free.addDoll({ x: 0, y: 0 });
    run(free, 3000);

    const held = new World();
    const doll = held.addDoll({ x: 0, y: 0 }) as Doll;
    const chest = partCentre(doll, 4);
    const rope = tie(held, [0, -180], [chest.x, chest.y]);
    expect(rope?.start.nailed).toBe(true);
    expect(rope?.end.holder).toBe(doll);

    let worst = 0;
    for (let i = 0; i < 150; i++) {
      held.step(20);
      worst = Math.max(worst, held.longestStretch());
    }
    expect(worst).toBeLessThanOrEqual(MAX_STRETCH + 1e-9);
    // The far end is on the chain, so it can never be further from the nail than the chain is long.
    const nail = rope?.start.node as { x: number; y: number };
    const knot = rope?.end.node as { x: number; y: number };
    expect(Math.hypot(knot.x - nail.x, knot.y - nail.y)).toBeLessThanOrEqual(
      (rope?.length ?? 0) * MAX_STRETCH + 1e-6,
    );
    // And she hangs: the free doll is lying on the floor of the world.
    expect(centreOfMassY(held)).toBeLessThan(centreOfMassY(free) - 40);
  });

  it('sags once the tension drops', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const chest = partCentre(doll, 4);
    const rope = tie(world, [0, -180], [chest.x, chest.y]) as Rope;

    // Drag her right up under the nail with the engine's own grab: the rope now has slack, and a
    // chain longer than the distance between its ends cannot help but hang.
    world.engine.onHold = doll.particles.filter((p) => Math.hypot(p.x - chest.x, p.y - chest.y) < 90);
    world.engine.mouseX = 0;
    world.engine.mouseY = -120;
    run(world, 2000);

    const nodes = rope.nodes;
    const endsY = Math.max(nodes[0].y, nodes[nodes.length - 1].y);
    const deepest = Math.max(...nodes.map((node) => node.y));
    expect(deepest).toBeGreaterThan(endsY + 10);
    // Sag is geometry, not stretch: the chain still measures what it was drawn at.
    expect(rope.measuredLength()).toBeLessThanOrEqual(rope.length * MAX_STRETCH);
    expect(rope.measuredLength()).toBeGreaterThan(rope.length * 0.9);
    world.engine.onHold = null;
  });

  it('refuses to give more than five percent, even when she is yanked across the stage', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const chest = partCentre(doll, 4);
    const rope = tie(world, [-260, -180], [chest.x, chest.y]) as Rope;

    world.engine.onHold = [...doll.particles];
    world.engine.mouseX = 260;
    world.engine.mouseY = 180;
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      world.step(20);
      worst = Math.max(worst, rope.maxStretch());
    }
    expect(worst).toBeLessThanOrEqual(MAX_STRETCH + 1e-9);
    expect(rope.measuredLength()).toBeLessThanOrEqual(rope.length * MAX_STRETCH);
    world.engine.onHold = null;
  });
});

describe('a rope a press can take away by', () => {
  it('is its cord between the knots, without the links that are the ends\u2019 own', () => {
    const world = new World();
    const rope = tie(world, [-100, 0], [100, 0]) as Rope;
    const knot = rope.start.node;
    // The drawing is right there under a press on the knot...
    expect(rope.distanceTo(knot.x, knot.y)).toBe(0);
    // ...but the knot is not the rope's middle: the links either side of it belong to the end, which is
    // what the arrow takes hold of, so the rope's own body only starts that far in.
    expect(rope.middleDistance(knot.x, knot.y)).toBeCloseTo(END_SEGMENTS * SEGMENT_LENGTH, 6);
  });

  it('is right under a press on the cord between the knots', () => {
    const world = new World();
    const rope = tie(world, [-100, 0], [100, 0]) as Rope;
    const middle = rope.nodes[Math.floor(rope.nodes.length / 2)];
    expect(rope.middleDistance(middle.x, middle.y)).toBe(0);
  });

  it('is the whole of a rope too short to have a body of its own', () => {
    const world = new World();
    const rope = tie(world, [-9, 0], [9, 0]) as Rope;
    // Two links, and two is what each end would take: a rope keeps as many links as it can spare, so
    // what is left of this one is its middle — a press on its knot is a press on the rope itself.
    expect(rope.segments).toHaveLength(2);
    expect(rope.middleDistance(rope.start.node.x, rope.start.node.y)).toBe(0);
  });
});

describe('editing the stage', () => {
  it('takes away the rope the arrow is pressed on at its cord, and never the doll', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const rope = tie(world, [-120, -140], [120, 140]) as Rope;

    // Empty sky: nothing happens, and nothing is handed back to be burst.
    expect(world.press(-260, 190)).toBeNull();

    // The rope, because the arrow's own first answer is the cord under the press — this rope's middle
    // lies across the doll, and the rope is what goes rather than the doll under it.
    const middle = rope.nodes[Math.floor(rope.nodes.length / 2)];
    expect(world.press(middle.x, middle.y)).toBe(rope);
    expect(world.ropes).toHaveLength(0);
    expect(world.engine.particles).toHaveLength(doll.particles.length);

    // And the doll herself: she is left standing. Nothing in the world takes her away — a press on her is
    // a press on the game, which is the arrow's hold (`World.press`).
    const chest = partCentre(doll, 4);
    expect(world.press(chest.x, chest.y)).toBeNull();
    expect(world.dolls).toEqual([doll]);
    expect(world.engine.particles).toHaveLength(doll.particles.length);

    // ...and her own `removeDoll` is still there for a caller that really means it.
    world.removeDoll(doll);
    expect(world.dolls).toHaveLength(0);
    expect(world.engine.particles).toHaveLength(0);
  });

  it('takes a rope too short to have a middle away by its own knot', () => {
    const world = new World();
    const rope = tie(world, [-9, 0], [9, 0]) as Rope;
    // Two links, both of them the rope's middle: there is no end's ground left to take hold of, so the
    // whole of it is the rope's own body and a press on it burns it.
    expect(world.press(rope.start.node.x, rope.start.node.y)).toBe(rope);
    expect(world.ropes).toHaveLength(0);
  });

  it('takes the ropes tied to a doll away with the doll', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const chest = partCentre(doll, 4);
    tie(world, [0, -180], [chest.x, chest.y]);
    const free = tie(world, [-200, -150], [200, -150]) as Rope;
    expect(world.ropes).toHaveLength(2);

    world.removeDoll(doll);
    expect(world.dolls).toHaveLength(0);
    expect(world.ropes).toEqual([free]);
    // Only the untouched rope's beads are still in the engine.
    expect(world.engine.particles).toHaveLength(free.beads.length);
  });

  it('takes several dolls, each with its own rig, without them getting in each other\u2019s way', () => {
    const world = new World();
    const first = world.addDoll({ x: 0, y: 0 }) as Doll;
    const second = world.addDoll() as Doll;
    expect(world.dolls).toHaveLength(2);
    // The second doll is put down away from the first, so they do not land on top of each other.
    expect(Math.hypot(second.centre.x - first.centre.x, second.centre.y - first.centre.y)).toBeGreaterThan(
      100,
    );

    // Two dolls, two rigs: not one joint or sprite between them is shared.
    const [one, two] = world.dolls;
    expect(one.particles.filter((p) => two.particles.includes(p))).toHaveLength(0);
    expect(one.joint('head')).not.toBe(two.joint('head'));
    expect(one.skin).toHaveLength(11);
    expect(world.engine.particles).toHaveLength(one.particles.length + two.particles.length);

    run(world, 2000);

    for (const doll of world.dolls) {
      for (const p of doll.particles) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        // Nothing escapes the walls of the world.
        expect(p.x).toBeGreaterThanOrEqual(world.engine.minx - 1e-6);
        expect(p.x).toBeLessThanOrEqual(world.engine.maxx + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(world.engine.miny - 1e-6);
        expect(p.y).toBeLessThanOrEqual(world.engine.maxy + 1e-6);
      }
    }
  });

  it('keeps the world still when nothing is being edited', () => {
    // A stage with no ropes has to be exactly the engine the original trace was checked against.
    const world = new World();
    world.addDoll({ x: 0, y: 0 });
    const before = world.engine.particles.map((p) => ({ x: p.x, y: p.y }));
    run(world, 1000);
    expect(world.ropes).toHaveLength(0);
    expect(world.dolls).toHaveLength(1);
    world.respawn();
    expect(world.engine.particles.map((p) => ({ x: p.x, y: p.y }))).toEqual(before);
  });
});

describe('knots', () => {
  it('carries a knot about and nails it where it is dropped', () => {
    const world = new World();
    const rope = tie(world, [-120, -120], [120, 120]) as Rope;
    expect(world.pickAnchor(0, 0)).toBeNull();
    expect(world.pickAnchor(126, 126)).toBe(rope.end);
    expect(world.grabAnchor(122, 122)).toBe(true);
    expect(world.dragged).toBe(rope.end);
    expect(rope.end.dragging).toBe(true);

    // It follows the mouse while it is in hand ...
    world.engine.mouseX = 200;
    world.engine.mouseY = -150;
    world.step(20);
    expect(rope.end.node.x).toBeCloseTo(200, 6);
    expect(rope.end.node.y).toBeCloseTo(-150, 6);
    // ... and the rope is still exactly as long as it was drawn.
    expect(rope.measuredLength()).toBeLessThanOrEqual(rope.length * MAX_STRETCH);

    // And it stays exactly where it was let go.
    world.dropAnchor(210, -140);
    expect(world.dragged).toBeNull();
    expect(rope.end.dragging).toBe(false);
    expect(rope.end.node.x).toBeCloseTo(210, 6);
    expect(rope.end.node.y).toBeCloseTo(-140, 6);
    expect(rope.end.nailed).toBe(true);
  });

  it('drags the doll along when the rope she is tied to is dragged', () => {
    // Holding a rope by one end drags whatever is on the other end: that is what a rope is for, and
    // the whole point of being able to drag a knot about.
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const chest = partCentre(doll, 4);
    const rope = tie(world, [0, -170], [chest.x, chest.y]) as Rope;
    expect(rope.end.holder).toBe(doll);
    expect(rope.end.tuggable).toBe(true);

    // The player takes the nailed end and hauls it across the stage.
    expect(world.grabAnchor(0, -170)).toBe(true);
    for (let i = 0; i < 60; i++) {
      world.engine.mouseX = -250;
      world.engine.mouseY = -120;
      world.step(20);
      expect(world.longestStretch()).toBeLessThanOrEqual(MAX_STRETCH + 1e-9);
    }

    // She came with it — across the stage, on the end of a rope that never gave more than its 5%.
    expect(doll.centre.x).toBeLessThan(-40);
    expect(rope.maxStretch()).toBeLessThanOrEqual(MAX_STRETCH + 1e-9);
    // And the knot is still on her, not left hanging in the air where the rope used to end.
    const behind = partCentre(doll, 4);
    const knotToChest = Math.hypot(rope.end.node.x - behind.x, rope.end.node.y - behind.y);
    expect(knotToChest).toBeLessThan(30);
  });

  it('will not drag a nail, and will not drag the doll out of her body', () => {
    // The other side of the same coin: a rope nailed at both ends simply refuses to be stretched.
    const world = new World();
    const rope = tie(world, [0, -60], [0, 60]) as Rope;
    expect(rope.end.tuggable).toBe(false);
    expect(world.grabAnchor(0, 60)).toBe(true);
    world.engine.mouseX = 0;
    world.engine.mouseY = 300;
    world.step(20);
    expect(rope.end.node.y).toBeLessThan(70); // stopped at the end of the rope, well short of the mouse
    expect(rope.maxStretch()).toBeLessThanOrEqual(MAX_STRETCH + 1e-9);
  });

  it('ties a carried knot to whatever it is dropped on, and lets go again', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const rope = tie(world, [-220, -170], [220, -170]) as Rope;
    const chest = partCentre(doll, 4);

    world.grabAnchor(220, -170);
    world.dropAnchor(chest.x, chest.y);
    expect(rope.end.holder).toBe(doll);
    expect(rope.end.ties).toHaveLength(2);

    // Picked up again, from wherever the rope left it, and dropped on bare stage: it becomes a nail.
    expect(world.grabAnchor(rope.end.node.x, rope.end.node.y)).toBe(true);
    world.dropAnchor(-200, 180);
    expect(rope.end.holder).toBeNull();
    expect(rope.end.nailed).toBe(true);
    expect(rope.end.ties).toHaveLength(0);
  });

  it('carries a knot across the stage a step at a time, and leaves it there', () => {
    // The way a mouse actually does it: the knot follows over many frames and the rope's beads flow
    // after it, so letting go does not have to yank either of them anywhere.
    const world = new World();
    const rope = tie(world, [0, -180], [0, 120]) as Rope;
    expect(world.grabAnchor(0, 120)).toBe(true);

    // Somewhere the rope comfortably reaches ...
    const target = { x: -140, y: -20 };
    for (let i = 0; i < 30; i++) {
      world.engine.mouseX = target.x;
      world.engine.mouseY = target.y;
      world.step(20);
    }
    expect(Math.hypot(rope.end.node.x - target.x, rope.end.node.y - target.y)).toBeLessThan(2);

    // ... and somewhere it does not: a rope cannot be pulled further than it is long.
    for (let i = 0; i < 30; i++) {
      world.engine.mouseX = 250;
      world.engine.mouseY = 180;
      world.step(20);
    }
    const reach = Math.hypot(rope.end.node.x - rope.start.node.x, rope.end.node.y - rope.start.node.y);
    expect(reach).toBeLessThanOrEqual(rope.length * MAX_STRETCH + 1e-9);
    expect(rope.maxStretch()).toBeLessThanOrEqual(MAX_STRETCH + 1e-9);

    // Let go: it stays exactly where it was let go of, and the rope is still as long as it was drawn.
    const dropped = { x: rope.end.node.x, y: rope.end.node.y };
    world.dropAnchor(rope.end.node.x, rope.end.node.y);
    expect(world.dragged).toBeNull();
    expect(rope.end.node.x).toBeCloseTo(dropped.x, 6);
    expect(rope.end.node.y).toBeCloseTo(dropped.y, 6);
    expect(rope.end.nailed).toBe(true);
    expect(rope.measuredLength()).toBeLessThanOrEqual(rope.length * MAX_STRETCH);
  });
});
