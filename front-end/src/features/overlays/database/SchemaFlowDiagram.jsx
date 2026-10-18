import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { ChevronRightIcon, DatabaseIcon, PrimaryKeyIcon, TableIcon } from '@/components/icons';
import { getReadOnlyReactFlowProps } from '@/config/reactFlow';
import {
  getMindmapFitViewOptions,
  getMindmapInteractionProps,
} from '@/features/styles/interfaceChrome';
import {
  FLOW_NODE_CARD_CLASS,
  getReactFlowDefaultEdgeOptions,
  getReactFlowEdgeStyle,
  HIDDEN_FLOW_HANDLE_STYLE,
} from '@/styles/reactFlowStyles';

const MOBILE_BREAKPOINT_QUERY = 'sm';

const CustomBezierEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return <BaseEdge id={id} path={edgePath} style={style} />;
};
const DatabaseNode = memo(({ data }) => {
  const theme = useTheme();
  const isMobile = data.isMobile;

  return (
    <Box
      className={FLOW_NODE_CARD_CLASS}
      sx={{
        ...getSchemaNodeCardSx(theme),
        px: { xs: 1.75, sm: 1.5 },
        py: { xs: 1.25, sm: 1 },
        backgroundColor: theme.palette.layer.soft,
        borderColor: theme.palette.border.default,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: isMobile ? 164 : 150,
        minHeight: isMobile ? 54 : 48,
        '&:hover': {
          borderColor: theme.palette.border.hover,
        },
      }}
    >
      <DatabaseIcon
        sx={{
          width: { xs: 18, sm: 16 },
          height: { xs: 18, sm: 16 },
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          noWrap
          variant="body2"
          sx={{
            fontWeight: 400,
            color: theme.palette.text.primary,
            ...theme.typography.uiSchemaDbLabel,
          }}
        >
          {data.label}
        </Typography>
        <Typography
          noWrap
          variant="caption"
          sx={{
            color: theme.palette.text.secondary,
            ...theme.typography.uiCaption2xs,
          }}
        >
          {data.tableCount} tables
        </Typography>
      </Box>
      <ChevronRightIcon
        sx={{
          fontSize: { xs: 18, sm: 14 },
          color: alpha(theme.palette.text.primary, 0.5),
          ml: 'auto',
        }}
      />
      <Handle type="source" position={Position.Right} style={HIDDEN_FLOW_HANDLE_STYLE} />
    </Box>
  );
});
DatabaseNode.displayName = 'DatabaseNode';
const TableNode = memo(({ data }) => {
  const theme = useTheme();
  const isMobile = data.isMobile;
  const hasColumns = data.columnCount > 0;
  const handleToggle = useCallback(() => {
    if (hasColumns && data.onToggle) data.onToggle(data.id);
  }, [data, hasColumns]);
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle();
      }
    },
    [handleToggle],
  );

  return (
    <Box
      className={FLOW_NODE_CARD_CLASS}
      role={hasColumns ? 'button' : undefined}
      tabIndex={hasColumns ? 0 : undefined}
      aria-expanded={hasColumns ? data.expanded : undefined}
      sx={{
        ...getSchemaNodeCardSx(theme, { interactive: hasColumns }),
        px: { xs: 1.5, sm: 1.25 },
        py: { xs: 1.1, sm: 0.95 },
        borderColor: theme.palette.border.idle,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 0.75 },
        minWidth: isMobile ? 160 : 144,
        minHeight: isMobile ? 52 : 46,
      }}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_FLOW_HANDLE_STYLE} />

      <TableIcon
        sx={{
          width: { xs: 16, sm: 14 },
          height: { xs: 16, sm: 14 },
          opacity: data.expanded ? 1 : 0.78,
        }}
      />

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          noWrap
          variant="caption"
          sx={{
            fontWeight: 400,
            color: data.expanded ? theme.palette.text.primary : 'text.primary',
            ...theme.typography.uiSchemaTableLabel,
          }}
        >
          {data.label}
        </Typography>
        <Typography
          noWrap
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.25,
            color: 'text.secondary',
            ...theme.typography.uiCaption2xs,
          }}
        >
          {data.columnCount} columns
        </Typography>
      </Box>

      {hasColumns && (
        <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto' }}>
          <ChevronRightIcon
            sx={{
              fontSize: { xs: 16, sm: 14 },
              color: 'text.secondary',
              transform: data.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </Box>
      )}

      <Handle type="source" position={Position.Right} style={HIDDEN_FLOW_HANDLE_STYLE} />
    </Box>
  );
});
TableNode.displayName = 'TableNode';
const ColumnNode = memo(({ data }) => {
  const theme = useTheme();
  const isMobile = data.isMobile;
  const isPK = data.isPrimaryKey;

  return (
    <Box
      className={FLOW_NODE_CARD_CLASS}
      sx={{
        ...getSchemaNodeCardSx(theme),
        px: { xs: 1.25, sm: 1 },
        py: { xs: 0.75, sm: 0.625 },
        backgroundColor: isPK
          ? alpha(theme.palette.warning.main, theme.palette.opacity.statusBackground)
          : theme.palette.layer.surfaceSoft,
        borderColor: isPK
          ? alpha(theme.palette.warning.main, theme.palette.opacity.statusBorderSelected)
          : theme.palette.border.subtle,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 0.5 },
        minWidth: isMobile ? 138 : 124,
        minHeight: isMobile ? 38 : 32,
        '&:hover': {
          borderColor: isPK
            ? alpha(theme.palette.warning.main, theme.palette.opacity.emphasis)
            : theme.palette.border.hover,
        },
      }}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_FLOW_HANDLE_STYLE} />

      {isPK && (
        <PrimaryKeyIcon
          sx={{
            fontSize: { xs: 12, sm: 10 },
            color: theme.palette.warning.main,
          }}
        />
      )}

      <Typography
        variant="caption"
        sx={{
          color: isPK ? theme.palette.warning.main : 'text.primary',
          fontWeight: 400,
          ...theme.typography.uiSchemaColumnLabel,
          fontFamily: theme.typography.fontFamilyMono,
        }}
      >
        {data.label}
      </Typography>

      {data.type && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            ...theme.typography.uiSchemaColumnType,
            ml: 'auto',
            fontFamily: theme.typography.fontFamilyMono,
            opacity: 0.7,
          }}
        >
          {data.type}
        </Typography>
      )}
    </Box>
  );
});
ColumnNode.displayName = 'ColumnNode';
const nodeTypes = {
  database: DatabaseNode,
  table: TableNode,
  column: ColumnNode,
};

