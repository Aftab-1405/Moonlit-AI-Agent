import { Checkbox, Radio, Switch } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, selectPreset } from './appearance';
import { createAppearanceSemanticTokens } from './tokens/semantic';
import { createComponentTokens } from './tokens/component';
import { createMoonlitTheme } from './createMoonlitTheme';
import MessageList from '@/features/chat/MessageList';

it.each(['light', 'dark'])('renders solid/on-solid controls and user text in %s', (mode) => {
  const s = createAppearanceSemanticTokens(selectPreset(DEFAULT_APPEARANCE, mode, 'chatgpt'), mode);
  const theme = createMoonlitTheme(s, createComponentTokens(s));
  const { container } = render(
    <ThemeProvider theme={theme}>
      <Switch checked readOnly />
      <Checkbox checked readOnly />
      <Radio checked readOnly />
      <MessageList
        messages={[
          { id: 'u', role: 'user', text: 'Synthetic user' },
          { id: 'a', role: 'assistant', text: 'Synthetic assistant' },
        ]}
      />
    </ThemeProvider>,
  );
  const rgb = (hex) =>
    `rgb(${hex
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16))
      .join(', ')})`;
  expect(getComputedStyle(container.querySelector('.MuiSwitch-track')).backgroundColor).toBe(
    rgb(s.accent.main),
  );
  expect(getComputedStyle(container.querySelector('.MuiSwitch-switchBase')).color).toBe(
    rgb(s.accent.contrastText),
  );
  expect(container.querySelector('.MuiCheckbox-root [data-accent-mark]')).not.toBeNull();
  expect(container.querySelector('.MuiRadio-root [data-accent-mark]')).not.toBeNull();
  const child = screen.getByTestId('user-message');
  expect(getComputedStyle(child.parentElement).backgroundColor).toBe(rgb(s.userMessage.background));
  expect(getComputedStyle(child).color).toBe(rgb(s.userMessage.foreground));
});
