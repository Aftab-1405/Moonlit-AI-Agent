import { Box, Fade, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { memo, useState } from 'react';
import { ScrollDownIcon, TableIcon } from '@/components/icons';
import { ChatInput, MessageList, WelcomeScreen } from '@/features/chat';
import ChatHeader from '@/features/chat/ChatHeader';
import ChatLayout from '@/features/chat/ChatLayout';
import ConversationOutputs from '@/features/chat/ConversationOutputs';
import GuidedConfirmationPrompt from '@/features/chat/GuidedConfirmationPrompt';
import { WelcomeSuggestionsPanel } from '@/features/chat/WelcomeScreen';
import { getResponsivePillIconButtonSx } from '@/features/styles/interfaceChrome';
import { UI_LAYOUT } from '@/styles/shared';

// Feature composition boundary: state and actions stay here, geometry lives in ChatLayout.
const ChatColumn = memo(function ChatColumn({
  showWelcomeState,
  user,
  chatInputSharedProps,
  showConversationPanel,
  setScrollContainerRef,
  isPinnedToBottom,
  scrollToBottom,
  messages,
  history,
  onLoadOlder,
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
  const isComposerDisabled =
    chatInputSharedProps.disabled ||
    (Boolean(currentConversationId) && conversationLoadState !== 'ready');

  return (
    <ChatLayout
      placement={placement}
      transcriptVisible={showConversationPanel}
      scrollContainerRef={setScrollContainerRef}
      header={
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
              <Tooltip
                title={showSummary ? 'Hide outputs and sources' : 'Show outputs and sources'}
              >
                <IconButton
                  aria-label={showSummary ? 'Hide outputs and sources' : 'Show outputs and sources'}
                  aria-pressed={showSummary}
                  onClick={() => setSummaryHidden((value) => !value)}
                  sx={{
                    ml: 'auto',
                    borderRadius: '9999px',
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
      }
      outputs={
        showSummary ? (
          <ConversationOutputs
            variant="summary"
            outputs={conversationOutputs}
            selectedArtifact={selectedArtifact}
            onSelect={handleOpenCanvasArtifact}
          />
        ) : null
      }
      welcome={<WelcomeScreen visible={showWelcomeState} user={user} />}
      composer={
        <>
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
        </>
      }
      suggestions={
        <WelcomeSuggestionsPanel
          key={chatInputSharedProps.isConnected ? 'connected' : 'disconnected'}
          visible={showWelcomeState}
          chatInputProps={chatInputSharedProps}
          onOpenDatabase={onOpenDatabase}
        />
      }
    >
      <MessageList
        sessionKey={chatInputSharedProps.sessionKey}
        messages={messages}
        history={history}
        onLoadOlder={onLoadOlder}
        isLoadingConversation={isConversationLoading}
        loadError={conversationLoadState === 'error'}
        conversationId={currentConversationId}
        onRunQuery={handleRunQuery}
        onOpenCanvasArtifact={handleOpenCanvasArtifact}
      />
    </ChatLayout>
  );
});

export default ChatColumn;
