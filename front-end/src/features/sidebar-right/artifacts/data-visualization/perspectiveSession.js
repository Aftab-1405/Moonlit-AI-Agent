/** One viewer/worker owner; all data and toolbar operations share a serial queue. */
function deadline(promise, ms, stage) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Timed out while ${stage}. Retry loading the result.`);
        error.code = 'PERSPECTIVE_TIMEOUT';
        reject(error);
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function createPerspectiveSession({
  viewer,
  createClient,
  timeoutMs = 60000,
  onMetrics,
  onFatalError,
}) {
  const abort = new AbortController();
  let owner;
  let table;
  let signature;
  let analysisKey;
  let queue = Promise.resolve();
  let generation = 0;
  let closed = false;
  let ready = false;
  let closing;
  const tables = new Set();
  const started = performance.now();
  const initialization = Promise.resolve()
    .then(() => createClient(abort.signal))
    .then((resource) => {
      if (closed) {
        resource.terminate();
        throw new Error('Analysis was closed.');
      }
      owner = resource;
      onMetrics?.({ worker_init_ms: performance.now() - started });
      return resource.client;
    });
  // May be disposed before a load starts; initialization is still observed.
  initialization.catch(() => {});

  const dispose = () => {
    if (closing) return closing;
    closed = true;
    if (!owner) abort.abort();
    ready = false;
    generation++;
    closing = (async () => {
      try {
        await deadline(
          (async () => {
            await viewer.delete?.();
            for (const owned of tables) await owned.delete();
            tables.clear();
          })(),
          Math.min(timeoutMs, 2000),
          'releasing analysis resources',
        );
      } catch {
        // The dedicated worker is the final resource boundary when protocol cleanup fails.
      } finally {
        abort.abort();
        owner?.terminate();
        owner = null;
        table = null;
      }
    })();
    return closing;
  };

  function enqueue(operation) {
    const task = queue.then(operation);
    queue = task.catch(() => {});
    return task;
  }

  return {
    dispose,
    load({ schema, columnar, config, key, fallbackConfig, onInvalidConfig }) {
      const ticket = ++generation;
      ready = false;
      const stale = () => closed || ticket !== generation;
      return enqueue(async () => {
        if (closed) throw new Error('Analysis is closed. Retry loading the result.');
        if (stale()) return false;
        const loadStarted = performance.now();
        try {
          const client = await deadline(
            initialization,
            Math.min(timeoutMs, 15000),
            'starting analysis',
          );
          if (closed) throw new Error('Analysis was closed.');
          // Superseding a load does not relinquish the shared worker owner.
          if (stale()) return false;
          const nextSignature = JSON.stringify(schema);
          const hasRows = Object.values(columnar).some((values) => values.length > 0);
          const needsTable = !table || signature !== nextSignature;
          if (needsTable) {
            const previous = table;
            const creation = client.table(schema).then((created) => {
              if (closed) {
                created.delete().catch(() => {});
                throw new Error('Analysis was closed.');
              }
              tables.add(created);
              return created;
            });
            const next = await deadline(creation, timeoutMs, 'creating the analysis table');
            if (hasRows) await deadline(next.update(columnar), timeoutMs, 'loading result rows');
            if (closed) throw new Error('Analysis was closed.');
            // load() releases the previous viewer view; only then delete its table.
            await deadline(viewer.load(next), timeoutMs, 'rendering the analysis');
            table = next;
            signature = nextSignature;
            if (previous) {
              await deadline(previous.delete(), timeoutMs, 'releasing the previous result');
              tables.delete(previous);
            }
          } else {
            // 4.5.1 cannot ingest an empty columnar batch. clear() preserves
            // the typed schema and viewer while removing the previous snapshot.
            await deadline(
              hasRows ? table.replace(columnar) : table.clear(),
              timeoutMs,
              'replacing result rows',
            );
          }
          if (stale()) return false;
          if (analysisKey !== key || config) {
            // restore() merges partial settings. Start unrelated analyses from
            // a clean configuration; compatible reruns keep their active view.
            if (!needsTable)
              await deadline(viewer.load(table), timeoutMs, 'clearing previous analysis settings');
            try {
              if (config || fallbackConfig)
                await deadline(
                  viewer.restore(config || fallbackConfig),
                  timeoutMs,
                  'restoring analysis settings',
                );
            } catch (error) {
              if (error.code === 'PERSPECTIVE_TIMEOUT') throw error;
              if (!config || !fallbackConfig) throw error;
              onInvalidConfig?.();
              // A rejected restore can leave invalid filters/expressions set.
              // load() clears that state even when reset() cannot render it.
              await deadline(viewer.load(table), timeoutMs, 'clearing incompatible settings');
              await deadline(
                viewer.restore(fallbackConfig),
                timeoutMs,
                'resetting incompatible settings',
              );
            }
            analysisKey = key;
          }
          await deadline(viewer.flush?.() || Promise.resolve(), timeoutMs, 'finishing rendering');
          if (stale()) return false;
          ready = true;
          onMetrics?.({ perspective_load_ms: performance.now() - loadStarted });
          return true;
        } catch (error) {
          await dispose();
          throw error;
        }
      });
    },
    action(operation) {
      const ticket = generation;
      return enqueue(async () => {
        if (closed || !ready || ticket !== generation)
          throw new Error('Wait for the current result to finish loading.');
        try {
          return await deadline(
            Promise.resolve().then(() => operation(viewer)),
            timeoutMs,
            'completing the analysis action',
          );
        } catch (error) {
          // A timed-out operation can still be running inside WASM. Terminate
          // its owner before allowing any new work, then offer a fresh session.
          if (error.code === 'PERSPECTIVE_TIMEOUT') {
            await dispose();
            onFatalError?.(error);
          }
          throw error;
        }
      });
    },
  };
}
