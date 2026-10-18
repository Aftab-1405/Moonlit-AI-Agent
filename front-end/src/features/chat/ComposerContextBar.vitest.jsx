import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ComposerContextBar from './ComposerContextBar';
import { createDarkTheme } from '@/theme';

describe('composer database context', () => {
  it('filters choices and switches only the selected database', async () => {
    const user = userEvent.setup();
    const onDatabaseSwitch = vi.fn();
    render(
      <ThemeProvider theme={createDarkTheme()}>
        <ComposerContextBar
          isConnected
          currentDatabase="sales"
          dbType="postgresql"
          currentSchema="public"
          availableDatabases={['sales', 'analytics']}
          availableSchemas={['public']}
          onDatabaseSwitch={onDatabaseSwitch}
        />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Database: sales' }));
    await user.type(screen.getByRole('textbox', { name: 'Search databases' }), 'ANAL');
    expect(screen.queryByRole('menuitemradio', { name: 'sales' })).toBeNull();
    await user.click(screen.getByRole('menuitemradio', { name: 'analytics' }));
    expect(onDatabaseSwitch).toHaveBeenCalledExactlyOnceWith('analytics');
  });
  it('provides connection setup when disconnected and prevents context switching during a run', async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    const view = render(
      <ThemeProvider theme={createDarkTheme()}>
        <ComposerContextBar onOpenDatabase={connect} />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Connect database' }));
    expect(connect).toHaveBeenCalledOnce();
    view.rerender(
      <ThemeProvider theme={createDarkTheme()}>
        <ComposerContextBar isConnected isStreaming currentDatabase="sales" />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Database: sales' }).disabled).toBe(true);
  });
});
