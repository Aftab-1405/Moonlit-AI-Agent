// Chat Page - Main Application Interface

import {
  Box,
  Typography,
  Menu,
  MenuItem,
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
import { getScrollbarStyles, getDialogPaperSx, DIALOG_VIEWPORT_SUPPORT_QUERY } from '../styles/shared';

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
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'top', horizontal: sidebarOpen ? 'left' : 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        MenuListProps={{ sx: { py: 0 } }}
        PaperProps={{
          sx: {
            width: 240,
            borderRadius: '14px',
            border: `0.5px solid ${alpha(theme.palette.text.primary, 0.1)}`,
            backgroundColor: theme.palette.mode === 'dark'
              ? alpha(theme.palette.background.paper, 0.97)
              : alpha(theme.palette.background.paper, 0.99),
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: theme.palette.mode === 'dark'
              ? `0 2px 8px ${alpha(theme.palette.common.black, 0.32)}`
              : `0 2px 8px ${alpha(theme.palette.common.black, 0.08)}`,
            p: 0.75,
            overflow: 'hidden',
          },
        }}
      >
        {/* Email header */}
        <Box sx={{ px: 1, pt: 0.5, pb: 1 }}>
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.email}
          </Typography>
        </Box>
        <MenuItem
          onClick={handleOpenSettings}
          sx={{
            borderRadius: '8px',
            px: 1,
            py: 0.875,
            minHeight: 32,
            gap: 1,
            '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.05) },
            '&.Mui-focusVisible': { backgroundColor: alpha(theme.palette.text.primary, 0.05) },
          }}
        >
          <SettingsOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.primary' }}>Settings</Typography>
        </MenuItem>
        {/* Separator */}
        <Box sx={{ height: '0.5px', backgroundColor: alpha(theme.palette.text.primary, 0.07), my: 0.75, mx: 0.5 }} />
        <MenuItem
          onClick={handleLogout}
          sx={{
            borderRadius: '8px',
            px: 1,
            py: 0.875,
            minHeight: 32,
            gap: 1,
            '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.05) },
            '&.Mui-focusVisible': { backgroundColor: alpha(theme.palette.text.primary, 0.05) },
          }}
        >
          <LogoutOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.primary' }}>Sign out</Typography>
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
        fullScreen
        TransitionComponent={Grow}
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