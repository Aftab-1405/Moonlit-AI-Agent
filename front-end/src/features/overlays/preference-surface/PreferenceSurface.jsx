import { Box, Button, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  getPreferenceSectionSurfaceSx,
  PREFERENCE_LAYOUT,
} from '@/features/overlays/preference-surface/preferenceSurfaceStyles';
import { getInteractionColors, getScrollbarStyles } from '@/styles/shared';

export function PreferencePageHeader({ title, onClose, headingRef }) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: { xs: 'center', md: 'flex-end' },
        justifyContent: 'space-between',
        height: { xs: 'auto', md: PREFERENCE_LAYOUT.headerHeight },
        px: { xs: 2.5, sm: 5, md: 8, lg: 10 },
        pt: { xs: 3, md: 0 },
        pb: { xs: 2, md: 0 },
        maxWidth: PREFERENCE_LAYOUT.pageMaxWidth,
        mx: 'auto',
        width: '100%',
      }}
    >
      <Typography
        ref={headingRef}
        component="h1"
        tabIndex={-1}
        sx={{
          typography: { xs: 'h4', md: 'h3' },
          color: 'text.primary',
          fontWeight: 400,
          letterSpacing: 0,
          pb: { xs: 0, md: 2 },
          mb: { md: 0.5 },
        }}
      >
        {title}
      </Typography>
      <Button onClick={onClose} variant="outlined" sx={{ mb: { xs: 0, md: 1.5 } }}>
        Close
      </Button>
    </Box>
  );
}

