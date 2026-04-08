import { useState, useMemo, useRef, memo, useCallback, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  Colors,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import {
  Box,
  Typography,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip as MuiTooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AppPopover from './AppPopover';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import PieChartOutlineRoundedIcon from '@mui/icons-material/PieChartOutlineRounded';
import DonutLargeRoundedIcon from '@mui/icons-material/DonutLargeRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  Colors
);

function ChartVisualization({ data, onClose, embedded = false, viewMode, onViewModeChange }) {
  const [chartType, setChartType] = useState('bar');
  const [labelColumnOverride, setLabelColumn] = useState(null);
  const [valueColumnOverride, setValueColumn] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [labelAnchorEl, setLabelAnchorEl] = useState(null);
  const [valueAnchorEl, setValueAnchorEl] = useState(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const chartRef = useRef(null);
  const containerRef = useRef(null);

  const { columns = [], result = [] } = data || {};
  const { numericColumns, stringColumns } = useMemo(() => {
    if (!result.length || !columns.length) return { numericColumns: [], stringColumns: [] };

    const numeric = [];
    const strings = [];

    columns.forEach(col => {
      const sampleValue = result.find(row => row[col] !== null)?.[col];
      if (typeof sampleValue === 'number') {
        numeric.push(col);
      } else {
        strings.push(col);
      }
    });

    return { numericColumns: numeric, stringColumns: strings };
  }, [columns, result]);
  const labelColumn = labelColumnOverride || stringColumns[0] || columns[0] || '';
  const valueColumn = valueColumnOverride || numericColumns[0] || '';

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const resizeChart = () => {
      chart.resize();
    };

    const rafId = requestAnimationFrame(resizeChart);
    const timeoutId = setTimeout(resizeChart, 120);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [fullscreen, chartType, labelColumn, valueColumn, result.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);
  const chartData = useMemo(() => {
    if (!labelColumn || !valueColumn || !result.length) return null;

    const labels = result.slice(0, 50).map(row => String(row[labelColumn] ?? ''));
    const values = result.slice(0, 50).map(row => Number(row[valueColumn]) || 0);

    const isPieOrDoughnut = chartType === 'pie' || chartType === 'doughnut';

    return {
      labels,
      datasets: [{
        label: valueColumn,
        data: values,
        borderWidth: isPieOrDoughnut ? 2 : 2,
        borderRadius: chartType === 'bar' ? 4 : 0,
        fill: chartType === 'line',
        tension: 0.3,
      }],
    };
  }, [labelColumn, valueColumn, result, chartType]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: embedded
        ? { top: 8, right: 8, bottom: 0, left: 8 }
        : { top: 0, right: 0, bottom: 0, left: 0 },
    },
    plugins: {
      legend: {
        display: chartType === 'pie' || chartType === 'doughnut',
        position: isCompactMobile ? 'bottom' : 'right',
        labels: {
          color: theme.palette.text.secondary,
          font: { size: 11 },
          padding: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: theme.palette.background.elevated,
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.primary,
        padding: 10,
        cornerRadius: 8,
        titleFont: { weight: 600 },
      },
    },
    scales: chartType === 'pie' || chartType === 'doughnut' ? {} : {
      x: {
        grid: { color: theme.palette.divider },
        ticks: { color: theme.palette.text.secondary, font: { size: 11 } },
      },
      y: {
        grid: { color: theme.palette.divider },
        ticks: { color: theme.palette.text.secondary, font: { size: 11 } },
        beginAtZero: true,
      },
    },
  }), [chartType, theme, embedded, isCompactMobile]);

  const handleDownload = useCallback(() => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `chart-${chartType}-${Date.now()}.png`;
      a.click();
    }
  }, [chartType]);

  const ChartComponent = {
    bar: Bar,
    line: Line,
    pie: Pie,
    doughnut: Doughnut,
  }[chartType];

  if (!columns.length || !result.length) return null;

  if (!numericColumns.length) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <InsightsRoundedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography color="text.secondary">
          No numeric columns available for visualization
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box
        ref={containerRef}
        sx={{
        display: 'flex',
        flexDirection: 'column',
        position: fullscreen ? 'fixed' : 'relative',
        inset: fullscreen ? 0 : 'auto',
        zIndex: fullscreen ? 9999 : 'auto',
        backgroundColor: fullscreen ? theme.palette.background.default : 'transparent',
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
          }),
      }}
      >
        {embedded && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: { xs: 0.75, sm: 1 },
              px: 2,
              py: 0.75,
              flexShrink: 0,
              minHeight: 44,
              borderBottom: '1px solid',
              borderColor: theme.palette.border.subtle,
              bgcolor: theme.palette.background.paper,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 0.75 }, flexWrap: 'wrap', minWidth: 0 }}>
              <Box
                component="button"
                onClick={(e) => setLabelAnchorEl(e.currentTarget)}
                aria-haspopup="listbox"
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  height: 30, minWidth: { xs: 80, sm: 96 }, maxWidth: { xs: 120, sm: 140 },
                  px: 1, borderRadius: '8px', border: '1px solid',
                  borderColor: theme.palette.border.subtle,
                  bgcolor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
                  cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 0.12s, background-color 0.12s',
                  '&:hover': { borderColor: theme.palette.border.hover, bgcolor: alpha(theme.palette.text.primary, isDark ? 0.09 : 0.06) },
                  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                }}
              >
                <Typography component="span" sx={{ ...theme.typography.uiCaption2xs, color: 'text.disabled', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>Label</Typography>
                <Typography component="span" noWrap sx={{ ...theme.typography.uiCaptionMd, color: 'text.primary', flex: 1, minWidth: 0, lineHeight: 1, textAlign: 'left' }}>{labelColumn || '—'}</Typography>
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
              </Box>
              <Box
                component="button"
                onClick={(e) => setValueAnchorEl(e.currentTarget)}
                aria-haspopup="listbox"
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  height: 30, minWidth: { xs: 80, sm: 96 }, maxWidth: { xs: 120, sm: 140 },
                  px: 1, borderRadius: '8px', border: '1px solid',
                  borderColor: theme.palette.border.subtle,
                  bgcolor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
                  cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 0.12s, background-color 0.12s',
                  '&:hover': { borderColor: theme.palette.border.hover, bgcolor: alpha(theme.palette.text.primary, isDark ? 0.09 : 0.06) },
                  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                }}
              >
                <Typography component="span" sx={{ ...theme.typography.uiCaption2xs, color: 'text.disabled', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>Value</Typography>
                <Typography component="span" noWrap sx={{ ...theme.typography.uiCaptionMd, color: 'text.primary', flex: 1, minWidth: 0, lineHeight: 1, textAlign: 'left' }}>{valueColumn || '—'}</Typography>
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <MuiTooltip title="Download PNG">
                <IconButton
                  size="small"
                  onClick={handleDownload}
                  aria-label="Download chart as PNG"
                  sx={{
                    width: 32,
                    height: 32,
                    color: 'text.secondary',
                    borderRadius: 1.5,
                    '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.06) },
                  }}
                >
                  <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </MuiTooltip>
              <MuiTooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                <IconButton
                  size="small"
                  onClick={() => setFullscreen(!fullscreen)}
                  aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  sx={{
                    width: 32,
                    height: 32,
                    color: 'text.secondary',
                    borderRadius: 1.5,
                    '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.06) },
                  }}
                >
                  {fullscreen ? (
                    <FullscreenExitRoundedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <FullscreenRoundedIcon sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </MuiTooltip>
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
              gap: 1,
              px: 2,
              py: 1,
              flexShrink: 0,
              minHeight: 52,
              borderBottom: '1px solid',
              borderColor: theme.palette.border.subtle,
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {viewMode && onViewModeChange && (
                <MuiTooltip title="Table View">
                  <IconButton
                    size="small"
                    onClick={() => onViewModeChange('table')}
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1.5,
                      color: 'text.secondary',
                      '&:hover': { backgroundColor: theme.palette.action.hover },
                    }}
                  >
                    <ArrowBackIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </MuiTooltip>
              )}

              <Box
                component="button"
                onClick={(e) => setLabelAnchorEl(e.currentTarget)}
                aria-haspopup="listbox"
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  height: 32, minWidth: 100, maxWidth: 160,
                  px: 1, borderRadius: '8px', border: '1px solid',
                  borderColor: theme.palette.border.subtle,
                  bgcolor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
                  cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 0.12s, background-color 0.12s',
                  '&:hover': { borderColor: theme.palette.border.hover, bgcolor: alpha(theme.palette.text.primary, isDark ? 0.09 : 0.06) },
                  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                }}
              >
                <Typography component="span" sx={{ fontSize: '0.635rem', fontWeight: 600, color: 'text.disabled', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>Label</Typography>
                <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', color: 'text.primary', flex: 1, minWidth: 0, lineHeight: 1, textAlign: 'left' }}>{labelColumn || '—'}</Typography>
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }} />
              </Box>
              <Box
                component="button"
                onClick={(e) => setValueAnchorEl(e.currentTarget)}
                aria-haspopup="listbox"
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  height: 32, minWidth: 100, maxWidth: 160,
                  px: 1, borderRadius: '8px', border: '1px solid',
                  borderColor: theme.palette.border.subtle,
                  bgcolor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
                  cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 0.12s, background-color 0.12s',
                  '&:hover': { borderColor: theme.palette.border.hover, bgcolor: alpha(theme.palette.text.primary, isDark ? 0.09 : 0.06) },
                  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                }}
              >
                <Typography component="span" sx={{ fontSize: '0.635rem', fontWeight: 600, color: 'text.disabled', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>Value</Typography>
                <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', color: 'text.primary', flex: 1, minWidth: 0, lineHeight: 1, textAlign: 'left' }}>{valueColumn || '—'}</Typography>
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }} />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MuiTooltip title="Download PNG">
                <IconButton
                  size="small"
                  onClick={handleDownload}
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    color: 'text.secondary',
                    '&:hover': { backgroundColor: theme.palette.action.hover },
                  }}
                >
                  <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </MuiTooltip>
              {onClose && (
                <MuiTooltip title="Close">
                  <IconButton
                    size="small"
                    onClick={onClose}
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1.5,
                      color: 'text.secondary',
                      '&:hover': { backgroundColor: theme.palette.action.hover },
                    }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </MuiTooltip>
              )}
            </Box>
          </Box>
        )}
        <Box
          className="chart-container"
          sx={{
            flex: 1,
            minHeight: embedded ? 0 : 250,
            overflow: 'hidden',
            px: embedded ? { xs: 2, md: 3 } : { xs: 2, sm: 3 },
            py: embedded ? 1.5 : 2,
            boxSizing: 'border-box',
          }}
        >
          {chartData && ChartComponent && (
            <ChartComponent ref={chartRef} data={chartData} options={chartOptions} />
          )}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            gap: 2,
            px: 2,
            py: 1,
            minHeight: 48,
            flexShrink: 0,
            borderTop: '1px solid',
            borderColor: theme.palette.border.subtle,
            bgcolor: theme.palette.background.paper,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              position: 'absolute',
              left: 16,
              fontWeight: 500,
              ...theme.typography.uiCaptionMd,
              display: { xs: 'none', sm: 'block' },
            }}
          >
            {result.length > 50 ? `Showing 50 of ${result.length} data points` : `${result.length} data points`}
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              p: 0.5,
              borderRadius: '10px',
              bgcolor: alpha(theme.palette.text.primary, isDark ? 0.1 : 0.06),
              border: '1px solid',
              borderColor: alpha(theme.palette.text.primary, isDark ? 0.1 : 0.08),
            }}
          >
            <ToggleButtonGroup
              value={chartType}
              exclusive
              onChange={(e, v) => v && setChartType(v)}
              size="small"
              sx={{
                gap: 0.25,
                '& .MuiToggleButton-root': {
                  border: 'none',
                  borderRadius: '8px',
                  px: 0.75,
                  py: 0.5,
                  minWidth: 36,
                  height: 30,
                  color: 'text.secondary',
                  '&.Mui-selected': {
                    color: 'text.primary',
                    bgcolor: alpha(theme.palette.background.paper, isDark ? 0.95 : 1),
                    boxShadow: `0 0 0 1px ${alpha(theme.palette.text.primary, 0.08)}, 0 1px 2px ${alpha(theme.palette.common.black, isDark ? 0.35 : 0.08)}`,
                  },
                  '&:hover': {
                    bgcolor: alpha(theme.palette.text.primary, 0.06),
                  },
                },
              }}
            >
              <ToggleButton value="bar" aria-label="Bar chart">
                <MuiTooltip title="Bar chart">
                  <BarChartRoundedIcon sx={{ fontSize: 18 }} />
                </MuiTooltip>
              </ToggleButton>
              <ToggleButton value="line" aria-label="Line chart">
                <MuiTooltip title="Line chart">
                  <ShowChartRoundedIcon sx={{ fontSize: 18 }} />
                </MuiTooltip>
              </ToggleButton>
              <ToggleButton value="pie" aria-label="Pie chart">
                <MuiTooltip title="Pie chart">
                  <PieChartOutlineRoundedIcon sx={{ fontSize: 18 }} />
                </MuiTooltip>
              </ToggleButton>
              <ToggleButton value="doughnut" aria-label="Doughnut chart">
                <MuiTooltip title="Doughnut chart">
                  <DonutLargeRoundedIcon sx={{ fontSize: 18 }} />
                </MuiTooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Box>
      {fullscreen && (
        <Box
          onClick={() => setFullscreen(false)}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: alpha(theme.palette.background.default, isDark ? 0.9 : 0.7),
            zIndex: 9998,
          }}
        />
      )}
      <AppPopover
        anchorEl={labelAnchorEl}
        open={Boolean(labelAnchorEl)}
        onClose={() => setLabelAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        width={180}
        paperSx={{ mt: 0.5 }}
      >
        <Typography sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.635rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', display: 'block', lineHeight: 1 }}>
          Label Column
        </Typography>
        <Box sx={{ maxHeight: 220, overflowY: 'auto', mt: 0.5 }}>
          {columns.map((col) => {
            const isActive = col === labelColumn;
            return (
              <Box
                component="div"
                role="option"
                aria-selected={isActive}
                key={col}
                onClick={() => { setLabelColumn(col); setLabelAnchorEl(null); }}
                sx={{
                  borderRadius: '8px', px: 1, py: 0.875, minHeight: 32,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 1, userSelect: 'none',
                  transition: 'background-color 120ms',
                  backgroundColor: isActive ? alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08) : 'transparent',
                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, isDark ? (isActive ? 0.16 : 0.07) : (isActive ? 0.11 : 0.05)) },
                }}
              >
                <Typography sx={{ fontSize: '0.875rem', color: isActive ? 'primary.main' : 'text.primary', lineHeight: 1.4, fontWeight: isActive ? 500 : 400 }}>
                  {col}
                </Typography>
                {isActive && <CheckRoundedIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />}
              </Box>
            );
          })}
        </Box>
      </AppPopover>
      <AppPopover
        anchorEl={valueAnchorEl}
        open={Boolean(valueAnchorEl)}
        onClose={() => setValueAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        width={180}
        paperSx={{ mt: 0.5 }}
      >
        <Typography sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.635rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', display: 'block', lineHeight: 1 }}>
          Value Column
        </Typography>
        <Box sx={{ maxHeight: 220, overflowY: 'auto', mt: 0.5 }}>
          {numericColumns.map((col) => {
            const isActive = col === valueColumn;
            return (
              <Box
                component="div"
                role="option"
                aria-selected={isActive}
                key={col}
                onClick={() => { setValueColumn(col); setValueAnchorEl(null); }}
                sx={{
                  borderRadius: '8px', px: 1, py: 0.875, minHeight: 32,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 1, userSelect: 'none',
                  transition: 'background-color 120ms',
                  backgroundColor: isActive ? alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08) : 'transparent',
                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, isDark ? (isActive ? 0.16 : 0.07) : (isActive ? 0.11 : 0.05)) },
                }}
              >
                <Typography sx={{ fontSize: '0.875rem', color: isActive ? 'primary.main' : 'text.primary', lineHeight: 1.4, fontWeight: isActive ? 500 : 400 }}>
                  {col}
                </Typography>
                {isActive && <CheckRoundedIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />}
              </Box>
            );
          })}
        </Box>
      </AppPopover>
    </>
  );
}

export default memo(ChartVisualization);
