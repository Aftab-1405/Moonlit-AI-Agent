/** Resolve saved preferences against the current deployment's available models. */
export function resolveLlmSelection(options = {}, settings = {}) {
  const providers = (options.providers || []).filter((provider) => provider.models?.length);
  const provider =
    providers.find((item) => item.name === settings.llmProvider) ||
    providers.find((item) => item.name === options.default_provider) ||
    providers[0];
  const models = provider?.models || [];
  const selectedModel = models.includes(settings.llmModel)
    ? settings.llmModel
    : models.includes(provider?.default_model)
      ? provider.default_model
      : models[0] || '';
  return {
    selectedProvider: provider?.name || '',
    selectedModel,
    supportsReasoning: options.capabilities?.[selectedModel]?.supports_reasoning === true,
  };
}

/** Human-readable labels for configured API identifiers; never adds models. */
export function getModelDisplayName(model = '') {
  return (
    {
      'moonshotai.kimi-k2.5': 'Kimi K2.5',
      'openai.gpt-oss-120b-1:0': 'GPT OSS 120B',
      'mistral.devstral-2-123b': 'Devstral 2',
    }[model] || model
  );
}
