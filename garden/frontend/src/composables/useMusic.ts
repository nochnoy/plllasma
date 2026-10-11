import { getCurrentInstance, onBeforeUnmount, watch, type Ref } from 'vue';
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

/** How the garden's music is played, for the page and for a test that brings its own. */
export interface MusicOptions {
  /**
   * How a track is made of its file's address. The page's answer is an audio element, made and
   * asked for its file ahead of its moment, so that beginning is nothing but sounding.
   */
  makeTrack?: (src: string) => MusicTrack;
  /** The clock the two-second fade walks by. A test brings its own. */
  now?: () => number;
}

/**
 * How loud the garden's music stands on the page: a third of the file's own volume — the music is
 * the sound of the place, and a place is felt under what happens in it rather than heard over it.
 */
const TRACK_VOLUME = 1 / 3;

/**
 * The page's own track: an audio element, never looped, a third of the file's own loudness, and
 * never a part of the page's DOM — the music is nowhere to click, because nothing about it is
 * asked of the player.
 */
function makeAnAudioElement(src: string): MusicTrack {
  const audio = new Audio(src);
  audio.loop = false;
  audio.volume = TRACK_VOLUME;
  audio.preload = 'auto';
  return audio;
}

/**
 * How long a move between the garden's screens gives whatever is sounding to be gone, in
 * milliseconds: two seconds of falling silent, and quiet after them.
 */
const HUSH_MS = 2000;

/** How often the fade takes its step down: often enough that forty of them read as one fall. */
const HUSH_STEP_MS = 50;

/**
 * The garden's music: one track (`assets/music/music-1.mp3`), the stage's own, begun with the run
 * and ended by the garden's moves.
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
 * The track does not loop: one file, asked for at most once a session (`loop` is off, and nothing
 * replays what has played). What ends it — besides its file simply running out — is a move between
 * the garden's screens: whatever is sounding falls silent over two seconds and stops. A playback
 * or a stream being watched arrives to that quiet already, the move that opens one being a move
 * like any other; the tape's own edge hushes besides (`loaded` below), for a watch begun without
 * a move, of which there is none today.
 */
export function useMusic(location: Ref<1 | 2 | 3 | 4>, tape: Ref<TapeReport>, options: MusicOptions = {}) {
  const makeTrack = options.makeTrack ?? makeAnAudioElement;
  const now = options.now ?? (() => performance.now());

  const base = import.meta.env.BASE_URL ?? '/';
  const scene = makeTrack(`${base}assets/music/music-1.mp3`);

  /**
   * The stage's own latch: whether its music has sounded this session. Set as the music begins and
   * never taken back — not by the run ending, not by another one beginning — which is all that
   * «once a session» is here.
   */
  let sceneSounded = false;
  /** The fade's own clock-work, while a fade is falling. */
  let hushTimer: ReturnType<typeof setInterval> | null = null;

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

  // The stage's music begins with the run, and the latch in front of it is the rule: once a
  // session, never again. Under a tape — a playback, a stream — it does not begin at all. The touch
  // that began the run is itself the permission a browser needs to sound a page, so this asking is
  // not refused; what else could go wrong (a file the server would not give) is said in the console
  // the way every other thing that could not be is.
  watch(
    () => tape.value.recording,
    (writing) => {
      if (!writing || sceneSounded || tape.value.loaded) return;
      sceneSounded = true;
      scene.play().catch((err) => {
        console.warn('[free-falling-girl] the stage could not be sounded:', err);
      });
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
}
