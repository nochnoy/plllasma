import { describe, expect, it } from 'vitest';
import type { Doll } from '../src/game/doll';
import type { Rope } from '../src/game/rope';
import { World } from '../src/game/world';

/**
 * The toolbar's rule about its tools: a tool is the player's to keep. Nothing the stage does puts the
 * arrow back into the player's hand — a rope drawn, a doll arrived, a rope taken away — so a player who
 * picked the rope and drew one can draw another straight away, which is what the bar's buttons are for.
 * The world owns the tool, so the rule lives there; the toolbar only follows what it is told
 * (`Game.onToolChange`, which by now has one thing to say: coming home from a watched run).
 *
 * Taking a rope away is either tool's own press — the middle of a cord burns it in the rope tool's hand
 * exactly as it does in the arrow's ({@link World.press}) — and no press spends the tool it was made
 * with.
 *
 * A click that spends itself on nothing — a rope that turned out to be too short to draw, a press on
 * bare sky — leaves the tool where the player put it as well.
 */

/** The middle of a body part's bone, which is where its artwork box is centred. */
function partCentre(doll: Doll, index: number): { x: number; y: number } {
  const part = doll.skin[index];
  return { x: (part.p1.x + part.p2.x) / 2, y: (part.p1.y + part.p2.y) / 2 };
}

/** The node in the middle of a rope's chain: what the arrow's press takes the whole rope away by. */
function ropeMiddle(rope: Rope): { x: number; y: number } {
  return rope.nodes[Math.floor(rope.nodes.length / 2)];
}

describe('the tool after something was added', () => {
  it('stays in the player\'s hand after a doll', () => {
    const world = new World();
    world.tool = 'rope';
    expect(world.addDoll({ x: 0, y: 0 })).not.toBeNull();
    expect(world.tool).toBe('rope');
  });

  it('stays in the player\'s hand once a rope has both its ends', () => {
    const world = new World();
    world.tool = 'rope';
    world.startRope(-100, -100);
    // Half a rope belongs to the rope tool: the second click is what finishes it — and drawing one
    // rope is not a reason to take the tool it was drawn with away.
    expect(world.tool).toBe('rope');
    expect(world.finishRope(100, -100) as Rope).not.toBeNull();
    expect(world.tool).toBe('rope');
  });

  it('stays where it was when the rope came out too short', () => {
    const world = new World();
    world.tool = 'rope';
    world.startRope(-100, -100);
    expect(world.finishRope(-100, -100)).toBeNull();
    expect(world.tool).toBe('rope');
  });
});

describe('the tool after a rope was taken off the stage', () => {
  it('stays where it was, whoever took the rope', () => {
    const world = new World();
    world.startRope(-100, -100);
    const rope = world.finishRope(100, -100) as Rope;
    const middle = ropeMiddle(rope);
    // The press hands the rope back as it takes it away, which is what the renderer bursts (`Scene.popRope`).
    expect(world.press(middle.x, middle.y)).toBe(rope);
    expect(world.ropes).toHaveLength(0);
    expect(world.tool).toBe('drag');
  });

  it('takes a rope away by its middle in the rope tool\'s own hand too', () => {
    const world = new World();
    world.tool = 'rope';
    world.startRope(-100, -100);
    const rope = world.finishRope(100, -100) as Rope;
    const middle = ropeMiddle(rope);
    expect(world.press(middle.x, middle.y)).toBe(rope);
    expect(world.ropes).toHaveLength(0);
    // And the rope stays in the player's hand afterwards, as it does through everything else.
    expect(world.tool).toBe('rope');
  });

  it('keeps a half-drawn rope open when the press burned one instead', () => {
    const world = new World();
    world.tool = 'rope';
    world.startRope(-100, -100);
    const doomed = world.finishRope(200, -100) as Rope;
    // The first click of a second rope, elsewhere — and then a press that lands on the first rope's
    // middle: the burn spends the press, and the half-drawn rope keeps waiting for its second click.
    world.startRope(-260, 60);
    const middle = ropeMiddle(doomed);
    expect(world.press(middle.x, middle.y)).toBe(doomed);
    expect(world.draft).not.toBeNull();
    expect(world.finishRope(-260, 200) as Rope).not.toBeNull();
    expect(world.ropes).toHaveLength(1);
  });

  it('leaves the arrow alone when the press took nothing away', () => {
    const world = new World();
    world.addDoll({ x: 0, y: 0 });
    // Bare sky: no rope's middle is under it, no knot is, and no particle of hers is either.
    expect(world.press(-260, -180)).toBeNull();
    expect(world.engine.onHold).toHaveLength(0);
    expect(world.tool).toBe('drag');
  });

  it('leaves the doll alone: a press on her is a press that takes hold of her', () => {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 }) as Doll;
    const chest = partCentre(doll, 4);
    // She is not something a press can take away, whatever the press lands on: the arrow's own answer to
    // a press on her is the hold — particles of her in the engine's hand (`Game.holdingADoll`) — and the
    // tool is not something a hold spends.
    expect(world.press(chest.x, chest.y)).toBeNull();
    expect(world.dolls).toEqual([doll]);
    expect((world.engine.onHold?.length ?? 0)).toBeGreaterThan(0);
    expect(world.tool).toBe('drag');
  });
});
