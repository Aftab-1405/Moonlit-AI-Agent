import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { CloseIcon } from '@/components/icons';
import { createDarkTheme } from '@/theme';
import ArtifactShell, {
  ArtifactCanvasPanel,
  ArtifactLoadingState,
  ArtifactPanelOverlay,
  ArtifactUtilityPanel,
} from './ArtifactLayout';

it('exposes fullscreen state, supports keyboard actions, and keeps disabled actions inert', async () => {
  const user = userEvent.setup();
  const onEnter = vi.fn();
  const onExit = vi.fn();
  const onClose = vi.fn();
  const onDisabled = vi.fn();
  const content = (isFullscreen) => (
    <ThemeProvider theme={createDarkTheme()}>
      <ArtifactShell
        title="Result"
        isFullscreen={isFullscreen}
        onEnterFullscreen={onEnter}
        onExitFullscreen={onExit}
        onClose={onClose}
        actions={[
          { label: 'Unavailable action', icon: <CloseIcon />, disabled: true, onClick: onDisabled },
        ]}
      >
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('combines the title, output selector and actions on one neutral header', async () => {
  const onExport = vi.fn();
  const user = userEvent.setup();
  const { container } = render(
    <ThemeProvider theme={createDarkTheme()}>
      <ArtifactShell
        title="Sales analysis"
        outputsSlot={<button type="button">Outputs · 3</button>}
        actions={[
          {
            key: 'export',
            label: 'Export image',
            icon: <CloseIcon />,
            placement: 'overflow',
            onClick: onExport,
          },
        ]}
      >
        <div>Viewer</div>
      </ArtifactShell>
    </ThemeProvider>,
  );
  const headers = container.querySelectorAll('[data-artifact-header]');
  expect(headers).toHaveLength(1);
  expect(getComputedStyle(headers[0]).borderBottomWidth).not.toBe('1px');
  expect(headers[0].contains(screen.getByRole('button', { name: 'Outputs · 3' }))).toBe(true);
  expect(getComputedStyle(headers[0]).backgroundColor).toBe(
    'var(--mui-palette-background-default)',
  );
  expect(createDarkTheme().palette.background.default).toBe('#000000');
  expect(screen.queryByRole('menuitem', { name: 'Export image' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'More artifact actions' }));
  await user.click(screen.getByRole('menuitem', { name: 'Export image' }));
  expect(onExport).toHaveBeenCalledOnce();
});

it('moves primary actions into overflow by panel width while retaining fullscreen and close', async () => {
  let width = 600;
  const callbacks = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width,
    height: 52,
    top: 0,
    left: 0,
    right: width,
    bottom: 52,
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const onCopy = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <ArtifactShell
        title="Diagram"
        onClose={() => {}}
        onEnterFullscreen={() => {}}
        actions={[{ label: 'Copy code', icon: <CloseIcon />, onClick: onCopy }]}
      >
        Diagram content
      </ArtifactShell>
    </ThemeProvider>,
  );
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
  width = 360;
  act(() =>
    callbacks.forEach((callback) => {
      callback();
    }),
  );
  expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Close artifact' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'More artifact actions' }));
  await user.click(screen.getByRole('menuitem', { name: 'Copy code' }));
  expect(onCopy).toHaveBeenCalledOnce();
});

it('shares panel geometry across surface roles and forwards refs and semantics', () => {
  const theme = createDarkTheme();
  const ref = createRef();
  const show = () => (
    <ThemeProvider theme={theme}>
      <ArtifactCanvasPanel ref={ref} data-testid="canvas" aria-label="Diagram canvas">
        <ArtifactPanelOverlay>
          <ArtifactLoadingState title="Loading diagram" />
        </ArtifactPanelOverlay>
      </ArtifactCanvasPanel>
      <ArtifactUtilityPanel
        data-testid="utility"
        role="tabpanel"
        aria-label="Query editor"
        sx={{ width: 240 }}
      />
    </ThemeProvider>
  );
  const view = render(show());
  const canvas = screen.getByTestId('canvas');
  const utility = screen.getByRole('tabpanel', { name: 'Query editor' });
  expect(ref.current).toBe(canvas);
  expect(screen.getByRole('status').textContent).toContain('Loading diagram');
  for (const panel of [canvas, utility]) {
    expect(getComputedStyle(panel).borderRadius).toBe('12px');
    expect(getComputedStyle(panel).overflow).toBe('hidden');
    expect(getComputedStyle(panel).boxSizing).toBe('border-box');
  }
  expect(getComputedStyle(canvas).backgroundColor).toBe('var(--mui-palette-background-default)');
  expect(getComputedStyle(utility).backgroundColor).toBe('var(--mui-palette-background-paper)');
  theme.shape.radius = { ...theme.shape.radius, artifactPanel: 18 };
  view.rerender(show());
  for (const panel of [canvas, utility]) expect(getComputedStyle(panel).borderRadius).toBe('18px');
  expect(ref.current).toBe(canvas);
});
