import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  IconButton,
  Tooltip,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  InputAdornment,
  Snackbar,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { useSettings } from '../contexts/SettingsContext';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import DataArrayRoundedIcon from '@mui/icons-material/DataArrayRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AddchartIcon from '@mui/icons-material/Addchart';
import ChartVisualization from './ChartVisualization';

function SQLResultsTable({ data, onClose, embedded = false }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [orderBy, setOrderBy] = useState('');
  const [order, setOrder] = useState('asc');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [cellCopied, setCellCopied] = useState(null); // Track which cell was copied
  const [columnWidthOverrides, setColumnWidths] = useState({});
  const [resizing, setResizing] = useState(null);

  const copyTimeoutRef = useRef(null);
  const cellCopyTimeoutRef = useRef(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Get settings from SettingsContext
  const { settings } = useSettings();
  const nullDisplay = settings.nullDisplay ?? 'NULL';

  const { columns = [], result = [], row_count = 0, execution_time, truncated } = data || {};
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (cellCopyTimeoutRef.current) clearTimeout(cellCopyTimeoutRef.current);
    };
  }, []);

  // Derive column widths - override or default 150
  const columnWidths = useMemo(() => {
    const widths = {};
    columns.forEach(col => {
      widths[col] = columnWidthOverrides[col] || 150;
    });
    return widths;
  }, [columns, columnWidthOverrides]);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase();
    return result.filter(row =>
      columns.some(col => {
        const val = row[col];
        if (val === null) return false;
        return String(val).toLowerCase().includes(query);
      })
    );
  }, [result, columns, searchQuery]);

  // Sorting logic
  const sortedData = useMemo(() => {
    if (!orderBy) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];

      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return order === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [filteredData, orderBy, order]);

  const handleSort = useCallback((column) => {
    setOrder(prev => orderBy === column && prev === 'asc' ? 'desc' : 'asc');
    setOrderBy(column);
  }, [orderBy]);

  const handleChangePage = useCallback((event, newPage) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  // Generate CSV content
  const generateCSV = useCallback(() => {
    if (!columns.length || !result.length) return '';

    const header = columns.join(',');
    const rows = result.map((row) =>
      columns.map((col) => {
        const val = row[col];
        if (val === null) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );

    return [header, ...rows].join('\n');
  }, [columns, result]);

  const handleCopyAsCSV = useCallback(() => {
    const csv = generateCSV();
    if (!csv) return;

    navigator.clipboard.writeText(csv);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [generateCSV]);

  const handleDownloadCSV = useCallback(() => {
    const csv = generateCSV();
    if (!csv) return;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generateCSV]);

  // Cell click to copy
  const handleCellClick = useCallback((value, rowIndex, colIndex) => {
    const textValue = value === null ? '' : String(value);
    navigator.clipboard.writeText(textValue);
    setCellCopied(`${rowIndex}-${colIndex}`);
    if (cellCopyTimeoutRef.current) clearTimeout(cellCopyTimeoutRef.current);
    cellCopyTimeoutRef.current = setTimeout(() => setCellCopied(null), 1500);
  }, []);

  // Column resize handlers
  const handleResizeStart = useCallback((e, column) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(column);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[column] || 150;
  }, [columnWidths]);

  const handleResizeMove = useCallback((e) => {
    if (!resizing) return;
    const diff = e.clientX - resizeStartX.current;
    const newWidth = Math.max(80, Math.min(500, resizeStartWidth.current + diff));
    setColumnWidths(prev => ({ ...prev, [resizing]: newWidth }));
  }, [resizing]);

  const handleResizeEnd = useCallback(() => {
    setResizing(null);
  }, []);

  // Add/remove resize event listeners
  useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizing, handleResizeMove, handleResizeEnd]);

  if (!data || !columns.length) {
    return null;
  }

  // Chart view - pass viewMode controls to ChartVisualization for consistent layout
  if (!embedded && viewMode === 'chart') {
    return (
      <ChartVisualization
        data={data}
        onClose={onClose}
        viewMode={viewMode}
        onViewModeChange={(v) => v && setViewMode(v)}
      />
    );
  }

  const paginatedData = sortedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
      {/* Header - Monochrome */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          px: 2,
          py: embedded ? 1 : 1.5,
          borderBottom: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.08),
          backgroundColor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.02),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Chart View Button - only when not embedded */}
          {!embedded && (
            <Tooltip title="Chart View">
              <IconButton
                size="small"
                onClick={() => setViewMode('chart')}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06) },
                }}
              >
                <AddchartIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
          <Chip
            size="small"
            label={`${searchQuery ? filteredData.length : row_count} rows`}
            sx={{
              height: 24,
              backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
              color: 'text.primary',
              border: '1px solid',
              borderColor: isDark ? alpha('#fff', 0.12) : alpha('#000', 0.1),
            }}
          />
          {execution_time && (
            <Chip
              size="small"
              icon={<TimerOutlinedIcon sx={{ fontSize: 12 }} />}
              label={`${execution_time.toFixed(2)}s`}
              sx={{
                height: 24,
                backgroundColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.04),
                '& .MuiChip-icon': { ml: 0.5, color: 'text.secondary' },
              }}
            />
          )}
          {truncated && (
            <Chip
              size="small"
              label="Truncated"
              sx={{
                height: 24,
                backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                color: 'text.secondary',
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* Search */}
          <TextField
            size="small"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              width: 160,
              '& .MuiOutlinedInput-root': {
                height: 32,
                backgroundColor: isDark ? alpha('#fff', 0.03) : alpha('#000', 0.02),
                '& fieldset': { borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1) },
              },
            }}
          />


          <Tooltip title={copied ? 'Copied!' : 'Copy as CSV'}>
            <IconButton
              size="small"
              onClick={handleCopyAsCSV}
              sx={{
                color: copied ? 'text.primary' : 'text.secondary',
                '&:hover': { backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06) },
              }}
            >
              {copied ? (
                <CheckRoundedIcon sx={{ fontSize: 18 }} />
              ) : (
                <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Download CSV">
            <IconButton
              size="small"
              onClick={handleDownloadCSV}
              sx={{
                color: 'text.secondary',
                '&:hover': { backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06) },
              }}
            >
              <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {onClose && !embedded && (
            <Tooltip title="Close">
              <IconButton
                size="small"
                onClick={onClose}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06) },
                }}
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Table with resizable columns */}
      <TableContainer
        sx={{
          flex: 1,
          minHeight: 250, // Prevent shrinking
          cursor: resizing ? 'col-resize' : 'default',
          overflow: 'auto',
        }}
      >
        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              {columns.map((column, idx) => (
                <TableCell
                  key={column}
                  sx={{
                    width: columnWidths[column] || 150,
                    minWidth: 80,
                    maxWidth: 500,
                    backgroundColor: isDark
                      ? alpha(theme.palette.background.paper, 0.95)
                      : theme.palette.background.paper,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                    borderBottom: '2px solid',
                    borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1),
                    position: 'relative',
                    userSelect: 'none',
                    ...(idx === 0 && { pl: 2 }),
                  }}
                >
                  <TableSortLabel
                    active={orderBy === column}
                    direction={orderBy === column ? order : 'asc'}
                    onClick={() => handleSort(column)}
                    sx={{
                      '&.Mui-active': { color: 'text.primary' },
                      '& .MuiTableSortLabel-icon': { fontSize: 16 },
                    }}
                  >
                    {column}
                  </TableSortLabel>
                  {/* Resize handle */}
                  <Box
                    onMouseDown={(e) => handleResizeStart(e, column)}
                    sx={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 6,
                      cursor: 'col-resize',
                      '&:hover': {
                        backgroundColor: isDark ? alpha('#fff', 0.2) : alpha('#000', 0.2),
                      },
                      ...(resizing === column && {
                        backgroundColor: 'primary.main',
                      }),
                    }}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                sx={{
                  '&:nth-of-type(even)': {
                    backgroundColor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.02),
                  },
                  '&:hover': {
                    backgroundColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.04),
                  },
                  transition: 'background-color 0.15s ease',
                }}
              >
                {columns.map((column, colIndex) => {
                  const cellKey = `${rowIndex}-${colIndex}`;
                  const isCopied = cellCopied === cellKey;

                  return (
                    <TableCell
                      key={column}
                      onClick={() => handleCellClick(row[column], rowIndex, colIndex)}
                      sx={{
                        width: columnWidths[column] || 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        py: 1,
                        borderColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.05),
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                        ...(isCopied && {
                          backgroundColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
                        }),
                        '&:hover': {
                          backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                        },
                        ...(colIndex === 0 && { pl: 2 }),
                      }}
                    >
                      {row[column] === null ? (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{
                            color: 'text.disabled',
                            fontStyle: 'italic',
                            backgroundColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.05),
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.5,
                          }}
                        >
                          {nullDisplay || 'NULL'}
                        </Typography>
                      ) : typeof row[column] === 'number' ? (
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: '"JetBrains Mono", monospace',
                            color: 'text.primary',
                          }}
                        >
                          {row[column].toLocaleString()}
                        </Typography>
                      ) : (
                        String(row[column])
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={searchQuery ? filteredData.length : row_count}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[10, 25, 50, 100]}
        sx={{
          position: 'relative',
          zIndex: 1,
          flexShrink: 0,
          borderTop: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.08),
          backgroundColor: theme.palette.background.paper,
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
          },
          '& .MuiTablePagination-select': {
          },
        }}
      />

      {/* Cell copied feedback */}
      <Snackbar
        open={!!cellCopied}
        message="Cell copied!"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            minWidth: 'auto',
            width: 'fit-content',
            py: 0.5,
            px: 2,
            backgroundColor: isDark ? alpha('#fff', 0.12) : alpha('#000', 0.8),
            color: isDark ? 'text.primary' : '#fff',
          },
          '& .MuiSnackbarContent-message': {
            flexGrow: 0,
          }
        }}
      />
    </Box>
  );
}

export default memo(SQLResultsTable);
