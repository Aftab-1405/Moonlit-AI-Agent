export function buildChatRequestPayload({
  prompt,
  conversationId,
  enableReasoning,
  reasoningEffort,
  responseStyle,
  maxRows,
  provider,
  model,
  taskMode,
}) {
  return {
    prompt,
    ...(conversationId === null || conversationId === undefined
      ? {}
      : { conversation_id: conversationId }),
    enable_reasoning: enableReasoning,
    reasoning_effort: reasoningEffort,
    response_style: responseStyle,
    max_rows: maxRows === 0 ? null : maxRows,
    provider,
    model,
    task_mode: taskMode,
  };
}
