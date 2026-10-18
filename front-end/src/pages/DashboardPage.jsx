import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDashboardOverview, getDashboardUsage, getQuotaStatus } from '@/api';
import { queryKeys } from '@/api/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useDatabaseConnection } from '@/contexts/DatabaseContext';
import { useTheme } from '@/contexts/ThemeContext';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import DialogShell from '@/components/common/DialogShell';
import ToastStack from '@/components/common/ToastStack';
import { useNotifications } from '@/hooks/useNotifications';
import {
  ArrowForwardIcon,
  DatabaseIcon,
} from '@/components/icons';
import {
  DASHBOARD_SECTIONS,
  normalizeDashboardSection,
} from '@/features/dashboard/dashboardModel';

const TAB_LABELS = Object.freeze({
  overview: 'Overview',
  usage: 'Usage',
  account: 'Account',
});

const numberFormatter = new Intl.NumberFormat();

const getLabelSx = (theme) => ({
  ...theme.typography.uiMonoLabel,
  color: 'text.secondary',
});

const pillTabsSx = {
  minHeight: { xs: 44, sm: 36 },
  maxWidth: '100%',
  '& .MuiTabs-flexContainer': { gap: 1 },
  '& .MuiTabs-indicator': { display: 'none' },
  '& .MuiTab-root': {
    minWidth: 0,
    minHeight: { xs: 44, sm: 36 },
    px: 2,
    py: 0.75,
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: '9999px',
    color: 'text.secondary',
    fontSize: 13,
    textTransform: 'none',
  },
  '& .MuiTab-root.Mui-selected': {
    color: 'text.primary',
    borderColor: 'text.secondary',
    bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
  },
};

const statGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
};

function Card({ children, component = 'section', sx = {}, ...props }) {
  return (
    <Box
      component={component}
      sx={{
        minWidth: 0,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '8px',
        bgcolor: 'background.paper',
        boxShadow: 'none',
        p: { xs: 2, sm: 3 },
        overflowWrap: 'anywhere',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}

function SectionHeading({ title, description, action }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="h2"
          sx={(theme) => ({
            ...theme.typography.displayXs,
            color: 'text.primary',
          })}
        >
          {title}
        </Typography>
        {description && (
          <Typography sx={(theme) => ({ ...theme.typography.bodySm, mt: 0.75, color: 'text.secondary' })}>
            {description}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0, maxWidth: '100%' }}>{action}</Box>}
    </Box>
  );
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat(undefined, options).format(date);
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function StatCard({ label, value, helper, valueColor = 'text.primary' }) {
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <Typography sx={(theme) => ({ ...getLabelSx(theme), minHeight: { xs: '1.3333em', sm: '2.6666em' } })}>{label}</Typography>
      <Typography
        sx={{
          mt: 2,
          color: valueColor,
          fontFamily: (theme) => theme.typography.fontFamilyMono,
          fontSize: 32,
          fontWeight: 400,
          lineHeight: 1.125,
          letterSpacing: '-0.6px',
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
      {helper && (
        <Typography sx={(theme) => ({ ...theme.typography.bodySm, mt: 1, color: 'text.secondary' })}>
          {helper}
        </Typography>
      )}
    </Card>
  );
}

function SectionState({ loading, error, empty, children }) {
  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 280 }}>
        <CircularProgress size={28} aria-label="Loading dashboard" />
      </Stack>
    );
  }
  if (error) {
    return (
      <Card role="alert">
        <Typography component="h2" sx={(theme) => theme.typography.displayXs}>This section could not be loaded</Typography>
        <Typography sx={(theme) => ({ ...theme.typography.bodySm, color: 'text.secondary', mt: 0.75 })}>
          {error.message || 'Please try again.'}
        </Typography>
      </Card>
    );
  }
  if (empty) {
    return (
      <Card>
        <Typography color="text.secondary">No activity has been recorded yet.</Typography>
      </Card>
    );
  }
  return children;
}

