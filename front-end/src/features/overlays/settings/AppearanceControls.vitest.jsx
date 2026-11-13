import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { ColorControl } from './AppearanceControls';
function Controlled({ initial = '#000000', change = () => {} }) {
  const [profile, setProfile] = useState({ value: initial });
  const value = profile.value;
  return (
    <>
      <ColorControl
        label="Background"
        value={value}
        resetKey={profile}
        onChange={(hex) => {
          change(hex);
          setProfile({ value: hex });
        }}
      />
      <button onClick={() => setProfile({ value: '#FF0000' })}>External reset</button>
    </>
  );
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Background color' }));
const dimension = (name, value) =>
  fireEvent.change(screen.getByRole('slider', { name }), { target: { value } });
it.each([
  '#000000',
  '#FFFFFF',
  '#808080',
])('retains a blue hue from %s through achromatic self-commits and then produces blue', (initial) => {
  const change = vi.fn();
  render(<Controlled initial={initial} change={change} />);
  open();
  expect(document.querySelector('input[type="color"]')).toBeNull();
  dimension('Hue', 240);
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole('slider', { name: 'Hue' }).value).toBe('240');
  dimension('Saturation', 100);
  dimension('Brightness', 100);
  expect(screen.getByRole('textbox', { name: 'Background picker hex' }).value).toBe('#0000FF');
  dimension('Saturation', 0);
  expect(screen.getByRole('slider', { name: 'Hue' }).value).toBe('240');
  dimension('Saturation', 100);
  expect(screen.getByRole('textbox', { name: 'Background picker hex' }).value).toBe('#0000FF');
});
it('changes a pastel hue without changing saturation or brightness and honors external resets', () => {
  render(<Controlled initial="#CC9999" />);
  open();
  dimension('Hue', 240);
  expect(screen.getByRole('textbox', { name: 'Background picker hex' }).value).toBe('#9999CC');
  expect(screen.getByRole('slider', { name: 'Saturation' }).value).toBe('25');
  fireEvent.click(screen.getByRole('button', { name: 'External reset', hidden: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  open();
  expect(screen.getByRole('slider', { name: 'Hue' }).value).toBe('0');
  expect(screen.getByRole('textbox', { name: 'Background picker hex' }).value).toBe('#FF0000');
});
it('normalizes hex once on Enter and blur, rejects incomplete drafts and suppresses no-ops', () => {
  const change = vi.fn();
  render(<ColorControl label="Background" value="#000000" onChange={change} />);
  const input = screen.getByRole('textbox', { name: 'Background' });
  fireEvent.change(input, { target: { value: '#12' } });
  fireEvent.blur(input);
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.change(input, { target: { value: '#aabbcc' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  expect(change.mock.calls).toEqual([['#AABBCC']]);
});
it('cancels the open picker with Escape and ignores late blur/change events', async () => {
  const user = userEvent.setup(),
    change = vi.fn(),
    cancel = vi.fn();
  render(
    <ColorControl
      label="Background"
      value="#FF0000"
      onChange={change}
      onPreview={() => {}}
      onCancelPreview={cancel}
    />,
  );
  open();
  const hue = screen.getByRole('slider', { name: 'Hue' });
  const oldPointer = window.PointerEvent;
  window.PointerEvent = MouseEvent;
  hue.setPointerCapture = () => {};
  hue.hasPointerCapture = () => false;
  fireEvent.pointerDown(hue, { button: 0, pointerId: 1 });
  fireEvent.input(hue, { target: { value: 240 } });
  window.PointerEvent = oldPointer;
  await user.keyboard('{Escape}');
  fireEvent.blur(hue);
  fireEvent.change(hue, { target: { value: 240 } });
  expect(change).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Background' }).value).toBe('#FF0000');
});

it('captures plane dragging, clamps outside coordinates and commits exactly once at release', () => {
  const change = vi.fn(),
    preview = vi.fn();
  render(<ColorControl label="Background" value="#000000" onChange={change} onPreview={preview} />);
  open();
  dimension('Hue', 240); // hue-only edit leaves black and must not serialize anything
  expect(change).not.toHaveBeenCalled();
  const plane = screen.getByRole('group', { name: 'Saturation and brightness plane' });
  const oldPointer = window.PointerEvent;
  window.PointerEvent = MouseEvent;
  plane.setPointerCapture = vi.fn();
  plane.hasPointerCapture = () => false;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  fireEvent.pointerDown(plane, { button: 0, clientX: 20, clientY: 50 });
  fireEvent.blur(screen.getByRole('slider', { name: 'Hue' }));
  fireEvent.pointerMove(plane, { clientX: 150, clientY: -50 });
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerUp(plane, { button: 0, clientX: 150, clientY: -50 });
  fireEvent.blur(plane);
  fireEvent.pointerUp(plane, { button: 0, clientX: 150, clientY: -50 });
  expect(change.mock.calls).toEqual([['#0000FF']]);
  window.PointerEvent = oldPointer;
});

it('distinguishes a same-color external profile reset from an ordinary neutral rerender', () => {
  const props = { label: 'Background', value: '#000000', onChange: () => {} };
  const original = {};
  const view = render(<ColorControl {...props} resetKey={original} />);
  open();
  dimension('Hue', 240);
  view.rerender(<ColorControl {...props} resetKey={original} />);
  expect(screen.getByRole('slider', { name: 'Hue' }).value).toBe('240');
  view.rerender(<ColorControl {...props} resetKey={{}} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  open();
  expect(screen.getByRole('slider', { name: 'Hue' }).value).toBe('0');
});
