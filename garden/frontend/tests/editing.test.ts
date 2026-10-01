import { describe, expect, it } from 'vitest';
import type { Doll } from '../src/game/doll';
import type { Rope } from '../src/game/rope';
import { World } from '../src/game/world';

/**
 * The toolbar's rule about its tools: putting something on the stage and taking something off it both
 * hand the arrow back, so the stage is ready to be played with straight afterwards. The world owns the
 * tool, so the rule lives there; the toolbar only follows what it is told (`Game.onToolChange`).
 *
 * A click that spends itself on nothing — a rope that turned out to be too short to draw, a click on
 * bare sky with the delete tool — leaves the tool where the player put it.
 */

/** The middle of a body part's bone, which is where its artwork box is centred. */
function partCentre(doll: Doll, index: number): { x: number; y: number } {
  const part = doll.skin[index];
  return { x: (part.p1.x + part.p2.x) / 2, y: (part.p1.y + part.p2.y) / 2 };
}

describe('the tool after something was added', () => {
  it('is the arrow again after a doll', () => {
    const world = new World();
    world.tool = 'rope';
    expect(world.addDoll({ x: 0, y: 0 })).not.toBeNull();
    expect(world.tool).toBe('drag');
  });

  it('is the arrow again once a rope has both its ends', () => {
    const world = new World();
    world.tool = 'rope';
    world.startRope(-100, -100);
    // Half a rope belongs to the rope tool: the second click is what finishes it.
    expect(world.tool).toBe('rope');
    expect(world.finishRope(100, -100) as Rope).not.toBeNull();
    expect(world.tool).toBe('drag');
  });

  it('stays where it was when the rope came out too short', () => {
    const world = new World();
    world.tool = 'rope';
    world.startRope(-100, -100);
    expect(world.finishRope(-100, -100)).toBeNull();
    expect(world.tool).toBe('rope');
  });
});

describe('the tool after something was deleted', () => {
  it('is the arrow again after a rope', () => {
    const world = new World();
    world.startRope(-100, -100);
    const rope = world.finishRope(100, -100) as Rope;
    const middle = rope.nodes[Math.floor(rope.nodes.length / 2)];
    world.tool = 'delete';
    expect(world.deleteAt(middle.x, middle.y)).toBe('rope');
    expect(world.tool).toBe('drag');
  });

  it('leaves the doll alone, and the tool where it was', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const chest = partCentre(doll, 4);
    world.tool = 'delete';
    // The bin takes ropes. The doll is not one of them — a click on her means the player wants to
    // take hold of her, which is the arrow's job (`World.deleteAt`) — and since nothing was spent
    // that way either, the tool stays where the player put it.
    expect(world.deleteAt(chest.x, chest.y)).toBeNull();
    expect(world.dolls).toHaveLength(1);
    expect(world.tool).toBe('delete');
  });

  it('stays where it was when the click missed everything', () => {
    const world = new World();
    world.addDoll({ x: 0, y: 0 });
    world.tool = 'delete';
    expect(world.deleteAt(-260, -180)).toBeNull();
    expect(world.tool).toBe('delete');
  });
});
