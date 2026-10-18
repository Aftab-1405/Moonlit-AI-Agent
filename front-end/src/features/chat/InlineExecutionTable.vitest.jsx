import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getExecutionResult } from '@/api/conversations';
import InlineExecutionTable from '@/features/chat/InlineExecutionTable';
import { createDarkTheme } from '@/theme';

vi.mock('@/api/conversations', () => ({
  getExecutionResult: vi.fn(),
}));

vi.mock('material-react-table', () => ({
  MaterialReactTable: () => <div data-testid="result-table" />,
  useMaterialReactTable: (options) => options,
}));

const theme = createDarkTheme();

function renderExecutionTable(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <InlineExecutionTable conversationId="conversation-1" executionId="execution-1" {...props} />
    </ThemeProvider>,
  );
}

describe('InlineExecutionTable result motion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the same saved execution and source SQL from the inline table', async () => {
    getExecutionResult.mockResolvedValue({
      status: 'success',
      data: { columns: ['total'], data: [[1]] },
    });
    const onOpenArtifact = vi.fn();
    const user = userEvent.setup();
    renderExecutionTable({ onOpenArtifact, sourceQuery: 'select 1' });
    await user.click(await screen.findByRole('button', { name: 'Explore query results' }));
    expect(onOpenArtifact).toHaveBeenCalledWith({
      id: 'execution:conversation-1:execution-1',
      type: 'query-result',
      title: 'Query results',
      source: null,
      props: {
        conversationId: 'conversation-1',
        executionId: 'execution-1',
        sourceQuery: 'select 1',
      },
    });
  });

  it('reveals a live result once after the loading state resolves', async () => {
    let resolveResult;
    getExecutionResult.mockReturnValue(
      new Promise((resolve) => {
        resolveResult = resolve;
      }),
    );
    renderExecutionTable({ animateEntry: true });

    expect(screen.getByRole('status', { name: 'Loading query results' })).not.toBeNull();

    await act(async () => {
      resolveResult({ status: 'success', data: { data: [], columns: [] } });
    });

    const emptyState = await screen.findByText('No rows returned');
    expect(emptyState.closest('[data-result-motion]')?.getAttribute('data-result-motion')).toBe(
      'live',
    );
  });

  it('keeps a result from stored history static', async () => {
    getExecutionResult.mockResolvedValue({
      status: 'success',
      data: { data: [], columns: [] },
    });
    renderExecutionTable({ animateEntry: false });

    const emptyState = await screen.findByText('No rows returned');
    expect(emptyState.closest('[data-result-motion]')?.getAttribute('data-result-motion')).toBe(
      'static',
    );
  });
});
