import { useAppearanceReducedMotion } from '@/hooks/useAppearanceReducedMotion';
import { Box, IconButton, Modal } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CloseIcon } from '@/components/icons';

/**
 * Drawer — accessible slide-in panel built on framer-motion.
 *
 * Used by the mobile sidebar and any other overlay panel that needs to
 * slide in from a screen edge. Composes three sub-components:
 *
 *   Drawer (open, onOpenChange, side) wraps:
 *     DrawerOverlay     - click-to-close backdrop
 *     DrawerContent     - the sliding panel itself
 *
 * Accessibility:
 *   - MUI Modal owns focus containment, focus restoration, and Escape handling.
 *   - Close button has `aria-label="Close"` and a visible focus ring.
 *   - Backdrop click dismisses.
 *
 * The sliding panel is separated from the canvas with a single hairline.
 */

const DrawerContext = createContext(undefined);

const useDrawerContext = () => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawerContext must be used within a DrawerProvider');
  }
  return context;
};

export const Drawer = ({
  children,
  open,
  onOpenChange,
  onExited,
  side = 'right',
  initialFocusRef,
}) => {
  const [present, setPresent] = useState(open);
  const exitPendingRef = useRef(false);
  const reduceMotion = useAppearanceReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => setPresent(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!present || !open) return undefined;
    const frame = requestAnimationFrame(() => initialFocusRef?.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialFocusRef, open, present]);

  useEffect(() => {
    if (!present || open || !reduceMotion) return undefined;
    const frame = requestAnimationFrame(() => setPresent(false));
    return () => cancelAnimationFrame(frame);
  }, [open, present, reduceMotion]);

  useEffect(() => {
    if (!exitPendingRef.current || present || open) return;
    exitPendingRef.current = false;
    onExited?.();
  }, [onExited, open, present]);

  const handlePanelExitComplete = () => {
    if (!open) {
      exitPendingRef.current = true;
      setPresent(false);
    }
  };

  useEffect(() => {
    if (!open && present) exitPendingRef.current = true;
  }, [open, present]);

  return (
    <DrawerContext.Provider
      value={{
        open,
        onOpenChange,
        side,
        reduceMotion,
        onPanelExitComplete: handlePanelExitComplete,
      }}
    >
      <Modal
        open={open || present}
        hideBackdrop
        onClose={(_event, reason) => {
          if (reason === 'escapeKeyDown') onOpenChange(false);
        }}
        aria-label="Sidebar"
      >
        <Box sx={{ position: 'fixed', inset: 0, outline: 'none' }}>{children}</Box>
      </Modal>
    </DrawerContext.Provider>
  );
};

const MotionBox = motion.create(Box);

export const DrawerOverlay = React.forwardRef(({ sx, ...props }, ref) => {
  const { open, onOpenChange, reduceMotion } = useDrawerContext();
  const theme = useTheme();
  return (
    <MotionBox
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeInOut' }}
      onClick={() => onOpenChange(false)}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: theme.zIndex.drawer,
        backgroundColor: theme.palette.overlay.scrim,
        ...sx,
      }}
      {...props}
    />
  );
});
DrawerOverlay.displayName = 'DrawerOverlay';

export const DrawerContent = React.forwardRef(
  ({ sx, children, showCloseButton = true, ...props }, ref) => {
    const { open, onOpenChange, side, reduceMotion, onPanelExitComplete } = useDrawerContext();
    const theme = useTheme();

    const sideStyles = {
      top: {
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: 'auto',
        maxHeight: '80vh',
        borderBottom: `1px solid ${theme.palette.divider}`,
      },
      bottom: {
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: 'auto',
        maxHeight: '80vh',
        borderTop: `1px solid ${theme.palette.divider}`,
      },
      left: {
        top: 0,
        bottom: 0,
        left: 0,
        height: '100%',
        width: 260,
        maxWidth: '90vw',
        borderRight: `1px solid ${theme.palette.divider}`,
      },
      right: {
        top: 0,
        bottom: 0,
        right: 0,
        height: '100%',
        width: 260,
        maxWidth: '90vw',
        borderLeft: `1px solid ${theme.palette.divider}`,
      },
    };

    const getClosedTransform = () => {
      switch (side) {
        case 'top':
          return { y: '-100%' };
        case 'bottom':
          return { y: '100%' };
        case 'left':
          return { x: '-100%' };
        case 'right':
          return { x: '100%' };
        default:
          return { x: '100%' };
      }
    };

    const closedTransform = getClosedTransform();
    const openTransform = side === 'top' || side === 'bottom' ? { y: 0 } : { x: 0 };

    return (
      <MotionBox
        ref={ref}
        sx={{
          position: 'fixed',
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: 'background.paper',
          color: 'text.primary',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...sideStyles[side],
          ...sx,
        }}
        initial={closedTransform}
        animate={open ? openTransform : closedTransform}
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                type: 'spring',
                stiffness: 320,
                damping: 32,
              }
        }
        onAnimationComplete={() => {
          if (!open && !reduceMotion) onPanelExitComplete();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Sidebar"
        {...props}
      >
        {children}
        {showCloseButton && (
          <IconButton
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            size="small"
            sx={{
              position: 'absolute',
              // Use safe-area-aware top so the button never collides with the
              // status bar / notch on mobile.
              top: 'max(env(safe-area-inset-top), 12px)',
              right: 12,
              color: 'text.secondary',
              borderRadius: '50%',
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
                color: 'text.primary',
              },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.border.focus}`,
                outlineOffset: 2,
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </MotionBox>
    );
  },
);
DrawerContent.displayName = 'DrawerContent';
