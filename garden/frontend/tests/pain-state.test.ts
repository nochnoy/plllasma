import { describe, expect, it } from 'vitest';
import { BEYOND, CALM, EXTREME, HARD, WORRY, type PainLevel, type PainSource, type PoseSources } from '../src/game/pain';
import { FACE, PainState } from '../src/game/pain-state';

/**
 * The machine that decides which of the eight portraits a doll wears, and the rules it was written to.
 *
 * The pose is not read here at all: all the machine looks at is the step each of the four sources of
 * pain reached (`pain.ts`) and how long it has been that way, so the tests hand it steps and clocks and
 * nothing else. Time is the world's own 20 ms step, and every range the machine picks from is pinned to
 * its lowest end by a random that always says zero — the rules are about *when* a face changes, and the
 * numbers in them are checked at both ends by the tests that read the constants.
 */

/** The world's own step, as `World.step` runs it: 20 ms of real time per frame. */
const STEP = 20;

/** A random that always says `value`: every range collapses to its own lowest (or highest) end. */
function fixed(value: number): () => number {
  return () => value;
}

/** A pose whose four sources are all calm, except the ones named. */
function pose(levels: Partial<Record<keyof PoseSources, PainLevel>> = {}): PoseSources {
  const source = (name: keyof PoseSources): PainSource => {
    const level = levels[name] ?? CALM;
    return { amount: level * 100, level };
  };
  return {
    neck: source('neck'),
    waist: source('waist'),
    hip: source('hip'),
    split: { ...source('split'), back: 'knee1' },
  };
}

/** Runs the machine for `ms` of real time, the way the world runs it. */
function run(state: PainState, posed: PoseSources | null, ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += STEP) state.step(posed, STEP);
}

const calm = pose();
const extreme = pose({ neck: EXTREME });
const beyond = pose({ neck: BEYOND });

describe('a doll that has just been put on the stage', () => {
  it('is calm, and stays calm for as long as nothing hurts', () => {
    const state = new PainState(fixed(0));
    expect(state.shown).toBe(FACE.calm);
    run(state, calm, 20000);
    expect(state.shown).toBe(FACE.calm);
    // A rig that cannot be read at all is a pose that hurts nothing, and the clock keeps running: this
    // is the same face, not a machine that stopped.
    run(state, null, 20000);
    expect(state.shown).toBe(FACE.calm);
  });

  it('goes back to calm only after ten seconds of nothing hurting', () => {
    const state = new PainState(fixed(0));
    run(state, pose({ neck: WORRY }), 500);
    expect(state.shown).toBe(FACE.worry);
    // Nothing hurts now, but something did a moment ago: that is the face for the next ten seconds.
    run(state, calm, 9980);
    expect(state.shown).toBe(FACE.recent);
    run(state, calm, 40);
    expect(state.shown).toBe(FACE.calm);
  });
});

describe('a pose that hurts', () => {
  it('wears the worry face for a source at worry and the hard face for one at hard', () => {
    const state = new PainState(fixed(0));
    state.step(pose({ neck: WORRY }), STEP);
    expect(state.shown).toBe(FACE.worry);
    state.step(pose({ hip: HARD }), STEP);
    expect(state.shown).toBe(FACE.hard);
    // The worst source is what counts, not the sum of them: one source at hard under three calm ones is
    // the hard face, and a hard source next to an extreme one is the extreme face.
    state.step(pose({ neck: EXTREME, waist: HARD, hip: HARD, split: HARD }), STEP);
    expect(state.shown).toBe(FACE.arrival);
  });
});

