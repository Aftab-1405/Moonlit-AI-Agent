import { Box, Portal } from '@mui/material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { memo } from 'react';
import Notification from '@/components/ui/toast';
import { UI_Z_INDEX } from '@/styles/shared';

const MotionBox = motion.create(Box);

const ToastStack = memo(function ToastStack({ notifications, removeToast, isNarrowLayout }) {
  const reduceMotion = useReducedMotion();
  // Mount active notices outside page content hidden by an open modal.
  return (
    <Portal>
      <AnimatePresence>
        {notifications.length > 0 && (
          <MotionBox
            key="notifications"
            exit={{ opacity: reduceMotion ? 1 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            sx={{
              position: 'fixed',
              bottom: { xs: 16, sm: 24 },
              right: isNarrowLayout ? 'auto' : 24,
              left: isNarrowLayout ? '50%' : 'auto',
              transform: isNarrowLayout ? 'translateX(-50%)' : 'none',
              zIndex: (theme) => Math.max(theme.zIndex.snackbar, UI_Z_INDEX.confirmModal + 1),
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
              pointerEvents: 'none',
              width: { xs: 'calc(100% - 32px)', sm: 'auto' },
              maxWidth: 380,
            }}
          >
            <AnimatePresence>
              {notifications.map((notification) => (
                <Notification
                  key={notification.id}
                  type={notification.type}
                  title={notification.title}
                  message={notification.message}
                  showIcon={notification.showIcon}
                  duration={notification.duration}
                  onClose={() => removeToast(notification.id)}
                />
              ))}
            </AnimatePresence>
          </MotionBox>
        )}
      </AnimatePresence>
    </Portal>
  );
});

export default ToastStack;
