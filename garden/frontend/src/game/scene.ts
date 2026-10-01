import { Application, CanvasSource, Container, FillGradient, Graphics, Matrix, Sprite, Texture, type RoundedPoint } from 'pixi.js';
import {
  DEFAULT_CHARACTER,
  PORTRAIT_COUNT,
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
  REST_PORTRAIT,
  partUrl,
  portraitUrl,
  restPortraitUrl,
  type Character,
} from './characters';
import { FACE } from './pain-state';
import { Camera } from './camera';
import { PART_ASSETS, type PartName } from './parts.generated';
import { maskFromImageData, type PartMasks } from './part-mask';
import { ROPE_THICKNESS, SEGMENT_LENGTH } from './rope';
import { MAX_WORLD_SCALE, STAGE_BOTTOM, STAGE_HEIGHT, STAGE_WIDTH, WALL_HEIGHT, WALL_MARGIN_Y, stageView, type StageView } from './stage';
import type { Doll } from './doll';
import type { World } from './world';

/**
 * How much of its strength a shadow has left when the bottom of her drawing is `height` world pixels
 * above the floor it is cast on: full while she is on it, nothing at {@link SHADOW_FADE_HEIGHT}.
 *
 * A shadow is a thing cast by distance, and this is what keeps a doll held up at the top of the hall
 * from reading as pasted onto the floor: the higher she is, the more light the room gets under her. The
 * curve is the plain straight line between the two ends — the only claim being made is that it fades,
 * and a curve would be a second claim with nothing to back it.
 */
function shadowAlpha(height: number): number {
  const left = 1 - height / SHADOW_FADE_HEIGHT;
  return Math.min(1, Math.max(0, left));
}

/**
 * The colour the canvas is cleared to, which `src/styles.css` also paints the page with: black.
 *
 * The port draws nothing but inside the world's own box — the hall, the dolls, the ropes, the
 * interface — and the world is the picture: everything outside it is the letterbox the window's own
 * fit leaves around it, and that is this one colour, so the hall reads as a picture hanging in the
 * dark.
 */
const BACKDROP_COLOR = 0x000000;
/**
 * The picture of the hall the action happens in: the port's own artwork, `public/assets/bg.png`. It is
 * the one thing in the scene that comes from neither the movie nor an object the player put there.
 *
 * The file is the world itself — `STAGE_WIDTH x STAGE_HEIGHT`, 1000x740 — so a texel of it is a world
 * pixel and the hall is drawn with no scale at all. A picture of another size is stretched over the
 * world's box, since covering it is the whole job; only its ratio matters then (see
 * {@link Scene.loadBackground}). Everything outside the world box keeps {@link BACKDROP_COLOR}: the
 * window's own margin, and nothing else.
 */
const BACKGROUND_FILE = 'bg.png';
/**
 * The rope is no material rope but the ghosts' own: a line of cold light, teal, that gives itself
 * off rather than hanging there. It is drawn in three strokes of one family — a wide faint wash of
 * teal around a cord of exactly {@link ROPE_THICKNESS} world pixels, and a near-white thread down
 * the cord's middle — which together read as a glow, and nothing of a material cord is drawn on it:
 * no bands across it, no edging line, no shadow of a thing you could hold. It shows against the
 * pale sky and the brown walls both, being the one colour in the room that is not the room's.
 */
const ROPE_CORE = 0x6ef2d8;
const ROPE_GLOW = 0x2cd9b8;
const ROPE_THREAD = 0xeafffa;

/** A rope that is still being drawn is shown faded, so it is obvious it is not fixed yet. */
const DRAFT_ALPHA = 0.6;
/** Knots: little knobs of the same light, ringed in the glow's own teal, bigger while the player holds one. */
const KNOT_RADIUS = 4.6;
const KNOT_HOVER_RADIUS = 6;
const KNOT_FILL = 0xbdf9ec;
const KNOT_RING = 0x2cd9b8;
/**
 * The shadow every doll casts on the floor: how tall it is in world pixels, how dark its middle is, and
 * the blend it is drawn with.
 *
 * `multiply` is what keeps the shadow from having an edge: over the hall's floor it takes light away
 * instead of painting a grey shape on it, so the ramp out to nothing at the rim has nothing to end at.
 * The alpha curve is deliberately slow at first — half the ellipse is within a fifth of its centre's
 * darkness, and it is the outer quarter that fades out.
 */
const SHADOW_HEIGHT = 50;
const SHADOW_ALPHA = 0.55;
const SHADOW_BLEND = 'multiply' as const;
/**
 * How far off the floor she has to be for her shadow to be gone, in world pixels.
 *
 * A shadow is cast by distance: the higher she is held, the more of the room's light gets under her,
 * and a doll hanging at the top of the hall with a full-strength shadow under her reads as pasted onto
 * the floor. The fade runs from full to nothing over this height, measured from the bottom of her
 * *drawing* — so it starts the moment she comes off the floor and ends when she is high enough that
 * nothing about her is anywhere near it.
 */
const SHADOW_FADE_HEIGHT = 200;
/**
 * How far below the *physics* floor the shadow is drawn, in world pixels.
 *
 * The two are not the same line: `WALL_HEIGHT / 2` is where her joints stop, and the drawing of her
 * hangs past her joints — a doll lying on the floor rests on her back or her side, half her outline
 * below the line her particles are pinned to. Drawn on the physics floor the shadow therefore reads as
 * sitting *above* her; it is pushed down by this much instead. The number is the port's own, picked by
 * eye (the same way the walls are), and it is the one knob for it.
 */
const SHADOW_DROP = 40;
/** The line the shadows lie on: below the physics floor, out towards the foot of the picture. */
const SHADOW_FLOOR = WALL_HEIGHT / 2 + SHADOW_DROP;

/**
 * The interface: the bar of tools down the world's own left edge — a column as tall as the world, its
 * last button, the chat's, in the bottom left corner — the chat's block of four lines beside that
 * button, and the strip of portraits, in the world's own bottom right corner, across the foot of the
 * world from it, or in its top right one when the window is taller than it is wide.
 * The tape's own bar is the fourth of those and the one the row above gives way to: it stands on the
 * world's own foot, centred, while a run is on the tape (`TapeTimeline.vue`), and it is drawn by the page
 * like the bar of tools — this renderer's part in it is the frame it is laid out in, which has a width as
 * well as a height ({@link hudFrame}).
 * The strip is the one part of the interface that is *not* inset: a card stands in the world's own
 * corner, flush with the edges of the picture, and rounds only the one corner the picture has not got
 * ({@link CardCorner}).
 *
 * All of it is anchored *inside* the world — the box the hall is drawn in, 1000x740 world pixels — rather
 * than to the corners of the window, so the whole of the game, interface and all, is the one picture in
 * the middle of the black. All of it is measured in its own (CSS) pixels:
 * a button is 44 px, a card is a portrait at the size it was baked. The world is a fixed 1000x740, so
 * a window small enough to shrink it below the interface's own size shrinks the interface with it
 * (see {@link Scene.hud}) — nothing of it is ever drawn outside the world.
 */
const HUD_INSET = 12;
/** The gap between two cards, which is also what the strip keeps clear of the bar at the other end. */
const HUD_GAP = 16;
/**
 * The toolbar's own measurements, mirrored from `.toolbar` and `.tool` in `src/styles.css`: three
 * 44 px buttons 8 px apart, one under the other, each rounded by {@link TOOLBAR_RADIUS} of its own
 * width.
 */
const TOOLBAR_BUTTON = 44;
/**
 * The rounding of a toolbar button's corners, in its own pixels, from `.tool` in `src/styles.css`.
 *
 * It is here because the strip of portraits wears it too: the one corner a card rounds is rounded by the
 * same fraction of itself that a button's corners are of a button (see {@link CARD_RADIUS}), which is what
 * makes the two read as one set of things. Change the CSS and the card follows, the other way round from
 * every other number in this block — that is, this one is written down here rather than in the card.
 */
const TOOLBAR_RADIUS = 13;
const TOOLBAR_GAP = 8;
/**
 * How many buttons the bar has: the arrow, the rope, the bin, the two the tape is worked with (record and
 * play) and the chat.
 *
 * What this number is for is the room the world has to have for the bar — the buttons stacked with the gaps
 * between them, and the chat's own button at the foot of the column (see {@link TOOLBAR_ROOM}) — so a
 * button added to the bar is a number to change here, and the interface shrinks a little sooner on a small
 * window for it.
 */
