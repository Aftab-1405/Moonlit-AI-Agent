import { render, screen, fireEvent, act } from '@testing-library/react';
import { it, expect } from 'vitest';
import { useLocalStorage } from '@/hooks/useLocalStorage';
const defaults = { size: 12, description: 'default' };
function Probe({ scope }) {
  const [value, setValue] = useLocalStorage(scope, defaults);
  return (
    <>
      <output>{value.size}</output>
      <button onClick={() => setValue((prev) => ({ ...prev, description: 'new' }))}>Edit</button>
    </>
  );
}
it('does not reuse a stale former namespace ref when returning to an account', () => {
  localStorage.clear();
  localStorage.setItem('a', JSON.stringify({ ...defaults, size: 20 }));
  localStorage.setItem('b', JSON.stringify({ ...defaults, size: 9 }));
  const view = render(<Probe scope="a" />);
  view.rerender(<Probe scope="b" />);
  localStorage.setItem('a', JSON.stringify({ ...defaults, size: 24 }));
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'a', newValue: localStorage.getItem('a') }),
    ),
  );
  view.rerender(<Probe scope="a" />);
  expect(screen.getByRole('status').textContent).toBe('24');
  fireEvent.click(screen.getByText('Edit'));
  expect(JSON.parse(localStorage.getItem('a')).size).toBe(24);
});
