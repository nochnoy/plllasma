import { describe, expect, it } from 'vitest';
import {
  MIN_WORLD_HEIGHT,
  MIN_WORLD_WIDTH,
  STAGE_BOTTOM,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  WALL_WIDTH,
  stageView,
} from '../src/game/stage';
import { World } from '../src/game/world';

/**
 * The world on a screen: how much of the hall a window shows, how big it draws it, and where.
 *
 * All of it is `stageView` in `stage.ts` — a pure function of the canvas' own size, which is why the
 * game's behaviour on a phone is asked here rather than looked at in a screenshot. What the rules come
 * to, in the order they were asked for:
 *
 * - the visible world fills the window: a window smaller than the hall shows a *slice* of it, drawn
 *   onto the canvas' own edges, and black appears only where the window is *bigger* than the hall;
 * - a narrower window shows a narrower slice of the hall (cropped at the sides) rather than a shrunken
 *   one — the camera, cropping one fixed world, and never a smaller room: the walls of the physics
 *   are the same whatever the window does;
 * - a shorter window crops the picture from the *top*: the hall's own bottom edge is the floor, so it
 *   stays exactly where it was and the doll's floor with it — the one axis the camera never moves on;
 * - and where along the hall that slice sits is the camera's own following (`cameraX`, and `Camera`
 *   behind it): panned inside the picture, never past its sides, and centred again on a window that
 *   shows the whole hall's width;
 * - a window with less room than the smallest world (400x400) zooms out instead of cropping further.
 */

/** How much black a view leaves on each side of the picture, in CSS pixels. */
const frame = (view: { width: number; height: number; scale: number; x: number; y: number }) => ({
  left: view.x,
  top: view.y,
  right: view.x + view.width * view.scale,
  bottom: view.y + view.height * view.scale,
});

