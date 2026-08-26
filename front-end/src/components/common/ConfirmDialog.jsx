import { Box, Button, Typography, useMediaQuery, useTheme, Zoom } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { memo, useCallback, useId, useState } from 'react';
import ButtonLoadingSpinner from '@/components/common/ButtonLoadingSpinner';
import DialogShell from '@/components/common/DialogShell';
import {
  CONFIRM_ACTION_HEIGHT,
  getConfirmActionGeometrySx,
} from '@/components/common/dialogActionStyles';
import { ErrorIcon, HelpIcon, InfoIcon, SuccessIcon, WarningIcon } from '@/components/icons';
import {
  getInsetPanelSx,
  getInteractiveControlSx,
  getScrollbarStyles,
  UI_Z_INDEX,
} from '@/styles/shared';

const INTENT_CONFIG = {
  default: {
    color: 'primary',
    icon: HelpIcon,
  },
  info: {
    color: 'info',
    icon: InfoIcon,
  },
  warning: {
    color: 'warning',
    icon: WarningIcon,
  },
  danger: {
    color: 'error',
    icon: ErrorIcon,
  },
  success: {
    color: 'success',
    icon: SuccessIcon,
  },
};

const DEFAULT_DESCRIPTION = 'Are you sure you want to proceed?';

function getIntentConfig(intent) {
  return INTENT_CONFIG[intent] || INTENT_CONFIG.default;
}

function getPaperMaxWidth(maxWidth) {
  if (maxWidth === 'xs') return 420;
  if (maxWidth === 'sm') return 560;
  if (maxWidth === 'md') return 720;
  return undefined;
}

function getDetailsSx(theme, variant) {
  const intentColor = variant === 'danger' ? theme.palette.error.main : theme.palette.text.primary;

  return {
    ...getInsetPanelSx(theme, {
      borderRadius: '8px',
    }),
    backgroundColor:
      variant === 'danger'
        ? alpha(theme.palette.error.main, theme.palette.opacity.soft)
        : theme.palette.layer.faint,
    maxHeight: variant === 'code' ? 220 : 180,
    overflow: 'auto',
    color: intentColor,
    p: variant === 'plain' ? 1.5 : 1.5,
    ...getScrollbarStyles(theme),
    ...(variant === 'code'
      ? {
          fontFamily: theme.typography.fontFamilyMono,
          fontSize: theme.typography.uiCodeBlock.fontSize,
          lineHeight: theme.typography.uiCodeBlock.lineHeight,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }
      : {
          ...theme.typography.uiBodySm,
          lineHeight: 1.55,
          overflowWrap: 'anywhere',
        }),
  };
}

