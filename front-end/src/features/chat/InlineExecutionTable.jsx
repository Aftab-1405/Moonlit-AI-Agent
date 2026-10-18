import { Box, Button, Skeleton, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion, useReducedMotion } from 'framer-motion';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';
import { useEffect, useMemo, useState } from 'react';
import { getExecutionResult } from '@/api/conversations';
import { ErrorIcon, TableIcon } from '@/components/icons';
import { getChatMotionVariants } from '@/features/chat/chatMotion';
import { getResponsivePillControlSx } from '@/features/styles/interfaceChrome';

const MIN_COLUMN_SIZE = 112;
const MAX_COLUMN_SIZE = 360;
const MotionBox = motion.create(Box);
// Serial-number (row-numbers) column has been removed entirely — the
// MarkdownRenderer tables don't have one, so keeping it here would break
// visual parity. Data rows still render in source order, which is sufficient
// for query results.

function formatCellValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function estimateColumnSize(columnName, columnIndex, rows) {
  const sampledRows = rows.slice(0, 25);
  const longestValue = sampledRows.reduce((longest, row) => {
    const value = Array.isArray(row) ? row[columnIndex] : row?.[columnName];
    return Math.max(longest, formatCellValue(value).length);
  }, String(columnName).length);

  return Math.min(MAX_COLUMN_SIZE, Math.max(MIN_COLUMN_SIZE, longestValue * 7.5 + 34));
}

