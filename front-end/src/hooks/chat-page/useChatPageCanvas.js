// useChatPageCanvas — workspace canvas (artifact panel) + SQL-editor streaming
// injection.
//
// Wraps `useWorkspaceCanvas` and adds:
//   - `handleOpenSqlEditor` — opens the SQL editor canvas (with DB-connected
//     guard, redirecting to the DB modal if no connection).
//   - SQL-editor streaming detection — when the agent calls
//     `write_sql_editor_query`, the matching tool step is in `running` state.
//     We detect this and inject `isStreaming: true` into the artifact props so
//     `SqlEditorSurface` switches to streaming mode.
//   - Auto-open effect — when the agent starts streaming a query, open the
//     SQL editor early (with empty query) so the user sees the "Agent is
//     writing" indicator while the agent composes the query.
//
// The hook accepts `isCurrentlyStreaming` and `messages` from the caller
// (the controller) so the streaming detection can be computed in one place.

import { useCallback, useEffect, useMemo } from 'react';
import { useWorkspaceCanvas } from '@/hooks/chat-page/useWorkspaceCanvas';
import { collectConversationOutputs } from '@/features/chat/conversationOutputs';

export function useChatPageCanvas({
  sidebarWidth,
  sessionKey,
  conversationId,
  currentDatabase,
  currentSchema,
  isDbConnected,
  isCurrentlyStreaming,
  messages,
  setSettingsOpen,
  setDbModalOpen,
  showSnackbar,
}) {
  const source = useMemo(
    () => (isDbConnected ? { database: currentDatabase, schema: currentSchema } : null),
    [currentDatabase, currentSchema, isDbConnected],
  );
  const historyOutputs = useMemo(
    () => collectConversationOutputs(messages, conversationId),
    [messages, conversationId],
  );
  const {
    workspaceCanvasOpen,
    workspaceCanvasArtifact: canvasArtifact,
    workspaceCanvasWidth,
    workspaceCanvasMinWidth,
    workspaceCanvasMaxWidth,
    handleOpenCanvasArtifact,
    handleOpenSqlEditor: openSqlEditorCanvas,
    handleCloseWorkspaceCanvas,
    handleCanvasResize,
    workspaceOutputs,
  } = useWorkspaceCanvas({ sidebarWidth, sessionKey, source, historyOutputs });
  const conversationOutputs = useMemo(() => {
    const records = new Map(historyOutputs.map((output) => [output.id, output]));
    workspaceOutputs.forEach((output) => records.set(output.id, output));
    return [...records.values()];
  }, [historyOutputs, workspaceOutputs]);

  // ── Detect agent streaming into the SQL editor ───────────────────────────
  // When the agent calls `write_sql_editor_query`, the tool step is in
  // `running` state. We detect this and inject `isStreaming: true` into the
  // artifact props so SqlEditorSurface switches to streaming mode.
  const isSqlEditorStreaming = useMemo(() => {
    if (!isCurrentlyStreaming) return false;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.steps) return false;
    return lastMessage.steps.some(
      (step) =>
        step.type === 'tool' && step.name === 'write_sql_editor_query' && step.status === 'running',
    );
  }, [isCurrentlyStreaming, messages]);

  // Inject isStreaming into the artifact props when the SQL editor is open
  // and the agent is actively writing a query.
  const workspaceCanvasArtifact = useMemo(() => {
    if (!canvasArtifact) return null;
    if (canvasArtifact.type !== 'sql-editor') return canvasArtifact;
    return {
      ...canvasArtifact,
      props: {
        ...canvasArtifact.props,
        isStreaming: isSqlEditorStreaming,
      },
    };
  }, [canvasArtifact, isSqlEditorStreaming]);

  // ── Open SQL editor with DB-connection guard ─────────────────────────────
  const handleOpenSqlEditor = useCallback(
    (query = '', results = null) => {
      if (!isDbConnected) {
        setSettingsOpen(false);
        setDbModalOpen(true);
        showSnackbar('Connect a database to use the SQL editor.', 'info');
        return;
      }
      openSqlEditorCanvas(query, results);
    },
    [isDbConnected, openSqlEditorCanvas, setDbModalOpen, setSettingsOpen, showSnackbar],
  );

  const isSqlEditorOpen = Boolean(workspaceCanvasOpen && canvasArtifact?.type === 'sql-editor');

  // The composer owns the user-facing SQL workspace entry point. Treat it as
  // a real toggle when SQL is already visible; when another artifact is open,
  // the same action switches the canvas to the SQL editor.
  const handleToggleSqlEditor = useCallback(() => {
    if (isSqlEditorOpen) {
      handleCloseWorkspaceCanvas();
      return;
    }
    handleOpenSqlEditor();
  }, [handleCloseWorkspaceCanvas, handleOpenSqlEditor, isSqlEditorOpen]);

  // ── Open SQL editor early when agent starts writing a query ──────────────
  // When `write_sql_editor_query` enters `running` state, open the editor
  // immediately (with empty query) so the user sees the "Agent is writing"
  // indicator while the agent composes the query. The actual query arrives
  // when the `ui_action` event fires (via the UI action dispatcher).
  useEffect(() => {
    if (!isSqlEditorStreaming) return;
    if (canvasArtifact?.type === 'sql-editor') return;
    if (!isDbConnected) return;
    openSqlEditorCanvas('', null);
  }, [isSqlEditorStreaming, canvasArtifact, isDbConnected, openSqlEditorCanvas]);

  return {
    conversationOutputs,
    workspaceCanvasOpen,
    workspaceCanvasArtifact,
    workspaceCanvasWidth,
    workspaceCanvasMinWidth,
    workspaceCanvasMaxWidth,
    handleOpenCanvasArtifact,
    handleOpenSqlEditor,
    handleToggleSqlEditor,
    handleCloseWorkspaceCanvas,
    handleCanvasResize,
    isSqlEditorOpen,
    isSqlEditorStreaming,
  };
}
