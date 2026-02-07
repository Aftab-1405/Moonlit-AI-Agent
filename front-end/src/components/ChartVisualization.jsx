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
} from '@mui/material';
import { alpha, lighten } from '@mui/material/styles';
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

// Register Chart.js components
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
  const chartRef = useRef(null);
  const containerRef = useRef(null);

  // Theme-aligned chart palette
  const chartColors = useMemo(() => [
    theme.palette.info.main,
    theme.palette.error.main,
    theme.palette.warning.main,
    theme.palette.success.main,
    theme.palette.primary.main,
    theme.palette.secondary.main,
    lighten(theme.palette.info.main, 0.12),
    lighten(theme.palette.error.main, 0.08),
  ], [theme.palette.error.main, theme.palette.info.main, theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main, theme.palette.warning.main]);

  // Same colors for background (solid, visible)
  const chartColorsBg = chartColors;

  const { columns = [], result = [] } = data || {};

  // Detect numeric and string columns
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

  // Derive column values with robust fallback for mixed and numeric-only results
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

  // Chart configuration
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
        backgroundColor: isPieOrDoughnut ? chartColorsBg : chartColorsBg[0],
        borderColor: isPieOrDoughnut ? chartColors : chartColors[0],
        borderWidth: isPieOrDoughnut ? 2 : 2,
        borderRadius: chartType === 'bar' ? 4 : 0,
        fill: chartType === 'line',
        tension: 0.3,
      }],
    };
  }, [labelColumn, valueColumn, result, chartType, chartColors, chartColorsBg]);

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
        position: 'right',
        labels: {
          color: theme.palette.text.secondary,
          font: { size: 11 },
          padding: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: isDark ? theme.palette.background.elevated : theme.palette.text.primary,
        titleColor: isDark ? theme.palette.text.primary : theme.palette.background.paper,
        bodyColor: isDark ? theme.palette.text.primary : theme.palette.background.paper,
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
  }), [chartType, theme, isDark, embedded]);

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
      {/* Main container - matches SQLResultsTable structure exactly */}
      <Box
        ref={containerRef}
        sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: embedded ? 0 : 400,
        position: fullscreen ? 'fixed' : 'relative',
        inset: fullscreen ? 0 : 'auto',
        zIndex: fullscreen ? 9999 : 'auto',
        backgroundColor: fullscreen ? theme.palette.background.default : 'transparent',
      }}
      >
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
              borderColor: theme.palette.border?.subtle,
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

        {/* Chart Area - no padding to match TableContainer */}
        <Box
          className="chart-container"
          sx={{
            flex: 1,
            minHeight: embedded ? 0 : 250,
            overflow: 'hidden',
          }}
        >
          {chartData && ChartComponent && (
            <ChartComponent ref={chartRef} data={chartData} options={chartOptions} />
          )}
        </Box>

        {/* Footer - chart type toggle centered */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            px: 2,
            minHeight: 52,
            borderTop: '1px solid',
            borderColor: theme.palette.border?.subtle,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', left: 16, fontWeight: 500 }}>
            {result.length > 50 ? `Showing 50 of ${result.length} data points` : `${result.length} data points`}
          </Typography>

          {/* Chart Type Toggle */}
          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={(e, v) => v && setChartType(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                border: 'none',
                borderRadius: 1,
                px: 1.5,
                py: 0.5,
                '&.Mui-selected': {
                  backgroundColor: theme.palette.action.selected,
                },
              },
            }}
          >
            <ToggleButton value="bar">
              <MuiTooltip title="Bar Chart">
                <BarChartRoundedIcon sx={{ fontSize: 18 }} />
              </MuiTooltip>
            </ToggleButton>
            <ToggleButton value="line">
              <MuiTooltip title="Line Chart">
                <ShowChartRoundedIcon sx={{ fontSize: 18 }} />
              </MuiTooltip>
            </ToggleButton>
            <ToggleButton value="pie">
              <MuiTooltip title="Pie Chart">
                <PieChartOutlineRoundedIcon sx={{ fontSize: 18 }} />
              </MuiTooltip>
            </ToggleButton>
            <ToggleButton value="doughnut">
              <MuiTooltip title="Doughnut Chart">
                <DonutLargeRoundedIcon sx={{ fontSize: 18 }} />
              </MuiTooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Fullscreen backdrop */}
      {fullscreen && (
        <Box
          onClick={() => setFullscreen(false)}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: alpha(theme.palette.common.black, isDark ? 0.9 : 0.7),
            zIndex: 9998,
          }}
        />
      )}
    </>
  );
}

export default memo(ChartVisualization);
