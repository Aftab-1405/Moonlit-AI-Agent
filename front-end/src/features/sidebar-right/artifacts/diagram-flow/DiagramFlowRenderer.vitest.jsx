import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import DiagramFlowRenderer from './DiagramFlowRenderer';

const flow = vi.hoisted(() => ({ fitView: vi.fn(), setViewport: vi.fn(), renderNodes: false }));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal()),
  Handle: () => null,
  ReactFlow: function Flow({ onInit, nodes, nodeTypes }) {
    useEffect(() => {
      onInit(flow);
    }, [onInit]);
    return (
      <section aria-label="Diagram flow">
        {flow.renderNodes
          ? nodes.map((node) =>
              createElement(nodeTypes[node.type], { key: node.id, data: node.data }),
            )
          : null}
      </section>
    );
  },
}));

afterEach(() => {
  flow.renderNodes = false;
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
    width: 600,
    height: 400,
    top: 0,
    left: 0,
    right: 600,
    bottom: 400,
  });
  const frame = () =>
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => {
        callback();
      });
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

it('honors custom light fills with dark foregrounds and body typography', () => {
  flow.renderNodes = true;
  const code = JSON.stringify({
    nodes: [
      {
        id: 'table',
        type: 'entity',
        label: 'Customers',
        columns: [{ name: 'customer_id', type: 'integer' }],
        style: { backgroundColor: '#fff3c4', color: '#1a1a1a', fontSize: 16 },
      },
    ],
    edges: [],
  });
  const { container } = render(
    <ThemeProvider theme={createDarkTheme()}>
      <DiagramFlowRenderer title="Customer relationships" code={code} />
    </ThemeProvider>,
  );
  const card = container.querySelector('.moonlit-flow-node-card');
  expect(getComputedStyle(card).backgroundColor).toBe('rgb(255, 243, 196)');
  expect(getComputedStyle(card).color).toBe('rgb(26, 26, 26)');
  expect(getComputedStyle(card).fontSize).toBe('16px');
  expect(getComputedStyle(screen.getByText('customer_id')).fontSize).toBe('16px');
  expect(getComputedStyle(screen.getByText('integer')).opacity).toBe('1');
  expect(getComputedStyle(card.querySelector('svg')).color).toBe('rgb(26, 26, 26)');
  expect(screen.getByRole('heading', { name: 'Customer relationships' })).toBeTruthy();
});
