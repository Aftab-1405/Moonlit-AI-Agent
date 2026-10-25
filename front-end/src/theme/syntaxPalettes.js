import { primitives } from './tokens/primitives.js';

export const moonlitDarkSyntax = primitives.code.vercel;

const createShikiTheme = (name, type, palette) => ({
  name,
  type,
  colors: {
    'editor.background': palette.editorBackground,
    'editor.foreground': palette.editorForeground,
    'editor.lineHighlightBackground': palette.lineHighlightBackground,
    'editor.selectionBackground': palette.selectionBackground,
    'editorLineNumber.foreground': palette.lineNumberForeground,
    'editorLineNumber.activeForeground': palette.lineNumberActiveForeground,
    'editorWhitespace.foreground': palette.whitespaceForeground,
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: palette.comment },
    },
    { scope: ['keyword', 'storage', 'storage.type'], settings: { foreground: palette.keyword } },
    { scope: ['string', 'string.quoted'], settings: { foreground: palette.string } },
    {
      scope: ['constant', 'constant.numeric', 'constant.language'],
      settings: { foreground: palette.constant },
    },
    {
      scope: ['entity.name.function', 'support.function'],
      settings: { foreground: palette.functionCall },
    },
    { scope: ['entity.name.type', 'support.type'], settings: { foreground: palette.entity } },
    {
      scope: ['variable', 'meta.object-literal.key'],
      settings: { foreground: palette.variableOther },
    },
    {
      scope: ['variable.other.property', 'support.variable.property'],
      settings: { foreground: palette.propertyName },
    },
    { scope: ['keyword.operator', 'punctuation'], settings: { foreground: palette.operator } },
    { scope: ['entity.name.tag'], settings: { foreground: palette.tagName } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: palette.attributeName } },
    { scope: ['markup.inserted'], settings: { foreground: primitives.workspace.diffAdded } },
    { scope: ['markup.deleted'], settings: { foreground: primitives.workspace.diffRemoved } },
    { scope: ['invalid'], settings: { foreground: palette.invalid } },
  ],
});

export const moonlitDarkShikiTheme = createShikiTheme('moonlit-vercel', 'dark', moonlitDarkSyntax);
