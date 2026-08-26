// ChatColumn — the center column of the application shell.
//
// Renders the chat workspace: welcome screen, message list, scroll container,
// composer, and the guided confirmation prompt (agent interrupts / step-limit
// banner). Receives all state as props — owns no business logic of its own.
//
// Layout note: the column's outer surface (background.default) is painted by
// AppShell. This component is transparent and inherits that surface. Only the
// guided confirmation prompt paints its own panel surface (it's an overlay,
// not part of the column body).

import { Box, Fade, IconButton, Tooltip } from '@mui/material';
import { memo } from 'react';
import { MenuIcon, ScrollDownIcon } from '@/components/icons';
import { ChatInput, MessageList, WelcomeScreen } from '@/features/chat';
import ChatHeader from '@/features/chat/ChatHeader';
import GuidedConfirmationPrompt from '@/features/chat/GuidedConfirmationPrompt';
import {
  getChatConversationPanelSx,
  getMobileEdgeControlSx,
  getResponsivePillIconButtonSx,
} from '@/features/styles/interfaceChrome';
import { getInteractiveIconButtonSx, getScrollbarStyles, UI_LAYOUT } from '@/styles/shared';

const ChatColumn = memo(function ChatColumn({
  showWelcomeState,
  user,
  chatInputSharedProps,
  showConversationPanel,
  setScrollContainerRef,
  isPinnedToBottom,
  scrollToBottom,
  messages,
  isConversationLoading,
  conversationLoadState,
  handleRunQuery,
  handleOpenCanvasArtifact,
  guidedConfirmDialog,
  handleGuidedCancel,
  handleGuidedConfirm,
  currentConversationId,
  conversationTitle,
  onRenameConversation,
  isNarrowLayout,
  onOpenSidebar,
  onOpenDatabase,
  openSidebarButtonRef,
  theme,
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        zIndex: 1,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        contain: 'layout paint style',
      }}
    >
      {isNarrowLayout && showWelcomeState && (
        <Tooltip title="Open sidebar">
          <IconButton
            ref={openSidebarButtonRef}
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
            sx={{
              ...getInteractiveIconButtonSx(theme, {
                size: UI_LAYOUT.touchTarget,
                radius: theme.shape.radius.pill,
              }),
              position: 'absolute',
              top: 'max(env(safe-area-inset-top), 8px)',
              left: 12,
              ...getMobileEdgeControlSx('left', 1.5),
              zIndex: 6,
              bgcolor: 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      )}

      {currentConversationId && conversationTitle && (
        <ChatHeader
          key={currentConversationId}
          conversationId={currentConversationId}
          title={conversationTitle}
          onRenameConversation={onRenameConversation}
          isNarrowLayout={isNarrowLayout}
          onOpenSidebar={onOpenSidebar}
          openSidebarButtonRef={openSidebarButtonRef}
          theme={theme}
        />
      )}

      <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <WelcomeScreen
          visible={showWelcomeState}
          user={user}
          chatInputProps={chatInputSharedProps}
          onOpenDatabase={onOpenDatabase}
        />

        <Fade in={showConversationPanel} timeout={300} unmountOnExit>
          <Box sx={getChatConversationPanelSx()}>
            <Box
              ref={setScrollContainerRef}
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                px: { xs: 0, sm: 1 },
                pt: { xs: 1, sm: 2 },
                pb: { xs: 1, sm: 2 },
                ...getScrollbarStyles(theme),
              }}
            >
              <MessageList
                messages={messages}
                isLoadingConversation={isConversationLoading}
                loadError={conversationLoadState === 'error'}
                conversationId={currentConversationId}
                onRunQuery={handleRunQuery}
                onOpenCanvasArtifact={handleOpenCanvasArtifact}
              />
            </Box>

            <Box
              sx={{
                flexShrink: 0,
                position: 'relative', // Anchor for the absolutely-positioned banner
                zIndex: 2,
                px: { xs: 0, sm: 1 },
                pt: { xs: 1, sm: 1.5 },
                pb: 'max(env(safe-area-inset-bottom), 8px)',
              }}
            >
              <Fade in={!isPinnedToBottom}>
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 'calc(100% + 12px)',
                    zIndex: 5,
                    display: 'flex',
                    justifyContent: 'center',
                    pointerEvents: isPinnedToBottom ? 'none' : 'auto',
                  }}
                >
                  <Tooltip title="Jump to latest">
                    <IconButton
                      onClick={scrollToBottom}
                      aria-label="Jump to latest message"
                      sx={{
                        ...getResponsivePillIconButtonSx(theme, {
                          desktopSize: 40,
                          mobileSize: UI_LAYOUT.touchTarget,
                        }),
                        bgcolor: 'background.paper',
                        color: 'text.secondary',
                        border: '1px solid',
                        borderColor: 'border.subtle',
                        boxShadow: 'none',
                        '&:hover': { bgcolor: 'background.paper', color: 'text.primary' },
                      }}
                    >
                      <ScrollDownIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Fade>
              <GuidedConfirmationPrompt
                open={guidedConfirmDialog.open}
                title={guidedConfirmDialog.title}
                message={guidedConfirmDialog.message}
                confirmText={guidedConfirmDialog.confirmText}
                cancelText={guidedConfirmDialog.cancelText}
                onCancel={handleGuidedCancel}
                onConfirm={handleGuidedConfirm}
                theme={theme}
              />
              <Box sx={{ position: 'relative', zIndex: 4 }}>
                <ChatInput {...chatInputSharedProps} messageCount={messages.length} />
              </Box>
            </Box>
          </Box>
        </Fade>
      </Box>
    </Box>
  );
});

export default ChatColumn;
