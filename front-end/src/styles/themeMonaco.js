import { PALETTE_MODES } from './themeFoundation';

const MONACO_THEME_PREFIX = 'moonlit';
const TRANSPARENT_MONACO_BG = '#00000000';

export const getMonacoThemeName = (mode, transparent = false) =>
  `${MONACO_THEME_PREFIX}-${mode}${transparent ? '-transparent' : ''}`;

const createMonacoTheme = (mode, transparent = false) => {
  const palette = PALETTE_MODES[mode];
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': transparent ? TRANSPARENT_MONACO_BG : palette.monaco.background,
      'editor.lineHighlightBackground': palette.monaco.lineHighlight,
      'editorGutter.background': transparent ? TRANSPARENT_MONACO_BG : palette.monaco.gutter,
    },
  };
};

export const registerMonacoThemes = (monaco, { transparent = false } = {}) => {
  monaco.editor.defineTheme(
    getMonacoThemeName('dark', transparent),
    createMonacoTheme('dark', transparent)
  );
  monaco.editor.defineTheme(
    getMonacoThemeName('light', transparent),
    createMonacoTheme('light', transparent)
  );
};