const TOOLBAR_BUTTONS = 6;
/**
 * How round the corner a card rounds is, in the card's own pixels: the fraction of a card that a button's
 * rounding is of a button — 13 of 44, so a little under a third of the way across a card 120 px wide.
 *
 * Measured rather than picked, and measured off the button rather than off the card, because a card is
 * a picture in the same strip as the toolbar it hangs beside and the two should look like the same kind
 * of thing. The strip's cards are drawn at their own size or smaller ({@link Scene.syncPortraits}), so
 * the rounding scales with them and the proportion never changes.
 *
 * Only one of a card's four corners is rounded and the other three are square. Which one it is follows
 * the corner of the world the strip is hanging off, which hands it in ({@link CardCorner}).
 */
const CARD_RADIUS = (PORTRAIT_WIDTH * TOOLBAR_RADIUS) / TOOLBAR_BUTTON;

/**
 * Which of a card's four corners its frame rounds, in the card's own pixels.
 *
 * The strip is flush with two edges of the world wherever it stands, so two of a card's corners are those
 * edges' own; which of the remaining two the port rounds is written down here rather than derived. In the
 * world's bottom right — an ordinary window, wider than it is tall, where the strip stands level with the
 * chat's block at the other end of the world's foot — the card in the corner rounds its top left, the
 * corner facing into the hall. In the world's top right, which is where a window taller than it is wide
 * puts the strip, it rounds its bottom right: the corner at its own foot, against the picture's own right
 * side, where the card's frame is the edge of the picture and the hall shows behind the notch. The other
 * three corners are square ({@link Scene.syncPortraits}, {@link Scene.dressCard}).
 */
type CardCorner = 'top-left' | 'bottom-right';
/**
 * How much room the bar takes up along the world's left edge, measured from the world's own left edge:
 * it is a column of buttons, so that is its own width and nothing else. The world's own height is what
 * its column runs down (see {@link hudFrame}), and the strip of portraits — across the world's foot, or
 * along the top of it in a window taller than it is wide — keeps the whole of that width clear: nothing
 * of the interface is ever drawn over a button.
 */
const TOOLBAR_ROOM = HUD_INSET + TOOLBAR_BUTTON;
/**
 * The chat's own block beside the bar — four lines of text, 300 px wide — and the gap the bar keeps
 * clear of it, which is the same gap the bar's buttons keep between themselves (see `.chat-strip` in
 * `src/styles.css`).
 *
 * It is written down here as well as in the CSS, the way the bar's own buttons are, because the world
 * has to have room for it too: the block takes the world's bottom left corner, beside the chat's own
 * button, and the strip of portraits — in the bottom right one, with the whole of the world's foot
 * between them, or up in the top right of an upright window, where no card can reach the block — keeps
 * clear of the whole of it, so the interface shrinks together when the world has
 * no room for both (see {@link hudScale}).
 */
const CHAT_STRIP_WIDTH = 300;
const CHAT_ROOM = TOOLBAR_GAP + CHAT_STRIP_WIDTH;
/**
 * The whole interface's own size, and so what the world has to have room for: the bar's column, the
 * chat's block beside it, the gap the chat keeps clear of the portraits, and one card — a card is where
 * the strip starts out, and it shrinks card by card after this (see {@link Scene.syncPortraits}). Nothing
 * is added for the world's right edge, since the card in the corner is flush with it.
 *
 * In height it is the taller of the interface's two measurements: the strip of portraits, which is a
 * card tall, or the bar's own six buttons stacked with the gaps between them. The bar is as tall as the
 * world itself (see {@link hudFrame}), so the room it asks the world for is the room its buttons need
 * and no more. The chat's block stands *beside* the bar's last button rather than under it, so of the
 * three it is the shortest and never the one this is measured by.
 *
 * The tape's own bar asks for nothing on top of this: it is a button tall and never as wide as the frame
 * it is centred in (`TapeTimeline.vue`), so a world with room for the rest of the interface has room for
 * it too — which is what keeps the rule that nothing of the interface is ever drawn outside the world.
 */
const HUD_WIDTH = TOOLBAR_ROOM + CHAT_ROOM + HUD_GAP + PORTRAIT_WIDTH;
const HUD_HEIGHT =
  HUD_INSET + Math.max(PORTRAIT_HEIGHT, TOOLBAR_BUTTONS * TOOLBAR_BUTTON + (TOOLBAR_BUTTONS - 1) * TOOLBAR_GAP) + HUD_INSET;

/**
 * The file one of a card's faces is drawn from: the eight steps of pain are the numbered files, and the
 * one face off that scale — the breather — is the named one (`portrait/rest.png`, {@link FACE.rest}).
 */
function faceUrl(character: Character, art: number, base: string): string {
  return art === FACE.rest ? restPortraitUrl(character, base) : portraitUrl(character, art, base);
}

