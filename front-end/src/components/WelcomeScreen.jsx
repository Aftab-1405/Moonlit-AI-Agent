import { memo } from 'react';
import { Box, Fade, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChatInput from './ChatInput';
import { getMoonlitGradient } from '../theme';
import { REDUCED_MOTION_QUERY } from '../styles/mediaQueries';
import { UI_LAYOUT } from '../styles/shared';

function WelcomeScreen({ visible, user, chatInputProps }) {
  const theme = useTheme();

  return (
    <Fade in={visible} timeout={300} unmountOnExit>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          position: 'absolute',
          inset: 0,
        }}
      >
        <Box
          sx={{
            textAlign: 'center',
            mb: 3,
            animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            [REDUCED_MOTION_QUERY]: {
              animation: 'none',
            },
          }}
        >
          <Typography
            variant="h3"
            sx={{
              fontWeight: 500,
              ...theme.typography.uiBrandWordmark,
              color: 'text.primary',
              letterSpacing: '-0.02em',
              mb: 1,
            }}
          >
            {user?.displayName ? (
              <>
                Moonlit welcomes,{' '}
                <Box
                  component="span"
                  sx={{
                    background: getMoonlitGradient(theme),
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    fontWeight: 600,
                  }}
                >
                  {user.displayName.split(' ')[0]}
                </Box>
              </>
            ) : (
              'Moonlit'
            )}
          </Typography>
        </Box>

        <Box sx={{ width: '100%', maxWidth: UI_LAYOUT.chatInputMaxWidth }}>
          <ChatInput {...chatInputProps} />
        </Box>
      </Box>
    </Fade>
  );
}

export default memo(WelcomeScreen);
