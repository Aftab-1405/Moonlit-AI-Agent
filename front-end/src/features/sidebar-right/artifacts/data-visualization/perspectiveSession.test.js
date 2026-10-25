import assert from 'node:assert/strict';
import test from 'node:test';
import { createPerspectiveSession } from './perspectiveSession.js';

function fixture({ failUpdate = false, onFatalError } = {}) {
  const events = [];
  let count = 0;
  let current;
  const viewer = {
    load: async (table) => {
      events.push(`load:${table.id}`);
      current = table;
    },
    delete: async () => {
      events.push('viewer-delete');
      current = null;
    },
    restore: async () => {},
    flush: async () => {},
  };
  const client = {
    table: async () => {
      const id = ++count;
      return {
        id,
        update: async () => {
          if (failUpdate) throw Error('bad update');
        },
        replace: async () => {},
        delete: async () => {
          assert.notEqual(current?.id, id, 'viewer must detach before table delete');
          events.push(`table-delete:${id}`);
        },
      };
    },
  };
  const session = createPerspectiveSession({
    viewer,
    createClient: async () => ({ client, terminate: () => events.push('terminate') }),
    timeoutMs: 30,
    onFatalError,
  });
  return { events, session };
}
test('schema replacement detaches old viewer view before table deletion', async () => {
  const { session, events } = fixture();
  await session.load({ schema: { a: 'integer' }, columnar: { a: [1] } });
  await session.load({ schema: { a: 'string' }, columnar: { a: ['x'] } });
  await session.dispose();
  assert.deepEqual(events, [
    'load:1',
    'load:2',
    'table-delete:1',
    'viewer-delete',
    'table-delete:2',
    'terminate',
  ]);
});
test('partial initialization failure cleans new table and client and permits a new session', async () => {
  const { session, events } = fixture({ failUpdate: true });
  await assert.rejects(
    session.load({ schema: { a: 'integer' }, columnar: { a: [1] } }),
    /bad update/,
  );
  await session.dispose();
  assert.ok(events.includes('table-delete:1'));
  assert.ok(events.includes('terminate'));
});
test('closing before client creation settles terminates late client and never loads viewer', async () => {
  let resolve;
  const events = [];
  const session = createPerspectiveSession({
    viewer: { delete: async () => events.push('delete') },
    createClient: () => new Promise((r) => (resolve = r)),
    timeoutMs: 20,
  });
  const pending = session.load({ schema: { a: 'integer' }, columnar: { a: [1] } });
  await Promise.resolve();
  await session.dispose();
  resolve({ client: {}, terminate: () => events.push('terminate') });
  await assert.rejects(pending, /closed|cancelled/i);
  assert.ok(events.includes('terminate'));
});
test('stale queued update cannot replace latest snapshot', async () => {
  const { session } = fixture();
  const first = session.load({ schema: { a: 'integer' }, columnar: { a: [1] } });
  const second = session.load({ schema: { a: 'integer' }, columnar: { a: [2] } });
  assert.equal(await first, false);
  assert.equal(await second, true);
  await session.dispose();
});

test('invalid saved configuration falls back and remains usable', async () => {
  const restored = [];
  let invalid = 0;
  const viewer = {
    load: async () => {},
    delete: async () => {},
    restore: async (config) => {
      restored.push(config);
      if (config.broken) throw Error('unknown column');
    },
  };
  const table = { update: async () => {}, delete: async () => {} };
  const session = createPerspectiveSession({
    viewer,
    createClient: async () => ({ client: { table: async () => table }, terminate: () => {} }),
  });
  try {
    assert.equal(
      await session.load({
        schema: { a: 'integer' },
        columnar: { a: [1] },
        key: 'query',
        config: { broken: true },
        fallbackConfig: { plugin: 'Datagrid' },
        onInvalidConfig: () => invalid++,
      }),
      true,
    );
    assert.equal(invalid, 1);
    assert.deepEqual(restored, [{ broken: true }, { plugin: 'Datagrid' }]);
    assert.equal(await session.action(async () => 'usable'), 'usable');
  } finally {
    await session.dispose();
  }
});

