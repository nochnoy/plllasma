/**
 * The world the port plays in: the rectangle every coordinate in the game is measured in.
 *
 * The movie's own stage was 550x400 and its physics had no walls at all — what stopped a doll was a
 * ball, and the balls are gone from the port. So the room she falls through is the port's own, and it
 * is exactly the picture of the hall (`public/assets/bg.png`, 1000x740): the theatre in which
 * everything happens is the world's own rectangle, drawn texel to texel at 1:1. The rig is still
 * written in the movie's own units — the doll is the size the author drew her, a texel of her artwork
 * to a world pixel — so the room is room *around* her rather than a bigger doll.
 *
 * These numbers live in their own module because everything about the world — the rig, the ropes, the
 * walls — is expressed in them and none of it should have to import the renderer: the world model is
 * plain TypeScript and is tested in Node, where PixiJS cannot run.
 *
 * The rectangle is the *world*, not the window: this is the frame every coordinate is written in, and
 * how much of it a screen shows is {@link stageView}'s own business. A window with room for the whole
 * hall shows the whole hall, black around it; a narrower one shows a slice of it, cropping the picture
 * at the sides, and a shorter one crops the picture from the top (the hall's own bottom edge is what
 * stays put) — those two croppings reach the window's own edges, since there is nothing to spare.
 */
export const STAGE_WIDTH = 1000;
export const STAGE_HEIGHT = 740;
/** The world's own bottom edge, in world coordinates: the line the hall's own picture ends on. */
export const STAGE_BOTTOM = STAGE_HEIGHT / 2;

/**
 * The narrowest, and the shortest, the world is ever drawn at 1:1 — in world pixels.
 *
 * A window with less room than this gets a *smaller* world rather than a narrower one (see
 * {@link StageView.scale}): below this the picture is scaled down, texel and a half to the pixel, so
 * the world stays whole instead of turning into a keyhole. The number came out of the interface: 400
 * world pixels at 1:1 are 400 CSS pixels, and the bar and one card need 204 of them, so the whole of
 * the menu fits on a screen of the smallest size the game draws.
 */
export const MIN_WORLD_WIDTH = 400;
export const MIN_WORLD_HEIGHT = 400;

/**
 * How far the walls stand inside the picture, in world pixels: the scenery down each side
 * ({@link WALL_MARGIN_X}) and the band of floor at the foot of the picture ({@link WALL_MARGIN_Y}).
 *
 * The picture is bigger than the part of the room the doll is allowed to fall through, and these are
 * the port's own numbers rather than the movie's: nothing in the artwork marks them (see §8 of
 * `docs/assets.md`). The point of them is that what she hits has to be something the player can watch
 * her hit — scenery along the sides, a band of floor at the foot of the picture — and that the walls
 * should not be the picture's own edges, where a doll lying on the floor would look as if she were
 * about to fall out of the frame. What they leave is the play area: {@link WALL_WIDTH} by
 * {@link WALL_HEIGHT} world pixels, centred, which is the box `PEngine2D` is built with.
 *
 * The two sides and the floor are inside the picture; the fourth wall is well above it
 * ({@link CEILING_MARGIN}) and no window ever reaches it. A rope is not confined to the box at all,
 * since a knot is the player's own drawing and goes where they put it (`Particle2D.clamped`).
 *
 * The sides stand much closer to the picture's own edges than the floor does — 136 of scenery each, against
 * 163 of floor — which is what makes the play area most of the hall: what she hits at the sides is very
 * nearly the picture's own frame.
 *
 * What the walls are built from is {@link WALL_WIDTH} — the widest play area there is, and the only
 * one: the world is one size on every screen, so the walls are too. A window too narrow to show them
 * crops the scenery and the room alike, and the doll can be at play beyond the edge of what it shows —
 * which is what the camera of a small screen is ({@link stageView}): a crop of one fixed room rather
 * than a smaller room.
 */
export const WALL_MARGIN_X = 136;
export const WALL_MARGIN_Y = 163;

/** The play area the walls enclose, centred in the world: 728x414 world pixels. */
export const WALL_WIDTH = STAGE_WIDTH - 2 * WALL_MARGIN_X;
export const WALL_HEIGHT = STAGE_HEIGHT - 2 * WALL_MARGIN_Y;

