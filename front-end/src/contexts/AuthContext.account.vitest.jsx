import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  getRedirectResult: vi.fn().mockResolvedValue(null),
  onAuthStateChanged: vi.fn(),
  reauthenticateWithRedirect: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

const api = vi.hoisted(() => ({
  setAuthenticatedUserSession: vi.fn(),
  logoutAuthenticatedUserSession: vi.fn().mockResolvedValue(undefined),
  deleteAccount: vi.fn().mockResolvedValue(null),
}));

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  ...firebase,
}));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}));

const firebaseUser = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  photoURL: null,
  emailVerified: true,
  providerData: [{ providerId: 'google.com' }],
  metadata: {},
  getIdToken: vi.fn().mockResolvedValue('id-token'),
};

vi.mock('@/config/firebase', () => ({
  initializeFirebase: vi.fn().mockResolvedValue(undefined),
  getFirebaseAuth: () => ({ currentUser: firebaseUser }),
  getGoogleProvider: () => ({ providerId: 'google.com' }),
  getGithubProvider: () => ({ providerId: 'github.com' }),
}));

const { AuthProvider, useAuth } = await import('@/contexts/AuthContext');
let latestAuth;

function Probe() {
  latestAuth = useAuth();
  return (
    <button type="button" onClick={() => latestAuth.updateDisplayName('  Grace Hopper  ')}>
      Update name
    </button>
  );
}

describe('AuthContext account actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    firebaseUser.displayName = 'Ada Lovelace';
    firebaseUser.providerData = [{ providerId: 'google.com' }];
    firebaseUser.getIdToken.mockResolvedValue('id-token');
    firebase.getRedirectResult.mockResolvedValue(null);
    api.setAuthenticatedUserSession.mockResolvedValue({
      status: 'success',
      user: { uid: 'user-1', email: 'ada@example.com', name: firebaseUser.displayName },
    });
    firebase.onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(firebaseUser);
      return () => {};
    });
  });

  it('updates the Firebase display name and refreshes the secure backend session', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(latestAuth.user?.uid).toBe('user-1'));

    await user.click(screen.getByRole('button', { name: 'Update name' }));

    await waitFor(() => expect(firebase.updateProfile).toHaveBeenCalledWith(firebaseUser, { displayName: 'Grace Hopper' }));
    expect(firebaseUser.getIdToken).toHaveBeenLastCalledWith(true);
    expect(api.setAuthenticatedUserSession).toHaveBeenLastCalledWith({ idToken: 'id-token' });
  });

  it('refuses to unlink the final authentication provider', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(latestAuth.user?.uid).toBe('user-1'));

    await expect(latestAuth.unlinkAuthProvider('google.com')).rejects.toThrow(/last sign-in method/i);
    expect(firebase.unlink).not.toHaveBeenCalled();
  });

  it('resumes a mobile OAuth sensitive action after redirect reauthentication', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    sessionStorage.setItem(
      'moonlit-auth-pending-action',
      JSON.stringify({ type: 'reauthenticate', providerId: 'google.com' }),
    );
    firebase.getRedirectResult.mockResolvedValueOnce({ user: firebaseUser });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(latestAuth.user?.uid).toBe('user-1'));

    await expect(
      latestAuth.reauthenticateCurrentUser({ providerId: 'google.com' }),
    ).resolves.toEqual({ redirected: false });

    expect(firebase.reauthenticateWithRedirect).not.toHaveBeenCalled();
    expect(firebaseUser.getIdToken).toHaveBeenLastCalledWith(true);
    expect(api.setAuthenticatedUserSession).toHaveBeenLastCalledWith({ idToken: 'id-token' });
  });
});
