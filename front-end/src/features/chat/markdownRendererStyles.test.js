import assert from 'node:assert/strict';
import test from 'node:test';

const markdownRendererStyles = await import('./markdownRendererStyles.js').catch(() => ({}));

test('the first rendered Markdown element is marked without positional selectors', () => {
  assert.equal(typeof markdownRendererStyles.getMarkdownBoundarySx, 'function');
  assert.equal(typeof markdownRendererStyles.markFirstMarkdownElement, 'function');

  const tree = {
    type: 'root',
    children: [
      { type: 'text', value: '\n' },
      { type: 'element', tagName: 'p', properties: { className: ['existing'] } },
      { type: 'element', tagName: 'pre', properties: {} },
    ],
  };

  markdownRendererStyles.markFirstMarkdownElement()(tree);

  assert.deepEqual(tree.children[1].properties.className, ['existing', 'markdown-first-child']);
  assert.deepEqual(tree.children[2].properties.className, undefined);

  assert.deepEqual(markdownRendererStyles.getMarkdownBoundarySx(), {
    '& > .markdown-first-child': { mt: 0 },
    '& > .markdown-first-child > [role="group"]': { mt: 0 },
    '& > :last-child': { mb: 0 },
  });
});
