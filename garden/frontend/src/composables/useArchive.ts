import { ref } from 'vue';
import type { Entry } from '../chat/archive';
import { chatApi, type ChatWire } from '../chat/api';

/**
 * The archive's own half of the runs: the whole list as a table, filled a window at a time.
 *
 * The chat is the *live* reading of the runs — the lines it is showing, asked about every two
 * seconds — and this is the other one: every run the server holds, read once, a chunk at a time as
 * the table is scrolled, and not kept current. A run that begins while the player is reading the
 * archive is a line in the chat, the way every run is; the table is what has already been kept, and
 * the page it is read on is the page it was read for. That is what an archive is, and it is also
 * what lets a window be asked for by how far down the table has got (`offset`), which no list being
 * rewritten underneath the reader could promise.
 */
export interface ArchiveOptions {
  /** The wire the windows are read over (`chat/api.ts`): the real one, unless a test brings its own. */
  wire?: ChatWire;
  /** How many rows one window holds; the page always wants the same number, and a test wants a small one. */
  chunk?: number;
}

/**
 * How many rows one window of the list holds: a hundred, which is a table long enough to be worth
 * scrolling and short enough to arrive — and the whole of the asking the archive ever makes in one
 * go, however many runs the server keeps.
 */
const WINDOW = 100;

/**
 * The sentence a window that would not read is refused with, in the player's own language: the
 * table's rows stand as they are and the scroll is what asks again, so one line under the table is
 * the whole of what the failure costs.
 */
const ABOUT = 'Записи не дозвонились до сервера.';

export function useArchive(options: ArchiveOptions = {}) {
  const wire = options.wire ?? chatApi();
  const chunk = options.chunk ?? WINDOW;

  /** The rows read so far, newest first — the table, and what the next window is asked from. */
  const rows = ref<Entry[]>([]);
  /** Whether a window is on its way down: the one guard there is, since a scroll asks freely. */
  const loading = ref(false);
  /**
   * Whether the list is over: a window that came back shorter than it was asked for is the last
   * one, and an empty window is the same said more plainly. Nothing asks the server again after
   * it, however far the table is scrolled.
   */
  const done = ref(false);
  /** Why the last window did not arrive, in the player's own language, or null while none did. */
  const error = ref<string | null>(null);

  /**
   * The next window of the list, onto the end of the table: asked for by how many rows are already
   * standing, which is where the last one ended.
   *
   * It asks nothing while a window is on its way or the list is over — a scroll that reaches the
   * bottom twice before the answer arrives is one ask, and a table at the end of its list has
   * nothing left to ask for. A window that fails costs the table its rows' length and nothing else:
   * the next ask is the same ask, because nothing was added.
   */
  async function more(): Promise<void> {
    if (loading.value || done.value) return;
    loading.value = true;
    try {
      const read = await wire.archive(rows.value.length, chunk);
      rows.value = rows.value.concat(read);
      done.value = read.length < chunk;
      error.value = null;
    } catch {
      error.value = ABOUT;
    } finally {
      loading.value = false;
    }
  }

  /**
   * The archive arrived at: the pan over and the screen standing in its place (`App.vue`), which is
   * the moment the first window is asked for — the screen's own arrival work, the way the chat's is
   * its log and its field.
   *
   * A page that never goes to the archive asks the server for none of it: the table is read when it
   * is first stood in front of, and every arrival after that finds it already standing.
   */
  function arrive(): void {
    if (rows.value.length === 0 && !done.value) void more();
  }

  return { rows, loading, done, error, more, arrive };
}
