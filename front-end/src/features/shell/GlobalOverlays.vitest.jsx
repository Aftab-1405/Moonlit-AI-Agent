import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import GlobalOverlays from './GlobalOverlays';

const loads = vi.hoisted(() => ({ database: vi.fn(), settings: vi.fn() }));
vi.mock('@/features/overlays/database/DatabaseModal', () => {
  loads.database();
  return {
    default: ({ open, onConnect }) => (
      <div hidden={!open}>
        <input aria-label="Connection draft" defaultValue="" />
        <button type="button" onClick={onConnect}>
          Connect test
        </button>
      </div>
    ),
  };
});
vi.mock('@/features/overlays/settings/SettingsModal', () => {
  loads.settings();
  return {
    default: ({ open, onClose, initialSection }) => (
      <div hidden={!open}>
        <span>{initialSection}</span>
        <button type="button" onClick={onClose}>
          Close test settings
        </button>
      </div>
    ),
  };
});
vi.mock('@/features/overlays/mindmap', () => ({ default: () => null }));
vi.mock('@/components/common/ToastStack', () => ({ default: () => null }));
vi.mock('@/components', () => ({ ConfirmDialog: () => null }));

it('loads dialogs on first opening, preserves drafts, and receives fresh callback/section props', async () => {
  const user = userEvent.setup();
  const onConnect = vi.fn();
  const onClose = vi.fn();
  const theme = createDarkTheme();
  const content = (props = {}) => (
    <ThemeProvider theme={theme}>
      <GlobalOverlays
        theme={theme}
        dbModalOpen={false}
        settingsOpen={false}
        confirmDialog={{ open: false }}
        deleteConversationDialog={{ open: false }}
        {...props}
      />
    </ThemeProvider>
  );
  const view = render(content());
  expect(loads.database).not.toHaveBeenCalled();
  expect(loads.settings).not.toHaveBeenCalled();
  view.rerender(content({ dbModalOpen: true }));
  const draft = await screen.findByRole('textbox', { name: 'Connection draft' });
  await user.type(draft, 'saved draft');
  expect(loads.settings).not.toHaveBeenCalled();
  view.rerender(content());
  view.rerender(content({ dbModalOpen: true, handleDbConnect: onConnect }));
  expect(screen.getByRole('textbox').value).toBe('saved draft');
  await user.click(screen.getByRole('button', { name: 'Connect test' }));
  expect(onConnect).toHaveBeenCalledOnce();
  view.rerender(content({ settingsOpen: true, settingsInitialSection: 'ai' }));
  await screen.findByText('ai');
  view.rerender(
    content({
      settingsOpen: true,
      settingsInitialSection: 'database',
      handleCloseSettings: onClose,
    }),
  );
  expect(screen.getByText('database')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Close test settings' }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(loads.database).toHaveBeenCalledOnce();
  expect(loads.settings).toHaveBeenCalledOnce();
});
