export function getProtectedRouteDecision({ loading, isAuthenticated }) {
  if (loading) return 'loading';
  if (!isAuthenticated) return { redirectTo: '/login' };
  return 'allow';
}

export function getAdminRouteDecision({ loading, isAuthenticated, userUid, adminUid }) {
  const configuredAdminUid = typeof adminUid === 'string' ? adminUid.trim() : '';

  if (loading) return 'loading';
  if (!isAuthenticated) return { redirectTo: '/login' };
  if (!configuredAdminUid || userUid !== configuredAdminUid) {
    return { redirectTo: '/chat' };
  }
  return 'allow';
}
