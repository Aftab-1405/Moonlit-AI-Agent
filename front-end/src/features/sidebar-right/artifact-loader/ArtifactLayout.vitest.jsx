import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CloseIcon } from '@/components/icons';
import { createDarkTheme } from '@/theme';
import ArtifactShell from './ArtifactLayout';

it('exposes fullscreen state, supports keyboard actions, and keeps disabled actions inert', async () => {
  const user = userEvent.setup();
  const onEnter = vi.fn();
  const onExit = vi.fn();
  const onClose = vi.fn();
  const onDisabled = vi.fn();
  const content = (isFullscreen) => (
    <ThemeProvider theme={createDarkTheme()}>
      <ArtifactShell title="Result" isFullscreen={isFullscreen}
        onEnterFullscreen={onEnter} onExitFullscreen={onExit} onClose={onClose}
        actions={[{ label: 'Unavailable action', icon: <CloseIcon />, disabled: true, onClick: onDisabled }]}>
        Result content
      </ArtifactShell>
    </ThemeProvider>
  );
  const view = render(content(false));
  const fullscreen = screen.getByRole('button', { name: 'Fullscreen', pressed: false });
  await user.tab();
  expect(document.activeElement).toBe(fullscreen);
  await user.keyboard('{Enter}');
  expect(onEnter).toHaveBeenCalledOnce();
  view.rerender(content(true));
  await user.click(screen.getByRole('button', { name: 'Exit fullscreen', pressed: true }));
  expect(onExit).toHaveBeenCalledOnce();
  const unavailable = screen.getByRole('button', { name: 'Unavailable action' });
  expect(unavailable.disabled).toBe(true);
  fireEvent.click(unavailable);
  expect(onDisabled).not.toHaveBeenCalled();
  const close = screen.getByRole('button', { name: 'Close artifact' });
  expect(close.hasAttribute('aria-pressed')).toBe(false);
  await user.click(close);
  expect(onClose).toHaveBeenCalledOnce();
});
