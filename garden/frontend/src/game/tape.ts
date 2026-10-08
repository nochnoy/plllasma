/**
 * The tape: a run of the world written down, and played back.
 *
 * A tape is the picture of the run itself. Every step of the world, the position of every joint of
 * every doll and the face on every card is written down as one small row of whole numbers; a playback
 * is those rows played back in order, at the same 20 ms a step. Nothing is simulated on the way back —
 * the physics runs while the game is being played and never while a tape is watched — so a playback is
 * the run it came from by construction, and there is nothing to drift, diverge or disagree with the
 * recording, because the recording *is* the run.
 *
 * What keeps a tape small is that almost none of those rows are written:
 *
 * - a step in which nothing changed — the doll lying where she fell, the world exactly as the step
 *   before it — is not a row at all but a **pause**, one whole number standing for as many steps as
 *   the stillness lasted, and stillnesses that run on merge into the one number their total is
 *   (`TAPE_PAUSE_STEPS`, `TAPE_HEARTBEAT_STEPS`);
 * - the numbers themselves are whole — a quarter of a world pixel, {@link TAPE_SCALE} of them to the
 *   pixel, which no drawing of her artwork can tell from the position she was actually in — and each
 *   row says only how far it moved from the row before it, so a step of a lying doll is a row of
 *   zeros a byte apiece and a step of a dragged one is a row of one- and two-figure numbers;
 * - the bodies are not named in it. The joints of a rig are the rig's own, in its own order, and a
 *   row is read by position: twelve pairs and a face to a doll, the dolls in the stage's own order.
 *
 * What a tape does not carry at all is everything that is not a doll. Ropes run in the world's own
 * physics while the game is played and are simply not part of the picture on the way back — a cord
 * over a run would only say where its knots were — and the one thing that can happen to the *cast*
 * mid-run, a doll being put on the stage, travels beside the rows as an edit ({@link TapeEdit}) that
 * says which character arrived, so the rows after it know whose they are.
 */

/** What every tape says it is: the codec's own name and version, so a file of another age is refused. */
export const TAPE_FORMAT = 'garden-tape/2';
/**
 * One step of the world, in milliseconds: the movie's own 50 fps, which is what `Game` steps at. A
 * tape's steps are counted in these, so `steps * step` is how long the run is — pauses included,
 * because a pause is time the run took.
 */
export const TAPE_STEP_MS = 20;
/**
 * How many pieces a world pixel is cut into in a tape: four, so the smallest distance a tape can
 * express is a quarter of a pixel.
 *
 * The choice is a bargain rather than a measurement: half the precision and the numbers are twice
 * the size of their deltas, twice the precision and a slow limb starts stepping a quarter-pixel at a
 * time. A quarter of a pixel is an eighth of a texel of her artwork — under a fifth of what a
 * sub-pixel render pass dithers away — and it keeps the whole of the world's reach, a doll hauled
 * to the ceiling over the top of the picture included, inside the thirty-two thousand an
 * int16 holds: the day this format wants to be bytes instead of JSON, the numbers already are them.
 */
export const TAPE_SCALE = 4;
/**
 * How many steps of a run one *slice* of a live run holds: a second of it, fifty steps of 20 ms.
 *
 * A slice is how a run that is still being played is sent to the server (`backend/internal/api`, `POST
 * /api/recordings/{id}/chunks`), and a second is what the two ends of that need at once: short enough
 * that somebody watching another player sees them about a second behind, and long enough that a run in
 * progress costs one small request a second rather than fifty. A second of a dragged doll is a few
 * kilobytes of small numbers, and a second of a still one is usually nothing at all.
 */
export const TAPE_SLICE_STEPS = 50;
/**
 * How many steps the world has to stand exactly still before a run stops being *stepped* at all: two
 * seconds, a hundred steps.
 *
 * This is the game's own economy rather than the file's — a run that is still for less than this is
 * written a zero row a step (which is what a doll settling by a thousandth of a pixel is), and a run
 * that is still for longer has nothing left to compute, so the frame loop stops stepping the world and
 * the pause grows by the wall clock instead (`TapeRecorder.idle`). Either way the stillness itself is
 * one pause in the tape; this only decides when the simulation agrees there is nothing to do.
 */