describe('the world on a screen', () => {
  it('fills the window, up to the hall’s own size and no further', () => {
    // A big window: the whole hall, one world pixel to the CSS pixel, centred, and black around it.
    const big = stageView(1600, 1200);
    expect([big.width, big.height, big.scale]).toEqual([STAGE_WIDTH, STAGE_HEIGHT, 1]);
    expect([big.x, big.y]).toEqual([(1600 - STAGE_WIDTH) / 2, (1200 - STAGE_HEIGHT) / 2]);
    expect([big.left, big.top]).toEqual([-STAGE_WIDTH / 2, -STAGE_HEIGHT / 2]);
    expect(big.wallWidth).toBe(WALL_WIDTH);

    // A window that is exactly the hall: the picture fills it edge to edge, with no frame at all.
    const exact = stageView(STAGE_WIDTH, STAGE_HEIGHT);
    expect([exact.width, exact.height, exact.scale]).toEqual([STAGE_WIDTH, STAGE_HEIGHT, 1]);
    expect([exact.x, exact.y]).toEqual([0, 0]);

    // Wider than the hall, but no taller: black on the sides and none above or below — a frame is what
    // is left over in *one* axis, not a border kept all round the picture.
    const wide = stageView(1600, 600);
    expect([wide.width, wide.height]).toEqual([STAGE_WIDTH, 600]);
    expect([wide.x, wide.y]).toEqual([300, 0]);
  });

  it('shows a narrower slice of the hall on a narrower window, and never a shrunken one', () => {
    const narrow = stageView(900, 700);
    // 900 px of window is 900 world pixels of hall: same scale, less picture, and it reaches the edges.
    expect(narrow.scale).toBe(1);
    expect(narrow.width).toBe(900);
    expect(narrow.height).toBe(700);
    expect(narrow.left).toBe(-narrow.width / 2);
    expect([narrow.x, narrow.y]).toEqual([0, 0]);
    // The walls are the same one room whatever the window shows of it: the camera crops the world,
    // and the world does not shrink to fit the window.
    expect(narrow.wallWidth).toBe(WALL_WIDTH);
    expect(stageView(500, 700).wallWidth).toBe(WALL_WIDTH);
  });

  it('crops the picture from the top, leaving the foot of it where it was', () => {
    // Windows of the same width, shorter and shorter: the hall's own bottom edge — the line the floor,
    // the shadows and everything standing on it are measured from, and the doll's floor with them —
    // stays on the canvas' own bottom edge, whether or not there is room for the whole picture above it.
    for (const height of [740, 700, 640, 500, 420]) {
      const view = stageView(1000, height);
      expect(view.height).toBe(height);
      // The visible box is the *foot* of the hall: its own bottom is always the hall's bottom...
      expect(view.top + view.height).toBeCloseTo(STAGE_BOTTOM, 6);
      // ...which is drawn on the last line of the canvas: the picture is cropped, not framed.
      expect(view.y).toBe(0);
      expect(view.y + view.height * view.scale).toBeCloseTo(height, 6);
    }

    // And a window tall enough for the whole picture is the other end of the same rule: the hall is
    // whole, so what is left over is black, evenly above and below it.
    const tall = stageView(1060, 1000);
    expect(tall.height).toBe(STAGE_HEIGHT);
    expect(tall.y).toBe((1000 - STAGE_HEIGHT) / 2);
  });

  it('zooms out rather than showing less than the smallest world', () => {
    // A phone held upright: not enough room for 400 world pixels across, plenty down the screen.
    const phone = stageView(390, 844);
    expect(phone.scale).toBeCloseTo(390 / MIN_WORLD_WIDTH, 6);
    expect(phone.scale).toBeLessThan(1);
    expect(phone.width).toBe(MIN_WORLD_WIDTH);
    expect(phone.height).toBe(STAGE_HEIGHT);
    // The whole world fits in the canvas: nothing is cropped away at this size, and what is left over
    // is the black above and below it.
    const phoneFrame = frame(phone);
    expect(phoneFrame.left).toBeCloseTo(0, 6);
    expect(phoneFrame.right).toBeCloseTo(390, 6);
    expect(phoneFrame.top).toBeGreaterThanOrEqual(-1e-9);

    // A window too small for the smallest world in both directions: scaled down to fit, whole, and
    // touching the canvas on every side.
    const tiny = stageView(300, 300);
    expect([tiny.width, tiny.height]).toEqual([MIN_WORLD_WIDTH, MIN_WORLD_HEIGHT]);
    expect(tiny.scale).toBeCloseTo(300 / MIN_WORLD_WIDTH, 6);
    expect(tiny.x).toBeCloseTo(0, 6);
    expect(tiny.y).toBeCloseTo(0, 6);
  });

  it('holds its own promises on every window there is', () => {
    for (const width of [120, 240, 320, 400, 500, 760, 900, 1000, 1400, 3200]) {
      for (const height of [120, 240, 320, 400, 500, 740, 900, 1600]) {
        for (const cameraX of [-1200, -1, 0, 1, 1200]) {
          const view = stageView(width, height, cameraX);
          const where = `a ${width}x${height} window with its camera at ${cameraX}`;
          // One scale for both axes, and never a magnified world.
          expect(view.scale).toBeGreaterThan(0);
          expect(view.scale).toBeLessThanOrEqual(1);
          // The world covers the window as far as the hall goes, and never spills past it.
          const drawn = { width: view.width * view.scale, height: view.height * view.scale };
          expect(drawn.width).toBeLessThanOrEqual(width + 1e-9);
          expect(drawn.height).toBeLessThanOrEqual(height + 1e-9);
          expect(view.width).toBeLessThanOrEqual(STAGE_WIDTH);
          expect(view.height).toBeLessThanOrEqual(STAGE_HEIGHT);
          // ...and it is never smaller than the smallest world the game shows: what does not fit is
          // cropped or scaled, not shown as a keyhole.
          expect(view.width).toBeGreaterThanOrEqual(MIN_WORLD_WIDTH - 1e-9);
          expect(view.height).toBeGreaterThanOrEqual(MIN_WORLD_HEIGHT - 1e-9);
          // The visible box is inside the hall, hanging off its bottom edge, and wherever the camera has
          // followed her to it shows no more of the world than the hall has.
          if (cameraX === 0) expect(view.left).toBeCloseTo(-view.width / 2, 6);
          expect(view.top + view.height).toBeCloseTo(STAGE_BOTTOM, 6);
          expect(view.left).toBeGreaterThanOrEqual(-STAGE_WIDTH / 2 - 1e-9);
          expect(view.left + view.width).toBeLessThanOrEqual(STAGE_WIDTH / 2 + 1e-9);
          expect(view.top).toBeGreaterThanOrEqual(-STAGE_HEIGHT / 2 - 1e-9);
          // On screen it is inside the canvas, with what is left over split evenly: the picture is centred,
          // so the frame around it is the same on both sides. In an axis the picture covers whole there is
          // no frame at all — no black between the window and a picture that does not fit into it.
          const box = frame(view);
          expect(box.left).toBeGreaterThanOrEqual(-1e-9);
          expect(box.top).toBeGreaterThanOrEqual(-1e-9);
          expect(box.right).toBeLessThanOrEqual(width + 1e-9);
          expect(box.bottom).toBeLessThanOrEqual(height + 1e-9);
          expect(box.left).toBeCloseTo(width - box.right, 6);
          expect(box.top).toBeCloseTo(height - box.bottom, 6);
          if (Math.abs(drawn.width - width) < 1e-9) expect(box.left).toBeCloseTo(0, 6);
          if (Math.abs(drawn.height - height) < 1e-9) expect(box.top).toBeCloseTo(0, 6);
          // The walls are the one room there is, whatever the window shows of it.
          expect(view.wallWidth).toBe(WALL_WIDTH);
          if (!Number.isFinite(view.wallWidth)) throw new Error(`${where} left the walls a ${view.wallWidth}`);
        }
      }
    }
  });

  it('pans along the hall to where the camera is looking, and moves nothing else', () => {
    // A view 500 world pixels wide has ±250 to look around in: a camera at +200 puts the box's left
    // edge at −50. Everything else about the view is the fit's own and does not move for the camera —
    // the scale, the frame, the walls — which is what keeps the interface where it was: the bar and
    // the cards are anchored to the *window*, and a pan slides the hall under them without moving
    // them an inch.
    const panned = stageView(500, 700, 200);
    const centred = stageView(500, 700);
    expect(panned.left).toBe(-50);
    expect([panned.x, panned.y, panned.scale, panned.width, panned.height, panned.wallWidth]).toEqual([
      centred.x,
      centred.y,
      centred.scale,
      centred.width,
      centred.height,
      centred.wallWidth,
    ]);

    // And a camera asked further than the hall has to give stands at the hall's own edge instead.
    expect(stageView(500, 700, 4000).left).toBe(STAGE_WIDTH / 2 - 500);
    expect(stageView(500, 700, -4000).left).toBe(-STAGE_WIDTH / 2);
  });

  it('is centred on a window that has the whole hall in it, wherever the camera is', () => {
    // The whole hall's width in the window is nowhere to pan: the camera may be looking anywhere, the
    // view still shows the hall centred — which is the desktop's own case, and why a desktop never
    // sees the camera move at all.
    expect(stageView(1600, 1200, 4000).left).toBe(-STAGE_WIDTH / 2);
    expect(stageView(STAGE_WIDTH, STAGE_HEIGHT, -4000).left).toBe(-STAGE_WIDTH / 2);
  });
});

