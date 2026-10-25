/** v5 keys include the complete identity, avoiding hash collisions and credential-derived keys. */
export function createAnalysisStorageKey({ userId, sourceId, queryId, columnMetadata = [] }) {
  if (!userId || !sourceId || !queryId || !columnMetadata.length) return null;
  return `moonlit:${userId}:perspective:v5:${encodeURIComponent(JSON.stringify({ sourceId, queryId, columnMetadata }))}`;
}

export function loadAnalysisConfig(storageKey) {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey));
    if (
      saved?.version !== 5 ||
      saved.identity !== storageKey ||
      !saved.config ||
      typeof saved.config !== 'object' ||
      Array.isArray(saved.config)
    )
      return null;
    const { table: _table, ...config } = saved.config;
    return config;
  } catch {
    return null;
  }
}

export function saveAnalysisConfig(storageKey, config) {
  if (!storageKey || !config || typeof window === 'undefined') return false;
  try {
    const { table: _table, ...portableConfig } = config;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ version: 5, identity: storageKey, config: portableConfig }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearAnalysisConfig(storageKey) {
  if (!storageKey || typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}
