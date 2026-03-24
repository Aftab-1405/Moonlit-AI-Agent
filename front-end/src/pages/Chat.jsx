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
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Sidebar from '../components/Sidebar';
import ChatInput from '../components/ChatInput';
import MessageList from '../components/MessageList';
import DatabaseModal from '../components/DatabaseModal';
import SQLResultsTable from '../components/SQLResultsTable';
import SettingsModal from '../components/SettingsModal';
import ConfirmDialog from '../components/ConfirmDialog';
import StarfieldCanvas from '../components/StarfieldCanvas';
import SQLEditorCanvas from '../components/SQLEditorCanvas';
import ResizeHandle from '../components/ResizeHandle';
import LlmSelectorBar from '../components/LlmSelectorBar';
import WelcomeScreen from '../components/WelcomeScreen';
import { useChatPageController } from '../hooks';

import { BACKDROP_FILTER_FALLBACK_QUERY } from '../styles/mediaQueries';
import { getScrollbarStyles } from '../styles/shared';

function Chat() {
  const {
    theme,
    isNarrowLayout,
    starfieldActive,
    idleAnimationIntensity,
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
    providerSelectValue,
    modelSelectValue,
    handleProviderChange,
    handleModelChange,
    llmOptionsLoading,
    providerOptions,
    modelOptions,
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
  } = useChatPageController();

  return (
    <Box sx={{
      display: 'flex',
      height: '100dvh',
      '@supports not (height: 100dvh)': {
        height: '100vh',
      },
      bgcolor: 'background.default',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <StarfieldCanvas active={starfieldActive} intensity={idleAnimationIntensity} />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at top right, ${alpha(theme.palette.info.main, 0.04)} 0%, transparent 50%)`,
        }}
      />
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
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          mt: 0,
          height: { xs: '100svh', md: '100vh' },
          '@supports not (height: 100svh)': {
            height: { xs: '100vh', md: '100vh' },
          },
          overflow: 'hidden',
          backgroundColor: starfieldActive
            ? alpha(theme.palette.background.default, 0.58)
            : theme.palette.glassmorphism.background,
          position: 'relative',
          zIndex: 1,
          minWidth: 0,
          transition: `${theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          })}, background-color 420ms ${theme.transitions.easing.easeInOut}`,
        }}
      >
        <LlmSelectorBar
          isNarrowLayout={isNarrowLayout}
          onToggleSidebar={handleMobileDrawerOpen}
          onNewChat={handleSidebarNewChat}
          providerSelectValue={providerSelectValue}
          modelSelectValue={modelSelectValue}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          llmOptionsLoading={llmOptionsLoading}
          providerOptions={providerOptions}
          modelOptions={modelOptions}
        />

        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
                  ...getScrollbarStyles(theme),
                }}
              >
                <MessageList
                  messages={messages}
                  isLoadingConversation={isConversationLoading}
                  user={user}
                  onRunQuery={handleRunQuery}
                  onOpenSqlEditor={handleOpenSqlEditor}
                />
              </Box>

              <Box
                sx={{
                  flexShrink: 0,
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 2,
                  pb: 'max(env(safe-area-inset-bottom), 0px)',
                  background: `linear-gradient(to top, ${alpha(theme.palette.background.default, 0.94)} 70%, transparent)`,
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  [BACKDROP_FILTER_FALLBACK_QUERY]: {
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                  },
                  [theme.breakpoints.down('sm')]: {
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                  },
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
          sx={{
            display: 'flex',
            flexShrink: 0,
            height: '100vh',
          }}
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
          sx: { bgcolor: 'background.paper',
            backgroundImage: 'none',
          }
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


