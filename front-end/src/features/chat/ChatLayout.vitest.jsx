import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import ChatLayout from './ChatLayout';

const theme = createDarkTheme();

function Draft() {
  const [value, setValue] = useState('');
  return (
    <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />
  );
}

it('preserves composer and transcript nodes through placement and output changes', async () => {
  const user = userEvent.setup();
  const scrollRef = vi.fn();
  const layout = (placement, outputs) => (
    <ThemeProvider theme={theme}>
      <ChatLayout
        placement={placement}
        transcriptVisible={placement === 'active'}
        scrollContainerRef={scrollRef}
        header={<h1>Conversation</h1>}
        welcome={<p>Welcome</p>}
        outputs={outputs}
        composer={<Draft />}
        suggestions={<button type="button">Suggested question</button>}
      >
        <article>Saved message</article>
      </ChatLayout>
    </ThemeProvider>
  );
  const view = render(layout('welcome', null));
  const input = screen.getByRole('textbox', { name: 'Draft' });
  const scrollContainer = scrollRef.mock.calls[0][0];
  expect(scrollContainer.getAttribute('aria-hidden')).toBe('true');
  await user.type(input, 'Keep this draft');

  view.rerender(layout('active', <button type="button">SQL output</button>));
  const transcript = screen.getByRole('article');
  expect(scrollContainer.contains(transcript)).toBe(true);
  expect(scrollContainer.hasAttribute('aria-hidden')).toBe(false);
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
  expect(input.value).toBe('Keep this draft');
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole('button', { name: 'SQL output' })).toBeTruthy();

  view.rerender(layout('active', null));
  expect(screen.getByRole('article')).toBe(transcript);
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
  expect(scrollRef).toHaveBeenCalledTimes(1);
});
