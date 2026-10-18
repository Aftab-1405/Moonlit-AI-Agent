import assert from 'node:assert/strict';
import test from 'node:test';
import { getMarkdownBlockPhase } from './markdownBlockMotion.js';

test('streaming code becomes stable only after its matching closing fence arrives', () => {
  const incomplete = '```javascript\nconst total = 42;';
  const complete = '```javascript\nconst total = 42;\n```';

  assert.equal(
    getMarkdownBlockPhase({
      type: 'code',
      source: incomplete,
      startOffset: 0,
      endOffset: incomplete.length,
      isStreaming: true,
    }),
    'streaming',
  );
  assert.equal(
    getMarkdownBlockPhase({
      type: 'code',
      source: complete,
      startOffset: 0,
      endOffset: complete.length,
      isStreaming: true,
    }),
    'stable',
  );
});

test('a trailing table waits until another block arrives or streaming finishes', () => {
  const table = '| Region | Revenue |\n| --- | ---: |\n| East | 42 |';
  const followedByText = `${table}\n\nSummary follows.`;

  assert.equal(
    getMarkdownBlockPhase({
      type: 'table',
      source: table,
      startOffset: 0,
      endOffset: table.length,
      isStreaming: true,
    }),
    'streaming',
  );
  assert.equal(
    getMarkdownBlockPhase({
      type: 'table',
      source: followedByText,
      startOffset: 0,
      endOffset: table.length,
      isStreaming: true,
    }),
    'stable',
  );
  assert.equal(
    getMarkdownBlockPhase({
      type: 'table',
      source: table,
      startOffset: 0,
      endOffset: table.length,
      isStreaming: false,
    }),
    'stable',
  );
});
