import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSettings } from '@/contexts/SettingsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AppearanceSection from './AppearanceSection';

const authUser = vi.hoisted(() => ({ uid: 'appearance-ui-test' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }));

beforeEach(() => {
  localStorage.clear();
  authUser.uid = 'appearance-ui-test';
});

function Probe() {
  const { settings } = useSettings();
  const theme = useMuiTheme();
  return (
    <output data-testid="appearance-result">
      {JSON.stringify({ ...settings.appearance, effectiveMode: theme.palette.mode })}
    </output>
  );
}

function surface(props = {}) {
  return (
    <ThemeProvider>
      <AppearanceSection {...props} />
      <Probe />
    </ThemeProvider>
  );
}

const saved = () => JSON.parse(screen.getByTestId('appearance-result').textContent);
it('keeps the closed accent label plain and identifies the current color in the popup', async () => {
  const user = userEvent.setup();
  render(surface());
  const accent = screen.getByRole('combobox', { name: `${saved().effectiveMode} accent` });
  expect(accent.textContent).toBe('Default');
  await user.click(accent);
  expect(screen.getByRole('option', { name: 'Default' }).getAttribute('aria-selected')).toBe(
    'true',
  );
  await user.click(screen.getByRole('option', { name: 'Pink' }));
  expect(accent.textContent).toBe('Pink');
  await user.click(accent);
  expect(screen.getByRole('option', { name: 'Pink' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('option', { name: 'Default' }).getAttribute('aria-selected')).toBe(
    'false',
  );
});

it('switches modes through one named radio group and updates the actual theme', async () => {
  const user = userEvent.setup();
  render(surface());
  const group = screen.getByRole('radiogroup', { name: 'Mode' });
  await user.click(within(group).getByRole('radio', { name: 'Light' }));
  expect(saved().mode).toBe('light');
  expect(saved().effectiveMode).toBe('light');
  await user.click(within(group).getByRole('radio', { name: 'Dark' }));
  expect(saved().effectiveMode).toBe('dark');
});

it('reveals font controls through search without changing preferences', async () => {
  const view = render(surface());
  expect(screen.queryByRole('spinbutton', { name: 'UI font size' })).toBeNull();
  const before = saved();
  view.rerender(surface({ revealTarget: 'settings-font' }));
  expect(await screen.findByRole('spinbutton', { name: 'UI font size' })).toBeTruthy();
  expect(saved()).toEqual(before);
});

it('keeps incomplete hex values local and rejects invalid commits', async () => {
  const user = userEvent.setup();
  render(surface());
  const input = screen.getByRole('textbox', { name: 'Background' });
  const before = saved();
  await user.clear(input);
  await user.type(input, '#12');
  expect(saved()).toEqual(before);
  await user.tab();
  expect(screen.getByText('Enter a valid 6-digit hex color.')).toBeTruthy();
  expect(saved()).toEqual(before);
  await user.clear(input);
  await user.type(input, '#123456');
  await user.tab();
  expect(saved().profiles[saved().effectiveMode].surface).toBe('#123456');
});

it('shows independent cards and contrast sliders after separating modes', async () => {
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  await user.click(screen.getByRole('switch', { name: 'Separate light and dark modes' }));
  expect(screen.getByRole('heading', { name: 'Light theme' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Dark theme' })).toBeTruthy();
  const light = screen.getByRole('slider', { name: 'Light contrast' });
  const dark = screen.getByRole('slider', { name: 'Dark contrast' });
  const before = saved().profiles.dark.contrast;
  fireEvent.change(light, { target: { value: '72' } });
  expect(saved().profiles.light.contrast).toBe(72);
  expect(Number(dark.value)).toBe(before);
});

it('rejects invalid imports atomically and restores focus on Cancel', async () => {
  const user = userEvent.setup();
  render(surface());
  const trigger = screen.getByRole('button', { name: 'Import theme' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Import theme' });
  const submit = within(dialog).getByRole('button', { name: 'Import' });
  expect(submit.disabled).toBe(true);
  const before = saved();
  await user.type(
    within(dialog).getByRole('textbox', { name: 'Theme share string' }),
    'unknown-theme:invalid',
  );
  await user.click(submit);
  expect(within(dialog).getByRole('alert').textContent).toBeTruthy();
  expect(saved()).toEqual(before);
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('reports clipboard failure without changing the profile', async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
  render(surface());
  const before = saved();
  await user.click(screen.getByRole('button', { name: 'Copy theme' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(saved()).toEqual(before);
});

it('reselects a customized preset to restore its palette and keeps White usable', async () => {
  const user = userEvent.setup();
  render(surface());
  const mode = saved().effectiveMode;
  const preset = screen.getByRole('combobox', { name: `${mode} theme preset` });
  await user.click(preset);
  await user.click(screen.getByRole('option', { name: 'Aa · ChatGPT' }));
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  fireEvent.change(
    screen.getByRole('slider', { name: `${mode === 'light' ? 'Light' : 'Dark'} contrast` }),
    { target: { value: '73' } },
  );
  expect(saved().profiles[mode].custom).toBe(true);
  await user.click(preset);
  await user.click(screen.getByRole('option', { name: 'Aa · ChatGPT' }));
  expect(saved().profiles[mode].custom).toBe(false);
  expect(saved().profiles[mode].contrast).toBe(mode === 'light' ? 45 : 60);
  await user.click(screen.getByRole('combobox', { name: `${mode} accent` }));
  await user.click(screen.getByRole('option', { name: 'White' }));
  expect(saved().profiles[mode].accent).toBe('white');
});
it('does not persist or customize unchanged hex on Enter followed by blur', async () => {
  const user = userEvent.setup();
  render(surface());
  const input = screen.getByRole('textbox', { name: 'Background' });
  const before = saved();
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  writes.mockClear();
  await user.click(input);
  await user.keyboard('{Enter}');
  await user.tab();
  expect(saved()).toEqual(before);
  expect(writes).not.toHaveBeenCalled();
  writes.mockRestore();
});
it('allows a temporary empty numeric draft and commits only valid integers', async () => {
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  const input = screen.getByRole('spinbutton', { name: 'Code font size' });
  await user.clear(input);
  expect(input.value).toBe('');
  expect(saved().codeFontSize).toBe(12);
  await user.type(input, '18');
  await user.keyboard('{Enter}');
  expect(saved().codeFontSize).toBe(18);
  await user.clear(input);
  await user.type(input, '99');
  await user.tab();
  expect(saved().codeFontSize).toBe(18);
});
it('renders explicit groups with real separators and an independent Advanced/reset header', async () => {
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('radio', { name: 'Dark' }));
  const advanced = screen.getByRole('button', { name: 'Advanced' }),
    reset = screen.getByRole('button', { name: 'Reset to default' });
  expect(reset.parentElement).toBe(advanced.parentElement);
  await user.click(advanced);
  const fonts = screen.getByRole('group', { name: 'Font sizes' });
  expect(within(fonts).getAllByRole('separator')).toHaveLength(2);
  expect(within(fonts).getAllByText('px')).toHaveLength(3);
  const themeGroup = screen.getByRole('group', { name: 'Theme settings' });
  expect(within(themeGroup).queryByText('Preset')).toBeNull();
  expect(
    within(themeGroup)
      .getByRole('heading', { name: 'Theme' })
      .parentElement.contains(
        within(themeGroup).getByRole('combobox', { name: 'dark theme preset' }),
      ),
  ).toBe(true);
  await user.click(reset);
  expect(advanced.getAttribute('aria-expanded')).toBe('true');
});
it('previews a contrast drag locally and persists only its final value', async () => {
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  const mode = saved().effectiveMode,
    label = `${mode === 'light' ? 'Light' : 'Dark'} contrast`,
    input = screen.getByRole('slider', { name: label });
  const rail = input.closest('.MuiSlider-root');
  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 20,
    right: 100,
    bottom: 20,
  });
  const before = saved().profiles[mode].contrast,
    writes = vi.spyOn(Storage.prototype, 'setItem');
  writes.mockClear();
  fireEvent.mouseDown(rail, { clientX: 20, clientY: 10, button: 0 });
  fireEvent.mouseMove(document, { clientX: 70, clientY: 10, buttons: 1 });
  expect(saved().profiles[mode].contrast).toBe(before);
  expect(writes).not.toHaveBeenCalled();
  fireEvent.mouseUp(document, { clientX: 70, clientY: 10, button: 0 });
  expect(saved().profiles[mode].contrast).toBe(70);
  expect(writes.mock.calls.filter(([key]) => key !== 'moonlit-appearance-boot-v1')).toHaveLength(1);
  writes.mockRestore();
});
it('discards numeric drafts when the account changes', async () => {
  const user = userEvent.setup(),
    view = render(surface());
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  const input = screen.getByRole('spinbutton', { name: 'Code font size' });
  await user.clear(input);
  await user.type(input, '19');
  authUser.uid = 'second-account';
  view.rerender(surface());
  expect(saved().codeFontSize).toBe(12);
  expect(screen.queryByRole('spinbutton', { name: 'Code font size' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  expect(screen.getByRole('spinbutton', { name: 'Code font size' }).value).toBe('12');
});
it('cancels a picker preview with Escape without committing a color', async () => {
  const user = userEvent.setup();
  render(surface());
  const before = saved();
  await user.click(screen.getByRole('button', { name: 'Foreground color' }));
  const input = screen.getByRole('slider', { name: 'Brightness' });
  const oldPointer = window.PointerEvent;
  window.PointerEvent = MouseEvent;
  input.setPointerCapture = () => {};
  input.hasPointerCapture = () => false;
  fireEvent.pointerDown(input, { button: 0, pointerId: 1 });
  fireEvent.input(input, { target: { value: 70 } });
  window.PointerEvent = oldPointer;
  expect(saved()).toEqual(before);
  await user.keyboard('{Escape}');
  fireEvent.pointerUp(input, { button: 0, pointerId: 1 });
  fireEvent.blur(input);
  expect(saved()).toEqual(before);
  expect(screen.queryByRole('slider', { name: 'Hue' })).toBeNull();
});
it('cancels an in-progress contrast gesture with Escape', async () => {
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  const mode = saved().effectiveMode,
    input = screen.getByRole('slider', { name: `${mode === 'light' ? 'Light' : 'Dark'} contrast` }),
    rail = input.closest('.MuiSlider-root'),
    before = saved();
  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 20,
    right: 100,
    bottom: 20,
  });
  fireEvent.mouseDown(rail, { clientX: 20, clientY: 10, button: 0 });
  fireEvent.mouseMove(document, { clientX: 70, clientY: 10, buttons: 1 });
  await user.keyboard('{Escape}');
  fireEvent.mouseUp(document, { clientX: 70, clientY: 10, button: 0 });
  expect(saved()).toEqual(before);
  expect(Number(input.value)).toBe(before.profiles[mode].contrast);
});

it('previews an inactive custom accent within its profile and matches the committed palette', async () => {
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('radio', { name: 'Dark' }));
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  await user.click(screen.getByRole('switch', { name: 'Separate light and dark modes' }));
  await user.click(screen.getByRole('combobox', { name: 'light accent' }));
  await user.click(screen.getByRole('option', { name: 'Custom' }));
  const light = screen.getByRole('group', { name: 'light theme settings' }),
    dark = screen.getByRole('group', { name: 'dark theme settings' });
  const darkStyle = dark.getAttribute('style');
  const sample = within(light).getByLabelText('light accent preview');
  expect(sample.textContent).toContain('Your message');
  const before = saved();
  await user.click(screen.getByRole('button', { name: 'light custom accent color' }));
  const plane = screen.getByRole('group', { name: 'Saturation and brightness plane' });
  const oldPointer = window.PointerEvent;
  window.PointerEvent = MouseEvent;
  plane.setPointerCapture = () => {};
  plane.hasPointerCapture = () => false;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  fireEvent.pointerDown(plane, { button: 0, clientX: 100, clientY: 0 });
  await waitFor(() =>
    expect(light.style.getPropertyValue('--profile-accent-main')).not.toBe('#A67DF2'),
  );
  const previewStyle = light.getAttribute('style');
  expect(light.style.getPropertyValue('--profile-user-message-bg')).not.toBe('');
  expect(saved()).toEqual(before);
  expect(dark.getAttribute('style')).toBe(darkStyle);
  fireEvent.pointerUp(plane, { button: 0, clientX: 100, clientY: 0 });
  await waitFor(() => expect(saved().profiles.light.customAccent).not.toBe('#A67DF2'));
  expect(light.getAttribute('style')).toBe(previewStyle);
  expect(saved().profiles.light.custom).toBe(false);
  expect(saved().effectiveMode).toBe('dark');
  window.PointerEvent = oldPointer;
});