/**
 * How far above the top of the picture she may be hauled, in world pixels: the ceiling of the play
 * area, the one wall of it that no window ever shows.
 *
 * The movie's own box was closed on all four sides and the port opened the top, so that a rope could
 * haul her up and out of the frame instead of stopping her at it like a balloon on a string. What it
 * is open *onto* is one more location the size of the picture: the room over the hall is exactly
 * {@link STAGE_HEIGHT} tall, so past the top edge of the screen she may fly the height of the
 * location and no further. That is room a rope cannot reach (a knot is nailed inside the visible
 * picture, `World.onStage`) and more than a thrown doll has ever used, and it keeps her somewhere the
 * physics can find her — a doll with nothing above her at all is a doll who can be flung until she is
 * lost.
 *
 * It is measured from the picture's own top edge, which never moves: the world is one size, and so is
 * the room over it. The height is the location's own — the same `STAGE_HEIGHT` the picture is measured
 * in, the size of `bg.png` — rather than a number invented for the wall, so the hall and the sky over
 * it are counted in one unit.
 */
export const CEILING_MARGIN = STAGE_HEIGHT;

/**
 * The top of the picture, in world coordinates — the line {@link ceilingFor} measures the room above
 * the picture from.
 */
export function visibleTop(height: number): number {
  return STAGE_BOTTOM - height;
}

/** The ceiling of the play area — see {@link CEILING_MARGIN}. */
export function ceilingFor(viewTop: number): number {
  return viewTop - CEILING_MARGIN;
}

/**
 * How large a world pixel may be drawn, in CSS pixels — one, so the world never grows on screen.
 *
 * The movie's bitmaps are authored at about one texel per world pixel and the port bakes them at
 * exactly that (see `docs/assets.md`), so this is what keeps the picture exact: a texel of her body is
 * a point on screen, nothing is ever resampled upwards, and nothing is ever soft because of it. A
 * window larger than the world gets more black around it rather than a bigger doll — the Flash player
 * would have stretched the stage to fill it, which is what made the girl soft on a big screen there.
 *
 * The world is bigger than most windows' comfortable picture, so in practice this cap is reached on
 * any ordinary desktop: there the world is drawn at exactly its own size, the doll at a CSS pixel per
 * texel, and the window's own margin around it is all the black there is. The movie's own
 * `_root._xscale = 80` is *not* used: the port's world is the picture of the hall, so the hall fills
 * the world and there is no ring around it — the only thing around the picture is the window.
 * `Scene` clamps to this and to the fit, and a world scaled *down* (a window with less room than
 * {@link MIN_WORLD_WIDTH} x {@link MIN_WORLD_HEIGHT}) is the only other thing the scale can be.
 */
export const MAX_WORLD_SCALE = 1;

/**
 * How much of the world a canvas shows, and where — the whole of the responsive rule, in one place.
 *
 * It is a pure function of the canvas' own size and of where the camera is looking (see `camera.ts`),
 * so what the game does on a narrow phone or a short window is asked of it in `tests/stage.test.ts`
 * rather than by looking at a screenshot.
 *
 * The rules, in the order they apply:
 *
 * - **the world fills the window.** The visible world is as much of the hall as fits in the canvas, and
 *   it is drawn *onto* the canvas' own edges when it does not fit — nothing of the picture is given away
 *   to a black frame. The visible box **hangs off the bottom**: the hall's own bottom edge is the floor
 *   of the picture, so a short window crops the picture from the top and the floor stays exactly where
 *   it was. Sideways the box is centred — *unless the camera has followed the doll along the hall*
 *   (`cameraX`): a window narrower than the hall is a window onto one fixed room, and the camera is the
 *   thing that decides which slice of that room it is looking at. The camera never looks past the hall's
 *   own sides ({@link pannedLeft}): there is nothing out there to show but the black the window already
 *   has;
 * - **black is what is left over**, and it is left over in one axis at a time: a window *wider* than the
 *   hall gets black beside the picture, a window *taller* than it gets black above and below, and a
 *   window of both gets black all round. The picture itself never moves to make room for it — it stays
 *   centred, and the doll with it;
 * - **the world never shows less than {@link MIN_WORLD_WIDTH} x {@link MIN_WORLD_HEIGHT}.** A window
 *   with less room than that gets a *smaller* world — {@link StageView.scale} below 1, the whole thing
 *   drawn at once, a texel to less than a pixel of screen — instead of a keyhole onto it;
 * - **and never more than the hall itself**: a big window gets the whole 1000x740 and black around it,
 *   at one world pixel to the CSS pixel exactly ({@link MAX_WORLD_SCALE}).
 *
 * This is the *camera*, and it is the camera's whole job: the world behind it — the physics and its
 * walls — is the same one rectangle whatever the window does, so a small screen shows less of one room
 * rather than a smaller room. The vertical half of the camera is this function's own and never moves
 * (the floor is always at the foot of the window); the horizontal half is where the camera has got to,
 * which is the `Camera`'s own business (`camera.ts`) and not a pure function of the window at all.
 */
