import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { Box, CircularProgress, Typography, useMediaQuery, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Background,
  BaseEdge,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useInternalNode,
  useNodesState,
} from '@xyflow/react';
import { CheckIcon, CopyIcon, ProcessIcon, TableIcon } from '@/components/icons';
import { getReadOnlyReactFlowProps } from '@/config/reactFlow';
import { ArtifactShell } from '@/features/sidebar-right/artifact-loader';
import {
  FLOW_NODE_CARD_CLASS,
  getReactFlowAlphaColor,
  getReactFlowBackgroundColor,
  getReactFlowCanvasSx,
  getReactFlowCountBadgeSx,
  getReactFlowCustomNodeAccentSx,
  getReactFlowDefaultEdgeOptions,
  getReactFlowEdgeStyle,
  getReactFlowNodeCardSx,
  getReactFlowNodeChromeSx,
  getReactFlowNodeStatusDotSx,
  getReactFlowStatusSx,
  getReactFlowTagChipSx,
  HIDDEN_FLOW_HANDLE_STYLE,
} from '@/styles/reactFlowStyles';
import {
  getDiagramNodeDimensions,
  layoutDiagramElements,
  normalizeDiagram,
} from './diagramFlowModel';

const STREAM_SETTLE_MS = 350;
// Slightly larger default nodes give more room for rich content
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 96;
const INLINE_VIEWPORT = { width: 720, height: 340 };
const MOBILE_VIEWPORT = { width: 320, height: 230 };
const PREMIUM_NODE_TYPE = 'premium';

const getDiagramViewport = (nodes, viewportSize, isMobile) => {
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 };

  const fallback = isMobile ? MOBILE_VIEWPORT : INLINE_VIEWPORT;
  const viewportWidth = viewportSize.width || fallback.width;
  const viewportHeight = viewportSize.height || fallback.height;
  const padding = isMobile ? 24 : 36;
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(
    ...nodes.map((node) => node.position.x + (node.width || DEFAULT_NODE_WIDTH)),
  );
  const maxY = Math.max(
    ...nodes.map((node) => node.position.y + (node.height || DEFAULT_NODE_HEIGHT)),
  );
  const graphWidth = Math.max(maxX - minX, 1);
  const graphHeight = Math.max(maxY - minY, 1);
  const zoom = Math.min(
    Math.max((viewportWidth - padding * 2) / graphWidth, 0.2),
    Math.max((viewportHeight - padding * 2) / graphHeight, 0.2),
    1,
  );

  return {
    x: (viewportWidth - graphWidth * zoom) / 2 - minX * zoom,
    y: (viewportHeight - graphHeight * zoom) / 2 - minY * zoom,
    zoom,
  };
};

const parseJsonDiagram = (code) => {
  let parsed;
  try {
    parsed = JSON.parse(code);
  } catch {
    throw new Error('Diagram data must be valid JSON.');
  }
  return normalizeDiagram(parsed);
};

const getFlowPositions = (direction) => {
  if (direction === 'RL') return { source: Position.Left, target: Position.Right };
  if (direction === 'TB') return { source: Position.Bottom, target: Position.Top };
  if (direction === 'BT') return { source: Position.Top, target: Position.Bottom };
  return { source: Position.Right, target: Position.Left };
};

const getEdgeMarker = (marker, color) => {
  if (!marker || marker === 'none') return undefined;
  return {
    type: marker === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color,
  };
};

