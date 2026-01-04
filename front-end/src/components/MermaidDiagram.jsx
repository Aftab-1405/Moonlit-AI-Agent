import { useEffect, useRef, useState, useId, useCallback, useMemo, memo } from 'react';
import mermaid from 'mermaid';
import { Box, Paper, IconButton, Tooltip, Typography, CircularProgress, Slider } from '@mui/material';
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
  const uniqueId = useId().replace(/:/g, '');

  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Get mermaid config from theme.js (centralized)
  const mermaidConfig = useMemo(() => getMermaidThemeConfig(theme), [theme]);

  // Render diagram with theme-aware config
  useEffect(() => {
    const renderDiagram = async () => {
      if (!code) return;

      setLoading(true);
      setError(null);
      setSvg('');

      try {
        // Re-initialize mermaid with current theme
        mermaid.initialize(mermaidConfig);

        const parseResult = await mermaid.parse(code, { suppressErrors: true });

        if (parseResult === false) {
          setError('Diagram contains syntax that cannot be rendered');
          setLoading(false);
          return;
        }

        const id = `mermaid-${uniqueId}-${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);
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
  }, [code, uniqueId, mermaidConfig]);

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

  // Memoized styles
  const headerStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    px: 2,
    py: 0.75,
    backgroundColor: isDark ? alpha('#fff', 0.03) : alpha('#000', 0.03),
    borderBottom: '1px solid',
    borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
  }), [isDark]);

  const diagramContainerStyles = useMemo(() => ({
    flex: 1,
    p: 3,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: fullscreen ? 'calc(100vh - 60px)' : 200,
    maxHeight: fullscreen ? 'calc(100vh - 60px)' : 450,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    cursor: isPanning ? 'grabbing' : 'grab',
    userSelect: 'none',
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
          my: 2,
          overflow: 'hidden',
          bgcolor: isDark ? alpha('#000', 0.3) : alpha('#000', 0.02),
          border: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1),
          borderRadius: '12px',
        }}
      >
        <Box sx={headerStyles}>
          <Typography variant="labelSmall" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontWeight: 500 }}>
            mermaid
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy}>
              {copied ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
        <Box component="pre" sx={{ m: 0, p: 2, overflow: 'auto', fontFamily: 'monospace' }}>
          <code>{code}</code>
        </Box>
      </Paper>
    );
  }

  return (
    <>
      <Paper
        ref={containerRef}
        elevation={fullscreen ? 8 : 0}
        sx={{
          my: fullscreen ? 0 : 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
          borderRadius: fullscreen ? 0 : '12px',
          position: fullscreen ? 'fixed' : 'relative',
          inset: fullscreen ? 0 : 'auto',
          zIndex: fullscreen ? 9999 : 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <Box sx={headerStyles}>
          <Typography
            variant="labelSmall"
            sx={{
              color: 'text.secondary',
              textTransform: 'uppercase',
              fontWeight: 500,
              letterSpacing: 0.5,
            }}
          >
            diagram
          </Typography>

          {/* Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="Zoom out">
              <IconButton size="small" onClick={handleZoomOut} disabled={zoom <= 25}>
                <ZoomOutRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>

            <Box sx={{ width: 80, mx: 0.5, display: { xs: 'none', sm: 'block' } }}>
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

            <Typography variant="labelMedium" sx={{ color: 'text.secondary', minWidth: 35, textAlign: 'center' }}>
              {zoom}%
            </Typography>

            <Tooltip title="Zoom in">
              <IconButton size="small" onClick={handleZoomIn} disabled={zoom >= 300}>
                <ZoomInRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>

            <Tooltip title="Reset zoom">
              <IconButton size="small" onClick={handleResetZoom}>
                <RestartAltRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>

            <Box sx={{ width: 1, height: 16, bgcolor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1), mx: 0.5 }} />

            <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
              <IconButton size="small" onClick={handleCopy}>
                {copied ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Download SVG">
              <span>
                <IconButton size="small" onClick={handleDownload} disabled={!svg}>
                  <FileDownloadOutlinedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <IconButton size="small" onClick={toggleFullscreen}>
                {fullscreen ? <FullscreenExitRoundedIcon sx={{ fontSize: 16 }} /> : <FullscreenRoundedIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Diagram */}
        <Box
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          sx={diagramContainerStyles}
        >
          {loading ? (
            <Box sx={{ textAlign: 'center', cursor: 'default' }}>
              <CircularProgress size={24} sx={{ color: 'primary.main' }} />
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
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
      </Paper>

      {/* Fullscreen backdrop */}
      {fullscreen && (
        <Box
          onClick={toggleFullscreen}
          sx={{
            position: 'fixed',
            inset: 0,
            backgroundColor: alpha(theme.palette.common.black, isDark ? 0.9 : 0.8),
            zIndex: 9998,
            cursor: 'pointer',
          }}
        />
      )}
    </>
  );
}

export default memo(MermaidDiagram);