export const TAPE_PAUSE_STEPS = 2 * TAPE_SLICE_STEPS;
/**
 * How long a pause may keep growing in the hand before it is handed over anyway: fifty seconds, in
 * steps — well inside the two minutes the server gives a live run before it stops calling it live.
 *
 * A run whose doll is lying still for minutes owes the server nothing: the watcher is watching a
 * still world, and there is no news. But a run that says nothing for too long looks like a run that
 * is over, so a long pause is closed and sent on at this length — one number a minute, while the
 * stillness goes on — and the stillness that follows starts a pause of its own. In the run's own
 * finished file those pauses have nothing between them and are one number (`finish` merges); it is
 * only the live wire that carries a pause a minute, which is what a minute of nothing costs.
 */
export const TAPE_HEARTBEAT_STEPS = 50 * TAPE_SLICE_STEPS;

/**
 * One record of the run's body. A step in which anything moved is the whole row of numbers that step
 * moved by; a stillness is one number, the count of steps it lasted. JSON tells them apart without
 * help — a number is a pause, an array is a step — and no two pauses ever sit next to each other:
 * anything that closes a pause merges into the one before it (`TapeRecorder.finish`, `appendSlice`).
 */
export type TapeFrame = number | number[];

/**
 * The one thing that can happen to the cast mid-run: a doll put on the stage, as `[step, 'doll', id,
 * name, folder]` — the character's own three fields (`characters.ts`), at the step she takes effect
 * before.
 *
 * A doll lands on the first free spot (`World.freeSpot`) exactly as the click that added her put her
 * there, and the first row after the edit is written whole rather than as deltas, because a doll that
 * was not in the row before is not a distance away from it. Everything else about the cast — a
 * respawn, a pose made of her, a rope tied to her — is positions and faces, and the rows carry it.
 */
export type TapeEdit = readonly [step: number, kind: 'doll', id: string, name: string, folder: string];

/** What the recorder reads of the stage each step: a doll's joints, and the face on her card. */
export interface TapeDollPose {
  readonly particles: readonly { readonly x: number; readonly y: number }[];
  readonly pain: { readonly shown: number };
}

/**
 * A doll as a tape knows her: the character she wears, where every joint of her rig was, and what her
 * own clock was doing.
 *
 * The rig is written down as *four* numbers per particle — where it is and where it was, x, y, x, y —
 * because Verlet reads the difference as the velocity, and this stage is not only a tape's opening
 * moment: it is also how the player's own world is put aside while they watch somebody else's run and
 * put back afterwards (`ownStage`), and a doll recorded in mid-fall and returned standing still would
 * not fall the way she was falling. The face is the state of her clock (`PainState.state`), for the
 * same reason on the same trip — the tape's own playback never runs the clock, it reads the face off
 * every row, but the player's world coming back is the world, and the world keeps its clocks.
 */
export interface TapeDoll {
  /** The character's own three fields (`characters.ts`), which is the whole of a character. */
  readonly id: string;
  readonly name: string;
  readonly folder: string;
  /** Her rig: x, y, x, y per particle, in the extractor's own order. */
  readonly rig: readonly number[];
  /** The state of the clock behind her card (`PainState.state`). */
  readonly pain: readonly number[];
}

/**
 * A rope as the player's own world is put aside with: where its two knots were, and where the chain
 * between them lay. Every point twice — where it is and where it was — for the same reason a rig is.
 *
 * A *tape* never carries ropes (they are not part of the picture it takes), but the stage shape is
 * the world's own snapshot as well as the tape's opening, and a player who ties a rope, watches a
 * run, and comes back gets their rope back with the rest of their scene. The head a recorder hands
 * the server always carries it empty.
 */
export interface TapeRope {
  /** The two knots as x, y, x, y each: the start's position and its previous one, then the end's. */
  readonly knots: readonly number[];
  /** The beads between them, x, y, x, y apiece. */
  readonly beads: readonly number[];
}

