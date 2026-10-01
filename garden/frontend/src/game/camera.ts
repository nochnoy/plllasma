import { STAGE_WIDTH } from './stage';

/**
 * How much of the view, each side of its middle, is the subject's own to move in: a quarter of it, so
 * the middle half of the window is hers.
 *
 * This is the camera's *dead zone*, and it is what keeps the camera unobtrusive rather than merely
 * smooth: a doll fidgeting on the floor, a small drag this way and that, a knot swung a little — none
 * of it moves the walls of the room, because none of it leaves the middle half of the view. The camera
 * sets off only when she goes further than that, and it stops the moment she is back inside — the hall
 * slides under the player's hands only when there is somewhere to get to.
 *
 * The number is one of the knobs of the feel (the others are {@link GLIDE_MS} and the edge assist's own
 * three below): a wider dead zone is a calmer room that follows less, a narrower one is a camera that
 * tracks her more closely and moves more for it.
 */
const SLACK = 0.25;
/**
 * How quickly the camera settles where it is going, in milliseconds: the gap still open after `t` is
 * `e ^ -(t / GLIDE_MS)` of what it was, so a fifth of a second closes about two thirds of it.
 *
 * The glide is an exponential for one reason and it is not that it looks nice — although it does, being
 * the curve that spends as much of its slowing-down at the end as it does: it is the one smooth step
 * that does not care how the time came. A long frame and the many short ones that add up to it move the
 * camera by the same total distance, so a 30 Hz phone and a 144 Hz monitor pan the same way, and the
 * `dt` a stalled tab clamps to 250 ms cannot make the camera jump.
 */
const GLIDE_MS = 200;
/**
 * How close to the side of the view a dragging hand has to come before the camera starts helping it
 * along: a fraction of the view's own width, counted in from either side.
 *
 * Dragging a thing is the one thing the window's own edges get in the way of — the hand runs out of
 * glass while the world still has room in it — and this is the band in which the camera answers that:
 * it pans the same way the hand is going, carrying the hand's own anchor with it (`Game.carryHand`), so
 * that what the hand holds stays under it while the room slides past. On a phone the band is about a
 * finger's width; on a cropped desktop window it is wider, as the room is.
 */
const EDGE_BAND = 0.15;
/**
 * How fast the camera pans for a hand resting hard against the side of the window, in world pixels a
 * second.
 *
 * It is a walking pace rather than a scroll: the whole of a phone's pan is six hundred world pixels, and
 * at this speed crossing it takes two seconds of a resting finger — help, but help the hand could
 * outrun. The pull of the hold keeps up with it easily (a third of the remaining gap every step), so
 * what is held rides under the hand instead of being left behind by its own camera.
 */
const EDGE_SPEED = 300;
/**
 * How quickly the assist gathers its speed and sheds it again, in milliseconds — the same exponential
 * shape as the glide, for the same reason.
 *
 * Without it a hand crossing into the band would start the camera at full speed on the very frame, and
 * the room would lurch under a hand that had only drifted near the edge; with it the pan arrives the
 * way the glide leaves — as a pace the camera grows into and out of. It also softens the assist's own
 * going away: a hand lifted at the edge leaves a camera that eases to a stop over a couple of hundred
 * milliseconds rather than freezing on the spot.
 */
const EDGE_RISE_MS = 120;

/**
 * The camera of a narrow window: where along the hall it is looking, and how it follows the doll there.
 *
 * The world is one rectangle on every screen (`stage.ts`), so a window narrower than the hall shows a
 * slice of one fixed room — and this is the thing that decides *which* slice. It has exactly one
 * subject — the first doll on the stage (`Scene` hands her in, the middle of her body), whether she is
 * the one being played with or the one a tape is walking — and exactly one axis: it follows her along
 * the hall and never up it, because the vertical half of the view is already the right one (the floor
 * is at the foot of the window whatever the window's height, `stageView`), and a doll that falls is a
 * doll the player has just let go of.
 *
 * It moves for two reasons, and they are kept apart on purpose:
 *
 * - the **follow** ({@link SLACK}, {@link GLIDE_MS}) is the room's own business — the camera gliding to
 *   keep the subject in the middle half of the view, and never moving what a hand is holding, because
 *   the hand's anchor is kept against exactly this (`Game.grab`);
 * - the **edge assist** ({@link EDGE_BAND}, {@link EDGE_SPEED}, {@link EDGE_RISE_MS}) is the hand's own
 *   business — a drag pressed against the side of the window, with the camera panning that way and
 *   carrying the anchor with it for as long as it does. This is the one deliberate exception to the
 *   follow's promise, and it is why the assist reports how far it carried (`carried`): the anchor moves
 *   by that and nothing more, so the two motions still never *add* by accident — what the assist adds,
 *   it says.
 *
 * While the assist is at speed the follow is suspended, in proportion to how much of the camera's speed
 * is the assist's: a hand dragging a *knot* (or a second doll) to the edge has a subject that stays
 * behind in the middle of the room, and a follow still pulling there would tug the camera back against
 * the very hand the assist is carrying — the knot would march off the edge of the view while the
 * finger stood still on it. Suspended, the camera at the edge is the hand's own and nothing else.
 *
 * It is state, and the state is two numbers. Everything else about the fit — how wide the slice is, how
 * big it is drawn, where the black is — is the window's own doing and stays in `stageView`; this class
 * is only the panning of it, kept apart so that it can be asked about in `tests/camera.test.ts` with
 * no renderer at all. The clamp that keeps the camera inside the hall lives *there* as well as here
 * (`pannedLeft`): there it is a promise about any camera it is handed, and here it is what the follow
 * itself has to work within.
 */
