// SchemaMindmapDialog — full-screen overlay that renders the database schema
// as an interactive React Flow diagram.
//
// Lifted out of the Sidebar feature into the shell's global-overlay layer so
// that:
//   - It is mounted once at the application shell, not inside a feature.
//   - Its state survives sidebar unmount/remount (e.g. narrow ↔ desktop).
//   - The Sidebar feature stays focused on navigation/list interactions.
//
// The dialog uses an immersive viewport layout so the schema canvas remains
// the primary surface on desktop and mobile.

import { Box, CircularProgress, Dialog, DialogContent, IconButton, Typography } from '@mui/material';
import { useReducedMotion } from 'framer-motion';
import { lazy, memo, Suspense } from 'react';
import { CloseIcon, MindmapIcon } from '@/components/icons';
import { getMindmapViewerLayoutSx } from '@/features/styles/interfaceChrome';
import {
  getDialogHeaderSx,
  getDialogPaperSx,
  getInteractiveControlSx,
  getScrollbarStyles,
} from '@/styles/shared';

const SchemaFlowDiagram = lazy(() => import('@/features/overlays/database/SchemaFlowDiagram'));

const getSchemaDialogRootSx = (transitionDuration) => ({
  pointerEvents: 'none',
  '& .MuiBackdrop-root': {
    pointerEvents: 'auto',
  },
  '& .MuiDialog-container': {
    pointerEvents: 'none',
    transition: `opacity ${transitionDuration}ms ease`,
  },
  '& .MuiDialog-paper': {
    pointerEvents: 'auto',
    transition: `opacity ${transitionDuration}ms ease`,
  },
  '&.MuiModal-hidden .react-flow': {
    display: 'none',
  },
});

const SchemaMindmapDialog = memo(
  function SchemaMindmapDialog({
    open,
    onClose,
    theme,
    currentDatabase,
    schemaLoading,
    schemaData,
  }) {
    const reduceMotion = useReducedMotion();
    const transitionDuration = reduceMotion ? 0 : 300;
    const schemaSurfaceLeft = '0px';
    const schemaSurfaceWidth = '100vw';
    const layoutSx = getMindmapViewerLayoutSx();
    const tableCount = schemaData?.tables?.length || 0;

    return (
      <Dialog
        open={open}
        onClose={onClose}
        aria-labelledby="schema-mindmap-title"
        fullScreen
        maxWidth={false}
        fullWidth={false}
        keepMounted
        transitionDuration={transitionDuration}
        sx={getSchemaDialogRootSx(transitionDuration)}
        slotProps={{
          backdrop: {
            transitionDuration,
            sx: {
              left: schemaSurfaceLeft,
              width: schemaSurfaceWidth,
              backgroundColor: 'transparent',
            },
          },
        }}
        PaperProps={{
          sx: {
            ...getDialogPaperSx(theme, { isMobile: true }),
            ...layoutSx.paper,
            position: 'fixed',
            inset: '0 auto auto auto',
            left: schemaSurfaceLeft,
            top: 0,
            backgroundColor: theme.palette.background.default,
            boxShadow: 'none',
            opacity: open ? 1 : 0,
            transition: `opacity ${transitionDuration}ms ease`,
          },
        }}
      >
        <Box
          sx={{
            ...getDialogHeaderSx(theme),
            ...layoutSx.header,
            width: '100%',
            borderBottomColor: theme.palette.border.separator,
            backgroundColor: theme.palette.background.default,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flex: 1 }}>
            <Box
              aria-hidden
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: '10px',
                border: '1px solid',
                borderColor: theme.palette.border.subtle,
                color: 'text.secondary',
                backgroundColor: theme.palette.layer.surfaceMuted,
              }}
            >
              <MindmapIcon sx={{ fontSize: 19 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                id="schema-mindmap-title"
                component="h2"
                sx={{
                  ...theme.typography.uiBodyMd,
                  color: 'text.primary',
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentDatabase ? `${currentDatabase} schema` : 'Schema mindmap'}
              </Typography>
              <Typography
                sx={{
                  ...theme.typography.uiCaptionSm,
                  mt: 0.125,
                  color: 'text.secondary',
                  lineHeight: 1.3,
                }}
              >
                {schemaData
                  ? `${tableCount} ${tableCount === 1 ? 'table' : 'tables'}`
                  : 'Schema overview'}
              </Typography>
            </Box>
          </Box>
          <IconButton
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close schema mindmap"
            sx={{
              color: 'text.secondary',
              ...getInteractiveControlSx(theme, {
                size: { xs: 44, sm: 36 },
                radius: theme.shape.radius.pill,
              }),
            }}
          >
            <CloseIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Box>

        <DialogContent
          sx={{
            ...layoutSx.content,
            contain: 'layout paint style',
            ...getScrollbarStyles(theme),
          }}
        >
          {schemaLoading ? (
            <Box
              role="status"
              aria-live="polite"
              aria-label="Loading schema mindmap"
              sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}
            >
              <CircularProgress />
            </Box>
          ) : schemaData ? (
            <Box sx={layoutSx.canvas}>
              <Suspense
                fallback={
                  <Box
                    role="status"
                    aria-live="polite"
                    aria-label="Loading schema diagram"
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      height: '100%',
                    }}
                  >
                    <CircularProgress />
                  </Box>
                }
              >
                <SchemaFlowDiagram
                  active={open}
                  database={schemaData.database}
                  tables={schemaData.tables || []}
                  columns={schemaData.columns || {}}
                />
              </Suspense>
            </Box>
          ) : (
            <Box
              role="status"
              aria-live="polite"
              sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}
            >
              <Typography color="text.secondary">
                No schema data available. Connect to a database first.
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    );
  },
  (prevProps, nextProps) => prevProps.open === nextProps.open,
);

export default SchemaMindmapDialog;
