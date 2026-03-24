import { useState, useEffect, useCallback, useMemo } from 'react';
import { getLlmOptions } from '../../api';
import logger from '../../utils/logger';

export function useChatPageLlmSelection({ settings, updateSetting }) {
  const [llmOptions, setLlmOptions] = useState({
    providers: [],
    default_provider: null,
    default_model: null,
  });
  const [llmOptionsLoading, setLlmOptionsLoading] = useState(true);

  const providerOptions = useMemo(() => llmOptions.providers ?? [], [llmOptions.providers]);
  const selectedProvider = useMemo(() => {
    if (!providerOptions.length) return settings.llmProvider ?? '';
    if (settings.llmProvider && providerOptions.some((provider) => provider.name === settings.llmProvider)) {
      return settings.llmProvider;
    }
    return llmOptions.default_provider || providerOptions[0].name;
  }, [providerOptions, settings.llmProvider, llmOptions.default_provider]);
  const selectedProviderOption = useMemo(() => {
    return providerOptions.find((provider) => provider.name === selectedProvider) || null;
  }, [providerOptions, selectedProvider]);
  const modelOptions = useMemo(() => selectedProviderOption?.models || [], [selectedProviderOption]);
  const selectedModel = useMemo(() => {
    if (!modelOptions.length) return settings.llmModel ?? '';
    if (settings.llmModel && modelOptions.includes(settings.llmModel)) {
      return settings.llmModel;
    }
    return selectedProviderOption?.default_model || llmOptions.default_model || modelOptions[0];
  }, [modelOptions, settings.llmModel, selectedProviderOption, llmOptions.default_model]);

  const providerSelectValue = selectedProvider || '';
  const modelSelectValue = selectedModel || '';

  const handleLlmSelection = useCallback((providerName, modelName) => {
    const providerOption = providerOptions.find((provider) => provider.name === providerName);
    if (!providerOption) return;

    const nextModel = providerOption.models?.includes(modelName)
      ? modelName
      : (providerOption.default_model || providerOption.models?.[0] || null);

    updateSetting('llmProvider', providerName);
    updateSetting('llmModel', nextModel);
  }, [providerOptions, updateSetting]);

  const handleProviderChange = useCallback((event) => {
    const nextProvider = event.target.value;
    const providerOption = providerOptions.find((provider) => provider.name === nextProvider);
    const nextModels = providerOption?.models || [];
    const nextModel = nextModels.includes(settings.llmModel)
      ? settings.llmModel
      : (providerOption?.default_model || nextModels[0] || null);

    handleLlmSelection(nextProvider, nextModel);
  }, [providerOptions, settings.llmModel, handleLlmSelection]);

  const handleModelChange = useCallback((event) => {
    handleLlmSelection(selectedProvider, event.target.value);
  }, [handleLlmSelection, selectedProvider]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadLlmOptions = async () => {
      try {
        const response = await getLlmOptions(controller.signal);
        if (!isMounted || response?.status !== 'success') return;

        const providers = response.providers || [];
        setLlmOptions({
          providers,
          default_provider: response.default_provider || null,
          default_model: response.default_model || null,
        });

        if (!providers.length) return;

        const providerFromSettings = settings.llmProvider;
        const validProvider = providerFromSettings && providers.some((provider) => provider.name === providerFromSettings)
          ? providerFromSettings
          : (response.default_provider || providers[0].name);

        if (validProvider !== settings.llmProvider) {
          updateSetting('llmProvider', validProvider);
        }

        const providerConfig = providers.find((provider) => provider.name === validProvider) || providers[0];
        const candidateModels = providerConfig?.models || [];
        const modelFromSettings = settings.llmModel;
        const validModel = modelFromSettings && candidateModels.includes(modelFromSettings)
          ? modelFromSettings
          : (providerConfig?.default_model || response.default_model || candidateModels[0] || null);

        if (validModel && validModel !== settings.llmModel) {
          updateSetting('llmModel', validModel);
        }
      } catch (error) {
        logger.warn('Failed to fetch LLM options:', error);
      } finally {
        if (isMounted) {
          setLlmOptionsLoading(false);
        }
      }
    };

    loadLlmOptions();
    return () => {
      isMounted = false;
      controller.abort();
    };
    // Only initialize from backend once on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateSetting]);

  return {
    providerOptions,
    modelOptions,
    providerSelectValue,
    modelSelectValue,
    selectedProvider,
    selectedModel,
    llmOptionsLoading,
    handleLlmSelection,
    handleProviderChange,
    handleModelChange,
  };
}

export default useChatPageLlmSelection;
