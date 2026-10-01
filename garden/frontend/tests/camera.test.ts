import { describe, expect, it } from 'vitest';
import { Camera } from '../src/game/camera';
import { STAGE_WIDTH } from '../src/game/stage';

/**
 * The camera of a narrow window: how it follows the first doll along the hall, and everything it
 * promises about the way it moves.
 *
 * All of it is `Camera` in `camera.ts` — two numbers of state and a follow that is asked every frame —
 * so the behaviour of a phone is asked of it here in Node, where no renderer can run. The promises:
 *
 * - the middle half of the view is hers: the camera does not move at all while she is in it, so a
 *   fidget on the floor or a small drag never slides the room under the player;
 * - when she leaves it the camera glides after her, arriving at the *edge* of the dead zone rather
 *   than at her — smooth, monotonic, and never overshooting past where it is going;
 * - the glide is the same whatever the frames are like: a long frame and the many short ones that
 *   add up to it pan the same distance, so the refresh rate of the screen is nothing to the camera;
 * - and it never looks past the hall: the pan is clamped by what the window leaves of it, and a
 *   window with the whole hall in it has no pan at all;
 * - and for a hand dragging against the side of the window there is the edge assist: the camera pans
 *   that way, gathering and shedding its pace rather than lurching into it, carrying the hand by
 *   exactly as much as it says it did and no more, suspending the follow so the two never tug the
 *   camera both ways, and stopping at the end of the hall however hard the hand leans.
 */

/** Runs the camera for `ms` of the game's own 20 ms frames and says where it ended up looking. */
function glide(subject: number | null, viewWidth: number, ms: number): number {
  const camera = new Camera();
  for (let t = 0; t < ms; t += 20) camera.follow(subject, viewWidth, 20);
  return camera.x;
}

/** Runs the camera with a hand holding at `across` of the view (0 its left edge, 1 its right). */
function carry(subject: number | null, hand: number | null, viewWidth: number, ms: number): Camera {
  const camera = new Camera();
  for (let t = 0; t < ms; t += 20) camera.follow(subject, viewWidth, 20, hand);
  return camera;
}

describe('the camera of a narrow window', () => {
  it('does not move while she is in the middle half of the view', () => {
    // A view 400 world pixels wide leaves her ±100 of its middle to move in. An hour of frames with
    // her at 30 — or at −100 exactly, the dead zone's own edge — and the camera has not moved: the
    // room stands still under everything that does not leave the middle of it.
    for (const at of [-100, -30, 0, 30, 100]) expect(glide(at, 400, 3_600_000)).toBe(0);
  });

  it('glides after her, arriving at the edge of the dead zone and never past her', () => {
    // She has gone to +300 in a view 400 wide: the camera's destination is 200 — her place less the
    // 100 of freedom — and it approaches that place without oscillation or overshoot, one monotonic
    // run of frames that gets closer and never passes it. Four seconds is twenty of the glide's own
    // times, which is to say it has arrived.
    const camera = new Camera();
    let before = 0;
    for (let t = 0; t < 4_000; t += 20) {
      const at = camera.follow(300, 400, 20);
      expect(at).toBeGreaterThanOrEqual(before);
      expect(at).toBeLessThanOrEqual(200);
      before = at;
    }
    expect(before).toBeCloseTo(200, 3);
  });

  it('pans the same distance whatever the frames it is given', () => {
    // Two seconds of the same camera, fed as 50 frames of 20 ms in one run and as 20 frames of 50 ms
    // in the other: an exponential glide is the one smooth step that does not care how its time came,
    // which is what makes the camera identical on a 30 Hz phone and a 144 Hz monitor.
    const fine = new Camera();
    const coarse = new Camera();
    for (let t = 0; t < 2_000; t += 20) fine.follow(300, 400, 20);
    for (let t = 0; t < 2_000; t += 50) coarse.follow(300, 400, 50);
    expect(coarse.x).toBeCloseTo(fine.x, 6);
  });

  it('never looks past the hall, however far she is flung', () => {
    // The pan is clamped by what the window leaves of the hall: a view 400 wide has ±300 to look
    // around in, and a doll flung clean out of the world does not drag the camera over the edge of
    // the picture — there is nothing out there but the black the window already has.
    expect(glide(4000, 400, 10_000)).toBeCloseTo((STAGE_WIDTH - 400) / 2, 6);
    expect(glide(-4000, 400, 10_000)).toBeCloseTo(-(STAGE_WIDTH - 400) / 2, 6);
  });

  it('has no pan of its own on a window that shows the whole hall', () => {
    // A window with the hall's whole width in it has nowhere to look: the view is centred on the
    // world whatever the camera does, so the camera stays put at its own middle — which is why a
    // desktop never sees any of this, however many dolls it is holding.
    expect(glide(400, STAGE_WIDTH, 10_000)).toBe(0);
    expect(glide(-400, 2000, 10_000)).toBe(0);
  });

  it('puts itself back to the middle of the hall when there is nothing to follow', () => {
    // The last doll taken off the stage leaves the camera looking at where she was: with no subject
    // there is no dead zone either — the empty room glides back to its own middle, at the same pace
    // it glides anywhere, and the room puts itself away rather than standing panned at a doll who
    // is gone.
    const camera = new Camera();
    for (let t = 0; t < 5_000; t += 20) camera.follow(4000, 400, 20);
    expect(camera.x).toBeCloseTo(300, 3);
    for (let t = 0; t < 5_000; t += 20) camera.follow(null, 400, 20);
    expect(camera.x).toBeCloseTo(0, 3);
  });
});

