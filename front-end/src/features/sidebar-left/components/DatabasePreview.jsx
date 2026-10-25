import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useState } from 'react';
import { CheckIcon, DatabaseIcon } from '@/components/icons';
import { DB_TYPES } from '@/config/databases';
import { sidebarCard, singleLine, twoLines } from '../styles/sectionGeometry';
import SidebarSectionLayout, { LoadingStatus, SidebarSkeleton } from './SidebarSectionLayout';

export default function DatabasePreview({
  databaseStatus = 'ready',
  onRetryDatabaseStatus,
  isConnected,
  currentDatabase,
  dbType,
  currentSchema,
  availableDatabases = [],
  isStreaming = false,
  isDatabaseBusy = false,
  onDatabaseSwitch,
  onOpenDatabase,
}) {
  const loading = databaseStatus === 'loading';
  const unavailable = databaseStatus === 'error' && !isConnected;
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const locked = isStreaming || isDatabaseBusy || Boolean(pending);
  const engine =
    DB_TYPES.find(({ value }) => value === dbType?.toLowerCase())?.label || dbType || 'Database';
  const databases = [
    ...new Set([...availableDatabases, ...(currentDatabase ? [currentDatabase] : [])]),
  ];
  const filtered = databases.filter((name) =>
    name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const hasSchema = ['postgresql', 'sqlserver'].includes(dbType?.toLowerCase());
  const choose = async (name) => {
    if (locked || !isConnected || name === currentDatabase) return;
    setPending(name);
    setError('');
    try {
      const result = await onDatabaseSwitch(name);
      if (result?.success === false)
        setError(result.error || 'Could not switch database. Try again.');
    } catch {
      setError('Could not switch database. Try again.');
    } finally {
      setPending(null);
    }
  };

  return (
    <SidebarSectionLayout
      busy={loading}
      label="Database details"
      footer={
        <Button
          variant="outlined"
          disabled={loading || isDatabaseBusy || Boolean(pending)}
          onClick={unavailable ? onRetryDatabaseStatus : onOpenDatabase}
        >
          {unavailable
            ? 'Retry connection status'
            : isConnected
              ? 'Manage connection'
              : 'Connect database'}
        </Button>
      }
    >
      {loading && <LoadingStatus>Loading database connection</LoadingStatus>}
      <Box
        sx={{
          ...sidebarCard,
          position: 'relative',
          overflow: 'hidden',
          height: 386,
          boxSizing: 'border-box',
          '&::after': {
            content: '""',
            position: 'absolute',
            right: -30,
            top: -35,
            width: 100,
            height: 100,
            borderRadius: '50%',
            border: '12px solid',
            borderColor: (theme) => alpha(theme.palette.info.main, 0.05),
            pointerEvents: 'none',
          },
        }}
      >
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 44,
            height: 44,
            mb: 2,
            borderRadius: '12px',
            color: 'info.main',
            bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
          }}
        >
          <DatabaseIcon sx={{ fontSize: 25 }} />
        </Box>
        <Typography
          component="div"
          title={currentDatabase || undefined}
          sx={{ fontSize: 18, fontWeight: 500, ...twoLines }}
        >
          {loading ? (
            <SidebarSkeleton width="80%" height={20} />
          ) : unavailable ? (
            'Connection status unavailable'
          ) : isConnected ? (
            currentDatabase || 'Select a database'
          ) : (
            'Not connected'
          )}
        </Typography>
        {isConnected || loading || unavailable ? (
          <>
            <Typography
              component="div"
              sx={{ color: 'text.secondary', fontSize: 13, mt: 0.5, height: 20, ...singleLine }}
            >
              {loading ? (
                <SidebarSkeleton width="55%" />
              ) : unavailable ? (
                'Try again to check your connection.'
              ) : (
                engine
              )}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                mt: 2,
                height: 20,
                visibility: unavailable ? 'hidden' : 'visible',
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: loading ? 'action.hover' : 'success.main',
                }}
              />
              <Typography
                component="div"
                sx={{
                  fontSize: 12,
                  height: 18,
                  lineHeight: '18px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {loading ? <SidebarSkeleton width={80} /> : 'Connected'}
              </Typography>
            </Box>
            {
              <Box
                sx={{
                  height: 66,
                  boxSizing: 'border-box',
                  visibility: loading || hasSchema ? 'visible' : 'hidden',
                  mt: 2,
                  pt: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'border.separator',
                }}
              >
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {loading || hasSchema ? 'Current schema' : '\u00a0'}
                </Typography>
                <Typography
                  component="div"
                  title={currentSchema || undefined}
                  sx={{ fontSize: 14, mt: 0.5, ...singleLine }}
                >
                  {loading ? <SidebarSkeleton width="65%" /> : currentSchema || 'Not selected'}
                </Typography>
              </Box>
            }
          </>
        ) : (
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1, lineHeight: 1.6 }}>
            Connect to explore schemas and run queries.
          </Typography>
        )}
      </Box>
      {isConnected || loading || unavailable ? (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>
            Available databases
          </Typography>
          <Box sx={{ height: 48 }}>
            {databases.length > 8 && (
              <TextField
                fullWidth
                size="small"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter databases"
                slotProps={{ htmlInput: { 'aria-label': 'Filter databases' } }}
                sx={{ mb: 1 }}
              />
            )}
          </Box>
          <Box
            role="group"
            aria-label="Available databases"
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
          >
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <Box
                    key={index}
                    sx={{ height: 44, display: 'flex', alignItems: 'center', px: 1.5, gap: 1 }}
                  >
                    <SidebarSkeleton width={18} height={18} />
                    <SidebarSkeleton width={`${75 - (index % 3) * 10}%`} />
                  </Box>
                ))
              : filtered.map((name) => (
                  <Button
                    key={name}
                    aria-pressed={name === currentDatabase}
                    disabled={locked || !onDatabaseSwitch}
                    onClick={() => choose(name)}
                    sx={{
                      justifyContent: 'flex-start',
                      gap: 1,
                      height: 44,
                      minHeight: 44,
                      px: 1.5,
                      borderRadius: '10px',
                      color: 'text.primary',
                      bgcolor: name === currentDatabase ? 'action.selected' : 'transparent',
                      textAlign: 'left',
                    }}
                  >
                    <DatabaseIcon sx={{ fontSize: 18, flexShrink: 0, color: 'text.secondary' }} />
                    <Box component="span" title={name} sx={{ flex: 1, minWidth: 0, ...singleLine }}>
                      {name}
                    </Box>
                    <Box component="span" sx={{ width: 17, height: 17, flexShrink: 0 }}>
                      {pending === name ? (
                        <CircularProgress
                          size={14}
                          color="inherit"
                          aria-label={`Switching to ${name}`}
                        />
                      ) : name === currentDatabase ? (
                        <CheckIcon
                          sx={{
                            fontSize: 17,
                            color: locked ? 'text.disabled' : 'accent.foreground',
                          }}
                        />
                      ) : null}
                    </Box>
                  </Button>
                ))}
          </Box>
          {!loading && !unavailable && !filtered.length && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', py: 1 }}>
              {search ? 'No matching databases.' : 'No databases available.'}
            </Typography>
          )}
          {isStreaming && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
              Database switching is available when the response finishes.
            </Typography>
          )}
          {error && (
            <Typography role="alert" sx={{ fontSize: 13, color: 'error.main', mt: 1 }}>
              {error}
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3 }}>
          {DB_TYPES.map(({ value, label }) => (
            <Typography
              key={value}
              sx={{
                fontSize: 12,
                color: 'text.secondary',
                px: 1.25,
                py: 0.75,
                border: '1px solid',
                borderColor: 'border.separator',
                borderRadius: '8px',
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>
      )}
    </SidebarSectionLayout>
  );
}
