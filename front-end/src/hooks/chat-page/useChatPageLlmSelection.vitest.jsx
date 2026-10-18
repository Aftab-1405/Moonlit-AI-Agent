import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { queryClient, queryKeys } from '@/api/queryClient';
import { useChatPageLlmSelection } from './useChatPageLlmSelection';

const options = {
  status: 'success',
  default_provider: 'bedrock',
  default_model: 'reasoner',
  providers: [{ name: 'bedrock', default_model: 'reasoner', models: ['reasoner', 'standard'] }],
  capabilities: { reasoner: { supports_reasoning: true } },
};
afterEach(() => queryClient.clear());

it('uses the effective fallback model capability and saves effort atomically', () => {
  queryClient.setQueryData(queryKeys.llmOptions, options);
  const updateSettings = vi.fn();
  const { result, rerender } = renderHook(
    ({ settings }) => useChatPageLlmSelection({ settings, updateSettings }),
    {
      initialProps: {
        settings: {
          llmProvider: 'removed',
          llmModel: 'removed',
          enableReasoning: false,
          reasoningEffort: 'high',
        },
      },
    },
  );
  expect(result.current.selectedModel).toBe('reasoner');
  expect(result.current.supportsReasoning).toBe(true);
  expect(result.current.reasoningEffort).toBe('low');
  act(() => result.current.handleReasoningEffortChange('high'));
  expect(updateSettings).toHaveBeenLastCalledWith({
    enableReasoning: true,
    reasoningEffort: 'high',
  });
  updateSettings.mockClear();
  act(() => result.current.handleReasoningEffortChange('ultra'));
  expect(updateSettings).not.toHaveBeenCalled();
  rerender({ settings: { llmProvider: 'bedrock', llmModel: 'standard', reasoningEffort: 'high' } });
  expect(result.current.supportsReasoning).toBe(false);
  act(() => result.current.handleReasoningEffortChange('low'));
  expect(updateSettings).not.toHaveBeenCalled();
});

it('does not select an unavailable provider or model when deployment defaults are stale', () => {
  queryClient.setQueryData(queryKeys.llmOptions, {
    ...options,
    default_provider: 'removed',
    providers: [{ name: 'bedrock', default_model: 'removed', models: ['standard'] }],
  });
  const updateSettings = vi.fn();
  const { result } = renderHook(() => useChatPageLlmSelection({ settings: {}, updateSettings }));
  expect(result.current.selectedProvider).toBe('bedrock');
  expect(result.current.selectedModel).toBe('standard');
  expect(result.current.supportsReasoning).toBe(false);
});
