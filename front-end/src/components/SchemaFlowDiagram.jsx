import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import ReactFlow, {
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';

/**
 * Custom Bezier Edge - Smooth curved connections
 */
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

  return (
    <path
      id={id}
      style={style}
      className="react-flow__edge-path"
      d={edgePath}
      fill="none"
    />
  );
};

/**
 * Database root node - Mobile-first design
 */
const DatabaseNode = memo(({ data }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box
      sx={{
        // Mobile-first: larger tap targets on mobile
        px: { xs: 2.5, sm: 2 },
        py: { xs: 1.5, sm: 1 },
        borderRadius: '24px',
        backgroundColor: isDark 
          ? alpha(theme.palette.primary.main, 0.15)
          : alpha(theme.palette.primary.main, 0.1),
        border: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: isMobile ? 120 : 100,
        transition: 'all 0.2s ease',
        boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.2)}`,
      }}
    >
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          color: theme.palette.primary.main,
          fontSize: { xs: '0.95rem', sm: '0.85rem' },
        }}
      >
        {data.label}
      </Typography>
      <ChevronRightRoundedIcon
        sx={{
          fontSize: { xs: 20, sm: 16 },
          color: theme.palette.primary.main,
        }}
      />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </Box>
  );
});
DatabaseNode.displayName = 'DatabaseNode';

/**
 * Table node - Mobile-first with larger touch targets
 */
const TableNode = memo(({ data }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const hasColumns = data.columnCount > 0;

  return (
    <Box
      sx={{
        // Mobile-first: minimum 44px touch target
        px: { xs: 2, sm: 1.5 },
        py: { xs: 1.25, sm: 0.75 },
        borderRadius: '20px',
        backgroundColor: isDark 
          ? alpha(theme.palette.text.primary, 0.08)
          : alpha(theme.palette.text.primary, 0.06),
        border: `1.5px solid ${alpha(theme.palette.divider, isDark ? 0.3 : 0.5)}`,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 0.75 },
        minWidth: isMobile ? 100 : 80,
        minHeight: isMobile ? 44 : 32, // iOS touch target guideline
        cursor: hasColumns ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        '&:hover': hasColumns ? {
          backgroundColor: isDark 
            ? alpha(theme.palette.info.main, 0.15)
            : alpha(theme.palette.info.main, 0.1),
          borderColor: alpha(theme.palette.info.main, 0.5),
        } : {},
        '&:active': hasColumns ? {
          transform: 'scale(0.97)',
        } : {},
      }}
      onClick={() => hasColumns && data.onToggle && data.onToggle(data.id)}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Typography
        variant="caption"
        sx={{
          fontWeight: 500,
          color: theme.palette.text.primary,
          fontSize: { xs: '0.9rem', sm: '0.8rem' },
        }}
      >
        {data.label}
      </Typography>
      {hasColumns && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            ml: 'auto',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.secondary,
              fontSize: { xs: '0.75rem', sm: '0.65rem' },
              backgroundColor: alpha(theme.palette.text.primary, 0.08),
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
            }}
          >
            {data.columnCount}
          </Typography>
          <ChevronRightRoundedIcon
            sx={{
              fontSize: { xs: 18, sm: 14 },
              color: theme.palette.text.secondary,
              transform: data.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </Box>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </Box>
  );
});
TableNode.displayName = 'TableNode';

/**
 * Column node - Mobile-first with readable text sizes
 */
const ColumnNode = memo(({ data }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isPK = data.isPrimaryKey;

  return (
    <Box
      sx={{
        px: { xs: 1.5, sm: 1.25 },
        py: { xs: 0.75, sm: 0.5 },
        borderRadius: '16px',
        backgroundColor: isPK 
          ? alpha(theme.palette.warning.main, isDark ? 0.15 : 0.1)
          : alpha(theme.palette.text.primary, 0.04),
        border: `1px solid ${isPK 
          ? alpha(theme.palette.warning.main, 0.3) 
          : alpha(theme.palette.divider, 0.3)}`,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 0.5 },
        minWidth: isMobile ? 90 : 60,
        minHeight: isMobile ? 36 : 28,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {isPK && (
        <KeyRoundedIcon
          sx={{
            fontSize: { xs: 14, sm: 12 },
            color: theme.palette.warning.main,
          }}
        />
      )}
      <Typography
        variant="caption"
        sx={{
          color: isPK ? theme.palette.warning.main : theme.palette.text.primary,
          fontWeight: isPK ? 600 : 400,
          fontSize: { xs: '0.8rem', sm: '0.75rem' },
        }}
      >
        {data.label}
      </Typography>
      {data.type && (
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.text.disabled,
            fontSize: { xs: '0.7rem', sm: '0.65rem' },
            ml: 'auto',
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

/**
 * Apply dagre layout with responsive spacing
 */
const getLayoutedElements = (nodes, edges, direction = 'LR', isMobile = false) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  // Mobile: more vertical spacing, less horizontal
  g.setGraph({ 
    rankdir: direction, 
    nodesep: isMobile ? 20 : 30, 
    ranksep: isMobile ? 60 : 100,
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

/**
 * SchemaFlowDiagram - Mobile-first mindmap visualization
 */
function SchemaFlowDiagram({ database, tables, columns }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expandedTables, setExpandedTables] = useState(new Set());

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

  // Edge styling using theme colors
  const edgeStyle = useMemo(() => ({
    stroke: isDark 
      ? alpha(theme.palette.text.secondary, 0.4) 
      : alpha(theme.palette.text.secondary, 0.5),
    strokeWidth: isMobile ? 2 : 1.5,
  }), [isDark, isMobile, theme.palette.text.secondary]);

  // Build nodes and edges with responsive sizing
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes = [];
    const edges = [];

    // Responsive node dimensions
    const dbNodeWidth = isMobile ? 160 : 140;
    const dbNodeHeight = isMobile ? 48 : 36;
    const tableNodeWidth = isMobile ? 140 : 120;
    const tableNodeHeight = isMobile ? 44 : 32;
    const colNodeWidth = isMobile ? 130 : 110;
    const colNodeHeight = isMobile ? 36 : 28;

    // Database root node
    nodes.push({
      id: 'db',
      type: 'database',
      data: { label: database },
      position: { x: 0, y: 0 },
      width: dbNodeWidth,
      height: dbNodeHeight,
    });

    // Table nodes
    tables.forEach((tableName) => {
      const tableId = `table-${tableName}`;
      const tableColumns = columns[tableName] || [];
      const isExpanded = expandedTables.has(tableId);

      nodes.push({
        id: tableId,
        type: 'table',
        data: {
          id: tableId,
          label: tableName,
          columnCount: tableColumns.length,
          expanded: isExpanded,
          onToggle: toggleTable,
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
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      // Column nodes (only if expanded)
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
            style: { ...edgeStyle, strokeWidth: isMobile ? 1.5 : 1 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });
        });
      }
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, 'LR', isMobile);
    return { initialNodes: layoutedNodes, initialEdges: layoutedEdges };
  }, [database, tables, columns, expandedTables, toggleTable, edgeStyle, isMobile]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%', // Fill parent flex container
        minHeight: 300,
        borderRadius: { xs: 0, sm: 2 },
        overflow: 'hidden',
        border: { xs: 'none', sm: `1px solid ${theme.palette.divider}` },
        backgroundColor: isDark 
          ? alpha(theme.palette.background.paper, 0.5)
          : theme.palette.background.paper,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: isMobile ? 0.2 : 0.4 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        // Better touch interaction on mobile
        panOnScroll={!isMobile}
        panOnDrag={true}
        zoomOnScroll={!isMobile}
        zoomOnPinch={true}
        preventScrolling={true}
      >
        <Controls
          showInteractive={false}
          position={isMobile ? 'bottom-right' : 'top-right'}
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '4px',
            padding: '6px',
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            borderRadius: '8px',
            border: `1px solid ${isDark ? '#3f3f46' : '#e4e4e7'}`,
            boxShadow: isDark 
              ? '0 2px 8px rgba(0,0,0,0.3)' 
              : '0 2px 8px rgba(0,0,0,0.1)',
            ...(isMobile 
              ? { bottom: '12px', right: '12px' }
              : { top: '12px', right: '12px' }
            ),
          }}
          className="react-flow-controls-custom"
        />
      </ReactFlow>
      {/* Custom CSS for ReactFlow Controls buttons */}
      <style>{`
        .react-flow-controls-custom button {
          width: 24px !important;
          height: 24px !important;
          background-color: ${isDark ? '#3f3f46' : '#f4f4f5'} !important;
          border: 1px solid ${isDark ? '#52525b' : '#d4d4d8'} !important;
          border-radius: 6px !important;
          color: ${isDark ? '#fafafa' : '#18181b'} !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
          padding: 0 !important;
        }
        .react-flow-controls-custom button:hover {
          background-color: ${isDark ? '#52525b' : '#e4e4e7'} !important;
        }
        .react-flow-controls-custom button svg {
          fill: ${isDark ? '#fafafa' : '#18181b'} !important;
          width: 14px !important;
          height: 14px !important;
        }
        .react-flow-controls-custom button:disabled {
          opacity: 0.4 !important;
          cursor: not-allowed !important;
        }
      `}</style>
    </Box>
  );
}

export default memo(SchemaFlowDiagram);

