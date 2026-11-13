import { Button, MenuItem, MenuList, Select } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import AppPopover, { AppPopoverItem } from '@/components/common/AppPopover';
import DialogShell from '@/components/common/DialogShell';
import { createDarkTheme } from '@/theme';

function PopupFixture({ onAction = () => {} }) {
  const [value, setValue] = useState('Balanced');
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <Select
        value={value}
        onChange={(event) => setValue(event.target.value)}
        inputProps={{ 'aria-label': 'Response style' }}
      >
        {['Concise', 'Balanced', 'Detailed'].map((label) => (
          <MenuItem key={label} value={label}>
            {label}
          </MenuItem>
        ))}
      </Select>
      <Button onClick={(event) => setAnchor(event.currentTarget)}>Actions</Button>
      <AppPopover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        width={240}
      >
        <MenuList autoFocusItem={Boolean(anchor)} aria-label="Actions menu" sx={{ p: 0 }}>
          <AppPopoverItem
            label="Rename"
            onClick={() => {
              onAction();
              setAnchor(null);
            }}
          />
          <AppPopoverItem label="Delete" tone="error" />
          <AppPopoverItem label="Unavailable action" disabled />
        </MenuList>
      </AppPopover>
    </>
  );
}
const surfaceStyle = (paper) => {
  const s = getComputedStyle(paper);
  return {
    radius: s.borderRadius,
    background: s.backgroundColor,
    border: s.borderTopWidth,
    shadow: s.boxShadow,
  };
};

it('uses the same measured surface and row geometry for a native dropdown and click-open menu', async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <PopupFixture />
    </ThemeProvider>,
  );
  await user.click(screen.getByRole('combobox', { name: 'Response style' }));
  const list = screen.getByRole('listbox');
  const dropdown = surfaceStyle(list.closest('.MuiPaper-root'));
  expect(dropdown.radius).toBe('16px');
  expect(dropdown.background).toBe('rgba(33, 33, 33, 0.9)');
  expect(dropdown.border).toBe('0px');
  const option = getComputedStyle(screen.getByRole('option', { name: 'Balanced' }));
  expect(option.borderRadius).toBe('12px');
  expect(option.fontSize).toBe('14px');
  expect(option.minHeight).toBe('36px');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  const menu = screen.getByRole('menu', { name: 'Actions menu' });
  const paper = menu.closest('.MuiPaper-root');
  expect(surfaceStyle(paper)).toEqual(dropdown);
  const row = getComputedStyle(screen.getByRole('menuitem', { name: 'Rename' }));
  expect(row.borderRadius).toBe(option.borderRadius);
  expect(row.minHeight).toBe(option.minHeight);
  expect(getComputedStyle(screen.getByText('Delete')).color).toBe('rgb(255, 154, 154)');
});

it('retains native selection, action activation, disabled rows, and Escape focus return', async () => {
  const user = userEvent.setup(),
    onAction = vi.fn();
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <PopupFixture onAction={onAction} />
    </ThemeProvider>,
  );
  const select = screen.getByRole('combobox', { name: 'Response style' });
  await user.click(select);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(select.textContent).toContain('Detailed');
  const trigger = screen.getByRole('button', { name: 'Actions' });
  await user.click(trigger);
  expect(
    screen.getByRole('menuitem', { name: 'Unavailable action' }).getAttribute('aria-disabled'),
  ).toBe('true');
  await user.keyboard('{Enter}');
  expect(onAction).toHaveBeenCalledOnce();
  await user.click(trigger);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('keeps full-size dialogs opaque when popup surfaces become translucent', () => {
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <DialogShell
        open
        headerTitle="Confirm"
        ariaLabelledBy="confirm-title"
        headerTitleId="confirm-title"
      >
        Details
      </DialogShell>
    </ThemeProvider>,
  );
  const paper = screen.getByRole('dialog');
  expect(getComputedStyle(paper).backgroundColor).toBe('rgb(24, 24, 24)');
  expect(getComputedStyle(paper).boxShadow).toBe('none');
});
