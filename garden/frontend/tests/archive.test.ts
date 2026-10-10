import { describe, expect, it } from 'vitest';
import { asEntry, whenWritten } from '../src/chat/archive';

/**
 * The archive's own shapes (`chat/archive.ts`): one row of the table as it is read off the server's
 * own row, and the moment of a run as the table's second column says it. Nothing here talks to
 * anybody — the crossing is the wire's (`chat-api.test.ts`) and the asking is the composable's
 * (`use-archive.test.ts`) — so what is checked is the reading itself: which fields a row of the
 * table is drawn from, what an omission becomes, and that a moment written for a player is a moment
 * they can read back.
 */

/** A run as the server writes one (`store.Recording`), with the fields a row is drawn from. */
const WIRE = {
  id: 'run-2',
  name: 'второй прогон',
  author: 'Марго',
  icon: '9',
  steps: 250,
  step_ms: 20,
  seed: 4242,
  bytes: 8192,
  recorded_ms: 1750000000000,
  uploaded_ms: 1750000001000,
  label: 'Сделал перешпагат',
};

describe('one row of the table', () => {
  it('is read for the byline with its face, the moment, and the word — and nothing else', () => {
    // The tape's own size, its seed, how long it is and when it was played are all in the answer
    // and none of them is read: a table that kept a field it had no use for would be claiming a
    // shape this client does not really know.
    expect(asEntry(WIRE)).toEqual({
      id: 'run-2',
      author: 'Марго',
      face: '/i/9.gif',
      whenMs: 1750000001000,
      label: 'Сделал перешпагат',
      live: false,
    });
  });

  it('takes the site\'s own «no userpic» file for a player whose badge the server left out', () => {
    expect(asEntry({ ...WIRE, icon: '' }).face).toBe('/i/-.gif');
    expect(asEntry({ ...WIRE, icon: undefined }).face).toBe('/i/-.gif');
  });

  it('takes omissions the way the chat\'s own reading of a run does', () => {
    // A run that came down without its word has not said anything yet, one without `live` has been
    // played out, and one without its moment — which the server never leaves out — is a run kept at
    // the beginning of everything rather than a guess.
    const read = asEntry({ id: 'run-3', author: 'Аня' });
    expect(read.label).toBe('');
    expect(read.live).toBe(false);
    expect(read.whenMs).toBe(0);
  });
});

describe('the moment, as the table says it', () => {
  it('is a date and a time in the player\'s own language, in their own timezone', () => {
    // Built from local parts so the test reads the same on any machine: whatever timezone the
    // player is in, the moment they are shown is the moment as their own clock keeps it.
    expect(whenWritten(new Date(2026, 9, 10, 14, 30).getTime())).toBe('10.10.2026, 14:30');
  });

  it('pads the short parts of itself, so a table of rows aligns', () => {
    expect(whenWritten(new Date(2026, 0, 5, 4, 5).getTime())).toBe('05.01.2026, 04:05');
  });
});