const buildFlowElements = (diagram, isMobile, theme) => {
  const edgeBaseStyle = getReactFlowEdgeStyle(theme, { isMobile });
  const positions = getFlowPositions(diagram.direction);

  const nodes = diagram.nodes.map((node) => {
    const dimensions = getDiagramNodeDimensions(node, isMobile);
    return {
      id: node.id,
      type: PREMIUM_NODE_TYPE,
      data: {
        type: node.type,
        title: node.label,
        subtitle: node.subtitle,
        count: node.count,
        status: node.status,
        tags: node.tags,
        columns: node.columns,
        customStyle: node.style,
        sourcePosition: positions.source,
        targetPosition: positions.target,
      },
      position: node.position || { x: 0, y: 0 },
      ...dimensions,
    };
  });

  const edges = diagram.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: edge.type || 'floating',
    markerStart: getEdgeMarker(edge.markerStart, edge.style?.stroke || edgeBaseStyle.stroke),
    markerEnd: getEdgeMarker(edge.markerEnd, edge.style?.stroke || edgeBaseStyle.stroke),
    style: {
      ...edgeBaseStyle,
      ...(edge.style || {}),
    },
    interactionWidth: 20,
    labelStyle: {
      fontSize: 10,
      fontWeight: 400,
      letterSpacing: 0,
    },
    animated: edge.animated,
  }));

  return layoutDiagramElements(nodes, edges, {
    layout: diagram.layout,
    direction: diagram.direction,
    isMobile,
  });
};

// ─── Premium Node Component ───────────────────────────────────────────────────

const QUERY_PLAN_NODE_TYPES = new Set(['aggregate', 'filter', 'join', 'scan', 'sort']);

const getNodeTypeOverrides = (theme, nodeType) => {
  if (nodeType === 'decision') {
    return {
      isolation: 'isolate',
      overflow: 'visible',
      border: 'none',
      borderRadius: 0,
      boxShadow: 'none',
      backgroundColor: 'transparent',
      backgroundImage: 'none',
      px: 3.5,
      '&::before': {
        content: '""',
        position: 'absolute',
        top: '50%',
        left: '50%',
        zIndex: -1,
        width: '55%',
        aspectRatio: '1',
        transform: 'translate(-50%, -50%) rotate(45deg)',
        border: `1px solid ${theme.palette.warning.main}`,
        borderRadius: '3px',
        backgroundColor: alpha(theme.palette.warning.main, theme.palette.opacity.soft),
      },
      '&:hover': {
        border: 'none',
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        boxShadow: 'none',
      },
    };
  }
  if (nodeType === 'input' || nodeType === 'output') {
    return {
      borderRadius: '999px',
      borderColor: nodeType === 'input' ? theme.palette.success.main : theme.palette.info.main,
    };
  }
  if (nodeType === 'event' || nodeType === 'actor') {
    return {
      borderRadius: '50%',
      borderColor: theme.palette.info.main,
      backgroundColor: alpha(theme.palette.info.main, theme.palette.opacity.soft),
    };
  }
  if (nodeType === 'data') {
    return {
      borderRadius: '50% / 14%',
      borderTop: `3px double ${theme.palette.secondary.main}`,
      borderBottom: `3px double ${theme.palette.secondary.main}`,
    };
  }
  if (nodeType === 'note') {
    return {
      borderRadius: 0,
      borderStyle: 'dashed',
      clipPath: 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%)',
      backgroundColor: alpha(theme.palette.warning.main, theme.palette.opacity.soft),
    };
  }
  if (nodeType === 'group') {
    return {
      borderStyle: 'dashed',
      borderColor: theme.palette.border.hover,
      backgroundColor: alpha(theme.palette.text.primary, theme.palette.opacity.barely),
      justifyContent: 'flex-start',
    };
  }
  if (nodeType === 'entity') {
    return {
      borderRadius: '6px',
      borderLeft: `3px solid ${theme.palette.primary.main}`,
    };
  }
  if (nodeType === 'process') {
    return {
      borderRadius: '8px',
      borderLeft: `3px solid ${theme.palette.primary.main}`,
    };
  }
  if (QUERY_PLAN_NODE_TYPES.has(nodeType)) {
    const tone =
      nodeType === 'scan'
        ? theme.palette.error.main
        : nodeType === 'filter' || nodeType === 'sort'
          ? theme.palette.warning.main
          : nodeType === 'aggregate'
            ? theme.palette.secondary.main
            : theme.palette.info.main;
    return {
      borderRadius: '4px',
      borderLeft: `4px solid ${tone}`,
      backgroundColor: alpha(tone, theme.palette.opacity.soft),
    };
  }
  return {};
};

