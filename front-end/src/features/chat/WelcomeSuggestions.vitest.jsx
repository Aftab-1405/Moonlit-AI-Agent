import { ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import WelcomeSuggestions from './WelcomeSuggestions';
import { getWelcomeCategories } from './welcomeSuggestions';

function Suggestions({ onActivate, connected = true, disabled = false }) {
  const [active, setActive] = useState(null);
  return (
    <ThemeProvider theme={createDarkTheme()}>
      <WelcomeSuggestions
        categories={getWelcomeCategories(connected)}
        activeCategoryId={active}
        onCategoryChange={setActive}
        onActivate={onActivate}
        disabled={disabled}
        canOpenDatabase
      />
    </ThemeProvider>
  );
}

it('opens a category without sending and restores keyboard focus when closed', async () => {
  const user = userEvent.setup();
  const onActivate = vi.fn(() => true);
  render(<Suggestions onActivate={onActivate} />);
  const categories = screen.getByRole('list', { name: 'Prompt categories' });
  expect(getComputedStyle(categories).flexWrap).toBe('wrap');
  expect(getComputedStyle(categories).justifyContent).toBe('center');
  await user.click(screen.getByRole('button', { name: 'Write SQL' }));
  const entry = await screen.findByRole('button', { name: 'Draft a read-only query' });
  expect(onActivate).not.toHaveBeenCalled();
  await waitFor(() => expect(entry.closest('[aria-busy]')).toBeNull());
  entry.focus();
  await user.keyboard('{Escape}');
  const category = await screen.findByRole('button', { name: 'Write SQL' });
  await waitFor(() => expect(document.activeElement).toBe(category));
});

it('activates the selected prompt once and returns to chips', async () => {
  const user = userEvent.setup();
  const onActivate = vi.fn(() => true);
  render(<Suggestions onActivate={onActivate} />);
  await user.click(screen.getByRole('button', { name: 'Write SQL' }));
  const entry = await screen.findByRole('button', { name: 'Draft a read-only query' });
  await waitFor(() => expect(entry.closest('[aria-busy]')).toBeNull());
  await user.click(entry);
  expect(onActivate).toHaveBeenCalledOnce();
  expect(onActivate.mock.calls[0][0].type).toBe('prompt');
  await screen.findByRole('list', { name: 'Prompt categories' });
});

it('keeps database setup available when prompt sending is disabled', () => {
  render(<Suggestions onActivate={vi.fn()} connected={false} disabled />);
  expect(screen.getByRole('button', { name: 'Connect database' }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Plan a query' }).disabled).toBe(true);
});