/**
 * The stage a tape starts on: the engine's own numbers, every doll with her rig, and — for the
 * player's own world being put aside rather than for any playback — the ropes on it.
 *
 * There is no room in it: the world is one size, the picture of the hall (`stage.ts`), and the walls
 * of the physics are the same on every screen. A run recorded anywhere plays back with the room it
 * was recorded in, because there is only one room.
 */
export interface TapeStage {
  /**
   * The engine's knobs: the numbers the movie itself carries (`speed`, `gravity`, `fric`), and the one
   * port extension that is off in some runs — whether the walls hold the particles at all. A playback
   * never runs the engine; these travel so that the *player's own* world, put aside under a watch,
   * comes back running the way it was.
   */
  readonly engine: {
    readonly speed: number;
    readonly gravity: number;
    readonly fric: number;
    readonly clamp: boolean;
  };
  readonly dolls: readonly TapeDoll[];
  /** Always empty in a tape's own head (`TapeRecorder`); the world's snapshot fills it for itself. */
  readonly ropes: readonly TapeRope[];
}

/**
 * The four things a tape says about itself: what it is, what a step of it costs, the seed its run's
 * weather came from, and the stage it started on.
 *
 * It is a tape with no run in it yet, and it is a thing of its own because a run *starts* as this much: a run
 * that is to arrive as it is played is opened with a head and grows by slices (`frontend/src/live/`), and what
 * a viewer has of a run that is still going is a head with what has arrived after it.
 */
export interface TapeHead {
  readonly format: string;
  /** Milliseconds per step — always {@link TAPE_STEP_MS} for a run this build can play. */
  readonly step: number;
  /**
   * The seed the run's own weather was drawn from while it was played. A playback has no use for it —
   * the weather is already in the rows — so it is the run's parentage rather than its input: what
   * names a report, and what tells two recordings of the same play apart.
   */
  readonly seed: number;
  readonly stage: TapeStage;
}

/** A run of the world, whole: the stage it started from, and the picture of every step of it. */
export interface Tape extends TapeHead {
  /** How long the run is, in steps — pauses included, a step of stillness being a step of the run. */
  readonly steps: number;
  /** The run's body, one record a step or a stillness ({@link TapeFrame}). */
  readonly frames: readonly TapeFrame[];
  /** What happened to the cast along the way ({@link TapeEdit}). */
  readonly edits: readonly TapeEdit[];
}

/**
 * A fresh seed for a recording, taken from the clock and the browser's own randomness.
 *
 * This is the one random number the port draws *outside* the world, and it happens once per recording:
 * what it is for is that two recordings of the same play are not the same file. Everything the world
 * itself draws comes out of {@link seededRandom} via this seed.
 */
export function tapeSeed(): number {
  return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
}

/**
 * One stream of the world's randomness, with a seed in front of it.
 *
 * Everything the port leaves to chance while a game is being played goes through one of these — the
 * times a face holds, mostly — and a recording hands the world a freshly seeded one before its first
 * step, which is what makes two recordings of the same session two different runs. A playback draws
 * nothing at all: the weather is in the rows.
 */
