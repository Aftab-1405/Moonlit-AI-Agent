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
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import {
  Box,
  Typography,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip as MuiTooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
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
  Filler
);

function ChartVisualization({ data, onClose, embedded = false, viewMode, onViewModeChange }) {
  const [chartType, setChartType] = useState('bar');
  const [labelColumnOverride, setLabelColumn] = useState(null);
  const [valueColumnOverride, setValueColumn] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const chartColors = useMemo(() => theme.palette.chart, [theme.palette.chart]);

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
        backgroundColor: isPieOrDoughnut ? chartColors : chartColors[0],
        borderColor: isPieOrDoughnut ? chartColors : chartColors[0],
        borderWidth: isPieOrDoughnut ? 2 : 2,
        borderRadius: chartType === 'bar' ? 4 : 0,
        fill: chartType === 'line',
        tension: 0.3,
      }],
    };
  }, [labelColumn, valueColumn, result, chartType, chartColors]);

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
              minHeight: 40,
              borderBottom: '1px solid',
              borderColor: theme.palette.border.subtle,
              bgcolor: theme.palette.background.paper,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, flexWrap: 'wrap', minWidth: 0 }}>
              <FormControl size="small" sx={{ minWidth: { xs: 88, sm: 100 } }}>
                <InputLabel sx={{ ...theme.typography.uiCaptionMd }}>Label</InputLabel>
                <Select
                  value={labelColumn}
                  label="Label"
                  onChange={(e) => setLabelColumn(e.target.value)}
                  sx={{ height: 30, ...theme.typography.uiCaptionMd }}
                >
                  {columns.map(col => (
                    <MenuItem key={col} value={col} sx={{ fontSize: '0.8125rem' }}>{col}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: { xs: 88, sm: 100 } }}>
                <InputLabel sx={{ ...theme.typography.uiCaptionMd }}>Value</InputLabel>
                <Select
                  value={valueColumn}
                  label="Value"
                  onChange={(e) => setValueColumn(e.target.value)}
                  sx={{ height: 30, ...theme.typography.uiCaptionMd }}
                >
                  {numericColumns.map(col => (
                    <MenuItem key={col} value={col} sx={{ fontSize: '0.8125rem' }}>{col}</MenuItem>
                  ))}
                </Select>
              </FormControl>
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
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: theme.palette.border.subtle,
              backgroundColor: theme.palette.action.hover,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {viewMode && onViewModeChange && (
                <MuiTooltip title="Table View">
                  <IconButton
                    size="small"
                    onClick={() => onViewModeChange('table')}
                    sx={{
                      width: 44,
                      height: 44,
                      color: 'text.secondary',
                      '&:hover': { backgroundColor: theme.palette.action.hover },
                    }}
                  >
                    <ArrowBackIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </MuiTooltip>
              )}

              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Label</InputLabel>
                <Select
                  value={labelColumn}
                  label="Label"
                  onChange={(e) => setLabelColumn(e.target.value)}
                  sx={{ height: 32 }}
                >
                  {columns.map(col => (
                    <MenuItem key={col} value={col}>{col}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Value</InputLabel>
                <Select
                  value={valueColumn}
                  label="Value"
                  onChange={(e) => setValueColumn(e.target.value)}
                  sx={{ height: 32 }}
                >
                  {numericColumns.map(col => (
                    <MenuItem key={col} value={col}>{col}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MuiTooltip title="Download PNG">
                <IconButton
                  size="small"
                  onClick={handleDownload}
                  sx={{
                    width: 44,
                    height: 44,
                    color: 'text.secondary',
                    '&:hover': { backgroundColor: theme.palette.action.hover },
                  }}
                >
                  <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </MuiTooltip>
              <MuiTooltip title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                <IconButton
                  size="small"
                  onClick={() => setFullscreen(!fullscreen)}
                  sx={{
                    width: 44,
                    height: 44,
                    color: 'text.secondary',
                    '&:hover': { backgroundColor: theme.palette.action.hover },
                  }}
                >
                  {fullscreen ? (
                    <FullscreenExitRoundedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <FullscreenRoundedIcon sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </MuiTooltip>
              {onClose && (
                <MuiTooltip title="Close">
                  <IconButton
                    size="small"
                    onClick={onClose}
                    sx={{
                      width: 44,
                      height: 44,
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
            px: embedded ? { xs: 2, md: 3 } : 0,
            py: embedded ? 1.5 : 0,
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
            py: embedded ? 1 : 1.25,
            minHeight: embedded ? 44 : 52,
            flexShrink: 0,
            borderTop: '1px solid',
            borderColor: theme.palette.border.subtle,
            bgcolor: embedded ? theme.palette.background.paper : 'transparent',
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
            sx={
              embedded
                ? {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.25,
                  p: 0.5,
                  borderRadius: '10px',
                  bgcolor: alpha(theme.palette.text.primary, isDark ? 0.1 : 0.06),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.text.primary, isDark ? 0.1 : 0.08),
                }
                : {}
            }
          >
            <ToggleButtonGroup
              value={chartType}
              exclusive
              onChange={(e, v) => v && setChartType(v)}
              size="small"
              sx={{
                gap: embedded ? 0.25 : 0,
                '& .MuiToggleButton-root': {
                  border: 'none',
                  borderRadius: embedded ? '8px' : `${theme.shape.borderRadius}px`,
                  px: embedded ? 0.75 : 1.5,
                  py: embedded ? 0.5 : 0.5,
                  minWidth: embedded ? 36 : undefined,
                  height: embedded ? 30 : undefined,
                  color: 'text.secondary',
                  '&.Mui-selected': {
                    color: 'text.primary',
                    bgcolor: embedded
                      ? alpha(theme.palette.background.paper, isDark ? 0.95 : 1)
                      : theme.palette.action.selected,
                    boxShadow: embedded
                      ? `0 0 0 1px ${alpha(theme.palette.text.primary, 0.08)}, 0 1px 2px ${alpha(theme.palette.common.black, isDark ? 0.35 : 0.08)}`
                      : undefined,
                  },
                  '&:hover': {
                    bgcolor: embedded ? alpha(theme.palette.text.primary, 0.06) : theme.palette.action.hover,
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
    </>
  );
}

export default memo(ChartVisualization);
