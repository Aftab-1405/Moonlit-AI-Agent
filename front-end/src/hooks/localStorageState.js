/**
 * Resolve a local-storage state update without committing it. The caller can
 * persist the result before exposing it to subsequent functional updates.
 */
export function resolveStoredValue(latestValue, value) {
  return value instanceof Function ? value(latestValue) : value;
}
