import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkdownRenderer from '@/features/chat/MarkdownRenderer';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();

function renderMarkdown(props) {
  const view = render(
    <ThemeProvider theme={theme}>
      <MarkdownRenderer {...props} />
    </ThemeProvider>,
  );

  return {
    ...view,
    rerenderMarkdown(nextProps) {
      view.rerender(
        <ThemeProvider theme={theme}>
          <MarkdownRenderer {...nextProps} />
        </ThemeProvider>,
      );
    },
  };
}

describe('MarkdownRenderer structured motion', () => {
  it('settles a live code block once its closing fence arrives', () => {
    const incomplete = '```javascript\nconst total = 42;';
    const complete = `${incomplete}\n\`\`\``;
    const view = renderMarkdown({ content: incomplete, isStreaming: true, animateBlocks: true });

    let codeBoundary = screen.getByRole('group', { name: 'javascript code' }).parentElement;
    const initialCodeBoundary = codeBoundary;
    expect(codeBoundary.getAttribute('data-block-phase')).toBe('streaming');
    expect(codeBoundary.getAttribute('data-structured-motion')).toBe('live');

    view.rerenderMarkdown({ content: complete, isStreaming: true, animateBlocks: true });

    codeBoundary = screen.getByRole('group', { name: 'javascript code' }).parentElement;
    expect(codeBoundary).toBe(initialCodeBoundary);
    expect(codeBoundary.getAttribute('data-block-phase')).toBe('stable');

    view.rerenderMarkdown({ content: complete, isStreaming: false, animateBlocks: true });

    expect(screen.getByRole('group', { name: 'javascript code' }).parentElement).toBe(
      initialCodeBoundary,
    );
  });

  it('keeps structured blocks static for stored responses', () => {
    renderMarkdown({
      content: '```sql\nselect 1;\n```',
      isStreaming: false,
      animateBlocks: false,
    });

    const codeBoundary = screen.getByRole('group', { name: 'sql code' }).parentElement;
    expect(codeBoundary.getAttribute('data-block-phase')).toBe('stable');
    expect(codeBoundary.getAttribute('data-structured-motion')).toBe('static');
  });

  it('reveals a live image after it loads without animating its surrounding text', () => {
    renderMarkdown({
      content: 'Before image\n\n![Revenue chart](https://example.com/chart.png)\n\nAfter image',
      isStreaming: true,
      animateBlocks: true,
    });

    const image = screen.getByRole('img', { name: 'Revenue chart' });
    expect(image.getAttribute('data-image-motion')).toBe('loading');

    fireEvent.load(image);

    expect(image.getAttribute('data-image-motion')).toBe('revealed');
  });
});
