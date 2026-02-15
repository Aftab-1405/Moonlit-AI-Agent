import { memo, useMemo } from 'react';
import { Box, FormControl, IconButton, Input, MenuItem, Select } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import QuotaDisplay from './QuotaDisplay';
import { BACKDROP_FILTER_FALLBACK_QUERY } from '../styles/mediaQueries';

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
  const selectMenuProps = useMemo(() => ({
    PaperProps: {
      sx: {
        mt: 0.8,
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
  }), [theme]);
  const selectorChipBaseSx = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: { xs: 0.55, sm: 0.8 },
    px: { xs: 0.9, sm: 1 },
    py: 0.45,
    borderRadius: '14px',
    border: '1px solid',
    borderColor: alpha(theme.palette.divider, isDarkMode ? 0.2 : 0.38),
    backgroundColor: isDarkMode
      ? alpha(theme.palette.background.default, 0.42)
      : alpha(theme.palette.background.default, 0.96),
    flexShrink: 0,
  }), [isDarkMode, theme]);

  return (
    <Box
      sx={{
        px: { xs: 1, sm: 2, md: 2.5 },
        pt: { xs: 0.75, md: 1.5 },
        pb: { xs: 0.5, md: 0.8 },
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '44px minmax(0, 1fr) 44px', sm: 'auto' },
          alignItems: 'center',
          columnGap: { xs: 0.75, sm: 0 },
          width: { xs: '100%', sm: 'fit-content' },
          maxWidth: '100%',
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, isDarkMode ? 0.2 : 0.4),
          borderRadius: '18px',
          background: isDarkMode
            ? `linear-gradient(155deg, ${alpha(theme.palette.background.paper, 0.62)} 0%, ${alpha(theme.palette.background.elevated, 0.44)} 100%)`
            : `linear-gradient(155deg, ${alpha(theme.palette.background.default, 0.985)} 0%, ${alpha(theme.palette.background.default, 0.96)} 100%)`,
          backdropFilter: isDarkMode ? 'blur(14px)' : 'none',
          WebkitBackdropFilter: isDarkMode ? 'blur(14px)' : 'none',
          [BACKDROP_FILTER_FALLBACK_QUERY]: {
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          },
          [theme.breakpoints.down('sm')]: {
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          },
          boxShadow: 'none',
          px: { xs: 0.5, sm: 0.75 },
          py: { xs: 0.5, sm: 0.75 },
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        }}
      >
        {isNarrowLayout && (
          <IconButton
            size="small"
            onClick={onToggleSidebar}
            aria-label="Open sidebar"
            sx={{
              width: 44,
              height: 44,
              color: 'text.secondary',
              justifySelf: 'start',
            }}
          >
            <MenuOutlinedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        )}
        <Box
          sx={{
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: { xs: 0.65, sm: 0.85 },
            flexWrap: 'nowrap',
            overflowX: { xs: 'auto', sm: 'visible' },
            WebkitOverflowScrolling: 'touch',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          <Box sx={selectorChipBaseSx}>
            <HubOutlinedIcon
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                fontSize: 16,
                color: 'text.secondary',
              }}
            />
            <FormControl
              size="small"
              variant="standard"
              sx={{
                minWidth: { xs: 86, sm: 98 },
                maxWidth: { xs: 124, sm: 150 },
              }}
            >
              <Select
                value={providerSelectValue}
                onChange={onProviderChange}
                disabled={llmOptionsLoading || providerOptions.length === 0}
                input={<Input disableUnderline />}
                displayEmpty
                MenuProps={selectMenuProps}
                sx={{
                  ...theme.typography.uiSelectCompact,
                  fontWeight: 600,
                  color: 'text.primary',
                  '& .MuiSelect-select': {
                    py: 0,
                    pr: 2,
                    minHeight: 'unset',
                  },
                }}
              >
                {providerOptions.map((provider) => (
                  <MenuItem key={provider.name} value={provider.name}>
                    {provider.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box
            sx={{
              ...selectorChipBaseSx,
              minWidth: { xs: 118, sm: 150 },
              width: 'fit-content',
              maxWidth: { xs: 188, sm: 220 },
              flex: { xs: '0 0 auto', sm: '0 1 auto' },
            }}
          >
            <SmartToyOutlinedIcon
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                fontSize: 16,
                color: 'text.secondary',
              }}
            />
            <FormControl
              size="small"
              variant="standard"
              sx={{ width: 'auto', minWidth: 0, maxWidth: '100%' }}
            >
              <Select
                value={modelSelectValue}
                onChange={onModelChange}
                disabled={llmOptionsLoading || modelOptions.length === 0}
                input={<Input disableUnderline />}
                displayEmpty
                MenuProps={selectMenuProps}
                sx={{
                  ...theme.typography.uiSelectCompact,
                  fontWeight: 600,
                  color: 'text.primary',
                  '& .MuiSelect-select': {
                    py: 0,
                    pr: 2,
                    minHeight: 'unset',
                    maxWidth: { xs: 126, sm: 150 },
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                {modelOptions.map((model) => (
                  <MenuItem key={model} value={model}>
                    {model}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              px: 0.25,
              ml: { xs: 0, sm: 0.2 },
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
              width: 44,
              height: 44,
              color: 'text.primary',
              justifySelf: 'end',
            }}
          >
            <EditNoteOutlinedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

export default memo(LlmSelectorBar);
