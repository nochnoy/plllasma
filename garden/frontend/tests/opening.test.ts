import { describe, expect, it } from 'vitest';
import type { Doll } from '../src/game/doll';
import { backFrom, dollSources } from '../src/game/pain';
import { World } from '../src/game/world';

/**
 * The game's opening: the doll the movie starts with is laid out on the floor of the hall — on her back,
 * head out one way and feet the other, arms down her body (`World.layDown`) — rather than dropped in from
 * the middle of it.
 *
 * Nothing about it is left to the physics, and that is what these tests are about. The rig is strung along
 * the line the walls' floor is, bone by bone, at the lengths the movie authored them with, so that every
 * joint in the engine is satisfied before the first frame and the doll does not move at all — she is not
 * *settling* into this pose, she is in it. Her drawing is what gives her thickness (`Scene`), which is why
 * the box her joints cover here is a line.
 *
 * The opening is a placement rather than a simulation, so it is the same picture at any pace: every claim
 * below is asked at the movie's own clock, which the world is born with, and at the fifth of it the game
 * runs (`INITIAL_SPEED` in `game.ts`).
 */

/** The pace the game opens at: a fifth of the movie's own clock (`INITIAL_SPEED` in `game.ts`). */
const GAME_PACE = 0.2;

/** The doll the game opens with, laid down exactly as `Game` does it. */
function opening(pace?: number): { world: World; doll: Doll } {
  const world = new World();
  if (pace !== undefined) world.engine.speed = pace;
  const doll = world.addDoll({ x: 0, y: 0 });
  if (!doll) throw new Error('the engine refused a doll');
  world.layDown(doll);
  return { world, doll };
}

/** Where a joint of the rig is, or a thrown error: the tests below read her limbs by name. */
function joint(doll: Doll, name: string): { x: number; y: number } {
  const point = doll.joint(name);
  if (!point) throw new Error(`the rig is missing its ${name}`);
  return point;
}

