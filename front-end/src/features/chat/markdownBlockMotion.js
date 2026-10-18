function hasClosingFence(source) {
  const lines = String(source || '').split('\n');
  const openingMatch = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0] || '');
  if (!openingMatch) return false;

  const marker = openingMatch[1];
  const markerCharacter = marker[0];
  const closingPattern = new RegExp(`^ {0,3}${markerCharacter}{${marker.length},}\\s*$`);
  return lines.slice(1).some((line) => closingPattern.test(line));
}

export function getMarkdownBlockPhase({
  type,
  source,
  startOffset = 0,
  endOffset = 0,
  isStreaming,
}) {
  if (!isStreaming) return 'stable';

  const normalizedSource = String(source || '');
  if (type === 'code') {
    return hasClosingFence(normalizedSource.slice(startOffset, endOffset)) ? 'stable' : 'streaming';
  }

  return normalizedSource.slice(endOffset).trim().length > 0 ? 'stable' : 'streaming';
}
