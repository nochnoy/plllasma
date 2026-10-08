import { describe, expect, it } from 'vitest';
import { WALL_HEIGHT, WALL_WIDTH } from '../src/game/stage';
import { AngledConstraint } from '../src/game/vm/constraint';
import { Extractor, SKIN_TABLE } from '../src/game/vm/extractor';
import { PEngine2D } from '../src/game/vm/engine';
import { Particle2D } from '../src/game/vm/particle';
import { World } from '../src/game/world';

/**
 * The movie's own stage, which is also the size of its physics world. The port's room is larger —
 * see `src/game/stage.ts` — but the rig, the joints and every number these tests measure on it were
 * authored inside these 550x400, so the engine here is built to the movie's size.
 */
export const STAGE_WIDTH = 550;
export const STAGE_HEIGHT = 400;

export function buildRig(): { extractor: Extractor; engine: PEngine2D } {
  const extractor = new Extractor();
  extractor.extract();
  const engine = new PEngine2D(STAGE_WIDTH, STAGE_HEIGHT);
  for (const p of extractor.particles) engine.addParticle(p);
  for (const c of extractor.angledConstraints) engine.addAngledConstraint(c);
  for (const c of extractor.constraints) {
    if (!('isAngled' in c)) engine.addConstraint(c);
  }
  return { extractor, engine };
}

