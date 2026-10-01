import { BEYOND, HARD, WORRY, type PainLevel, type PoseSources } from './pain';

/**
 * The faces, by the index of the character's own portrait files, and what each one means now.
 *
 * The eight numbered pictures are the same art they always were; what changed is what they are *for*.
 * They are no longer eight even steps of a pain scale — a pose now has four separate sources of trouble
 * (see `pain.ts`) and a card that changed with every degree of them read as noise. Each picture is
 * instead a state of the machine below, and {@link FACE.rest} — the ninth, off that scale — is not a
 * step of pain at all: it is a file of its own (`rest.png` next to the numbered ones), worn after
 * something extreme.
 */
export const FACE = {
  /** Nothing hurts, and nothing has for a while. */
  calm: 0,
  /** Nothing hurts now, but something did a moment ago: the face that says *that hurt*. */
  recent: 1,
  /** A source at *worry*. */
  worry: 2,
  /** A source at *hard*, and the face a short break comes back on. */
  hard: 3,
  /** A source arriving at *extreme*: worn for a moment whatever happens next. */
  arrival: 4,
  /** *Extreme* held: what the arrival leaves behind. */
  held: 5,
  /** Past the rig's own limits, once the extreme's pictures have had their time. */
  beyond: 6,
  /** Two or more sources past their limits at once. */
  super: 7,
  /**
   * The breather: nothing hurts any more, but she has just been through something and is not over it.
   *
   * It is the one face off the pain scale — `8`, past the eight numbered pictures — and the one whose
   * file is named rather than numbered (`portrait/rest.png`, see `characters.ts`). Raised by
   * {@link REST_AFTER_EXTREME_MS} of extreme or by a beyond of any length at all, and worn in the lulls
   * afterwards until she has caught her breath.
   */
  rest: 8,
} as const;

/** How long a face is kept after the pose has already come back down, in milliseconds. */
const ARRIVAL_MS_RANGE = [1500, 3000] as const;
/** How long the extreme has to last before it is a pose being held rather than an arrival. */
const HOLD_MS = 3000;
/** How long it has to last before the two faces start taking turns. */
const FLICKER_FROM_MS = 5000;
/** How long one turn of the flicker lasts. */
const FLICKER_MS_RANGE = [700, 2700] as const;
/** Leaving the band in the middle of a long extreme. */
const LEAVE_MS_RANGE = [500, 2000] as const;
/** Coming back to the same trouble inside this long is a continuation, not a new arrival. */
const BREAK_MS = 1000;
/** ...and the face a continuation comes back on. */
const BREAK_MS_RANGE = [700, 2000] as const;
/** How long with nothing the matter before the card goes back to the calm face. */
const RECENT_MS = 10000;
/**
 * How long an extreme has to be *held* before she has earned a breather afterwards.
 *
 * A pull that goes deep and comes back is one thing; a pose that stays past the rig's limits for four
 * seconds is a workout, and the face she wears afterwards says so (see {@link FACE.rest}). A *beyond* of
 * any length at all earns one — that is a step further out, and there is no such thing as holding it
 * too briefly to count.
 */
const REST_AFTER_EXTREME_MS = 4000;
/** How long the *hard* face clears the flag by itself: five seconds of it and she has had her rest. */
const REST_HARD_MS = 5000;
/** How long the breather itself is worn once she is back at *worry* or below. */
const REST_MS = 3000;

