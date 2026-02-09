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
import { Box, Typography, useTheme, useMediaQuery, Chip, GlobalStyles } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
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
const DatabaseNode = memo(({ data }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 1.75 },
        py: { xs: 1.25, sm: 1 },
        borderRadius: 2,
        backgroundColor: isDark 
          ? alpha(theme.palette.text.primary, 0.08)
          : alpha(theme.palette.text.primary, 0.05),
        border: '1.5px solid',
        borderColor: alpha(theme.palette.text.primary, isDark ? 0.2 : 0.15),
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: isMobile ? 130 : 110,
        transition: 'all 0.2s ease',
        boxShadow: `0 2px 8px ${alpha(theme.palette.text.primary, 0.1)}`,
        '&:hover': {
          borderColor: alpha(theme.palette.text.primary, 0.35),
          boxShadow: `0 4px 12px ${alpha(theme.palette.text.primary, 0.15)}`,
        },
      }}
    >
      <StorageRoundedIcon
        sx={{
          fontSize: { xs: 18, sm: 16 },
          color: theme.palette.text.primary,
        }}
      />
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          color: theme.palette.text.primary,
          fontSize: { xs: '0.9rem', sm: '0.8rem' },
        }}
      >
        {data.label}
      </Typography>
      <ChevronRightRoundedIcon
        sx={{
          fontSize: { xs: 18, sm: 14 },
          color: alpha(theme.palette.text.primary, 0.5),
          ml: 'auto',
        }}
      />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </Box>
  );
});
DatabaseNode.displayName = 'DatabaseNode';
const TableNode = memo(({ data }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const hasColumns = data.columnCount > 0;

  return (
    <Box
      sx={{
        px: { xs: 1.75, sm: 1.5 },
        py: { xs: 1, sm: 0.75 },
        borderRadius: 2,
        backgroundColor: isDark 
          ? alpha(theme.palette.background.paper, 0.8)
          : theme.palette.background.paper,
        border: '1px solid',
        borderColor: data.expanded 
          ? theme.palette.text.primary 
          : 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 0.75 },
        minWidth: isMobile ? 120 : 100,
        minHeight: isMobile ? 40 : 32,
        cursor: hasColumns ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        boxShadow: data.expanded 
          ? `0 0 0 2px ${alpha(theme.palette.text.primary, 0.1)}`
          : 'none',
        '&:hover': hasColumns ? {
          borderColor: alpha(theme.palette.text.primary, 0.35),
          backgroundColor: isDark 
            ? alpha(theme.palette.text.primary, 0.05)
            : alpha(theme.palette.text.primary, 0.03),
        } : {},
        '&:active': hasColumns ? {
          transform: 'scale(0.98)',
        } : {},
      }}
      onClick={() => hasColumns && data.onToggle && data.onToggle(data.id)}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      
      <TableChartRoundedIcon
        sx={{
          fontSize: { xs: 16, sm: 14 },
          color: data.expanded ? theme.palette.text.primary : 'text.secondary',
        }}
      />
      
      <Typography
        variant="caption"
        sx={{
          fontWeight: 500,
          color: data.expanded ? theme.palette.text.primary : 'text.primary',
          fontSize: { xs: '0.85rem', sm: '0.75rem' },
        }}
      >
        {data.label}
      </Typography>
      
      {hasColumns && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
          <Chip
            label={data.columnCount}
            size="small"
            sx={{
              height: 18,
              minWidth: 24,
              fontSize: '0.65rem',
              fontWeight: 600,
              backgroundColor: alpha(theme.palette.text.primary, 0.08),
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
          <ChevronRightRoundedIcon
            sx={{
              fontSize: { xs: 16, sm: 14 },
              color: 'text.secondary',
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
const ColumnNode = memo(({ data }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isPK = data.isPrimaryKey;

  return (
    <Box
      sx={{
        px: { xs: 1.5, sm: 1.25 },
        py: { xs: 0.625, sm: 0.5 },
        borderRadius: 1.5,
        backgroundColor: isPK 
          ? alpha(theme.palette.warning.main, isDark ? 0.12 : 0.08)
          : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
        border: '1px solid',
        borderColor: isPK 
          ? alpha(theme.palette.warning.main, 0.25) 
          : 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 0.5 },
        minWidth: isMobile ? 90 : 70,
        minHeight: isMobile ? 32 : 24,
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: isPK 
            ? alpha(theme.palette.warning.main, 0.4)
            : alpha(theme.palette.text.primary, 0.2),
        },
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      
      {isPK && (
        <KeyRoundedIcon
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
          fontWeight: isPK ? 600 : 500,
          fontSize: { xs: '0.75rem', sm: '0.7rem' },
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {data.label}
      </Typography>
      
      {data.type && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            fontSize: { xs: '0.65rem', sm: '0.6rem' },
            ml: 'auto',
            fontFamily: '"JetBrains Mono", monospace',
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
  const edgeStyle = useMemo(() => ({
    stroke: alpha(theme.palette.text.secondary, isDark ? 0.3 : 0.4),
    strokeWidth: isMobile ? 1.5 : 1,
  }), [isDark, isMobile, theme.palette.text.secondary]);
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes = [];
    const edges = [];
    const dbNodeWidth = isMobile ? 150 : 130;
    const dbNodeHeight = isMobile ? 44 : 36;
    const tableNodeWidth = isMobile ? 140 : 120;
    const tableNodeHeight = isMobile ? 40 : 32;
    const colNodeWidth = isMobile ? 120 : 100;
    const colNodeHeight = isMobile ? 32 : 24;
    nodes.push({
      id: 'db',
      type: 'database',
      data: { label: database },
      position: { x: 0, y: 0 },
      width: dbNodeWidth,
      height: dbNodeHeight,
    });
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
            style: { ...edgeStyle, strokeWidth: 1 },
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
        height: '100%',
        minHeight: 300,
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: isDark 
          ? alpha(theme.palette.background.default, 0.5)
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
        fitViewOptions={{ padding: isMobile ? 0.15 : 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
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
            backgroundColor: theme.palette.background.paper,
            borderRadius: '10px',
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, isDark ? 0.45 : 0.12)}`,
            ...(isMobile 
              ? { bottom: '12px', right: '12px' }
              : { top: '12px', right: '12px' }
            ),
          }}
          className="react-flow-controls-custom"
        />
      </ReactFlow>
      <GlobalStyles
        styles={{
          '.react-flow-controls-custom button': {
            width: '28px !important',
            height: '28px !important',
            backgroundColor: `${theme.palette.action.hover} !important`,
            border: `1px solid ${theme.palette.divider} !important`,
            borderRadius: '8px !important',
            color: `${theme.palette.text.primary} !important`,
            display: 'flex !important',
            alignItems: 'center !important',
            justifyContent: 'center !important',
            cursor: 'pointer !important',
            transition: 'all 0.15s ease !important',
            padding: '0 !important',
          },
          '.react-flow-controls-custom button:hover': {
            backgroundColor: `${theme.palette.action.selected} !important`,
          },
          '.react-flow-controls-custom button svg': {
            fill: `${theme.palette.text.primary} !important`,
            width: '14px !important',
            height: '14px !important',
          },
          '.react-flow-controls-custom button:disabled': {
            opacity: '0.4 !important',
            cursor: 'not-allowed !important',
          },
        }}
      />
    </Box>
  );
}

export default memo(SchemaFlowDiagram);
