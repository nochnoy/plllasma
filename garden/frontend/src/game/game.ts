import { Scene } from './scene';
import { DEFAULT_CHARACTER, type Character } from './characters';
import {
  Random,
  TAPE_SLICE_STEPS,
  TapePlayer,
  TapeRecorder,
  decodeTape,
  encodeTape,
  tapeBytes,
  tapeSeed,
  type Tape,
  type TapeEdit,
  type TapeHead,
  type TapeSlice,
  type TapeStage,
} from './tape';
import { World, type Tool } from './world';
import { FeatState } from './feat-state';
import type { Doll } from './doll';
import type { PEngine2D } from './vm/engine';
import type { Anchor } from './rope';

/**
 * One simulation step. The original movie is a 50 fps movie whose `onEnterFrame` ran the engine
 * once per frame, so the port runs the same 20 ms step regardless of the display's refresh rate
 * — the doll's motion then matches the SWF frame for frame.
 */
const FIXED_STEP_MS = 20;
/** Bail-out for a stalled tab; the original clamped its own clock at 40 ms per frame. */
const MAX_FRAME_MS = 250;
/**
 * How many steps a *seek* takes in one frame, while a playback is being wound forward to somewhere in the
 * middle of a run.
 *
 * A seek cannot be a jump — the world has no way to be put into the middle of a run, only to be started at
 * the beginning of one and walked (`World.restore`) — so it is a fast-forward, and this is how fast: a
 * thousand steps is twenty seconds of run, and it costs a frame or two of the same simulation the player is
 * already watching. A run of two minutes winds up in a tenth of a second, in a handful of frames, which is
 * what keeps the picture alive while it happens.
 */
const SEEK_STEPS_PER_FRAME = 1000;
/**
 * How often the interface is told where a playback has got to, in steps: a hundred milliseconds, so that a
 * timeline slides smoothly without the whole page being re-rendered fifty times a second. Everything except
 * the playhead is pushed the moment it changes, and the playhead's final value is pushed when a playback
 * stops or a seek arrives (`Game.report`).
 */
const REPORT_EVERY_STEPS = 5;
/**
 * How far a body may creep in one step and still be counted as standing still, in world pixels: a millionth
 * of one, which is the tape's own last decimal (`TAPE_KEY_DECIMALS`) and nothing any measurement of the
 * world can see.
 *
 * A rig that has stopped moving does not stop *exactly*: the solver goes on nudging her joints by fractions
 * of a pixel, and those fractions decay fast rather than going out — measured on a doll dragged across the
 * hall and let go, the worst movement of any of her twelve bodies is a thousandth of a pixel a step for the
 * first ten seconds, a millionth for the next ten, and a billionth after half a minute. What this threshold
 * has to tell such a creep apart from is *movement*: a doll being dragged moves whole pixels a step, a ball
 * rolling on the floor a fraction of one, a hanging knot swings — and none of those is anywhere near a
 * millionth.
 */
const STILL_CREEP_PX = 1e-6;
/**
 * Where the engine's own `speed` knob starts out.
 *
 * The original is a game about bouncing off rising balls, and it runs gravity at full tilt: she
 * crosses its 400-unit world in a quarter of a second when nothing stops her. With the balls
 * gone there is nothing to catch her, so the port starts her clock a fifth as fast — still the
 * movie's own mechanism, the same knob its arrow keys nudge, just a calmer default. Press the
 * right arrow a few times to speed her back up to the original's pace.
 */
const INITIAL_SPEED = 0.2;

/**
 * What the interface is told about the tape: whether one is being written or watched, where the playhead
 * is, and how big the run is.
 *
 * It is a plain object rather than a set of getters because it is *pushed*: the timeline and the toolbar
 * are Vue components, and the engine stays out of Vue's reactivity (`useGame`), so this is the one thing
 * that crosses over — a few dozen bytes on a change, and never inside a step.
 */
export interface TapeReport {
  /** True while a run is being written down. */
  readonly recording: boolean;
  /** True while the tape is walking the run by itself. */
  readonly playing: boolean;
  /** Whether there is a tape on the timeline at all: the timeline is the tape's own and is up while there is. */
  readonly loaded: boolean;
  /** Where the playhead is, in steps. */
  readonly step: number;
  /** How long the loaded run is, in steps. */
  readonly steps: number;
  /** Whether the run is being wound forward to a step the player picked: a seek, not a playback. */
  readonly seeking: boolean;
  /**
   * The seed the run's own randomness came from (`Tape.seed`) — nothing on screen shows it, and it is here
   * because it is what names a run.
   */
  readonly seed: number;
  /** How big the tape is as a file, in bytes (`tape.tapeBytes`) — nothing else says how the format is doing. */
  readonly bytes: number;
}

/**
 * Whether a key event belongs to a field of the page rather than to the game.
 *
 * The page has fields of its own — the chat's, for one, and the tape's own slider — and inside them the
 * keyboard is the player's: a space is a space they are typing, not the pause it is out on the stage.
 * Everything here is a key for the canvas, so a key aimed at an input, a textarea or a contenteditable
 * element is left alone.
 */
function keyboardBelongsToField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Wires the ported engine, the renderer and the input together and owns the main loop.
 *
 * Everything about how she moves lives in `src/game/vm`, everything about what is on the stage lives
 * in {@link World}, and this file drives both: it mirrors the original's `onMouseDown` / `onMouseUp` /
 * arrow-key code for the arrow tool, and routes clicks to the rope tool when it is selected in the
 * toolbar.
 */
export class Game {
  /** The stage: the engine, the dolls and the ropes. */
  readonly world = new World();

  private readonly host: HTMLElement;
  private scene: Scene | null = null;

  private paused = false;
  private raf = 0;
  private last = 0;
  private accumulator = 0;
  /**
   * The pointer the game is following right now — a mouse, a finger or a pen — or null when nothing is
   * held. A finger that the browser takes away (a system gesture, a call) ends the drag like any other
   * release, so a touch screen never leaves the doll stuck to a hand that is no longer there.
   */
  private pointer: number | null = null;
  /**
   * A drag's own anchor: where the pointer went down in both of the frames there are — the window's
   * (CSS pixels) and the world's — kept for as long as the hand is holding something.
   *
   * This is the whole of the camera's promise to the hand, and it is what keeps a pan from ever
   * *adding* to the mouse: from the moment of the press, the place the hand is taken to in the world is
   * the place it landed on then, plus how far the pointer has moved across the *window* since — never
   * recomputed through a camera that is moving, because a camera that has panned a hundred pixels
   * would move the doll a hundred pixels with it, and the doll chasing a pointer that chases the doll
   * is a loop that ends nowhere but at the wall. So instead the doll only ever moves when the finger
   * itself moves, and the camera glides *around* a hand that stands still: the two motions are kept
   * apart rather than summed, which is the difference between a room that follows her and a room that
   * drags her.
   *
   * The one deliberate exception is the camera's edge assist (`Camera.follow`): a hand pressed against
   * the side of the window is *asking* to be carried, and the assist says exactly how far it carried
   * (`Scene.carried`) so the anchor can move by that and nothing more — the exception is the assist's
   * own doing, reported frame by frame, and no other camera motion ever reaches the anchor.
   *
   * With nothing in hand there is no anchor and no mercy: a knot's hover, a rope's far end and a plain
   * click land wherever the moving camera has the world today, because those belong to the cursor on
   * the glass and follow it around the screen.
   */
  private grab: { clientX: number; clientY: number; worldX: number; worldY: number } | null = null;
  /**
   * Where the dragging hand is *now*, in the window's own pixels — unlike the anchor, which stays
   * where the press happened, this follows every move the hand makes for as long as the drag lasts.
   *
   * It is the edge assist's own input: the camera wants to know how near the side of the window the
   * hand has got (`Scene.render` hands it in, `Camera.follow` does the rest), and a hand that has
   * stopped moving still has a place — the whole point of the assist is to keep working for a finger
   * resting on the edge of the glass, which is exactly when no pointer event will ever come.
   */
  private hold: { clientX: number; clientY: number } | null = null;
  private disposed = false;
  private keyState = new Set<string>();
  /**
   * The last tool {@link onToolChange} was told about, so the toolbar only hears about real changes.
   * The world starts on the arrow, which is what the toolbar shows before the engine is even up.
   */
  private reportedTool: Tool = 'drag';

