// ChatWorkspacePage — logged-in application shell root.
//
// Acts as the orchestrator for the three-column chat experience. Owns no
// feature-specific business logic — that lives in `useChatPageController` and
// the feature modules. ChatWorkspacePage's job is to:
//
//   1. Wire the controller.
//   2. Pass feature content into AppShell as slots.
//   3. Mount global overlays (modals, toasts, dialogs) once at the shell.
//
// Layout, theme surfaces, and column-width animations are owned by AppShell.
// Feature content (Sidebar, ChatColumn, ArtifactLoader) is rendered into the
// appropriate column slots.

import { Box } from '@mui/material';
import { lazy, memo, Suspense, useRef, useState } from 'react';
import { ResizeHandle } from '@/components';
import ChatColumn from '@/features/chat/ChatColumn';
import AppShell from '@/features/shell/AppShell';
import GlobalOverlays from '@/features/shell/GlobalOverlays';
import ArtifactLoader from '@/features/sidebar-right/index';
import { useChatPageController } from '@/hooks/chat-page/useChatPageController';

// Module-scope lazy import.
// CRITICAL: `lazy()` MUST be called at module scope, NOT inside the component
// body. Calling it inside the component body creates a NEW lazy component type
// on every render, which causes React to unmount and remount the entire
// Sidebar subtree on every parent re-render. This was the root cause of:
//   - Bug #1: Sidebar re-rendering on unrelated UI interactions
//   - Bug #3: Profile dialog appearing at top-left (anchor element was
//     detached from the DOM by the remount before MUI Menu could position)
//   - Bug #2/#4: State propagation issues during navigation
const Sidebar = lazy(() => import('@/features/sidebar-left'));

