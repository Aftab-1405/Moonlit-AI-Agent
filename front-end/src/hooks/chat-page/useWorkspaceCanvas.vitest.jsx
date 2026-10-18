import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { useWorkspaceCanvas } from './useWorkspaceCanvas';

function cacheWrapper() {
  const client = new QueryClient();
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('conversation canvas ownership', () => {
  it('restores each session and keeps a late completion in its originating session', async () => {
    const { result, rerender } = renderHook(
      ({ sessionKey }) => useWorkspaceCanvas({ sessionKey }),
      { wrapper: cacheWrapper(), initialProps: { sessionKey: 'a' } },
    );
    const completeQueryA = result.current.handleOpenCanvasArtifact;
    act(() =>
      completeQueryA({
        type: 'visualization',
        title: 'Result A',
        props: { sourceQuery: 'select 1', data: { rows: [[1]] } },
      }),
    );
    rerender({ sessionKey: 'b' });
    expect(result.current.workspaceCanvasOpen).toBe(false);
    expect(result.current.workspaceCanvasArtifact).toBeNull();
    expect(result.current.workspaceOutputs).toEqual([]);
    act(() =>
      completeQueryA({
        type: 'visualization',
        title: 'Late A',
        props: { sourceQuery: 'select 2', data: { rows: [[2]] } },
      }),
    );
    expect(result.current.workspaceCanvasOpen).toBe(false);
    act(() => result.current.handleOpenSqlEditor('select 3'));
    await waitFor(() => expect(result.current.workspaceCanvasArtifact).not.toBeNull());
    const cacheB = result.current.workspaceCanvasArtifact.props.workspaceCache;
    rerender({ sessionKey: 'a' });
    expect(result.current.workspaceCanvasArtifact.title).toBe('Late A');
    expect(result.current.workspaceOutputs).toHaveLength(2);
    expect(result.current.workspaceCanvasArtifact.props.workspaceCache).not.toBe(cacheB);
  });

  it('does not duplicate a selected output or discard an explicitly unknown source', async () => {
    const { result } = renderHook(
      () => useWorkspaceCanvas({ sessionKey: 'a', source: { database: 'live' } }),
      { wrapper: cacheWrapper() },
    );
    const artifact = {
      id: 'stored',
      type: 'sql-editor',
      title: 'SQL',
      source: null,
      props: { initialQuery: 'select 1' },
    };
    act(() => result.current.handleOpenCanvasArtifact(artifact));
    act(() => result.current.handleOpenCanvasArtifact(artifact));
    await waitFor(() => expect(result.current.workspaceOutputs).toHaveLength(1));
    expect(result.current.workspaceCanvasArtifact.source).toBeNull();
  });

  it('restores manually authored tabs and outputs after the chat page remounts', async () => {
    const wrapper = cacheWrapper();
    const first = renderHook(() => useWorkspaceCanvas({ sessionKey: 'a' }), { wrapper });
    act(() => first.result.current.handleOpenSqlEditor('select 42'));
    await waitFor(() => expect(first.result.current.workspaceCanvasArtifact).not.toBeNull());
    first.result.current.workspaceCanvasArtifact.props.workspaceCache.set({
      tabs: [{ id: 'draft', query: 'select 43' }],
      activeTabId: 'draft',
    });
    first.unmount();
    const second = renderHook(() => useWorkspaceCanvas({ sessionKey: 'a' }), { wrapper });
    expect(second.result.current.workspaceOutputs).toHaveLength(1);
    expect(
      second.result.current.workspaceCanvasArtifact.props.workspaceCache.get().tabs[0].query,
    ).toBe('select 43');
  });

  it('reuses the SQL output linked to a manual result', async () => {
    const { result } = renderHook(() => useWorkspaceCanvas({ sessionKey: 'a' }), {
      wrapper: cacheWrapper(),
    });
    const sql = {
      id: 'result-1:sql',
      type: 'sql-editor',
      props: { initialQuery: 'select 1', initialResults: { rows: [[1]] } },
    };
    act(() => result.current.handleOpenCanvasArtifact(sql));
    act(() => result.current.handleOpenCanvasArtifact(sql));
    await waitFor(() => expect(result.current.workspaceOutputs).toHaveLength(1));
  });
});

it('bounds resizing to the available space and preserves a usable chat column', () => {
  const originalWidth = window.innerWidth;
  try {
    for (const viewport of [900, 1200, 1536]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport });
      for (const sidebarWidth of [52, 344]) {
        const { result, unmount } = renderHook(() => useWorkspaceCanvas({ sidebarWidth }), {
          wrapper: cacheWrapper(),
        });
        act(() => result.current.handleCanvasResize(-10000));
        const remaining = viewport - sidebarWidth;
        expect(result.current.workspaceCanvasWidth).toBeLessThanOrEqual(
          remaining - Math.min(360, remaining / 2),
        );
        expect(result.current.workspaceCanvasWidth).toBeGreaterThan(0);
        unmount();
      }
    }
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  }
});
