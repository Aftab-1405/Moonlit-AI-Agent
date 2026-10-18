import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLlmOptions } from '@/api';
import { queryClient, queryKeys } from '@/api/queryClient';
import { resolveLlmSelection } from '@/config/llmSelection';
import { getEffectiveReasoningEffort, REASONING_EFFORT_OPTIONS } from '@/config/userSettings';

export function useChatPageLlmSelection({ settings, updateSettings }) {
  const {
    data: llmOptions = {},
    isPending,
    isFetching,
    isError,
    refetch,
  } = useQuery(
    {
      queryKey: queryKeys.llmOptions,
      queryFn: ({ signal }) => getLlmOptions(signal),
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
    queryClient,
  );
  const providerOptions = useMemo(() => llmOptions.providers ?? [], [llmOptions.providers]);
  const { selectedProvider, selectedModel, supportsReasoning } = resolveLlmSelection(
    llmOptions,
    settings,
  );
  const reasoningEffort = getEffectiveReasoningEffort(settings);
  const handleReasoningEffortChange = useCallback(
    (value) => {
      if (supportsReasoning && REASONING_EFFORT_OPTIONS.some((option) => option.value === value)) {
        updateSettings({ enableReasoning: true, reasoningEffort: value });
      }
    },
    [supportsReasoning, updateSettings],
  );

  const handleLlmSelection = useCallback(
    (providerName, modelName) => {
      const providerOption = providerOptions.find((provider) => provider.name === providerName);
      if (!providerOption?.models?.includes(modelName)) return;

      const nextModel = modelName;

      updateSettings({ llmProvider: providerName, llmModel: nextModel });
    },
    [providerOptions, updateSettings],
  );

  useEffect(() => {
    if (llmOptions.status !== 'success' || !selectedProvider) return;
    const patch = {};
    if (selectedProvider !== settings.llmProvider) patch.llmProvider = selectedProvider;
    if (selectedModel !== settings.llmModel) patch.llmModel = selectedModel;
    if (Object.keys(patch).length) updateSettings(patch);
  }, [
    llmOptions.status,
    selectedProvider,
    selectedModel,
    settings.llmProvider,
    settings.llmModel,
    updateSettings,
  ]);

  return {
    providerOptions,
    selectedProvider,
    selectedModel,
    supportsReasoning,
    reasoningEffort,
    handleReasoningEffortChange,
    llmOptionsLoading: isPending && isFetching,
    llmOptionsError: isError,
    retryLlmOptions: refetch,
    handleLlmSelection,
  };
}