export function PreferenceLayout({ sidebar, children }) {
  return (
    <Box
      component="main"
      sx={{
        width: '100%',
        maxWidth: PREFERENCE_LAYOUT.pageMaxWidth,
        mx: 'auto',
        px: { xs: 2.5, sm: 5, md: 8, lg: 10 },
        pt: { xs: 3, md: 4 },
        pb: { xs: 6, md: 8 },
      }}
    >
      <Box
        sx={{
          display: { xs: 'block', md: 'grid' },
          gridTemplateColumns: `${PREFERENCE_LAYOUT.navWidth}px minmax(0, 1fr)`,
          columnGap: { md: 7, lg: 9 },
          alignItems: 'start',
        }}
      >
        <PreferenceSidebar>{sidebar}</PreferenceSidebar>
        <Box
          tabIndex={-1}
          sx={{
            outline: 'none',
            minWidth: 0,
            maxWidth: PREFERENCE_LAYOUT.contentMaxWidth,
            mt: { xs: 0, md: 3.5 },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function PreferenceSidebar({ children }) {
  return (
    <Box
      sx={(theme) => ({
        mb: { xs: 3, md: 0 },
        overflowX: { xs: 'auto', md: 'visible' },
        overflowY: 'hidden',
        mx: { xs: -2.5, sm: -5, md: 0 },
        px: { xs: 2.5, sm: 5, md: 0 },
        ...getScrollbarStyles(theme),
      })}
    >
      <Box sx={{ position: { md: 'sticky' }, top: { md: 86 } }}>{children}</Box>
    </Box>
  );
}

export function PreferenceNavList({ ariaLabel, children, variant }) {
  return (
    <Box component="nav" aria-label={ariaLabel} sx={{ minWidth: 0 }}>
      <Box
        component="ul"
        sx={{
          display: 'flex',
          flexDirection: variant === 'settings' ? 'column' : { xs: 'row', md: 'column' },
          ...(variant === 'settings' && {
            '& button': {
              width: '100%',
              height: { xs: 44, md: 35 },
              minHeight: { xs: 44, md: 35 },
              fontSize: 14,
              lineHeight: '20px',
            },
          }),
          gap: variant === 'settings' ? '1px' : 0.5,
          m: 0,
          p: 0,
          listStyle: 'none',
          minWidth: 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function PreferenceNavItem({ active, onClick, icon, children }) {
  return (
    <Box component="li" sx={{ flexShrink: 0 }}>
      <Button
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        startIcon={icon}
        disableElevation
        sx={(theme) => {
          const interaction = getInteractionColors(theme, { active });
          return {
            height: PREFERENCE_LAYOUT.navHeight,
            minHeight: PREFERENCE_LAYOUT.navHeight,
            width: { xs: 'auto', md: '100%' },
            minWidth: 0,
            justifyContent: 'flex-start',
            gap: 1,
            px: 1.25,
            py: 0,
            borderRadius: '8px',
            border: 0,
            textTransform: 'none',
            whiteSpace: 'nowrap',
            backgroundClip: 'padding-box',
            color: active ? 'text.primary' : 'text.secondary',
            ...theme.typography.uiNavItem,
            fontWeight: 400,
            backgroundColor: active ? interaction.activeBackground : 'transparent',
            transition: theme.transitions.create(['background-color', 'color'], {
              duration: theme.transitions.duration.shorter,
            }),
            boxShadow: 'none',
            '& .MuiButton-startIcon': {
              mr: 0,
              ml: 0,
              color: active ? 'text.primary' : 'text.secondary',
              opacity: active ? 1 : 0.72,
              transition: theme.transitions.create(['color', 'opacity'], {
                duration: theme.transitions.duration.shorter,
              }),
              '& svg': {
                fontSize: 18,
              },
            },
            '&:hover': {
              backgroundColor: active
                ? interaction.activeHoverBackground
                : interaction.hoverBackground,
              color: 'text.primary',
              border: 0,
              boxShadow: 'none',
              '& .MuiButton-startIcon': {
                color: 'text.primary',
                opacity: 1,
              },
            },
            '&:focus-visible': {
              outline: `2px solid ${theme.palette.border.focus}`,
              outlineOffset: 2,
            },
            '&.Mui-disabled': {
              border: 0,
              boxShadow: 'none',
            },
          };
        }}
      >
        {children}
      </Button>
    </Box>
  );
}

export function PreferenceSection({ title, description, children, sx = {}, variant }) {
  return (
    <Box
      sx={{
        mb: variant === 'settings' ? 5 : { xs: 5, md: 6.5 },
        '&:last-of-type': { mb: 0 },
        ...sx,
      }}
    >
      <Typography
        component="h2"
        sx={(theme) => ({
          ...theme.typography.uiCardTitle,
          color: 'text.primary',
          fontWeight: 400,
          mb: description ? 0.5 : 0,
          pb: description ? 0 : { xs: 1.5, md: 2 },
          letterSpacing: 0,
          ...(variant === 'settings' && {
            fontSize: 16,
            lineHeight: '24px',
            fontWeight: 500,
            height: 52,
            display: 'flex',
            alignItems: 'center',
            pb: '6px',
          }),
        })}
      >
        {title}
      </Typography>
      {description ? (
        <Typography
          sx={(theme) => ({
            ...theme.typography.uiBodySm,
            color: 'text.secondary',
            maxWidth: 640,
            pb: { xs: 1.5, md: 2 },
          })}
        >
          {description}
        </Typography>
      ) : null}
      <Box
        sx={(theme) => ({
          ...getPreferenceSectionSurfaceSx(theme),
          mt: 0.5,
          ...(variant === 'settings' && {
            borderRadius: '16px',
            mt: 0,
            px: 0,
            py: 0,
            backgroundColor: 'transparent',
          }),
        })}
      >
        {children}
      </Box>
    </Box>
  );
}

export function PreferenceRow({
  label,
  description,
  children,
  disabled = false,
  sx = {},
  onClick = undefined,
  htmlFor,
  variant,
  id,
  tabIndex,
}) {
  const isSettings = variant === 'settings' || variant === 'appearance';
  return (
    <Box
      id={id}
      tabIndex={tabIndex}
      role="group"
      aria-label={label}
      onClick={disabled ? undefined : onClick}
      sx={(theme) => ({
        display: 'flex',
        alignItems: { xs: 'stretch', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        gap: { xs: 1.25, sm: 4 },
        opacity: disabled ? 0.48 : 1,
        transition: theme.transitions.create('opacity', {
          duration: theme.transitions.duration.shorter,
        }),
        minHeight: { sm: 62 },
        py: { xs: 1.5, sm: 1.375 },
        px: { xs: 1, sm: 1.25 },
        mx: { xs: -1, sm: -1.25 },
        mb: 0.25,
        borderRadius: '8px',
        backgroundColor: theme.palette.layer.barely,
        cursor: onClick ? 'pointer' : 'default',
        '&:nth-of-type(even)': { backgroundColor: 'transparent' },
        '&:last-of-type': { mb: 0 },
        ...(onClick
          ? {
              '&:hover': {
                backgroundColor: theme.palette.layer.subtle,
              },
            }
          : {}),
        ...(isSettings && {
          minHeight: 62,
          py: 1.5,
          px: 2,
          mx: 0,
          my: 0,
          gap: { xs: 1.5, sm: 3 },
          borderRadius: 0,
          backgroundColor: 'transparent',
          position: 'relative',
          '&:not(:last-child)::after': {
            content: '""',
            position: 'absolute',
            bottom: 0,
            left: 16,
            right: 16,
            borderBottom: '1px solid',
            borderColor: 'border.separator',
          },
        }),
        ...(variant === 'appearance' && {
          minHeight: description ? 52 : 40,
          py: description ? 0.75 : 0.5,
          px: 1.5,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          '&:not(:last-child)::after': { display: 'none' },
          '& > :last-child': {
            minWidth: 0,
            justifyContent: 'flex-end',
            '& > .MuiFormControl-root, & > .MuiToggleButtonGroup-root': { width: 'auto' },
          },
        }),
        ...sx,
      })}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'block',
        }}
      >
        <Typography
          component={htmlFor ? 'label' : 'p'}
          htmlFor={htmlFor}
          id={htmlFor ? `${htmlFor}-label` : undefined}
          sx={(theme) => ({
            ...theme.typography.uiBodySm,
            color: 'text.primary',
            ...(variant === 'appearance' && {
              color: `var(--profile-ink, ${theme.palette.text.primary})`,
            }),
            fontWeight: 400,
            ...(isSettings && {
              display: 'block',
              fontSize: 14,
              lineHeight: '20px',
              fontWeight: 500,
            }),
          })}
        >
          {label}
        </Typography>
        {description ? (
          <Typography
            id={htmlFor ? `${htmlFor}-description` : undefined}
            data-appearance-description={variant === 'appearance' ? true : undefined}
            sx={(theme) => ({
              ...theme.typography.uiBodyXs,
              ...(isSettings && { fontSize: 12, lineHeight: '16px' }),
              color: 'text.secondary',
              ...(variant === 'appearance' && {
                color: `var(--profile-secondary, ${theme.palette.text.secondary})`,
              }),
              mt: 0.25,
            })}
          >
            {description}
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          ...(isSettings && { minWidth: { sm: 'min(160px, 40%)' } }),
          justifyContent: { xs: 'stretch', sm: 'flex-end' },
          alignItems: 'center',
          '& > *': {
            maxWidth: '100%',
          },
          '& > .MuiFormControl-root, & > .MuiToggleButtonGroup-root': {
            width: { xs: '100%', sm: 'auto' },
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function PreferenceFooterActions({ children, sx = {} }) {
  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        mt: { xs: 6, md: 8 },
        pt: 2,
        borderTop: '1px solid',
        borderColor: alpha(theme.palette.text.primary, theme.palette.opacity.soft),
        ...sx,
      })}
    >
      {children}
    </Box>
  );
}
