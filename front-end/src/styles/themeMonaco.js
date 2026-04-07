import { DARK, LIGHT } from '../theme/tokens';

const MONACO_THEME_PREFIX = 'moonlit';
const TRANSPARENT_MONACO_BG = '#00000000';

export const getMonacoThemeName = (mode, transparent = false) =>
  `${MONACO_THEME_PREFIX}-${mode}${transparent ? '-transparent' : ''}`;

const createMonacoTheme = (mode, transparent = false) => {
  const T = mode === 'dark' ? DARK : LIGHT;
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': transparent ? TRANSPARENT_MONACO_BG : T.bg200,
      'editor.lineHighlightBackground': transparent
        ? (mode === 'dark' ? '#ffffff09' : '#00000009')
        : T.bg300,
      'editorGutter.background': transparent ? TRANSPARENT_MONACO_BG : T.bg200,
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
