import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import ConversationOutputs from './ConversationOutputs';

it('uses recorded sources in the pinned summary and opens the exact selected output', async () => {
  const output = {
    id: 'saved-result',
    type: 'query-result',
    title: 'Monthly revenue',
    source: { database: 'historical_db', schema: 'reporting' },
    props: { sourceQuery: 'SELECT private_column FROM totals' },
  };
  const onSelect = vi.fn();
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <ConversationOutputs variant="summary" outputs={[output]} onSelect={onSelect} />
    </ThemeProvider>,
  );
  expect(screen.getByRole('complementary', { name: 'Outputs and sources' })).toBeTruthy();
  expect(screen.getByText('historical_db · reporting')).toBeTruthy();
  expect(screen.queryByText(output.props.sourceQuery)).toBeNull();
  await userEvent.setup().click(screen.getByRole('menuitemradio', { name: 'Monthly revenue' }));
  expect(onSelect).toHaveBeenCalledWith(output);
});
