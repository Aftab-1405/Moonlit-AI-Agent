import { useEffect, useRef, useState, useId, useCallback, useMemo, memo } from 'react';
import mermaid from 'mermaid';
import { Box, Paper, IconButton, Tooltip, Typography, CircularProgress, Slider, Portal } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';

// Import theme config from centralized theme.js
import { getMermaidThemeConfig } from '../theme';

function MermaidDiagram({ code }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const containerRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const renderTimeoutRef = useRef(null);
  const uniqueId = useId().replace(/:/g, '');

  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isStreaming, setIsStreaming] = useState(true);
  const [stableCode, setStableCode] = useState('');

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, []);

  // Debounce code changes during streaming - wait for code to stabilize
  useEffect(() => {
    if (!code) return;

    setIsStreaming(true);

    // Clear any pending render
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // Wait 500ms after last code change before attempting render
    renderTimeoutRef.current = setTimeout(() => {
      setIsStreaming(false);
      setStableCode(code);
    }, 500);

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [code]);

  // Get mermaid config from theme.js (centralized)
  const mermaidConfig = useMemo(() => getMermaidThemeConfig(theme), [theme]);

  // Render diagram only when code is stable (not streaming)
  useEffect(() => {
    const renderDiagram = async () => {
      if (!stableCode || isStreaming) return;

      setLoading(true);
      setError(null);

      try {
        // Re-initialize mermaid with current theme
        mermaid.initialize(mermaidConfig);

        const parseResult = await mermaid.parse(stableCode, { suppressErrors: true });

        if (parseResult === false) {
          setError('Diagram contains syntax that cannot be rendered');
          setLoading(false);
          return;
        }

        const id = `mermaid-${uniqueId}-${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(id, stableCode);
        setSvg(renderedSvg);
      } catch (err) {
        console.warn('Mermaid rendering warning:', err);
        const errorMsg = err?.message || err?.str || 'Diagram syntax error';
        setError(errorMsg.split('\n')[0]);
      } finally {
        setLoading(false);
      }
    };

    const cleanup = () => {
      document.querySelectorAll('[id^="d"]').forEach(el => {
        if (el.textContent?.includes('error in text') || el.textContent?.includes('Syntax error')) {
          el.remove();
        }
      });
    };

    cleanup();
    renderDiagram();
    return cleanup;
  }, [stableCode, isStreaming, uniqueId, mermaidConfig]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleDownload = useCallback(() => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [svg]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 25, 300));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(100);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomChange = useCallback((_, value) => {
    setZoom(value);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setFullscreen(prev => !prev);
    setZoom(100);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  }, [panPosition]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanning) return;
    setPanPosition({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Touch event handlers for mobile panning
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsPanning(true);
    setPanStart({ x: touch.clientX - panPosition.x, y: touch.clientY - panPosition.y });
  }, [panPosition]);

  const handleTouchMove = useCallback((e) => {
    if (!isPanning || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPanPosition({
      x: touch.clientX - panStart.x,
      y: touch.clientY - panStart.y,
    });
  }, [isPanning, panStart]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Memoized styles
  const headerStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    px: { xs: 1, sm: 2 },
    py: { xs: 0.5, sm: 0.75 },
    backgroundColor: isDark ? alpha('#fff', 0.03) : alpha('#000', 0.03),
    borderBottom: '1px solid',
    borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
    minHeight: { xs: 40, sm: 44 },
  }), [isDark]);

  const diagramContainerStyles = useMemo(() => ({
    flex: 1,
    p: { xs: 1.5, sm: 2, md: 3 },
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: fullscreen ? 'calc(100vh - 60px)' : { xs: 180, sm: 200 },
    maxHeight: fullscreen ? 'calc(100vh - 60px)' : { xs: 320, sm: 400, md: 450 },
    overflow: 'hidden',
    backgroundColor: 'transparent',
    cursor: isPanning ? 'grabbing' : 'grab',
    userSelect: 'none',
    touchAction: 'none', // Prevent browser handling of touch events
  }), [fullscreen, isPanning]);

  const svgContainerStyles = useMemo(() => ({
    transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoom / 100})`,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform 0.2s ease',
    '& svg': {
      maxWidth: '100%',
      height: 'auto',
      filter: isDark ? 'none' : `drop-shadow(0 2px 8px ${alpha(theme.palette.common.black, 0.08)})`,
      pointerEvents: 'none',
    },
  }), [panPosition, zoom, isPanning, isDark, theme]);

  // Error fallback
  if (error) {
    return (
      <Paper
        sx={{
          my: { xs: 1.5, sm: 2 },
          overflow: 'hidden',
          bgcolor: isDark ? alpha('#000', 0.3) : alpha('#000', 0.02),
          border: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1),
          borderRadius: { xs: '8px', sm: '12px' },
        }}
      >
        <Box sx={headerStyles}>
          <Typography
            variant="labelSmall"
            sx={{
              color: 'text.secondary',
              textTransform: 'uppercase',
              fontWeight: 500,
              fontSize: { xs: '0.65rem', sm: '0.7rem' },
            }}
          >
            mermaid
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy}>
              {copied ? <CheckRoundedIcon sx={{ fontSize: { xs: 16, sm: 14 } }} /> : <ContentCopyRoundedIcon sx={{ fontSize: { xs: 16, sm: 14 } }} />}
            </IconButton>
          </Tooltip>
        </Box>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: { xs: 1.5, sm: 2 },
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: { xs: '0.75rem', sm: '0.8rem', md: '0.875rem' },
            maxHeight: { xs: 200, sm: 300 },
          }}
        >
          <code>{code}</code>
        </Box>
      </Paper>
    );
  }

  // Shared diagram content - used in both normal and fullscreen modes
  const diagramContent = (
    <>
      {/* Header - Mobile optimized */}
      <Box sx={headerStyles}>
        {/* Label - Hidden on mobile, visible on tablet+ */}
        <Typography
          variant="labelSmall"
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            fontWeight: 500,
            letterSpacing: 0.5,
            display: { xs: 'none', sm: 'block' },
            flexShrink: 0,
          }}
        >
          diagram
        </Typography>

        {/* Controls - Responsive layout */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 0.25, sm: 0.5 },
          flex: { xs: 1, sm: 'none' },
          justifyContent: { xs: 'space-between', sm: 'flex-end' },
        }}>
          {/* Zoom controls group */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <Tooltip title="Zoom out">
              <IconButton size="small" onClick={handleZoomOut} disabled={zoom <= 25}>
                <ZoomOutRoundedIcon sx={{ fontSize: { xs: 18, sm: 16 } }} />
              </IconButton>
            </Tooltip>

            {/* Slider - Hidden on mobile */}
            <Box sx={{ width: 80, mx: 0.5, display: { xs: 'none', md: 'block' } }}>
              <Slider
                value={zoom}
                onChange={handleZoomChange}
                min={25}
                max={300}
                size="small"
                sx={{
                  color: 'primary.main',
                  '& .MuiSlider-thumb': { width: 12, height: 12 },
                  '& .MuiSlider-track': { height: 3 },
                  '& .MuiSlider-rail': { height: 3, opacity: 0.3 },
                }}
              />
            </Box>

            {/* Zoom percentage - Compact on mobile */}
            <Typography
              variant="labelMedium"
              sx={{
                color: 'text.secondary',
                minWidth: { xs: 32, sm: 35 },
                textAlign: 'center',
                fontSize: { xs: '0.7rem', sm: '0.75rem' },
              }}
            >
              {zoom}%
            </Typography>

            <Tooltip title="Zoom in">
              <IconButton size="small" onClick={handleZoomIn} disabled={zoom >= 300}>
                <ZoomInRoundedIcon sx={{ fontSize: { xs: 18, sm: 16 } }} />
              </IconButton>
            </Tooltip>

            <Tooltip title="Reset zoom">
              <IconButton size="small" onClick={handleResetZoom}>
                <RestartAltRoundedIcon sx={{ fontSize: { xs: 18, sm: 16 } }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Divider - Hidden on mobile */}
          <Box sx={{
            width: 1,
            height: 16,
            bgcolor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1),
            mx: 0.5,
            display: { xs: 'none', sm: 'block' },
          }} />

          {/* Action buttons group */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
              <IconButton size="small" onClick={handleCopy}>
                {copied ? <CheckRoundedIcon sx={{ fontSize: { xs: 16, sm: 14 } }} /> : <ContentCopyRoundedIcon sx={{ fontSize: { xs: 16, sm: 14 } }} />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Download SVG">
              <span>
                <IconButton size="small" onClick={handleDownload} disabled={!svg}>
                  <FileDownloadOutlinedIcon sx={{ fontSize: { xs: 16, sm: 14 } }} />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <IconButton size="small" onClick={toggleFullscreen}>
                {fullscreen ? <FullscreenExitRoundedIcon sx={{ fontSize: { xs: 18, sm: 16 } }} /> : <FullscreenRoundedIcon sx={{ fontSize: { xs: 18, sm: 16 } }} />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Diagram */}
      <Box
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        sx={diagramContainerStyles}
      >
        {isStreaming ? (
          <Box sx={{ textAlign: 'center', cursor: 'default' }}>
            <CircularProgress size={24} sx={{ color: 'text.secondary' }} />
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mt: 1,
                color: 'text.secondary',
                fontSize: { xs: '0.7rem', sm: '0.75rem' },
              }}
            >
              Receiving diagram code...
            </Typography>
          </Box>
        ) : loading ? (
          <Box sx={{ textAlign: 'center', cursor: 'default' }}>
            <CircularProgress size={24} sx={{ color: 'primary.main' }} />
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mt: 1,
                color: 'text.secondary',
                fontSize: { xs: '0.7rem', sm: '0.75rem' },
              }}
            >
              Rendering diagram...
            </Typography>
          </Box>
        ) : svg ? (
          <Box
            sx={svgContainerStyles}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : null}
      </Box>
    </>
  );

  // Fullscreen mode - rendered via Portal to escape stacking contexts
  if (fullscreen) {
    return (
      <>
        {/* Placeholder to maintain layout */}
        <Paper
          sx={{
            my: { xs: 1.5, sm: 2 },
            overflow: 'hidden',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
            borderRadius: { xs: '8px', sm: '12px' },
            minHeight: { xs: 180, sm: 200 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Viewing in fullscreen...
          </Typography>
        </Paper>

        {/* Fullscreen overlay - rendered at body level via Portal */}
        <Portal>
          {/* Backdrop */}
          <Box
            onClick={toggleFullscreen}
            sx={{
              position: 'fixed',
              inset: 0,
              backgroundColor: alpha(theme.palette.common.black, isDark ? 0.95 : 0.9),
              zIndex: theme.zIndex.modal + 100,
              cursor: 'pointer',
            }}
          />
          {/* Fullscreen content */}
          <Paper
            ref={containerRef}
            elevation={8}
            sx={{
              position: 'fixed',
              inset: 0,
              zIndex: theme.zIndex.modal + 101,
              overflow: 'hidden',
              bgcolor: 'background.paper',
              borderRadius: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {diagramContent}
          </Paper>
        </Portal>
      </>
    );
  }

  // Normal mode
  return (
    <Paper
      ref={containerRef}
      elevation={0}
      sx={{
        my: { xs: 1.5, sm: 2 },
        overflow: 'hidden',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
        borderRadius: { xs: '8px', sm: '12px' },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {diagramContent}
    </Paper>
  );
}

export default memo(MermaidDiagram);
