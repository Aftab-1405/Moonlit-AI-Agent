/**
 * useWorkspaceCanvas Hook
 *
 * Manages the global workspace canvas that can host different artifact
 * components without rendering them inline in the chat stream.
 *
 * @module hooks/useWorkspaceCanvas
 */

import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { queryKeys } from '@/api/queryClient';
import { createChatSession } from '@/hooks/chat-page/chatSessionModel';

const MIN_CANVAS_WIDTH_FLOOR = 320;
const MIN_CHAT_WIDTH = 360;
const DEFAULT_CANVAS_WIDTH = 520;
const EMPTY_OUTPUTS = [];

function createEditorCache() {
  let state = null;
  return {
    get: () => state,
    release: () => {
      if (state) state = { ...state, tabs: state.tabs?.map((tab) => ({ ...tab, results: null })) };
    },
    set: (next) => {
      state = next
        ? {
            ...next,
            tabs: next.tabs?.map((tab) =>
              tab.id === next.activeTabId ? tab : { ...tab, results: null },
            ),
          }
        : null;
    },
  };
}

function expireArtifactRows(artifact) {
  if (!artifact?.props) return artifact;
  const props = { ...artifact.props };
  if (props.data?.rows) props.data = { ...props.data, rows: [], expired: true };
  if (props.initialResults) props.initialResults = null;
  return { ...artifact, props };
}

function releaseCanvasRows(previous) {
  if (!previous?.workspaceCanvas) return previous;
  const canvas = previous.workspaceCanvas;
  canvas.workspaceCache?.release();
  return {
    ...previous,
    workspaceCanvas: {
      ...canvas,
      artifact: expireArtifactRows(canvas.artifact),
      outputs: canvas.outputs?.map(expireArtifactRows) || [],
    },
  };
}

function getWorkspaceWidth(sidebarWidth) {
  if (typeof window === 'undefined') return 1200;
  return Math.max(0, window.innerWidth - sidebarWidth);
}

function getCanvasWidthBounds(sidebarWidth) {
  const workspace = getWorkspaceWidth(sidebarWidth);
  const minWidth = Math.min(MIN_CANVAS_WIDTH_FLOOR, Math.floor(workspace / 2));
  const maxWidth = Math.max(minWidth, Math.floor(workspace / 2), workspace - MIN_CHAT_WIDTH);
  return { minWidth, maxWidth };
}

function clampCanvasWidth(width, sidebarWidth) {
  const { minWidth, maxWidth } = getCanvasWidthBounds(sidebarWidth);
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)));
}

