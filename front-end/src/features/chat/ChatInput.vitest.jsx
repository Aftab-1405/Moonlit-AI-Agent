import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ChatInput from './ChatInput';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();
const providers = [
  { name: 'bedrock', label: 'Amazon Bedrock', models: ['Reasoning model', 'Standard model'] },
  { name: 'other', label: 'Other provider', models: ['Other model'] },
];

function setup(overrides = {}) {
  const props = {
    sessionKey: 'a',
    providerOptions: providers,
    selectedProvider: 'bedrock',
    selectedModel: 'Reasoning model',
    supportsReasoning: true,
    reasoningEffort: 'medium',
    onSend: vi.fn(),
    onSelectLlm: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    ...overrides,
  };
  const content = (next) => (
    <ThemeProvider theme={theme}>
      <ChatInput {...next} />
    </ThemeProvider>
  );
  const view = render(content(props));
  return {
    ...props,
    ...view,
    rerenderChat: (next) => view.rerender(content({ ...props, ...next })),
  };
}

describe('composer model controls', () => {
  it('filters models and providers without changing selection, and restores trigger focus', async () => {
    const user = userEvent.setup();
    const view = setup();
    const trigger = screen.getByRole('button', { name: /Select model/ });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Choose a model' }));
    const search = screen.getByRole('textbox', { name: 'Search models' });
    await waitFor(() => expect(document.activeElement).toBe(search));
    await user.type(search, 'other provider');
    expect(screen.queryByRole('menuitemradio', { name: 'Reasoning model' })).toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'Other model' })).toBeTruthy();
    expect(view.onSelectLlm).not.toHaveBeenCalled();
    await user.clear(search);
    await user.type(search, 'missing');
    expect(screen.getByText('No matching models')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to model settings' }));
    expect(screen.queryByText('No matching models')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Reasoning effort' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('shows supported effort, applies the selected value, and reacts to capability changes', async () => {
    const user = userEvent.setup();
    const view = setup({ isStreaming: true, effectiveTaskMode: { label: 'Tool' } });
    const trigger = screen.getByRole('button', { name: /Select model/ });
    expect(trigger.textContent).toContain('Medium');
    await user.click(trigger);
    expect(screen.getByText(/Changes apply to your next message/)).toBeTruthy();
    expect(screen.getByText('Last resolved task mode: Tool.')).toBeTruthy();
    const effort = screen.getByRole('slider', { name: 'Reasoning effort' });
    fireEvent.change(effort, { target: { value: 2 } });
    expect(view.onReasoningEffortChange).toHaveBeenCalledWith('high');
    view.rerenderChat({ supportsReasoning: false });
    expect(screen.queryByRole('slider', { name: 'Reasoning effort' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /Select model/ }).textContent).not.toContain(
      'Medium',
    );
  });

  it('allows keyboard model selection from search', async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.click(screen.getByRole('button', { name: /Select model/ }));
    await user.click(screen.getByRole('button', { name: 'Choose a model' }));
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'Standard');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(view.onSelectLlm).toHaveBeenCalledWith('bedrock', 'Standard model');
  });

  it('shows loading, unavailable and retry states without inventing models', async () => {
    const user = userEvent.setup();
    const onRetryLlmOptions = vi.fn();
    const view = setup({
      providerOptions: [],
      supportsReasoning: false,
      llmOptionsLoading: true,
      onRetryLlmOptions,
    });
    await user.click(screen.getByRole('button', { name: /Select model/ }));
    expect(screen.getByRole('status', { name: 'Loading models' })).toBeTruthy();
    view.rerenderChat({ providerOptions: [], supportsReasoning: false, llmOptionsLoading: false });
    expect(screen.getByText('No models available')).toBeTruthy();
    view.rerenderChat({
      providerOptions: [],
      supportsReasoning: false,
      llmOptionsLoading: false,
      llmOptionsError: true,
    });
    expect(screen.getByText('Could not load models')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry loading models' }));
    expect(onRetryLlmOptions).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });
});

describe('composer submission', () => {
  it.each([
    'hello',
    '/long',
  ])('does not submit or select slash commands during IME composition: %s', (text) => {
    const onTaskModeChange = vi.fn();
    const view = setup({ onTaskModeChange });
    const input = screen.getByRole('textbox', { name: 'Message Moonlit' });
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
    expect(view.onSend).not.toHaveBeenCalled();
    expect(onTaskModeChange).not.toHaveBeenCalled();
    expect(input.value).toBe(text);
  });

  it('restores a rejected send to its own session without replacing a newer draft', async () => {
    let resolveSend;
    const view = setup({
      onSend: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSend = resolve;
          }),
      ),
    });
    const input = screen.getByRole('textbox', { name: 'Message Moonlit' });
    fireEvent.change(input, { target: { value: 'Original prompt' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
    view.rerenderChat({ sessionKey: 'b' });
    fireEvent.change(input, { target: { value: 'Draft B' } });
    await act(async () => resolveSend(false));
    expect(input.value).toBe('Draft B');
    view.rerenderChat({ sessionKey: 'a' });
    expect(input.value).toBe('Original prompt');
  });

  it('keeps a newly typed draft when a prior send rejects', async () => {
    let rejectSend;
    setup({
      onSend: () =>
        new Promise((_, reject) => {
          rejectSend = reject;
        }),
    });
    const input = screen.getByRole('textbox', { name: 'Message Moonlit' });
    fireEvent.change(input, { target: { value: 'Original' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'New draft' } });
    await act(async () => rejectSend(new Error('Offline')));
    expect(input.value).toBe('New draft');
  });

  it('does not restore a sent prompt when the user stops its response', async () => {
    let resolveSend;
    const onStop = vi.fn();
    const view = setup({
      onStop,
      onSend: () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    });
    const input = screen.getByRole('textbox', { name: 'Message Moonlit' });
    fireEvent.change(input, { target: { value: 'Original' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(input.value).toBe('Original');
    fireEvent.keyDown(input, { key: 'Enter' });
    view.rerenderChat({ isStreaming: true });
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating response' }));
    await act(async () => resolveSend(false));
    expect(onStop).toHaveBeenCalledOnce();
    expect(input.value).toBe('');
  });
});