/**
 * Which of a character's portraits the card wears right now — the doll's face as a thing that
 * happens over time rather than a function of the pose.
 *
 * The pose still decides *whether* something hurts (`pain.ts`: four sources, each on its own ladder, and
 * a pose is as bad as its worst source), but what the player sees is a small machine on top of that, and
 * the machine is about how long the trouble has lasted:
 *
 * - nothing hurts, and nothing has for {@link RECENT_MS}: {@link FACE.calm};
 * - nothing hurts now, but something did a moment ago: {@link FACE.recent};
 * - *worry*: {@link FACE.worry}, *hard*: {@link FACE.hard};
 * - *extreme*, arriving: {@link FACE.arrival} for {@link ARRIVAL_MS_RANGE}, kept even if the pose has
 *   already come back down — a face that snaps back the instant the pull eases reads as nothing having
 *   happened at all;
 * - *extreme*, held: {@link FACE.held} once it has lasted {@link HOLD_MS}, and past
 *   {@link FLICKER_FROM_MS} the two of them take turns in {@link FLICKER_MS_RANGE} chunks, so a pose
 *   held that long does not read as a still picture;
 * - *beyond* — further than the rig's own limits allow — once the extreme's own pictures have had their
 *   time: {@link FACE.beyond};
 * - two or more sources past their limits at once: {@link FACE.super};
 * - and {@link FACE.rest}, which is not a step of pain at all, but what is left of one.
 *
 * Short breaks are not breaks: letting go for less than {@link BREAK_MS} and pulling again comes back on
 * the *hard* face (or the beyond one) for {@link BREAK_MS_RANGE} rather than replaying the arrival,
 * because what the player did was keep pulling. And leaving the band in the middle of a long extreme —
 * up into *beyond*, or back down below *extreme* — shows the arrival face again for
 * {@link LEAVE_MS_RANGE}.
 *
 * The breather is the one state that outlives the pose that earned it. An extreme held for
 * {@link REST_AFTER_EXTREME_MS}, or a beyond of any length, raises a flag that *needs rest*, and the
 * flag is what the face is drawn from — not the pose:
 *
 * - the flag is worn out by *waiting*: {@link REST_HARD_MS} of the hard face clears it, because a doll
 *   who has been sitting at *hard* for five seconds has had her breather whether the card said so or not;
 * - coming back down to *worry* or to nothing while the flag is up shows {@link FACE.rest} for
 *   {@link REST_MS}, and the flag goes down with the face;
 * - an extreme or a beyond *interrupts* the face without touching the flag: she is being pulled again,
 *   which is no time for a breather, and the flag is still there for the next lull.
 *
 * All of it is timed in the real milliseconds the world is stepped by, not in the movie's own slowed
 * clock: these are the seconds a *player* is watching.
 */
export class PainState {
  private portrait: number = FACE.calm;
  /** What the pose was worth when it was last read, and how many sources were past their limits. */
  private worst: PainLevel = 0;
  private beyondSources = 0;
  /** Milliseconds the pose has been at least *extreme* without a break, and since it last was. */
  private extremeFor = 0;
  private extremeGap = Infinity;
  /** The same pair for *beyond*. */
  private beyondFor = 0;
  private beyondGap = Infinity;
  /** Milliseconds since anything at all hurt, which is what {@link FACE.calm} waits for. */
  private painGap = Infinity;
  /** A face being worn for a while whatever the pose does: an arrival, a break, or leaving the band. */
  private flash: { portrait: number; left: number } | null = null;
  /** The long extreme's own pair of faces, and how long the current one has left. */
  private flicker: { portrait: number; left: number } | null = null;
  /**
   * Whether the pose has earned her a breather, and what is left of wearing it.
   *
   * The flag is raised by an extreme or a beyond that was long enough to count, and it comes down in one
   * of two ways: {@link REST_HARD_MS} of the hard face (with no breather worn at all — she has had one),
   * or {@link REST_MS} of {@link FACE.rest} itself in a lull. An extreme or a beyond in between resets the
   * display without touching the flag (see the class comment).
   */
  private restNeeded = false;
  private restLeft = 0;
  /** Milliseconds the pose has been at *hard* since the flag went up: the other way to wear it out. */
  private hardFor = 0;

  /**
   * The stream every time this machine picks comes from — a range of milliseconds, or which of the two
   * faces a long extreme flickers on.
   *
   * It is handed over rather than drawn from `Math.random` because a run has to be reproducible: the
   * world's own randomness is one seeded stream (`Random` in `tape.ts`), shared by every machine on the
   * stage, so that playing a tape back draws the same numbers in the same order.
   */
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Hands the machine the stream a run's randomness comes from — see `World.useRandom`. */
  useRandom(random: () => number): void {
    this.random = random;
  }

  /** The portrait the card wears now. */
  get shown(): number {
    return this.portrait;
  }

  /**
   * Puts a face on the card outright, machine untouched — what a playback does with every row of a
   * tape (`World.writePose`). A playback is the picture of a run rather than the run: the clock that
   * picks these faces ran when the run was played, and its choices are already in the rows.
   */
  wear(face: number): void {
    this.portrait = face;
  }

