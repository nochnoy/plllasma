import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { Refused, type ChatWire } from '../src/chat/api';
import type { Run } from '../src/chat/runs';
import { useRunStates } from '../src/composables/useRunStates';

/**
 * What the chat knows about the runs its lines link (`useRunStates`): the rows of exactly those ids,
 * fetched when a link appears and kept current on the chat's own catching-up rhythm — because a
 * run's words and liveness change while the log that links it never does.
 *
 * No server and no browser are under these tests: the wire is a parameter and the timer is the
 * test's own (`vi.useFakeTimers`). The claims no other test can make are the ones these are really
 * about: that nothing is asked while no line links anything, that a row is asked for once rather
 * than once per line that links it, and that a run the server does not hold is absent rather than an
 * error.
 */
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A run's row with nothing in it but what a line draws: its words, and whether it is still going. */
function row(id: string, label = '', live = false): Run {
  return { id, name: `прогон ${id}`, author: 'Марго', steps: 250, stepMs: 20, live, label };
}

/** A wire that answers with the rows it was told to, and keeps every ask it was asked. */
function fakeWire(rows: Run[] = []) {
  const asked: string[][] = [];
  const wire: ChatWire = {
    async auth() {
      throw new Refused(0, 'the rows do not sign anybody in');
    },
    async log() {
      throw new Refused(0, 'the rows do not read the log');
    },
    async send() {
      throw new Refused(0, 'the rows do not write anything');
    },
    async runs() {
      throw new Refused(0, 'the rows do not read the list');
    },
    async runsByIds(ids) {
      asked.push([...ids]);
      return rows.filter((one) => ids.includes(one.id));
    },
    async archive() {
      throw new Refused(0, 'the rows do not read the archive');
    },
    async tape() {
      throw new Refused(0, 'the rows do not fetch a tape');
    },
  };
  return { wire, asked };
}

/** Lets what the rows have asked for land, one turn of the loop later. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('the runs the chat is interested in', () => {
  it('asks for exactly the linked ids, once each, and knows their rows', async () => {
    const { wire, asked } = fakeWire([row('run-1', 'Начал игру'), row('run-2', 'Сделал перешпагат', true)]);
    const linked = ref<readonly string[]>([]);
    const states = useRunStates(() => linked.value, { wire, every: 0 });

    // Two lines linking the same run are one asking: a run is known once, however much it is said.
    linked.value = ['run-1', 'run-2', 'run-1'];
    await settled();
    expect(asked).toEqual([['run-1', 'run-2']]);
    expect(states.rows.value.get('run-1')?.label).toBe('Начал игру');
    expect(states.rows.value.get('run-2')?.live).toBe(true);
    states.stop();
  });

  it('asks for nothing at all while no line links anything', async () => {
    const { wire, asked } = fakeWire([row('run-1')]);
    const states = useRunStates(() => [], { wire, every: 0 });
    await settled();
    expect(asked).toEqual([]);
    expect(states.rows.value.size).toBe(0);
    states.stop();
  });

  it('takes a run the server does not hold as simply absent', async () => {
    const { wire } = fakeWire([row('run-1')]);
    const linked = ref<readonly string[]>([]);
    const states = useRunStates(() => linked.value, { wire, every: 0 });
    linked.value = ['gone', 'run-1'];
    await settled();
    expect(states.rows.value.has('gone')).toBe(false);
    expect(states.error.value).toBeNull();
    states.stop();
  });

  it('reads them again on the chat\u2019s own rhythm, so words and liveness move', async () => {
    vi.useFakeTimers();
    try {
      const answer = ref<Run[]>([row('run-1', 'Начал игру', true)]);
      const asked: string[][] = [];
      const wire: ChatWire = {
        async auth() {
          throw new Refused(0, 'no');
        },
        async log() {
          throw new Refused(0, 'no');
        },
        async send() {
          throw new Refused(0, 'no');
        },
        async runs() {
          throw new Refused(0, 'no');
        },
        async runsByIds(ids) {
          asked.push([...ids]);
          return answer.value.filter((one) => ids.includes(one.id));
        },
        async archive() {
          throw new Refused(0, 'no');
        },
        async tape() {
          throw new Refused(0, 'no');
        },
      };
      const linked = ref<readonly string[]>(['run-1']);
      const states = useRunStates(() => linked.value, { wire, every: 2000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(states.rows.value.get('run-1')?.live).toBe(true);

      // The run's player said something else, and the run went on: the next rhythm hears both,
      // without the log itself being touched.
      answer.value = [row('run-1', 'Сделал перешпагат', false)];
      await vi.advanceTimersByTimeAsync(2000);
      expect(states.rows.value.get('run-1')?.label).toBe('Сделал перешпагат');
      expect(states.rows.value.get('run-1')?.live).toBe(false);
      expect(asked.every((one) => one.join() === 'run-1')).toBe(true);
      states.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