const edgeTypes = {
  custom: CustomBezierEdge,
};

const getSchemaNodeCardSx = (theme, { interactive = false } = {}) => {
  const borderColor = theme.palette.border.idle;

  return {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    borderRadius: '8px',
    border: '1px solid',
    borderColor,
    backgroundColor: theme.palette.layer.surfaceSoft,
    backgroundImage: 'none',
    boxShadow: 'none',
    cursor: interactive ? 'pointer' : 'default',
    transition: theme.transitions.create(
      ['background-color', 'border-color', 'box-shadow', 'transform'],
      {
        duration: theme.transitions.duration.shorter,
      },
    ),
    '&:hover': interactive
      ? {
          borderColor: theme.palette.border.hover,
          backgroundColor: theme.palette.background.paper,
          boxShadow: 'none',
          transform: 'translateY(-1px)',
        }
      : undefined,
    '&:active': interactive
      ? {
          transform: 'translateY(0)',
        }
      : undefined,
  };
};

const getSchemaCanvasSx = (theme, { isMobile = false } = {}) => {
  return {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: theme.palette.layer.surfaceMuted,
    '& .react-flow': {
      '--xy-edge-stroke-default': theme.palette.layer.secondaryContent,
      '--xy-edge-stroke-width-default': 1.35,
      '--xy-edge-stroke-selected-default': theme.palette.action.active,
      '--xy-selection-background-color-default': theme.palette.action.hover,
      '--xy-selection-border-default': `1px dotted ${theme.palette.border.hover}`,
    },
    '& .react-flow__pane': { cursor: 'grab' },
    '& .react-flow__pane:active': { cursor: 'grabbing' },
    '& .react-flow__viewport': {
      filter: 'none',
    },
    '& .react-flow__node': {
      borderRadius: '8px',
      outline: 'none',
    },
    [`& .react-flow__node.selected .${FLOW_NODE_CARD_CLASS}`]: {
      borderColor: theme.palette.border.idle,
      boxShadow: 'none',
    },
    [`& .react-flow__node:focus-visible .${FLOW_NODE_CARD_CLASS}`]: {
      outline: `2px solid ${theme.palette.border.focus}`,
      outlineOffset: 3,
    },
    '& .react-flow__edge-path': {
      strokeLinecap: 'round',
      filter: 'none',
      transition: 'stroke 160ms ease, stroke-width 160ms ease, opacity 160ms ease',
    },
    '& .react-flow__edge.selected .react-flow__edge-path': {
      strokeWidth: 2,
      stroke: theme.palette.action.active,
    },
    '& .react-flow__edge:hover .react-flow__edge-path': {
      strokeWidth: 2,
      stroke: theme.palette.layer.emphasis,
    },
    '& .react-flow__controls': {
      display: 'flex',
      overflow: 'hidden',
      border: '1px solid',
      borderColor: theme.palette.border.subtle,
      borderRadius: '10px',
      backgroundColor: theme.palette.background.paper,
      boxShadow: 'none',
    },
    '& .react-flow__controls-button': {
      width: isMobile ? 44 : 36,
      height: isMobile ? 44 : 36,
      border: 0,
      borderRight: '1px solid',
      borderRightColor: theme.palette.border.subtle,
      color: theme.palette.text.secondary,
      backgroundColor: theme.palette.background.paper,
      '&:last-of-type': { borderRight: 0 },
      '&:hover': {
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.action.hover,
      },
      '&:focus-visible': {
        position: 'relative',
        zIndex: 1,
        outline: `2px solid ${theme.palette.border.focus}`,
        outlineOffset: -2,
      },
      '& svg': { width: 15, height: 15, fill: 'currentColor' },
    },
  };
};