describe('an extreme', () => {
  it('arrives on its own face, and keeps it whatever the pose does next', () => {
    const state = new PainState(fixed(0));
    state.step(extreme, STEP);
    expect(state.shown).toBe(FACE.arrival);
    // The pull is let go a moment later: the face stays for its own 1.5 seconds, because a face that
    // snapped back the instant the pose eased would read as nothing having happened at all.
    run(state, calm, 1380);
    expect(state.shown).toBe(FACE.arrival);
    // ...and not a frame longer: the step the flash runs out on is still its own.
    run(state, calm, 100);
    expect(state.shown).toBe(FACE.arrival);
    run(state, calm, 20);
    expect(state.shown).toBe(FACE.recent);
  });

  it('is a pose being held after three seconds, and takes turns after five', () => {
    const state = new PainState(fixed(0));
    run(state, extreme, 4000);
    expect(state.shown).toBe(FACE.held);
    // Past five seconds of it the two faces take turns, a 0.7 second turn each at this random: the
    // hard face first, then the held one, and back again — a pose held that long does not read as a
    // still picture.
    run(state, extreme, 1000);
    expect(state.shown).toBe(FACE.hard);
    run(state, extreme, 700);
    expect(state.shown).toBe(FACE.held);
    run(state, extreme, 700);
    expect(state.shown).toBe(FACE.hard);
  });

  it('comes back on the hard face when the break was short, and on the arrival face when it was not', () => {
    const short = new PainState(fixed(0));
    run(short, extreme, 2000);
    run(short, calm, 500);
    expect(short.shown).toBe(FACE.recent);
    short.step(extreme, STEP);
    // Under a second off is not a break: what the player did was keep pulling, so the hard face comes
    // back for its own 0.7 seconds rather than the arrival playing again.
    expect(short.shown).toBe(FACE.hard);
    run(short, extreme, 680);
    expect(short.shown).toBe(FACE.hard);
    run(short, extreme, 40);
    expect(short.shown).toBe(FACE.held);

    const long = new PainState(fixed(0));
    run(long, extreme, 2000);
    run(long, calm, 1500);
    long.step(extreme, STEP);
    expect(long.shown).toBe(FACE.arrival);
  });

  it('shows the arrival face again when the band is left in the middle of a long one', () => {
    // Down out of the band, and up past the rig's limits: either way the machine says *this changed*
    // for half a second before it settles on what the new pose is worth.
    const down = new PainState(fixed(0));
    run(down, extreme, 6000);
    down.step(calm, STEP);
    expect(down.shown).toBe(FACE.arrival);
    run(down, calm, 480);
    expect(down.shown).toBe(FACE.arrival);
    run(down, calm, 40);
    // ...and what it settles on is the breather: an extreme held that long has earned one (`FACE.rest`).
    expect(down.shown).toBe(FACE.rest);

    const up = new PainState(fixed(0));
    run(up, extreme, 6000);
    up.step(beyond, STEP);
    expect(up.shown).toBe(FACE.arrival);
    run(up, beyond, 520);
    expect(up.shown).toBe(FACE.beyond);
  });

  it('is a break even when the doll cannot be read at all', () => {
    // The rig is out of the machine's hands: a pose it cannot read is a pose that hurts nothing, so a
    // gap of a second is a gap of a second however it happened.
    const state = new PainState(fixed(0));
    run(state, extreme, 2000);
    run(state, null, 500);
    state.step(extreme, STEP);
    expect(state.shown).toBe(FACE.hard);
  });
});

describe('a pose past the rig’s own limits', () => {
  it('wears the beyond face once the extreme’s own pictures have had their time', () => {
    const state = new PainState(fixed(0));
    state.step(beyond, STEP);
    // Arriving there is still an arrival: the extreme's own faces run first, and the beyond face is what
    // is left when they are done.
    expect(state.shown).toBe(FACE.arrival);
    run(state, beyond, 1500);
    expect(state.shown).toBe(FACE.beyond);
  });

  it('wears the super face as soon as two sources are past their limits at once', () => {
    const state = new PainState(fixed(0));
    state.step(pose({ neck: BEYOND, waist: BEYOND }), STEP);
    expect(state.shown).toBe(FACE.super);
    expect(state.snapshot().beyondSources).toBe(2);
    // One source past its limit is not a super, and neither is a source at extreme next to one beyond.
    const one = new PainState(fixed(0));
    one.step(pose({ neck: BEYOND, waist: EXTREME }), STEP);
    expect(one.shown).toBe(FACE.arrival);
    run(one, pose({ neck: BEYOND, waist: EXTREME }), 1500);
    expect(one.shown).toBe(FACE.beyond);
  });

  it('comes back on the beyond face when a beyond break was short', () => {
    // A break down out of the band and a break that only dipped into the extreme band are both breaks:
    // the pose is past the rig's limits again inside a second, and what it wears is the beyond face.
    for (const dip of [calm, extreme]) {
      const state = new PainState(fixed(0));
      run(state, beyond, 2000);
      expect(state.shown).toBe(FACE.beyond);
      run(state, dip, 500);
      state.step(beyond, STEP);
      expect(state.shown).toBe(FACE.beyond);
    }
  });
});

