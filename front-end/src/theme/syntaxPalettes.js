import { primitives } from './tokens/primitives.js';

export const moonlitDarkSyntax = primitives.code.vercel;

// Moonlit's light syntax palette. These are local, readable counterparts to
// the existing syntax roles, rather than an unmeasured reference preset.
export const moonlitLightSyntax = Object.freeze({
  editorForeground: '#242424',
  editorBackground: '#fcfcfc',
  lineNumberForeground: '#686868',
  lineNumberActiveForeground: '#242424',
  lineHighlightBackground: '#00000008',
  selectionBackground: '#dce8f8',
  whitespaceForeground: '#00000026',
  comment: '#686868',
  constant: '#164e87',
  entity: '#6b328e',
  keyword: '#9b225a',
  storage: '#9b225a',
  string: '#23613b',
  support: '#6b328e',
  variable: '#242424',
  variableOther: '#242424',
  functionCall: '#6b328e',
  propertyName: '#164e87',
  punctuation: '#525252',
  tagName: '#9b225a',
  attributeName: '#164e87',
  number: '#164e87',
  boolean: '#9b225a',
  operator: '#525252',
  invalid: '#ba2623',
  regex: '#23613b',
  escape: '#9b225a',
});

export const getSyntaxPalette = (themeName = 'moonlit-vercel') =>
  themeName === 'moonlit-light' ? moonlitLightSyntax : moonlitDarkSyntax;

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
export const moonlitLightShikiTheme = createShikiTheme('moonlit-light', 'light', moonlitLightSyntax);
