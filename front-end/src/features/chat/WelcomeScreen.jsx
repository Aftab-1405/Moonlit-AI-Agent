import { Box, Fade, Typography } from '@mui/material';
import { keyframes, useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChatInput from '@/features/chat/ChatInput';
import WelcomeSuggestions from '@/features/chat/WelcomeSuggestions';
import { getWelcomeHeroSx, getWelcomeLayoutSx } from '@/features/styles/interfaceChrome';
import {
  getWelcomeCategories,
  getWelcomeGreeting,
  getWelcomePeriodBoundaryDelay,
  runWelcomeEntry,
} from './welcomeSuggestions.js';

/**
 * WelcomeScreen — empty-state hero shown when no conversation is selected.
 *
 * Renders the greeting headline + composer + connection-aware suggestions. The greeting
 * stays monochrome so the composer remains the visual anchor.
 */

/** Soft entrance animation — fades content up from 4px below. */
const softReveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const welcomeShimmer = keyframes`
  from { background-position: 150% 50%; }
  to { background-position: -150% 50%; }
`;

const WELCOME_LAYOUT = getWelcomeLayoutSx();

function WelcomeScreen({ visible, user, chatInputProps, onOpenDatabase }) {
  const theme = useTheme();
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [greetingRevision, setGreetingRevision] = useState(0);
  const {
    disabled = false,
    isConnected = false,
    isStreaming = false,
    onSend,
  } = chatInputProps || {};
  const previousIsConnectedRef = useRef(isConnected);
  const categories = useMemo(() => getWelcomeCategories(isConnected), [isConnected]);
  const greeting = getWelcomeGreeting({
    date: new Date(),
    displayName: user?.displayName,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the revision deliberately reschedules at each greeting boundary.
  useEffect(() => {
    if (!visible) return undefined;
    const now = new Date();
    const greetingTimerId = setTimeout(
      () => setGreetingRevision((revision) => revision + 1),
      getWelcomePeriodBoundaryDelay(now),
    );
    return () => clearTimeout(greetingTimerId);
  }, [greetingRevision, visible]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset welcome-only UI state when Fade hides and unmounts its child.
    if (!visible) setActiveCategoryId(null);
  }, [visible]);

  useEffect(() => {
    if (previousIsConnectedRef.current !== isConnected) {
      previousIsConnectedRef.current = isConnected;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Connection changes replace the available welcome catalog.
      setActiveCategoryId(null);
    }
  }, [isConnected]);

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
    <Fade in={visible} timeout={300} unmountOnExit>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'safe center',
          justifyContent: 'center',
          overflowY: 'auto',
          ...WELCOME_LAYOUT.outer,
        }}
      >
        <Box
          sx={{
            width: '100%',
            mx: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            ...WELCOME_LAYOUT.content,
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              width: '100%',
              animation: visible ? `${softReveal} 200ms ease-out both` : 'none',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            <Typography
              component="h1"
              sx={{
                ...getWelcomeHeroSx(theme, welcomeShimmer),
                mx: 'auto',
              }}
            >
              {greeting}
            </Typography>
          </Box>

          <Box
            sx={{
              width: '100%',
              animation: visible ? `${softReveal} 240ms ease-out both` : 'none',
              animationDelay: visible ? '45ms' : '0ms',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            <ChatInput {...chatInputProps}>
              <WelcomeSuggestions
                key={isConnected ? 'connected' : 'disconnected'}
                categories={categories}
                activeCategoryId={activeCategoryId}
                onCategoryChange={setActiveCategoryId}
                onActivate={handleActivate}
                canOpenDatabase={typeof onOpenDatabase === 'function'}
                disabled={disabled || isStreaming || typeof onSend !== 'function'}
              />
            </ChatInput>
          </Box>
        </Box>
      </Box>
    </Fade>
  );
}

export default memo(WelcomeScreen);
