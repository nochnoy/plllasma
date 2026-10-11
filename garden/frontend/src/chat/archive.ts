/**
 * The archive — «Гиблиотека» — and what one row of its table is: the whole of every run the server
 * holds, newest first, read a window at a time as the table is scrolled (`useArchive`).
 *
 * Nothing here talks to anybody — the wire is `chat/api.ts` — and nothing here decides anything. The
 * shape is the server's own row (`store.Recording`) read for what a table wants from it rather than
 * for what a link in the chat does: a byline *with its face*, a moment, and the run's own word for
 * itself. The chat's `Run` and this `Entry` are two readings of one row, which is why the server's
 * names are turned over twice, once each — a link and a table row ask for different things, and
 * neither should carry the fields it has no use for.
 */

import { userpic } from './messages';

/** One run, as a row of the archive's table is drawn from it. */
export interface Entry {
  /** The server's own name for the run: what its tape is asked for by when the row is pressed. */
  id: string;
  /** Who played it: the nickname the site calls them, as the byline of the row. */
  author: string;
  /**
   * The face drawn before the nickname, 16×16 on screen: a ready `src` — the author's userpic the
   * site keeps (`userpic`). A row is the one place a run is signed by a face as well as a name,
   * because the table has the room for it and a link in the chat does not.
   */
  face: string;
  /**
   * When the run reached the server, in Unix milliseconds — the moment the list is ordered by, and
   * so the moment the table shows: a live run lands here as it begins, and a run that arrived whole
   * lands here as it arrives, which for a run is the one moment of its being *kept*.
   */
  whenMs: number;
  /**
   * What the run's own line in the chat is saying — «начал гнуть», «сделал шпагат» — as of the moment
   * this window of the list was read. Empty when nobody has said anything yet, which the row draws
   * its own word for (the table falls back to `RUN_STARTED`, the word every run starts by saying).
   */
  label: string;
  /** Whether the run was still being played when this window was read. */
  live: boolean;
  /**
   * How many times the run has been watched: each entering of its playback is a view, counted by the
   * server the moment the playback is asked for (`view` in `chat/api.ts`). Zero for a run nobody has
   * opened, which the row says nothing about — a count is only interesting once there is one.
   */
  views: number;
}

/**
 * A run as the server writes it (`store.Recording`): the fields a row of the table is drawn from,
 * under the server's own names, and nothing of the tape.
 *
 * Like the chat's `WireRun`, this is deliberately narrower than the whole answer — a table that kept
 * a field it had no use for would be claiming a shape this client does not really know.
 */
export interface WireEntry {
  id: string;
  author: string;
  icon?: string;
  uploaded_ms?: number;
  live?: boolean;
  label?: string;
  views?: number;
}

/** A run as the archive's table reads it: the server's names turned into this module's own. */
export function asEntry(wire: WireEntry): Entry {
  return {
    id: wire.id,
    author: wire.author,
    face: userpic(wire.icon || '-'),
    whenMs: wire.uploaded_ms ?? 0,
    live: wire.live ?? false,
    label: wire.label ?? '',
    views: wire.views ?? 0,
  };
}

/**
 * The clock every run of the archive is read by, in the player's own language and their own
 * timezone: «10.10.2026 14:30» — the date and the time each said by their own formatter and joined
 * with a space, because the one formatter for both is what writes the comma after the year. One pair
 * for the whole table rather than one a row, because a formatter is a thing the browser builds and a
 * table is not the place to build a thousand of them — and the shape they write is a promise the
 * tests hold onto.
 */
const day = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const time = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

/** When a run was kept, as the table's second column says it. */
export function whenWritten(ms: number): string {
  const when = new Date(ms);
  return `${day.format(when)} ${time.format(when)}`;
}
