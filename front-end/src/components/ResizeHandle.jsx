import { useCallback, useRef, useEffect, memo } from 'react';
import { Box } from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

/**
 * ResizeHandle - Draggable vertical divider for resizing panels
 * 
 * @param {Function} onResize - Callback fired during drag with deltaX
 * @param {Function} onResizeEnd - Callback fired when drag ends
 * @param {boolean} disabled - When true, hides the handle completely
 */
function ResizeHandle({ onResize, onResizeEnd, disabled = false }) {
  const theme = useMuiTheme();
  const isDark = theme.palette.mode === 'dark';
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handleMouseDown = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [disabled]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - startX.current;
    startX.current = e.clientX;
    onResize?.(deltaX);
  }, [onResize]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onResizeEnd?.();
  }, [onResizeEnd]);
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);
  if (disabled) return null;

  return (
    <Box
      onMouseDown={handleMouseDown}
      sx={{
        width: 6,
        flexShrink: 0,
        cursor: 'col-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        transition: 'background-color 0.15s ease',
        '&:hover': {
          backgroundColor: theme.palette.action.hover,
        },
        '&:active': {
          backgroundColor: theme.palette.action.selected,
        },
        '&::after': {
          content: '""',
          width: 2,
          height: 40,
          borderRadius: 1,
          backgroundColor: theme.palette.border?.subtle,
          transition: 'background-color 0.15s ease, height 0.15s ease',
        },
        '&:hover::after': {
          height: 60,
          backgroundColor: theme.palette.text.secondary,
        },
      }}
    />
  );
}

export default memo(ResizeHandle);

