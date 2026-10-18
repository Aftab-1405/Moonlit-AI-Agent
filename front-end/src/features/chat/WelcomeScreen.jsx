import { Box, Fade, Typography } from '@mui/material';
import { keyframes, useTheme } from '@mui/material/styles';
import { memo, useCallback, useMemo, useState } from 'react';
import WelcomeSuggestions from '@/features/chat/WelcomeSuggestions';
import { getWelcomeHeroSx, getWelcomeLayoutSx } from '@/features/styles/interfaceChrome';
import { getWelcomeCategories, runWelcomeEntry } from './welcomeSuggestions.js';

const softReveal = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`;

const WELCOME_LAYOUT = getWelcomeLayoutSx();

function WelcomeScreen({ visible }) {
  const theme = useTheme();
  return (
    <Fade in={visible} timeout={160} unmountOnExit>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          minHeight: 0,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          px: { xs: 1, md: 3 },
          pb: { xs: 2, sm: 2.5, md: 3 },
          textAlign: 'center',
          pointerEvents: 'none',
          animation: visible ? `${softReveal} 200ms ease-out both` : 'none',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <Typography
          component="h1"
          sx={{
            ...getWelcomeHeroSx(theme),
            mx: 'auto',
          }}
        >
          What should we explore?
        </Typography>
      </Box>
    </Fade>
  );
}

export const WelcomeSuggestionsPanel = memo(function WelcomeSuggestionsPanel({
  visible,
  chatInputProps,
  onOpenDatabase,
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const {
    disabled = false,
    isConnected = false,
    isStreaming = false,
    onSend,
  } = chatInputProps || {};
  const categories = useMemo(() => getWelcomeCategories(isConnected), [isConnected]);

  const handleActivate = useCallback(
    (entry) =>
      runWelcomeEntry(entry, {
        canSend: !disabled && !isStreaming,
        onSend,
        onOpenDatabase,
      }),
    [disabled, isStreaming, onOpenDatabase, onSend],
  );

  return (
    <Fade in={visible} timeout={160} unmountOnExit onExited={() => setActiveCategoryId(null)}>
      <Box sx={WELCOME_LAYOUT.suggestions}>
        <WelcomeSuggestions
          key={isConnected ? 'connected' : 'disconnected'}
          categories={categories}
          activeCategoryId={activeCategoryId}
          onCategoryChange={setActiveCategoryId}
          onActivate={handleActivate}
          canOpenDatabase={typeof onOpenDatabase === 'function'}
          disabled={disabled || isStreaming || typeof onSend !== 'function'}
        />
      </Box>
    </Fade>
  );
});

export default memo(WelcomeScreen);