/** One doll's card in the strip: her portrait, at the pain her pose is worth. */
interface PortraitCard {
  readonly container: Container;
  /**
   * The card itself: the portrait drawn inside a frame, the frame being what the picture is filled
   * through. One of its four corners is rounded by {@link CARD_RADIUS} — the rounding the toolbar's
   * buttons wear, taken as the same fraction of the card — and the other three are square; which one it
   * is is the strip's own business ({@link CardCorner}). It is a `Graphics` rather than a sprite because
   * a sprite is a rectangle: what fills the frame is a texture, and what shapes it is the path under it.
   */
  readonly portrait: Graphics;
  /** The portrait texture on the card, so the frame is only redrawn when the picture changes. */
  texture: Texture | null;
  /** The address of the picture on the card, for `Scene.inspect` to report what was drawn. */
  src: string | null;
  /** What the card is showing, and the picture it drew that with — read by {@link Scene.inspect}. */
  index: number;
  /**
   * The file the card is actually drawn from, which is {@link index} unless that picture is missing
   * from the artwork, and -1 when the character has no picture at all.
   */
  art: number;
  /**
   * Which corner the frame was drawn with, so that a card is redrawn when the strip moves to the world's
   * other corner and the picture on it has not changed — and so that a window turned upright turns the
   * rounding with it. Null until a frame is drawn at all, the way {@link texture} is null until there is
   * a picture to draw ({@link Scene.dressCard}).
   */
  corner: CardCorner | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load ${src}`));
    image.src = src;
  });
}

/**
 * How a texture is filed: by sprite set and part, not by character.
 *
 * What a character brings to the rig is artwork, and the artwork is the folder it was baked into —
 * so two characters that share a folder share all seven textures, and both have to be drawn from the
 * same ones. The masks are filed the same way (see {@link World.setPartMasks}).
 */
function textureKey(folder: string, part: string): string {
  return `${folder}/${part}`;
}

/**
 * All of the drawing: the dolls, the ropes the player ties and the boxes on the stage. No counters,
 * nothing else.
 *
 * Dolls come and go — the character list adds them, the delete tool removes them — so the class keeps
 * no rigs of its own: {@link syncDolls} reconciles the sprites of every doll against the world's list.
 * `syncGirl` is a port of the original's `Skin.draw`: for every part, the sprite sits on the
 * midpoint of its two particles and its own +x axis is turned towards the *first* of the pair.
 * That is all the original did — no mirroring, no per-part offsets — and most of the artwork is
 * baked to suit it, which is why the torso and the hips are the same drawing with opposite
 * particle orders.
 */
export class Scene {
  private readonly app: Application;
  private readonly world: World;

  /**
   * The hall: the world's own rectangle, filled with the port's picture of it, under everything else.
   * The sprite inside is the size of the world in world pixels (1000x740, which is the file's own
   * size), and this layer is what carries the world's own transform out to the window (see
   * {@link syncHall}).
   */
  private readonly hallLayer = new Container({ label: 'hall' });
  /**
   * What keeps the hall inside the visible world: the picture is the whole 1000x740 whatever the window
   * shows, and this rectangle (in the hall's own world coordinates) is the part of it that is on screen.
   */
  private readonly hallMask = new Graphics();
  private readonly root = new Container({ label: 'world' });
  private readonly worldLayer = new Container();
  /**
   * The shadows, under everything else in the world: a shadow lies on the floor, and the doll herself
   * is drawn over it.
   */
  private readonly shadowLayer = new Container();
  private readonly shadowGraphics = new Graphics();
  /** Every strength of shadow drawn so far, by the rounded alpha it is drawn at. */
  private readonly shadowFills = new Map<number, FillGradient>();
  /**
   * The box of every shadow as it was last drawn, for `Scene.inspect` — one per doll, in her order, with
   * the strength it was drawn at (a doll high off the floor casts a fainter one, see {@link shadowAlpha}).
   */
  private shadowBoxes: {
    x: number;
    y: number;
    width: number;
    height: number;
    alpha: number;
    rise: number;
  }[] = [];
  private readonly girlLayer = new Container();
  private readonly ropeLayer = new Container();
  /**
   * The strip of portraits: the stage's second child, drawn over the hall and under the world, so a
   * doll thrown into the corner covers the card in it rather than passing behind it, which is what
   * keeps the strip looking like something the stage is wearing and not a window over it.
   */
  private readonly portraitLayer = new Container({ label: 'portraits' });

  /** The sprites of every doll on the stage, in the skin table's own draw order. */
  private readonly dollSprites = new Map<Doll, Sprite[]>();
  /** One card per doll on the stage, in the world's own order. */
  private readonly portraitCards = new Map<Doll, PortraitCard>();
  /** The hall the world is drawn in, and the address its picture was fetched from, once it is here. */
  private background: Sprite | null = null;
  private backgroundSrc: string | null = null;
  /** The artwork of every sprite set that has been loaded, by {@link textureKey}. */
  private readonly textures = new Map<string, Texture>();
  /** The eight portraits of every sprite set that has been loaded, by folder, in portrait index order. */
  private readonly portraitTextures = new Map<string, (Texture | null)[]>();
  /**
   * The breather of every sprite set that has been loaded, by folder: the one face that is not a step of
   * pain (see {@link FACE.rest} and {@link REST_PORTRAIT}). Null for a character that brought none.
   */
  private readonly restTextures = new Map<string, Texture | null>();
  /** One load per sprite set, so a second doll of the same character fetches nothing. */
  private readonly loading = new Map<string, Promise<void>>();
  /** The page's asset base (`/` or `./`), where `assets/characters` hangs off. */
  private readonly base = import.meta.env.BASE_URL ?? '/';
  /** The ropes, and the rope that is still being drawn. */
  private readonly ropeGraphics = new Graphics();
  /** The cursor the canvas was last given, so it is only touched when it actually changes. */
  private cursor = '';
  /**
   * The view the last frame was drawn for, so that the interface is only told about a change when there is one.
   * A view is a handful of numbers, and comparing them costs less than a layout pass in the page.
   */
  private viewed: StageView | null = null;
  /**
   * The camera: where along the hall a narrow window is looking, gliding after the first doll on the
   * stage (`camera.ts` — the dead zone, the glide and the clamp are all hers to explain).
   *
   * The renderer owns it because it is the view's own state, and the view is the renderer's: the
   * physics never hears about it, and nothing outside the renderer has to — the world asks nothing of
   * the camera and the camera asks nothing of the world but where the first doll is standing. The one
   * other thing in the game that cares is a hand holding something, and the hand's half of that is
   * `Game`'s own (`grab` there).
   */
  private readonly camera = new Camera();

  /**
   * Called whenever the view the world is drawn in has changed — whatever changed it: the window, the fit, or a
   * tape's own room (`view`).
   *
   * It is how the page is told to put the bar in the world's corner again (`App.vue`), which it otherwise only
   * does when the *window* changes size: a playback in a window of another size moves the corner the interface
   * hangs off without the window moving at all.
   */
  onViewChange: (() => void) | null = null;

  private destroyed = false;

  private constructor(app: Application, world: World) {
    this.app = app;
    this.world = world;
  }

  static async create(host: HTMLElement, world: World): Promise<Scene> {
    const app = new Application();
    await app.init({
      backgroundColor: BACKDROP_COLOR,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: host,
      preference: 'webgl',
    });
    const scene = new Scene(app, world);
    await scene.load();
    host.appendChild(app.canvas);
    return scene;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get width(): number {
    return this.app.screen.width;
  }

  get height(): number {
    return this.app.screen.height;
  }

  /**
   * How big a world pixel is drawn right now, in CSS pixels — the exchange rate between the window's
   * own pixels and the world's, as the frame on screen was drawn at. A drag carried by the player
   * across a panning camera needs exactly this and nothing more (`Game.grab`).
   */
  get scale(): number {
    return this.view().scale;
  }

  /**
   * How far the last frame's edge assist carried a dragging hand, in world px: the camera's own report
   * of what it did *for* the hand, as against everything else it does around one (`Camera.carried`).
   * The game moves the hand's anchor by exactly this (`Game.carryHand`) — the assist is the one camera
   * motion that is allowed to move what a hand is holding, and only because it says how much.
   */
  get carried(): number {
    return this.camera.carried;
  }

  /**
   * Brings up the artwork the first frame needs: the character the movie starts with (she is on the
   * stage from the constructor, so her textures have to be there for `syncDolls`) and the hall the
   * whole world is drawn over.
   *
   * Every other character's artwork is fetched the moment a doll of it appears (see {@link syncDolls}),
   * so a stage with one character on it never pays for the others — and a character that wears another
   * one's sprite set (which is what a character made in the list's own "+" does) finds the whole set,
   * portraits and all, already loaded.
   */
  private async load(): Promise<void> {
    await Promise.all([
      this.ensureCharacter(DEFAULT_CHARACTER),
      this.loadBackground(),
    ]);
    this.build();
  }

  /**
   * Fetches the hall: `assets/bg.png`, the port's own picture and the only thing in the scene the
   * movie had nothing to do with.
   *
   * The sprite is the world in its own pixels, and the layer around it is what is stretched over the
   * world's box — the world is a fixed 1000x740 whatever the window is doing, and a picture of the hall
   * has to cover it — so the one thing about the file that matters is its ratio: 1000x740, the world's
   * own, or the hall comes out squeezed. The port's own `bg.png` is exactly that size, so nothing about
   * it is resampled or squeezed at all; a picture of another size would still be drawn (it fills, which
   * is what a background of the world means) and the squeezing is the price. A picture that will not
   * load is reported and left out: the world is drawn on the flat backdrop colour, exactly as it was
   * before there was a hall at all.
   */
  private async loadBackground(): Promise<void> {
    const url = `${this.base}assets/${BACKGROUND_FILE}`;
    try {
      const image = await loadImage(url);
      const hall = new Sprite(Texture.from(image));
      // The picture's own middle is the middle of the world, because that is where `syncHall` puts
      // the layer: the two cannot drift apart.
      hall.anchor.set(0.5);
      hall.width = STAGE_WIDTH;
      hall.height = STAGE_HEIGHT;
      this.background = hall;
      this.backgroundSrc = url;
    } catch (cause) {
      console.error('[free-falling-girl] could not load the picture of the hall', cause);
    }
  }

  /**
   * Fetches a character's sprite set, unless it is already here or on its way, and hands the alpha of
   * every part to the world — which is what tells a click on the artwork from a click on the
   * transparent padding around it.
   *
   * The bookkeeping is per *folder* rather than per character: two characters can wear the same
   * artwork, and then they must also share one set of textures and one set of masks.
   */
  private ensureCharacter(character: Character): Promise<void> {
    const pending = this.loading.get(character.folder);
    if (pending) return pending;
    const task = this.loadSpriteSet(character).catch((cause: unknown) => {
      // A sprite set that would not load is forgotten, so the next frame tries again instead of
      // leaving the doll bodiless for the rest of the session.
      this.loading.delete(character.folder);
      console.error(`[free-falling-girl] could not load the artwork of ${character.name}`, cause);
    });
    this.loading.set(character.folder, task);
    return task;
  }

  /**
   * Fetches a sprite set: the seven parts of her body, and the eight numbered portraits the strip draws
   * her pain with — plus the breather, which is one more file of its own (see {@link restTextures}). The
   * parts are redrawn through a canvas so the alpha the picking needs can be read back out of them; the
   * portraits are drawn at their own size and need no such care.
   */
  private async loadSpriteSet(character: Character): Promise<void> {
    const masks: PartMasks = {};
    await Promise.all(
      Object.entries(PART_ASSETS).map(async ([name, asset]) => {
        const image = await loadImage(partUrl(character, asset.file, this.base));
        // Redrawn through a canvas so every part ends up on the same kind of texture source, which
        // keeps sampling identical on every backend — and so the alpha the picking needs can be read
        // back out of it right here.
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(image, 0, 0);
        // The artwork is drawn at its own size and its density comes from the asset: a source told
        // it holds `1 / unitsPerTexel` texels per world pixel reports its size in world pixels, so
        // the sprite needs no scale of its own to come out the size the SWF drew it at. The canvas
        // is left exactly as it is — CanvasSource only rescales the reported size.
        const source = new CanvasSource({ resource: canvas, resolution: 1 / asset.unitsPerTexel });
        this.textures.set(textureKey(character.folder, name), new Texture({ source }));
        masks[name] = maskFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      }),
    );
    this.world.setPartMasks(character.folder, masks);

    // The portraits are plain PNGs drawn at the size they were baked, so they are taken as they are:
    // the strip puts them on a card of their own size (see {@link syncPortraits}). A character brings
    // its own eight files, and one of them missing is not a reason to lose the other seven: the hole
    // is left as a null, and the card wears the worst picture the artwork does have.
    this.portraitTextures.set(
      character.folder,
      await Promise.all(
        Array.from({ length: PORTRAIT_COUNT }, async (_, index) => {
          try {
            const image = await loadImage(portraitUrl(character, index, this.base));
            return Texture.from(image);
          } catch (cause) {
            console.warn(
              `[free-falling-girl] ${character.name} has no portrait ${index}; the card falls back`,
              cause,
            );
            return null;
          }
        }),
      ),
    );
    // ...and, next to them, the breather: one more file, named rather than numbered, which a character
    // may simply not have (see {@link dressCard} for what a card does about that).
    try {
      this.restTextures.set(
        character.folder,
        Texture.from(await loadImage(restPortraitUrl(character, this.base))),
      );
    } catch (cause) {
      console.warn(
        `[free-falling-girl] ${character.name} has no ${REST_PORTRAIT} portrait; the card falls back`,
        cause,
      );
      this.restTextures.set(character.folder, null);
    }
  }

  private build(): void {
    // The world container's origin is the middle of the world, so a world coordinate is a coordinate
    // from the middle of the hall, +x to the right and +y down — the movie's own frame.
    this.worldLayer.position.set(STAGE_WIDTH / 2, STAGE_HEIGHT / 2);

    // The hall is the bottom of the canvas rather than a child of the world, because the interface is
    // drawn over it: what the world holds — dolls, ropes — is drawn over both.
    if (this.background) {
      this.hallLayer.addChild(this.background, this.hallMask);
      this.hallLayer.mask = this.hallMask;
    }

    this.ropeLayer.addChild(this.ropeGraphics);
    // The shadows of every doll, under the lot: the whole of the world is drawn over them.
    this.shadowGraphics.blendMode = SHADOW_BLEND;
    this.shadowLayer.addChild(this.shadowGraphics);
    this.worldLayer.addChild(this.shadowLayer, this.girlLayer, this.ropeLayer);
    this.root.addChild(this.worldLayer);
    // Hall, then the strip of portraits, then the world: a card is drawn over the hall, and the dolls
    // and their ropes over the cards.
    this.app.stage.addChild(this.hallLayer, this.portraitLayer, this.root);
  }

  /**
   * How much of the world this window shows, and where: the world fills the room the window has, is
   * cropped at the sides and from the top when there is less of it, and is scaled down whole when there
   * is less room than {@link MIN_WORLD_WIDTH} x {@link MIN_WORLD_HEIGHT}.
   *
   * The rule itself is `stageView` in `stage.ts`, which is plain TypeScript and is asked about every
   * window in `tests/stage.test.ts`; this is only where the renderer gets hold of it. The fit stops at
   * {@link MAX_WORLD_SCALE}: a stage drawn larger than the world is a magnified world, and a magnified
   * world is a soft girl, since her artwork is a texel to a world pixel and nothing else is.
   *
   * The camera is where it is looking now ({@link Camera}), which is why this is asked *after* the
   * camera has been moved in a frame and *between* frames alike: a click lands in the world as the
   * player last saw it drawn, pan and all, and the hand's own answer to the pan is `Game`'s.
   */
  private view(): StageView {
    return stageView(this.width, this.height, this.camera.x);
  }

  /**
   * Whether the view has moved since the last frame was drawn, remembering it if it has.
   *
   * A view is the same view when everything the *interface* is laid out from is the same — where the
   * visible box is drawn on the canvas, how big it is, how much of the world it shows and how wide the
   * walls inside it stand — since any of those moving is a frame the interface has to be laid out for
   * again. Where the box has got to *in the world* is deliberately none of that: `left` is the camera's
   * own doing, and the interface is anchored to the box and the window rather than to the hall, so a
   * camera gliding after a doll must not ask the page to lay itself out fifty times a second for it.
   */
  private viewMoved(view: StageView): boolean {
    const before = this.viewed;
    if (
      before &&
      before.x === view.x &&
      before.y === view.y &&
      before.scale === view.scale &&
      before.width === view.width &&
      before.height === view.height &&
      before.wallWidth === view.wallWidth
    ) {
      return false;
    }
    this.viewed = view;
    return true;
  }

  /** World point -> canvas (CSS) pixels, for the view that is drawn right now. */
  private toCanvas(view: StageView, x: number, y: number): { x: number; y: number } {
    return {
      x: view.x + (x - view.left) * view.scale,
      y: view.y + (y - view.top) * view.scale,
    };
  }

  /**
   * The world's own box as it is drawn — the *visible* part of the world, in canvas (CSS) pixels.
   *
   * This is the rectangle the hall fills, the box the dolls, the ropes and the stones are drawn in —
   * they are free to overhang its walls, and the top of it is open — and the box the interface is laid
   * out inside: the bar down its left edge, the strip of portraits in its bottom right corner — or in
   * the top right one, in a window taller than it is wide. On a
   * window with room for the whole hall it is the hall; on a smaller one it is the slice of it the
   * window shows, which is what keeps the interface in the picture rather than on the black. What the
   * physics is confined to is the smaller box inside it, {@link wallBox}.
   */
  private worldBox(): { x: number; y: number; width: number; height: number } {
    const view = this.view();
    return {
      x: view.x,
      y: view.y,
      width: view.width * view.scale,
      height: view.height * view.scale,
    };
  }

  /**
   * The walls' own box as it is drawn: the play area the physics keeps the doll in, in canvas (CSS)
   * pixels — {@link StageView.wallWidth} wide, centred, and {@link WALL_MARGIN_Y} above the foot of the
   * picture.
   *
   * This is the rectangle the doll is kept inside from the two sides, laid down on over the floor and
   * hauled out of the picture over — the picture's top edge is not a wall, and a rope is not confined
   * to the box at all (`Particle2D.clamped`). Nothing in the picture marks it: the margin is scenery
   * the physics never enters. It narrows with the world on a small screen (`wallsFor`), so a cropped
   * hall is still a room the player can watch her hit the sides of.
   */
  private wallBox(): { x: number; y: number; width: number; height: number } {
    const view = this.view();
    const corner = this.toCanvas(view, -view.wallWidth / 2, WALL_MARGIN_Y - STAGE_BOTTOM);
    return {
      x: corner.x,
      y: corner.y,
      width: view.wallWidth * view.scale,
      height: WALL_HEIGHT * view.scale,
    };
  }

  /**
   * How much the interface has to be shrunk for the world to hold it: 1 whenever the world's box is at
   * least as big as the bar's own buttons, the chat's block, one card and the insets around them —
   * {@link HUD_WIDTH} and {@link HUD_HEIGHT} — and less than that when the window is small enough that
   * the world is. Both axes are asked: across, the chat's block beside the bar is what the world has to
   * have room for, and down, the bar's own column of buttons.
   */
  private hudScale(box: { width: number; height: number }): number {
    return Math.min(1, box.width / HUD_WIDTH, box.height / HUD_HEIGHT);
  }

  /**
   * The interface's own corner inside the world, in canvas (CSS) pixels, the scale it is drawn at, and
   * how big it is in its own pixels: the world, less the two insets, with the shrink the world made
   * divided back out of it.
   *
   * The height is what says the bar is a column down the whole of the world's left edge rather than a
   * pile of buttons in its corner — a box that tall, shrunk back down by that scale, ends exactly at
   * the world's bottom edge, so the last button of the bar, the chat's, stands in the bottom left
   * corner of the picture however small the window makes the hall.
   *
   * The width is the whole of the world across, less the same two insets: the frame is the world's own
   * box, so the page can lay a row out *on* the world's foot — centred on it — without knowing anything
   * about how the hall was fitted to the window (`TapeTimeline.vue`). It is also what `100%` is worth
   * inside the interface: the CSS of it is written as fractions of this frame.
   */
  private hudFrame(): { x: number; y: number; scale: number; width: number; height: number } {
    const box = this.worldBox();
    const scale = this.hudScale(box);
    const inset = HUD_INSET * scale;
    return {
      x: box.x + inset,
      y: box.y + inset,
      scale,
      // A window with nothing left of it has no interface either: the division is the one place a scale
      // of 0 could bite, and nothing is ever asked to be shorter or narrower than nothing.
      width: scale > 0 ? Math.max(0, (box.width - inset * 2) / scale) : 0,
      height: scale > 0 ? Math.max(0, (box.height - inset * 2) / scale) : 0,
    };
  }

  /**
   * Where the interface goes and how big it is, in client (CSS) pixels — the bar is real DOM and is
   * positioned and scaled by these numbers (see `App.vue`), and the strip lays itself out the same
   * way inside the canvas (see {@link syncPortraits}).
   */
  hud(): { x: number; y: number; scale: number; width: number; height: number } {
    const frame = this.hudFrame();
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + frame.x,
      y: rect.top + frame.y,
      scale: frame.scale,
      width: frame.width,
      height: frame.height,
    };
  }

  /**
   * Draws one frame: the camera is moved first, so that everything the frame draws — the hall, the
   * dolls, the ropes — and everything the interface is laid out from, and every click the player makes
   * between frames, reads the view the camera has just left the world in.
   *
   * The subject the camera follows is the *first* doll on the stage and no other: with several of them
   * the camera is one window and cannot follow them all, and the first is the one that has been there
   * longest. The point of her it follows is the middle of her body (`Doll.centre`), which is the same
   * answer in a playback as in the game — a tape walks that same first doll, so watching a run watches
   * her the same way.
   *
   * `hold` is where a dragging hand is holding, in the window's own pixels, or null when nothing is
   * being dragged: near either side of the view it is what the camera's edge assist answers to
   * (`Camera.follow`), carrying the hand's anchor along with the pan ({@link carried}). The renderer
   * is where the client point becomes the camera's own measure of it — a fraction of the way across
   * the view.
   */
  render(elapsedMs: number, hold: { clientX: number; clientY: number } | null): void {
    if (this.destroyed) return;
    const followed = this.world.dolls[0];
    // The width of the window onto the world is the camera's input, and it does not depend on where
    // the camera is — so it is asked for wherever the camera happens to be standing, and the view the
    // frame is drawn from is asked for after the camera has moved.
    const frame = this.view();
    this.camera.follow(
      followed ? followed.centre.x : null,
      frame.width,
      elapsedMs,
      this.handAcross(hold, frame),
    );
    const view = this.view();
    // The interface is placed by the page (`App.vue`) and the page has no way of knowing the view has changed —
    // a window resize, or the world being fitted differently. So the renderer says when it has: everything
    // else about the interface is the page's own business.
    if (this.viewMoved(view)) this.onViewChange?.();
    // The camera: the world's own origin is the middle of the hall, and the visible box is put where the
    // view says it goes, so a cropped world is a window onto it rather than a shrunken one. The physics
    // never hears about any of this — the world and its walls are the same one rectangle whatever the
    // window shows of it.
    this.root.scale.set(view.scale);
    this.root.position.set(
      view.x - (view.left + STAGE_WIDTH / 2) * view.scale,
      view.y - (view.top + STAGE_HEIGHT / 2) * view.scale,
    );
    // The world's own box, which the hall fills and the interface is laid out inside.
    const box = this.worldBox();

    this.syncHall(view);
    this.syncDolls();
    this.syncGirl();
    // After `syncGirl`: the shadow is measured off the sprites, which is where they were just put.
    this.syncShadows();
    this.syncPortraits(box);
    this.syncRopes();
    this.syncCursor();
  }

  /**
   * Where a dragging hand is holding, as a fraction of the way across the view — 0 at its left edge,
   * 1 at its right, null with no hand holding anything — which is the measure the camera's edge assist
   * is asked for (`Camera.follow`). The client point is brought onto the canvas and then onto the view
   * itself, since on a window with black at the sides the two are not the same strip of glass.
   */
  private handAcross(hold: { clientX: number; clientY: number } | null, frame: StageView): number | null {
    if (!hold) return null;
    const rect = this.canvas.getBoundingClientRect();
    return (hold.clientX - rect.left - frame.x) / (frame.width * frame.scale);
  }

  /**
   * The hall: the picture of it is the world's own size in world pixels, and this layer is what the
   * world's transform is put on, so the hall is drawn exactly where the world is — cropped at the sides
   * and from the top on a window that shows only part of it.
   *
   * The picture is *masked* to the visible box: the world is what the window shows, and a hall drawn
   * past it would spill over the black frame the world keeps from the canvas' own edges. The mask is a
   * rectangle in world coordinates, since it hangs off the same layer the picture does. A window with
   * room for everything masks nothing off; nothing about the picture is resampled either way — the
   * layer's scale is the view's own, one world pixel to the CSS pixel.
   */
  private syncHall(view: StageView): void {
    const background = this.background;
    if (!background) return;
    const centre = this.toCanvas(view, 0, 0);
    this.hallLayer.position.set(centre.x, centre.y);
    this.hallLayer.scale.set(view.scale);
    this.hallMask
      .clear()
      .rect(view.left, view.top, view.width, view.height)
      .fill(0xffffff);
  }

  /** The pointer follows the knots: a hand over one, a fist while it is being carried. */
  private syncCursor(): void {
    const next = this.world.dragged ? 'grabbing' : this.world.hoverAnchor() ? 'grab' : '';
    if (next === this.cursor) return;
    this.cursor = next;
    this.canvas.style.cursor = next;
  }

  /**
   * Keeps one sprite group per doll on the stage: fresh dolls get theirs, deleted ones lose it, and
   * a doll whose character's artwork has not arrived yet is asked for again next frame.
   *
   * The sprites go in in the skin table's own order, which *is* the draw order: first pushed is
   * drawn first, i.e. underneath.
   */
  private syncDolls(): void {
    for (const doll of this.world.dolls) {
      if (this.dollSprites.has(doll)) continue;
      // The rig is on the stage from the click, its artwork a moment later: the doll is only left
      // out of this frame's drawing, and is picked up as soon as the textures are here.
      void this.ensureCharacter(doll.character);
      const sprites = this.buildDollSprites(doll);
      if (!sprites) continue;
      this.dollSprites.set(doll, sprites);
    }
    for (const [doll, sprites] of this.dollSprites) {
      if (this.world.dolls.includes(doll)) continue;
      for (const sprite of sprites) sprite.destroy();
      this.dollSprites.delete(doll);
    }
  }

  /**
   * One sprite per skin part of a doll, in the skin table's own order — or null while the doll's
   * character has no textures yet, in which case nothing at all is built, so no half a body is left
   * hanging in the layer.
   */
  private buildDollSprites(doll: Doll): Sprite[] | null {
    const folder = doll.character.folder;
    const textures: Texture[] = [];
    for (const part of doll.skin) {
      const texture = this.textures.get(textureKey(folder, part.mc));
      if (!texture) return null;
      textures.push(texture);
    }
    return doll.skin.map((part, index) => {
      const asset = PART_ASSETS[part.mc as PartName];
      const sprite = new Sprite(textures[index]);
      // The pivot the asset carries is the point the bone turns around, in texels of the tile — and
      // the normalised anchor PixiJS wants is exactly that, over the tile's size.
      sprite.anchor.set(asset.pivotX / asset.width, asset.pivotY / asset.height);
      this.girlLayer.addChild(sprite);
      return sprite;
    });
  }

  /** The original's `Skin.draw`, once per doll. */
  private syncGirl(): void {
    for (const [doll, sprites] of this.dollSprites) {
      const parts = doll.skin;
      for (let i = 0; i < parts.length && i < sprites.length; i++) {
        const { p1, p2 } = parts[i];
        const sprite = sprites[i];
        sprite.position.set((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5);
        sprite.rotation = Math.atan2(p1.y - p2.y, p1.x - p2.x);
      }
    }
  }

  /**
   * The shadow under every doll: as wide as she is drawn, {@link SHADOW_HEIGHT} world pixels tall, and
   * lying on the floor of the play area — its own foot on {@link SHADOW_FLOOR}, which is the line the
   * physics calls the floor pushed down a little (see {@link SHADOW_DROP}: her joints stop there, her
   * drawing does not), so a doll lying down has the shadow she is lying in.
   *
   * Her width is measured off the sprites rather than off her joints, because the shadow of a drawing
   * is the outline of the drawing: her hair, her hands and the tips of her feet are as much a part of it
   * as her hips are. Each part is a rotated rectangle, so the width is the axis-aligned box around all
   * of them at once. A doll whose artwork has not arrived yet has no sprites and so casts no shadow.
   *
   * The shadow is drawn in the same place however high she is — it is the floor's shadow of her, and the
   * floor does not move — but it *fades* as she leaves it: nothing at all once the lowest of her joints
   * is {@link SHADOW_FADE_HEIGHT} above the floor, full strength while she is resting on it (see
   * {@link shadowAlpha}). Her height is read off her joints rather than off the drawing, because that is
   * the line the floor is: her joints are what stops on it, her drawing hangs past it by
   * {@link SHADOW_DROP} whatever her pose (each body part is a 150-pixel tile, most of it transparent
   * padding, so the bottom of a *drawn* box says little about where her body is).
   *
   * One gradient per strength, written in its own (0-1) coordinates, so the same one darkens a narrow
   * doll and a doll stretched out on the floor (see {@link shadowFillFor}).
   */
  private syncShadows(): void {
    const g = this.shadowGraphics;
    g.clear();
    const boxes: {
      x: number;
      y: number;
      width: number;
      height: number;
      alpha: number;
      rise: number;
    }[] = [];
    for (const doll of this.world.dolls) {
      const sprites = this.dollSprites.get(doll);
      if (!sprites || sprites.length === 0) continue;
      let left = Infinity;
      let right = -Infinity;
      for (const sprite of sprites) {
        const cos = Math.abs(Math.cos(sprite.rotation));
        const sin = Math.abs(Math.sin(sprite.rotation));
        const half = (cos * sprite.width + sin * sprite.height) / 2;
        left = Math.min(left, sprite.x - half);
        right = Math.max(right, sprite.x + half);
      }
      if (!(right > left)) continue;
      // How far her lowest joint is above the floor she comes to rest on. The drawing says nothing
      // about it (see above), so it is read off the rig: `y` grows downwards, so the lowest joint is
      // the largest one.
      let lowest = -Infinity;
      for (const part of doll.particles) lowest = Math.max(lowest, part.y);
      const rise = Math.max(0, WALL_HEIGHT / 2 - lowest);
      const alpha = shadowAlpha(rise);
      if (alpha <= 0) continue;
      const centre = (left + right) / 2;
      // Filled one at a time rather than in one pass: every doll has her own strength of shadow, and a
      // gradient is written for one of them at a time.
      g.ellipse(centre, SHADOW_FLOOR - SHADOW_HEIGHT / 2, (right - left) / 2, SHADOW_HEIGHT / 2);
      g.fill(this.shadowFillFor(alpha));
      boxes.push({
        x: centre - (right - left) / 2,
        y: SHADOW_FLOOR - SHADOW_HEIGHT,
        width: right - left,
        height: SHADOW_HEIGHT,
        alpha,
        rise,
      });
    }
    this.shadowBoxes = boxes;
  }

  /**
   * One shadow's fill, at `alpha` of {@link SHADOW_ALPHA}: the same gradient with every colour stop of
   * it scaled, so the fade is the whole shadow losing strength rather than a paler shape on the floor.
   *
   * A strength is kept once it has been asked for: the alpha of a shadow follows the doll's height a
   * pixel at a time, so a frame's worth of dolls asks for a handful of them and the next frame asks for
   * the same handful again.
   */
  private shadowFillFor(alpha: number): FillGradient {
    const key = Math.round(alpha * 100) / 100;
    const known = this.shadowFills.get(key);
    if (known) return known;
    const strength = SHADOW_ALPHA * key;
    const fill = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: `rgba(0, 0, 0, ${strength})` },
        { offset: 0.5, color: `rgba(0, 0, 0, ${strength * 0.9})` },
        { offset: 0.75, color: `rgba(0, 0, 0, ${strength * 0.5})` },
        { offset: 1, color: 'rgba(0, 0, 0, 0)' },
      ],
    });
    this.shadowFills.set(key, fill);
    return fill;
  }

  /**
   * The strip of portraits in the corner of the world: one card per doll, in the world's own order, hung
   * off the world's own right edge so that it grows leftwards — the newest doll's card is the one in the
   * corner, and the cards read left to right in the world's own order. In an ordinary window, wider than
   * it is tall, it stands in the world's bottom right corner, which is the other end of the world's foot
   * from the chat's block, and the two of them together are the whole of what stands along the bottom of
   * the picture.
   *
   * Unlike the rest of the interface the strip keeps no inset from the world: a card hangs off the world's
   * own right edge and its foot, or off its own right edge and its top one in a window taller than it is
   * wide, so the card in the corner *is* the corner of the picture: it is flush with the edges of it, and
   * only one of its corners is rounded ({@link dressCard}). The one inset it does keep is the one it keeps
   * from the bar's own block, since a card that grew into the bar would be a card drawn over a button.
   *
   * Cards come and go with the dolls, exactly as their sprites do. The strip is laid out in the
   * interface's own (CSS) pixels — a card is a portrait at the size it was baked, 120x180 — and is
   * shrunk twice over rather than spilling out of the world onto the black: once with the whole
   * interface for the world's own size (see {@link hudScale}), and once more, card by card, for the
   * room left between the bar's own block and the world's right edge. A card is a portrait and nothing
   * else: no name, no frame — the picture is the whole of it.
   */
  private syncPortraits(box: { x: number; y: number; width: number; height: number }): void {
    for (const doll of this.world.dolls) {
      if (!this.portraitCards.has(doll)) this.portraitCards.set(doll, this.buildCard());
    }
    for (const [doll, card] of this.portraitCards) {
      if (this.world.dolls.includes(doll)) continue;
      card.container.destroy({ children: true });
      this.portraitCards.delete(doll);
    }

    const placed = this.world.dolls.flatMap((doll) => {
      const card = this.portraitCards.get(doll);
      return card ? [{ doll, card }] : [];
    });
    const scale = this.hudScale(box);
    // Which of the world's own corners the strip hangs off. The bottom right of it is where the cards have
    // always stood: level with the chat's block at the other end of the world's foot. A window taller than
    // it is wide — a phone held upright — is mostly picture *above* her instead, and she lies on the floor
    // at the foot of it, so there the cards go up to the world's own *top right* corner, above the room she
    // falls through and out of the way of the bar's column, which owns the picture's left edge. The
    // comparison is the *window's* own, not the world's box: what a player is looking at is the window,
    // which may be taller than the picture it shows.
    const upright = this.width < this.height;
    // What the strip keeps clear of on its own side of the world: the bar's own column, plus the gap the
    // interface's own blocks keep between themselves.
    const beside = TOOLBAR_ROOM + HUD_GAP;
    // The room left for the strip, measured in the interface's own pixels: from the right edge of the
    // bar's own block — the bar's column, with the chat's block beside its foot — to the world's right
    // edge, or from the bar's column to that edge when the strip is across the top of the picture, where
    // no card can reach the chat's block because it is at the other end of the world. The chat's block is
    // the bottom of the bar's column, but the column is the strip's own part of the world all the same, so
    // the cards stay clear of the whole of it.
    const room = Math.max(box.width / scale - (upright ? beside : beside + CHAT_ROOM), 1);
    const width = placed.length * PORTRAIT_WIDTH + Math.max(0, placed.length - 1) * HUD_GAP;
    const cardScale = scale * Math.min(1, room / Math.max(width, 1));
    this.portraitLayer.scale.set(cardScale);
    // The strip hangs off the world's own corner — hard against its right edge, and standing on its foot in
    // the world's bottom right or hung off its top edge in its top right — so the card in the corner is the
    // corner of the picture: no inset at all on the edges it is flush with. The cards are put in their own
    // pixels below.
    this.portraitLayer.position.set(
      box.x + box.width - width * cardScale,
      upright ? box.y : box.y + box.height - PORTRAIT_HEIGHT * cardScale,
    );
    placed.forEach(({ doll, card }, index) => {
      // The card's own origin is the middle of its picture.
      card.container.position.set(index * (PORTRAIT_WIDTH + HUD_GAP) + PORTRAIT_WIDTH / 2, 0);
      this.dressCard(card, doll, upright ? 'bottom-right' : 'top-left');
    });
  }

  /**
   * One doll's card: her portrait drawn into a frame the size it was baked, one corner of it — the one
   * the corner of the world the strip hangs off asks for ({@link CardCorner}) — rounded by the buttons'
   * own rounding (see {@link dressCard}).
   *
   * A card carries no label of its own — the picture is the whole of it — so the strip is as wide as
   * the portraits are and nothing else has to be measured when a card is built. The frame's own origin
   * is put at the middle of the card's width, which is where the card's container is anchored.
   */
  private buildCard(): PortraitCard {
    const container = new Container();
    const portrait = new Graphics();
    portrait.position.set(-PORTRAIT_WIDTH / 2, 0);
    container.addChild(portrait);
    this.portraitLayer.addChild(container);
    return { container, portrait, texture: null, src: null, index: 0, art: -1, corner: null };
  }

  /**
   * The picture a level is drawn with: the level itself, or the worst one the artwork has below it.
   *
   * A character's eight files are its own art, and a missing one is a hole in the middle of the
   * scale, not a reason to show nothing: the card keeps the face below it, so a pose that asks for a
   * picture nobody has still reads as the worst face there is. Nothing above the level is ever used —
   * a card may understate a pose, never overstate it. -1 means the artwork has no picture at all.
   */
  private cardArt(portraits: readonly (Texture | null)[], index: number): number {
    for (let i = Math.min(index, portraits.length - 1); i >= 0; i--) {
      if (portraits[i]) return i;
    }
    for (let i = index + 1; i < portraits.length; i++) if (portraits[i]) return i;
    return -1;
  }

  /**
   * Gives a card the picture her pose has earned her.
   *
   * The pain is read from where her joints are, every frame, so the face follows the pose as she is
   * dragged about — there is no event to listen for and no state to keep: the pose *is* the state.
   *
   * The face itself comes from the doll's own machine (`pain-state.ts`), which is stepped with the
   * world: every doll carries the picture she is wearing, and the renderer only reads it. What that face
   * is *drawn* with is this end's business, and the two are not the same list: the eight steps of pain
   * are numbered portraits with holes that get filled in from below, and {@link FACE.rest} is a file of
   * its own — one a character may not have at all, in which case the card wears the numbered picture that
   * means the same thing (`FACE.recent`: nothing hurts now, but something did a moment ago).
   *
   * The corner the frame rounds is handed in rather than decided here: which of a card's four corners it
   * is follows the corner of the world the strip is hanging off ({@link CardCorner}), and the strip knows
   * that when it lays a card out. It is remembered on the card all the same, because a picture is only
   * redrawn when it changes — a window turned from landscape to portrait keeps every face in the strip and
   * still has to be re-outlined.
   */
  private dressCard(card: PortraitCard, doll: Doll, corner: CardCorner): void {
    card.index = doll.pain.shown;
    const portraits = this.portraitTextures.get(doll.character.folder);
    const rest = this.restTextures.get(doll.character.folder) ?? null;
    let texture: Texture | null;
    if (card.index === FACE.rest) {
      card.art = rest ? FACE.rest : portraits ? this.cardArt(portraits, FACE.recent) : -1;
      texture = rest ?? (card.art < 0 ? null : (portraits?.[card.art] ?? null));
    } else {
      card.art = portraits ? this.cardArt(portraits, card.index) : -1;
      texture = card.art < 0 ? null : (portraits?.[card.art] ?? null);
    }
    // Until the artwork arrives there is nothing to show: the card is the picture and nothing else,
    // so it stays empty for that frame rather than showing a blank slab.
    card.portrait.visible = texture !== null;
    if (texture === card.texture && corner === card.corner) return;
    card.texture = texture;
    card.corner = corner;
    card.src = card.art < 0 ? null : faceUrl(doll.character, card.art, this.base);
    card.portrait.clear();
    if (!texture) return;
    // Drawn at the size it was baked whatever the file happens to measure: the cards are laid out on
    // the numbers above, and a stray portrait must not be able to move the strip about. A file of the
    // wrong shape is stretched rather than cropped, the same way the hall is.
    const matrix = new Matrix().scale(
      PORTRAIT_WIDTH / texture.width,
      PORTRAIT_HEIGHT / texture.height,
    );
    // The card is a path rather than a `roundRect`, because only one of its four corners is round.
    // `roundShape` takes a radius per corner and leaves the ones that ask for none sharp
    // (`roundedShapeArc` in `pixi.js`), so the corner the card rounds is rounded by the default and the
    // others say so themselves; which of the four that is is the strip's own business (`corner`).
    const frame: RoundedPoint[] =
      corner === 'top-left'
        ? [
            { x: 0, y: 0 },
            { x: PORTRAIT_WIDTH, y: 0, radius: 0 },
            { x: PORTRAIT_WIDTH, y: PORTRAIT_HEIGHT, radius: 0 },
            { x: 0, y: PORTRAIT_HEIGHT, radius: 0 },
          ]
        : [
            { x: 0, y: 0, radius: 0 },
            { x: PORTRAIT_WIDTH, y: 0, radius: 0 },
            { x: PORTRAIT_WIDTH, y: PORTRAIT_HEIGHT },
            { x: 0, y: PORTRAIT_HEIGHT, radius: 0 },
          ];
    card.portrait.roundShape(frame, CARD_RADIUS).fill({ texture, matrix });
  }

  /**
   * Every rope on the stage with its knots, plus the one that is still being drawn.
   *
   * A playback's world holds no ropes at all — a tape is the dolls' picture, and the player's own ropes
   * come back with their scene when the tape comes off (`Game.unload`) — so there is nothing to hide
   * here: what is on the stage is what is drawn.
   */
  private syncRopes(): void {
    this.ropeGraphics.clear();
    const hovered = this.world.hoverAnchor();
    const carried = this.world.dragged;
    for (const rope of this.world.ropes) {
      this.strokeChain(rope.nodes, 1);
      for (const anchor of [rope.start, rope.end]) {
        this.strokeKnot(anchor.node.x, anchor.node.y, 1, anchor === hovered, anchor === carried);
      }
    }
    const draft = this.world.draft;
    if (draft) {
      this.drawDraft(draft.node.x, draft.node.y);
      this.strokeKnot(draft.node.x, draft.node.y, DRAFT_ALPHA, false, false);
    }
  }

  /** The rope as it is being drawn: from the fixed end out to the mouse, joint by joint. */
  private drawDraft(x0: number, y0: number): void {
    const { x: x1, y: y1 } = this.world.draftEnd();
    const dx = x1 - x0;
    const dy = y1 - y0;
    const count = Math.max(1, Math.round(Math.hypot(dx, dy) / SEGMENT_LENGTH));
    const nodes: { x: number; y: number }[] = [];
    for (let i = 0; i <= count; i++) nodes.push({ x: x0 + (dx * i) / count, y: y0 + (dy * i) / count });
    this.strokeChain(nodes, DRAFT_ALPHA);
  }

  /**
   * Draws a chain of world points as the ghosts' rope: a wide faint wash of teal around a bright cord
   * of exactly `ROPE_THICKNESS` world pixels, and a near-white thread down the cord's middle — three
   * strokes that read as light being given off rather than as a thing lying there.
   */
  private strokeChain(nodes: readonly { x: number; y: number }[], alpha: number): void {
    this.strokeChainLayer(nodes, ROPE_THICKNESS * 3.2, ROPE_GLOW, alpha * 0.22);
    this.strokeChainLayer(nodes, ROPE_THICKNESS * 1.9, ROPE_GLOW, alpha * 0.38);
    this.strokeChainLayer(nodes, ROPE_THICKNESS, ROPE_CORE, alpha);
    this.strokeChainLayer(nodes, 1.4, ROPE_THREAD, alpha * 0.85);
  }

  /** A knot: a knob of the same light, a shade bigger while the pointer is on it or carrying it. */
  private strokeKnot(x: number, y: number, alpha: number, hovered: boolean, carried: boolean): void {
    const g = this.ropeGraphics;
    const radius = hovered || carried ? KNOT_HOVER_RADIUS : KNOT_RADIUS;
    g.circle(x, y, radius)
      .fill({ color: carried ? KNOT_RING : KNOT_FILL, alpha })
      .stroke({ width: 1.6, color: KNOT_RING, alpha });
  }

  private strokeChainLayer(
    nodes: readonly { x: number; y: number }[],
    width: number,
    color: number,
    alpha: number,
  ): void {
    if (nodes.length < 2) return;
    const g = this.ropeGraphics;
    g.moveTo(nodes[0].x, nodes[0].y);
    for (let i = 1; i < nodes.length; i++) g.lineTo(nodes[i].x, nodes[i].y);
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }

  destroy(): void {
    this.destroyed = true;
    this.app.destroy(true, { children: true });
  }

  /** Client (CSS pixel) point -> world coordinates, i.e. the original's `_root._xmouse`. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const view = this.view();
    return {
      x: view.left + (clientX - rect.left - view.x) / view.scale,
      y: view.top + (clientY - rect.top - view.y) / view.scale,
    };
  }

  /** World coordinates -> client (CSS pixel) point; used by the headless tests. */
  toScreen(x: number, y: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const point = this.toCanvas(this.view(), x, y);
    return { x: rect.left + point.x, y: rect.top + point.y };
  }

  /** Diagnostic snapshot used by the headless smoke test. */
  inspect(): {
    parts: {
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      width: number;
      height: number;
      /**
       * The size of the sprite's own picture, in texels — its width and height in world pixels, which
       * for a baked part are the same number and for anything else need not be.
       */
      texels: [number, number];
    }[];
    dolls: number;
    /** Every rope on the stage, as it is tied: one entry per rope, in the world's own order. */
    ropes: { nodes: number; length: number; stretch: number }[];
    stage: { width: number; height: number; scale: number; rootX: number; rootY: number };
    canvas: { bufferWidth: number; bufferHeight: number; cssWidth: number; cssHeight: number };
    /**
     * The hall the world is drawn over, in world pixels, or null when its picture has not arrived.
     * `texels` is the size of the file itself: the sprite is the world whatever the picture is, so
     * that is where a picture of the wrong shape shows up (see {@link loadBackground}).
     */
    background: { src: string; width: number; height: number; texels: [number, number] } | null;
    /**
     * The world's own box as it was drawn — the rectangle the hall fills — in canvas (CSS) pixels.
     * Everything the interface is made of is laid out inside it (see {@link hud}).
     */
    world: { x: number; y: number; width: number; height: number };
    /**
     * The rectangle the doll's own walls stand on, inside the world's own box and in the same canvas
     * (CSS) pixels: what she is kept in from the two sides and comes to rest on over the floor.
     * Nothing is drawn along it. Its top edge is *not* a wall — she is hauled up out of the picture
     * through it (`PEngine2D.clampToWorld`) — and a rope is not confined to the box at all, so this is
     * the smoke test's own reference rather than a box anything has to stay inside of.
     */
    walls: { x: number; y: number; width: number; height: number };
    /** The visible slice of the world and the scale it is drawn at — see `stageView` in `stage.ts`. */
    view: StageView;
    /**
     * The camera behind that view: where it is looking along the hall, and everything its edge assist
     * has ever carried a dragging hand, in world px (`Camera`). The tally is for the headless smoke
     * test, which has to know where a knot dragged into the side of the window must end up: where the
     * hand carried it, plus what the assist carried it on top.
     */
    camera: { x: number; carried: number };
    /**
     * The shadow of every doll as it was last drawn, in the world's own pixels: one box per doll, in
     * her order, as wide as she is drawn and `SHADOW_HEIGHT` tall, lying on the floor — with the
     * strength it was drawn at and the height of her lowest joint above the floor that strength came
     * from (see `SHADOW_FADE_HEIGHT`); a doll that is gone from the floor entirely casts nothing at
     * all and has no box here.
     */
    shadows: { x: number; y: number; width: number; height: number; alpha: number; rise: number }[];
    /**
     * Where the interface's own top left corner is, in canvas (CSS) pixels — the bar hangs off it — how
     * much the world shrank it to fit, and how big it is in its own pixels: the bar is a column down the
     * whole of the world's left edge and the tape's own bar stands on the world's foot (see {@link hud}).
     */
    hud: { x: number; y: number; scale: number; width: number; height: number };
    /** The colour the canvas is cleared to, as `0xrrggbb`, i.e. the colour of everything outside the world. */
    backdrop: number;
    /**
     * The stage's own children, bottom first, by label: the hall, the strip of portraits, the world —
     * which is what says what is drawn over what.
     */
    layers: string[];
    /**
     * The strip in the world's own corner — the bottom right of it, or its top right one when the window
     * is taller than it is wide (`Scene.syncPortraits`) — one entry per doll, in canvas (CSS) pixels.
     */
    portraits: {
      /** The name of the character whose face is on the card. */
      name: string;
      /**
       * Which face the doll's own machine is showing (`pain-state.ts`), 0 to 8 — what the card is asked
       * for, before the artwork's own gaps are taken into account (that is `art`). The eight steps of
       * pain are 0..7 and the breather is 8 (`FACE.rest`), off the end of that scale.
       */
      portrait: number;
      /**
       * The file the card's picture came from, after the artwork's own gaps are filled in: 0..7 for the
       * numbered portraits, `FACE.rest` for the named one, -1 when there is no artwork at all.
       */
      art: number;
      /**
       * What the doll's own machine is doing (`Doll.pain`): the step of the worst source it last read,
       * how long the trouble has lasted, and whichever face it is holding. `portrait` above is what it
       * decided to wear; this is the state that decided it, for the smoke test to check the card
       * against rather than against a photograph.
       */
      machine: ReturnType<Doll['pain']['snapshot']>;
      /** The file that portrait was loaded from, so a test can see the picture that was drawn. */
      src: string;
      /**
       * How round the one corner a card rounds is — the one the picture has not got, the other three being
       * the world's own — in the same pixels as `width`: the fraction of a card that a toolbar button's
       * rounding is of a button (`CARD_RADIUS`), read back for the smoke test to check against the CSS the
       * buttons are really drawn with.
       */
      radius: number;
      /**
       * Which of the card's four corners that is, or null while the card is empty: the top left in the
       * world's own bottom right corner, the bottom right in its top right one (`CardCorner`).
       */
      corner: CardCorner | null;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
  } {
    const strip = this.portraitLayer;
    const stripScale = strip.scale.x;
    const view = this.view();
    return {
      // Every part of every doll, first doll first, each in the skin table's own order.
      parts: [...this.dollSprites.values()].flatMap((sprites) =>
        sprites.map((sprite) => ({
          x: sprite.x,
          y: sprite.y,
          rotation: sprite.rotation,
          scaleX: sprite.scale.x,
          width: sprite.width,
          height: sprite.height,
          texels: [sprite.texture.source.pixelWidth, sprite.texture.source.pixelHeight] as [
            number,
            number,
          ],
        })),
      ),
      dolls: this.world.dolls.length,
      ropes: this.world.ropes.map((rope) => ({
        nodes: rope.nodes.length,
        length: rope.measuredLength(),
        stretch: rope.maxStretch(),
      })),
      stage: {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        scale: view.scale,
        rootX: this.root.position.x,
        rootY: this.root.position.y,
      },
      /**
       * How much of the world the window shows, in world pixels, and where that slice is drawn — what
       * the walls, the hall and the reach of a click are all measured from (see `stageView` in
       * `stage.ts`). A window with room for the whole hall shows all of it; a narrow one shows a
       * narrower `width`, a short one a shorter `height` (cropped from the top, `top` moved down with
       * it), and a window smaller than `MIN_WORLD_WIDTH`/`HEIGHT` shows them at a `scale` below 1.
       */
      view,
      camera: { x: this.camera.x, carried: this.camera.carriedSoFar },
      canvas: {
        bufferWidth: this.app.canvas.width,
        bufferHeight: this.app.canvas.height,
        cssWidth: this.app.canvas.clientWidth,
        cssHeight: this.app.canvas.clientHeight,
      },
      background: this.background
        ? {
            src: this.backgroundSrc ?? '',
            width: this.background.width,
            height: this.background.height,
            // The size of the file itself: the sprite covers the world whatever the picture is, so
            // this is the only place a `bg.png` of the wrong shape can be seen (see {@link
            // loadBackground} and the hall check in `tools/smoke.mjs`).
            texels: [this.background.texture.source.pixelWidth, this.background.texture.source.pixelHeight],
          }
        : null,
      world: this.worldBox(),
      walls: this.wallBox(),
      shadows: this.shadowBoxes,
      hud: this.hudFrame(),
      backdrop: this.app.renderer.background.color.toNumber(),
      // The stage's children in the order they are drawn in: the bottom one first.
      layers: this.app.stage.children.map((child) => child.label),
      portraits: this.world.dolls.flatMap((doll) => {
        const card = this.portraitCards.get(doll);
        if (!card) return [];
        const centre = strip.position.x + card.container.x * stripScale;
        return [
          {
            name: doll.character.name,
            portrait: card.index,
            art: card.art,
            machine: doll.pain.snapshot(),
            src: card.src ?? '',
            radius: CARD_RADIUS * stripScale,
            corner: card.corner,
            x: centre - (PORTRAIT_WIDTH * stripScale) / 2,
            y: strip.position.y,
            width: PORTRAIT_WIDTH * stripScale,
            height: PORTRAIT_HEIGHT * stripScale,
          },
        ];
      }),
    };
  }
}
