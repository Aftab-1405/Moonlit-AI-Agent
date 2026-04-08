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
  TextField,
  InputAdornment,
  Snackbar,
  useMediaQuery,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { useSettings } from '../contexts/SettingsContext';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import ChartVisualization from './ChartVisualization';
import { getCompactActionSx, getToolbarChipSx, getScrollbarStyles, UI_LAYOUT } from '../styles/shared';

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
  const { settings } = useSettings();
  const nullDisplay = settings.nullDisplay ?? 'NULL';

  const { columns = [], result = [], row_count = 0, execution_time, truncated } = data || {};
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (cellCopyTimeoutRef.current) clearTimeout(cellCopyTimeoutRef.current);
    };
  }, []);
  const columnWidths = useMemo(() => {
    const widths = {};
    columns.forEach(col => {
      widths[col] = columnWidthOverrides[col] || (isCompactMobile ? 120 : 150);
    });
    return widths;
  }, [columns, columnWidthOverrides, isCompactMobile]);
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
  const handleCellClick = useCallback((value, rowIndex, colIndex) => {
    const textValue = value === null ? '' : String(value);
    navigator.clipboard.writeText(textValue);
    setCellCopied(`${rowIndex}-${colIndex}`);
    if (cellCopyTimeoutRef.current) clearTimeout(cellCopyTimeoutRef.current);
    cellCopyTimeoutRef.current = setTimeout(() => setCellCopied(null), 1500);
  }, []);
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
  const paginatedData = sortedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );
  const headerCellBaseSx = useMemo(() => ({
    minWidth: isCompactMobile ? 68 : 80,
    maxWidth: 500,
    backgroundColor: theme.palette.background.default,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: isCompactMobile
      ? theme.typography.uiCaptionXs.fontSize.xs
      : theme.typography.caption.fontSize,
    color: 'text.secondary',
    whiteSpace: 'nowrap',
    borderBottom: '2px solid',
    borderColor: theme.palette.border.subtle,
    position: 'relative',
    userSelect: 'none',
  }), [isCompactMobile, theme]);
  const sortLabelSx = useMemo(() => ({
    '&.Mui-active': { color: 'text.primary' },
    '& .MuiTableSortLabel-icon': { fontSize: 16 },
  }), []);
  const resizeHandleBaseSx = useMemo(() => ({
    display: isCompactMobile ? 'none' : 'block',
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 6,
    cursor: 'col-resize',
    '&:hover': {
      backgroundColor: theme.palette.action.selected,
    },
  }), [isCompactMobile, theme.palette.action.selected]);
  const rowSx = useMemo(() => ({
    '&:nth-of-type(even)': {
      backgroundColor: theme.palette.action.disabledBackground,
    },
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    transition: 'background-color 0.15s ease',
  }), [theme.palette.action.disabledBackground, theme.palette.action.hover]);
  const bodyCellBaseSx = useMemo(() => ({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    py: isCompactMobile ? 0.75 : 1,
    px: isCompactMobile ? 1 : 1.5,
    fontSize: isCompactMobile
      ? theme.typography.uiBodyTable.fontSize.xs
      : theme.typography.body2.fontSize,
    borderColor: theme.palette.border.subtle,
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  }), [
    isCompactMobile,
    theme.palette.action.hover,
    theme.palette.border.subtle,
    theme.typography.body2.fontSize,
    theme.typography.uiBodyTable.fontSize.xs,
  ]);
  const nullValueSx = useMemo(() => ({
    color: 'text.disabled',
    fontStyle: 'italic',
    backgroundColor: theme.palette.action.disabledBackground,
    px: 0.75,
    py: 0.25,
    borderRadius: 0.5,
  }), [theme.palette.action.disabledBackground]);

  const embeddedToolbarSx = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: { xs: 0.5, sm: 0.75 },
    px: 2,
    py: 0.75,
    flexShrink: 0,
    minHeight: 44,
    borderBottom: '1px solid',
    borderColor: theme.palette.border.subtle,
    backgroundColor: theme.palette.background.paper,
  }), [theme.palette.background.paper, theme.palette.border.subtle]);

  if (!data || !columns.length) {
    return null;
  }
  if (!embedded && viewMode === 'chart') {
    return (
      <Box
        key="chart"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 400,
          animation: 'moonlitFadeIn 0.2s ease',
          '@keyframes moonlitFadeIn': {
            from: { opacity: 0, transform: 'translateY(5px)' },
            to:   { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        <ChartVisualization
          data={data}
          onClose={onClose}
          viewMode={viewMode}
          onViewModeChange={(v) => v && setViewMode(v)}
        />
      </Box>
    );
  }

  return (
    <Box
      key="table"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        ...(embedded
          ? {
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            alignSelf: 'stretch',
            height: 'auto',
          }
          : {
            height: '100%',
            minHeight: 400,
            animation: 'moonlitFadeIn 0.2s ease',
            '@keyframes moonlitFadeIn': {
              from: { opacity: 0, transform: 'translateY(5px)' },
              to:   { opacity: 1, transform: 'translateY(0)' },
            },
          }),
      }}
    >
      {embedded && (
        <Box sx={embeddedToolbarSx}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 0.35, sm: 0.5 },
              minWidth: 0,
              flexWrap: 'wrap',
            }}
          >
            <Chip
              size="small"
              label={`${searchQuery ? filteredData.length : row_count} rows`}
              sx={getToolbarChipSx(theme, { interactive: false })}
            />
            {execution_time != null && (
              <Chip
                size="small"
                icon={<TimerOutlinedIcon />}
                label={`${execution_time.toFixed(2)}s`}
                sx={getToolbarChipSx(theme, { interactive: false })}
              />
            )}
            {truncated && (
              <Chip
                size="small"
                label="Truncated"
                sx={getToolbarChipSx(theme, { interactive: false })}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              size="small"
              placeholder="Search…"
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
                width: { xs: 100, sm: 140 },
                '& .MuiOutlinedInput-root': {
                  height: 30,
                  ...theme.typography.uiCaptionMd,
                  bgcolor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
                  '& fieldset': { borderColor: theme.palette.border.subtle },
                },
              }}
            />
            <Tooltip title={copied ? 'Copied!' : 'Copy as CSV'}>
              <IconButton
                size="small"
                onClick={handleCopyAsCSV}
                aria-label="Copy as CSV"
                sx={{
                  width: 32,
                  height: 32,
                  color: copied ? 'text.primary' : 'text.secondary',
                  borderRadius: 1.5,
                  opacity: 0.65,
                  transition: 'opacity 0.15s ease',
                  '&:hover': { opacity: 1, backgroundColor: 'transparent' },
                }}
              >
                {copied ? <CheckRoundedIcon sx={{ fontSize: 18 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Download CSV">
              <IconButton
                size="small"
                onClick={handleDownloadCSV}
                aria-label="Download CSV"
                sx={{
                  width: 32,
                  height: 32,
                  color: 'text.secondary',
                  borderRadius: 1.5,
                  opacity: 0.65,
                  transition: 'opacity 0.15s ease',
                  '&:hover': { opacity: 1, backgroundColor: 'transparent' },
                }}
              >
                <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}
      {!embedded && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: { xs: 0.75, sm: 1 },
            px: 2,
            py: 1,
            flexShrink: 0,
            minHeight: 52,
            borderBottom: '1px solid',
            borderColor: theme.palette.border.subtle,
            backgroundColor: theme.palette.background.paper,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 0.5, sm: 1 },
              minWidth: 0,
              flexWrap: { xs: 'nowrap', sm: 'wrap' },
              overflowX: { xs: 'auto', sm: 'visible' },
              WebkitOverflowScrolling: 'touch',
              '&::-webkit-scrollbar': {
                display: 'none',
              },
            }}
          >
            <Tooltip title="Chart View">
              <IconButton
                size="small"
                onClick={() => setViewMode('chart')}
                sx={{
                  ...getCompactActionSx(theme, { size: 36 }),
                  borderRadius: 1.5,
                  color: 'text.secondary',
                }}
              >
                <BarChartOutlinedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <Chip
              size="small"
              label={`${searchQuery ? filteredData.length : row_count} rows`}
              sx={getToolbarChipSx(theme, { interactive: false })}
            />
            {execution_time && (
              <Chip
                size="small"
                icon={<TimerOutlinedIcon />}
                label={`${execution_time.toFixed(2)}s`}
                sx={getToolbarChipSx(theme, { interactive: false })}
              />
            )}
            {truncated && (
              <Chip
                size="small"
                label="Truncated"
                sx={getToolbarChipSx(theme, { interactive: false })}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
                width: { xs: 120, sm: 160 },
                '& .MuiOutlinedInput-root': {
                  height: 32,
                  bgcolor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
                  '& fieldset': { borderColor: theme.palette.border.subtle },
                },
              }}
            />

            <Tooltip title={copied ? 'Copied!' : 'Copy as CSV'}>
              <IconButton
                size="small"
                onClick={handleCopyAsCSV}
                sx={{
                  ...getCompactActionSx(theme, { size: 36 }),
                  borderRadius: 1.5,
                  color: copied ? 'text.primary' : 'text.secondary',
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
                  ...getCompactActionSx(theme, { size: 36 }),
                  borderRadius: 1.5,
                  color: 'text.secondary',
                }}
              >
                <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            {onClose && (
              <Tooltip title="Close">
                <IconButton
                  size="small"
                  onClick={onClose}
                  sx={{
                    ...getCompactActionSx(theme, { size: 36 }),
                    borderRadius: 1.5,
                    color: 'text.secondary',
                    '&:hover': { backgroundColor: theme.palette.action.hover },
                  }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      )}
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: embedded ? 0 : 250,
          overflow: 'hidden',
          px: embedded ? 0 : { xs: 1, sm: 1.5 },
          pt: embedded ? 0 : { xs: 1, sm: 1.5 },
          pb: embedded ? 0 : { xs: 0.5, sm: 1 },
          '&::before, &::after': isCompactMobile ? {
            content: '""',
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 10,
            zIndex: 2,
            pointerEvents: 'none',
          } : {},
          '&::before': isCompactMobile ? {
            left: 0,
            background: `linear-gradient(to right, ${alpha(theme.palette.background.paper, 0.95)}, transparent)`,
          } : {},
          '&::after': isCompactMobile ? {
            right: 0,
            background: `linear-gradient(to left, ${alpha(theme.palette.background.paper, 0.95)}, transparent)`,
          } : {},
        }}
      >
      <TableContainer
        sx={{
          height: '100%',
          cursor: resizing ? 'col-resize' : 'default',
          overflowX: 'auto',
          overflowY: 'auto',
          ...getScrollbarStyles(theme),
        }}
      >
        <Table
          stickyHeader
          size="small"
          sx={{
            tableLayout: isCompactMobile ? 'auto' : 'fixed',
            minWidth: isCompactMobile ? 'max-content' : '100%',
          }}
        >
          <TableHead>
            <TableRow>
              {columns.map((column, idx) => (
                <TableCell
                  key={column}
                  sx={[
                    headerCellBaseSx,
                    { width: columnWidths[column] || 150 },
                    idx === 0 ? { pl: isCompactMobile ? 1.2 : 2 } : null,
                  ]}
                >
                  <TableSortLabel
                    active={orderBy === column}
                    direction={orderBy === column ? order : 'asc'}
                    onClick={() => handleSort(column)}
                    sx={sortLabelSx}
                  >
                    {column}
                  </TableSortLabel>
                  <Box
                    onMouseDown={(e) => handleResizeStart(e, column)}
                    sx={[
                      resizeHandleBaseSx,
                      resizing === column ? { backgroundColor: 'primary.main' } : null,
                    ]}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                sx={rowSx}
              >
                {columns.map((column, colIndex) => {
                  const cellKey = `${rowIndex}-${colIndex}`;
                  const isCopied = cellCopied === cellKey;

                  return (
                    <TableCell
                      key={column}
                      onClick={() => handleCellClick(row[column], rowIndex, colIndex)}
                      sx={[
                        bodyCellBaseSx,
                        { width: columnWidths[column] || 150 },
                        isCopied ? { backgroundColor: theme.palette.action.selected } : null,
                        colIndex === 0 ? { pl: isCompactMobile ? 1.2 : 2 } : null,
                      ]}
                    >
                      {row[column] === null ? (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={nullValueSx}
                        >
                          {nullDisplay || 'NULL'}
                        </Typography>
                      ) : typeof row[column] === 'number' ? (
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: theme.typography.fontFamilyMono,
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
      </Box>
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
          borderColor: theme.palette.border.subtle,
          '& .MuiTablePagination-toolbar': {
            px: { xs: 1, sm: 2 },
            minHeight: { xs: UI_LAYOUT.touchTarget + 8, sm: 56 },
          },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
            ...theme.typography.uiCaptionMd,
            m: 0,
          },
          '& .MuiTablePagination-actions': {
            marginLeft: { xs: 0.25, sm: 1 },
          },
        }}
      />
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
            backgroundColor: isDark ? theme.palette.background.elevated : theme.palette.text.primary,
            color: isDark ? 'text.primary' : theme.palette.background.paper,
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