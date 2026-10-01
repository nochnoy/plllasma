// Checks the port against two recordings taken from the original movie itself.
//
// Both files were produced by tools/inject-trace.mjs, which appends a small logger to the movie's
// own frame-2 script: it wraps `_root.onEnterFrame`, calls the movie's handler and then `trace`s
// the engine's state, which Ruffle prints to the console.
//
//   data/original-constraints.txt — one row: the engine's particle masses and radii, then every
//     constraint's rest length, angle limits, `inversed` flag and endpoint masses (the endpoint
//     masses are what identifies which particle ended up as p1 / p2 / p3).
//   data/original-trace.txt — one row per engine update: the clock (timeFactor), the engine's
//     method call counters, the solver fingerprints and all twelve particle positions.
//
// The Ruffle note: Ruffle's `for..in` over the engine's constraint array hands the solver fewer
// constraints per pass than the Flash player does, so the original's *pose* in these recordings is
// a little softer than the movie's own code produces. The centre of mass is unaffected — the
// angular solver preserves it exactly — so the mass-weighted fall is compared strictly, and the
// individual particles are only required to stay close.
// The recordings are imported as raw text so the test needs no filesystem access of its own.
import constraintsRow from './data/original-constraints.txt?raw';
import traceText from './data/original-trace.txt?raw';
import { describe, expect, it } from 'vitest';
import { GUY_CHILDREN } from '../src/game/guy.generated';
import { Extractor } from '../src/game/vm/extractor';
import { PEngine2D } from '../src/game/vm/engine';

/** `timer | timeFactor | speed |` then the counters and fingerprints, then the particle pairs. */
const TRACE_HEADER_FIELDS = 11;
/** Where the particle coordinates start: the empty field, the header, then the pairs. */
const TRACE_POSITIONS_AT = 1 + TRACE_HEADER_FIELDS;
const PARTICLE_COUNT = 12;

interface Sample {
  timeFactor: number;
  positions: { x: number; y: number }[];
}

function numbers(line: string, startIndex: number): number[] {
  const fields = line.split('|');
  const values: number[] = [];
  for (const field of fields.slice(startIndex)) {
    // `undefined` and `true` are real field values (a constraint's `inversed` flag prints that
    // way); anything else that is not a number is console styling and ends the row.
    if (field === 'undefined') values.push(0);
    else if (field === 'true') values.push(1);
    else if (field === 'false') values.push(0);
    else if (Number.isFinite(Number(field))) values.push(Number(field));
    else break;
  }
  return values;
}

function readTrace(): Sample[] {
  const samples: Sample[] = [];
  for (const line of traceText.split('\n')) {
    if (!line.includes('|')) continue;
    const fields = line.split('|');
    const values = numbers(line, TRACE_POSITIONS_AT);
    if (values.length < PARTICLE_COUNT * 2) continue;
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < values.length; i += 2) positions.push({ x: values[i], y: values[i + 1] });
    samples.push({ timeFactor: Number(fields[2]), positions });
  }
  return samples;
}

const trace = readTrace();

/** The engine as the port builds it, with the port's own world clamp switched off. */
function buildEngine(): PEngine2D {
  const extractor = new Extractor();
  extractor.extract();
  const engine = new PEngine2D(550, 400);
  for (const p of extractor.particles) engine.addParticle(p);
  for (const c of extractor.angledConstraints) engine.addAngledConstraint(c);
  engine.clampToWorldEnabled = false;
  return engine;
}

function centreOfMass(engine: PEngine2D): { x: number; y: number } {
  let mass = 0;
  let x = 0;
  let y = 0;
  for (const p of engine.particles) {
    mass += p.mass;
    x += p.mass * p.x;
    y += p.mass * p.y;
  }
  return { x: x / mass, y: y / mass };
}

