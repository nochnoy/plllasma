import { getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import { chatApi, type ChatWire } from '../chat/api';
import type { Run } from '../chat/runs';

/**
 * The runs the chat is interested in, and what it knows about them.
 *
 * A line that links a run says what the *run* says — its label is rewritten as the play goes on, and
 * whether it is still being played is the server's own word for the moment — so the chat has to hold
 * the rows of exactly the runs its lines link, fetched fresh often enough that a line's words change
 * underneath it without the log itself ever being rewritten. That is the whole of what this is: a map
 * from a run's id to its row, kept current for the ids somebody is looking at and never asked about
 * for the ones nobody is.
 *
 * "Often enough" is the chat's own catching-up rhythm rather than anything quicker: a label is not a
 * clock, and the window it is read in is the last fifty lines — which the catch-up already re-reads
 * every two seconds. A row that never arrives (a run this server no longer holds) is simply absent,
 * and the line that links it draws the word every link starts as.
 */
export interface RunStatesOptions {
  /** The wire the rows are read over (`chat/api.ts`): the real one, unless a test brings its own. */
  wire?: ChatWire;
  /** How often the rows are read again, in milliseconds; 0 never does, which a test wants. */
  every?: number;
}

/** How often the rows of the linked runs are read again: the chat's own catch-up rhythm (`useChat`). */
const CATCH_UP_MS = 2000;

export function useRunStates(linked: () => readonly string[], options: RunStatesOptions = {}) {
  const wire = options.wire ?? chatApi();
  const every = options.every ?? CATCH_UP_MS;

  /** The row of every run the chat has been shown a link to, by id — the chat's own knowledge of the runs. */
  const rows = ref(new Map<string, Run>());

  /**
   * What went wrong, in the player's own language — or null while nothing has gone wrong. A row that
   * cannot be read is a link that says its first word for a while, which is nobody's emergency, so
   * the sentence is for whoever wants it and not a line in anybody's face.
   */
  const error = ref<string | null>(null);

  async function refresh(): Promise<void> {
    const ids = [...new Set(linked())];
    if (!ids.length) return;
    try {
      const read = await wire.runsByIds(ids);
      // Copied into a new map rather than patched into the old one, so that Vue hears the change:
      // a Map is not a thing it watches from the inside.
      const next = new Map(rows.value);
      for (const run of read) next.set(run.id, run);
      rows.value = next;
      error.value = null;
    } catch {
      error.value = 'Записи не дозвонились до сервера.';
    }
  }

  // A link that was not there a moment ago is a row to know at once; the timer is what keeps the
  // ones already known current — labels move, and a run that stops being played has to stop saying
  // it is.
  watch(linked, () => void refresh(), { immediate: true });
  let timer: ReturnType<typeof setInterval> | null = null;
  if (every > 0) timer = setInterval(() => void refresh(), every);

  /** Stops the timer: a page taken down with one running is a timer nobody can stop. */
  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  if (getCurrentScope()) onScopeDispose(stop);

  return { rows, error, stop };
}