export class Random {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** The next number, in [0, 1): what everything that once called `Math.random` now calls. */
  next = (): number => {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * The whole of the world's randomness as one function, seeded from one number: what `World.useRandom`
 * and `Doll.useRandom` are handed, and what a test that wants to know the odds calls.
 */
export function seededRandom(seed: number): () => number {
  return new Random(seed).next;
}

/**
 * Every doll's rig as a stage keeps it: x, y, x, y per particle, first doll first — one doll or several,
 * since the flat run is the same either way and that is what lets the stage write them one at a time.
 *
 * Nothing here is rounded. A stage is the *state* a world is put back from — the tape's opening, or
 * the player's own scene under a watch — and it is written once a run, not a step: a few hundred
 * numbers kept whole cost a few hundred bytes and buy a world that comes back exactly as it stood.
 */
export function dollRigs(dolls: readonly { readonly particles: readonly { readonly x: number; readonly y: number; readonly oldx: number; readonly oldy: number }[] }[]): number[] {
  const rigs: number[] = [];
  for (const doll of dolls) {
    for (const p of doll.particles) rigs.push(p.x, p.y, p.oldx, p.oldy);
  }
  return rigs;
}

/**
 * The run's body as the recorder sees it each step: one flat row of whole numbers, a doll at a time —
 * every joint's x and y in {@link TAPE_SCALE} units, in the rig's own order, then the face on her
 * card — with the dolls in the stage's own order.
 *
 * This is the shape of a frame record that is written whole, and the shape the deltas of every other
 * record are measured against. Faces sit in the row like positions, so that a face changing while the
 * doll lies still is one small row of its own rather than a special case: the row's joint deltas are
 * zeros and its face delta is whatever the card moved by.
 */
export function dollRow(dolls: readonly TapeDollPose[]): number[] {
  const row: number[] = [];
  for (const doll of dolls) {
    for (const p of doll.particles) row.push(Math.round(p.x * TAPE_SCALE), Math.round(p.y * TAPE_SCALE));
    row.push(doll.pain.shown);
  }
  return row;
}

/**
 * A run as one *slice* of itself: the steps it covers, and the records and edits written inside them.
 *
 * It is what a run that is still being played is sent to the server as (`backend/internal/api`, `POST
 * /api/recordings/{id}/chunks`), and it is deliberately not a tape: a tape is a file with one length and
 * one stage, while a slice is the piece of one that has happened since the last slice, added to a head the
 * server already holds (`Store.OpenRecording`). The server pastes the pieces into a tape as they arrive —
 * and answers the tape of a run that is still being played as the run so far — which is what makes a run
 * watchable while its player is still playing it.
 *
 * `steps` is the steps the slice's own records cover, and the records cover them exactly: a pause is
 * never cut in half to fill a slice out ({@link TapeRecorder.takeSlice}).
 */
export interface TapeSlice {
  /** How many steps of the run the slice covers: what the run grows by when the server pastes it on. */
  readonly steps: number;
  /** The frames and pauses filed inside those steps, exactly as a tape's own file writes them. */
  readonly frames: readonly TapeFrame[];
  /** The edits filed inside those steps, whole: an edit says its own step. */
  readonly edits: readonly TapeEdit[];
}

/**
 * The tape a run *starts* as: the head it was opened with, and nothing that has happened in it yet — a run
 * of no steps, ready to be walked as soon as there is something to walk ({@link appendSlice}).
 *
 * It is the shape a run that arrives as it is played has on the side of whoever is watching it: the server
 * keeps such a run as a head and pastes its slices onto it (`Store.OpenRecording`), and this is the same
 * head, read into the game's own tape, with none of the slices yet.
 */
export function tapeFrom(head: TapeHead): Tape {
  return { ...head, steps: 0, frames: [], edits: [] };
}

/**
 * The tape with one slice of the run pasted onto its end: how a run that is still being played grows under
 * whoever is watching it (`frontend/src/live/`).
 *
 * This is the client's own half of what the server does with the same slice (`assemble` in
 * `backend/internal/store`). The records are one list in the order they were written, so pasting is
 * concatenating them — with one thing to finish: a pause that arrives straight after a pause, which is
 * what a stillness closed for a heartbeat and then closed again looks like on the wire, is merged into the
 * one number the stillness is, so a tape grown from slices ends up the tape its player's own file is.
 *
 * Nothing is changed in place: what comes back is another tape with the slice in it, so a caller that holds
 * one while the next second arrives has two tapes rather than one that moved under it.
 */
export function appendSlice(tape: Tape, slice: TapeSlice): Tape {
  const frames = [...tape.frames];
  const first = slice.frames[0];
  const last = frames[frames.length - 1];
  if (typeof first === 'number' && typeof last === 'number') {
    frames[frames.length - 1] = last + first;
    frames.push(...slice.frames.slice(1));
  } else {
    frames.push(...slice.frames);
  }
  return {
    ...tape,
    steps: tape.steps + slice.steps,
    frames,
    edits: [...tape.edits, ...slice.edits],
  };
}

/**
 * Writes a run down while it is being played: the game hands it the whole stage once per step, and
 * the recorder turns it into rows and pauses.
 *
 * The one thing the recorder decides on its own is what *nothing happening* is: a step whose row is
 * exactly the row before it, in a world the game says is standing still. Nothing else is the
 * recorder's to judge — the world can be moving a hundredth of a pixel a step, which is a row of
 * zeros in the making and a stillness to nobody, and the game's own reading of stillness (`still`)
 * is what keeps such a creep being written down as the steps it is rather than kept as the pause it
 * is not.
 *
 * A recorder is also what a *live* run is written with: the same run, handed over in slices of a
 * second as it is played ({@link takeSlice}) rather than finished once at the end, because somebody
 * else may be watching it while it is still going on (`frontend/src/live/`). Nothing about the
 * writing changes for it.
 */
export class TapeRecorder {
  private readonly frames: TapeFrame[] = [];
  private readonly edits: TapeEdit[] = [];
  /** The steps the committed records cover: the run's length minus the pause still growing. */
  private covered = 0;
  /** Steps of stillness taken but not yet written: the pause still growing, if any. */
  private pending = 0;
  /** Wall-clock milliseconds of stillness that did not make a whole step yet (`idle`). */
  private leftover = 0;
  /** The last row written, in the units the rows are written in — what the next row is measured from. */
  private base: number[] | null = null;
  /** The step count of the next slice of the run, and the first record and edit of it. */
  private sliceAt = 0;
  private sliceFrame = 0;
  private sliceEdit = 0;

  constructor(
    private readonly seed: number,
    /** The stage the run starts on, as the world wrote it down (`World.snapshot`). */
    private readonly stage: TapeStage,
  ) {}

  /**
   * The step count: how long the run is so far, the pause still growing included — the run is that
   * long, even if the length of it is one number that has not been written yet.
   */
  get steps(): number {
    return this.covered + this.pending;
  }

  /**
   * Whether this run is taking a pause worth acting on: the world has been still for longer than a
   * pause is worth ({@link TAPE_PAUSE_STEPS}), so the caller's frame loop may stop stepping the world
   * and hand the stillness over by the wall clock instead ({@link idle}).
   */
  get paused(): boolean {
    return this.pending >= TAPE_PAUSE_STEPS;
  }

  /**
   * One step of the run, taken: the whole stage read into a row *before* the step it belongs to — the
   * same moment a keyframe used to be read at, which is the world as it stands rather than as the
   * step leaves it — and written as that step's record, or counted into the pause it may turn out to
   * be.
   *
   * `still` is the caller's own reading of the world — whether anything in it moved in the last step,
   * and whether anything is in the player's hand (`Game.standingStill`) — and both readings are
   * needed: a world whose row has not changed but which is creeping by a hundredth of a pixel a step
   * is *moving*, and a pause that swallowed it would swallow the creep.
   */
  step(dolls: readonly TapeDollPose[], still = false): void {
    const row = dollRow(dolls);
    const base = this.base;
    if (base === null) {
      // The first row of the run is written whole: there is nothing before it to be a distance from.
      this.write(row);
      this.base = row;
      return;
    }
    if (still && sameRow(row, base)) {
      this.pending++;
      return;
    }
    this.closePause();
    const deltas: number[] = [];
    for (let i = 0; i < row.length; i++) deltas.push(row[i] - (base[i] ?? 0));
    this.write(deltas);
    this.base = row;
  }

  /**
   * Wall-clock time the world was not stepped at all, while a pause was growing: what the frame loop
   * hands the recorder instead of the steps it is not taking (`Game.frame`, on the word of
   * {@link paused}).
   *
   * Whole steps only are taken; the odd milliseconds stay for the next call, so a pause measured by
   * the clock ends on the step boundary a pause measured by the simulation would have.
   */
  idle(ms: number): void {
    this.leftover += Math.max(0, ms);
    const whole = Math.floor(this.leftover / TAPE_STEP_MS);
    this.leftover -= whole * TAPE_STEP_MS;
    this.pending += whole;
  }

  /**
   * A doll was put on the stage mid-run: filed at the step she takes effect before, and the row that
   * follows her is written whole, because a doll who was not in the row before is not a distance
   * away from it.
   *
   * A pause that was growing is closed first — the cast changing is the opposite of nothing
   * happening — and with it the run stops being `paused`, which is what puts the world back in gear
   * even though the hand that added her never touched the stage.
   */
  dollAdded(id: string, name: string, folder: string): void {
    this.closePause();
    this.edits.push([this.steps, 'doll', id, name, folder]);
    this.base = null;
  }

  /** The tape as it stands: a run of `step` steps so far, and every record and edit written in them. */
  finish(): Tape {
    this.closePause();
    return {
      format: TAPE_FORMAT,
      step: TAPE_STEP_MS,
      steps: this.covered,
      seed: this.seed,
      stage: this.stage,
      frames: [...this.frames],
      edits: [...this.edits],
    };
  }

  /**
   * The head of the run as a *live* one: the four things its own tape will say about itself — the
   * format, the step, the seed and the stage — and nothing of what has happened yet.
   *
   * A run that is to arrive as it is played is stored as this and nothing else (`OpenRecording` in
   * `backend/internal/store`), because the rest of it does not exist yet: what a run *starts* as is a
   * head, and what happens after it arrives in slices ({@link takeSlice}). The stage's ropes travel
   * empty — a tape is the dolls' picture, and the player's ropes are nobody else's.
   */
  get head(): TapeHead {
    return {
      format: TAPE_FORMAT,
      step: TAPE_STEP_MS,
      seed: this.seed,
      stage: { engine: this.stage.engine, dolls: this.stage.dolls, ropes: [] },
    };
  }

  /**
   * The next slice of the run, if one has been written since the last, or null while there is nothing
   * new.
   *
   * A slice is cut when the records since the last slice cover `every` steps — a second of the run,
   * on the sender's own clock — and a pause is never cut to fill one out: a stillness that has not
   * ended is not handed over at all unless it has grown past a heartbeat ({@link
   * TAPE_HEARTBEAT_STEPS}), and then it is handed over whole, to be grown again by whatever
   * stillness follows it. The one caller a pause is always closed for is the one asking with `every
   * <= 1`: that is the *tail* of a run, the fraction of a second that finishes it, and a run's last
   * record is its last stillness as much as its last step.
   *
   * A recorder that is never asked for a slice keeps nothing extra to make one: what it writes down is
   * the run, and a slice is a window onto it.
   */
  takeSlice(every: number): TapeSlice | null {
    if (every <= 1 || this.pending >= TAPE_HEARTBEAT_STEPS) this.closePause();
    const steps = this.covered - this.sliceAt;
    if (steps < every) return null;
    const frames = this.frames.slice(this.sliceFrame);
    const edits = this.edits.slice(this.sliceEdit);
    this.sliceFrame = this.frames.length;
    this.sliceEdit = this.edits.length;
    this.sliceAt = this.covered;
    return { steps, frames, edits };
  }

  /** One committed record: a step of the run, covered by the body from here on. */
  private write(record: TapeFrame): void {
    this.frames.push(record);
    this.covered++;
  }

  /**
   * Writes the stillness that has been growing, if there is one — one number, the count of its steps,
   * merged into the pause before it if the two have not been handed out separately.
   *
   * A pause is only ever closed, never opened: `pending` grows while the world is still and is zero
   * the moment this runs, and the stillness that follows starts growing a pause of its own.
   */
  private closePause(): void {
    if (this.pending === 0) return;
    const last = this.frames.length - 1;
    if (last >= this.sliceFrame && typeof this.frames[last] === 'number') {
      (this.frames[last] as number) += this.pending;
    } else {
      this.frames.push(this.pending);
    }
    this.covered += this.pending;
    this.pending = 0;
  }
}

/** Whether two rows are the same row: the same numbers, in the same order, with nothing missing. */
function sameRow(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Reads a tape back: the cursor through its records, and the row the world is standing in.
 *
 * It holds no state the tape does not, apart from the one thing a tape deliberately does not carry —
 * the row itself, added up out of the records as they are walked, because every record after the
 * first is a distance and the distance has to be from somewhere. The first record of the run, and the
 * first after every edit, is written whole precisely so that this accumulation has a place to start
 * and a thing to do when the cast changes.
 *
 * A pause is consumed a step at a time: the record says how long the stillness was, and the world
 * stands in it for exactly that many steps of the playback, which is what makes a played-back pause
 * last as long on the timeline as it lasted in the run.
 */
export class TapePlayer {
  /**
   * The run being walked. It is not `readonly` for one reason: a tape is the one thing that can change under
   * a playback, because a run that somebody is still playing is handed over a slice at a time ({@link grow}).
   */
  tape: Tape;
  /** Which of the tape's records the next step will read. */
  private cursor = 0;
  /** Which of the tape's edits is the next one waiting for its step. */
  private editCursor = 0;
  /** Steps left in the pause being consumed, if the cursor is standing in one. */
  private hold = 0;
  private taken = 0;
  /** The row as it stands, added up out of the records read so far. */
  private row: number[] = [];

  constructor(tape: Tape) {
    this.tape = tape;
  }

  /** Steps taken so far — where the playhead is. */
  get step(): number {
    return this.taken;
  }

  /** How long the run is, in steps. */
  get total(): number {
    return this.tape.steps;
  }

  /** Whether the whole run has been walked. */
  get done(): boolean {
    return this.taken >= this.tape.steps;
  }

  /**
   * One step of the run: the edits of this step first — a doll arriving is part of the step she
   * arrives in, and the row that follows has to know whose it is — then the record the step reads,
   * and the row it leaves the world standing in.
   *
   * `apply` is how the caller puts an edit into the world and `pose` is how it puts a row there; the
   * player knows nothing about worlds. A step spent inside a pause leaves the row alone — the world
   * is already standing in it, and the step is spent precisely so that the timeline says so.
   */
  walk(apply: (edit: TapeEdit) => void, pose: (row: readonly number[]) => void): void {
    const edits = this.tape.edits;
    while (this.editCursor < edits.length && edits[this.editCursor][0] <= this.taken) {
      apply(edits[this.editCursor]);
      this.editCursor++;
    }
    if (this.hold > 0) {
      this.hold--;
    } else if (this.cursor < this.tape.frames.length) {
      const record = this.tape.frames[this.cursor++];
      if (typeof record === 'number') {
        this.hold = record - 1;
      } else {
        this.read(record);
      }
    }
    if (this.row.length > 0) pose(this.row);
    this.taken++;
  }

  /** Back to the first step, with nothing read: what starting a run from the beginning does. */
  rewind(): void {
    this.cursor = 0;
    this.editCursor = 0;
    this.hold = 0;
    this.taken = 0;
    this.row = [];
  }

  /**
   * The run has grown: the same tape with more of it pasted onto the end ({@link appendSlice}), and the walk
   * left exactly where it stands.
   *
   * Nothing is rewound and nothing is read twice: a slice pasted onto a tape is the records the tape
   * already had, with more after them, so the cursor still points at the same record and the playhead is still
   * the same step.
   */
  grow(tape: Tape): void {
    this.tape = tape;
  }

  /**
   * Straight to the end of the run, with nothing read — where a *recording* that has just stopped leaves
   * the playhead, since the world is standing at the run's own end, and where a tape just off a file leaves it
   * so that pressing play starts it from the beginning rather than at a step it has never walked.
   *
   * Nothing is read on the way: this is a position on a timeline, not a run.
   */
  end(): void {
    this.cursor = this.tape.frames.length;
    this.editCursor = this.tape.edits.length;
    this.hold = 0;
    this.taken = this.tape.steps;
  }

  /**
   * One record read into the row: a record the length of the row is a distance added onto it, and
   * anything else — the first record of the run, the first after an edit, or a record a hand-made
   * file left the wrong length — is the row itself.
   */
  private read(record: readonly number[]): void {
    if (record.length !== this.row.length) {
      this.row = [...record];
      return;
    }
    for (let i = 0; i < record.length; i++) this.row[i] += record[i];
  }
}

/**
 * The tape as a file: readable JSON, the records exactly as they are written in the run's own body.
 *
 * It is exported because the page's own download of a run hands this over (`tapeJson`), and the tests
 * read a file back against the recorder that wrote it.
 */
export function tapeFile(tape: Tape): Record<string, unknown> {
  return {
    format: tape.format,
    step: tape.step,
    steps: tape.steps,
    seed: tape.seed,
    stage: tape.stage,
    frames: tape.frames,
    edits: tape.edits,
  };
}

/** The tape as a file, whole: what `tapeJson` hands a download, and what the tests read back. */
export function encodeTape(tape: Tape): string {
  return JSON.stringify(tapeFile(tape));
}

/** How big the tape is as a file, in bytes — what the interface says about the run it is carrying. */
export function tapeBytes(tape: Tape): number {
  return new TextEncoder().encode(encodeTape(tape)).length;
}

/**
 * A tape off a file, checked as it is read: the codec's own name and version, the step it was recorded
 * at, and nothing of it missing or lying — every record a whole number or a row of whole numbers, no
 * two pauses next to each other, and the records covering exactly the length the tape says it is.
 *
 * Anything else is a file this build cannot play, and it is refused with a sentence rather than
 * half-played: a tape is the run itself, and a run with a piece missing from it is not a shorter run
 * but a different one.
 */
export function decodeTape(json: string): Tape {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw new Error(`the tape is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const file = value as Partial<Tape>;
  if (file?.format !== TAPE_FORMAT) {
    throw new Error(`not a ${TAPE_FORMAT} tape: ${String(file?.format)}`);
  }
  if (file.step !== TAPE_STEP_MS) {
    throw new Error(`the tape steps at ${String(file.step)} ms; this build plays ${TAPE_STEP_MS} ms`);
  }
  if (typeof file.steps !== 'number' || !file.stage || !Array.isArray(file.frames) || !Array.isArray(file.edits)) {
    throw new Error('the tape is missing its stage, its length, its frames or its edits');
  }
  let covered = 0;
  let previousWasPause = false;
  for (const record of file.frames) {
    if (typeof record === 'number') {
      if (!Number.isInteger(record) || record < 1) {
        throw new Error(`a pause of ${String(record)} steps is not a pause`);
      }
      if (previousWasPause) throw new Error('two pauses next to each other, which a tape never writes');
      previousWasPause = true;
      covered += record;
    } else if (Array.isArray(record)) {
      if (record.some((n) => typeof n !== 'number' || !Number.isInteger(n))) {
        throw new Error('a frame holding something other than a whole number');
      }
      previousWasPause = false;
      covered += 1;
    } else {
      throw new Error(`a record that is neither a frame nor a pause: ${String(record)}`);
    }
  }
  if (covered !== file.steps) {
    throw new Error(`the tape says it is ${file.steps} steps long and its records cover ${covered}`);
  }
  let at = 0;
  for (const edit of file.edits) {
    if (!Array.isArray(edit) || edit.length !== 5 || edit[1] !== 'doll') {
      throw new Error(`an edit that is not a doll arriving: ${JSON.stringify(edit)}`);
    }
    if (typeof edit[0] !== 'number' || typeof edit[2] !== 'string' || typeof edit[3] !== 'string' || typeof edit[4] !== 'string') {
      throw new Error(`an edit that is not shaped like a doll arriving: ${JSON.stringify(edit)}`);
    }
    if (edit[0] < at || edit[0] > file.steps) {
      throw new Error(`an edit at step ${String(edit[0])} of a ${file.steps}-step tape`);
    }
    at = edit[0];
  }
  return {
    format: file.format,
    step: file.step,
    steps: file.steps,
    seed: file.seed ?? 0,
    stage: file.stage,
    frames: file.frames,
    edits: file.edits,
  };
}