function ResultCell({ cell }) {
  const value = cell.getValue();
  const displayValue = formatCellValue(value);
  const isNull = value === null || value === undefined;
  const isBoolean = typeof value === 'boolean';

  return (
    <Box
      component="span"
      title={displayValue}
      sx={{
        display: 'block',
        width: '100%',
        overflow: 'hidden',
        color: isNull
          ? 'text.disabled'
          : isBoolean
            ? value
              ? 'text.primary'
              : 'text.secondary'
            : 'text.primary',
        fontStyle: isNull ? 'italic' : 'normal',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {displayValue}
    </Box>
  );
}

function createColumnDefinitions(columnNames, rows) {
  return columnNames.map((columnName, columnIndex) => ({
    id: `${String(columnName)}-${columnIndex}`,
    accessorFn: (row) => (Array.isArray(row) ? row[columnIndex] : row?.[columnName]),
    header: String(columnName),
    minSize: MIN_COLUMN_SIZE,
    maxSize: MAX_COLUMN_SIZE,
    size: estimateColumnSize(columnName, columnIndex, rows),
    grow: true,
    Cell: ResultCell,
  }));
}

function getSurfaceSx(theme) {
  // ── Visual parity with MarkdownRenderer tables ──────────────────────────
  // The inline execution table and the markdown table must look identical
  // (same border, radius, surface treatment). This ensures query results
  // rendered as inline tables feel like the same surface as tables in AI
  // markdown responses.
  return {
    width: '100%',
    maxWidth: '100%',
    mt: 2,
    mb: 2,
    overflow: 'hidden',
    borderRadius: '8px',
    border: `1px solid ${theme.palette.border.subtle}`,
    backgroundColor: theme.palette.background.paper,
    boxShadow: 'none',
  };
}

function LoadingTable() {
  const theme = useTheme();
  const skeletonRows = Array.from({ length: 4 });
  const skeletonColumns = Array.from({ length: 3 });
  const headerBg = theme.palette.layer.faint;

  return (
    <Box role="status" aria-label="Loading query results" sx={getSurfaceSx(theme)}>
      <Box
        sx={{
          display: 'grid',
          // No row-number column — parity with MarkdownRenderer tables.
          gridTemplateColumns: 'repeat(3, minmax(112px, 1fr))',
          px: { xs: 1, md: 2 },
          py: 1,
          bgcolor: headerBg,
          borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.075)}`,
        }}
      >
        {skeletonColumns.map((_, index) => (
          <Skeleton
            key={`header-${index}`}
            variant="text"
            width={`${64 - index * 9}%`}
            height={16}
            sx={{ mx: 1 }}
          />
        ))}
      </Box>
      {skeletonRows.map((_, rowIndex) => (
        <Box
          key={`row-${rowIndex}`}
          sx={{
            minHeight: 38,
            display: 'grid',
            // No row-number column — parity with MarkdownRenderer tables.
            gridTemplateColumns: 'repeat(3, minmax(112px, 1fr))',
            alignItems: 'center',
            px: { xs: 1, md: 2 },
            py: 1,
            borderTop: `1px solid ${theme.palette.border.subtle}`,
          }}
        >
          {skeletonColumns.map((_, columnIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${columnIndex}`}
              variant="text"
              width={`${72 - ((rowIndex + columnIndex) % 3) * 12}%`}
              height={16}
              sx={{ mx: 1 }}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}

function ResultState({ error }) {
  const theme = useTheme();
  const isError = Boolean(error);

  return (
    <Box
      role={isError ? 'alert' : 'status'}
      sx={{
        ...getSurfaceSx(theme),
        minHeight: 116,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 2,
        boxShadow: 'none',
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          borderRadius: '8px',
          color: isError ? 'error.main' : 'text.disabled',
          bgcolor: alpha(
            isError ? theme.palette.error.main : theme.palette.text.primary,
            theme.palette.opacity.soft,
          ),
        }}
      >
        {isError ? <ErrorIcon sx={{ fontSize: 20 }} /> : <TableIcon sx={{ fontSize: 19 }} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ ...theme.typography.uiBodySm, fontWeight: 400, color: 'text.primary' }}>
          {isError ? 'Results unavailable' : 'No rows returned'}
        </Typography>
        <Typography
          sx={{
            ...theme.typography.uiCaptionSm,
            mt: 0.5,
            color: isError ? 'error.main' : 'text.secondary',
            overflowWrap: 'anywhere',
          }}
        >
          {isError ? error : 'The query completed successfully but returned no data.'}
        </Typography>
      </Box>
    </Box>
  );
}

function ResultReveal({ animateEntry, children }) {
  const prefersReducedMotion = useReducedMotion();
  const structuredMotion = useMemo(
    () => getChatMotionVariants(prefersReducedMotion).structured,
    [prefersReducedMotion],
  );

  return (
    <MotionBox
      data-result-motion={animateEntry ? 'live' : 'static'}
      initial={animateEntry ? structuredMotion.initial : false}
      animate={structuredMotion.animate}
      sx={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
    >
      {children}
    </MotionBox>
  );
}

export default function InlineExecutionTable({
  conversationId,
  executionId,
  sourceQuery = '',
  onOpenArtifact,
  animateEntry = false,
}) {
  const theme = useTheme();
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchResult() {
      if (!conversationId || !executionId) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await getExecutionResult(conversationId, executionId);

        if (mounted && response.status === 'success' && response.data) {
          const rawData = Array.isArray(response.data.data)
            ? response.data.data
            : Array.isArray(response.data.result)
              ? response.data.result
              : [];
          const providedColumns = Array.isArray(response.data.columns) ? response.data.columns : [];
          const columnNames =
            providedColumns.length > 0
              ? providedColumns
              : rawData.length > 0 && !Array.isArray(rawData[0])
                ? Object.keys(rawData[0])
                : [];

          setData(rawData);
          setColumns(createColumnDefinitions(columnNames, rawData));
        } else if (mounted) {
          setError(response.message || 'Could not load this query result.');
        }
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Could not load this query result.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchResult();

    return () => {
      mounted = false;
    };
  }, [conversationId, executionId]);

  const shouldVirtualizeRows = data.length > 50;
  const shouldVirtualizeColumns = columns.length > 12;
  // Same divider color as MarkdownRenderer tables for visual parity.
  const rowDivider = theme.palette.border.subtle;
  // Same header background as MarkdownRenderer tables.
  const headerBg = theme.palette.layer.faint;
  // Same row-hover background as MarkdownRenderer tables.
  const rowHoverBg = theme.palette.action.hover;

  const table = useMaterialReactTable({
    columns,
    data,
    layoutMode: 'grid',
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: MIN_COLUMN_SIZE,
      maxSize: MAX_COLUMN_SIZE,
      size: 160,
      grow: true,
    },
    enableBottomToolbar: false,
    enableColumnActions: false,
    enableColumnDragging: false,
    enableColumnResizing: true,
    enableColumnVirtualization: shouldVirtualizeColumns,
    enableDensityToggle: false,
    enableFilters: false,
    enableFullScreenToggle: false,
    enableGlobalFilter: false,
    enableHiding: false,
    enablePagination: false,
    enablePinning: false,
    // Row numbers (serial-number column) are disabled — the MarkdownRenderer
    // tables don't have one, so keeping it here would break visual parity.
    enableRowNumbers: false,
    enableRowVirtualization: shouldVirtualizeRows,
    enableSorting: false,
    enableStickyHeader: true,
    enableTopToolbar: false,
    initialState: { density: 'compact' },
    mrtTheme: {
      baseBackgroundColor: theme.palette.transparent,
      cellNavigationOutlineColor: theme.palette.primary.main,
      draggingBorderColor: theme.palette.primary.main,
      matchHighlightColor: alpha(
        theme.palette.primary.main,
        theme.palette.opacity.statusBackground,
      ),
      menuBackgroundColor: theme.palette.background.paper,
      pinnedRowBackgroundColor: theme.palette.transparent,
      selectedRowBackgroundColor: alpha(theme.palette.primary.main, theme.palette.opacity.soft),
    },
    muiTableContainerProps: {
      sx: {
        maxHeight: 420,
        overflow: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: `${alpha(theme.palette.text.primary, 0.2)} transparent`,
        '&::-webkit-scrollbar': { width: 6, height: 6 },
        '&::-webkit-scrollbar-thumb': {
          borderRadius: 999,
          bgcolor: alpha(theme.palette.text.primary, 0.18),
        },
      },
    },
    muiTablePaperProps: {
      elevation: 0,
      sx: getSurfaceSx(theme),
    },
    muiTableProps: {
      sx: {
        width: '100%',
        minWidth: '100%',
      },
    },
    muiTableHeadProps: {
      sx: { bgcolor: 'transparent' },
    },
    muiTableHeadRowProps: {
      sx: { boxShadow: 'none' },
    },
    muiTableHeadCellProps: () => ({
      align: 'left',
      sx: {
        // ── Header style matches MarkdownRenderer `th` ──
        // Same bgcolor, fontWeight, typography, padding, border.
        minHeight: 39,
        px: { xs: 1, md: 2 },
        py: 1,
        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.075)}`,
        color: 'text.secondary',
        bgcolor: headerBg,
        // Use the same typography as markdown table headers.
        ...theme.typography.uiCaptionMd,
        fontWeight: 400,
        '& .Mui-TableHeadCell-Content-Actions': { display: 'none' },
        '& .Mui-TableHeadCell-ResizeHandle-Divider': {
          height: 20,
          borderColor: theme.palette.border.default,
          borderWidth: '1px',
          opacity: 0,
        },
        '&:hover .Mui-TableHeadCell-ResizeHandle-Divider': {
          borderColor: theme.palette.primary.main,
          opacity: 1,
        },
      },
    }),
    muiTableBodyRowProps: () => ({
      sx: {
        // No zebra striping — markdown table doesn't have it.
        bgcolor: 'transparent',
        transition: theme.transitions.create('background-color', {
          duration: theme.transitions.duration.shorter,
        }),
        // Same row hover as markdown table.
        '&:hover > td': {
          bgcolor: rowHoverBg,
        },
        '&:last-of-type > td': { borderBottom: 0 },
      },
    }),
    muiTableBodyCellProps: () => ({
      align: 'left',
      sx: {
        // ── Body cell style matches MarkdownRenderer `td` ──
        // Same padding, border, typography. Keeps tabular-nums for data
        // alignment (query results need numeric alignment).
        minHeight: 38,
        px: { xs: 1, md: 2 },
        py: 1,
        overflow: 'hidden',
        borderBottom: `1px solid ${rowDivider}`,
        color: 'text.primary',
        bgcolor: 'inherit',
        // Use the same typography as markdown table body cells.
        ...theme.typography.uiBodyTable,
        // Keep tabular-nums for numeric alignment in query results.
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.55,
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    }),
    rowVirtualizerOptions: shouldVirtualizeRows ? { overscan: 6 } : undefined,
    columnVirtualizerOptions: shouldVirtualizeColumns ? { overscan: 2 } : undefined,
  });

  if (!conversationId || !executionId) return null;
  if (loading) return <LoadingTable />;
  if (error) {
    return (
      <ResultReveal animateEntry={animateEntry}>
        <ResultState error={error} />
      </ResultReveal>
    );
  }
  if (data.length === 0) {
    return (
      <ResultReveal animateEntry={animateEntry}>
        <ResultState />
      </ResultReveal>
    );
  }

  return (
    <ResultReveal animateEntry={animateEntry}>
      <MaterialReactTable table={table} />
      {onOpenArtifact && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1, mb: 1 }}>
          <Button
            type="button"
            variant="text"
            sx={{
              ...getResponsivePillControlSx(theme, { desktopHeight: 36 }),
              ...theme.typography.uiBodySm,
            }}
            onClick={() =>
              onOpenArtifact({
                id: `execution:${conversationId}:${executionId}`,
                type: 'query-result',
                title: 'Query results',
                source: null,
                props: { conversationId, executionId, sourceQuery },
              })
            }
          >
            Explore query results
          </Button>
        </Box>
      )}
    </ResultReveal>
  );
}