const getInactiveSchemaCanvasSx = (theme) => ({
  width: '100%',
  height: '100%',
  minHeight: 300,
  borderRadius: '8px',
  overflow: 'hidden',
  contain: 'strict',
  contentVisibility: 'hidden',
  backgroundColor: theme.palette.layer.surfaceMuted,
});

const getLayoutedElements = (nodes, edges, direction = 'LR', isMobile = false) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: isMobile ? 16 : 24,
    ranksep: isMobile ? 50 : 80,
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: node.width || 120, height: node.height || 32 });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - (node.width || 120) / 2,
        y: nodeWithPosition.y - (node.height || 32) / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};
function SchemaFlowDiagramCanvas({ database, tables, columns }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(MOBILE_BREAKPOINT_QUERY));
  const [expandedTables, setExpandedTables] = useState(new Set());
  const validTableIds = useMemo(
    () => new Set(tables.map((tableName) => `table-${tableName}`)),
    [tables],
  );
  const activeExpandedTables = useMemo(
    () => new Set([...expandedTables].filter((tableId) => validTableIds.has(tableId))),
    [expandedTables, validTableIds],
  );

  const toggleTable = useCallback((tableId) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  }, []);
  const edgeStyle = useMemo(
    () => ({
      ...getReactFlowEdgeStyle(theme, { isMobile, emphasis: 'subtle' }),
    }),
    [isMobile, theme],
  );

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes = [];
    const edges = [];
    const dbNodeWidth = isMobile ? 176 : 160;
    const dbNodeHeight = isMobile ? 58 : 52;
    const tableNodeWidth = isMobile ? 170 : 154;
    const tableNodeHeight = isMobile ? 58 : 52;
    const colNodeWidth = isMobile ? 148 : 134;
    const colNodeHeight = isMobile ? 40 : 34;
    nodes.push({
      id: 'db',
      type: 'database',
      data: {
        label: database,
        tableCount: tables.length,
        isMobile,
      },
      position: { x: 0, y: 0 },
      width: dbNodeWidth,
      height: dbNodeHeight,
    });
    tables.forEach((tableName) => {
      const tableId = `table-${tableName}`;
      const tableColumns = columns[tableName] || [];
      const isExpanded = activeExpandedTables.has(tableId);

      nodes.push({
        id: tableId,
        type: 'table',
        data: {
          id: tableId,
          label: tableName,
          columnCount: tableColumns.length,
          expanded: isExpanded,
          onToggle: toggleTable,
          isMobile,
        },
        position: { x: 0, y: 0 },
        width: tableNodeWidth,
        height: tableNodeHeight,
      });

      edges.push({
        id: `db-${tableId}`,
        source: 'db',
        target: tableId,
        type: 'custom',
        style: edgeStyle,
        interactionWidth: 18,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      if (isExpanded) {
        tableColumns.forEach((col) => {
          const colName = typeof col === 'object' ? col.name : col;
          const colType = typeof col === 'object' ? col.type : null;
          const isPK = typeof col === 'object' && (col.is_primary_key || col.key === 'PRI');
          const columnId = `${tableId}-col-${colName}`;

          nodes.push({
            id: columnId,
            type: 'column',
            data: {
              label: colName,
              type: colType,
              isPrimaryKey: isPK,
              isMobile,
            },
            position: { x: 0, y: 0 },
            width: colNodeWidth,
            height: colNodeHeight,
          });

          edges.push({
            id: `${tableId}-${columnId}`,
            source: tableId,
            target: columnId,
            type: 'custom',
            style: getReactFlowEdgeStyle(theme, { isMobile, emphasis: 'subtle' }),
            interactionWidth: 18,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });
        });
      }
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      'LR',
      isMobile,
    );
    return { initialNodes: layoutedNodes, initialEdges: layoutedEdges };
  }, [database, tables, columns, activeExpandedTables, toggleTable, edgeStyle, isMobile, theme]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowProps = useMemo(() => getReadOnlyReactFlowProps(theme), [theme]);
  const defaultEdgeOptions = useMemo(
    () => getReactFlowDefaultEdgeOptions(theme, { isMobile }),
    [isMobile, theme],
  );
  const fitViewOptions = useMemo(() => getMindmapFitViewOptions(isMobile), [isMobile]);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 300,
        borderRadius: '8px',
        overflow: 'hidden',
        contain: 'layout paint style',
        touchAction: 'pan-y',
        border: '1px solid',
        borderColor: theme.palette.border.subtle,
        backgroundColor: theme.palette.layer.surfaceMuted,
      }}
    >
      <Box sx={getSchemaCanvasSx(theme, { isMobile })}>
        <ReactFlow
          aria-label="Database schema diagram"
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.2}
          maxZoom={2}
          {...reactFlowProps}
          {...getMindmapInteractionProps(isMobile)}
        >
          <Background gap={24} size={0.65} color={theme.palette.layer.subtle} />
          <Controls
            position="bottom-right"
            orientation="horizontal"
            showInteractive={false}
            fitViewOptions={fitViewOptions}
          />
        </ReactFlow>
      </Box>
    </Box>
  );
}

function SchemaFlowDiagram({ active = true, database, tables, columns }) {
  const theme = useTheme();

  if (!active) {
    return <Box aria-hidden sx={getInactiveSchemaCanvasSx(theme)} />;
  }

  return <SchemaFlowDiagramCanvas database={database} tables={tables} columns={columns} />;
}

export default memo(
  SchemaFlowDiagram,
  (prevProps, nextProps) => prevProps.active === nextProps.active,
);
