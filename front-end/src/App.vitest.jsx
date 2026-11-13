import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import App from './App';
import { useOverlayState } from '@/hooks/chat-page/useOverlayState';

vi.mock('@/guards/ProtectedRoute', () => ({ default: ({ children }) => children }));
vi.mock('@/guards/AdminRoute', () => ({ default: ({ children }) => children }));
vi.mock('@/pages/ChatWorkspacePage', () => ({ default: () => <Workspace /> }));
vi.mock('@/pages/Auth', () => ({ default: () => <div>Login</div> }));

function Workspace() {
  const { settingsOpen, settingsInitialSection, setSettingsOpen, setSettingsInitialSection } =
    useOverlayState();
  const location = useLocation();
  return (
    <>
      <input aria-label="Chat draft" defaultValue="" />
      <output aria-label="Workspace path">{location.pathname}</output>
      <output aria-label="Settings status">
        {settingsOpen ? settingsInitialSection : 'closed'}
      </output>
      <button onClick={() => setSettingsOpen(true)}>Open settings</button>
      <button onClick={() => setSettingsOpen(true, 'appearance')}>Open appearance action</button>
      <button onClick={() => setSettingsInitialSection('appearance')}>Appearance section</button>
      <button onClick={() => setSettingsOpen(false)}>Return to workspace</button>
    </>
  );
}

function BrowserProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Browser path">{location.pathname}</output>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

it('keeps the workspace mounted and preserves drafts and history across settings routes', async () => {
  render(
    <MemoryRouter initialEntries={['/chat/conversation-1']}>
      <App />
      <BrowserProbe />
    </MemoryRouter>,
  );
  const draft = await screen.findByRole('textbox', { name: 'Chat draft' });
  fireEvent.change(draft, { target: { value: 'Keep this draft' } });
  fireEvent.click(screen.getByText('Open settings'));
  await waitFor(() =>
    expect(screen.getByLabelText('Browser path').textContent).toBe('/settings/general'),
  );
  expect(screen.getByLabelText('Workspace path').textContent).toBe('/chat/conversation-1');
  fireEvent.click(screen.getByText('Appearance section'));
  await waitFor(() =>
    expect(screen.getByLabelText('Browser path').textContent).toBe('/settings/appearance'),
  );
  fireEvent.click(screen.getByText('Back'));
  await waitFor(() => expect(screen.getByLabelText('Settings status').textContent).toBe('general'));
  fireEvent.click(screen.getByText('Forward'));
  await waitFor(() =>
    expect(screen.getByLabelText('Settings status').textContent).toBe('appearance'),
  );
  fireEvent.click(screen.getByText('Return to workspace'));
  await waitFor(() =>
    expect(screen.getByLabelText('Browser path').textContent).toBe('/chat/conversation-1'),
  );
  expect(screen.getByRole('textbox', { name: 'Chat draft' })).toBe(draft);
  expect(draft.value).toBe('Keep this draft');
});

it('opens a settings deep link with a safe chat return destination', async () => {
  render(
    <MemoryRouter initialEntries={['/settings/database']}>
      <App />
      <BrowserProbe />
    </MemoryRouter>,
  );
  expect(await screen.findByLabelText('Settings status')).toHaveProperty('textContent', 'database');
  expect(screen.getByLabelText('Workspace path').textContent).toBe('/chat');
  fireEvent.click(screen.getByText('Return to workspace'));
  await waitFor(() => expect(screen.getByLabelText('Browser path').textContent).toBe('/chat'));
});

it('honors an agent-requested initial section on the first open', async () => {
  render(
    <MemoryRouter initialEntries={['/chat/conversation-2']}>
      <App />
      <BrowserProbe />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByText('Open appearance action'));
  await waitFor(() =>
    expect(screen.getByLabelText('Browser path').textContent).toBe('/settings/appearance'),
  );
  expect(screen.getByLabelText('Settings status').textContent).toBe('appearance');
});