export function useWorkspaceCanvas({
  sidebarWidth = 344,
  sessionKey = 'default',
  source = null,
  historyOutputs = EMPTY_OUTPUTS,
} = {}) {
  const queryClient = useQueryClient();
  const { data: session } = useQuery({
    queryKey: queryKeys.chatSession(sessionKey),
    enabled: false,
    queryFn: skipToken,
    initialData: () => createChatSession({ sessionKey }),
    select: (chat) => chat.workspaceCanvas,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const workspaceCanvasOpen = session?.open || false;
  const workspaceCanvasArtifact = session?.artifact || null;
  const workspaceOutputs = session?.outputs || EMPTY_OUTPUTS;
  const [hasBeenResized, setHasBeenResized] = useState(false);
  const [workspaceCanvasWidth, setWorkspaceCanvasWidth] = useState(DEFAULT_CANVAS_WIDTH);
  const sidebarWidthRef = useRef(sidebarWidth);
  const { minWidth: workspaceCanvasMinWidth, maxWidth: workspaceCanvasMaxWidth } =
    getCanvasWidthBounds(sidebarWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Keep each session's callback bound to its own latest committed context.
  // A late completion from A must never read B's source or output IDs.
  const artifactContexts = useRef(new Map());
  useLayoutEffect(() => {
    artifactContexts.current.set(sessionKey, { source, historyOutputs });
  }, [sessionKey, source, historyOutputs]);

  const handleOpenCanvasArtifact = useCallback(
    (artifact) => {
      if (!artifact?.type) return;
      const { source, historyOutputs } = artifactContexts.current.get(sessionKey);
      const historyOutput = historyOutputs.find(
        (item) =>
          item.type === artifact.type &&
          ((artifact.type === 'sql-editor' &&
            item.props.initialQuery === artifact.props?.initialQuery) ||
            (artifact.type === 'react-flow' && item.props.code === artifact.props?.code)),
      );
      const id = artifact.id || historyOutput?.id || crypto.randomUUID();
      queryClient.setQueryData(queryKeys.chatSession(sessionKey), (previous) => {
        // Deletion/logout can clear the session while a query is finishing.
        if (!previous) return previous;
        const current = previous.workspaceCanvas;
        const workspaceCache = current?.workspaceCache || createEditorCache();
        const next = {
          ...artifact,
          id,
          source:
            artifact.source === undefined
              ? (historyOutput?.source ?? (historyOutput ? null : source))
              : artifact.source,
          props: { ...artifact.props, workspaceCache },
        };
        const outputs = (current?.outputs || [])
          .filter((item) => item.id !== id)
          .map(expireArtifactRows);
        // The empty editor is a workspace action, not an output.
        if (next.type !== 'sql-editor' || next.props.initialQuery?.trim()) outputs.push(next);
        return {
          ...previous,
          workspaceCanvas: { open: true, artifact: next, outputs, workspaceCache },
        };
      });
    },
    [queryClient, sessionKey],
  );

  const handleOpenSqlEditor = useCallback(
    (query = '', results = null) => {
      handleOpenCanvasArtifact({
        type: 'sql-editor',
        title: 'SQL editor',
        props: {
          initialQuery: query,
          initialResults: results,
        },
      });
    },
    [handleOpenCanvasArtifact],
  );

  const handleCloseWorkspaceCanvas = useCallback(() => {
    queryClient.setQueryData(queryKeys.chatSession(sessionKey), (previous) =>
      previous
        ? {
            ...previous,
            workspaceCanvas: { ...releaseCanvasRows(previous).workspaceCanvas, open: false },
          }
        : previous,
    );
  }, [queryClient, sessionKey]);

  useEffect(
    () => () => {
      queryClient.setQueryData(queryKeys.chatSession(sessionKey), releaseCanvasRows);
    },
    [queryClient, sessionKey],
  );

  const handleCanvasResize = useCallback((deltaX) => {
    setHasBeenResized(true);
    setWorkspaceCanvasWidth((prev) => clampCanvasWidth(prev - deltaX, sidebarWidthRef.current));
  }, []);

  useEffect(() => {
    if (!workspaceCanvasOpen) return undefined;
    let resizeFrame = null;

    const sync = () => {
      setWorkspaceCanvasWidth((prev) => {
        if (!hasBeenResized) {
          const workspace = getWorkspaceWidth(sidebarWidth);
          const half = Math.floor(workspace * 0.5);
          const { minWidth, maxWidth } = getCanvasWidthBounds(sidebarWidth);
          return Math.min(maxWidth, Math.max(minWidth, half));
        }
        return clampCanvasWidth(prev, sidebarWidth);
      });
    };
    const scheduleSync = () => {
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        sync();
      });
    };

    sync();
    window.addEventListener('resize', scheduleSync);
    return () => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', scheduleSync);
    };
  }, [workspaceCanvasOpen, sidebarWidth, hasBeenResized]);

  return {
    workspaceCanvasOpen,
    workspaceCanvasArtifact,
    workspaceOutputs,
    workspaceCanvasWidth,
    workspaceCanvasMinWidth,
    workspaceCanvasMaxWidth,
    handleOpenCanvasArtifact,
    handleOpenSqlEditor,
    handleCloseWorkspaceCanvas,
    handleCanvasResize,
  };
}
