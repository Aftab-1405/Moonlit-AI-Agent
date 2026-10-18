import { useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import DiagramFlowRenderer from './DiagramFlowRenderer';

const flow = vi.hoisted(() => ({ fitView: vi.fn(), setViewport: vi.fn() }));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal()),
  ReactFlow: function Flow({ onInit }) {
    useEffect(() => { onInit(flow); }, [onInit]);
    return <div aria-label="Diagram flow" />;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reveals the diagram when a layout change interrupts the first-fit reveal frame', () => {
  const frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400,
  });
  const frame = () => act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  });
  const theme = createDarkTheme();
  const diagram = JSON.stringify({ nodes: [{ id: 'start', label: 'Start' }], edges: [] });
  const viewFor = (isFullscreen) => (
    <ThemeProvider theme={theme}>
      <DiagramFlowRenderer code={diagram} isFullscreen={isFullscreen} />
    </ThemeProvider>
  );
  const view = render(viewFor(false));
  frame();
  frame();
  expect(flow.fitView).toHaveBeenCalled();
  // Resize/fullscreen arrives between the fit and the scheduled reveal.
  view.rerender(viewFor(true));
  frame();
  frame();
  frame();
  expect(getComputedStyle(screen.getByLabelText('Diagram flow').parentElement).opacity).toBe('1');
});
