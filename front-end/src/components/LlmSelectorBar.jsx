import { memo, useMemo } from 'react';
import { Box, IconButton, InputBase, MenuItem, Select, Skeleton, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import QuotaDisplay from './QuotaDisplay';
import { getCompactActionSx, getInsetPanelSx } from '../styles/shared';
import { TRANSITIONS } from '../theme';

const SELECTOR_WIDTH = { xs: 176, sm: 210 };
const SELECTOR_HEIGHT = 34;
const SELECTOR_LABEL_MIN_WIDTH = { xs: 48, sm: 56 };
const SELECTOR_VALUE_GAP = 1;

function LlmSelectorBar({
  isNarrowLayout,
  onToggleSidebar,
  onNewChat,
  providerSelectValue,
  modelSelectValue,
  onProviderChange,
  onModelChange,
  llmOptionsLoading,
  providerOptions,
  modelOptions,
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const selectMenuProps = useMemo(
    () => ({
      PaperProps: {
        sx: {
          mt: 0.8,
          width: SELECTOR_WIDTH,
          maxWidth: SELECTOR_WIDTH,
          '& .MuiMenuItem-root': {
            ...theme.typography.uiSelectCompact,
            fontWeight: 500,
            borderRadius: 1.2,
            mx: 0.6,
            my: 0.2,
            minHeight: { xs: 40, sm: 32 },
          },
        },
      },
    }),
    [theme],
  );

  const selectorChipSx = useMemo(
    () => ({
      ...getInsetPanelSx(theme, {
        backgroundOpacity: isDarkMode ? 0.62 : 0.78,
        borderRadius: 1.75,
      }),
      display: 'flex',
      alignItems: 'stretch',
      width: SELECTOR_WIDTH,
      minWidth: 0,
      height: SELECTOR_HEIGHT,
      borderColor: alpha(theme.palette.text.primary, isDarkMode ? 0.08 : 0.12),
      backgroundColor: isDarkMode
        ? alpha(theme.palette.background.default, 0.52)
        : alpha(theme.palette.background.paper, 0.84),
      flexShrink: 0,
      overflow: 'hidden',
      transition: TRANSITIONS.default,
      '&:hover': {
        borderColor: alpha(theme.palette.text.primary, isDarkMode ? 0.16 : 0.22),
        backgroundColor: isDarkMode
          ? alpha(theme.palette.background.default, 0.68)
          : alpha(theme.palette.background.paper, 0.96),
      },
      '&:focus-within': {
        borderColor: alpha(theme.palette.text.primary, isDarkMode ? 0.2 : 0.26),
        boxShadow: `0 0 0 3px ${alpha(theme.palette.text.primary, isDarkMode ? 0.12 : 0.08)}`,
      },
    }),
    [isDarkMode, theme],
  );

  const selectorLabelSx = useMemo(
    () => ({
      ...theme.typography.uiMonoLabel,
      color: 'text.secondary',
      minWidth: SELECTOR_LABEL_MIN_WIDTH,
      flexShrink: 0,
      whiteSpace: 'nowrap',
    }),
    [theme],
  );

  const selectorValueRowSx = useMemo(
    () => ({
      display: 'flex',
      alignItems: 'center',
      gap: SELECTOR_VALUE_GAP,
      minWidth: 0,
      width: '100%',
      overflow: 'hidden',
    }),
    [],
  );

  const selectorValueTextSx = useMemo(
    () => ({
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    [],
  );

  const selectSx = useMemo(
    () => ({
      ...theme.typography.uiSelectCompact,
      fontWeight: 600,
      color: 'text.primary',
      minWidth: 0,
      width: '100%',
      height: '100%',
      borderRadius: 'inherit',
      transition: TRANSITIONS.default,
      '& .MuiSelect-select': {
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 'unset',
        px: { xs: 1, sm: 1.1 },
        py: 0,
        pr: 4,
        overflow: 'hidden',
        '&:focus': {
          backgroundColor: 'transparent',
        },
      },
      '& .MuiSelect-icon': {
        color: 'text.secondary',
        right: 10,
        transition: TRANSITIONS.default,
      },
      '&.Mui-focused .MuiSelect-icon': {
        color: 'text.primary',
      },
      '&.Mui-disabled': {
        opacity: 0.6,
      },
    }),
    [theme],
  );

  const renderSelectorValue = (label, value) => (
    <Box component="span" sx={selectorValueRowSx}>
      <Typography component="span" sx={selectorLabelSx}>
        {label}
      </Typography>
      <Box component="span" sx={selectorValueTextSx}>
        {value}
      </Box>
    </Box>
  );

  if (llmOptionsLoading) {
    return (
      <Box
        sx={{
          px: { xs: 1, sm: 2, md: 2.5 },
          pt: { xs: 0.75, md: 1.5 },
          pb: { xs: 0.5, md: 0.8 },
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: { xs: 0.75, sm: 0.85 },
          width: '100%',
        }}
      >
        {isNarrowLayout && (
          <Skeleton variant="rounded" width={32} height={32} sx={{ borderRadius: 1.5, flexShrink: 0 }} />
        )}
        <Skeleton
          variant="rounded"
          width={SELECTOR_WIDTH}
          height={SELECTOR_HEIGHT}
          sx={{ borderRadius: 1.75, flexShrink: 0 }}
        />
        <Skeleton
          variant="rounded"
          width={SELECTOR_WIDTH}
          height={SELECTOR_HEIGHT}
          sx={{ borderRadius: 1.75, flexShrink: 0 }}
        />
        {isNarrowLayout && (
          <Skeleton variant="rounded" width={32} height={32} sx={{ borderRadius: 1.5, flexShrink: 0 }} />
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        px: { xs: 1, sm: 2, md: 2.5 },
        pt: { xs: 0.75, md: 1.5 },
        pb: { xs: 0.5, md: 0.8 },
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: { xs: 0.75, sm: 0.85 },
        width: '100%',
      }}
    >
      {isNarrowLayout && (
        <IconButton
          size="small"
          onClick={onToggleSidebar}
          aria-label="Open sidebar"
          sx={{
            ...getCompactActionSx(theme),
            color: 'text.secondary',
            flexShrink: 0,
          }}
        >
          <MenuOutlinedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      )}

      <Box
        sx={{
          minWidth: 0,
          display: 'flex',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: { xs: 'flex-start', sm: 'center' },
          gap: { xs: 0.65, sm: 0.85 },
          flex: isNarrowLayout ? 1 : '0 1 auto',
          overflowX: { xs: 'auto', sm: 'visible' },
          scrollPaddingInline: theme.spacing(1),
          WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        }}
      >
        <Box sx={selectorChipSx}>
          <Select
            value={providerSelectValue}
            onChange={onProviderChange}
            disabled={providerOptions.length === 0}
            input={<InputBase />}
            displayEmpty
            MenuProps={selectMenuProps}
            sx={selectSx}
            renderValue={(val) => {
              const display = providerOptions.find((provider) => provider.name === val)?.label ?? val;
              return renderSelectorValue('Provider', display);
            }}
          >
            {providerOptions.map((provider) => (
              <MenuItem key={provider.name} value={provider.name}>
                {provider.label}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box sx={selectorChipSx}>
          <Select
            value={modelSelectValue}
            onChange={onModelChange}
            disabled={modelOptions.length === 0}
            input={<InputBase />}
            displayEmpty
            MenuProps={selectMenuProps}
            sx={selectSx}
            renderValue={(val) => renderSelectorValue('Model', val)}
          >
            {modelOptions.map((model) => (
              <MenuItem key={model} value={model}>
                {model}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            minHeight: SELECTOR_HEIGHT,
            flexShrink: 0,
          }}
        >
          <QuotaDisplay embedded />
        </Box>
      </Box>

      {isNarrowLayout && (
        <IconButton
          size="small"
          onClick={onNewChat}
          aria-label="Start new chat"
          sx={{
            ...getCompactActionSx(theme),
            color: 'text.primary',
            flexShrink: 0,
          }}
        >
          <EditNoteOutlinedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      )}
    </Box>
  );
}

export default memo(LlmSelectorBar);
