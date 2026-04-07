import { memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  List,
  Dialog,
  DialogContent,
  CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import StreamOutlinedIcon from '@mui/icons-material/StreamOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AppPopover from '../AppPopover';
import { HistoryPopoverItem } from './SidebarPrimitives';
import SchemaFlowDiagram from '../SchemaFlowDiagram';
import {
  getDialogPaperSx,
  getDialogHeaderSx,
  getCompactActionSx,
  DIALOG_VIEWPORT_SUPPORT_QUERY,
} from '../../styles/shared';

function SidebarOverlays({
  theme,
  isPopoverOpen,
  dbPopoverAnchor,
  handleCloseDbPopover,
  availableDatabases,
  currentDatabase,
  handleDatabaseSelect,
  handleOpenNewConnection,
  isHistoryPopoverOpen,
  historyPopoverAnchor,
  handleCloseHistoryPopover,
  conversations,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  mindmapOpen,
  handleCloseMindmap,
  schemaLoading,
  schemaData,
}) {
  return (
    <>
      <AppPopover
        open={isPopoverOpen}
        anchorEl={dbPopoverAnchor}
        onClose={handleCloseDbPopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        width={220}
        paperSx={{ mt: 1 }}
      >
        <Typography sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.635rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', display: 'block', lineHeight: 1 }}>
          Switch Database
        </Typography>
        <Box sx={{ maxHeight: 280, overflowY: 'auto', mt: 0.5 }}>
          {availableDatabases.map((db) => {
            const isActive = db === currentDatabase;
            return (
              <Box
                component="div"
                role="menuitemradio"
                aria-checked={isActive}
                key={db}
                onClick={() => handleDatabaseSelect(db)}
                sx={{
                  borderRadius: '8px',
                  px: 1,
                  py: 0.875,
                  minHeight: 32,
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 1,
                  alignItems: 'center',
                  userSelect: 'none',
                  transition: 'background-color 120ms',
                  backgroundColor: isActive ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'transparent',
                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? (isActive ? 0.16 : 0.07) : (isActive ? 0.11 : 0.05)) },
                }}
              >
                <Typography sx={{ fontSize: '0.875rem', color: isActive ? 'primary.main' : 'text.primary', lineHeight: 1.4, fontWeight: isActive ? 500 : 400 }}>
                  {db}
                </Typography>
                {isActive && <CheckRoundedIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />}
              </Box>
            );
          })}
        </Box>
        <Box sx={{ height: '0.5px', backgroundColor: alpha(theme.palette.text.primary, 0.07), my: 0.75, mx: 0.5 }} />
        <Box
          component="div"
          role="menuitem"
          onClick={handleOpenNewConnection}
          sx={{
            borderRadius: '8px',
            px: 1,
            py: 0.875,
            minHeight: 32,
            cursor: 'pointer',
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            userSelect: 'none',
            transition: 'background-color 120ms',
            '&:hover': { backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.07 : 0.05) },
          }}
        >
          <AddCircleOutlineRoundedIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', lineHeight: 1.4 }}>
            New Connection
          </Typography>
        </Box>
      </AppPopover>

      <AppPopover
        open={isHistoryPopoverOpen}
        anchorEl={historyPopoverAnchor}
        onClose={handleCloseHistoryPopover}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        paperSx={{ ml: 1 }}
        width={240}
      >
        <Typography sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.635rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', display: 'block', lineHeight: 1 }}>
          Conversation History
        </Typography>
        <Box sx={{ maxHeight: 360, overflowY: 'auto', mt: 0.5 }}>
          {conversations.length === 0 ? (
            <Box sx={{ px: 1, py: 1.5 }}>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.4 }}>
                No conversations yet
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {conversations.map((conv) => (
                <HistoryPopoverItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === currentConversationId}
                  onSelect={onSelectConversation}
                  onDelete={onDeleteConversation}
                  onClosePopover={handleCloseHistoryPopover}
                  theme={theme}
                />
              ))}
            </List>
          )}
        </Box>
      </AppPopover>

      <Dialog
        open={mindmapOpen}
        onClose={handleCloseMindmap}
        fullScreen
        PaperProps={{
          sx: {
            ...getDialogPaperSx(theme, { isMobile: true }),
            backgroundColor: theme.palette.background.paper,
            backgroundImage: theme.palette.mode === 'dark'
              ? `linear-gradient(160deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 40%)`
              : `linear-gradient(160deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, transparent 40%)`,
            [DIALOG_VIEWPORT_SUPPORT_QUERY]: { height: '100dvh', maxHeight: '100dvh', minHeight: '100dvh' },
          },
        }}
      >
        {/* Header */}
        <Box sx={{
          ...getDialogHeaderSx(),
          backgroundImage: theme.palette.mode === 'dark'
            ? `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, transparent 60%)`
            : `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.07)} 0%, transparent 60%)`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '10px',
              backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.15 : 0.1),
              flexShrink: 0,
            }}>
              <StreamOutlinedIcon sx={{ fontSize: 20, color: 'primary.main' }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                Schema Mindmap
              </Typography>
              {currentDatabase && (
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                  <CloudUploadOutlinedIcon sx={{ fontSize: 11 }} />
                  {currentDatabase}
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton
            onClick={handleCloseMindmap}
            size="small"
            aria-label="Close schema mindmap"
            sx={getCompactActionSx(theme)}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        {/* Content */}
        <DialogContent
          sx={{
            p: { xs: 1, sm: 2 },
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {schemaLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress />
            </Box>
          ) : schemaData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, mb: 1.5, flexShrink: 0 }}>
                Click on table nodes to expand/collapse columns. Use mouse to pan and scroll to zoom.
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <SchemaFlowDiagram
                  database={schemaData.database}
                  tables={schemaData.tables || []}
                  columns={schemaData.columns || {}}
                />
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Typography color="text.secondary">
                No schema data available. Connect to a database first.
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default memo(SidebarOverlays);

