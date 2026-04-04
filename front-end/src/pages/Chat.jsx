// Chat Page - Main Application Interface

import {
  Box,
  Typography,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  Snackbar,
  Dialog,
  Grow,
  Slide,
  Fade,
  IconButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import Sidebar from '../components/Sidebar';
import ChatInput from '../components/ChatInput';
import MessageList from '../components/MessageList';
import DatabaseModal from '../components/DatabaseModal';
import SQLResultsTable from '../components/SQLResultsTable';
import SettingsModal from '../components/SettingsModal';
import ConfirmDialog from '../components/ConfirmDialog';
import SQLEditorCanvas from '../components/SQLEditorCanvas';
import ResizeHandle from '../components/ResizeHandle';
import WelcomeScreen from '../components/WelcomeScreen';
import StarfieldCanvas from '../components/StarfieldCanvas';
import { useChatPageController } from '../hooks/chat-page/useChatPageController';
import { getScrollbarStyles } from '../styles/shared';

function Chat() {
  const {
    theme,
    isNarrowLayout,
    anchorEl,
    user,
    handleMenuClose,
    handleOpenSettings,
    handleLogout,
    commonSidebarProps,
    handleSidebarNewChat,
    handleSidebarSelectConversation,
    handleSidebarOpenDbModal,
    sidebarOpen,
    handleSidebarToggle,
    handleSidebarMenuOpen,
    mobileOpen,
    handleMobileDrawerOpen,
    handleMobileDrawerClose,
    showWelcomeState,
    setScrollContainerRef,
    showConversationPanel,
    messages,
    isConversationLoading,
    handleRunQuery,
    handleOpenSqlEditor,
    chatInputSharedProps,
    sqlEditorOpen,
    handlePanelResize,
    handleCloseSqlEditor,
    sqlEditorQuery,
    sqlEditorResults,
    sqlEditorWidth,
    isDbConnected,
    currentDatabase,
    dbModalOpen,
    handleCloseDbModal,
    handleDbConnect,
    snackbar,
    handleCloseSnackbar,
    snackbarAnchorOrigin,
    snackbarContentProps,
    queryResults,
    handleCloseQueryResults,
    settingsOpen,
    handleCloseSettings,
    confirmDialog,
    handleConfirmDialogClose,
    starfieldActive,
    idleAnimationIntensity,
  } = useChatPageController();

  return (
    <Box
      id="app-shell"
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        bgcolor: 'background.default',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{ sx: { minWidth: 180 } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2">{user?.displayName}</Typography>
          <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
        </Box>
        <Divider sx={{ borderColor: alpha(theme.palette.divider, 0.5) }} />
        <MenuItem onClick={handleOpenSettings}>
          <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutOutlinedIcon fontSize="small" /></ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
      <Sidebar
        {...commonSidebarProps}
        onNewChat={handleSidebarNewChat}
        onSelectConversation={handleSidebarSelectConversation}
        onOpenDbModal={handleSidebarOpenDbModal}
        open={sidebarOpen}
        onToggleOpen={handleSidebarToggle}
        onMenuOpen={handleSidebarMenuOpen}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileDrawerClose}
      />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Box
          component="main"
          id="main-content"
          aria-label="Chat workspace"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            mt: 0,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            backgroundColor: theme.palette.background.default,
            position: 'relative',
            zIndex: 1,
            transition: theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          }}
        >
          <StarfieldCanvas active={starfieldActive} intensity={idleAnimationIntensity} />
          <Box
            aria-hidden
            sx={{
              pointerEvents: 'none',
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              opacity: theme.palette.mode === 'dark' ? 0.22 : 0.35,
              backgroundImage: `linear-gradient(to right, ${alpha(theme.palette.divider, 0.45)} 1px, transparent 1px), linear-gradient(to bottom, ${alpha(theme.palette.divider, 0.45)} 1px, transparent 1px)`,
              backgroundSize: '32px 32px',
            }}
          />
          {isNarrowLayout && (
            <IconButton
              size="small"
              onClick={handleMobileDrawerOpen}
              aria-label="Open sidebar"
              sx={{
                position: 'absolute',
                top: 'max(env(safe-area-inset-top), 12px)',
                left: 12,
                zIndex: 3,
                width: 44,
                height: 44,
                border: '1px solid',
                borderColor: alpha(theme.palette.text.primary, 0.1),
                backgroundColor: alpha(theme.palette.background.paper, 0.96),
                boxShadow: `0 6px 18px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.18 : 0.08)}`,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.background.paper, 1),
                },
              }}
            >
              <MenuRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          )}

          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <WelcomeScreen
              visible={showWelcomeState}
              user={user}
              chatInputProps={chatInputSharedProps}
            />

            <Fade in={showConversationPanel} timeout={300} unmountOnExit>
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <Box
                  ref={setScrollContainerRef}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    px: { xs: 0, sm: 1 },
                    pt: { xs: 2, sm: 3 },
                    pb: { xs: 1, sm: 2 },
                    ...getScrollbarStyles(theme),
                  }}
                >
                  <MessageList
                    messages={messages}
                    isLoadingConversation={isConversationLoading}
                    onRunQuery={handleRunQuery}
                    onOpenSqlEditor={handleOpenSqlEditor}
                  />
                </Box>

                <Box
                  sx={{
                    flexShrink: 0,
                    zIndex: 2,
                    px: { xs: 0, sm: 1 },
                    pt: { xs: 1, sm: 1.5 },
                    pb: 'max(env(safe-area-inset-bottom), 8px)',
                    borderTop: `1px solid ${alpha(theme.palette.divider, 0.65)}`,
                    backgroundColor: alpha(theme.palette.background.default, 0.98),
                  }}
                >
                  <ChatInput
                    {...chatInputSharedProps}
                    showSuggestions={false}
                  />
                </Box>
              </Box>
            </Fade>
          </Box>
        </Box>
        {!isNarrowLayout && (
          <Box
            component="section"
            sx={{
              display: 'flex',
              flexShrink: 0,
              minHeight: 0,
              alignSelf: 'stretch',
              height: '100%',
            }}
            aria-label="SQL editor panel"
          >
            <ResizeHandle onResize={handlePanelResize} disabled={!sqlEditorOpen} />
            <SQLEditorCanvas
              onClose={handleCloseSqlEditor}
              initialQuery={sqlEditorQuery}
              initialResults={sqlEditorResults}
              isConnected={isDbConnected}
              currentDatabase={currentDatabase}
              isOpen={sqlEditorOpen}
              panelWidth={sqlEditorWidth}
            />
          </Box>
        )}
      </Box>
      {isNarrowLayout && (
        <Slide direction="up" in={sqlEditorOpen} mountOnEnter unmountOnExit>
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1300,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: 'background.default',
            }}
          >
            <SQLEditorCanvas
              onClose={handleCloseSqlEditor}
              initialQuery={sqlEditorQuery}
              initialResults={sqlEditorResults}
              isConnected={isDbConnected}
              currentDatabase={currentDatabase}
              isOpen={sqlEditorOpen}
              fullscreen
            />
          </Box>
        </Slide>
      )}
      <DatabaseModal
        open={dbModalOpen}
        onClose={handleCloseDbModal}
        onConnect={handleDbConnect}
        isConnected={isDbConnected}
        currentDatabase={currentDatabase}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={snackbarAnchorOrigin}
        message={snackbar.message}
        ContentProps={snackbarContentProps}
      />
      <Dialog
        open={Boolean(queryResults)}
        onClose={handleCloseQueryResults}
        maxWidth="xl"
        fullWidth
        fullScreen={isNarrowLayout}
        TransitionComponent={Grow}
        sx={{
          '& .MuiDialog-paper': {
            margin: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: 'calc(100% - 32px)' },
            height: { xs: '100%', sm: '85vh' },
            maxHeight: { xs: '100%', sm: '85vh' },
            borderRadius: { xs: 0, sm: 2 },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        {queryResults && <SQLResultsTable data={queryResults} onClose={handleCloseQueryResults} />}
      </Dialog>
      <SettingsModal open={settingsOpen} onClose={handleCloseSettings} />
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={handleConfirmDialogClose}
        onConfirm={confirmDialog.onConfirm}
        title="Execute Query?"
        message="You are about to execute the following SQL query:"
        sqlQuery={confirmDialog.sql}
        confirmText="Execute"
        confirmColor="success"
      />
    </Box>
  );
}

export default Chat;