/** How far she has spread over the floor, and how tall she stands in it — the box she fits in now. */
function extent(doll: Doll): { width: number; height: number } {
  const xs = doll.particles.map((p) => p.x);
  const ys = doll.particles.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/**
 * The unit vector from her neck down to her pelvis: the way her body runs, which is also the way her arms
 * and legs are laid out along it. Every claim about her limbs below is made against this direction.
 */
function axis(doll: Doll): { x: number; y: number } {
  const neck = joint(doll, 'neck');
  const pants = joint(doll, 'pants');
  const length = Math.hypot(pants.x - neck.x, pants.y - neck.y);
  return { x: (pants.x - neck.x) / length, y: (pants.y - neck.y) / length };
}

/** The two bones of one arm, from the shoulder outwards. */
function armBones(doll: Doll, elbowName: string, handName: string) {
  const neck = joint(doll, 'neck');
  const elbow = joint(doll, elbowName);
  const wrist = joint(doll, handName);
  return [
    { from: neck, to: elbow },
    { from: elbow, to: wrist },
  ];
}

/** What every test below is about: she is down, flat, at rest, and her arms are with her. */
function checkLying(doll: Doll, world: World): void {
  // Every joint of hers on the floor line, and *only* there: a rig with no thickness lies in the shape of
  // the line it is laid on (`World.layDown`), and the wall's floor is that line (`PEngine2D.maxy`).
  const floor = world.engine.maxy;
  for (const p of doll.particles) expect(Math.abs(p.y - floor)).toBeLessThan(0.5);
  // Lying down rather than standing: she takes up a wide, low box of the hall — 250 world pixels long and
  // no taller than the line, where on her feet the rig stands twice as tall as it is wide.
  const box = extent(doll);
  expect(box.width).toBeGreaterThan(box.height * 2);
  expect(box.width).toBeGreaterThan(200);
  // ...and she is *at rest*: the opening lays her out and lets go, so nothing is still sliding.
  const before = doll.particles.map((p) => ({ x: p.x, y: p.y }));
  for (let step = 0; step < 10; step++) world.engine.update(20);
  const moved = doll.particles.map((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y));
  expect(Math.max(...moved)).toBeLessThan(1);
}

/** Both arms along her body, on the floor line with the rest of her (`World.layDown`). */
function checkArms(doll: Doll, world: World): void {
  const along = axis(doll);
  for (const [elbowName, handName] of [
    ['arm1', 'hand1'],
    ['arm2', 'hand2'],
  ] as const) {
    for (const { from, to } of armBones(doll, elbowName, handName)) {
      // Each bone of the arm runs the way the body runs, and no other way: the arm lies along her, from
      // the shoulder towards her feet.
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const dot = ((to.x - from.x) * along.x + (to.y - from.y) * along.y) / length;
      expect(dot).toBeGreaterThan(0.99);
      expect(Math.abs(to.y - world.engine.maxy)).toBeLessThan(0.5);
    }
  }
  // Her hands end up past her pelvis, beside her thighs rather than beside her head: the arms are longer
  // than the spine she is laid out along.
  const pants = joint(doll, 'pants');
  for (const handName of ['hand1', 'hand2'] as const) {
    const hand = joint(doll, handName);
    const reach = (hand.x - pants.x) * along.x + (hand.y - pants.y) * along.y;
    expect(reach).toBeGreaterThan(0);
  }
}

/** She is on her back: the side of her that faces the floor is the side the model calls her back. */
function checkOnHerBack(doll: Doll): void {
  const back = backFrom(joint(doll, 'pants'), joint(doll, 'neck'));
  // Down the screen, which is where the floor is: `+y` in the movie's own coordinates.
  expect(back.y).toBeGreaterThan(0.99);
}

describe('the doll the game opens with', () => {
  describe('at the movie\'s own clock', () => {
    it('is lying flat on the floor of the room, at rest', () => {
      const { world, doll } = opening();
      checkLying(doll, world);
    });

    it('is lying on her back, not her front', () => {
      checkOnHerBack(opening().doll);
    });

    it('has her arms along her body', () => {
      const { world, doll } = opening();
      checkArms(doll, world);
    });

    it('is not read into her card: the opening is not a game step', () => {
      // The clock of the pain machine counts the seconds of the *game*, and the opening is the port
      // setting a scene: a doll laid out headlessly has read nothing (see `World.layDown`).
      const { doll } = opening();
      const state = doll.pain.snapshot();
      expect(state.painGap).toBe(Infinity);
      expect(state.worst).toBe(0);
      expect(doll.pain.shown).toBe(0);
      // ...and what she *is* worth it read from her pose the first time the game steps: nothing at all,
      // on any of the four ladders (`pain.ts`), so the card opens calm and stays there.
      expect(dollSources(doll)?.split.level).toBe(0);
    });
  });

  describe('at the pace the game itself runs', () => {
    it('is lying flat on the floor of the room, at rest', () => {
      const { world, doll } = opening(GAME_PACE);
      checkLying(doll, world);
    });

    it('is lying on her back, not her front', () => {
      checkOnHerBack(opening(GAME_PACE).doll);
    });

    it('has her arms along her body', () => {
      const { world, doll } = opening(GAME_PACE);
      checkArms(doll, world);
    });

    it('reads nothing at all, so the card opens calm and stays calm', () => {
      // What the player sees first: she lies on the floor, and nothing about the shape she is lying in is
      // worth a step of pain — the card is the calm one, and a second of the game later it still is.
      const { world, doll } = opening(GAME_PACE);
      world.step(20);
      expect(world.dolls[0].pain.snapshot().worst).toBe(0);
      expect(doll.pain.shown).toBe(0);
      for (let step = 1; step < 50; step++) world.step(20);
      expect(doll.pain.snapshot().worst).toBe(0);
      expect(doll.pain.shown).toBe(0);
    });
  });
});
