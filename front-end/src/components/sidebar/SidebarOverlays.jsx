import { memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Divider,
  Popover,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  CircularProgress,
} from '@mui/material';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { HistoryPopoverItem } from './SidebarPrimitives';
import SchemaFlowDiagram from '../SchemaFlowDiagram';

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
      <Popover
        open={isPopoverOpen}
        anchorEl={dbPopoverAnchor}
        onClose={handleCloseDbPopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { mt: 1, minWidth: 200, maxHeight: 300, overflow: 'auto' } }}
      >
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="overline" color={theme.palette.text.secondary}>
            Switch Database
          </Typography>
        </Box>
        <List dense sx={{ p: 0.5 }}>
          {availableDatabases.map((db) => (
            <ListItemButton
              key={db}
              selected={db === currentDatabase}
              onClick={() => handleDatabaseSelect(db)}
              sx={{ borderRadius: 1, py: 0.75, minHeight: { xs: 40, sm: 34 } }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {db === currentDatabase ? (
                  <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.success.main }} />
                ) : (
                  <StorageOutlinedIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
                )}
              </ListItemIcon>
              <ListItemText primary={db} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <ListItemButton
            onClick={handleOpenNewConnection}
            sx={{ borderRadius: 1, py: 0.75, minHeight: { xs: 40, sm: 34 } }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <AddCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.text.primary }} />
            </ListItemIcon>
            <ListItemText
              primary="New Connection"
              primaryTypographyProps={{ variant: 'body2', color: theme.palette.text.primary }}
            />
          </ListItemButton>
        </List>
      </Popover>

      <Popover
        open={isHistoryPopoverOpen}
        anchorEl={historyPopoverAnchor}
        onClose={handleCloseHistoryPopover}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        PaperProps={{ sx: { ml: 1, minWidth: 240, maxWidth: 320, maxHeight: 400, overflow: 'auto' } }}
      >
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="overline" color="text.secondary">
            Conversation History
          </Typography>
        </Box>
        <List dense sx={{ p: 0.5 }}>
          {conversations.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                No conversations yet
              </Typography>
            </Box>
          ) : (
            conversations.map((conv) => (
              <HistoryPopoverItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === currentConversationId}
                onSelect={onSelectConversation}
                onDelete={onDeleteConversation}
                onClosePopover={handleCloseHistoryPopover}
                theme={theme}
              />
            ))
          )}
        </List>
      </Popover>

      <Dialog
        open={mindmapOpen}
        onClose={handleCloseMindmap}
        maxWidth="lg"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            margin: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: 'calc(100% - 32px)' },
            height: { xs: '100%', sm: '80vh' },
            maxHeight: { xs: '100%', sm: 700 },
            borderRadius: { xs: 0, sm: 2 },
          },
        }}
        PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AccountTreeOutlinedIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>
              Schema Mindmap
            </Typography>
            {currentDatabase && (
              <Chip
                size="small"
                icon={<StorageOutlinedIcon sx={{ fontSize: 14 }} />}
                label={currentDatabase}
                sx={{ ml: 1, display: { xs: 'none', sm: 'flex' } }}
              />
            )}
          </Box>
          <IconButton size="small" onClick={handleCloseMindmap} aria-label="Close schema mindmap" sx={{ color: theme.palette.text.secondary }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
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
              <Typography color={theme.palette.text.secondary}>
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

