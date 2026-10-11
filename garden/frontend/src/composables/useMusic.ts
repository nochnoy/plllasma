import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { TapeReport } from '../game/game';

/**
 * One track of the garden's music, as the page plays it: the browser's own audio element, said as
 * the two things ever asked of it — to sound (`play`) and to fall silent (`pause`) — with the volume
 * the fade walks down and `paused` telling which of the two it is in. An `HTMLAudioElement` is
 * this already; a test brings its own.
 */
export interface MusicTrack {
  play(): Promise<void>;
  pause(): void;
  readonly paused: boolean;
  volume: number;
}

/**
 * What the mute is remembered in: the shape of the browser's own `localStorage` and nothing more —
 * a test brings a pocket of its own, and a browser that keeps no such place (or keeps one the page
 * may not touch) is answered by the wrapper below rather than by an error.
 */
export interface MuteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** How the garden's music is played, for the page and for a test that brings its own. */
export interface MusicOptions {
  /**
   * How a track is made of its file's address. The page's answer is an audio element, made and
   * asked for its file ahead of its moment, so that beginning is nothing but sounding.
   */
  makeTrack?: (src: string) => MusicTrack;
  /** Where the mute is remembered between visits: the browser's own `localStorage` by default. */
  storage?: MuteStorage;
  /** The clock the two-second fade walks by. A test brings its own. */
  now?: () => number;
}

/** The mute's own name in the storage: what the garden asks after when it comes back. */
export const MUTE_KEY = 'garden-muted';

/**
 * How loud the garden's music stands on the page: a third of the file's own volume — the music is
 * the sound of the place, and a place is felt under what happens in it rather than heard over it.
 * Said to whatever track the page was given, so that a test's fake wears the number too.
 */
const TRACK_VOLUME = 1 / 3;

/**
 * The page's own track: an audio element, never looped and never a part of the page's DOM — the
 * music is nowhere to click, because nothing about it is asked of the player.
 */
function makeAnAudioElement(src: string): MusicTrack {
  const audio = new Audio(src);
  audio.loop = false;
  audio.preload = 'auto';
  return audio;
}

/**
 * The browser's own storage, said as the mute asks for it and never as an error: a page kept in a
 * sandbox may be refused the place outright, and a mute that cannot be remembered is a mute all the
 * same — this visit is simply the whole of it.
 */
function theBrowserStorage(): MuteStorage {
  let held: Storage | null = null;
  try {
    held = localStorage;
  } catch {
    held = null;
  }
  return {
    getItem(key) {
      try {
        return held ? held.getItem(key) : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        held?.setItem(key, value);
      } catch {
        // Kept nowhere: the garden stands as it is, and asks again next visit.
      }
    },
  };
}

/** Whether the sounds stood muted the last time this browser was in the garden. */
function readMuted(storage: MuteStorage): boolean {
  return storage.getItem(MUTE_KEY) === 'on';
}

/** Says the mute to the storage, for the next visit. */
function writeMuted(storage: MuteStorage, muted: boolean): void {
  storage.setItem(MUTE_KEY, muted ? 'on' : 'off');
}

/**
 * How long a move between the garden's screens gives whatever is sounding to be gone, in
 * milliseconds: two seconds of falling silent, and quiet after them.
 */
const HUSH_MS = 2000;

/** How often the fade takes its step down: often enough that forty of them read as one fall. */
const HUSH_STEP_MS = 50;

/**
 * The garden's music: one track (`assets/music/music-1.mp3`), the stage's own, begun with the run,
 * ended by the garden's moves, and muted by the player's own word.
 *
 * It begins with the run because that is the one moment a browser lets a page sound at all: the
 * first touch of a doll is what starts one (`Game.pressAt`), and the report's own rising edge is
 * where the page hears it (`useTape`) — the same seam the run's sending hangs from (`useLiveRun`).
 * The threshold before that touch is silent, and deliberately so: a page nobody has touched is a
 * page no browser will sound, and the garden does not ask.
 *
 * The latch in front of the beginning is the whole of the rule about the track: once it has
 * sounded, it is never asked for again this session, whatever runs go on to begin. A tape already
 * on the timeline — a recording being played back, a stream being watched — is no moment for music
 * at all; the engine makes that true by itself (a run begins only in a live world,
 * `startingARun`), and the page says it too, so that the rule is the page's own rather than the
 * engine's accident.
 *
 * The mute ({@link muted}, the «Звук» button in the stage's own bar) is the player's word over all
 * of it, remembered between visits in the browser's own storage. Standing, it keeps the music from
 * beginning — and holds its place: the music it silenced comes back where it stood when the mute is
 * taken off, still the one sounding it always was, and a run begun under a mute has its music with
 * the taking-off rather than never.
 *
 * The track does not loop: one file, asked for at most once a session (`loop` is off, and nothing
 * replays what has played). What ends it — besides its file simply running out — is a move between
 * the garden's screens: whatever is sounding falls silent over two seconds and stops. A playback
 * or a stream being watched arrives to that quiet already, the move that opens one being a move
 * like any other; the tape's own edge hushes besides (`loaded` below), for a watch begun without
 * a move, of which there is none today.
 */