describe('the walls of the one room there is', () => {
  it('do not move, whatever window is watching them', () => {
    // A world with no renderer is the full picture, and so is a world with any renderer: the walls
    // are built once, from the picture's own size, and nothing the window does reaches them.
    const world = new World();
    expect(world.engine.maxx).toBe(WALL_WIDTH / 2);
    expect(world.engine.minx).toBe(-WALL_WIDTH / 2);
    // The floor is the hall's own, and so is the line the ceiling hangs over the top of it: one
    // location's height of sky over the picture, and never more than that.
    expect(world.engine.maxy).toBe(STAGE_BOTTOM - 163);
    expect(world.engine.miny).toBe(-STAGE_HEIGHT / 2 - STAGE_HEIGHT);
  });

  it('brings a click past the picture onto the edge of the picture', () => {
    // A knot may be tied anywhere the player can see — scenery, air, above the walls — but a click in
    // the black frame, where nothing is drawn at all, would leave a knot nobody could find.
    const world = new World();
    world.startRope(-10000, -10000);
    expect(world.draft?.node.x).toBeCloseTo(-STAGE_WIDTH / 2, 6);
    expect(world.draft?.node.y).toBeCloseTo(STAGE_BOTTOM - STAGE_HEIGHT, 6);

    world.cancelRope();
    world.startRope(10000, 10000);
    expect(world.draft?.node.x).toBeCloseTo(STAGE_WIDTH / 2, 6);
    expect(world.draft?.node.y).toBeCloseTo(STAGE_BOTTOM, 6);
  });

  it('puts a new doll inside the room rather than against its wall', () => {
    // The spots dolls are put down on are the picture's own (160 pixels off its middle), brought in
    // when the room is narrower than they are wide.
    const world = new World();
    world.addDoll({ x: 0, y: 0 });
    const second = world.addDoll();
    if (!second) throw new Error('the engine refused a doll');
    expect(Math.abs(second.centre.x)).toBeLessThanOrEqual(world.engine.maxx);
    expect(Math.abs(second.centre.x)).toBeGreaterThan(0);
  });
});
