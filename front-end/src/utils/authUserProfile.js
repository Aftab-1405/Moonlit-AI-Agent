const PROVIDER_LABELS = Object.freeze({
  password: 'Email',
  'google.com': 'Google',
  'github.com': 'GitHub',
});

function getProviderId(value) {
  return typeof value === 'string' ? value : value?.providerId;
}

function getProviderLabel(value) {
  const providerId = getProviderId(value)?.trim();
  if (!providerId) return null;
  if (PROVIDER_LABELS[providerId]) return PROVIDER_LABELS[providerId];

  return providerId
    .replace(/\.com$/i, '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

export function normalizeAuthTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeAuthUser(firebaseUser, backendUser = {}) {
  const backendProviders = Array.isArray(backendUser.providers)
    ? backendUser.providers
    : [backendUser.provider, backendUser.providerId];
  const providerValues = [...backendProviders, ...(firebaseUser.providerData || [])];
  const providerIds = providerValues
    .map(getProviderId)
    .map((providerId) => providerId?.trim())
    .filter(Boolean)
    .filter((providerId, index, list) => list.indexOf(providerId) === index);
  const providers = providerValues
    .map(getProviderLabel)
    .filter(Boolean)
    .filter((provider, index, list) => list.indexOf(provider) === index);
  const backendEmailVerified =
    typeof backendUser.emailVerified === 'boolean'
      ? backendUser.emailVerified
      : typeof backendUser.verified === 'boolean'
        ? backendUser.verified
        : null;

  return {
    uid: backendUser.uid || firebaseUser.uid,
    email: backendUser.email || firebaseUser.email,
    displayName:
      backendUser.displayName ||
      backendUser.name ||
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0],
    photoURL: backendUser.photoURL || backendUser.picture || firebaseUser.photoURL,
    emailVerified:
      typeof backendEmailVerified === 'boolean'
        ? backendEmailVerified
        : typeof firebaseUser.emailVerified === 'boolean'
          ? firebaseUser.emailVerified
          : null,
    providers,
    providerIds,
    createdAt: normalizeAuthTimestamp(
      backendUser.createdAt || backendUser.created_at || firebaseUser.metadata?.creationTime,
    ),
    lastSignInAt: normalizeAuthTimestamp(
      backendUser.lastSignInAt ||
        backendUser.last_sign_in_at ||
        firebaseUser.metadata?.lastSignInTime,
    ),
  };
}
