import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UserProfileMenu from '@/features/shell/UserProfileMenu';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();

describe('UserProfileMenu dashboard navigation', () => {
  it('offers dashboard navigation independently from settings', async () => {
    const user = userEvent.setup();
    const onOpenDashboard = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <button type="button">Profile trigger</button>
        <UserProfileMenu
          anchorEl={document.querySelector('button')}
          open
          onClose={() => {}}
          onOpenDashboard={onOpenDashboard}
          onOpenSettings={() => {}}
          onLogout={() => {}}
          user={{ displayName: 'Ada Lovelace', email: 'ada@example.com', providers: ['Google'] }}
          sidebarExpanded
          theme={theme}
        />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('menuitem', { name: /dashboard/i }));

    expect(onOpenDashboard).toHaveBeenCalledOnce();
  });
});
