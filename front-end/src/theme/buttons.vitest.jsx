import { Button, IconButton } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AddIcon } from '@/components/icons';
import { createDarkTheme } from './darkTheme';

const theme = createDarkTheme();
it.each([
  ['small', 32],
  ['medium', 36],
  ['large', 40],
])('shares %s geometry across variants and links', (size, height) => {
  render(
    <ThemeProvider theme={theme}>
      {['text', 'outlined', 'contained'].map((variant) => (
        <Button key={variant} size={size} variant={variant} startIcon={<AddIcon />}>
          {variant}
        </Button>
      ))}
      <Button component="a" href="#next" size={size}>
        Next
      </Button>
    </ThemeProvider>,
  );
  for (const el of [...screen.getAllByRole('button'), screen.getByRole('link')]) {
    const css = getComputedStyle(el);
    expect(css.minHeight).toBe(`${height}px`);
    expect(css.borderRadius).toBe('9999px');
    expect(css.textTransform).toBe('none');
    expect(css.fontWeight).toBe('400');
  }
});
it('keeps loading content mounted and disables invocation without inserting an icon slot', () => {
  const view = render(
    <ThemeProvider theme={theme}>
      <Button loading={false}>Save changes</Button>
    </ThemeProvider>,
  );
  const button = screen.getByRole('button', { name: 'Save changes' });
  const before = getComputedStyle(button).padding;
  view.rerender(
    <ThemeProvider theme={theme}>
      <Button loading>Save changes</Button>
    </ThemeProvider>,
  );
  expect(button.disabled).toBe(true);
  expect(getComputedStyle(button).color).toBe('rgba(0, 0, 0, 0)');
  expect(button.textContent).toContain('Save changes');
  expect(getComputedStyle(button).padding).toBe(before);
  expect(button.querySelector('.MuiButton-startIcon')).toBeNull();
});
it('retains accessible names and circular shapes on icon actions', () => {
  render(
    <ThemeProvider theme={theme}>
      <IconButton aria-label="Add query">
        <AddIcon />
      </IconButton>
    </ThemeProvider>,
  );
  expect(getComputedStyle(screen.getByRole('button', { name: 'Add query' })).borderRadius).toBe(
    '9999px',
  );
});
it('honors semantic icon colors while disabled controls stay neutral', () => {
  render(
    <ThemeProvider theme={theme}>
      <IconButton color="error" aria-label="Remove">
        <AddIcon />
      </IconButton>
      <IconButton color="error" disabled aria-label="Remove unavailable">
        <AddIcon />
      </IconButton>
    </ThemeProvider>,
  );
  expect(getComputedStyle(screen.getByRole('button', { name: 'Remove' })).color).toBe(
    'rgb(255, 154, 154)',
  );
  expect(
    getComputedStyle(screen.getByRole('button', { name: 'Remove unavailable' })).color,
  ).not.toBe(getComputedStyle(screen.getByRole('button', { name: 'Remove' })).color);
});
