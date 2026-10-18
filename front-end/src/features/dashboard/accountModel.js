const LEGACY_ACCOUNT_KEYS = new Set(['moonlit-settings', 'moonlit-saved-connection']);

export function getAccountStorageKey(userId, resource) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedResource = String(resource || '').trim();
  if (!normalizedUserId || !normalizedResource) {
    throw new Error('A user and storage resource are required.');
  }
  return `moonlit:${normalizedUserId}:${normalizedResource}`;
}

export function normalizeDisplayName(value) {
  const displayName = String(value || '').trim();
  if (!displayName) throw new Error('Display name is required.');
  if (displayName.length > 80) throw new Error('Display name must be 80 characters or fewer.');
  return displayName;
}

export function canUnlinkProvider(providerIds, providerId) {
  const uniqueProviders = [...new Set((providerIds || []).filter(Boolean))];
  return uniqueProviders.includes(providerId) && uniqueProviders.length > 1;
}

export function clearAccountStorage(userId, storage = globalThis.localStorage) {
  if (!storage || !userId) return;
  const accountPrefix = `moonlit:${userId}:`;
  const keys = Array.from({ length: storage.length }, (_value, index) => storage.key(index)).filter(
    Boolean,
  );

  keys.forEach((key) => {
    if (
      key.startsWith(accountPrefix) ||
      key.startsWith('moonlit:perspective:v4:') ||
      LEGACY_ACCOUNT_KEYS.has(key)
    ) {
      storage.removeItem(key);
    }
  });
}
