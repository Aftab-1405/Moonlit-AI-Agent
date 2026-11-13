import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import Auth from '@/pages/Auth';
import { createDarkTheme } from '@/theme';

// The authentication service is the external boundary; forms and routing are real.
const { auth } = vi.hoisted(() => ({ auth: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/pages/ChatWorkspacePage', () => ({ default: () => <h1>Workspace</h1> }));
vi.mock('@/pages/DashboardPage', () => ({ default: () => <h1>Dashboard</h1> }));
vi.mock('@/pages/AdminDashboard', () => ({ default: () => <h1>Administration</h1> }));

const theme = createDarkTheme();

beforeEach(() => {
  Object.assign(auth, {
    loading: false,
    isAuthenticated: false,
    user: null,
    error: null,
    clearError: vi.fn(),
    signInWithEmail: vi.fn().mockResolvedValue(undefined),
    signUpWithEmail: vi.fn().mockResolvedValue(undefined),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signInWithGitHub: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
  });
});

function renderAuth({ path = '/login', app = false, initialEntries = [path] } = {}) {
  const router = createMemoryRouter(
    app
      ? [{ path: '*', element: <App /> }]
      : [
          { path: '/login', element: <Auth /> },
          { path: '/chat', element: <h1>Workspace</h1> },
          { path: '/previous', element: <h1>Previous page</h1> },
        ],
    { initialEntries, initialIndex: initialEntries.length - 1 },
  );
  const element = () => (
    <ThemeProvider theme={theme}>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
  const view = render(element());
  return { router, ...view };
}

describe('authentication entry routes', () => {
  it.each(['/', '/login'])('renders the sign-in form at %s', async (path) => {
    renderAuth({ path, app: true });
    expect(await screen.findByRole('textbox', { name: 'Email' })).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('replaces the legacy auth URL with login', async () => {
    const { router } = renderAuth({ path: '/auth', app: true });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByRole('textbox', { name: 'Email' })).toBeTruthy();
  });

  it.each([
    '/chat/saved-conversation',
    '/dashboard/account',
    '/admin',
  ])('sends signed-out visitors from %s to login', async (path) => {
    const { router } = renderAuth({ path, app: true });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('textbox', { name: 'Email' })).toBeTruthy();
  });

  it('waits for session initialization even if a user is present', () => {
    auth.loading = true;
    auth.isAuthenticated = true;
    const { router } = renderAuth();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Workspace' })).toBeNull();
  });

  it('replaces login in history after session restoration', async () => {
    auth.isAuthenticated = true;
    const { router } = renderAuth({ initialEntries: ['/previous', '/login'] });
    await screen.findByRole('heading', { name: 'Workspace' });
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
    await act(() => router.navigate(-1));
    expect(screen.getByRole('heading', { name: 'Previous page' })).toBeTruthy();
  });

  it('keeps authenticated conversation links at their original URL', async () => {
    auth.isAuthenticated = true;
    const { router } = renderAuth({ path: '/chat/saved-conversation', app: true });
    await screen.findByRole('heading', { name: 'Workspace' });
    expect(router.state.location.pathname).toBe('/chat/saved-conversation');
  });
});

describe('authentication form operations', () => {
  it('submits email credentials and blocks duplicate/provider actions while busy', async () => {
    const user = userEvent.setup();
    let finish;
    auth.signInWithEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderAuth();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    expect(auth.signInWithEmail).toHaveBeenCalledWith('ada@example.com', 'correct-password');
    expect(screen.getByRole('button', { name: /Google/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /GitHub/ }).disabled).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Email' }).disabled).toBe(true);
    await act(() => finish());
    expect(screen.getByRole('textbox', { name: 'Email' }).disabled).toBe(false);
  });

  it('validates registration confirmation before creating an account', async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Ada');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct-password');
    await user.type(screen.getByLabelText('Confirm password'), 'different-password');
    await user.click(screen.getByRole('button', { name: 'Create account', exact: true }));
    expect(auth.signUpWithEmail).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Create account', exact: true }));
    expect(auth.signUpWithEmail).toHaveBeenCalledWith('ada@example.com', 'correct-password', 'Ada');
  });

  it.each([
    ['Google', 'signInWithGoogle'],
    ['GitHub', 'signInWithGitHub'],
  ])('preserves %s sign-in', async (label, operation) => {
    const user = userEvent.setup();
    renderAuth();
    await user.click(screen.getByRole('button', { name: new RegExp(label) }));
    expect(auth[operation]).toHaveBeenCalledOnce();
  });

  it('prefills password reset and reports success after sending', async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reset password' });
    expect(within(dialog).getByRole('textbox', { name: 'Email' }).value).toBe('ada@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Send reset link' }));
    expect(auth.resetPassword).toHaveBeenCalledWith('ada@example.com');
    expect(await screen.findByText('Password reset link sent.')).toBeTruthy();
  });

  it('shows service initialization errors with the usable authentication surface', async () => {
    auth.error = 'Unable to start a secure session. Please sign in again.';
    renderAuth();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', auth.error);
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
  });
});