function ChatWorkspacePage() {
  const mobileSidebarTriggerRef = useRef(null);
  const {
    theme,
    isNarrowLayout,
    user,
    handleOpenDashboard,
    handleLogout,
    commonSidebarProps,
    handleSidebarNewChat,
    handleSidebarSelectConversation,
    handleSidebarOpenDbModal,
    sidebarOpen,
    handleSidebarToggle,
    handleSidebarOpenSettings,
    mobileOpen,
    handleMobileDrawerOpen,
    handleMobileDrawerClose,
    handleMobileDrawerExited,
    showWelcomeState,
    setScrollContainerRef,
    isPinnedToBottom,
    scrollToBottom,
    showConversationPanel,
    messages,
    isConversationLoading,
    conversationLoadState,
    currentConversationId,
    activeConversationTitle,
    handleConversationHeaderRename,
    handleRunQuery,
    handleOpenCanvasArtifact,
    chatInputSharedProps,
    workspaceCanvasOpen,
    workspaceCanvasArtifact,
    conversationOutputs,
    onNotify,
    workspaceCanvasWidth,
    workspaceCanvasMinWidth,
    workspaceCanvasMaxWidth,
    handleCanvasResize,
    handleCloseWorkspaceCanvas,
    isDbConnected,
    currentDatabase,
    dbModalOpen,
    handleCloseDbModal,
    handleDbConnect,
    handleDbModalSelectDatabase,
    notifications,
    removeToast,
    settingsOpen,
    handleCloseSettings,
    confirmDialog,
    handleConfirmDialogClose,
    deleteConversationDialog,
    handleDeleteConversationDialogClose,
    handleDeleteConversationConfirm,
    guidedConfirmDialog,
    handleGuidedCancel,
    handleGuidedConfirm,
    dbModalInitialType,
    settingsInitialSection,
    handleOpenMindmap,
    mindmapOpen,
    handleCloseMindmap,
    schemaLoading,
    schemaData,
  } = useChatPageController({ mobileSidebarTriggerRef });

  const [isResizingCanvas, setIsResizingCanvas] = useState(false);
  const [fullscreenSession, setFullscreenSession] = useState(null);
  const canvasFullscreen =
    workspaceCanvasOpen && fullscreenSession === chatInputSharedProps.sessionKey;
  const handleFullscreenChange = (value) =>
    setFullscreenSession(value ? chatInputSharedProps.sessionKey : null);

  const chatSlot = (
    <ChatColumn
      showWelcomeState={showWelcomeState}
      user={user}
      chatInputSharedProps={chatInputSharedProps}
      showConversationPanel={showConversationPanel}
      setScrollContainerRef={setScrollContainerRef}
      isPinnedToBottom={isPinnedToBottom}
      scrollToBottom={scrollToBottom}
      messages={messages}
      conversationOutputs={conversationOutputs}
      selectedArtifact={workspaceCanvasArtifact}
      workspaceCanvasOpen={workspaceCanvasOpen}
      isConversationLoading={isConversationLoading}
      conversationLoadState={conversationLoadState}
      handleRunQuery={handleRunQuery}
      handleOpenCanvasArtifact={handleOpenCanvasArtifact}
      guidedConfirmDialog={guidedConfirmDialog}
      handleGuidedCancel={handleGuidedCancel}
      handleGuidedConfirm={handleGuidedConfirm}
      currentConversationId={currentConversationId}
      conversationTitle={activeConversationTitle}
      onRenameConversation={handleConversationHeaderRename}
      onNewChat={handleSidebarNewChat}
      isNarrowLayout={isNarrowLayout}
      onOpenSidebar={handleMobileDrawerOpen}
      onOpenDatabase={handleSidebarOpenDbModal}
      openSidebarButtonRef={mobileSidebarTriggerRef}
      theme={theme}
    />
  );

  // The workspace slot needs a ResizeHandle on desktop (between chat and
  // artifact panel). On narrow viewports the handle is irrelevant (the panel
  // is full-screen), so omit it rather than consuming 10px of overlay width.
  const workspaceSlot = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {!isNarrowLayout && !canvasFullscreen && (
        <ResizeHandle
          key="workspace-resize-handle"
          onResize={handleCanvasResize}
          onResizeStart={() => setIsResizingCanvas(true)}
          onResizeEnd={() => setIsResizingCanvas(false)}
          disabled={!workspaceCanvasOpen}
          valueMin={workspaceCanvasMinWidth}
          valueMax={workspaceCanvasMaxWidth}
          valueNow={workspaceCanvasWidth}
        />
      )}
      <Box
        key="workspace-content"
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <ArtifactLoader
          key={chatInputSharedProps.sessionKey}
          artifact={workspaceCanvasArtifact}
          outputs={conversationOutputs}
          onOpenArtifact={handleOpenCanvasArtifact}
          onClose={handleCloseWorkspaceCanvas}
          isDbConnected={isDbConnected}
          currentDatabase={currentDatabase}
          isOpen={workspaceCanvasOpen}
          fullscreen={canvasFullscreen}
          onFullscreenChange={handleFullscreenChange}
          panelWidth={workspaceCanvasWidth}
          isResizing={isResizingCanvas}
          onNotify={onNotify}
        />
      </Box>
    </Box>
  );

  // Note: workspaceContainerRef was used by the SQL editor to position its
  // autocomplete popovers relative to the workspace container. The ref used
  // to live on a Box that wrapped both the chat column and the artifact panel.
  // With AppShell owning that container, the SQL editor should compute its
  // position relative to its own root instead. ArtifactLoader accepts the ref
  // as an optional prop; we don't pass it here. If the SQL editor breaks, we
  // can reintroduce a workspace container ref via a forwardRef on AppShell.

  return (
    <Box id="app-shell" sx={{ width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
      <AppShell
        isNarrowLayout={isNarrowLayout}
        sidebarOpen={sidebarOpen}
        canvasOpen={workspaceCanvasOpen}
        canvasWidth={workspaceCanvasWidth}
        canvasFullscreen={canvasFullscreen}
        isResizingCanvas={isResizingCanvas}
        sidebarSlot={
          <Suspense fallback={null}>
            <Sidebar
              {...commonSidebarProps}
              onSelectConversation={handleSidebarSelectConversation}
              onOpenDbModal={handleSidebarOpenDbModal}
              onOpenMindmap={handleOpenMindmap}
              open={sidebarOpen}
              onToggleOpen={handleSidebarToggle}
              onOpenSettings={handleSidebarOpenSettings}
              onOpenDashboard={handleOpenDashboard}
              onLogout={handleLogout}
              mobileOpen={mobileOpen}
              onMobileClose={handleMobileDrawerClose}
              onMobileExited={handleMobileDrawerExited}
            />
          </Suspense>
        }
        chatSlot={chatSlot}
        workspaceSlot={workspaceSlot}
      />

      <GlobalOverlays
        dbModalOpen={dbModalOpen}
        handleCloseDbModal={handleCloseDbModal}
        handleDbConnect={handleDbConnect}
        handleDbModalSelectDatabase={handleDbModalSelectDatabase}
        isDbConnected={isDbConnected}
        currentDatabase={currentDatabase}
        availableDatabases={commonSidebarProps.availableDatabases}
        dbModalInitialType={dbModalInitialType}
        settingsOpen={settingsOpen}
        handleCloseSettings={handleCloseSettings}
        settingsInitialSection={settingsInitialSection}
        notifications={notifications}
        removeToast={removeToast}
        isNarrowLayout={isNarrowLayout}
        confirmDialog={confirmDialog}
        handleConfirmDialogClose={handleConfirmDialogClose}
        deleteConversationDialog={deleteConversationDialog}
        handleDeleteConversationDialogClose={handleDeleteConversationDialogClose}
        handleDeleteConversationConfirm={handleDeleteConversationConfirm}
        mindmapOpen={mindmapOpen}
        handleCloseMindmap={handleCloseMindmap}
        schemaLoading={schemaLoading}
        schemaData={schemaData}
        theme={theme}
      />
    </Box>
  );
}

export default memo(ChatWorkspacePage);
