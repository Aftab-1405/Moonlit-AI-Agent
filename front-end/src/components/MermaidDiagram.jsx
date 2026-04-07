import { useEffect, useRef, useState, useId, useCallback, useMemo, memo } from 'react';
import mermaid from 'mermaid';
import { Box, Paper, IconButton, Tooltip, Typography, CircularProgress, Portal } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { getMermaidThemeConfig } from '../theme';
import logger from '../utils/logger';

function MermaidDiagram({ code }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const containerRef = useRef(null);
  const diagramRef = useRef(null);
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
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, []);

  // Attach non-passive wheel listener for scroll-to-zoom (preventDefault requires non-passive)
  useEffect(() => {
    const el = diagramRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      setZoom((prev) => Math.min(Math.max(prev + delta, 25), 300));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  useEffect(() => {
    if (!code) return;

    setIsStreaming(true);
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }
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
  const mermaidConfig = useMemo(() => getMermaidThemeConfig(theme), [theme]);
  useEffect(() => {
    const renderDiagram = async () => {
      if (!stableCode || isStreaming) return;

      setLoading(true);
      setError(null);

      try {
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
        logger.warn('Mermaid rendering warning:', err);
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
  const headerBg = isDark
    ? alpha(theme.palette.background.elevated, 0.9)
    : alpha(theme.palette.background.paper, 0.95);

  const headerStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    px: { xs: 1.25, sm: 1.75 },
    backgroundColor: headerBg,
    borderBottom: '1px solid',
    borderColor: theme.palette.border.subtle,
    minHeight: { xs: 38, sm: 42 },
  }), [theme, headerBg]);

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
        filter: isDark ? 'none' : `drop-shadow(0 2px 8px ${alpha(theme.palette.text.primary, 0.08)})`,
        pointerEvents: 'none',
      },
  }), [panPosition, zoom, isPanning, isDark, theme]);
  if (error) {
    return (
      <Paper
        sx={{
          my: { xs: 1.5, sm: 2 },
          overflow: 'hidden',
          bgcolor: 'background.elevated',
          border: '1px solid',
          borderColor: theme.palette.border.subtle,
          borderRadius: { xs: '8px', sm: '10px' },
          transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
          '&:hover': {
            borderColor: alpha(theme.palette.primary.main, isDark ? 0.35 : 0.3),
            boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, isDark ? 0.1 : 0.07)}`,
          },
        }}
      >
        <Box sx={headerStyles}>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              textTransform: 'uppercase',
              fontWeight: 500,
              ...theme.typography.uiCaption2xs,
            }}
          >
            mermaid
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy} sx={{ width: 30, height: 30, borderRadius: '6px', color: copied ? theme.palette.success.main : theme.palette.text.secondary, transition: 'color 0.15s ease, background-color 0.15s ease', '&:hover': { color: theme.palette.text.primary, bgcolor: alpha(theme.palette.text.primary, 0.06) } }}>
              {copied ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: { xs: 1.5, sm: 2 },
            overflow: 'auto',
            fontFamily: theme.typography.fontFamilyMono,
            ...theme.typography.uiBodyTable,
            maxHeight: { xs: 200, sm: 300 },
          }}
        >
          <code>{code}</code>
        </Box>
      </Paper>
    );
  }
  const diagramContent = (
    <>
      <Box sx={headerStyles}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            fontWeight: 500,
            ...theme.typography.uiCaption2xs,
          }}
        >
          diagram
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
            <IconButton size="small" onClick={handleCopy} sx={{ width: 30, height: 30, borderRadius: '6px', color: copied ? theme.palette.success.main : theme.palette.text.secondary, transition: 'color 0.15s ease, background-color 0.15s ease', '&:hover': { color: theme.palette.text.primary, bgcolor: alpha(theme.palette.text.primary, 0.06) } }}>
              {copied ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Download SVG">
            <span>
              <IconButton size="small" onClick={handleDownload} disabled={!svg} sx={{ width: 30, height: 30, borderRadius: '6px', color: theme.palette.text.secondary, '&:hover': { color: theme.palette.text.primary, bgcolor: alpha(theme.palette.text.primary, 0.06) } }}>
                <FileDownloadOutlinedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <IconButton size="small" onClick={toggleFullscreen} sx={{ width: 30, height: 30, borderRadius: '6px', color: theme.palette.text.secondary, '&:hover': { color: theme.palette.text.primary, bgcolor: alpha(theme.palette.text.primary, 0.06) } }}>
              {fullscreen ? <FullscreenExitRoundedIcon sx={{ fontSize: 16 }} /> : <FullscreenRoundedIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box
        ref={diagramRef}
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
                ...theme.typography.uiCaptionXs,
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
                ...theme.typography.uiCaptionXs,
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
  if (fullscreen) {
    return (
      <>
        <Paper
          sx={{
            my: { xs: 1.5, sm: 2 },
            overflow: 'hidden',
            bgcolor: 'background.elevated',
            border: '1px solid',
            borderColor: theme.palette.border.subtle,
            borderRadius: { xs: '8px', sm: '10px' },
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
        <Portal>
          <Box
            onClick={toggleFullscreen}
            sx={{
              position: 'fixed',
              inset: 0,
              backgroundColor: alpha(theme.palette.background.default, isDark ? 0.95 : 0.9),
              zIndex: theme.zIndex.modal + 100,
              cursor: 'pointer',
            }}
          />
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
  return (
    <Paper
      ref={containerRef}
      elevation={0}
      sx={{
        my: { xs: 1.5, sm: 2 },
        overflow: 'hidden',
        bgcolor: 'background.elevated',
        border: '1px solid',
        borderColor: theme.palette.border.subtle,
        borderRadius: { xs: '8px', sm: '10px' },
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, isDark ? 0.35 : 0.3),
          boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, isDark ? 0.1 : 0.07)}`,
        },
      }}
    >
      {diagramContent}
    </Paper>
  );
}

export default memo(MermaidDiagram);