  /**
   * The tape being written, or null when nothing is being recorded — everything the player does while it is
   * there is filed into it, and the world's randomness is the stream its seed stands for (`record`).
   *
   * A recorder survives the player going to watch somebody else's run: a tape on the timeline takes the
   * *world* ({@link ownStage}), and the run being written stands where it was until the tape comes off
   * (`unload`), and then goes on — the same recorder, the same steps counted on, the same run on the server
   * (`frontend/src/live/`). Nothing is written while the watch lasts, because the world is the watched
   * run's and not the player's ({@link note}).
   */
  private recorder: TapeRecorder | null = null;
  /**
   * The stream of the world's own odds for the run being written — the `Random` its seed stands for, held
   * here rather than only by the world, because the world's own hold of it is a *function* and a function
   * has no position.
   *
   * The position is what a run that is interrupted by a watch and resumed needs: a stream re-seeded from
   * the same seed starts its numbers over, so the run that went on would draw different weather at the
   * same steps than a playback of it draws. The instance *is* the position — handing the same one back
   * (`homeAgain`) is the whole of what continuing a run's odds takes.
   */
  private weather: Random | null = null;
  /**
   * The player's own scene, put aside while another player's run has the world: the stage as it stood the
   * moment that run's tape was loaded (`World.snapshot`), together with the tool that was in the player's
   * hand ({@link ownTool}).
   *
   * A watched run is walked in this same world (`rewind` puts the tape's own stage back into it), so what
   * the player left — their dolls, their ropes, their stones, the pose they had made of it — has to be put
   * aside rather than left where it was: nothing else of it survives the watched run's stage. It comes back
   * when the tape comes off the timeline (`homeAgain`), whether or not a run of the player's own was being
   * written: a player who never touched a doll has a scene worth coming back to as well.
   */
  private ownStage: TapeStage | null = null;
  /** The tool that was in the player's hand when their scene was put aside ({@link ownStage}). */
  private ownTool: Tool = 'drag';
  /**
   * What a run that has just stopped being written still owes the server: the fraction of a second since the
   * last slice it handed over, which is what finishes the run off (`liveSlice`).
   *
   * A run ends in one of two ways, and only one of them has a page standing by to ask for the rest of it: a
   * window going away takes the player and the page together, while a tape put on the timeline
   * (`stopRecording`) takes the recorder away under whoever was sending the run. So the last steps of a run are
   * kept here for that sender to take, once.
   */
  private tail: TapeSlice | null = null;
  /** The tape on the timeline — the run the world is being measured against — or null when there is none. */
  private tape: Tape | null = null;
  /** The cursor through that run, or null when nothing is loaded. */
  private player: TapePlayer | null = null;
  /** Whether the tape is walking the run by itself, as opposed to being paused mid-run or wound forward. */
  private playing = false;
  /**
   * Whether the world is standing *in* the loaded run: true from the moment the tape's own stage was put
   * back (`rewind`), false while the world is whatever the player has made of it — which is what decides
   * whether pressing play starts the run over or carries on where it was left.
   */
  private inTape = false;
  /**
   * Whether the tape on the timeline is a run that is still being played: more of it is going to arrive
   * (`growTape`), so a playback that has walked it to its end waits there for the rest rather than stopping,
   * and the seconds it waited are not steps it owes the run (`playFrame`).
   *
   * What puts a tape in this state is the first slice of a run that grew under it, and what takes it out is
   * the run's own ending (`growTape` with nothing more coming) or a tape of another kind altogether — a file
   * (`loadTape`), a recording of the player's own (`stopRecording`), or nothing at all (`unload`).
   */
  private growing = false;
  /** The step a seek is winding towards, or null when nothing is being wound forward. */
  private seeking: number | null = null;
  /** How big the loaded tape is as a file (`tapeBytes`), worked out when it changes and not per push. */
  private bytes = 0;
  /** The report last handed out, so that only real news is pushed (`report`). */
  private reported: TapeReport | null = null;
  /**
   * Whether the player is elsewhere in the garden: the stage's own clock stands still while they are
   * (`suspend`/`resume`, called by the page when it pans to another of the garden's screens). A
   * playback is not held by it — a tape walks its own clock wherever the player is — but the live
   * world and the run being written on it are: nothing is stepped and nothing recorded of the away
   * time, and coming back sets both going again exactly where they stood.
   */
  private away = false;

  /**
   * Called whenever there is something new to say about the tape — a recording starting or stopping, a
   * playback moving on by a step's worth, a seek arriving. The toolbar's record button
   * and the timeline are drawn from it, so it is pushed rather than polled; the engine itself stays out of
   * Vue's reactivity (`useGame`).
   */
  onTapeChange: ((report: TapeReport) => void) | null = null;

  /**
   * Called whenever the view the world is drawn in has moved — the window, the fit, or a tape's own room
   * taking over (`Scene.onViewChange`).
   *
   * The page is what hangs the bar in the world's corner, so this is how it hears that the corner has moved;
   * what it does about it is `App.vue`'s own business (`placeToolbar`).
   */
  onViewChange: (() => void) | null = null;

  private constructor(host: HTMLElement) {
    this.host = host;
    this.world.engine.speed = INITIAL_SPEED;
    // The doll the movie starts with, in its authored pose at the origin of the stage, dressed in the
    // default character's artwork — the one baked from the movie itself. And then she is put down on
    // the floor of that stage: the game opens with her lying there rather than dropping in from the
    // middle of the hall, arms along her body (`World.layDown`). It is the one thing about the opening
    // the port decides for itself — everything else about where she is and what she is doing is the
    // movie's own physics, run forward before the first frame.
    const doll = this.world.addDoll({ x: 0, y: 0 }, DEFAULT_CHARACTER);
    if (doll) this.world.layDown(doll);
  }

  static async create(host: HTMLElement): Promise<Game> {
    const game = new Game(host);
    game.scene = await Scene.create(host, game.world);
    // The interface is the page's own DOM, and the corner it hangs off is the view's: the renderer is where a
    // changed view is noticed, so it is the renderer that says when the page has to put it there again.
    game.scene.onViewChange = () => game.onViewChange?.();
    game.attachInput();
    game.last = performance.now();
    game.raf = window.requestAnimationFrame(game.frame);
    return game;
  }

  dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.raf);
    this.detachInput();
    this.scene?.destroy();
    this.scene = null;
  }

  // ------------------------------------------------------------------ editing

  /**
   * The public surface the toolbar uses. The engine itself stays out of Vue's reactivity — nothing
   * about the simulation needs to go through a component — so the tools call in here, and the only
   * thing the toolbar keeps for itself is which button looks pressed.
   */
  /**
   * Called when the *world* changes the tool without being asked to, which is two occasions only: the
   * player coming home from a watched run gets back the tool they left with (`homeAgain`), and a rope
   * fixed on the stage hands the arrow back (`pressAt`) — the rope tool spends itself on its own
   * success. The toolbar's buttons cannot see either happen — what they light up from is Vue's own
   * copy of the tool — so this is how they are told.
   */
  onToolChange: ((tool: Tool) => void) | null = null;

  /**
   * The world's own word for what the play just did: a feat, as a sentence rather than a code,
   * because what it says is what the chat will say. The page wires this to the run's own line
   * (`useLiveRun`), so a run that hauls her into a split announces itself in the log — the link
   * stays the link, and the words around it change. Null when nobody is listening, which is every
   * page that is not recording a run.
   */
  onFeat: ((label: string) => void) | null = null;

  /**
   * The run's own word for itself, as a machine over the first doll's pose (`feat-state.ts`): seven
   * markers with weights, the line only ever climbing to a heavier one, and the enlightenment held
   * for its three seconds over everything else. Reset when a run begins (`record`), stepped with
   * the world (`liveStep`), and said through {@link onFeat} when its words change.
   */
  private readonly feats = new FeatState();

  get tool(): Tool {
    return this.world.tool;
  }

  /** The engine every doll and rope on the stage shares — the headless tests read `speed`/`onHold`. */
  get engine(): PEngine2D {
    return this.world.engine;
  }

  setTool(tool: Tool): void {
    if (this.world.tool === tool) return;
    this.world.tool = tool;
    this.reportedTool = tool;
    // A rope that is only half drawn belongs to the rope tool, so switching away abandons it.
    if (tool !== 'rope') this.world.cancelRope();
  }

  /**
   * The player has left the stage for another of the garden's screens: the live world stands still
   * until they come back (`resume`), whatever it was doing — a doll mid-fall hangs where she was, a
   * run being written waits at the step it had got to, and nothing of the away time is recorded. The
   * hold is let go of as well, the way a hidden tab lets it go: a hand that is no longer at the stage
   * is no longer holding anything on it.
   *
   * A playback is not the player's hand and not the live world — a tape walks its own clock — so the
   * walk goes on; a watch is left and returned to, never taken along.
   */
  suspend(): void {
    this.away = true;
    if (!this.player) this.release();
  }

  /** The player is back at the stage: the world and the run being written on it go on where they stood. */
  resume(): void {
    this.away = false;
  }

  /**
   * The character list's own action: one more doll, wearing the character the player picked, put down
   * on the first free spot of the stage. Returns null when the engine has no room for another rig.
   */
  addDoll(character: Character = DEFAULT_CHARACTER): Doll | null {
    // A doll arriving mid-run is the one change to the cast a tape carries (`TapeRecorder.dollAdded`),
    // filed before she is put down so that the row that follows is hers from the first step she is in.
    // Nothing is filed while another player's run has the world: the stage being added to is not the
    // player's own.
    if (!this.player) this.recorder?.dollAdded(character.id, character.name, character.folder);
    // `undefined` for the spot: the world's own default is the first free one.
    const doll = this.world.addDoll(undefined, character);
    return doll;
  }

  /**
   * Tells the toolbar about a tool the world changed without being asked. Called from the two ways in
   * that can change it — coming home from a watched run (`homeAgain`), and the press that fixes a rope
   * handing the arrow back (`pressAt`) — and nowhere else: otherwise a tool picked is the player's to
   * keep until they pick another.
   */
  private syncTool(): void {
    const tool = this.world.tool;
    if (tool === this.reportedTool) return;
    this.reportedTool = tool;
    this.onToolChange?.(tool);
  }

  /**
   * What the stage is holding, in client coordinates — the headless smoke test uses this to click on
   * the things it has just added, the way it uses {@link toScreen} for the doll.
   */
  overview(): {
    tool: Tool;
    dolls: number;
    ropes: number;
    longestStretch: number;
    /** Screen point of every doll's torso, so a test can click one. */
    dollHandles: { x: number; y: number }[];
    /** Who every doll on the stage is dressed as, in the same order as `dollHandles`. */
    dollCharacters: { id: string; name: string }[];
    /**
     * Every doll's own joints by name, in the same order as `dollHandles`. {@link snapshot} files
     * particles by name alone and so blurs dolls together; this is the way to a joint of one of them.
     */
    dollJoints: Record<string, { x: number; y: number }>[];
    /** Screen point of the middle of every rope, plus whether it is tied to something. */
    ropeHandles: { x: number; y: number; tied: boolean }[];
    /** Screen point of every rope's two knots, so a test can drag one about. */
    anchorHandles: { x: number; y: number; tied: boolean }[];
  } {
    const tied = (anchor: Anchor): boolean => anchor.holder !== null;
    return {
      tool: this.world.tool,
      dolls: this.world.dolls.length,
      ropes: this.world.ropes.length,
      longestStretch: this.world.longestStretch(),
      dollHandles: this.world.dolls.map((doll) => {
        const torso = doll.joint('stomach') ?? doll.centre;
        return this.toScreen(torso.x, torso.y);
      }),
      dollCharacters: this.world.dolls.map((doll) => ({
        id: doll.character.id,
        name: doll.character.name,
      })),
      dollJoints: this.world.dolls.map((doll) => {
        const joints: Record<string, { x: number; y: number }> = {};
        for (const particle of doll.particles) {
          if (particle.name) joints[particle.name] = this.toScreen(particle.x, particle.y);
        }
        return joints;
      }),
      ropeHandles: this.world.ropes.map((rope) => {
        const middle = rope.nodes[Math.floor(rope.nodes.length / 2)];
        return { ...this.toScreen(middle.x, middle.y), tied: tied(rope.start) || tied(rope.end) };
      }),
      anchorHandles: this.world.ropes.flatMap((rope) =>
        [rope.start, rope.end].map((anchor) => ({
          ...this.toScreen(anchor.node.x, anchor.node.y),
          tied: tied(anchor),
        })),
      ),
    };
  }

  /** Diagnostic snapshot for the headless smoke test (tools/smoke.mjs). */
  inspect(): ReturnType<Scene['inspect']> | null {
    return this.scene?.inspect() ?? null;
  }

  /** World point -> client coordinates, so tests can aim the real pointer at her. */
  toScreen(x: number, y: number): { x: number; y: number } {
    return this.scene?.toScreen(x, y) ?? { x, y };
  }

  /**
   * Where the interface goes and how big it is, in client (CSS) pixels — the world's own corner, the
   * scale the world has shrunk it by, and how wide and tall it is at that scale (see `Scene.hud`). The
   * toolbar is DOM rather than canvas, so this is what puts it *inside* the world — the tape's own bar
   * included, which is centred on the world's foot and measured against the frame this reports; the
   * strip of portraits asks the renderer directly.
   */
  hud(): { x: number; y: number; scale: number; width: number; height: number } {
    return this.scene?.hud() ?? { x: 0, y: 0, scale: 1, width: 0, height: 0 };
  }

  /** Particle positions by rig name — the smoke test reads these. Ropes have no names. */
  snapshot(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const p of this.world.engine.particles) if (p.name) out[p.name] = { x: p.x, y: p.y };
    return out;
  }

  /** Mass-weighted centre of mass height: the one number gravity alone moves. */
  centreOfMassY(): number {
    let mass = 0;
    let y = 0;
    for (const p of this.world.engine.particles) {
      mass += p.mass;
      y += p.mass * p.y;
    }
    return mass === 0 ? 0 : y / mass;
  }

  /** Puts every doll back in the pose it was authored in. */
  respawn(): void {
    this.world.respawn();
    this.world.engine.onHold = null;
  }

  // --------------------------------------------------------------------- tape

  /**
   * Starts writing a tape down: the stage as it stands becomes the tape's own first moment, the engine's
   * randomness is seeded from one fresh number, and every step of the world from here is written into it
   * as a row of the joints and faces the step was played in (`liveStep`).
   *
   * Nothing is reset: the player's own stage is the tape's stage. The seed is for the *player's own*
   * weather — the times a face holds while the run is being played — and travels in the head as the
   * run's parentage rather than as anything a playback needs: the weather is already in the rows.
   *
   * One thing is thrown away, and it is the one thing a tape cannot even see: a rope that is only half
   * drawn (`World.cancelRope`), since there is no such thing as half a rope and the ropes are not the
   * tape's to carry at all.
   *
   * The debug desk, if one is up, starts both its tracks over here: a desk watches *a* run, and this is where a
   * run begins.
   *
   * The run starts *by itself*: the first touch of a doll in a live world is what calls this (`pressAt`), and
   * that is the whole of what starts one — the bar of tools has no button for it any more. What such a run is
   * *for* is the server: it is handed over in slices of a second as it is played and sent as finished when the
   * page goes away (`frontend/src/live/`), so the timeline is left out of it — what is being written is
   * nobody's playback.
   *
   * `stopRecording` still ends one on the spot, and that is what a smoke test goes through: a run
   * that nobody asks a slice of is simply a recording that is over when it is told to be.
   */
  record(): void {
    if (this.recorder) return;
    this.unload();
    // A new run owns the door to the server: whatever the one before it had left is gone with it (`tail`).
    this.tail = null;
    this.world.cancelRope();
    // And nothing of it has been said yet: a run's own word for itself starts with the page's
    // announcement of it and is earned from there (`noteFeats`).
    this.feats.reset();
    const seed = tapeSeed();
    // A fresh stream for the world's own odds, taken before the stage is written down. The instance is
    // kept (`weather`) so that a run interrupted by a watch and resumed draws on from where it had got
    // to rather than from its seed again.
    const weather = new Random(seed);
    this.weather = weather;
    this.world.useRandom(weather.next);
    this.recorder = new TapeRecorder(seed, this.world.snapshot());
    this.report(true);
  }

  /**
   * Stops writing, and leaves the run that was written on the timeline with the playhead at its end — the
   * world is already standing at the end of it, since the player has just played it.
   *
   * The world is deliberately *not* put back to the tape's own beginning here: what the player has just made
   * is what they are looking at, and putting the run back is what pressing play does (`play`).
   */
  stopRecording(): Tape | null {
    const recorder = this.recorder;
    if (!recorder) return null;
    // The world has to be the player's own for what follows — the run's own end is what the timeline is
    // handed, and the promise is that the world is already standing in it. Under a watch it is not: another
    // run's tape has it (`ownStage`), so the player's scene comes back first, and with it the run's own
    // weather — the recorder is finished on the same stream it was written with.
    this.homeAgain();
    this.recorder = null;
    this.weather = null;
    const tape = recorder.finish();
    // The last of the run is kept for whoever was sending it (`tail`): the recorder goes, and with it the only
    // place the rest of the run could have been asked for.
    this.tail = recorder.takeSlice(1);
    this.tape = tape;
    this.bytes = tapeBytes(tape);
    this.player = new TapePlayer(tape);
    this.player.end();
    // The run is the player's own and it is over: a tape off a recording is not a tape that grows.
    this.growing = false;
    this.playing = false;
    this.inTape = false;
    this.seeking = null;
    this.report(true);
    return tape;
  }

  /**
   * Watches the loaded tape: the stage is put back as it was recorded and the run is walked at the speed it
   * was recorded at, one 20 ms step per 20 ms of wall clock.
   *
   * A playback that is paused mid-run carries on from where it was; a run that has been watched to its end,
   * or a world that is not standing in the tape at all, starts again from the beginning — which is the only
   * way to start, since the world has no way to be *put* into the middle of a run (`rewind`). The one tape
   * that is not started over is one that is still growing: a playback standing at the end of such a tape is
   * standing where the run has got to, and pressing play there is carrying on with it.
   *
   * A run of the player's own that stands suspended under this tape (`recorder`) is none of the playback's
   * business: the tape has the *world* for as long as it is loaded, and the run — the recorder, and the
   * player's scene put aside with it — waits for the tape to come off (`unload`) rather than being ended by
   * a watch.
   */
  play(): void {
    const player = this.player;
    if (!player || this.playing) return;
    if (!this.inTape || (player.done && !this.growing)) this.rewind(0);
    this.playing = true;
    this.paused = false;
    this.accumulator = 0;
    this.report(true);
  }

  /**
   * Stops the run where it stands: the world is left in the state the tape left it in, and the tape stays on
   * the timeline, so `seek` and `play` still work on it.
   *
   * This is the pause of a playback rather than a second pause: the world's own pause (the space bar) keeps
   * the *live* world still, and during a playback the two do the same thing to the same frame loop.
   */
  stopPlaying(): void {
    this.playing = false;
    this.seeking = null;
    this.report(true);
  }

  /**
   * Takes the tape off the timeline. The world goes back to being the player's own: to the scene they put
   * aside when the tape was loaded, if the tape was somebody else's run (`homeAgain`) — and to whatever it
   * is standing in if it was their own recording, which is where their game left it and theirs to keep.
   *
   * A run of the player's own that was standing suspended under the tape goes on from where it was: the
   * same recorder, the same count of steps, the same run on the server — coming back from a watch is not
   * a new recording, and what the player does next lands in the run they were already writing. A run that is
   * being written with *no* tape over it cannot be reached from the page — a tape has to be loaded for the
   * timeline to have its «Закрыть» — but ends here all the same rather than writing into a world the caller
   * is about to make something else of, which is what `record` expects of the slate it starts from.
   */
  unload(): void {
    if (this.recorder && this.ownStage === null) {
      this.tail = this.recorder.takeSlice(1);
      this.recorder = null;
      this.weather = null;
    }
    this.clearTape();
    this.homeAgain();
    this.report(true);
  }

  /**
   * The tape's own state off the timeline: no run loaded, no walk under it, no wind to a step, and the
   * world left exactly where it stands — whether that is the watched run's stage or the player's own
   * scene is the caller's half of it (`unload` puts the player's back; `loadTape` keeps the world for
   * the tape that is about to take it).
   */
  private clearTape(): void {
    this.tape = null;
    this.bytes = 0;
    this.player = null;
    this.growing = false;
    this.playing = false;
    this.inTape = false;
    this.seeking = null;
  }

  /**
   * The world back to the player's own scene, if another run's tape had it: the stage as it was put aside
   * (`loadTape`), the tool as it was in the player's hand, and — when a run of their own was being written —
   * the run's own weather, put back mid-flow so that the same steps draw the same numbers a playback of the
   * run will draw (`weather`). The stage goes back *before* the stream is handed over, because `World.restore`
   * builds its dolls under whatever stream the world holds — the watched run's — and the hand-over afterwards
   * is what binds everything on the stage as it now stands, rebuilt and kept alike, to the run the player is
   * coming back to.
   *
   * The keys are dropped rather than kept with the scene: a tape walks its own arrows through the same set
   * (`replay`), so what is held down at the end of a watch is the watched run's doing and not the player's
   * — and a key still held on the way into a watch was never taken up again while it lasted
   * (`onKeyDown` leaves a loaded tape alone), so a clock nobody was pressing is what putting it back would
   * be.
   */
  private homeAgain(): void {
    const away = this.ownStage;
    if (!away) return;
    this.ownStage = null;
    this.world.restore(away);
    this.world.tool = this.ownTool;
    this.syncTool();
    this.keyState.clear();
    const weather = this.weather;
    if (weather && this.recorder) this.world.useRandom(weather.next);
  }

  /**
   * Takes the run to a step: the stage is put back to the tape's own beginning and wound forward from there,
   * which is the only way to reach a step of a run — a step is the whole state of a world and not a pose, so
   * there is nothing to jump *to* (`World.restore`).
   *
   * Winding is done a frame at a time while a run is long ({@link SEEK_STEPS_PER_FRAME}), so a seek into the
   * middle of a two-minute tape is a tenth of a second of fast-forward rather than a freeze. A seek that is
   * already heading further along than the new target is simply re-aimed: a slider being dragged is one wind,
   * not fifty.
   */
  seek(step: number): void {
    const player = this.player;
    if (!player) return;
    const target = Math.max(0, Math.min(Math.round(step), player.total));
    if (this.seeking !== null && target >= this.seeking) {
      this.seeking = target;
      this.report(true);
      return;
    }
    this.rewind(target);
  }

  /**
   * Puts the stage back as the tape recorded it and aims the run at a step — which is what both `play` and
   * `seek` are made of, and the only place a world is ever put into a tape.
   *
   * The stage goes back first (`World.restore`) and the player's cursor with it, and if the step asked
   * for is not the first one the frame loop is told to wind forward to it — a walk now rather than a
   * simulation, so a wind is arithmetic on the tape's own records and costs nothing the run did not
   * already pay for when it was played.
   */
  private rewind(step: number): void {
    const player = this.player;
    if (!player) return;
    this.world.restore(player.tape.stage);
    player.rewind();
    this.inTape = true;
    this.seeking = step > 0 ? Math.min(step, player.total) : null;
    this.report(true);
  }

  /** The loaded tape as a file, or null when there is none — what a smoke test or a download would take. */
  tapeJson(): string | null {
    return this.tape ? encodeTape(this.tape) : null;
  }

  /**
   * The head of the run being written, or null while nothing is being written: what a run that is sent as it
   * is played is opened with, and nothing more of it — what has happened since arrives in slices.
   *
   * It is the page's own door to a run in progress rather than the engine's own business: the engine knows
   * nothing of servers, and what it hands over is the shape the *file* has (`frontend/src/live/`).
   */
  liveHead(): TapeHead | null {
    return this.recorder ? this.recorder.head : null;
  }

  /**
   * The next slice of the run being written, or null while there is nothing new to hand over: a second of the
   * run ({@link TAPE_SLICE_STEPS}), which is what another window watching this page is watching it through.
   *
   * `every` is how much a slice has to be worth before there is one at all — a second of the run by default,
   * and `1` for the slice that *ends* one: a run's last second is a fraction of a second, and the end of a run
   * is a slice like any other (`frontend/src/live/`).
   *
   * A run that has stopped being written is not a run with nothing to hand over: the last steps of it are kept
   * when the recorder goes (`tail`), so the page that was sending it can still finish it off.
   *
   * The slice is *taken* rather than read: the recorder moves its own cursor on, so each second of a run is
   * handed out exactly once however often the page asks, and a slice the page fails to send is the page's to
   * send again — the pieces are numbered, and a number that has already arrived is not counted twice
   * (`Store.AppendChunk`).
   */
  liveSlice(every: number = TAPE_SLICE_STEPS): TapeSlice | null {
    if (this.recorder) return this.recorder.takeSlice(every);
    // A run that has stopped being written still has its last steps to hand over, and they are handed over
    // once: a slice asked for twice would be a run finished twice (`tail`).
    const tail = this.tail;
    this.tail = null;
    return tail;
  }

  /**
   * A tape off a file, put on the timeline ready to be watched (`decodeTape` checks it as it is read, and
   * throws a sentence if it is not a tape this build can play).
   *
   * The world is not touched yet: a tape is a *run*, and loading one is not part of it. Pressing play puts
   * the world back to the run's own beginning; the timeline can be dragged about before that, and the first
   * drag is what puts the world into the tape. What *is* taken, and taken now, is the player's own scene
   * (`ownStage`): from the moment this tape is walked the world is this run's, and the scene the player
   * left — a run of their own in the middle of being written among it — is put aside until the tape comes
   * off the timeline (`unload`). A run being written is not ended by a watch: it stands suspended, and goes
   * on when the player comes back.
   *
   * A tape already on the timeline is replaced rather than interleaved, and the scene put aside for *it* is
   * kept: watching one run after another costs the player's scene nothing, and the scene they come back to
   * after the last of them is the one they left before the first.
   */
  loadTape(json: string): Tape {
    const tape = decodeTape(json);
    if (this.ownStage === null && !this.inTape) {
      this.ownStage = this.world.snapshot();
      this.ownTool = this.world.tool;
    }
    this.clearTape();
    this.tape = tape;
    this.bytes = tapeBytes(tape);
    this.player = new TapePlayer(tape);
    this.player.end();
    // A tape that came down as a file is a run that is over, whoever is watching it, and `growTape` is what
    // says otherwise — the first time there turns out to be more of it.
    this.growing = false;
    this.report(true);
    return tape;
  }

  /**
   * The run on the timeline as it stands: the same tape with a slice of itself pasted onto the end
   * ({@link appendSlice}), and whether that run is still being played.
   *
   * This is the one thing a tape on the timeline is allowed to do that a file cannot. A tape off a file is a
   * run that is over, while a tape that grows is a run somebody is still playing, and that difference is the
   * whole of what watching a run from the outside is (`frontend/src/live/`). So the walk is left alone —
   * nothing is rewound, nothing is applied twice, the playhead stays where it is — except in the one case a
   * viewer cares about: a playback that had run out of tape, which is where a playback stops on its own
   * (`playFrame`), carries on into what has just arrived instead of standing at an end the run has not
   * reached. A walk the player stopped in the middle of the run stays stopped.
   *
   * Which run this is is the caller's business rather than this method's: what is checked here is that the
   * tape is *this* tape with more of it — the same format, step and seed, and longer than what the timeline
   * holds — and a tape that is not is refused rather than pasted onto a run it does not belong to. A tape that
   * did not grow is not a mistake either: `live` false is how the run's own ending arrives, and a run that is
   * over has nothing left to wait for.
   */
  growTape(tape: Tape, live: boolean): void {
    const loaded = this.tape;
    const player = this.player;
    if (!loaded || !player) return;
    if (tape.format !== loaded.format || tape.step !== loaded.step || tape.seed !== loaded.seed) return;
    const grew = tape.steps > loaded.steps;
    if (grew) {
      // The walk has nothing left to walk: it is waiting for the rest of the run rather than stopped in the
      // middle of one, so there is no pressing play left for the player to do.
      const waiting = player.step >= loaded.steps;
      this.tape = tape;
      this.bytes = tapeBytes(tape);
      player.grow(tape);
      if (waiting) {
        this.playing = true;
        this.accumulator = 0;
      }
    }
    // A second of a run in which nothing was written is not a change to tell the interface about: what is
    // pushed is a run that grew, and a run that has just stopped being played.
    const told = grew || live !== this.growing;
    this.growing = live;
    if (told) this.report(true);
  }

  /**
   * What the interface is told about the tape, right now — the same object the push carries, for anything that
   * would rather ask than listen. The smoke test reads it, and what it is for is that everything about a run
   * worth checking from outside the engine is in one place.
   */
  get tapeState(): TapeReport {
    return this.buildReport();
  }

  /**
   * Says what there is to say about the tape, if anything has changed since the last time.
   *
   * The playhead is only pushed every {@link REPORT_EVERY_STEPS} steps — a hundred milliseconds of run —
   * because the timeline it drives is a Vue component and fifty renders a second of the whole page is not what
   * a run is worth. Nothing at all is pushed while neither the tape's own flags nor its playhead have moved.
   */
  private report(force = false): void {
    const next = this.buildReport();
    const last = this.reported;
    if (!force && last) {
      const sameFlags =
        last.recording === next.recording &&
        last.playing === next.playing &&
        last.loaded === next.loaded &&
        last.seeking === next.seeking &&
        last.steps === next.steps;
      if (sameFlags && Math.abs(last.step - next.step) < REPORT_EVERY_STEPS) return;
    }
    this.reported = next;
    this.onTapeChange?.(next);
  }

  /** The tape as it stands: what a push carries, and what {@link report} holds against the last one pushed. */
  private buildReport(): TapeReport {
    const player = this.player;
    return {
      recording: this.recorder !== null,
      playing: this.playing,
      loaded: this.tape !== null,
      // While a run is being written the playhead is the run's own length — the one number about a
      // run in progress there is, and what tells the player's page how far it has got.
      step: player ? player.step : (this.recorder ? this.recorder.steps : 0),
      steps: player?.total ?? 0,
      seeking: this.seeking !== null,
      seed: this.tape?.seed ?? 0,
      bytes: this.bytes,
    };
  }

  // ------------------------------------------------------------------- input

  private attachInput(): void {
    const canvas = this.scene?.canvas;
    if (!canvas) return;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    // A finger held on the glass is a hand on the doll, not a long press: the browser's own menu for a
    // held pointer would swallow the rest of the drag, and there is nothing in the game to press it for.
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private detachInput(): void {
    const canvas = this.scene?.canvas;
    canvas?.removeEventListener('pointerdown', this.onPointerDown);
    canvas?.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onVisibility = (): void => {
    // A hidden tab stops the loop, so drop the hold instead of flinging her on return.
    //
    // Only the *player's own* hand is dropped, and only in the player's own world. A tape on the timeline
    // has the world, and the hold in it belongs to nobody: a playback is the tape's picture, not a
    // simulation with a hand in it.
    if (document.hidden && !this.player) {
      this.release();
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (keyboardBelongsToField(event.target)) return;
    const key = event.key.toLowerCase();
    // A playback is the tape's own doing, and the keys are not the player's to press — except the pause, which
    // stops the run where it stands (`stopPlaying` is what the button does, and this is the same thing).
    if (this.player && key !== ' ') return;
    this.keyState.add(key);
    if (event.repeat) return;
    if (key === ' ') {
      event.preventDefault();
      this.paused = !this.paused;
    } else if (key === 'r') {
      this.respawn();
    } else if (key === 'escape') {
      // A rope that is only half drawn can always be thrown away.
      this.world.cancelRope();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (keyboardBelongsToField(event.target)) return;
    const key = event.key.toLowerCase();
    if (this.player && key !== ' ') return;
    this.keyState.delete(key);
  };

  /**
   * A click on the stage, routed by the tool the toolbar has selected: the rope tool lays one end of
   * a rope (the first click) or fixes the whole rope (the second) — or takes hold of a knot, if the
   * click landed on one, which either tool carries — and the arrow tool drags things: the
   * *middle* of a rope's cord, which takes the whole rope off the stage, and otherwise the original's
   * `onMouseDown`, which held every particle within sqrt(1500) of the pointer.
   *
   * A pointer is either a mouse, a finger or a pen — a `pointerdown` from any of them is a click here,
   * and the whole drag is followed by *that* pointer's id until it is lifted ({@link pointer}): the
   * second finger of a two-finger touch is not a second hand on the doll, and a finger that the browser
   * takes away (a call, a system gesture) ends the drag exactly as lifting it would.
   */
  private onPointerDown = (event: PointerEvent): void => {
    // A playback is the tape's own doing: the stage is not the player's to press on while a run is walking.
    if (this.player) return;
    // Somebody else is already holding something: one hand at a time, whichever it is.
    if (this.pointer !== null && event.pointerId !== this.pointer) return;
    const point = this.scene?.toWorld(event.clientX, event.clientY);
    if (!point) return;
    // The press is made first and the hand is asked what it is holding afterwards, because the rope tool's
    // press is not always the click it spends: one that lands on a knot takes it in hand, and the drag is
    // then either tool's drag alike — the pointer is followed, captured, and anchored against the camera
    // the same way. Every other press the rope tool makes spends itself on the rope it is drawing — a rope
    // end is put down with the press itself, and there is nothing for the pointer to follow afterwards.
    // The arrow presses *through* to the hand below, even when the press is one that takes a rope off the
    // stage: what a press did is read off the world afterwards (`holdingAnything`), so a press that burned
    // a rope simply leaves the hand empty.
    this.pressAt(point);
    if (this.world.tool === 'rope' && !this.holdingAnything()) return;
    this.pointer = event.pointerId;
    try {
      this.host.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety: dragging works even without it */
    }
    // The anchor is kept only for a press that took something — particles of a doll, or a knot: a hand
    // holding the bare floor has nothing for a camera to move, and a hand that took nothing has no
    // reason to be immune to one either. Where the hand is *now* follows the same rule, being the
    // assist's own input: it starts where the press landed, and moves with the hand from there.
    this.grab = this.holdingAnything()
      ? { clientX: event.clientX, clientY: event.clientY, worldX: point.x, worldY: point.y }
      : null;
    this.hold = this.grab ? { clientX: event.clientX, clientY: event.clientY } : null;
  };

  /**
   * What a press on the stage does, at a world point: routed by the tool the toolbar has selected — the rope
   * tool lays one end of a rope (the first click) or fixes the whole rope (the second), and either tool
   * drags things: a knot of a rope if the click landed on one, the *middle* of a rope's cord, which takes the
   * whole rope off the stage, and otherwise the original's own `onMouseDown`, which holds every particle within
   * sqrt(1500) of the pointer.
   *
   * A rope the press took off the stage goes to the renderer, which bursts it where it stood (`Scene.popRope`):
   * the world has already let the rope go by the time the press returns, so the picture of it going is all that
   * is left of it, and the world has no business keeping a picture of a rope it no longer has.
   */
  private pressAt(point: { x: number; y: number }): void {
    const ropes = this.world.ropes.length;
    const burned = this.world.press(point.x, point.y);
    if (burned) this.scene?.popRope(burned, point.x, point.y);
    // A rope fixed on the stage spends the rope tool: the press that drew its second end is the tool's
    // own last act, and the hand goes back to the arrow — the rope is there to be pulled about now, and
    // pulling is the arrow's work. The bar cannot see a press, so the change is told rather than waited
    // for (`onToolChange`); a rope that came out too short spends nothing, because the draft is still
    // waiting for its proper second click.
    if (this.world.ropes.length > ropes) {
      this.world.tool = 'drag';
      this.syncTool();
    }
    // The first touch of a doll is what starts a run (`record`): the player's own play is the thing worth
    // writing down and sharing, and the bar of tools has no button for it any more. A press that took hold of
    // nothing — a knot, the bare floor — starts nothing, because what a run is about is her.
    if (!this.startingARun()) return;
    this.record();
  }

  /**
   * Whether this press is the one that starts a run: a live world (no tape being walked), nothing being written
   * yet, and a hand that has taken hold of a doll.
   */
  private startingARun(): boolean {
    return this.player === null && this.recorder === null && this.holdingADoll();
  }

  /**
   * Whether the hand that has just pressed the stage is holding any part of any doll.
   *
   * A press is routed by the tool (`World.press`): the arrow takes a knot first and only then the
   * particles of a doll, which is the original's own `onMouseDown` holding every particle within
   * `sqrt(1500)` of the point. So what says a *doll* was touched is the overlap between what the engine is
   * holding and the dolls' own particles.
   */
  private holdingADoll(): boolean {
    const held = this.world.engine.onHold;
    if (!held || held.length === 0) return false;
    return this.world.dolls.some((doll) => doll.particles.some((particle) => held.includes(particle)));
  }

  /**
   * The pointer is at a world point: the engine follows it, and a knot in the player's hand with it — paused
   * or not, which is why a knot can be carried about while the world stands still.
   */
  private moveTo(point: { x: number; y: number }): void {
    this.world.moveTo(point.x, point.y);
  }

  /**
   * The pointer let go at a world point: a knot in hand stays exactly where it was dropped, and is tied to
   * whatever is under that spot rather than to what it was tied to before.
   */
  private releaseAt(point: { x: number; y: number }): void {
    this.world.releaseAt(point.x, point.y);
    this.pointer = null;
    this.grab = null;
    this.hold = null;
  }

  /**
   * Whether the hand that has just pressed the stage is holding anything at all — particles of a doll,
   * or a knot of a rope — which is what decides whether the drag is anchored against the camera
   * ({@link grab}) or rides the view like every other click.
   */
  private holdingAnything(): boolean {
    if (this.world.dragged !== null) return true;
    return (this.world.engine.onHold?.length ?? 0) > 0;
  }

  /**
   * Where a pointer event lands in the world. With nothing in hand it is simply where it lands now,
   * through whatever the camera is doing — a hover and a rope's far end are the cursor's own and belong
   * on the glass. While a drag is on it is the drag's own anchor carried by the pointer across the
   * window instead: the anchor's place in the world, plus how far the pointer has moved since the
   * press, at the scale the world is drawn (`Scene.scale`) — a place the camera has no say in, which is
   * the point of it (`grab`).
   */
  private pointerWorld(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const scene = this.scene;
    if (!scene) return null;
    const grab = this.grab;
    if (!grab) return scene.toWorld(event.clientX, event.clientY);
    const scale = scene.scale;
    return {
      x: grab.worldX + (event.clientX - grab.clientX) / scale,
      y: grab.worldY + (event.clientY - grab.clientY) / scale,
    };
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.player) return;
    // Another finger (or the mouse, while a finger is down) is not what is being dragged.
    if (this.pointer !== null && event.pointerId !== this.pointer) return;
    const point = this.pointerWorld(event);
    if (!point) return;
    this.moveTo(point);
    // The hand's own place moves with it — the anchor above stays where the press was, and this is
    // what the edge assist reads instead.
    if (this.grab) this.hold = { clientX: event.clientX, clientY: event.clientY };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.player) return;
    if (this.pointer !== null && event.pointerId !== this.pointer) return;
    const point = this.pointerWorld(event);
    // A knot let go of stays exactly where it was dropped, so the release point is what matters — and a
    // release the window never gave a point for (a pointer the browser took away) is the point the engine's
    // own pointer is standing on, which is where the hand was.
    const at = point ?? { x: this.engine.mouseX, y: this.engine.mouseY };
    this.releaseAt(at);
  };

  private release(): void {
    this.pointer = null;
    this.grab = null;
    this.hold = null;
    this.engine.onHold = null;
  }

  // -------------------------------------------------------------------- loop

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = window.requestAnimationFrame(this.frame);
    const dt = Math.min(now - this.last, MAX_FRAME_MS);
    this.last = now;

    if (this.player) {
      // A run is on the timeline: the world belongs to the tape, and the frame walks it (`playFrame`).
      this.playFrame(dt);
    } else if (this.paused || this.away) {
      // A world standing still — the player's own pause, or the player being elsewhere in the garden
      // (`suspend`) — still *reads*: nothing about her pose is stepped, but what the player does to it
      // while the world stands still — put back in her authored pose, added to the stage, dragged along
      // the floor — is read into her face, so the card is about the same pose whatever the pause is
      // doing. The recorder hears none of it: time the player was not at the stage is not time the run
      // was being played.
      this.world.observe();
    } else if (!this.runIsIdle()) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP_MS && steps < 8) {
        this.liveStep();
        this.accumulator -= FIXED_STEP_MS;
        steps++;
      }
    } else if (this.recorder) {
      // The run has taken its own pause: the world is not being stepped at all, and the stillness is
      // handed to the recording by the wall clock instead — a pause in a tape is as long as it lasted.
      this.recorder.idle(dt);
    }

    // The frame's own clock is the camera's too: a pan glides at the pace the frames come, whatever
    // the display's refresh rate is (`Camera`), and the hand's place goes with it — the edge assist
    // reads where the drag has got to every frame, resting fingers included.
    this.scene?.render(dt, this.hold);
    this.carryHand();
  };

  /**
   * Adds what the edge assist carried this frame to the hand's own anchor — the one camera motion
   * that is allowed to move what a hand is holding (`Scene.carried` says how much, and it is all the
   * assist's own doing: the follow reports nothing here).
   *
   * The engine's own pointer is moved with it, because that is what both halves of a drag chase — the
   * particles a hold pulls toward it and the knot a hand carries (`World.step` reads the pair every
   * step) — and a knot let go at the edge must be dropped where the hand + the assist actually got it
   * to, not a frame behind. Nothing is carried with nothing in hand: the camera may still be easing
   * out of an assist for a few frames after a release, and that easing is the room's own settling,
   * with no anchor left to move.
   */
  private carryHand(): void {
    const carried = this.scene?.carried ?? 0;
    const grab = this.grab;
    if (carried === 0 || !grab) return;
    grab.worldX += carried;
    this.engine.mouseX += carried;
  }

  /**
   * One step of a live world: the run's own row first, then the clock the arrow keys turn, then the
   * world itself — and, last of all, the run's own word for what the step left her in (`noteFeats`).
   *
   * The tape being written, if there is one, reads the stage *before* the step is taken — the world as
   * it stands, rather than as the step leaves it — which is the same moment a playback puts the row
   * back at, so a played step and a recorded step are one and the same step. The stillness handed over
   * with it is the world's own answer for the step just gone (`standingStill`), which is what keeps a
   * world that is creeping by a hundredth of a pixel a step from being taken for a still one.
   */
  private liveStep(): void {
    const recorder = this.recorder;
    if (recorder) recorder.step(this.world.dolls, this.standingStill());
    this.applySpeedKeys();
    this.world.step(FIXED_STEP_MS);
    this.noteFeats(FIXED_STEP_MS);
  }

  /**
   * One step of the run's own word for itself (`feat-state.ts`): the first doll's pose is read into
   * the marker she is in — or the enlightenment that holds over her — and the page is told when the
   * line's words change, which is when the marker weighs more than the words it already has.
   *
   * Stepped inside the live step rather than once per frame, because the machine is a clock like the
   * face machine is: the enlightenment's three seconds are the world's own time, a `FIXED_STEP_MS`
   * at a time, and they pass while the run is being played rather than while the display is drawing.
   * A feat nobody is listening for (`onFeat` null) is not even measured — the world is not asked
   * about a thing nobody wants to know.
   */
  private noteFeats(elapsedMs: number): void {
    if (!this.onFeat) return;
    const said = this.feats.said;
    this.feats.step(this.world.dolls[0] ?? null, this.world.engine.maxy, elapsedMs);
    const word = this.feats.said;
    if (word !== said && word !== null) this.onFeat(word.label);
  }

  /**
   * Whether a run that is being written should stop stepping the world for a while: the run has taken
   * its own pause and the world (with the player's hand in it) is still standing exactly where it was.
   *
   * Nothing is stepped while it answers yes — the world because there is nothing to compute, and the
   * recording because the stillness is handed to it by the wall clock instead (`TapeRecorder.idle`).
   * The waiting is *in* the run rather than left out of it: a pause in a tape is as many steps long
   * as the stillness lasted, and the player who comes back finds the world where they left it — and
   * the timeline saying how long they were away (`TAPE_PAUSE_STEPS`).
   *
   * It is the *world* that is stepped or not, and that is why the two readings are both needed: a run's own
   * count of the stillness lives in the recorder, and whether the stillness is still going on is the world's
   * own answer — a hand on anything answers no, which is what puts the world back into gear.
   */
  private runIsIdle(): boolean {
    return this.recorder !== null && this.recorder.paused && this.standingStill();
  }

  /**
   * Whether the world stands where the last step left it: no body crept anywhere ({@link STILL_CREEP_PX}) and
   * nothing is in the player's hand.
   *
   * The whole of the stage is one list of bodies (`PEngine2D.particles`) — every doll's rig and every
   * bead of every rope at once — so "nothing is happening" is one pass over it. A hand counts as
   * something happening even when it is holding nothing: a knot being carried about, a rope being
   * drawn by its second click, a finger held on the floor are the player *doing* something, and a
   * world that stood still through them would throw away what they were doing.
   */
  private standingStill(): boolean {
    if (this.pointer !== null || this.world.dragged !== null || this.world.draft !== null) return false;
    return this.world.engine.particles.every(
      (p) => Math.abs(p.x - p.oldx) + Math.abs(p.y - p.oldy) < STILL_CREEP_PX,
    );
  }

  /**
   * One frame of a playback: either the run is being wound forward to a step the player picked, or it is being
   * watched — in which case it is walked at the speed it was recorded at, one 20 ms step per 20 ms of the
   * window's own clock, which is the same accumulator a live frame is paced by.
   *
   * Winding and watching are the same steps either way: what a seek changes is how many of them a frame takes,
   * not what a step is. Nothing about the world knows the difference — and a step of a playback is cheap now
   * that there is no simulation in it, so a wind is arithmetic on the tape's own records.
   */
  private playFrame(dt: number): void {
    const player = this.player;
    if (!player) return;
    const winding = this.seeking !== null && this.seeking > player.step;
    if (winding) {
      const target = Math.min(this.seeking ?? 0, player.total);
      for (let steps = 0; player.step < target && steps < SEEK_STEPS_PER_FRAME; steps++) this.tapeStep();
      if (player.step >= target) this.seeking = null;
    } else if (this.playing && !this.paused) {
      this.accumulator += dt;
      let steps = 0;
      // The end of the run is a step like any other: the loop stops *at* it, so that a playback never walks off
      // the end of its own tape and leaves the playhead past it.
      while (this.accumulator >= FIXED_STEP_MS && steps < 8 && !player.done) {
        this.tapeStep();
        this.accumulator -= FIXED_STEP_MS;
        steps++;
      }
      // The end of a tape that is still growing is not the end of a run but a wait for the rest of it, and the
      // seconds spent waiting are not steps the playback owes: time standing there is dropped rather than saved
      // up, or the slice that finally arrives would be run through in one burst.
      if (this.growing && player.done) this.accumulator = 0;
    }
    if (this.playing && player.done && !this.growing) {
      // The end of the run is the end of the playback, not an error: the world is left standing in the last
      // state the tape has, and the timeline is left for the player to drag about and play again. A tape that is
      // still growing has no such end yet — a playback of one waits at what has arrived (`growing`).
      this.playing = false;
      this.seeking = null;
    }
    this.report();
  }

  /**
   * One step of a playback: the edits of the step first — a doll arriving is part of the step she
   * arrives in — and then the row the recorder wrote for it, put straight into the world's joints and
   * cards. There is no simulation here and nothing to decide: the row *is* the step, which is the
   * whole of why a playback is the run that was recorded rather than something like it.
   */
  private tapeStep(): void {
    this.player?.walk(
      (edit) => this.applyEdit(edit),
      (row) => this.world.writePose(row),
    );
  }

  /**
   * One of the tape's own edits: a doll put on the stage mid-run, put down on the first spot that is
   * free (`World.freeSpot`) exactly as the click that added her did — the row that follows puts her
   * where she actually went from her first step in the run.
   */
  private applyEdit(edit: TapeEdit): void {
    if (edit[1] !== 'doll') return;
    this.world.addDoll(undefined, { id: edit[2], name: edit[3], folder: edit[4] });
  }

  /**
   * The original's arrow keys nudge the engine's `speed` by 0.01 per frame, letting the player
   * slow the whole simulation down or push it to 3x.
   */
  private applySpeedKeys(): void {
    const engine = this.engine;
    if (this.keyState.has('arrowright')) {
      engine.speed = Math.min(engine.speed + 0.01, 3);
    }
    if (this.keyState.has('arrowleft')) {
      engine.speed -= 0.01;
      if (engine.speed < 0) engine.speed = 0;
    }
  }
}