/**
 * Generic confirmation dialog for reusable app actions.
 */
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm action',
  description,
  message,
  children = null,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  intent = 'default',
  confirmColor,
  icon = null,
  showIcon = false,
  loading,
  loadingText = 'Working',
  disabled = false,
  maxWidth = 'xs',
  closeOnConfirm = false,
  preventCloseWhileLoading = true,
  details = null,
  detailsLabel,
  detailsVariant = 'plain',
  primaryActionProps = {},
  secondaryActionProps = {},
  contentSx = {},
  footerSx = {},
  paperSx = {},
  rootSx = {},
}) {
  const theme = useTheme();
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const titleId = useId();
  const descriptionId = useId();
  const [internalLoading, setInternalLoading] = useState(false);
  const resolvedDescription =
    description !== undefined ? description : message !== undefined ? message : DEFAULT_DESCRIPTION;

  const intentConfig = getIntentConfig(intent);
  const accentColor = theme.palette[intentConfig.color]?.main || theme.palette.primary.main;
  const resolvedConfirmColor = confirmColor || (intent === 'danger' ? 'error' : intentConfig.color);
  const IconComponent = intentConfig.icon;
  const isControlledLoading = loading !== undefined;
  const isLoading = isControlledLoading ? loading : internalLoading;
  const isActionDisabled = disabled || isLoading;
  const isCloseDisabled = preventCloseWhileLoading && isLoading;
  const { sx: primaryActionSx, ...restPrimaryActionProps } = primaryActionProps;
  const { sx: secondaryActionSx, ...restSecondaryActionProps } = secondaryActionProps;

  const handleConfirm = useCallback(async () => {
    if (isActionDisabled) return;

    if (!isControlledLoading) {
      setInternalLoading(true);
    }

    try {
      await onConfirm?.();
      if (closeOnConfirm) {
        onClose?.();
      }
    } finally {
      if (!isControlledLoading) {
        setInternalLoading(false);
      }
    }
  }, [closeOnConfirm, isActionDisabled, isControlledLoading, onClose, onConfirm]);

  const handleClose = useCallback(
    (event, reason) => {
      if (isCloseDisabled) return;
      onClose?.(event, reason);
    },
    [isCloseDisabled, onClose],
  );

  return (
    <DialogShell
      open={open}
      onClose={handleClose}
      isMobile={false}
      maxWidth={maxWidth}
      desktopMaxHeight="calc(100vh - 32px)"
      desktopMinHeight={0}
      showCloseButton={false}
      TransitionComponent={Zoom}
      transitionDuration={{ enter: 200, exit: 140 }}
      ariaLabelledBy={title ? titleId : undefined}
      ariaDescribedBy={resolvedDescription ? descriptionId : undefined}
      rootSx={{ zIndex: UI_Z_INDEX.confirmModal, ...rootSx }}
      paperSx={{
        width: 'calc(100% - 32px)',
        maxWidth: getPaperMaxWidth(maxWidth),
        height: 'auto',
        minHeight: 0,
        maxHeight: 'calc(100vh - 32px)',
        m: 2,
        ...paperSx,
      }}
      bodySx={{ flexDirection: 'column', minHeight: 0 }}
      footer={
        <>
          <Button
            {...restSecondaryActionProps}
            size="small"
            variant="text"
            onClick={handleClose}
            color="inherit"
            disabled={isCloseDisabled}
            fullWidth={isCompactMobile}
            sx={{
              minWidth: { xs: '100%', sm: 72 },
              px: 1.25,
              py: 0,
              ...theme.typography.uiNavItem,
              fontWeight: 400,
              ...getInteractiveControlSx(theme, {
                size: CONFIRM_ACTION_HEIGHT,
                radius: theme.shape.radius.pill,
              }),
              ...getConfirmActionGeometrySx(theme),
              ...secondaryActionSx,
            }}
          >
            {cancelText}
          </Button>
          <Button
            {...restPrimaryActionProps}
            size="small"
            variant="contained"
            onClick={handleConfirm}
            disabled={isActionDisabled}
            color={resolvedConfirmColor}
            fullWidth={isCompactMobile}
            startIcon={isLoading ? <ButtonLoadingSpinner /> : null}
            sx={{
              minWidth: { xs: '100%', sm: 78 },
              ...getConfirmActionGeometrySx(theme),
              px: 1.5,
              py: 0,
              ...theme.typography.uiNavItem,
              fontWeight: 400,
              boxShadow: 'none',
              '&:hover': {
                boxShadow: 'none',
              },
              '& .MuiButton-startIcon': {
                ml: 0,
                mr: 0.75,
              },
              ...primaryActionSx,
            }}
          >
            {isLoading ? loadingText : confirmText}
          </Button>
        </>
      }
      footerSx={{
        px: { xs: 2, sm: 3 },
        pt: 0,
        pb: { xs: 2, sm: 3 },
        borderTop: 0,
        justifyContent: 'flex-end',
        gap: 1,
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        flexWrap: 'nowrap',
        bgcolor: 'transparent',
        ...footerSx,
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 3 },
          pb: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minHeight: 0,
          overflow: 'auto',
          ...getScrollbarStyles(theme),
          ...contentSx,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.75, minWidth: 0 }}>
          {showIcon ? (
            <Box
              aria-hidden="true"
              sx={{
                width: 42,
                height: 42,
                borderRadius: '8px',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                color: accentColor,
                backgroundColor: alpha(accentColor, theme.palette.opacity.medium),
                border: 0,
                boxShadow: 'none',
              }}
            >
              {icon || <IconComponent sx={{ fontSize: 22 }} />}
            </Box>
          ) : null}
          <Box sx={{ minWidth: 0, pt: showIcon ? 0.15 : 0 }}>
            {title ? (
              <Typography
                id={titleId}
                variant="h6"
                sx={{
                  color: 'text.primary',
                  fontWeight: 400,
                  fontSize: '1.075rem',
                  lineHeight: 1.25,
                  letterSpacing: '-0.015em',
                  overflowWrap: 'anywhere',
                }}
              >
                {title}
              </Typography>
            ) : null}
            {resolvedDescription ? (
              <Typography
                id={descriptionId}
                sx={{
                  mt: 0.75,
                  ...theme.typography.uiBodySm,
                  color: 'text.secondary',
                  lineHeight: 1.5,
                  overflowWrap: 'anywhere',
                }}
              >
                {resolvedDescription}
              </Typography>
            ) : null}
          </Box>
        </Box>

        {children}

        {details !== null && details !== undefined ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {detailsLabel ? (
              <Typography sx={{ ...theme.typography.uiCaptionMd, color: 'text.disabled' }}>
                {detailsLabel}
              </Typography>
            ) : null}
            <Box sx={getDetailsSx(theme, detailsVariant)}>{details}</Box>
          </Box>
        ) : null}
      </Box>
    </DialogShell>
  );
}

export default memo(ConfirmDialog);
