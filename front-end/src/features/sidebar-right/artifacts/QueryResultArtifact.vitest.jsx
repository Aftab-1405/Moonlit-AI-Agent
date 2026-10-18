import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getExecutionResult } from '@/api/conversations';
import { createDarkTheme } from '@/theme';
import QueryResultArtifact from './QueryResultArtifact';

vi.mock('@/api/conversations', () => ({ getExecutionResult: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'test' } }) }));

function showResult(props = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={createDarkTheme()}>
        <QueryResultArtifact
          conversationId="c1"
          executionId="e1"
          sourceQuery="select 1 where false"
          chrome="standalone"
          {...props}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('saved execution viewer', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps close and source SQL available for a successful empty result', async () => {
    getExecutionResult.mockResolvedValue({
      status: 'success',
      data: { columns: ['total'], data: [], row_count: 0 },
    });
    const onRequestClose = vi.fn();
    const onRequestOpenArtifact = vi.fn();
    const user = userEvent.setup();
    showResult({ onRequestClose, onRequestOpenArtifact });
    await screen.findByText('No rows returned');
    expect(getExecutionResult).toHaveBeenCalledWith('c1', 'e1');
    await user.click(screen.getByRole('button', { name: 'View SQL' }));
    expect(onRequestOpenArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sql-editor',
        props: {
          initialQuery: 'select 1 where false',
          initialResults: { columns: ['total'], rows: [], column_types: [], row_count: 0 },
        },
      }),
      { preserveFullscreen: false },
    );
    await user.click(screen.getByRole('button', { name: /Close/ }));
    expect(onRequestClose).toHaveBeenCalledOnce();
  });
  it('shows a fetch failure and allows recovery without rerunning SQL', async () => {
    getExecutionResult
      .mockRejectedValueOnce(new Error('Temporarily unavailable'))
      .mockResolvedValueOnce({ status: 'success', data: { columns: [], data: [] } });
    const user = userEvent.setup();
    showResult();
    await screen.findByText('Temporarily unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry loading results' }));
    await screen.findByText('No rows returned');
    expect(getExecutionResult).toHaveBeenCalledTimes(2);
  });
});
