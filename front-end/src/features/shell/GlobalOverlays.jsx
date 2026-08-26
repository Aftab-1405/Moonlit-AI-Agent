// GlobalOverlays — single mount point for all application-shell-level overlays.
//
// Each overlay is lazy-loaded where appropriate so its code is split out of
// the initial bundle. Overlays mounted here:
//
//   - DatabaseModal                (lazy)   connect/switch database
//   - SettingsModal                (lazy)   user settings
//   - SchemaMindmapDialog                   schema mindmap full-screen overlay
//   - ConfirmDialog                         run-query confirmation
//   - ConfirmDialog                         delete-conversation confirmation

import { Box } from '@mui/material';
import { AnimatePresence } from 'framer-motion';
import { lazy, memo, Suspense } from 'react';
import { ConfirmDialog } from '@/components';
import Notification from '@/components/ui/toast';
import SchemaMindmapDialog from '@/features/overlays/mindmap';

const DatabaseModal = lazy(() => import('@/features/overlays/database/DatabaseModal'));
const SettingsModal = lazy(() => import('@/features/overlays/settings/SettingsModal'));

const ModalLayer = memo(
  function ModalLayer({
    dbModalOpen,
    handleCloseDbModal,
    handleDbConnect,
    handleDbModalSelectDatabase,
    isDbConnected,
    currentDatabase,
    availableDatabases,
    dbModalInitialType,
    settingsOpen,
    handleCloseSettings,
    settingsInitialSection,
  }) {
    return (
      <>
        <Suspense fallback={null}>
          <DatabaseModal
            open={dbModalOpen}
            onClose={handleCloseDbModal}
            onConnect={handleDbConnect}
            onSelectDatabase={handleDbModalSelectDatabase}
            isConnected={isDbConnected}
            currentDatabase={currentDatabase}
            availableDatabases={availableDatabases}
            initialDbType={dbModalInitialType}
          />
        </Suspense>
        <Suspense fallback={null}>
          <SettingsModal
            open={settingsOpen}
            onClose={handleCloseSettings}
            initialSection={settingsInitialSection}
          />
        </Suspense>
      </>
    );
  },
  (prev, next) =>
    prev.dbModalOpen === next.dbModalOpen &&
    prev.settingsOpen === next.settingsOpen &&
    prev.isDbConnected === next.isDbConnected &&
    prev.currentDatabase === next.currentDatabase &&
    prev.availableDatabases === next.availableDatabases &&
    prev.dbModalInitialType === next.dbModalInitialType &&
    prev.settingsInitialSection === next.settingsInitialSection,
);

const ToastStack = memo(function ToastStack({ notifications, removeToast, isNarrowLayout }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: { xs: 16, sm: 24 },
        right: isNarrowLayout ? 'auto' : 24,
        left: isNarrowLayout ? '50%' : 'auto',
        transform: isNarrowLayout ? 'translateX(-50%)' : 'none',
        zIndex: (th) => th.zIndex.snackbar,
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
    </Box>
  );
});

const GlobalOverlays = memo(function GlobalOverlays({
  // Modals
  dbModalOpen,
  handleCloseDbModal,
  handleDbConnect,
  handleDbModalSelectDatabase,
  isDbConnected,
  currentDatabase,
  availableDatabases,
  dbModalInitialType,
  settingsOpen,
  handleCloseSettings,
  settingsInitialSection,
  // Toasts
  notifications,
  removeToast,
  isNarrowLayout,
  // Run-query confirmation
  confirmDialog,
  handleConfirmDialogClose,
  // Delete conversation confirmation
  deleteConversationDialog,
  handleDeleteConversationDialogClose,
  handleDeleteConversationConfirm,
  // Schema mindmap
  mindmapOpen,
  handleCloseMindmap,
  schemaLoading,
  schemaData,
  theme,
}) {
  return (
    <>
      <ModalLayer
        dbModalOpen={dbModalOpen}
        handleCloseDbModal={handleCloseDbModal}
        handleDbConnect={handleDbConnect}
        handleDbModalSelectDatabase={handleDbModalSelectDatabase}
        isDbConnected={isDbConnected}
        currentDatabase={currentDatabase}
        availableDatabases={availableDatabases}
        dbModalInitialType={dbModalInitialType}
        settingsOpen={settingsOpen}
        handleCloseSettings={handleCloseSettings}
        settingsInitialSection={settingsInitialSection}
      />

      <ToastStack
        notifications={notifications}
        removeToast={removeToast}
        isNarrowLayout={isNarrowLayout}
      />

      <SchemaMindmapDialog
        open={mindmapOpen}
        onClose={handleCloseMindmap}
        theme={theme}
        currentDatabase={currentDatabase}
        schemaLoading={schemaLoading}
        schemaData={schemaData}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={handleConfirmDialogClose}
        onConfirm={confirmDialog.onConfirm}
        title="Run query?"
        description="This query will be executed against the connected database."
        intent="warning"
        confirmText="Run query"
        cancelText="Cancel"
        maxWidth="xs"
        loadingText="Running"
      />

      <ConfirmDialog
        open={deleteConversationDialog.open}
        onClose={handleDeleteConversationDialogClose}
        onConfirm={handleDeleteConversationConfirm}
        title="Delete conversation?"
        description="Are you sure you want to delete this conversation? This action cannot be undone."
        intent="danger"
        confirmText="Delete"
        cancelText="Cancel"
        loadingText="Deleting"
        maxWidth="xs"
        closeOnConfirm
      />
    </>
  );
});

export default GlobalOverlays;
