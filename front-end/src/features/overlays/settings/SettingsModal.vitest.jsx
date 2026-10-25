import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { defaultUserSettings } from '@/config/userSettings';
import { createDarkTheme } from '@/theme';
import SettingsModal from './SettingsModal';

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    settings: defaultUserSettings,
    updateSetting: vi.fn(),
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
  }),
}));
vi.mock('./UserDBContextManagerForAI', () => ({ default: () => <div>Context settings</div> }));

it('updates the selected section and close callback while already open', async () => {
  const user = userEvent.setup();
  const oldClose = vi.fn();
  const newClose = vi.fn();
  const content = (section, onClose) => (
    <ThemeProvider theme={createDarkTheme()}>
      <SettingsModal open initialSection={section} onClose={onClose} />
    </ThemeProvider>
  );
  const view = render(content('ai', oldClose));
  await screen.findByText('AI Settings');
  view.rerender(content('database', newClose));
  await screen.findByText('Database Settings');
  await user.click(screen.getByRole('button', { name: /close/i }));
  expect(newClose).toHaveBeenCalledOnce();
  expect(oldClose).not.toHaveBeenCalled();
});