const DiagramFlowNode = memo(function DiagramFlowNode({ data }) {
  const theme = useTheme();
  const status = data.status;
  const showStatus = status && status !== 'ready';
  const hasTags = data.tags?.length > 0;
  const hasCount = Number.isFinite(data.count);
  const hasFooter = showStatus || hasTags || hasCount;
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const displayedColumns = columns.slice(0, 8);
  const disabled = status === 'disabled';
  const accentSx = getReactFlowCustomNodeAccentSx(theme, data.customStyle, disabled);

  const nodeType = data.type;
  const isEntity = nodeType === 'entity';
  const isProcess = nodeType === 'process';
  const typeOverridesSx = getNodeTypeOverrides(theme, nodeType);
  const wrapsTitle = nodeType === 'decision' || nodeType === 'note' || nodeType === 'group';

  return (
    <Box
      className={FLOW_NODE_CARD_CLASS}
      sx={{
        ...getReactFlowNodeCardSx(theme, { disabled, interactive: true }),
        ...getReactFlowNodeChromeSx(theme, disabled),
        position: 'relative',
        height: '100%',
        minHeight: 0,
        px: 1.75,
        py: 1.5,
        color: disabled ? 'text.disabled' : 'text.primary',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: hasFooter || columns.length > 0 ? 'space-between' : 'center',
        gap: hasFooter ? 1.25 : 0,
        textAlign: 'center',
        opacity: disabled ? 0.62 : 1,
        ...typeOverridesSx,
        ...accentSx,
        ...(!disabled && data.customStyle && typeof data.customStyle === 'object'
          ? {
              ...data.customStyle,
              ...(data.customStyle.backgroundColor || data.customStyle.background
                ? { backgroundImage: 'none' }
                : {}),
              '&:hover': {
                ...data.customStyle,
                ...(data.customStyle.backgroundColor || data.customStyle.background
                  ? { backgroundImage: 'none' }
                  : {}),
              },
            }
          : {}),
      }}
    >
      <Handle
        type="target"
        position={data.targetPosition || Position.Left}
        style={HIDDEN_FLOW_HANDLE_STYLE}
      />

      {/* Status indicator dot — top-right corner */}
      {status && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 8,
            right: 9,
            width: 6,
            height: 6,
            borderRadius: '50%',
            zIndex: 2,
            ...getReactFlowNodeStatusDotSx(theme, status),
          }}
        />
      )}

      {/* Primary content: label + subtitle */}
      <Box sx={{ minWidth: 0, width: '100%' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
            width: '100%',
            minWidth: 0,
            mb: 0.25,
          }}
        >
          {isEntity && (
            <TableIcon sx={{ fontSize: 16, color: theme.palette.primary.main, flexShrink: 0 }} />
          )}
          {isProcess && (
            <ProcessIcon sx={{ fontSize: 16, color: theme.palette.primary.main, flexShrink: 0 }} />
          )}
          <Typography
            noWrap={!wrapsTitle}
            sx={{
              ...theme.typography.uiBodySm,
              lineHeight: 1.25,
              letterSpacing: 0,
              color: disabled
                ? 'text.disabled'
                : data.customStyle?.color
                  ? 'inherit'
                  : 'text.primary',
              textAlign: 'center',
              fontSize: data.customStyle?.fontSize ? 'inherit' : undefined,
              fontWeight: data.customStyle?.fontWeight ? 'inherit' : 660,
            }}
          >
            {data.title}
          </Typography>
        </Box>
        {data.subtitle && (
          <Typography
            noWrap
            sx={{
              mt: 0.4,
              ...theme.typography.uiCaption2xs,
              lineHeight: 1.35,
              letterSpacing: 0,
              color: disabled
                ? 'text.disabled'
                : data.customStyle?.color
                  ? 'inherit'
                  : 'text.secondary',
              textAlign: 'center',
              opacity: data.customStyle?.color ? 0.82 : 1,
            }}
          >
            {data.subtitle}
          </Typography>
        )}
      </Box>

      {columns.length > 0 && (
        <Box
          sx={{
            width: '100%',
            mt: 1,
            pt: 0.75,
            borderTop: '1px solid',
            borderColor: data.customStyle?.color
              ? getReactFlowAlphaColor(data.customStyle.color, 0.24, theme.palette.border.subtle)
              : theme.palette.border.subtle,
          }}
        >
          {displayedColumns.map((column) => (
            <Box
              key={`${column.name}-${column.key || ''}`}
              sx={{
                minHeight: 20,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 1,
                color: data.customStyle?.color ? 'inherit' : 'text.secondary',
              }}
            >
              <Box
                component="span"
                sx={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  fontFamily: theme.typography.fontFamilyMono,
                  fontSize: 10.5,
                  lineHeight: 1.35,
                }}
              >
                {column.key ? `${column.key}  ` : ''}
                {column.name}
              </Box>
              {column.type && (
                <Box
                  component="span"
                  sx={{
                    maxWidth: 104,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: theme.typography.fontFamilyMono,
                    fontSize: 9.5,
                    opacity: 0.72,
                  }}
                >
                  {column.type}
                </Box>
              )}
            </Box>
          ))}
          {columns.length > displayedColumns.length && (
            <Typography
              sx={{
                mt: 0.25,
                textAlign: 'left',
                fontFamily: theme.typography.fontFamilyMono,
                fontSize: 9.5,
                color: data.customStyle?.color ? 'inherit' : 'text.disabled',
                opacity: data.customStyle?.color ? 0.72 : 1,
              }}
            >
              +{columns.length - displayedColumns.length} more
            </Typography>
          )}
        </Box>
      )}

      {/* Footer row: status badge, count pill, tag chips */}
      {hasFooter && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 0.5,
            minWidth: 0,
            width: '100%',
          }}
        >
          {showStatus && (
            <Box
              component="span"
              sx={{
                px: 0.875,
                py: 0.375,
                borderRadius: theme.shape.radius?.full ?? '999px',
                border: '1px solid',
                fontFamily: theme.typography.fontFamilyMono,
                fontSize: 10.5,
                fontWeight: 400,
                lineHeight: 1,
                letterSpacing: 0,
                textTransform: 'none',
                ...getReactFlowStatusSx(theme, status),
              }}
            >
              {status}
            </Box>
          )}

          {hasCount && (
            <Box component="span" sx={getReactFlowCountBadgeSx(theme)}>
              {data.count}
            </Box>
          )}

          {/* Individual tag chips instead of a joined string */}
          {hasTags &&
            data.tags.map((tag) => (
              <Box key={tag} component="span" sx={getReactFlowTagChipSx(theme)}>
                {tag}
              </Box>
            ))}
        </Box>
      )}

      <Handle
        type="source"
        position={data.sourcePosition || Position.Right}
        style={HIDDEN_FLOW_HANDLE_STYLE}
      />
    </Box>
  );
});