describe('extractor', () => {
  const ex = new Extractor();
  ex.extract();

  it('finds the twelve particles of the rig with their authored masses', () => {
    expect(ex.particles.map((p) => p.name)).toEqual([
      'knee1', 'foot1', 'knee2', 'foot2', 'pants', 'stomach',
      'head', 'arm2', 'hand2', 'arm1', 'hand1', 'neck',
    ]);
    expect(ex.particles.map((p) => p.mass)).toEqual([
      0.9, 0.8, 0.9, 0.8, 1.1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
    const head = ex.particles.find((p) => p.name === 'head');
    expect(head).toMatchObject({ x: 60.25, y: -129.9, rad: 12 });
  });

  it('finds every constraint marker as an angled constraint', () => {
    expect(ex.angledConstraints.length).toBe(20);
    expect(ex.constraints.length).toBe(20);
    for (const c of ex.constraints) expect(c.restLength).toBeGreaterThan(0);
  });

  it('ties the torso together the way the original markers do', () => {
    const byName = new Map(ex.particles.map((p) => [p.name, p]));
    const describe_ = (c: (typeof ex.constraints)[number]) =>
      `${c.p1.name}-${c.p2.name}${'p3' in c ? `:${(c.p3 as { name: string }).name}` : ''}`;
    const names = ex.constraints
      .filter((c) => 'isAngled' in c)
      .map((c) => describe_(c as never));
    // The spine, the neck and both shoulders all hang off the same three joints. Each marker's
    // own ends decide the direction: this one sits on the head and points at the neck.
    expect(names).toContain('stomach-neck:head');
    expect(names).toContain('head-neck:stomach');
    expect(names).toContain('neck-stomach:pants');
    expect(names).toContain('pants-stomach:neck');
    expect(byName.get('neck')).toBeDefined();
  });

  it('builds the eleven drawn parts in the original draw order', () => {
    expect(ex.skin.map((s) => `${s.p1.name}-${s.p2.name}-${s.mc}`)).toEqual([
      'arm1-hand1-hand',
      'neck-arm1-arm',
      'pants-knee2-thigh',
      'knee2-foot2-leg',
      'stomach-neck-chest',
      'neck-head-head',
      'stomach-pants-stomach',
      'knee1-foot1-leg',
      'pants-knee1-thigh',
      'neck-arm2-arm',
      'arm2-hand2-hand',
    ]);
    expect(SKIN_TABLE.length).toBe(11);
  });

  it('measures the rest lengths off the marker endpoints', () => {
    const bone = (a: string, b: string) => {
      const c = ex.constraints.find((k) => k.p1.name === a && k.p2.name === b);
      expect(c, `${a}-${b}`).toBeDefined();
      return c!.restLength;
    };
    // Distances between the particles exactly as the display list places them. Each marker's own
    // ends decide the direction of its pair, so e.g. the left knee is foot1 -> knee1.
    expect(bone('stomach', 'neck')).toBeCloseTo(48.77, 1);
    expect(bone('head', 'neck')).toBeCloseTo(39.16, 1);
    expect(bone('hand1', 'arm1')).toBeCloseTo(62.3, 1);
    expect(bone('hand2', 'arm2')).toBeCloseTo(62.98, 1);
    expect(bone('pants', 'knee1')).toBeCloseTo(61.28, 1);
    expect(bone('foot1', 'knee1')).toBeCloseTo(56.95, 1);
    expect(bone('pants', 'knee2')).toBeCloseTo(61.76, 1);
    expect(bone('foot2', 'knee2')).toBeCloseTo(58.21, 1);
  });

  it('gives every constraint the angle limits its marker authored', () => {
    const find = (a: string, b: string, p3: string) =>
      ex.angledConstraints.find((c) => c.p1.name === a && c.p2.name === b && c.p3.name === p3)!;
    expect(find('stomach', 'neck', 'head')).toMatchObject({ minang: -0.5, maxang: 1 });
    expect(find('head', 'neck', 'stomach')).toMatchObject({ minang: -1, maxang: 0.5 });
    expect(find('hand1', 'arm1', 'neck')).toMatchObject({ minang: -0.1, maxang: 2.6 });
    expect(find('neck', 'arm1', 'hand1')).toMatchObject({ minang: -2.6, maxang: 0.1 });
    expect(find('foot1', 'knee1', 'pants')).toMatchObject({ minang: -2.3, maxang: 0.1 });
    expect(find('arm1', 'neck', 'stomach')).toMatchObject({ minang: 0, maxang: Math.PI / 2 });
    expect(find('stomach', 'neck', 'arm1')).toMatchObject({ minang: -Math.PI / 2, maxang: 0 });
    // Only the four shoulder/arm limits set `inversed`, which flips the solver into its
    // "angle must stay outside this range" branch.
    const inversed = ex.angledConstraints
      .filter((c) => c.inversed)
      .map((c) => `${c.p1.name}-${c.p2.name}:${c.p3.name}`);
    expect(inversed).toEqual([
      'arm2-neck:stomach',
      'arm1-neck:stomach',
      'stomach-neck:arm2',
      'stomach-neck:arm1',
    ]);
  });
});

describe('engine', () => {
  /** Mass-weighted centre of mass: gravity moves it, the rigid joint solver leaves it alone. */
  const centreOfMass = (engine: PEngine2D) => {
    let m = 0;
    let my = 0;
    for (const p of engine.particles) {
      m += p.mass;
      my += p.mass * p.y;
    }
    return my / m;
  };

  it('falls and never rises on its own', () => {
    // A tall world keeps the floor out of the picture: only gravity may move the centre of mass.
    const engine = new PEngine2D(550, 400000);
    const extractor = new Extractor();
    extractor.extract();
    for (const p of extractor.particles) engine.addParticle(p);
    for (const c of extractor.angledConstraints) engine.addAngledConstraint(c);
    let was = centreOfMass(engine);
    for (let i = 0; i < 300; i++) {
      engine.update(20);
      const now = centreOfMass(engine);
      // Limbs swing while the pose resolves, but gravity only ever pulls her down.
      expect(now).toBeGreaterThanOrEqual(was - 1e-9);
      was = now;
    }
    expect(centreOfMass(engine)).toBeGreaterThan(100);
  });

  it('settles at the terminal velocity the original constants imply', () => {
    // A tall world, so nothing but gravity and drag can stop her.
    const engine = new PEngine2D(550, 400000);
    const extractor = new Extractor();
    extractor.extract();
    for (const p of extractor.particles) engine.addParticle(p);
    const tf = 20;
    const f = Math.pow(engine.fric, tf);
    const expected = (engine.gravity * tf * tf) / (1 - f);
    for (let i = 0; i < 600; i++) engine.update(tf);
    const p = engine.particles[5];
    expect(p.y - p.oldy).toBeCloseTo(expected, 1);
  });

  it('drops the velocity into the floor instead of bouncing, and stays inside the world', () => {
    const { engine } = buildRig();
    for (let i = 0; i < 200; i++) engine.update(20);
    for (const p of engine.particles) {
      expect(p.y).toBeLessThanOrEqual(engine.maxy + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(engine.miny - 1e-6);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(engine.maxx + 1e-6);
      // Resting on the floor: no upward velocity left, just the solver jitter.
      expect(p.y - p.oldy).toBeLessThan(0.5);
    }
  });

  it('holds all four sides of its box, the top as surely as the floor', () => {
    // The box is the movie's own and was closed on all four sides; the port's *ceiling* stands above the
    // picture rather than at it, so a doll hauled up by the pointer goes up out of the frame and is stopped
    // by that line when there is no more room above her at all (`PEngine2D.clampToWorld`). What the player
    // can watch her hit is still the two sides and the floor.
    const { engine } = buildRig();
    const held = engine.particles[0];
    engine.onHold = [held];
    engine.mouseX = 0;
    engine.mouseY = engine.miny - 300;
    for (let i = 0; i < 120; i++) engine.update(20);
    expect(held.y).toBeCloseTo(engine.miny, 6);
    // Everything else is still inside the box, on the sides and over the floor.
    for (const p of engine.particles) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(engine.maxx + 1e-6);
      expect(p.y).toBeLessThanOrEqual(engine.maxy + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(engine.miny - 1e-6);
    }
  });

  it('leaves a particle the walls do not own alone, wherever it is put', () => {
    // A rope's chain is not the body: `Particle2D.clamped` is what tells the two apart, and a knot
    // nailed out in the scenery beside the walls — or above them — has to stay where the player put it.
    // Two bare particles, so that nothing but the walls can move either of them — the port's own box,
    // `WALL_WIDTH` by `WALL_HEIGHT`, rather than the movie's stage the rest of this file plays in.
    const engine = new PEngine2D(WALL_WIDTH, WALL_HEIGHT);
    const free = new Particle2D(-engine.maxx - 200, engine.miny - 200);
    free.clamped = false;
    const walled = new Particle2D(-engine.maxx - 200, engine.miny - 200);
    engine.addParticle(free);
    engine.addParticle(walled);
    engine.update(20);
    expect(free.x).toBeLessThan(-engine.maxx);
    expect(walled.x).toBeCloseTo(-engine.maxx, 6);
    // ...and the box has a top like any other side — it is just a long way up: the particle the walls own is
    // put on it, and the one they do not is left above it, where a rope's bead or a ball belongs.
    expect(free.y).toBeLessThan(engine.miny);
    expect(walled.y).toBeCloseTo(engine.miny, 6);
  });

  it('pulls held particles a fixed fraction towards the pointer', () => {
    const { engine } = buildRig();
    const p = engine.particles[0];
    engine.onHold = [p];
    engine.mouseX = p.x + 100;
    engine.mouseY = p.y + 50;
    const x0 = p.x;
    const y0 = p.y;
    engine.hold();
    expect(p.x - x0).toBeCloseTo(30, 6);
    expect(p.y - y0).toBeCloseTo(15, 6);
  });

  it('scales its clock with speed, like the original arrow keys did', () => {
    const { engine } = buildRig();
    expect(engine.getTimeFactor(20)).toBe(20);
    engine.speed = 0.5;
    expect(engine.getTimeFactor(20)).toBe(10);
    expect(engine.getTimeFactor(1000)).toBe(20);
  });

  it('holds a bone at its rest length and relaxes an illegal angle by a third per solve', () => {
    const engine = new PEngine2D(550, 400);
    const p2 = new Particle2D(0, 0);
    const p3 = new Particle2D(0, 100);
    const p1 = new Particle2D(50, 0);
    // p1 sits square on the far side of p2, so the bone angle is 90 degrees past the limit.
    const c = new AngledConstraint(p1, p2, 50, p3, -0.5, 1);
    const bone = () => Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const other = () => Math.atan2(p3.y - p2.y, p3.x - p2.x);
    const error = bone() - other() - c.maxang;
    expect(error).toBeCloseTo(Math.PI / 2 - 1, 9);

    const wanted = bone() + -error * 0.3;
    engine.satisfyAngConstraint(c);
    // The bone ends up exactly at `restLength`, pointing at `ang12 + corr * 0.3`.
    expect(Math.hypot(p1.x - p2.x, p1.y - p2.y)).toBeCloseTo(50, 9);
    expect(bone()).toBeCloseTo(wanted, 9);

    // ...and repeated solves walk the angle back inside its limits.
    for (let i = 0; i < 60; i++) engine.satisfyAngConstraint(c);
    expect(bone() - other()).toBeGreaterThanOrEqual(c.minang);
    expect(bone() - other()).toBeLessThanOrEqual(c.maxang + 1e-9);
  });

  it('keeps an inversed joint out of its forbidden range', () => {
    const { engine } = buildRig();
    const c = engine.angledConstraints.find((k) => k.inversed)!;
    // Park the joint in the middle of the forbidden range and let the solver push it out.
    const { p1, p2, p3 } = c;
    const mid = (c.maxang + c.minang) / 2;
    const base = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    p1.x = p2.x + Math.cos(base + mid) * c.restLength;
    p1.y = p2.y + Math.sin(base + mid) * c.restLength;
    for (let i = 0; i < 200; i++) engine.constrain();
    const da = Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.atan2(p3.y - p2.y, p3.x - p2.x);
    const inRange = da > c.minang && da < c.maxang;
    expect(inRange).toBe(false);
  });
});

describe('the angle her thighs make', () => {
  /** A doll stood on the stage, with her joints where a test put them rather than where a step left them. */
  function posed() {
    const world = new World();
    const doll = world.addDoll({ x: 0, y: 0 });
    if (!doll) throw new Error('the rig could not be built');
    return doll;
  }

  it('is measured off her pelvis and knees, as the joints are drawn', () => {
    const doll = posed();
    const pants = doll.joint('pants');
    const knee1 = doll.joint('knee1');
    const knee2 = doll.joint('knee2');
    if (!pants || !knee1 || !knee2) throw new Error('the rig is missing a leg');

    // Straight down together: no angle between her thighs at all.
    pants.x = 0;
    pants.y = 0;
    knee1.x = 0;
    knee1.y = 90;
    knee2.x = 0;
    knee2.y = 90;
    expect(doll.thighAngle()).toBe(0);

    // Apart, symmetric: half of a full split each way, which is what the reading says.
    knee1.x = -90;
    knee1.y = 0;
    knee2.x = 90;
    knee2.y = 0;
    expect(doll.thighAngle()).toBe(180);

    // However she is turned: the angle is between the thighs themselves, not against the world, so a
    // thigh pointing along and one pointing across read as the quarter turn apart that they are.
    knee1.x = 90;
    knee1.y = 90;
    knee2.x = 180;
    knee2.y = 0;
    expect(doll.thighAngle()).toBe(45);
  });

  it('is the number the run\u2019s own line is told about, past a split and once per run', () => {
    // The wiring itself is the page\u2019s (`useLiveRun`), and what is checked here is the number it is
    // given: 150 of the 180 a full split takes is a pose nobody lands in by falling.
    const doll = posed();
    const pants = doll.joint('pants');
    const knee1 = doll.joint('knee1');
    const knee2 = doll.joint('knee2');
    if (!pants || !knee1 || !knee2) throw new Error('the rig is missing a leg');
    pants.x = 0;
    pants.y = 0;
    const half = ((150 / 2) / 180) * Math.PI;
    knee1.x = -Math.sin(half) * 90;
    knee1.y = Math.cos(half) * 90;
    knee2.x = Math.sin(half) * 90;
    knee2.y = Math.cos(half) * 90;
    expect(doll.thighAngle()).toBeCloseTo(150, 6);
  });
});
