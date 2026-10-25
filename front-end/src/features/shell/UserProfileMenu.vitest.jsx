import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UserProfileMenu from '@/features/shell/UserProfileMenu';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();

describe('UserProfileMenu account actions', () => {
  it('keeps settings accessible without duplicating dashboard navigation', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <button type="button">Profile trigger</button>
        <UserProfileMenu
          anchorEl={document.querySelector('button')}
          open
          onClose={() => {}}
          onOpenSettings={onOpenSettings}
          onLogout={() => {}}
          user={{ displayName: 'Ada Lovelace', email: 'ada@example.com', providers: ['Google'] }}
          sidebarExpanded={false}
          theme={theme}
        />
      </ThemeProvider>,
    );

    expect(screen.queryByRole('menuitem', { name: /dashboard/i })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: /settings/i }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});

it('preserves account details and both actions in the full-height sidebar profile', async () => {
  const interactions = userEvent.setup();
  const onOpenSettings = vi.fn();
  const onLogout = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <UserProfileMenu
        inline
        open
        sidebarExpanded
        theme={theme}
        user={{
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
          providers: ['Google'],
          emailVerified: false,
          createdAt: '2026-07-12T12:00:00Z',
          lastSignInAt: '2026-10-18T12:00:00Z',
        }}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
    </ThemeProvider>,
  );
  expect(screen.getByText('Ada Lovelace')).toBeTruthy();
  expect(screen.getByText('ada@example.com')).toBeTruthy();
  expect(screen.getByText('Google')).toBeTruthy();
  expect(screen.getByText('Not verified')).toBeTruthy();
  expect(screen.getByText('Member since')).toBeTruthy();
  expect(screen.getByText('Last sign-in')).toBeTruthy();
  await interactions.click(screen.getByRole('menuitem', { name: 'Settings' }));
  await interactions.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(onOpenSettings).toHaveBeenCalledOnce();
  expect(onLogout).toHaveBeenCalledOnce();
});

it('resolves a failed profile image to initials and keeps missing account slots', () => {
  const original = globalThis.Image;
  let image;
  globalThis.Image = class {
    constructor() {
      image = this;
    }
  };
  try {
    const view = render(
      <ThemeProvider theme={theme}>
        <UserProfileMenu
          inline
          theme={theme}
          user={{ displayName: 'Ada Lovelace', photoURL: '/failed-avatar.png' }}
        />
      </ThemeProvider>,
    );
    expect(view.container.querySelector('[data-sidebar-skeleton]')).toBeTruthy();
    expect(screen.getAllByText('Not available')).toHaveLength(5);
    act(() => image.onerror());
    expect(view.container.querySelector('[data-sidebar-skeleton]')).toBeNull();
    expect(screen.getByText('AL')).toBeTruthy();
    view.unmount();
    expect(image.onerror).toBeNull();
  } finally {
    globalThis.Image = original;
  }
});