const nodeTypes = {
  [PREMIUM_NODE_TYPE]: DiagramFlowNode,
};

// ─── Floating Edge ────────────────────────────────────────────────────────────

const getNodeGeometry = (node) => {
  if (!node) return null;
  const position = node.internals?.positionAbsolute || node.position || { x: 0, y: 0 };
  const width = node.measured?.width || node.width || node.initialWidth || DEFAULT_NODE_WIDTH;
  const height = node.measured?.height || node.height || node.initialHeight || DEFAULT_NODE_HEIGHT;

  return {
    x: position.x,
    y: position.y,
    width,
    height,
    centerX: position.x + width / 2,
    centerY: position.y + height / 2,
  };
};

const getBorderCenterPoint = (sourceNode, targetNode) => {
  const source = getNodeGeometry(sourceNode);
  const target = getNodeGeometry(targetNode);
  if (!source || !target) return null;

  const dx = target.centerX - source.centerX;
  const dy = target.centerY - source.centerY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? source.x + source.width : source.x,
      y: source.centerY,
      position: dx >= 0 ? Position.Right : Position.Left,
    };
  }

  return {
    x: source.centerX,
    y: dy >= 0 ? source.y + source.height : source.y,
    position: dy >= 0 ? Position.Bottom : Position.Top,
  };
};