function QuotaGrid({ response }) {
  const enabled = response?.enabled;
  const quota = response?.quota || {};
  return (
    <Box>
      <SectionHeading
        title="Current quota"
        description="Live request allowance for your authenticated Moonlit session."
      />
      {!enabled ? (
        <Card sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Quota enforcement is not enabled for this account.
          </Typography>
        </Card>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
            gap: 2,
            mt: 2,
          }}
        >
          {['minute', 'hour', 'day'].map((window) => {
            const item = quota[window] || {};
            const remaining = Math.max(0, Number(item.limit || 0) - Number(item.used || 0));
            return (
              <StatCard
                key={window}
                label={`${window[0].toUpperCase()}${window.slice(1)} remaining`}
                value={formatNumber(remaining)}
                valueColor={remaining === 0 ? 'error.main' : remaining < Number(item.limit) * 0.2 ? 'warning.main' : 'text.primary'}
                helper={`Resets in ${formatNumber(item.resets_in)}s`}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function OverviewTab({ overviewQuery, quotaQuery, connection, settings, onOpenChat }) {
  const data = overviewQuery.data?.data;
  return (
    <SectionState loading={overviewQuery.isLoading} error={overviewQuery.error}>
      <Stack spacing={{ xs: 3, sm: 4 }} useFlexGap>
        <Box sx={statGridSx}>
          <StatCard label="Conversations" value={formatNumber(data?.conversation_count)} />
          <StatCard label="Cached databases" value={formatNumber(data?.cached_database_count)} />
          <StatCard label="Cached tables" value={formatNumber(data?.cached_table_count)} />
          <StatCard label="Saved recent queries" value={formatNumber(data?.saved_recent_query_count)} />
        </Box>

        <Card>
          <Typography sx={getLabelSx}>Active workspace</Typography>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
            mt: 3,
            gap: { xs: 2, md: 3 },
            '& > *': { minWidth: 0 },
            '& > * + *': {
              borderStyle: 'solid',
              borderWidth: 0,
              borderTopWidth: { xs: 1, md: 0 },
              borderLeftWidth: { xs: 0, md: 1 },
              borderColor: 'divider',
              pt: { xs: 2, md: 0 },
              pl: { xs: 0, md: 3 },
            },
          }}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <DatabaseIcon sx={{ fontSize: 18, color: connection.isConnected ? 'success.main' : 'text.disabled' }} />
                <Typography sx={(theme) => theme.typography.bodySm}>Database connection</Typography>
              </Stack>
              <Typography sx={{ mt: 1, fontFamily: (theme) => theme.typography.fontFamilyMono }}>
                {connection.isConnected ? connection.currentDatabase || 'Connected' : 'Not connected'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {[connection.dbType, connection.currentSchema].filter(Boolean).join(' · ') || 'Open chat to connect a database'}
              </Typography>
            </Box>
            <Box>
              <Typography sx={(theme) => theme.typography.bodySm}>Current preferences</Typography>
              <Typography sx={{ mt: 1, fontFamily: (theme) => theme.typography.fontFamilyMono }}>{settings.model || 'Default model'}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {[settings.responseStyle, settings.taskMode].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Box>
              <Typography sx={(theme) => theme.typography.bodySm}>Last Moonlit activity</Typography>
              <Typography sx={{ mt: 1, fontFamily: (theme) => theme.typography.fontFamilyMono }}>
                {formatDate(data?.last_activity_at, { dateStyle: 'medium', timeStyle: 'short' })}
              </Typography>
            </Box>
          </Box>
        </Card>

        <Box>
          <SectionHeading
            title="Recent conversations"
            action={<Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={onOpenChat}>New chat</Button>}
          />
          <Card sx={{ mt: 2, p: 0 }}>
            {(data?.recent_conversations || []).length === 0 ? (
              <Typography color="text.secondary" sx={{ p: { xs: 2, sm: 3 } }}>No conversations yet. Start your first chat with Moonlit.</Typography>
            ) : (
              data.recent_conversations.map((conversation) => (
                <Box
                  key={conversation.id}
                  sx={{
                    px: { xs: 2, sm: 3 }, py: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
                    '& + &': { borderTop: '1px solid', borderColor: 'divider' },
                    '&:hover, &:focus-within': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap title={conversation.title || 'Untitled conversation'}>{conversation.title || 'Untitled conversation'}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {formatDate(conversation.updated_at, { dateStyle: 'medium' })}
                    </Typography>
                  </Box>
                  <Button variant="outlined" size="small" sx={{ flexShrink: 0, minHeight: { xs: 44, sm: 32 } }} onClick={() => onOpenChat(conversation.id)}>Continue</Button>
                </Box>
              ))
            )}
          </Card>
        </Box>

        <SectionState loading={quotaQuery.isLoading} error={quotaQuery.error}>
          <QuotaGrid response={quotaQuery.data} />
        </SectionState>
      </Stack>
    </SectionState>
  );
}

function UsageTab({ usageQuery, quotaQuery, days, onDaysChange }) {
  const data = usageQuery.data?.data;
  const totals = data?.totals || {};
  const successRate = totals.sql_executions
    ? `${Math.round((Number(totals.sql_successes || 0) / Number(totals.sql_executions)) * 100)}%`
    : '—';
  const daily = data?.daily || [];
  const hasDailyTokenUsage = daily.some((item) => Number(item.total_tokens) > 0);
  const maxDailyTokens = Math.max(1, ...daily.map((item) => Number(item.total_tokens) || 0));

  return (
    <Stack spacing={{ xs: 3, sm: 4 }} useFlexGap>
      <SectionHeading
        title="Usage analytics"
        description={data?.tracking_started_at
          ? `Tracking since ${formatDate(data.tracking_started_at)}`
          : 'Tracking begins with your first recorded activity.'}
        action={(
          <Tabs
            value={days}
            onChange={(_event, value) => onDaysChange(value)}
            aria-label="Usage range"
            sx={pillTabsSx}
          >
            {[7, 30, 90].map((range) => <Tab key={range} value={range} label={`${range} days`} />)}
          </Tabs>
        )}
      />

      <SectionState loading={usageQuery.isLoading} error={usageQuery.error}>
        <Box sx={statGridSx}>
          <StatCard label="AI requests" value={formatNumber(totals.ai_requests)} />
          <StatCard label="Total tokens" value={formatNumber(totals.total_tokens)} valueColor="info.main" helper={`${formatNumber(totals.input_tokens)} in · ${formatNumber(totals.output_tokens)} out`} />
          <StatCard label="SQL executions" value={formatNumber(totals.sql_executions)} helper={`${formatNumber(totals.sql_failures)} failed`} />
          <StatCard label="SQL success rate" value={successRate} valueColor={!totals.sql_executions ? 'text.secondary' : Number(totals.sql_failures) > 0 ? 'warning.main' : 'success.main'} helper={`${formatNumber(totals.rows_returned)} rows returned`} />
        </Box>

        <Card>
          <Typography sx={getLabelSx}>Daily token trend</Typography>
          {!hasDailyTokenUsage ? (
            <Typography color="text.secondary" sx={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', mt: 3 }}>No daily usage has been recorded in this range.</Typography>
          ) : (
            <Box role="img" aria-label="Daily total tokens" sx={{ display: 'flex', alignItems: 'end', gap: { xs: 0.125, sm: 0.5 }, minHeight: 160, mt: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
              {daily.map((item) => (
                <Box
                  key={item.date}
                  title={`${item.date}: ${formatNumber(item.total_tokens)} tokens`}
                  sx={{ flex: 1, minWidth: 0, height: `${Math.max(3, (Number(item.total_tokens || 0) / maxDailyTokens) * 148)}px`, bgcolor: 'info.main', opacity: 0.82, borderRadius: '3px 3px 0 0' }}
                />
              ))}
            </Box>
          )}
        </Card>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <Card>
            <Typography sx={getLabelSx}>Models</Typography>
            <Stack sx={{ mt: 2 }}>
              {(data?.models || []).length === 0 ? <Typography color="text.secondary">No model usage yet.</Typography> : data.models.map((item) => (
                <Stack key={`${item.provider}:${item.model}`} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ py: 1.5, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
                  <Typography sx={{ minWidth: 0 }}>{item.model}</Typography>
                  <Typography sx={{ flexShrink: 0, color: 'text.secondary', fontFamily: (theme) => theme.typography.fontFamilyMono, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(item.requests)} requests</Typography>
                </Stack>
              ))}
            </Stack>
          </Card>
          <Card>
            <Typography sx={getLabelSx}>Task modes</Typography>
            <Stack sx={{ mt: 2 }}>
              {(data?.task_modes || []).length === 0 ? <Typography color="text.secondary">No task-mode usage yet.</Typography> : data.task_modes.map((item) => (
                <Stack key={item.task_mode} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ py: 1.5, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
                  <Typography sx={{ minWidth: 0 }}>{item.task_mode}</Typography>
                  <Typography sx={{ flexShrink: 0, color: 'text.secondary', fontFamily: (theme) => theme.typography.fontFamilyMono, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(item.requests)} requests</Typography>
                </Stack>
              ))}
            </Stack>
          </Card>
        </Box>
      </SectionState>

      <SectionState loading={quotaQuery.isLoading} error={quotaQuery.error}>
        <QuotaGrid response={quotaQuery.data} />
      </SectionState>
    </Stack>
  );
}

function AccountTab({ user, auth, onDeleted, notify }) {
  const providerTitleId = useId();
  const [dialog, setDialog] = useState(null);
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const providerIds = user.providerIds || [];
  const hasPasswordProvider = providerIds.includes('password');
  const deleteConfirmationValue = user.email || 'DELETE';
  const deleteConfirmationLabel = user.email
    ? 'Type your email to confirm'
    : 'Type DELETE to confirm';

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setPassword('');
    setCurrentPassword('');
    setDeleteConfirmation('');
    setActionError(null);
  };

  const runAction = async (action, successMessage, { close = true } = {}) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await action();
      if (result?.redirected) return;
      notify.success(successMessage);
      if (close) closeDialog();
    } catch (error) {
      const message = error?.message || 'The account action could not be completed.';
      if (dialog) setActionError(message);
      else notify.error(message);
    } finally {
      setBusy(false);
    }
  };

  const reauthenticate = async () => {
    const providerId = hasPasswordProvider && currentPassword
      ? 'password'
      : providerIds.find((id) => id !== 'password') || providerIds[0];
    return auth.reauthenticateCurrentUser({ providerId, password: currentPassword });
  };

  const runSensitiveAction = (action, successMessage, options) =>
    runAction(async () => {
      const result = await reauthenticate();
      if (result?.redirected) return result;
      return action();
    }, successMessage, options);

  const providerLabel = (providerId) => ({
    password: 'Email and password',
    'google.com': 'Google',
    'github.com': 'GitHub',
  })[providerId] || providerId;

  return (
    <Stack spacing={{ xs: 3, sm: 4 }} useFlexGap>
      <Card>
        <Typography sx={getLabelSx}>Profile</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mt: 3 }}>
          <Avatar src={user.photoURL || undefined} sx={{ width: 64, height: 64, flexShrink: 0, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', color: 'text.primary' }}>
            {!user.photoURL && (initials(user.displayName) || 'M')}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0, maxWidth: '100%' }}>
            <Typography sx={(theme) => theme.typography.displayXs}>{user.displayName || 'Moonlit user'}</Typography>
            <Stack direction="row" spacing={1} useFlexGap alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
              <Typography color="text.secondary">{user.email || 'No email available'}</Typography>
              {typeof user.emailVerified === 'boolean' && (
                <Chip size="small" variant="outlined" label={user.emailVerified ? 'Verified' : 'Not verified'} color={user.emailVerified ? 'success' : 'warning'} />
              )}
            </Stack>
          </Box>
          <Button sx={{ flexShrink: 0 }} variant="outlined" disabled={busy} onClick={() => setDialog('name')}>Edit display name</Button>
        </Stack>
      </Card>

      <Card>
        <SectionHeading title="Account details" />
        <Box component="dl" sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(160px, .35fr) minmax(0, 1fr)' },
          alignItems: 'baseline',
          columnGap: 3,
          rowGap: { xs: 1, sm: 2 },
          m: 0,
          mt: 3,
          '& dt:not(:first-of-type)': { mt: { xs: 1, sm: 0 } },
        }}>
          <Typography component="dt" sx={getLabelSx}>Member since</Typography>
          <Typography component="dd" sx={{ m: 0, fontFamily: (theme) => theme.typography.fontFamilyMono }}>{formatDate(user.createdAt)}</Typography>
          <Typography component="dt" sx={getLabelSx}>Last sign-in</Typography>
          <Typography component="dd" sx={{ m: 0, fontFamily: (theme) => theme.typography.fontFamilyMono }}>{formatDate(user.lastSignInAt, { dateStyle: 'medium', timeStyle: 'short' })}</Typography>
          <Typography component="dt" sx={getLabelSx}>Sign-in methods</Typography>
          <Typography component="dd" sx={{ m: 0, fontFamily: (theme) => theme.typography.fontFamilyMono }}>{user.providers?.join(', ') || 'Not available'}</Typography>
        </Box>
      </Card>

      <Card>
        <SectionHeading title="Sign-in and security" />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 3 }}>
          <Button variant="outlined" disabled={busy} onClick={() => setDialog('email')}>Change email</Button>
          <Button variant="outlined" disabled={busy} onClick={() => setDialog('password')}>Set or change password</Button>
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => runAction(auth.sendCurrentUserPasswordReset, 'Password-reset email sent.', { close: false })}
          >
            Send password reset
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => setDialog('providers')}>Manage sign-in methods</Button>
        </Stack>
      </Card>

      <Card sx={{ borderColor: 'error.dark', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 3 }}>
        <Box sx={{ minWidth: 0, maxWidth: '70ch' }}>
          <Typography component="h2" sx={(theme) => ({ ...theme.typography.displayXs, color: 'error.main' })}>Delete Moonlit account</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Permanently erase Moonlit account data. Connected external databases are never modified; pseudonymized security records are retained.
          </Typography>
        </Box>
        <Button color="error" variant="outlined" disabled={busy} sx={{ flexShrink: 0 }} onClick={() => setDialog('delete')}>Delete account</Button>
      </Card>

      <ConfirmDialog
        open={dialog === 'name'}
        onClose={closeDialog}
        title="Edit display name"
        description="Choose how your name appears in Moonlit."
        confirmText="Save name"
        loadingText="Saving"
        loading={busy}
        disabled={!displayName.trim()}
        onConfirm={() => runAction(() => auth.updateDisplayName(displayName), 'Display name updated.')}
        contentSx={{ pb: 3 }}
      >
        <TextField
          autoFocus
          fullWidth
          label="Display name"
          value={displayName}
          disabled={busy}
          onChange={(event) => setDisplayName(event.target.value)}
          inputProps={{ maxLength: 80 }}
        />
        {actionError && <Alert severity="error">{actionError}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'email'}
        onClose={closeDialog}
        title="Change email"
        description="We'll send a verification link to your new address before updating your account."
        intent="info"
        showIcon
        confirmColor="primary"
        confirmText="Send verification"
        loadingText="Sending"
        loading={busy}
        disabled={!email.trim() || (hasPasswordProvider && !currentPassword)}
        onConfirm={() => runSensitiveAction(() => auth.requestEmailChange(email), 'Verification email sent.')}
        contentSx={{ pb: 3 }}
      >
        <TextField autoFocus fullWidth type="email" label="New email" value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
        {hasPasswordProvider && (
          <TextField fullWidth type="password" label="Current password" autoComplete="current-password" value={currentPassword} disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} />
        )}
        {actionError && <Alert severity="error">{actionError}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'password'}
        onClose={closeDialog}
        title={hasPasswordProvider ? 'Change password' : 'Set a password'}
        description={hasPasswordProvider ? 'Use a strong, unique password to protect your account.' : 'Add email and password as another way to sign in to Moonlit.'}
        confirmText={hasPasswordProvider ? 'Change password' : 'Set password'}
        loadingText="Saving"
        loading={busy}
        disabled={!password || (hasPasswordProvider && !currentPassword)}
        onConfirm={() => runSensitiveAction(
          () => hasPasswordProvider
            ? auth.changePassword(password)
            : auth.linkAuthProvider('password', { email: user.email, password }),
          hasPasswordProvider ? 'Password changed.' : 'Email sign-in added.',
        )}
        contentSx={{ pb: 3 }}
      >
        {hasPasswordProvider && (
          <TextField autoFocus fullWidth type="password" label="Current password" autoComplete="current-password" value={currentPassword} disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} />
        )}
        <TextField autoFocus={!hasPasswordProvider} fullWidth type="password" label="New password" autoComplete="new-password" value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
        {actionError && <Alert severity="error">{actionError}</Alert>}
      </ConfirmDialog>

      <DialogShell
        open={dialog === 'providers'}
        onClose={closeDialog}
        maxWidth="sm"
        desktopMinHeight={0}
        headerTitle="Manage sign-in methods"
        headerTitleId={providerTitleId}
        ariaLabelledBy={providerTitleId}
        showCloseButton={!busy}
        paperSx={{ height: 'auto' }}
        bodySx={{ display: 'block', overflowY: 'auto', p: { xs: 2, sm: 3 } }}
        footer={<Button variant="outlined" onClick={closeDialog} disabled={busy}>Done</Button>}
        footerSx={{ justifyContent: 'flex-end' }}
      >
        <Stack spacing={1.5}>
          {['google.com', 'github.com', 'password'].map((providerId) => {
            const linked = providerIds.includes(providerId);
            return (
              <Card key={providerId} sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography>{providerLabel(providerId)}</Typography>
                  <Typography variant="caption" color={linked ? 'success.main' : 'text.secondary'}>{linked ? 'Linked' : 'Not linked'}</Typography>
                </Box>
                {linked ? (
                  <Button
                    color="error"
                    disabled={busy || providerIds.length <= 1}
                    sx={{ flexShrink: 0 }}
                    onClick={() => runAction(() => auth.unlinkAuthProvider(providerId), `${providerLabel(providerId)} removed.`, { close: false })}
                  >
                    Unlink
                  </Button>
                ) : providerId === 'password' ? (
                  <Button disabled={busy} sx={{ flexShrink: 0 }} onClick={() => { setDialog('password'); setActionError(null); }}>Set password</Button>
                ) : (
                  <Button disabled={busy} sx={{ flexShrink: 0 }} onClick={() => runAction(() => auth.linkAuthProvider(providerId), `${providerLabel(providerId)} linked.`, { close: false })}>Link</Button>
                )}
              </Card>
            );
          })}
          {providerIds.length <= 1 && <Typography variant="body2" color="text.secondary">Add another sign-in method before unlinking this one.</Typography>}
          {actionError && <Alert severity="error">{actionError}</Alert>}
        </Stack>
      </DialogShell>

      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={closeDialog}
        title="Delete account permanently?"
        description="This erases your Moonlit conversations, context, settings, usage, and account. External databases are not modified. Pseudonymized security records remain."
        intent="danger"
        showIcon
        confirmText="Permanently delete"
        loadingText="Deleting"
        loading={busy}
        disabled={deleteConfirmation !== deleteConfirmationValue || (hasPasswordProvider && !currentPassword)}
        onConfirm={() => runSensitiveAction(async () => {
          await auth.deleteCurrentAccount();
          onDeleted();
        }, 'Account deleted.')}
        contentSx={{ pb: 3 }}
      >
        <TextField
          autoFocus
          fullWidth
          label={deleteConfirmationLabel}
          value={deleteConfirmation}
          disabled={busy}
          onChange={(event) => setDeleteConfirmation(event.target.value)}
        />
        {hasPasswordProvider && (
          <TextField fullWidth type="password" label="Current password" autoComplete="current-password" value={currentPassword} disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} />
        )}
        {actionError && <Alert severity="error">{actionError}</Alert>}
      </ConfirmDialog>
    </Stack>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const { section: routeSection } = useParams();
  const section = normalizeDashboardSection(routeSection);
  const { user, ...authActions } = useAuth();
  const connection = useDatabaseConnection();
  const { settings } = useTheme();
  const [usageDays, setUsageDays] = useState(30);
  const notifications = useNotifications();
  const isNarrowLayout = useMediaQuery((theme) => theme.breakpoints.down('sm'));

  useEffect(() => {
    if (routeSection !== section) navigate(`/dashboard/${section}`, { replace: true });
  }, [navigate, routeSection, section]);

  const overviewQuery = useQuery({
    queryKey: queryKeys.dashboardOverview(user?.uid),
    queryFn: getDashboardOverview,
    enabled: Boolean(user?.uid) && section === 'overview',
  });
  const usageQuery = useQuery({
    queryKey: queryKeys.dashboardUsage(user?.uid, usageDays),
    queryFn: () => getDashboardUsage(usageDays),
    enabled: Boolean(user?.uid) && section === 'usage',
  });
  const quotaQuery = useQuery({
    queryKey: queryKeys.userQuota(user?.uid),
    queryFn: getQuotaStatus,
    enabled: Boolean(user?.uid) && (section === 'overview' || section === 'usage'),
    refetchInterval: 30_000,
  });

  const firstName = useMemo(() => user?.displayName?.trim().split(/\s+/)[0] || 'there', [user?.displayName]);
  const openChat = (conversationId) => navigate(conversationId ? `/chat/${conversationId}` : '/chat');

  return (
    <Box sx={{ height: '100%', minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable', bgcolor: 'background.default' }}>
      <Container
        maxWidth="lg"
        sx={{ minHeight: '100%', py: { xs: 3, sm: 4, lg: 6 }, px: { xs: 2, sm: 3 } }}
      >
        <Box
          component="header"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' },
            gap: 3,
            alignItems: 'center',
            pb: 3,
            mb: { xs: 3, sm: 4 },
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <Typography sx={getLabelSx}>Moonlit account</Typography>
            <Typography
              component="h1"
              sx={(theme) => ({
                ...theme.typography.displaySm,
                mt: 1,
                color: 'text.primary',
              })}
            >
              Welcome back, {firstName}
            </Typography>
            <Typography sx={(theme) => ({ ...theme.typography.bodySm, mt: 1, color: 'text.secondary' })}>
              {user?.email}{user?.emailVerified ? ' · Verified email' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: { sm: 'flex-end' } }}>
            <Button variant="outlined" onClick={() => openChat()} endIcon={<ArrowForwardIcon />}>
              Open chat
            </Button>
          </Box>
          <Box sx={{ gridColumn: '1 / -1', minWidth: 0, mt: { sm: 1 } }}>
            <Tabs
              value={section}
              onChange={(_event, value) => navigate(`/dashboard/${value}`)}
              aria-label="Dashboard sections"
              variant="scrollable"
              scrollButtons={false}
              sx={pillTabsSx}
            >
              {DASHBOARD_SECTIONS.map((value) => (
                <Tab key={value} value={value} label={TAB_LABELS[value]} />
              ))}
            </Tabs>
          </Box>
        </Box>

        <Box component="main">
          {section === 'overview' && (
            <OverviewTab overviewQuery={overviewQuery} quotaQuery={quotaQuery} connection={connection} settings={settings} onOpenChat={openChat} />
          )}
          {section === 'usage' && <UsageTab usageQuery={usageQuery} quotaQuery={quotaQuery} days={usageDays} onDaysChange={setUsageDays} />}
          {section === 'account' && <AccountTab user={user || {}} auth={authActions} notify={notifications} onDeleted={() => navigate('/')} />}
        </Box>
      </Container>
      <ToastStack notifications={notifications.notifications} removeToast={notifications.removeToast} isNarrowLayout={isNarrowLayout} />
    </Box>
  );
}

export default DashboardPage;