export class Camera {
  /**
   * Where the camera is looking right now — the world x at the middle of the view, not the left edge
   * of it. Zero until the subject has ever left the middle half of the view, and always inside the
   * hall.
   */
  private looking = 0;
  /**
   * The assist's own speed right now, in world pixels a second — the asked-for push, gathered and shed
   * over {@link EDGE_RISE_MS}. Kept as state rather than taken from the hand each frame so that a hand
   * crossing into the band or out of it cannot make the camera change pace in one frame.
   */
  private pushing = 0;
  /**
   * How far the last frame's assist actually carried the hand, in world px — the clamped travel, which
   * is nothing once the camera is against the end of the hall however hard the hand is leaning.
   */
  private frameCarried = 0;
  /**
   * Everything the assist has ever carried a hand, in world px, signed. A diagnostic for the headless
   * smoke test, which has to know where a knot dragged into the side of the window must end up: where
   * the hand carried it, plus this.
   */
  private tally = 0;

  /** Where the camera is looking right now: the world x the view is centred on. */
  get x(): number {
    return this.looking;
  }

  /**
   * How far this camera's last frame carried a dragging hand, in world px — what the hand's anchor
   * must be moved by to stay under the hand (`Game.carryHand`). Zero whenever no assist is running,
   * and zero at the end of the hall.
   */
  get carried(): number {
    return this.frameCarried;
  }

  /** Everything the assist has ever carried a hand — a tally the smoke test reads (`Scene.inspect`). */
  get carriedSoFar(): number {
    return this.tally;
  }

  /**
   * Moves the camera one frame closer to the subject and says where it is looking now — the number to
   * hand `stageView` as its `cameraX`.
   *
   * The subject is her place in the world, or null when there is nothing to follow: an empty stage
   * glides the camera back to the middle of the hall, at the same pace it glides anywhere, so the room
   * puts itself away rather than standing panned at a doll who is gone.
   *
   * `viewWidth` is how much of the world the window shows (the view's own `width`): it is what both of
   * the camera's rules are measured against — the dead zone is a fraction of it, and the pan is
   * clamped by what is left of the hall once it is taken out. It does not depend on where the camera
   * is, so the renderer may ask for it with the camera wherever it likes.
   *
   * `hand` is where a dragging hand is holding, as a fraction of the way across the view — 0 at its
   * left edge, 1 at its right, null when nothing is being dragged. Near enough to either side
   * ({@link EDGE_BAND}) it is the edge assist's say: the camera pans that way at up to
   * {@link EDGE_SPEED}, reports the travel as {@link carried} for the hand's anchor to be moved by, and
   * suspends the follow while it does. Null leaves the camera to the subject alone.
   */
  follow(subject: number | null, viewWidth: number, elapsedMs: number, hand: number | null = null): number {
    // The push the hand is asking for, if it is asking: how deep into the nearer band it is, scaled
    // from nothing at the band's own edge to the full pace against the side of the window itself. A
    // hand out in the letterbox past the view asks no harder than one on the last pixel of it.
    const across = hand === null ? 0.5 : Math.min(Math.max(hand, 0), 1);
    const depth = Math.min(
      Math.max(Math.abs(across * 2 - 1) - (1 - 2 * EDGE_BAND), 0) / (2 * EDGE_BAND),
      1,
    );
    const wanted = hand === null ? 0 : Math.sign(across * 2 - 1) * depth * EDGE_SPEED;
    // The camera's destination: where she is, brought back to the near edge of the dead zone — or
    // exactly where the camera is, if she never left it. Written as one clamp so that the middle of
    // the view follows her *edge* rather than her centre: the camera chases the nearest place that
    // leaves her her freedom, and stops the frame it gets there. Nothing to follow is the one subject
    // with no freedom: the empty room is aimed straight at its own middle.
    const slack = viewWidth * SLACK;
    const target =
      subject === null ? 0 : subject - Math.min(Math.max(subject - this.looking, -slack), slack);
    // The glide itself — faded out by the assist's share of the camera's pace, which is the follow
    // standing aside for a hand being carried (see the class above for what happens if it does not).
    // A target already reached — she is in the dead zone, or the frame took no time — moves nothing.
    const glide =
      (1 - Math.exp(-elapsedMs / GLIDE_MS)) * (1 - Math.abs(this.pushing) / EDGE_SPEED);
    this.looking += (target - this.looking) * glide;
    // The assist's own pace, gathered and shed over its own short time, and then its travel for this
    // frame: the step, stopped by the hall's own side — a hand leaning on the end of the room leans on
    // something that does not move, and carries nothing once it has got there.
    this.pushing += (wanted - this.pushing) * (1 - Math.exp(-elapsedMs / EDGE_RISE_MS));
    const reach = Math.max(0, (STAGE_WIDTH - viewWidth) / 2);
    const carried = Math.min(
      Math.max(this.looking + (this.pushing * elapsedMs) / 1000, -reach),
      reach,
    ) - this.looking;
    this.looking += carried;
    this.frameCarried = carried;
    this.tally += carried;
    return this.looking;
  }
}
