import { Box } from '@mui/material';

function ButtonLoadingSpinner({ size = 16, sx = {} }) {
  return (
    <Box
      component="svg"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        color: 'currentColor',
        display: 'block',
        transformOrigin: 'center',
        animation: 'buttonSpinnerRotate 760ms linear infinite',
        '@keyframes buttonSpinnerRotate': {
          to: { transform: 'rotate(360deg)' },
        },
        'html[data-moonlit-reduced-motion="true"] &': {
          animation: 'none',
        },
        ...sx,
      }}
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Box>
  );
}

export default ButtonLoadingSpinner;
