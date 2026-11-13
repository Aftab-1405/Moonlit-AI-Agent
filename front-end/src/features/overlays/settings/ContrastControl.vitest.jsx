import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import ContrastControl from './ContrastControl';
it('touch cancellation should restore preview and suppress later blur commit', async () => {
  const change = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  render(
    React.createElement(ContrastControl, {
      value: 50,
      label: 'Contrast',
      onChange: change,
      onPreview: preview,
      onCancelPreview: cancel,
    }),
  );
  const input = screen.getByRole('slider', { name: 'Contrast' }),
    rail = input.closest('.MuiSlider-root');
  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 20,
    right: 100,
    bottom: 20,
  });
  const point = { identifier: 1, clientX: 70, clientY: 10 };
  fireEvent.touchStart(rail, { changedTouches: [point], touches: [point] });
  fireEvent.touchMove(document, { changedTouches: [point], touches: [point] });
  await waitFor(() => expect(preview).toHaveBeenCalledWith(70));
  fireEvent.touchCancel(rail, { changedTouches: [point], touches: [] });
  fireEvent.blur(input);
  fireEvent.touchEnd(document, { changedTouches: [point], touches: [] });
  expect(change).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});
