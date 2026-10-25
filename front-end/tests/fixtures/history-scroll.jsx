// Local synthetic fixture: real message/session/scroll hooks, mocked HTTP in the runner.

import { ThemeProvider } from '@mui/material/styles';
import { QueryClientProvider } from '@tanstack/react-query';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '@/api/queryClient';
import MessageList from '@/features/chat/MessageList';
import useAutoScroll from '@/hooks/chat-page/useAutoScroll';
import { useConversations } from '@/hooks/chat-page/useConversations';
import { createDarkTheme } from '@/theme';

export function Fixture() {
  const {
    messages,
    activeSessionKey,
    currentConversationId,
    history,
    isConversationLoading,
    loadOlderMessages,
    selectConversation,
    updateSessionMessages,
  } = useConversations();
  const tail = messages.at(-1);
  const { setScrollContainerRef, scrollToBottom, pauseFollowing } = useAutoScroll({
    sessionKey: activeSessionKey,
    messageCount: messages.length,
    lastMessageId: tail?.id,
    isConversationLoading: isConversationLoading,
    isStreaming: tail?.status === 'streaming',
    activityKey: `${tail?.id}:${tail?.text}`,
  });
  const loadOlder = useCallback(
    ({ beforePrepend } = {}) =>
      loadOlderMessages({
        beforePrepend: () => {
          pauseFollowing();
          beforePrepend?.();
        },
      }),
    [loadOlderMessages, pauseFollowing],
  );
  return (
    <>
      <button type="button" onClick={() => selectConversation('other')}>
        Other conversation
      </button>
      <button type="button" onClick={scrollToBottom}>
        Jump to latest
      </button>
      <button
        type="button"
        onClick={() =>
          updateSessionMessages(activeSessionKey, (messages) => [
            ...messages,
            {
              id: `live-${messages.length}`,
              role: 'assistant',
              text: 'Live reply',
              status: 'streaming',
            },
          ])
        }
      >
        Append reply
      </button>
      <button
        type="button"
        onClick={() =>
          updateSessionMessages(activeSessionKey, (messages) =>
            messages.map((message, i) =>
              i === messages.length - 1
                ? { ...message, text: `${message.text}\n\nAnother streaming paragraph.` }
                : message,
            ),
          )
        }
      >
        Stream token
      </button>
      <div
        data-chat-scroll-container=""
        ref={setScrollContainerRef}
        style={{ height: 550, overflowY: 'auto', background: '#121212', color: 'white' }}
      >
        <MessageList
          sessionKey={activeSessionKey}
          conversationId={currentConversationId}
          messages={messages}
          history={history}
          onLoadOlder={loadOlder}
          isLoadingConversation={isConversationLoading}
        />
      </div>
    </>
  );
}
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={createDarkTheme()}>
      <MemoryRouter initialEntries={['/chat/demo']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<Fixture />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </QueryClientProvider>,
);
