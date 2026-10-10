import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import type { Doll } from '../src/game/doll';
import type { Rope } from '../src/game/rope';
import { World } from '../src/game/world';

/**
 * The toolbar's rule about its tools, in the two layers that share it. The world never changes the
 * tool by itself: nothing the stage does — a doll arrived, a rope taken away, a press that spent
 * itself on nothing — puts another tool into the player's hand. The one change is the rope tool's
 * own success: the press that fixes a rope on the stage hands the arrow back (`Game.pressAt`),
 * because the rope is there to be pulled about now — and that belongs to the game rather than to
 * the world, the toolbar being who the change is for; the bar hears of it through
 * `Game.onToolChange`, whose other word is the tool the player came home from a watched run with
 * (`Game.homeAgain`).
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
    // Half a rope belongs to the rope tool: the second click is what finishes it — and the world
    // itself takes no tool off the player for drawing one. The arrow the game hands back afterwards
    // (`pressAt`, below) is the toolbar's own doing, not the world's.
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

/**
 * A game with no renderer: the world and the tool, and nothing drawn — everything the rope tool's own
 * success needs, since the toolbar's telling (`onToolChange`) is the engine's and not the renderer's.
 * The constructor is private because a real game is `create`d, not `new`d; `Reflect.construct` is the
 * test's own way in, for the same reason `live.test.ts` uses it.
 */
function bareGame(): Game {
  return Reflect.construct(Game, [null]) as Game;
}

/** A press on the stage through the game's own door (`Game.pressAt`), at a world point. */
function press(game: Game, x: number, y: number): void {
  (game as unknown as { pressAt(point: { x: number; y: number }): void }).pressAt({ x, y });
}

describe('the tool the game hands back after a rope was fixed', () => {
  it('is the arrow again, and the toolbar is told', () => {
    const game = bareGame();
    game.setTool('rope');
    const heard: string[] = [];
    game.onToolChange = (tool) => heard.push(tool);
    press(game, -100, -100);
    // The first click lays the rope's start and spends nothing: the tool is the player's while the
    // rope is still half drawn, and the bar hears nothing.
    expect(game.world.tool).toBe('rope');
    expect(heard).toEqual([]);
    press(game, 100, -100);
    expect(game.world.ropes).toHaveLength(1);
    expect(game.world.tool).toBe('drag');
    expect(heard).toEqual(['drag']);
  });

  it('is still the rope while the draft waits for a proper second click', () => {
    const game = bareGame();
    game.setTool('rope');
    press(game, -100, -100);
    // A second click on top of the first: no rope came of it, so the draft stays open and the tool
    // stays with it — the arrow is handed back by a rope, not by a click.
    press(game, -100, -100);
    expect(game.world.ropes).toHaveLength(0);
    expect(game.world.tool).toBe('rope');
    // ...and the proper second click still works, arrow and all.
    press(game, 100, -100);
    expect(game.world.ropes).toHaveLength(1);
    expect(game.world.tool).toBe('drag');
  });

  it('is untouched by a rope taken off the stage', () => {
    const game = bareGame();
    game.setTool('rope');
    press(game, -100, -100);
    press(game, 100, -100);
    const rope = game.world.ropes[0] as Rope;
    const middle = rope.nodes[Math.floor(rope.nodes.length / 2)];
    // The burn is a press like any other, and it takes a rope away rather than laying one: the arrow
    // that was handed back for the fixing is the arrow the burn leaves alone.
    press(game, middle.x, middle.y);
    expect(game.world.ropes).toHaveLength(0);
    expect(game.world.tool).toBe('drag');
  });
});
