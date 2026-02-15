import { alpha } from '@mui/material/styles';

const mermaidCache = new WeakMap();

// NOTE: If mermaid content is untrusted/user-provided, consider securityLevel:'strict'.
export const getMermaidThemeConfig = (theme) => {
  if (mermaidCache.has(theme)) return mermaidCache.get(theme);

  const isDark = theme.palette.mode === 'dark';
  const { palette } = theme;

  const config = {
    startOnLoad: false,
    suppressErrorRendering: true,
    securityLevel: 'loose',
    theme: isDark ? 'dark' : 'neutral',
    themeVariables: {
      primaryColor: palette.primary.main,
      primaryTextColor: palette.text.primary,
      primaryBorderColor: palette.border.default,
      lineColor: palette.text.secondary,
      secondaryColor: palette.secondary.main,
      tertiaryColor: palette.background.default,
      background: 'transparent',
      mainBkg: palette.background.paper,
      nodeBorder: palette.border.default,
      clusterBkg: alpha(palette.background.paper, 0.5),
      clusterBorder: palette.border.default,
      titleColor: palette.text.primary,
      edgeLabelBackground: palette.background.paper,
      nodeTextColor: palette.text.primary,
      entityBkg: palette.background.paper,
      entityBorder: palette.border.default,
      attributeBoxBkg: palette.action.hover,
      attributeBoxText: palette.text.primary,
      relationLabelColor: palette.text.secondary,
    },
  };

  mermaidCache.set(theme, config);
  return config;
};
