export function getConversationActivityPresentation(activity = {}, { isActive = false } = {}) {
  if (isActive) return null;
  if (activity.unreadActivity === 'attention') {
    return { kind: 'attention', label: 'Needs your attention' };
  }
  if (activity.unreadActivity === 'error' || activity.streamStatus === 'error') {
    return { kind: 'error', label: 'Generation failed' };
  }
  if (activity.streamStatus === 'starting' || activity.streamStatus === 'streaming') {
    return { kind: 'generating', label: 'Generating response' };
  }
  if (activity.unreadActivity === 'done') {
    return { kind: 'done', label: 'Response ready' };
  }
  return null;
}
