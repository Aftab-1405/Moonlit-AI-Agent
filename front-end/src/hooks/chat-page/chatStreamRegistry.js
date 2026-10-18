export function createChatStreamRegistry() {
  const streams = new Map();
  const generations = new Map();

  return {
    start(sessionKey) {
      if (streams.has(sessionKey)) return null;
      const generation = (generations.get(sessionKey) || 0) + 1;
      let settle;
      const finished = new Promise((resolve) => {
        settle = resolve;
      });
      const entry = { controller: new AbortController(), generation, finished, settle };
      generations.set(sessionKey, generation);
      streams.set(sessionKey, entry);
      return entry;
    },

    get(sessionKey) {
      return streams.get(sessionKey) || null;
    },

    isActive(sessionKey) {
      return streams.has(sessionKey);
    },

    finish(sessionKey, generation) {
      const entry = streams.get(sessionKey);
      if (!entry || entry.generation !== generation) return false;
      streams.delete(sessionKey);
      entry.settle(true);
      return true;
    },

    stop(sessionKey) {
      const entry = streams.get(sessionKey);
      if (!entry) return false;
      streams.delete(sessionKey);
      entry.controller.abort();
      entry.settle(false);
      return true;
    },

    stopAll(beforeStop) {
      for (const [sessionKey, entry] of streams.entries()) {
        beforeStop?.(sessionKey, entry);
        entry.controller.abort();
        entry.settle(false);
      }
      streams.clear();
    },

    get size() {
      return streams.size;
    },
  };
}