describe('a pose that has stopped hurting, after something that hurt', () => {
  /**
   * The machine a step *after* `ms` of a held extreme: the pose has just let go, which is the moment the
   * flag is raised.
   */
  function afterExtreme(ms: number): PainState {
    const state = new PainState(fixed(0));
    run(state, extreme, ms);
    state.step(calm, STEP);
    return state;
  }

  it('wants a rest after an extreme that was held long enough, and not after a short one', () => {
    const brief = afterExtreme(1000);
    expect(brief.snapshot().restNeeded).toBe(false);
    run(brief, calm, 4000);
    expect(brief.shown).toBe(FACE.recent);

    // Four seconds of it is the mark, and past that she comes down owing herself one.
    const long = afterExtreme(5000);
    expect(long.snapshot().restNeeded).toBe(true);
    // The arrival is worn first, as always — it is not eaten into by the breather under it.
    expect(long.shown).toBe(FACE.arrival);
    run(long, calm, 1500);
    expect(long.shown).toBe(FACE.rest);
  });

  it('wants one after a beyond of any length at all', () => {
    const state = new PainState(fixed(0));
    run(state, beyond, 100);
    state.step(calm, STEP);
    expect(state.snapshot().restNeeded).toBe(true);
    run(state, calm, 2000);
    expect(state.shown).toBe(FACE.rest);
  });

  it('wears it for three seconds in the lull before it lets go of the flag', () => {
    const state = afterExtreme(5000);
    // The arrival lasts 500 ms here (the lowest end of its range) and is worn over the flag, not out of
    // it: the breather's own three seconds only start once the card is drawn on it.
    run(state, calm, 500 + 2900);
    expect(state.shown).toBe(FACE.rest);
    run(state, calm, 200);
    // Three seconds of it and the flag is down: the card is back on the lull it was drawn over.
    expect(state.snapshot().restNeeded).toBe(false);
    expect(state.shown).toBe(FACE.recent);
  });

  it('is worn out by five seconds of the hard face, with no breather at all', () => {
    const state = afterExtreme(5000);
    run(state, pose({ neck: HARD }), 6000);
    expect(state.snapshot().restNeeded).toBe(false);
    expect(state.shown).toBe(FACE.hard);
    // ...and coming down afterwards, there is nothing left to wear: the flag is gone.
    run(state, calm, 500);
    expect(state.shown).toBe(FACE.recent);
  });

  it('is interrupted by an extreme or a beyond, which leave the flag up', () => {
    const state = afterExtreme(5000);
    run(state, calm, 1500);
    expect(state.shown).toBe(FACE.rest);

    // Pulled again: the rest is put away and the extreme's own faces are what is worn.
    run(state, extreme, 1500);
    expect(state.shown).toBe(FACE.arrival);
    expect(state.snapshot().restNeeded).toBe(true);
    expect(state.snapshot().restLeft).toBe(0);

    // ...and the lull after *that* is a fresh three seconds of the breather, flag still up.
    run(state, calm, 2000);
    expect(state.shown).toBe(FACE.rest);
    expect(state.snapshot().restNeeded).toBe(true);
  });

  it('is not worn while there is still trouble to look at', () => {
    // The breather is for the lulls: a pose at *hard* wears the hard face, whatever the flag says, and
    // at *worry* it is the breather that wins over the worried face.
    const state = afterExtreme(5000);
    run(state, pose({ neck: HARD }), 2500);
    expect(state.shown).toBe(FACE.hard);
    run(state, pose({ neck: WORRY }), 500);
    expect(state.shown).toBe(FACE.rest);
  });
});

describe('the machine’s own bookkeeping', () => {
  it('is the step of the worst source, and counts the sources past their limits', () => {
    const state = new PainState(fixed(0));
    state.step(pose({ waist: HARD, hip: WORRY }), STEP);
    expect(state.snapshot()).toMatchObject({ portrait: FACE.hard, worst: HARD, beyondSources: 0 });
    state.step(pose({ waist: BEYOND, hip: BEYOND, neck: EXTREME }), STEP);
    expect(state.snapshot()).toMatchObject({ portrait: FACE.super, worst: BEYOND, beyondSources: 2 });
  });
});
