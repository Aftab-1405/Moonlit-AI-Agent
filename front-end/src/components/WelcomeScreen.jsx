import { memo } from 'react';
import { Box, Fade, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChatInput from './ChatInput';
import { UI_LAYOUT } from '../styles/shared';

function WelcomeScreen({ visible, user, chatInputProps }) {
  const theme = useTheme();
  const firstName = user?.displayName?.split(' ')[0];

  return (
    <Fade in={visible} timeout={300} unmountOnExit>
      <Box
        sx={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflowY: 'auto',
          px: { xs: 1, sm: 3 },
          py: { xs: 3, sm: 4 },
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: UI_LAYOUT.chatInputMaxWidth,
            mx: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: { xs: 2.5, sm: 3 },
            textAlign: 'center',
          }}
        >
          <Box>
            <Typography
              component="h1"
              sx={{
                fontFamily: theme.typography.fontFamily,
                fontSize: { xs: '2rem', sm: '2.5rem' },
                fontWeight: 500,
                lineHeight: 1.15,
                letterSpacing: '-0.03em',
                color: 'text.primary',
              }}
            >
              {firstName ? `How can I help today, ${firstName}?` : 'How can I help you today?'}
            </Typography>
          </Box>

          <Box sx={{ width: '100%' }}>
            <ChatInput {...chatInputProps} />
          </Box>
        </Box>
      </Box>
    </Fade>
  );
}

export default memo(WelcomeScreen);