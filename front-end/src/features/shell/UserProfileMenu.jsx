// UserProfileMenu — account identity, session details, and account actions.
//
// The sidebar renders account details and keyboard-accessible actions inline.
// The anchored Menu variant remains available to other shell callers.

import { Avatar, Box, Menu, MenuItem, MenuList, ListSubheader, Typography } from '@mui/material';
import { memo } from 'react';
import { HomeIcon, LogoutIcon, SettingsIcon } from '@/components/icons';
import { getProfileSettingsMode } from '@/features/sidebar-left/profileSettingsModel';
import {
  getPopoverDividerSx,
  getPopoverMenuItemSx,
  getPopoverMenuListSx,
  getPopoverPaperSx,
} from '@/styles/shared';

const formatProfileDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
};

const getInitials = (displayName) => {
  const parts = displayName?.trim().split(/\s+/).filter(Boolean) || [];
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};

const ProfileDetail = ({ label, value }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'baseline',
      gap: 1,
    }}
  >
    <Typography sx={(theme) => ({ ...theme.typography.uiCaptionXs, color: 'text.secondary' })}>
      {label}
    </Typography>
    <Typography
      sx={(theme) => ({
        ...theme.typography.uiCaptionSm,
        color: 'text.primary',
        textAlign: 'right',
        overflowWrap: 'anywhere',
      })}
    >
      {value}
    </Typography>
  </Box>
);

const UserProfileMenu = memo(function UserProfileMenu({
  inline = false,
  anchorEl,
  open,
  onClose,
  onOpenDashboard,
  onOpenSettings,
  onLogout,
  user,
  sidebarExpanded,
  theme,
}) {
  const providers = user?.providers?.join(', ');
  const createdAt = formatProfileDate(user?.createdAt);
  const lastSignInAt = formatProfileDate(user?.lastSignInAt);
  const { showPopoverSettings } = getProfileSettingsMode(sidebarExpanded);

  const identity = (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1.25 }}>
        <Avatar
          src={user?.photoURL || undefined}
          sx={{ width: 40, height: 40, fontSize: '0.75rem', fontWeight: 400 }}
        >
          {!user?.photoURL && (getInitials(user?.displayName) || 'M')}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              ...theme.typography.uiBodySm,
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.displayName || 'Profile'}
          </Typography>
          {user?.email && (
            <Typography
              sx={{
                ...theme.typography.uiCaptionXs,
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.email}
            </Typography>
          )}
        </Box>
      </Box>

      {(providers || typeof user?.emailVerified === 'boolean' || createdAt || lastSignInAt) && (
        <Box
          aria-label="Account information"
          sx={{ display: 'grid', gap: 0.75, px: 1.5, pb: 1.25 }}
        >
          {providers && <ProfileDetail label="Signed in with" value={providers} />}
          {typeof user?.emailVerified === 'boolean' && (
            <ProfileDetail
              label="Email status"
              value={user.emailVerified ? 'Verified' : 'Not verified'}
            />
          )}
          {createdAt && <ProfileDetail label="Member since" value={createdAt} />}
          {lastSignInAt && <ProfileDetail label="Last sign-in" value={lastSignInAt} />}
        </Box>
      )}

      <Box aria-hidden sx={getPopoverDividerSx(theme)} />
    </>
  );
  const actions = (
    <>
      <MenuItem onClick={onOpenDashboard} sx={{ ...getPopoverMenuItemSx(theme) }}>
        <HomeIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
        <Typography sx={{ ...theme.typography.uiNavItem, color: 'text.primary' }}>
          Dashboard
        </Typography>
      </MenuItem>
      {(inline || showPopoverSettings) && (
        <MenuItem
          onClick={onOpenSettings}
          data-ui-target="settings_button"
          sx={{ ...getPopoverMenuItemSx(theme) }}
        >
          <SettingsIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
          <Typography sx={{ ...theme.typography.uiNavItem, color: 'text.primary' }}>
            Settings
          </Typography>
        </MenuItem>
      )}
      <MenuItem onClick={onLogout} sx={{ ...getPopoverMenuItemSx(theme) }}>
        <LogoutIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
        <Typography sx={{ ...theme.typography.uiNavItem, color: 'text.primary' }}>
          Sign out
        </Typography>
      </MenuItem>
    </>
  );
  if (inline)
    return (
      <>
        {identity}
        <MenuList aria-label="Account actions" sx={{ p: 0 }}>
          {actions.props.children}
        </MenuList>
      </>
    );
  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: sidebarExpanded ? 'left' : 'right' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      MenuListProps={{ sx: getPopoverMenuListSx() }}
      PaperProps={{ sx: { ...getPopoverPaperSx(theme), width: 288, p: 0, overflow: 'hidden' } }}
    >
      <ListSubheader
        component="div"
        disableSticky
        sx={{ p: 0, bgcolor: 'transparent', lineHeight: 'inherit' }}
      >
        {identity}
      </ListSubheader>
      {actions.props.children}
    </Menu>
  );
});

export default UserProfileMenu;