export function stageView(canvasWidth: number, canvasHeight: number, cameraX = 0): StageView {
  // The one thing that is not the fit: a window with less room than the smallest world zooms out, so
  // that the world it shows is still a world rather than a couple of hundred pixels of it.
  const scale = Math.min(
    MAX_WORLD_SCALE,
    canvasWidth / MIN_WORLD_WIDTH,
    canvasHeight / MIN_WORLD_HEIGHT,
  );
  const width = Math.min(STAGE_WIDTH, canvasWidth / scale);
  const height = Math.min(STAGE_HEIGHT, canvasHeight / scale);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  return {
    width,
    height,
    left: pannedLeft(width, cameraX),
    // Bottom-anchored: the visible box is the *foot* of the hall, so cropping takes the top away and
    // the floor, the floor's shadow and everything standing on it stay where they were.
    top: visibleTop(height),
    scale,
    // Centred in the canvas: what is left of the room when the world is smaller than it — a window
    // bigger than the hall, or one small enough to have shrunk the world — is black on both sides of
    // the picture, an even frame rather than a picture jammed into a corner.
    x: (canvasWidth - drawnWidth) / 2,
    y: (canvasHeight - drawnHeight) / 2,
    // The walls do not follow the window (see {@link WALL_WIDTH}): this is the one play area there is.
    wallWidth: WALL_WIDTH,
  };
}

/**
 * The left edge of the visible box for a camera looking down `cameraX` of the hall, in world
 * coordinates — the whole of the camera's horizontal freedom, as one clamp.
 *
 * The camera pans *inside* the picture and never past its own sides: beyond the hall there is
 * nothing to show but the black the window already has, so a view asked to look further than the
 * wall's own share of the pan stands at the wall instead. A window with the whole hall's width in it
 * has nowhere to pan at all (the reach is nothing), and such a window sees the hall centred whatever
 * the camera is doing — which is why a desktop never sees the camera move, however many dolls it is
 * holding.
 */
function pannedLeft(width: number, cameraX: number): number {
  const reach = Math.max(0, (STAGE_WIDTH - width) / 2);
  const centre = Math.min(Math.max(cameraX, -reach), reach);
  return centre - width / 2;
}

/**
 * How much of the world is on screen, in the world's own pixels, and where it is drawn.
 *
 * `left`/`top` are where the visible box sits in the *world's* frame — its corners in the coordinates
 * everything else is written in — while `x`/`y` are where that box is drawn on the canvas, in CSS
 * pixels. `width`/`height` are the world's own size in the picture's pixels, so the two are tied by
 * {@link scale}: a hundred world pixels are `scale * 100` CSS pixels on screen.
 */
export interface StageView {
  /** How much of the world is visible, in world pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * The visible box's left/top corner, in world coordinates. The `top` is the fit's own (the box hangs
   * off the hall's bottom edge); the `left` is where the camera has followed the doll to, clamped
   * inside the hall (`stageView`'s `cameraX`, and `Camera` behind it).
   */
  readonly left: number;
  readonly top: number;
  /** World pixels to CSS pixels. 1 unless the window had less room than {@link MIN_WORLD_WIDTH}. */
  readonly scale: number;
  /** Where the visible box is drawn, in canvas (CSS) pixels. */
  readonly x: number;
  readonly y: number;
  /** The play area this view leaves the walls, in world pixels — always {@link WALL_WIDTH}. */
  readonly wallWidth: number;
}