describe('the edge assist of a dragging hand', () => {
  it('carries a hand resting against the side of the window, and says how far', () => {
    // A hand holding at the very right edge of a view 400 wide, with the subject parked in the middle
    // of the room where the follow has no opinion: the camera pans right at the assist's own pace —
    // three hundred world pixels a second, less the bit the ramp takes to get there — and the travel
    // is reported as it happens, because that is what the hand's anchor is moved by. A second of it
    // covers most of a phone's whole pan. The tally and the place differ by the follow's one brief
    // contribution while the pace was still gathering — a fraction of a pixel, and the last overlap
    // there will ever be between the two motions.
    const camera = carry(0, 1, 400, 1_000);
    expect(camera.x).toBeGreaterThan(180);
    expect(camera.x).toBeLessThanOrEqual(300);
    expect(Math.abs(camera.carriedSoFar - camera.x)).toBeLessThan(5);
  });

  it('does nothing for a hand in the middle of the view, or for none at all', () => {
    // The assist is a drag pressed against the *side* of the window: a hand in the middle of it —
    // where every ordinary drag spends its time — asks for nothing, and no hand at all (the camera
    // following a free doll, or a playback) asks for less.
    for (const hand of [0.2, 0.5, 0.8, null]) {
      const camera = carry(0, hand, 400, 2_000);
      expect(camera.x).toBe(0);
      expect(camera.carriedSoFar).toBe(0);
    }
  });

  it('gathers its pace and sheds it again, rather than lurching', () => {
    // The first frame of a hand landing on the edge carries a fraction of a full-speed step — the
    // assist comes up to speed over its own eighth of a second — and a hand lifted off the edge
    // leaves a camera that eases to a stop over the same time: still carrying a dwindling amount
    // for a few frames, and under a tenth of a pixel a frame within half a second.
    const camera = new Camera();
    camera.follow(0, 400, 20, 1);
    expect(camera.carried).toBeLessThan(0.4 * ((300 * 20) / 1000));
    for (let t = 0; t < 1_000; t += 20) camera.follow(0, 400, 20, 1);
    let last = 0;
    for (let t = 0; t < 500; t += 20) {
      camera.follow(0, 400, 20, null);
      last = camera.carried;
    }
    expect(Math.abs(last)).toBeLessThan(0.1);
  });

  it('suspends the follow while it carries, so the two never tug both ways', () => {
    // Dragging a knot — or a second doll — to the edge leaves the *subject* behind in the middle of
    // the room, and a follow still pulling there would drag the camera back against the hand: the
    // camera would stall a third of the way along its pan while the knot marched off the edge of the
    // view. Suspended, the camera gives the hand the whole of the assist's pace instead — after the
    // better part of a second it is well past where a tug-of-war would have left it.
    const camera = carry(0, 1, 400, 800);
    expect(camera.x).toBeGreaterThan(170);
  });

  it('carries the other way just as well', () => {
    // A hand against the *left* side of the window: the same help, the other way along the hall, and
    // the tally signs itself accordingly.
    const camera = carry(0, 0, 400, 1_000);
    expect(camera.x).toBeLessThan(-180);
    expect(camera.carriedSoFar).toBeLessThan(0);
    expect(Math.abs(camera.carriedSoFar - camera.x)).toBeLessThan(5);
  });

  it('stops at the end of the hall, however hard the hand leans', () => {
    // The assist is clamped by the same hall the follow is: leaning on the end of the room leans on
    // something that does not move, and once the camera is against the side of the picture the hand
    // is carried no further — the assist's report goes quiet rather than winding the anchor on.
    const camera = carry(0, 1, 400, 10_000);
    expect(camera.x).toBe((STAGE_WIDTH - 400) / 2);
    let quiet = true;
    for (let t = 0; t < 200; t += 20) {
      camera.follow(0, 400, 20, 1);
      if (camera.carried !== 0) quiet = false;
    }
    expect(quiet).toBe(true);
  });
});