test('failed export does not poison subsequent actions', async () => {
  const { session } = fixture();
  try {
    await session.load({ schema: { a: 'integer' }, columnar: { a: [1] } });
    await assert.rejects(
      session.action(async () => {
        throw Error('export failed');
      }),
      /export failed/,
    );
    assert.equal(await session.action(async () => 'retry succeeded'), 'retry succeeded');
  } finally {
    await session.dispose();
  }
});

for (const stage of ['worker', 'table', 'viewer']) {
  test(`${stage} creation failure rejects and releases acquired resources`, async () => {
    let terminated = 0;
    let deleted = 0;
    const table = { update: async () => {}, delete: async () => deleted++ };
    const viewer = {
      load: async () => {
        if (stage === 'viewer') throw Error('viewer failed');
      },
      delete: async () => {},
    };
    const session = createPerspectiveSession({
      viewer,
      createClient: async () => {
        if (stage === 'worker') throw Error('worker failed');
        return {
          client: {
            table: async () => {
              if (stage === 'table') throw Error('table failed');
              return table;
            },
          },
          terminate: () => terminated++,
        };
      },
    });
    await assert.rejects(
      session.load({ schema: { a: 'integer' }, columnar: { a: [1] } }),
      new RegExp(`${stage} failed`),
    );
    await session.dispose();
    assert.equal(terminated, stage === 'worker' ? 0 : 1);
    assert.equal(deleted, stage === 'viewer' ? 1 : 0);
  });
}

test('timed-out actions terminate the session and expose recoverable failure', async () => {
  let failure;
  const { session, events } = fixture({
    onFatalError: (error) => {
      failure = error;
    },
  });
  await session.load({ schema: { a: 'integer' }, columnar: { a: [1] } });
  await assert.rejects(
    session.action(() => new Promise(() => {})),
    /Timed out/,
  );
  assert.match(failure?.message || '', /Timed out/);
  assert.ok(events.includes('terminate'));
  await assert.rejects(
    session.action(async () => true),
    /finish loading/,
  );
});

test('a newer load survives supersession while worker initialization is in flight', async () => {
  let release;
  let started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const rows = [];
  let terminated = 0;
  const table = { update: async (data) => rows.push(data), delete: async () => {} };
  const session = createPerspectiveSession({
    viewer: { load: async () => {}, delete: async () => {} },
    createClient: () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  try {
    const first = session.load({ schema: { a: 'integer' }, columnar: { a: [1] }, key: 'old' });
    await began;
    const second = session.load({ schema: { a: 'integer' }, columnar: { a: [2] }, key: 'new' });
    release({ client: { table: async () => table }, terminate: () => terminated++ });
    const outcomes = await Promise.allSettled([first, second]);
    assert.deepEqual(outcomes, [
      { status: 'fulfilled', value: false },
      { status: 'fulfilled', value: true },
    ]);
    assert.deepEqual(rows, [{ a: [2] }]);
    assert.equal(terminated, 0);
  } finally {
    await session.dispose();
  }
  assert.equal(terminated, 1);
});

test('empty snapshots skip unsupported empty updates and clear existing rows', async () => {
  let rows = [];
  const table = {
    update: async (data) => {
      assert.ok(data.a.length);
      rows = data.a;
    },
    replace: async (data) => {
      assert.ok(data.a.length);
      rows = data.a;
    },
    clear: async () => {
      rows = [];
    },
    delete: async () => {},
  };
  const session = createPerspectiveSession({
    viewer: { load: async () => {}, delete: async () => {} },
    createClient: async () => ({ client: { table: async () => table }, terminate: () => {} }),
  });
  try {
    assert.equal(await session.load({ schema: { a: 'integer' }, columnar: { a: [] } }), true);
    await session.load({ schema: { a: 'integer' }, columnar: { a: [1] } });
    assert.deepEqual(rows, [1]);
    assert.equal(await session.load({ schema: { a: 'integer' }, columnar: { a: [] } }), true);
    assert.deepEqual(rows, []);
  } finally {
    await session.dispose();
  }
});
