# Chat Interface

## Overview
- The chat interface is the main application surface for starting a new conversation, viewing message history, and continuing an active session.
- It exists to keep the welcome state, message stream, and composer visually consistent while preserving access to database-aware actions and model selection.
- Key flows include entering the empty-state welcome screen, composing a first prompt, reading assistant responses, and continuing the conversation from the bottom composer.

## Architecture / Design
- `front-end/src/pages/Chat.jsx` owns the overall page shell, the split between sidebar, main conversation lane, and SQL editor panel, plus dialogs/snackbars tied to the chat experience.
- `front-end/src/components/Sidebar/index.jsx`, `front-end/src/components/Sidebar/SidebarPrimitives.jsx`, and `front-end/src/components/Sidebar/sidebarStyles.js` define the sidebar shell, collapsed rail behavior, compact navigation rows, conversation history list, and profile/footer affordances.
- `front-end/src/components/WelcomeScreen.jsx` renders the empty-state greeting and places the primary composer in a centered single-column layout.
- `front-end/src/components/ChatInput.jsx` handles prompt entry, model selection, database/schema context chips, SQL editor launch, and quick-start suggestions.
- `front-end/src/components/MessageList.jsx` renders the active conversation stream using the same centered content width as the composer.
- `front-end/src/hooks/chat-page/useChatPageController.js` supplies the page state and handlers for conversations, streaming, database actions, model selection, and panel lifecycle.

## Dependencies
- Depends on React, Material UI, the app theme tokens, auth context, database context, and chat-page hooks for state orchestration.
- Depends on conversation/message utilities and SQL editor/database modal components for advanced flows.
- The chat route, sidebar conversation navigation, streaming pipeline, and SQL tooling depend on this interface remaining stable and visually consistent.

## Change Log
- 2026-04-03: Simplified the main chat layout to a cleaner single-column composition inspired by Claude's seamless content flow. Reduced heavy visual layering, removed dead input-hide state, and aligned the welcome screen and bottom composer styling so both states feel like one interface.
- 2026-04-03: Refined the chat sidebar to behave more like a slim pinned rail with cleaner expansion, tighter navigation rows, lighter surfaces, and a simpler bottom profile area while preserving Moonlit's database and history actions.
- 2026-04-03: Reworked the sidebar header so the product icon itself controls open and close state, removing the separate toggle button and keeping the logo at a consistent size in both sidebar states.
- 2026-04-03: Replaced the desktop sidebar shell with a proper MUI mini-variant Drawer-style width transition and removed the extra content-handoff during collapse so open and close animation feels smoother and less jittery.
- 2026-04-03: Stabilized sidebar rail item layout so icon slots keep a fixed width during collapse and only the label area compresses, removing the visual icon-shrink effect in the closed transition.
- 2026-04-03: Unified the desktop sidebar into one persistent render tree so shared navigation rows no longer remount into a different structure during collapse, eliminating the remaining icon-position jump in the mini-variant transition.

## Known Limitations / TODOs
- The composer still exposes product-specific database and SQL controls that Claude's simpler consumer UI does not have; those controls were visually softened rather than removed.
- The conversation message presentation remains unchanged beyond shell and sidebar alignment, so future refinements may still be needed if the message stream itself should look closer to the reference product.
- No dedicated visual regression coverage exists for the chat shell yet.
