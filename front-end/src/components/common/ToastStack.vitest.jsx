import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import ToastStack from './ToastStack';

const theme = createDarkTheme();
const first = { id: 'first', title: 'First notice', duration: 1000 };
const sibling = { id: 'sibling', title: 'Sibling notice', duration: 5000 };
const content = (notifications, removeToast) => (
  <ThemeProvider theme={theme}>
    <ToastStack notifications={notifications} removeToast={removeToast} />
  </ThemeProvider>
);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('keeps the original expiry when a sibling is added and removed', () => {
  const removeToast = vi.fn();
  const view = render(content([first], removeToast));
  act(() => vi.advanceTimersByTime(300));
  view.rerender(content([first, sibling], removeToast));
  act(() => vi.advanceTimersByTime(300));
  view.rerender(content([first], removeToast));
  act(() => vi.advanceTimersByTime(399));
  expect(removeToast).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(removeToast).toHaveBeenCalledExactlyOnceWith('first');
});

it('uses the latest removal callback without extending expiry', () => {
  const originalRemove = vi.fn();
  const latestRemove = vi.fn();
  const view = render(content([first], originalRemove));
  act(() => vi.advanceTimersByTime(500));
  view.rerender(content([first], latestRemove));
  act(() => vi.advanceTimersByTime(500));
  expect(originalRemove).not.toHaveBeenCalled();
  expect(latestRemove).toHaveBeenCalledExactlyOnceWith('first');
});

it('renders a persistent zero-duration notice without stray zero text and allows dismissal', () => {
  const removeToast = vi.fn();
  render(content([{ ...first, duration: 0 }], removeToast));
  expect(screen.getByRole('status').textContent).toBe('First notice');
  act(() => vi.advanceTimersByTime(10000));
  expect(removeToast).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(removeToast).toHaveBeenCalledExactlyOnceWith('first');
});
