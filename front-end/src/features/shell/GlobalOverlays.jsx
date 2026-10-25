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

import { lazy, memo, Suspense, useState } from 'react';
import { ConfirmDialog } from '@/components';
import ToastStack from '@/components/common/ToastStack';
import SchemaMindmapDialog from '@/features/overlays/mindmap';

const DatabaseModal = lazy(() => import('@/features/overlays/database/DatabaseModal'));
const SettingsModal = lazy(() => import('@/features/overlays/settings/SettingsModal'));

// Defer the import until first use, then retain state and exit transitions.
function MountOnFirstOpen({ open, children }) {
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) setHasOpened(true);
  return open || hasOpened ? children : null;
}

const ModalLayer = memo(function ModalLayer({
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
        <MountOnFirstOpen open={dbModalOpen}>
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
        </MountOnFirstOpen>
      </Suspense>
      <Suspense fallback={null}>
        <MountOnFirstOpen open={settingsOpen}>
          <SettingsModal
            open={settingsOpen}
            onClose={handleCloseSettings}
            initialSection={settingsInitialSection}
          />
        </MountOnFirstOpen>
      </Suspense>
    </>
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