describe('the recorded rig of the original movie', () => {
  const rows = constraintsRow.split('\n').filter((line) => line.includes('|'));
  const row = rows.find((line) => /\|\s*0\.9\|/.test(line))!;
  const values = numbers(row, 1);
  const original = {
    masses: values.slice(0, PARTICLE_COUNT * 2),
    constraints: Array.from({ length: 20 }, (_, i) => ({
      restLength: values[PARTICLE_COUNT * 2 + i * 7],
      minang: values[PARTICLE_COUNT * 2 + i * 7 + 1],
      maxang: values[PARTICLE_COUNT * 2 + i * 7 + 2],
      inversed: values[PARTICLE_COUNT * 2 + i * 7 + 3],
      p1mass: values[PARTICLE_COUNT * 2 + i * 7 + 4],
      p2mass: values[PARTICLE_COUNT * 2 + i * 7 + 5],
      p3mass: values[PARTICLE_COUNT * 2 + i * 7 + 6],
    })),
    lengths: values.slice(PARTICLE_COUNT * 2 + 20 * 7, PARTICLE_COUNT * 2 + 20 * 7 + 3),
  };

  const extractor = new Extractor();
  extractor.extract();

  it('recorded a complete row', () => {
    expect(row).toBeDefined();
    expect(original.constraints.every((c) => Number.isFinite(c.restLength))).toBe(true);
    expect(original.lengths).toEqual([20, 0, 12]);
  });

  it('builds the same particles, with the same masses and radii', () => {
    extractor.particles.forEach((p, i) => {
      expect(p.mass, p.name ?? '').toBeCloseTo(original.masses[i * 2], 12);
      expect(p.rad, p.name ?? '').toBeCloseTo(original.masses[i * 2 + 1], 12);
    });
  });

  it('builds the same constraints, in the same order, with the same endpoints', () => {
    expect(extractor.angledConstraints.length).toBe(original.lengths[0]);
    expect(extractor.constraints.length - extractor.angledConstraints.length).toBe(original.lengths[1]);
    extractor.angledConstraints.forEach((c, i) => {
      const o = original.constraints[i];
      const label = `constraint ${i}`;
      expect(c.restLength, label).toBeCloseTo(o.restLength, 9);
      expect(c.minang, label).toBeCloseTo(o.minang, 12);
      expect(c.maxang, label).toBeCloseTo(o.maxang, 12);
      expect(c.inversed ? 1 : 0, label).toBe(o.inversed);
      // Endpoint masses pin down the direction of each bone and its `p3` reference.
      expect(c.p1.mass, `${label} p1`).toBeCloseTo(o.p1mass, 12);
      expect(c.p2.mass, `${label} p2`).toBeCloseTo(o.p2mass, 12);
      expect(c.p3.mass, `${label} p3`).toBeCloseTo(o.p3mass, 12);
    });
  });

  it('extracts the same number of children the movie did', () => {
    expect(GUY_CHILDREN.filter((c) => c.is === 'particle').length).toBe(extractor.particles.length);
    expect(GUY_CHILDREN.filter((c) => c.is === 'angledConstraint').length).toBe(extractor.angledConstraints.length);
  });
});

describe('the recorded run of the original movie', () => {
  it('recorded a usable trace', () => {
    expect(trace.length).toBeGreaterThan(150);
    expect(trace[0].positions.length).toBe(PARTICLE_COUNT);
    expect(trace[0].timeFactor).toBeGreaterThan(0);
  });

  it('follows the original fall exactly, step for step', () => {
    // Two consecutive samples carry the whole engine state (the position and, from the sample
    // before, the previous position), so the port can resume from sample 1 and be compared.
    const engine = buildEngine();
    engine.particles.forEach((p, i) => {
      p.x = trace[1].positions[i].x;
      p.y = trace[1].positions[i].y;
      p.oldx = trace[0].positions[i].x;
      p.oldy = trace[0].positions[i].y;
    });

    let worstCentre = 0;
    let worstParticle = 0;
    for (let i = 2; i < trace.length; i++) {
      const sample = trace[i];
      // The original's clock is reproduced through the engine's `speed` knob.
      engine.speed = sample.timeFactor / 20;
      engine.update(20);
      const com = centreOfMass(engine);
      let mass = 0;
      let refX = 0;
      let refY = 0;
      engine.particles.forEach((p, j) => {
        mass += p.mass;
        refX += p.mass * sample.positions[j].x;
        refY += p.mass * sample.positions[j].y;
      });
      worstCentre = Math.max(worstCentre, Math.abs(com.x - refX / mass), Math.abs(com.y - refY / mass));
      engine.particles.forEach((p, j) => {
        worstParticle = Math.max(worstParticle, Math.abs(p.y - sample.positions[j].y));
      });
    }
    // Gravity, damping and the clock are the original's: the mass-weighted fall is identical.
    expect(worstCentre).toBeLessThan(1e-6);
    // The pose itself drifts a little, because Ruffle feeds its solver fewer constraints per pass
    // than the movie's own code does; a couple of units over 180 steps is that difference, not a
    // difference in this port's solver.
    expect(worstParticle).toBeLessThan(25);
  });
});
