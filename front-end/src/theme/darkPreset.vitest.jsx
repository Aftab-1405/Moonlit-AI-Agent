import { expect, it } from 'vitest';
import { createDarkTheme } from './darkTheme';
import { moonlitDarkShikiTheme, moonlitDarkSyntax } from './syntaxPalettes';

it('applies the supplied dark preset across UI, content and code tokens', () => {
  const theme = createDarkTheme();
  expect(theme.palette.background.default).toBe('#000000');
  expect(theme.palette.accent.main).toBe('#FFFFFF');
  expect(theme.palette.text.primary).toBe('#ededed');
  expect(theme.palette.semanticColors).toEqual({
    diffAdded: '#00ad3a',
    diffRemoved: '#f13342',
    skill: '#9540d5',
  });
  expect(theme.typography.fontFamily).toMatch(/^Geist, Inter/);
  expect(theme.typography.uiResponseBody.fontFamily).toBe('Arial, sans-serif');
  expect(theme.typography.fontFamilyMono).toContain('Geist Mono');
  expect(theme.palette.integration.codeTheme).toBe(moonlitDarkShikiTheme.name);
  expect(moonlitDarkSyntax.editorBackground).toBe('#000000');
  for (const role of ['paper', 'composer', 'elevated1', 'elevated2']) {
    expect(theme.palette.background[role]).toMatch(/^#[\da-f]{6}$/i);
  }
});
