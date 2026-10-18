'use client';
import { IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import {
  CloseIcon,
  ErrorIcon,
  InfoIcon,
  ProcessingIcon,
  SuccessIcon,
  WarningIcon,
} from '@/components/icons';
import { getInteractiveIconButtonSx } from '@/styles/shared';

const MotionDiv = motion.div;

/**
 * Notification (toast) — transient status message.
 *
 * Renders into the shared fixed-position ToastStack used by chat and dashboard. Each toast:
 *   - Animates in (spring) and out (fade).
 *   - Shows an icon + title + optional message.
 *   - Auto-dismisses after `duration` ms (if provided) with a thin progress bar.
 *   - Has a manual close button with visible focus ring.
 *
 * The toast pulls colors directly from the centralized dark theme palette.
 */
const STATUS_ICON_SX = { fontSize: 20 };

const LoadingIcon = () => {
  const reduceMotion = useReducedMotion();
  return (
    <MotionDiv
      animate={reduceMotion ? undefined : { rotate: 360 }}
      transition={reduceMotion ? undefined : { repeat: Infinity, duration: 1, ease: 'linear' }}
      style={{ width: 20, height: 20, display: 'inline-flex' }}
    >
      <ProcessingIcon sx={STATUS_ICON_SX} />
    </MotionDiv>
  );
};

const Notification = ({ type, title, message, showIcon = true, duration, onClose }) => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const isError = type === 'error';

  useEffect(() => {
    if (!Number.isFinite(duration) || duration <= 0) return undefined;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // Resolve config styling and icons dynamically based on theme palette
  const config = useMemo(() => {
    switch (type) {
      case 'success':
        return {
          iconColor: theme.palette.success.main,
          icon: <SuccessIcon sx={STATUS_ICON_SX} />,
        };
      case 'error':
        return {
          iconColor: theme.palette.error.main,
          icon: <ErrorIcon sx={STATUS_ICON_SX} />,
        };
      case 'warning':
        return {
          iconColor: theme.palette.warning.main,
          icon: <WarningIcon sx={STATUS_ICON_SX} />,
        };
      case 'loading':
        return {
          iconColor: theme.palette.text.secondary,
          icon: <LoadingIcon />,
        };
      default:
        return {
          iconColor: theme.palette.info.main,
          icon: <InfoIcon sx={STATUS_ICON_SX} />,
        };
    }
  }, [type, theme]);

  return (
    <MotionDiv
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      initial={reduceMotion ? false : { opacity: 0, y: 25, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9, transition: { duration: 0.18 } }
      }
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28 }}
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: '8px',
        padding: '14px 16px',
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.border.subtle}`,
        boxShadow: 'none',
        overflow: 'hidden',
        pointerEvents: 'auto',
        transition: 'transform 0.15s ease-in-out',
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          width: '100%',
        }}
      >
        {showIcon && (
          <div
            style={{
              flexShrink: 0,
              color: config.iconColor,
              display: 'flex',
              alignItems: 'center',
              height: '20px',
            }}
          >
            {config.icon}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              fontWeight: 400,
              fontSize: '14px',
              color: theme.palette.text.primary,
              lineHeight: 1.45,
            }}
          >
            {title}
          </span>
          {message && (
            <span
              style={{
                fontSize: '12px',
                color: theme.palette.text.secondary,
                lineHeight: 1.4,
                wordBreak: 'break-word',
                marginTop: '1px',
              }}
            >
              {message}
            </span>
          )}
        </div>

        <IconButton
          onClick={onClose}
          aria-label="Dismiss notification"
          size="small"
          sx={{
            ...getInteractiveIconButtonSx(theme, {
              size: { xs: 44, md: 28 },
              radius: theme.shape.radius.pill,
            }),
            flexShrink: 0,
            color: 'text.disabled',
            '&:hover': {
              color: 'text.primary',
              backgroundColor: 'action.hover',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </div>

      {duration && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '3px',
            width: '100%',
            backgroundColor: theme.palette.layer.faint,
            zIndex: 2,
          }}
        >
          <MotionDiv
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: reduceMotion ? 0 : duration / 1000, ease: 'linear' }}
            style={{
              height: '100%',
              backgroundColor: config.iconColor,
            }}
          />
        </div>
      )}
    </MotionDiv>
  );
};

export default Notification;