  /**
   * Advances the machine by one step of the world, reading the pose it is given.
   *
   * A doll whose rig cannot be read at all is passed `null`, and that is read as a pose that hurts
   * nothing: the counters keep running — a break is a break however it happened — but there is no source
   * to be in trouble from.
   */
  step(sources: PoseSources | null, elapsedMs: number): void {
    const dt = Math.max(0, elapsedMs);
    const levels = sources
      ? [sources.neck.level, sources.waist.level, sources.hip.level, sources.split.level]
      : [];
    const worst = (levels.length ? Math.max(...levels) : 0) as PainLevel;
    const beyondSources = levels.filter((level) => level === BEYOND).length;

    // What the machine was doing last step, before any of the counters below are moved. The gaps are
    // read here because they are reset the moment the trouble is back.
    const wasExtreme = this.worst >= 3;
    const wasBeyond = this.worst >= BEYOND;
    const wasFlickering = this.flicker !== null;
    const brokeFrom = this.extremeGap;
    const brokeBeyond = this.beyondGap;
    // How long the extreme had lasted when it was last read: the counters are about to be cleared, and
    // the length of it is what decides whether she has earned a breather (see {@link restNeeded}).
    const lasted = this.extremeFor;

    // The counters.
    if (worst >= 3) {
      this.extremeFor += dt;
      this.extremeGap = 0;
    } else {
      this.extremeFor = 0;
      this.extremeGap += dt;
    }
    if (worst >= BEYOND) {
      this.beyondFor += dt;
      this.beyondGap = 0;
    } else {
      this.beyondFor = 0;
      this.beyondGap += dt;
    }
    this.painGap = worst >= WORRY ? 0 : this.painGap + dt;

    // Arriving at the extreme — or coming back to it, which does not restart the show.
    if (worst >= 3 && !wasExtreme) {
      this.flash = brokeFrom <= BREAK_MS
        ? { portrait: FACE.hard, left: this.pick(BREAK_MS_RANGE) }
        : { portrait: FACE.arrival, left: this.pick(ARRIVAL_MS_RANGE) };
      this.flicker = null;
    }
    // Back past the rig's limits after a moment off: the beyond face rather than the arrival again, and
    // after a *break* rather than an arrival at the extreme — which is the face a beyond that came back
    // inside {@link BREAK_MS} wears, even if the pose went through the extreme band on the way.
    if (worst >= BEYOND && !wasBeyond && brokeBeyond <= BREAK_MS) {
      this.flash = { portrait: FACE.beyond, left: this.pick(BREAK_MS_RANGE) };
    }
    // Out of the band in the middle of a long extreme, either way: the arrival face, briefly.
    if (wasFlickering && (worst < 3 || worst >= BEYOND)) {
      this.flash = { portrait: FACE.arrival, left: this.pick(LEAVE_MS_RANGE) };
    }

    // The long extreme's flicker: past {@link FLICKER_FROM_MS} the two faces take turns.
    if (worst >= 3 && worst < BEYOND && this.extremeFor >= FLICKER_FROM_MS) {
      if (!this.flicker) {
        this.flicker = { portrait: this.startFlicker(), left: this.pick(FLICKER_MS_RANGE) };
      } else {
        this.flicker.left -= dt;
        if (this.flicker.left <= 0) {
          this.flicker = {
            portrait: this.flicker.portrait === FACE.held ? FACE.hard : FACE.held,
            left: this.pick(FLICKER_MS_RANGE),
          };
        }
      }
    } else if (worst < 3 || worst >= BEYOND) {
      this.flicker = null;
    }

    // The breather: an extreme held long enough, or a beyond of any length at all, leaves her wanting
    // one. An extreme or a beyond puts the *face* away without touching the flag — she is being pulled
    // again, and the flag is still there for the next lull — and the two ways the flag comes down by
    // itself are below, with the faces they belong to: five seconds of the hard face, or the breather
    // worn for {@link REST_MS} once she is back at *worry* or below.
    if ((wasBeyond && worst < BEYOND) || (wasExtreme && worst < 3 && lasted >= REST_AFTER_EXTREME_MS)) {
      this.restNeeded = true;
      this.restLeft = 0;
      this.hardFor = 0;
    }
    if (!this.restNeeded || worst >= 3) {
      // Nothing owed, or interrupted before it was worn: either way the display starts afresh in the
      // next lull, which is what "worn for three seconds" means.
      this.restLeft = 0;
      this.hardFor = 0;
    }

    // ...and now the face itself, in the order the rules take precedence.
    this.worst = worst;
    this.beyondSources = beyondSources;
    if (beyondSources >= 2) {
      this.portrait = FACE.super;
      this.flash = null;
      return;
    }
    if (this.flash) {
      this.portrait = this.flash.portrait;
      this.flash.left -= dt;
      if (this.flash.left <= 0) this.flash = null;
      return;
    }
    if (worst >= BEYOND) {
      this.portrait = FACE.beyond;
      return;
    }
    if (worst >= 3) {
      // Whatever the extreme's own pictures are on: the held face, or a turn of the flicker.
      this.portrait = this.extremeFor >= HOLD_MS ? (this.flicker?.portrait ?? FACE.held) : FACE.held;
      return;
    }
    if (worst >= HARD) {
      // Five seconds of this face is a rest in itself: the flag comes down without ever being worn.
      this.hardFor += dt;
      if (this.hardFor >= REST_HARD_MS) this.restNeeded = false;
      this.portrait = FACE.hard;
      return;
    }
    // The breather, worn in the lulls: the flag counts its three seconds down from the moment it is
    // actually on the card, so a flash or a pull does not eat into them (see {@link REST_MS}).
    if (this.restNeeded) {
      if (this.restLeft <= 0) this.restLeft = REST_MS;
      this.restLeft -= dt;
      if (this.restLeft <= 0) this.restNeeded = false;
      else {
        this.portrait = FACE.rest;
        return;
      }
    }
    if (worst >= WORRY) {
      this.portrait = FACE.worry;
      return;
    }
    this.portrait = this.painGap > RECENT_MS ? FACE.calm : FACE.recent;
  }

