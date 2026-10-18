import { Box, Fade, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { memo, useState } from 'react';
import { ScrollDownIcon, TableIcon } from '@/components/icons';
import { ChatInput, MessageList, WelcomeScreen } from '@/features/chat';
import ChatHeader from '@/features/chat/ChatHeader';
import ConversationOutputs from '@/features/chat/ConversationOutputs';
import GuidedConfirmationPrompt from '@/features/chat/GuidedConfirmationPrompt';
import { WelcomeSuggestionsPanel } from '@/features/chat/WelcomeScreen';
import {
  getChatStageLayoutSx,
  getResponsivePillIconButtonSx,
} from '@/features/styles/interfaceChrome';
import { getScrollbarStyles, UI_LAYOUT } from '@/styles/shared';

const ChatColumn = memo(function ChatColumn({
  showWelcomeState,
  user,
  chatInputSharedProps,
  showConversationPanel,
  setScrollContainerRef,
  isPinnedToBottom,
  scrollToBottom,
  messages,
  conversationOutputs = [],
  selectedArtifact,
  workspaceCanvasOpen = false,
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
  onNewChat,
  isNarrowLayout,
  onOpenSidebar,
  onOpenDatabase,
  openSidebarButtonRef,
  theme,
}) {
  const wide = useMediaQuery('(min-width:1200px)');
  const [summaryHidden, setSummaryHidden] = useState(false);
  const canPinSummary = wide && showConversationPanel && !workspaceCanvasOpen;
  const showSummary = canPinSummary && !summaryHidden;
  const placement = showWelcomeState ? 'welcome' : 'active';
  const stageLayout = getChatStageLayoutSx(placement);
  const isComposerDisabled =
    chatInputSharedProps.disabled ||
    (Boolean(currentConversationId) && conversationLoadState !== 'ready');

  return (
    <Box
      sx={{
        position: 'relative',
        zIndex: 1,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        contain: 'paint style',
        containerType: 'inline-size',
      }}
    >
      <ChatHeader
        sessionKey={chatInputSharedProps.sessionKey}
        conversationId={currentConversationId}
        title={conversationTitle}
        onRenameConversation={onRenameConversation}
        onNewChat={!showWelcomeState ? onNewChat : undefined}
        isNarrowLayout={isNarrowLayout}
        onOpenSidebar={onOpenSidebar}
        openSidebarButtonRef={openSidebarButtonRef}
        theme={theme}
        actions={
          canPinSummary ? (
            <Tooltip title={showSummary ? 'Hide outputs and sources' : 'Show outputs and sources'}>
              <IconButton
                aria-label={showSummary ? 'Hide outputs and sources' : 'Show outputs and sources'}
                aria-pressed={showSummary}
                onClick={() => setSummaryHidden((value) => !value)}
                sx={{
                  ml: 'auto',
                  borderRadius: '10px',
                  bgcolor: showSummary ? 'action.hover' : 'transparent',
                }}
              >
                <TableIcon />
              </IconButton>
            </Tooltip>
          ) : showConversationPanel ? (
            <ConversationOutputs
              key={chatInputSharedProps.sessionKey}
              outputs={conversationOutputs}
              selectedArtifact={selectedArtifact}
              onSelect={handleOpenCanvasArtifact}
            />
          ) : null
        }
      />
      {showSummary && (
        <Box sx={{ position: 'absolute', top: 58, right: 8, width: 300, zIndex: 3 }}>
          <ConversationOutputs
            variant="summary"
            outputs={conversationOutputs}
            selectedArtifact={selectedArtifact}
            onSelect={handleOpenCanvasArtifact}
          />
        </Box>
      )}
      <Box
        data-chat-placement={placement}
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          mr: showSummary ? '316px' : 0,
          '@container (min-width: 1440px)': { mr: 0 },
          gridTemplateRows: stageLayout.gridTemplateRows,
          transition: stageLayout.transition,
          '@media (prefers-reduced-motion: reduce)': stageLayout.reducedMotion,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            ...stageLayout.transcript,
            gridColumn: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <WelcomeScreen visible={showWelcomeState} user={user} />

          <Box
            ref={setScrollContainerRef}
            aria-hidden={!showConversationPanel || undefined}
            sx={{
              position: 'absolute',
              inset: 0,
              visibility: showConversationPanel ? 'visible' : 'hidden',
              pointerEvents: showConversationPanel ? 'auto' : 'none',
              overflowY: 'auto',
              overflowX: 'hidden',
              px: { xs: 1.25, sm: 2 },
              pt: { xs: 1, sm: 2 },
              pb: { xs: 1, sm: 2 },
              ...getScrollbarStyles(theme),
            }}
          >
            <MessageList
              sessionKey={chatInputSharedProps.sessionKey}
              messages={messages}
              isLoadingConversation={isConversationLoading}
              loadError={conversationLoadState === 'error'}
              conversationId={currentConversationId}
              onRunQuery={handleRunQuery}
              onOpenCanvasArtifact={handleOpenCanvasArtifact}
            />
          </Box>
        </Box>

        <Box
          sx={{
            gridColumn: 1,
            gridRow: stageLayout.composer.gridRow,
            position: 'relative',
            zIndex: 4,
            minWidth: 0,
          }}
        >
          <Box sx={{ position: 'relative', px: { xs: 1.25, sm: 2 }, pt: { xs: 1, sm: 1.5 } }}>
            <Fade in={!isPinnedToBottom && showConversationPanel}>
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

            <ChatInput
              {...chatInputSharedProps}
              disabled={isComposerDisabled}
              placement={placement}
              messageCount={messages.length}
            />
          </Box>
        </Box>

        <Box sx={{ gridColumn: 1, gridRow: 3, minHeight: 0, overflowY: 'auto', px: 2 }}>
          <WelcomeSuggestionsPanel
            key={chatInputSharedProps.isConnected ? 'connected' : 'disconnected'}
            visible={showWelcomeState}
            chatInputProps={chatInputSharedProps}
            onOpenDatabase={onOpenDatabase}
          />
        </Box>
      </Box>
    </Box>
  );
});

export default ChatColumn;
