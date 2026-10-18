import { alpha } from '@mui/material/styles';

export function getConnectionActionState({ loading, connected }) {
  if (connected) {
    return { label: 'Connected', tone: 'success', disabled: true };
  }

  if (loading) {
    return { label: 'Connecting', tone: 'primary', disabled: true };
  }

  return { label: 'Connect', tone: 'primary', disabled: false };
}

export function getConnectedActionDisabledSx(theme) {
  const successColor = theme.palette.success.main;

  return {
    '&.Mui-disabled': {
      color: successColor,
      backgroundColor: alpha(successColor, theme.palette.opacity.statusBackground),
      borderColor: alpha(successColor, theme.palette.opacity.statusBorder),
    },
  };
}