export function useMusic(location: Ref<1 | 2 | 3 | 4>, tape: Ref<TapeReport>, options: MusicOptions = {}) {
  const makeTrack = options.makeTrack ?? makeAnAudioElement;
  const storage = options.storage ?? theBrowserStorage();
  const now = options.now ?? (() => performance.now());

  const base = import.meta.env.BASE_URL ?? '/';
  const scene = makeTrack(`${base}assets/music/music-1.mp3`);
  scene.volume = TRACK_VOLUME;

  /**
   * Whether the garden's sounds are muted: taken from the last visit and said back on every change,
   * so that a garden muted today is a garden muted tomorrow. The bar's own «Звук» button flips it
   * (`App.vue`); everything below obeys it.
   */
  const muted = ref(readMuted(storage));

  /**
   * The stage's own latch: whether its music has sounded this session. Set as the music begins and
   * never taken back — not by the run ending, not by another one beginning, not by the mute — which
   * is all that «once a session» is here.
   */
  let sceneSounded = false;
  /**
   * The mute's own hold: the music was sounding when the sounds were muted, and waits inside the
   * mute for them back — the mute is a hand over the speaker, not an ending.
   */
  let heldByMute = false;
  /** The fade's own clock-work, while a fade is falling. */
  let hushTimer: ReturnType<typeof setInterval> | null = null;

  /** Asks the track to sound; anything it answers but yes with is said in the console, one line. */
  function sound(): void {
    scene.play().catch((err) => {
      console.warn('[free-falling-girl] the stage could not be sounded:', err);
    });
  }

  /**
   * The stage's music, begun — once, and only where it has not sounded. Nothing begins it but the
   * run's own beginning and the mute coming off over a run that never had it (`muted` below).
   */
  function begin(): void {
    if (sceneSounded) return;
    sceneSounded = true;
    sound();
  }

  /**
   * What every move between the garden's screens does to the music: whatever is sounding falls
   * silent over {@link HUSH_MS} and stops. A garden already quiet is left as it is — quiet is not a
   * thing to do twice.
   */
  function hush(): void {
    if (scene.paused) return;
    if (hushTimer !== null) clearInterval(hushTimer);
    const beganAt = now();
    const from = scene.volume;
    let timer!: ReturnType<typeof setInterval>;
    timer = setInterval(() => {
      const part = Math.min((now() - beganAt) / HUSH_MS, 1);
      scene.volume = from * (1 - part);
      if (part >= 1) {
        clearInterval(timer);
        if (hushTimer === timer) hushTimer = null;
        scene.pause();
      }
    }, HUSH_STEP_MS);
    hushTimer = timer;
  }

  /** Everything the music holds, let go at once: the fade and the track's sound. */
  function beSilent(): void {
    if (hushTimer !== null) {
      clearInterval(hushTimer);
      hushTimer = null;
    }
    scene.pause();
  }

  // The mute, said to the storage first and done second. Standing, it takes whatever is sounding
  // whole and at once — a mute is not a fade — and holds the music's place; taken off, it gives
  // that place back where it stood, or begins the music for a run that never had it, or does
  // nothing at all, the music having had its one moment or its file its own end.
  watch(muted, (quiet) => {
    writeMuted(storage, quiet);
    if (quiet) {
      heldByMute = !scene.paused;
      beSilent();
      return;
    }
    if (heldByMute) {
      heldByMute = false;
      // Given back whole: a fade the mute interrupted had already taken its part of the volume.
      scene.volume = TRACK_VOLUME;
      sound();
      return;
    }
    if (!sceneSounded && tape.value.recording && !tape.value.loaded) begin();
  });

  // The stage's music begins with the run, once a session, and not under a mute and not under a
  // tape. The touch that began the run is itself the permission a browser needs to sound a page,
  // so this asking is not refused; what else could go wrong (a file the server would not give) is
  // said in the console the way every other thing that could not be is.
  watch(
    () => tape.value.recording,
    (writing) => {
      if (!writing || muted.value || tape.value.loaded) return;
      begin();
    },
  );

  // A tape going onto the timeline hushes whatever is sounding: a watch is the player's ears' whole
  // business for as long as it runs. The move that opens one hushes already; this is the same rule
  // said at the tape's own edge.
  watch(
    () => tape.value.loaded,
    (loaded) => {
      if (loaded) hush();
    },
  );

  // And every move between the garden's screens — a pan or a cut — takes the music with it.
  watch(location, (at, was) => {
    if (at !== was) hush();
  });

  // A component torn down lets everything go in order: the watches with it (a `useMusic` that is
  // not inside a component has no moment of its own to stop at — which is a test rather than a page).
  if (getCurrentInstance()) onBeforeUnmount(beSilent);

  return {
    /** The garden's own mute, standing in the bar as the «Звук» button and remembered between visits. */
    muted,
  };
}