const FloatingBorderCenterEdge = memo(function FloatingBorderCenterEdge({
  id,
  source,
  target,
  markerStart,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
}) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourcePoint = getBorderCenterPoint(sourceNode, targetNode);
  const targetPoint = getBorderCenterPoint(targetNode, sourceNode);

  if (!sourcePoint || !targetPoint) return null;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition: sourcePoint.position,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition: targetPoint.position,
    // Slightly more graceful curve
    curvature: 0.28,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
    />
  );
});

const edgeTypes = {
  floating: FloatingBorderCenterEdge,
};

// ─── Main Renderer ────────────────────────────────────────────────────────────

function DiagramFlowRenderer({
  code,
  _title,
  onClose,
  onRequestClose,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  onToggleFullscreen,
  chrome = 'standalone',
  workspaceContainerRef,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const copyTimeoutRef = useRef(null);
  const settleTimeoutRef = useRef(null);
  const flowInstanceRef = useRef(null);
  const flowViewportRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [flowReadyToken, setFlowReadyToken] = useState(0);
  const [stableCode, setStableCode] = useState(code);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [viewportReadySignature, setViewportReadySignature] = useState('');
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false);
  // Tracks whether the initial fitView has completed. The initial fit uses a
  // 2-RAF defer to let react-flow measure node dimensions first. Subsequent
  // resize-triggered fits (e.g. during the maximize animation) must NOT use
  // that defer — they need to run immediately on every frame so the diagram
  // tracks the container smoothly. Without this split, the 2-RAF defer gets
  // canceled on every frame during a spring animation, so fitView only fires
  // after the animation stops — causing the "diagram stays small during
  // maximize, jumps big at the end" bug.
  const hasInitialFitRef = useRef(false);
  const isReceiving = stableCode !== code;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset rendered once state when stableCode changes
  useEffect(() => {
    setHasRenderedOnce(false);
    // Reset the initial-fit flag when a new diagram arrives so the 2-RAF
    // defer runs again for the new node set.
    hasInitialFitRef.current = false;
  }, [stableCode]);

  useEffect(() => {
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = setTimeout(() => {
      setStableCode(code);
    }, STREAM_SETTLE_MS);

    return () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
  }, [code]);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    },
    [],
  );

  const parseResult = useMemo(() => {
    if (!stableCode || isReceiving) return { diagram: null, error: null };
    try {
      const diagram = parseJsonDiagram(stableCode);
      return { diagram, error: null };
    } catch (error) {
      return { diagram: null, error: error.message || 'Diagram data could not be rendered.' };
    }
  }, [stableCode, isReceiving]);

  const flowElements = useMemo(() => {
    if (!parseResult.diagram) return { nodes: [], edges: [] };
    return buildFlowElements(parseResult.diagram, isMobile, theme);
  }, [parseResult.diagram, isMobile, theme]);

  const reactFlowProps = useMemo(() => getReadOnlyReactFlowProps(theme), [theme]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowElements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowElements.edges);

  const initialViewport = useMemo(
    () => getDiagramViewport(nodes, viewportSize, isMobile),
    [isMobile, nodes, viewportSize],
  );

  const defaultEdgeOptions = useMemo(
    () => getReactFlowDefaultEdgeOptions(theme, { isMobile }),
    [isMobile, theme],
  );

  useEffect(() => {
    setNodes(flowElements.nodes);
    setEdges(flowElements.edges);
  }, [flowElements, setNodes, setEdges]);

  const fitDiagramViewport = useCallback(
    (instance = flowInstanceRef.current) => {
      if (!instance || nodes.length === 0) return false;
      if (typeof instance.fitView === 'function') {
        instance.fitView({
          padding: isFullscreen ? 0.16 : 0.12,
          duration: 0,
        });
      } else {
        instance.setViewport(initialViewport, { duration: 0 });
      }
      return true;
    },
    [initialViewport, isFullscreen, nodes.length],
  );

  const handleFlowInit = useCallback((instance) => {
    flowInstanceRef.current = instance;
    setFlowReadyToken((value) => value + 1);
  }, []);

  const viewportSignature = `${isFullscreen ? 'full' : 'inline'}-${viewportSize.width}x${viewportSize.height}-${nodes.length}-${edges.length}-${stableCode.length}-${flowReadyToken}`;
  const viewportReady = viewportReadySignature === viewportSignature;

  useEffect(() => {
    if (viewportReady) {
      setHasRenderedOnce(true);
    }
  }, [viewportReady]);

  useEffect(() => {
    if (isReceiving || parseResult.error || nodes.length === 0) return undefined;
    if (!viewportSize.width || !viewportSize.height || !flowReadyToken) return undefined;
    // Once the initial fit has completed, subsequent viewport changes are
    // handled by the resize-fit effect below — this effect is ONLY for the
    // first fit (which needs the 2-RAF defer for node measurement).
    if (hasInitialFitRef.current) return undefined;

    let firstFrame = null;
    let secondFrame = null;
    let revealFrame = null;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        try {
          fitDiagramViewport();
        } catch {
          flowInstanceRef.current?.setViewport?.(initialViewport, { duration: 0 });
        }
        revealFrame = requestAnimationFrame(() => {
          // A resize may cancel this frame. Only finish initialization once
          // the graph is revealed, so an interrupted fit can retry.
          hasInitialFitRef.current = true;
          setHasRenderedOnce(true);
          setViewportReadySignature(viewportSignature);
        });
      });
    });

    return () => {
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (revealFrame) cancelAnimationFrame(revealFrame);
    };
  }, [
    fitDiagramViewport,
    flowReadyToken,
    initialViewport,
    isReceiving,
    nodes.length,
    parseResult.error,
    viewportSignature,
    viewportSize.height,
    viewportSize.width,
  ]);

  // ── Resize-fit effect ────────────────────────────────────────────────────
  // After the initial fit, every viewport-size or fullscreen-state change
  // triggers an IMMEDIATE fitView (no 2-RAF defer). This is what makes the
  // diagram track the container smoothly during the maximize/minimize spring
  // animation — previously, the 2-RAF defer was getting canceled on every
  // frame, so fitView only fired after the animation stopped.
  //
  // We use a single rAF to batch multiple synchronous size updates into one
  // fit call (e.g. if width and height both change in the same frame), but
  // we do NOT cancel across effect re-runs — each frame's fit is allowed to
  // execute. `duration: 0` means the viewport snaps to the new bounds
  // instantly; since the container is animating smoothly via spring physics,
  // the diagram appears to animate smoothly too (each frame it re-fits to
  // the slightly-larger container).
  useEffect(() => {
    if (!hasInitialFitRef.current) return;
    if (!flowInstanceRef.current || nodes.length === 0) return;
    if (!viewportSize.width || !viewportSize.height) return;

    let frame = null;
    frame = requestAnimationFrame(() => {
      try {
        flowInstanceRef.current?.fitView({
          padding: isFullscreen ? 0.16 : 0.12,
          duration: 0,
        });
      } catch {
        // ignore — fitView can throw if nodes haven't been measured yet
      }
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [viewportSize, isFullscreen, nodes.length]);

  useEffect(() => {
    const viewport = flowViewportRef.current;
    if (!viewport) return undefined;

    let frame = null;
    const updateViewportSize = ({ width, height }) => {
      setViewportSize((current) => {
        const nextWidth = Math.round(width);
        const nextHeight = Math.round(height);
        if (current.width === nextWidth && current.height === nextHeight) return current;
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateViewportSize(viewport.getBoundingClientRect());

    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(([entry]) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        updateViewportSize(entry.contentRect);
      });
    });

    observer.observe(viewport);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  if (parseResult.error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <ArtifactShell
          title="Diagram"
          chrome={chrome}
          onClose={onClose}
          onRequestClose={onRequestClose}
          isFullscreen={isFullscreen}
          onEnterFullscreen={onEnterFullscreen}
          onExitFullscreen={onExitFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          workspaceContainerRef={workspaceContainerRef}
          bodyScroll="auto"
          bodySx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
          actions={[
            {
              key: 'copy',
              label: copied ? 'Copied!' : 'Copy code',
              icon: copied ? (
                <CheckIcon sx={{ fontSize: 18 }} />
              ) : (
                <CopyIcon sx={{ fontSize: 18 }} />
              ),
              onClick: handleCopy,
            },
          ]}
        >
          <Box
            sx={{
              p: isMobile ? 1.5 : 2,
              borderBottom: '1px solid',
              borderColor: theme.palette.border.subtle,
              bgcolor: alpha(theme.palette.error.main, theme.palette.opacity.soft),
              flexShrink: 0,
            }}
          >
            <Typography sx={{ ...theme.typography.uiCaptionMd, color: 'error.main' }}>
              {parseResult.error}
            </Typography>
          </Box>
          <Box
            component="pre"
            sx={{
              flex: 1,
              minHeight: 0,
              m: 0,
              p: isMobile ? 1.5 : 2,
              overflow: 'auto',
              fontFamily: theme.typography.fontFamilyMono,
              ...theme.typography.uiBodySm,
              bgcolor: theme.palette.layer.barely,
            }}
          >
            <code>{code}</code>
          </Box>
        </ArtifactShell>
      </Box>
    );
  }

  const flowContent = (
    <ArtifactShell
      title="Diagram"
      chrome={chrome}
      onClose={onClose}
      onRequestClose={onRequestClose}
      isFullscreen={isFullscreen}
      onEnterFullscreen={onEnterFullscreen}
      onExitFullscreen={onExitFullscreen}
      onToggleFullscreen={onToggleFullscreen}
      workspaceContainerRef={workspaceContainerRef}
      actions={[
        {
          key: 'copy',
          label: copied ? 'Copied!' : 'Copy code',
          icon: copied ? <CheckIcon sx={{ fontSize: 18 }} /> : <CopyIcon sx={{ fontSize: 18 }} />,
          onClick: handleCopy,
        },
      ]}
    >
      <Box
        ref={flowViewportRef}
        sx={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          position: 'relative',
          zIndex: 0,
          isolation: 'isolate',
          overflow: 'hidden',
          bgcolor: theme.palette.layer.barely,
        }}
      >
        {isReceiving ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <CircularProgress size={32} sx={{ color: 'text.secondary' }} />
            <Typography sx={{ ...theme.typography.uiCaptionMd, color: 'text.secondary' }}>
              Receiving diagram data
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              ...getReactFlowCanvasSx(theme),
              zIndex: 0,
              isolation: 'isolate',
              opacity: hasRenderedOnce || viewportReady ? 1 : 0,
              transition: 'none',
            }}
          >
            <ReactFlow
              aria-label="Diagram flow"
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onInit={handleFlowInit}
              defaultViewport={initialViewport}
              defaultEdgeOptions={defaultEdgeOptions}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              minZoom={0.2}
              maxZoom={2}
              {...reactFlowProps}
              panOnScroll={!isMobile}
              panOnDrag
              zoomOnScroll={!isMobile}
              zoomOnPinch
              preventScrolling
            >
              <Background gap={24} size={0.9} color={getReactFlowBackgroundColor(theme)} />
            </ReactFlow>
          </Box>
        )}
      </Box>
    </ArtifactShell>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        zIndex: 0,
        isolation: 'isolate',
      }}
    >
      {flowContent}
    </Box>
  );
}

export default memo(DiagramFlowRenderer);