  /** What the machine is showing and why, for `Scene.inspect` and for the tests. */
  snapshot(): {
    portrait: number;
    worst: PainLevel;
    beyondSources: number;
    extremeFor: number;
    beyondFor: number;
    painGap: number;
    flash: number | null;
    flicker: number | null;
    restNeeded: boolean;
    restLeft: number;
    hardFor: number;
  } {
    return {
      portrait: this.portrait,
      worst: this.worst,
      beyondSources: this.beyondSources,
      extremeFor: this.extremeFor,
      beyondFor: this.beyondFor,
      painGap: this.painGap,
      flash: this.flash?.portrait ?? null,
      flicker: this.flicker?.portrait ?? null,
      restNeeded: this.restNeeded,
      restLeft: this.restLeft,
      hardFor: this.hardFor,
    };
  }

  /**
   * The whole of the machine's own state, as a flat array of numbers: fifteen of them, in the order the
   * fields are declared above, with `-1` standing in for a face it is not wearing and for a gap that is
   * infinite.
   *
   * It is what a tape writes down about a doll besides her own pose (`TapeDoll`), and it is what makes a
   * playback's cards come up the way the recorded ones did: the machine is a clock, and a clock has to be
   * put back where it was rather than started from the beginning. {@link load} is its other half and
   * reads exactly this array.
   *
   * Infinity cannot go into JSON — `JSON.stringify(Infinity)` is `null` — and a gap that has had nothing
   * to measure for a long time is the one number here that grows without bound, so it is written as -1.
   * A flash or a flicker that is not being worn is -1 as well, since a face is 0..8 and -1 is no face.
   */
  state(): number[] {
    return [
      this.portrait,
      this.worst,
      this.beyondSources,
      this.extremeFor,
      this.extremeGap === Infinity ? -1 : this.extremeGap,
      this.beyondFor,
      this.beyondGap === Infinity ? -1 : this.beyondGap,
      this.painGap === Infinity ? -1 : this.painGap,
      this.flash?.portrait ?? -1,
      this.flash?.left ?? 0,
      this.flicker?.portrait ?? -1,
      this.flicker?.left ?? 0,
      this.restNeeded ? 1 : 0,
      this.restLeft,
      this.hardFor,
    ];
  }

  /** Puts the machine back where {@link state} found it — what `World.restore` does with it. */
  load(state: readonly number[]): void {
    const [
      portrait,
      worst,
      beyondSources,
      extremeFor,
      extremeGap,
      beyondFor,
      beyondGap,
      painGap,
      flashPortrait,
      flashLeft,
      flickerPortrait,
      flickerLeft,
      restNeeded,
      restLeft,
      hardFor,
    ] = state;
    /** A gap of -1 is a gap with nothing in it: see {@link state}. */
    const gap = (value: number | undefined): number => (value === undefined || value < 0 ? Infinity : value);
    this.portrait = portrait ?? FACE.calm;
    this.worst = (worst ?? 0) as PainLevel;
    this.beyondSources = beyondSources ?? 0;
    this.extremeFor = extremeFor ?? 0;
    this.extremeGap = gap(extremeGap);
    this.beyondFor = beyondFor ?? 0;
    this.beyondGap = gap(beyondGap);
    this.painGap = gap(painGap);
    this.flash =
      flashPortrait === undefined || flashPortrait < 0
        ? null
        : { portrait: flashPortrait, left: flashLeft ?? 0 };
    this.flicker =
      flickerPortrait === undefined || flickerPortrait < 0
        ? null
        : { portrait: flickerPortrait, left: flickerLeft ?? 0 };
    this.restNeeded = restNeeded === 1;
    this.restLeft = restLeft ?? 0;
    this.hardFor = hardFor ?? 0;
  }

  /** A number from `range`, in milliseconds — the only randomness in the machine. */
  private pick(range: readonly [number, number]): number {
    return range[0] + this.random() * (range[1] - range[0]);
  }

  /** Which face the long extreme starts flickering on: either of the two, at random. */
  private startFlicker(): number {
    return this.random() < 0.5 ? FACE.hard : FACE.held;
  }
}
