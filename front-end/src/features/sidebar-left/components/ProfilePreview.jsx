import { singleLine, twoLines } from '../styles/sectionGeometry';
// UserProfileMenu — account identity, session details, and account actions.
//
// The sidebar renders account details and keyboard-accessible actions inline.
// The anchored Menu variant remains available to other shell callers.

import { Avatar, Box, ListSubheader, Menu, MenuItem, MenuList, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { memo, useEffect, useState } from 'react';
import { LogoutIcon, SettingsIcon } from '@/components/icons';
import { getProfileSettingsMode } from '@/features/sidebar-left/profileSettingsModel';
import {
  getPopoverDividerSx,
  getPopoverMenuItemSx,
  getPopoverMenuListSx,
  getPopoverPaperSx,
} from '@/styles/shared';
import SidebarSectionLayout, { SidebarSkeleton } from './SidebarSectionLayout';

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

const ProfileDetail = ({ label, value, spacious = false }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: spacious ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) auto',
      ...(spacious && {
        py: 1.5,
        '& + &': { borderTop: '1px solid', borderColor: 'border.separator' },
      }),
      alignItems: 'baseline',
      gap: 1,
    }}
  >
    <Typography sx={(theme) => ({ ...theme.typography.uiCaptionXs, color: 'text.secondary' })}>
      {label}
    </Typography>
    <Typography
      title={value || undefined}
      sx={(theme) => ({
        ...theme.typography.uiCaptionSm,
        color: 'text.primary',
        textAlign: spacious ? 'left' : 'right',
        ...(spacious && { fontSize: 14, height: 20, ...singleLine }),
        overflowWrap: 'anywhere',
      })}
    >
      {value || 'Not available'}
    </Typography>
  </Box>
);

function ProfileAvatar({ user, inline, theme }) {
  const [state, setState] = useState(user?.photoURL ? 'loading' : 'ready');
  useEffect(() => {
    if (!user?.photoURL) return;
    const image = new Image();
    image.onload = () => setState('ready');
    image.onerror = () => setState('error');
    image.src = user.photoURL;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [user?.photoURL]);
  const size = inline ? 64 : 40;
  return (
    <Box sx={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <Avatar
        src={state === 'ready' ? user?.photoURL || undefined : undefined}
        slotProps={{ img: { onLoad: () => setState('ready'), onError: () => setState('error') } }}
        sx={{
          width: size,
          height: size,
          fontSize: inline ? 20 : 12,
          color: 'info.main',
          bgcolor: alpha(theme.palette.info.main, 0.12),
        }}
      >
        {getInitials(user?.displayName) || 'M'}
      </Avatar>
      {inline && state === 'loading' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'background.elevated1',
            borderRadius: '50%',
          }}
        >
          <SidebarSkeleton width={size} height={size} circular />
        </Box>
      )}
    </Box>
  );
}

const UserProfileMenu = memo(function UserProfileMenu({
  inline = false,
  anchorEl,
  open,
  onClose,
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: inline ? 2 : 1.25,
          px: inline ? 2 : 1.5,
          py: inline ? 3 : 1.25,
          ...(inline && {
            flexDirection: 'column',
            textAlign: 'center',
            borderRadius: '16px',
            bgcolor: 'background.elevated1',
            border: '1px solid',
            borderColor: 'border.separator',
          }),
        }}
      >
        <ProfileAvatar
          key={user?.photoURL || 'initials'}
          user={user}
          inline={inline}
          theme={theme}
        />
        <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
          <Typography
            title={user?.displayName || undefined}
            sx={{
              ...theme.typography.uiBodySm,
              ...(inline && { fontSize: 17, fontWeight: 500, mb: 0.75 }),
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: inline ? 'normal' : 'nowrap',
              ...(inline && { ...twoLines }),
            }}
          >
            {user?.displayName || 'Profile'}
          </Typography>
          {(inline || user?.email) && (
            <Typography
              title={user?.email || undefined}
              sx={{
                ...theme.typography.uiCaptionXs,
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: inline ? 'normal' : 'nowrap',
                ...(inline && { ...twoLines }),
              }}
            >
              {user?.email || 'Not available'}
            </Typography>
          )}
        </Box>
      </Box>

      {(inline ||
        providers ||
        typeof user?.emailVerified === 'boolean' ||
        createdAt ||
        lastSignInAt) && (
        <Box
          aria-label="Account information"
          sx={{
            display: 'grid',
            gap: inline ? 0 : 0.75,
            px: 1.5,
            pb: 1.25,
            ...(inline && {
              mt: 2,
              border: '1px solid',
              borderColor: 'border.separator',
              borderRadius: '16px',
            }),
          }}
        >
          {(inline || providers) && (
            <ProfileDetail spacious={inline} label="Signed in with" value={providers} />
          )}
          {(inline || typeof user?.emailVerified === 'boolean') && (
            <ProfileDetail
              spacious={inline}
              label="Email status"
              value={
                typeof user?.emailVerified !== 'boolean'
                  ? null
                  : user.emailVerified
                    ? 'Verified'
                    : 'Not verified'
              }
            />
          )}
          {(inline || createdAt) && (
            <ProfileDetail spacious={inline} label="Member since" value={createdAt} />
          )}
          {(inline || lastSignInAt) && (
            <ProfileDetail spacious={inline} label="Last sign-in" value={lastSignInAt} />
          )}
        </Box>
      )}

      {!inline && <Box aria-hidden sx={getPopoverDividerSx(theme)} />}
    </>
  );
  const actions = (
    <>
      {(inline || showPopoverSettings) && (
        <MenuItem
          onClick={onOpenSettings}
          data-ui-target="settings_button"
          sx={{
            ...getPopoverMenuItemSx(theme),
            ...(inline && { minHeight: 44, borderRadius: '12px' }),
          }}
        >
          <SettingsIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
          <Typography sx={{ ...theme.typography.uiNavItem, color: 'text.primary' }}>
            Settings
          </Typography>
        </MenuItem>
      )}
      <MenuItem
        onClick={onLogout}
        sx={{
          ...getPopoverMenuItemSx(theme),
          ...(inline && { minHeight: 44, borderRadius: '12px' }),
        }}
      >
        <LogoutIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
        <Typography sx={{ ...theme.typography.uiNavItem, color: 'text.primary' }}>
          Sign out
        </Typography>
      </MenuItem>
    </>
  );
  if (inline)
    return (
      <SidebarSectionLayout
        footer={
          <MenuList aria-label="Account actions" sx={{ p: 0 }}>
            {actions.props.children}
          </MenuList>
        }
      >
        {identity}
      </SidebarSectionLayout>
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
