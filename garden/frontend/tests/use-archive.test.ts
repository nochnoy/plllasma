import { describe, expect, it } from 'vitest';
import { useArchive } from '../src/composables/useArchive';
import type { Entry } from '../src/chat/archive';
import { Refused, type ChatWire } from '../src/chat/api';

/**
 * The archive as a living list (`useArchive`): a table filled a window at a time, asked for by how
 * far down it has got and never asked past its end. There is no server under these tests — the wire
 * is a fake that answers from a list a test writes and remembers what it was asked — so what is
 * checked is the whole of the asking: when the first window is read, what each next one is asked
 * from, what a window that comes back short means, and what a window that does not come back at all
 * costs.
 */

/** One row as the table holds it, made short: only the fields the composable itself touches. */
function row(id: string): Entry {
  return { id, author: `игрок ${id}`, face: '/i/-.gif', whenMs: 1, label: 'Начал игру', live: false };
}

/**
 * The wire as a list of a hundred and one answers: every window asked for is cut out of `all` at
 * the offset it named, and a test that wants the asking to fail says so in `refuse`.
 */
function wireOf(all: Entry[], refuse = false) {
  const asked: { offset: number; limit: number }[] = [];
  const wire: ChatWire = {
    async auth() {
      throw new Refused(0, 'the archive does not shake hands');
    },
    async log() {
      throw new Refused(0, 'the archive does not read the log');
    },
    async send() {
      throw new Refused(0, 'the archive does not write anything');
    },
    async runs() {
      throw new Refused(0, 'the archive does not read the whole list');
    },
    async runsByIds() {
      throw new Refused(0, 'the archive does not read the rows of runs');
    },
    async archive(offset, limit) {
      asked.push({ offset, limit });
      if (refuse) throw new Refused(500, 'the window would not be read');
      return all.slice(offset, offset + limit);
    },
    async tape() {
      throw new Refused(0, 'the archive does not fetch a tape');
    },
  };
  return { wire, asked };
}

/** Lets what the wire has answered land, one turn of the loop later. */
async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('a table filled a window at a time', () => {
  it('asks for its first window when arrived at, and not before', async () => {
    const all = Array.from({ length: 101 }, (_, at) => row(`run-${at}`));
    const { wire, asked } = wireOf(all);
    const table = useArchive({ wire, chunk: 40 });
    await settled();
    expect(asked).toHaveLength(0);
    table.arrive();
    await settled();
    expect(asked).toEqual([{ offset: 0, limit: 40 }]);
    expect(table.rows.value).toHaveLength(40);
    expect(table.rows.value[0]).toEqual(row('run-0'));
    expect(table.done.value).toBe(false);
  });

  it('asks nothing for a screen it is arrived at twice with the rows already standing', async () => {
    // The archive is a snapshot read once, not a conversation kept current: coming back to it finds
    // the table where it was left, and the scroll — not the arrival — is what asks for more.
    const all = Array.from({ length: 101 }, (_, at) => row(`run-${at}`));
    const { wire, asked } = wireOf(all);
    const table = useArchive({ wire, chunk: 40 });
    table.arrive();
    await settled();
    table.arrive();
    await settled();
    expect(asked).toHaveLength(1);
  });

  it('asks for each next window from where the last one ended', async () => {
    const all = Array.from({ length: 101 }, (_, at) => row(`run-${at}`));
    const { wire, asked } = wireOf(all);
    const table = useArchive({ wire, chunk: 40 });
    table.arrive();
    await settled();
    await table.more();
    expect(asked.map((one) => one.offset)).toEqual([0, 40]);
    expect(table.rows.value).toHaveLength(80);
    expect(table.rows.value[79]).toEqual(row('run-79'));
  });

  it('holds a second ask off while the first is on its way down', async () => {
    // A scroll that reaches the bottom of the drawn rows twice before the answer arrives — or an
    // observer that fires again on the same visibility — is one asking, not two.
    const all = Array.from({ length: 101 }, (_, at) => row(`run-${at}`));
    const { wire, asked } = wireOf(all);
    const table = useArchive({ wire, chunk: 40 });
    table.arrive();
    void table.more();
    void table.more();
    await settled();
    expect(asked).toHaveLength(1);
  });

  it('takes a window that came back short as the end of the list, and asks no further', async () => {
    const all = Array.from({ length: 101 }, (_, at) => row(`run-${at}`));
    const { wire, asked } = wireOf(all);
    const table = useArchive({ wire, chunk: 40 });
    table.arrive();
    await settled();
    await table.more();
    await table.more();
    await settled();
    // 40 + 40 + 21: the third window is short, and the list is over however far the table is scrolled.
    expect(table.rows.value).toHaveLength(101);
    expect(table.done.value).toBe(true);
    await table.more();
    expect(asked).toHaveLength(3);
  });

  it('takes a list shorter than one window as over on the first read', async () => {
    const { wire, asked } = wireOf([row('one'), row('two')]);
    const table = useArchive({ wire, chunk: 40 });
    table.arrive();
    await settled();
    expect(table.rows.value.map((one) => one.id)).toEqual(['one', 'two']);
    expect(table.done.value).toBe(true);
    await table.more();
    expect(asked).toHaveLength(1);
  });

  it('takes an empty server as an over-and-empty list, not a failure', async () => {
    const { wire } = wireOf([]);
    const table = useArchive({ wire, chunk: 40 });
    table.arrive();
    await settled();
    expect(table.rows.value).toEqual([]);
    expect(table.done.value).toBe(true);
    expect(table.error.value).toBeNull();
  });
});

describe('a window that would not read', () => {
  it('costs the table one line for the player and nothing else', async () => {
    const all = Array.from({ length: 101 }, (_, at) => row(`run-${at}`));
    const { wire, asked } = wireOf(all, true);
    const table = useArchive({ wire, chunk: 40 });
    table.arrive();
    await settled();
    expect(table.rows.value).toEqual([]);
    expect(table.error.value).toBe('Записи не дозвонились до сервера.');
    expect(table.done.value).toBe(false);
    // The next ask is the same ask — nothing was added, so the window is asked for from the same
    // place — and it is the scroll that makes it, which is the player's own doing.
    void table.more();
    await settled();
    expect(asked).toEqual([
      { offset: 0, limit: 40 },
      { offset: 0, limit: 40 },
    ]);
  });
});
