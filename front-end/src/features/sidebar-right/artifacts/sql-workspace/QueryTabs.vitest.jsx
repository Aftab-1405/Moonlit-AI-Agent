import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import QueryTabs from './QueryTabs';

it('supports roving focus, wraparound, Home/End, and independent close/add controls', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const onAdd = vi.fn();
  function Harness() {
    const [active, setActive] = useState('a');
    return (
      <ThemeProvider theme={createDarkTheme()}>
        <QueryTabs
          tabs={[
            { id: 'a', title: 'One' },
            { id: 'b', title: 'Two' },
            { id: 'c', title: 'Three' },
          ]}
          activeTabId={active}
          onTabChange={setActive}
          onTabClose={onClose}
          onTabAdd={onAdd}
          schemaSidebarOpen
        />
      </ThemeProvider>
    );
  }
  render(<Harness />);
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  await user.tab();
  expect(document.activeElement).toBe(tabs[0]);
  await user.keyboard('{ArrowLeft}');
  expect(document.activeElement).toBe(tabs[2]);
  expect(tabs[2].getAttribute('aria-selected')).toBe('true');
  await user.keyboard('{ArrowRight}{ArrowRight}');
  expect(document.activeElement).toBe(tabs[1]);
  await user.keyboard('{End}');
  expect(document.activeElement).toBe(tabs[2]);
  await user.keyboard('{Home}');
  expect(document.activeElement).toBe(tabs[0]);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close One' }));
  await user.keyboard('{Enter}');
  expect(onClose).toHaveBeenCalledWith('a');
  await user.click(screen.getByRole('button', { name: 'Create new query' }));
  expect(onAdd).toHaveBeenCalledOnce();
});
