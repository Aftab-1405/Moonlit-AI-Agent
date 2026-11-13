const noop = () => {};
export const useAuth = () => ({
  user: null,
  loading: false,
  initialized: true,
  error: null,
  clearAuthError: noop,
});
export function AuthProvider({ children }) {
  return children;
}
