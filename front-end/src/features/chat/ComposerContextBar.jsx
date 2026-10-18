import { Box, Button, MenuList, TextField, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';
import { AppPopover, AppPopoverEmptyState, AppPopoverItem } from '@/components';
import { CheckIcon, DatabaseIcon, SchemaIcon } from '@/components/icons';
import { COMPOSER_MAX_WIDTH, getResponsivePillControlSx } from '@/features/styles/interfaceChrome';

export default function ComposerContextBar({
  isConnected,
  isStreaming,
  disabled,
  currentDatabase,
  dbType,
  currentSchema,
  availableDatabases = [],
  availableSchemas = [],
  onDatabaseSwitch,
  onSchemaChange,
  onOpenDatabase,
  onOpenContext,
}) {
  const theme = useTheme();
  const [picker, setPicker] = useState(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const locked = Boolean(disabled || isStreaming || pending);
  const isSchema = picker?.kind === 'schema';
  const choices = isSchema ? availableSchemas : availableDatabases;
  const selected = isSchema ? currentSchema : currentDatabase;
  const filtered = choices.filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  const controlSx = {
    ...getResponsivePillControlSx(theme, { desktopHeight: 36 }),
    ...theme.typography.uiBodySm,
    flexShrink: 0,
    maxWidth: 220,
    color: 'text.secondary',
  };
  const openPicker = (event, kind) => {
    setSearch('');
    setError('');
    setPicker({ anchor: event.currentTarget, kind });
  };
  const choose = async (name) => {
    if (locked) return;
    setPicker(null);
    if (name === selected) return;
    setPending(true);
    try {
      const result = await (isSchema ? onSchemaChange?.(name) : onDatabaseSwitch?.(name));
      if (result?.success === false) setError(result.error || 'Could not change context.');
    } catch {
      setError('Could not change context. Please try again.');
    } finally {
      setPending(false);
    }
  };
  return (
    <Box
      sx={{
        maxWidth: COMPOSER_MAX_WIDTH - 24,
        mx: 'auto',
        mt: '-1px',
        width: 'calc(100% - 24px)',
        px: 1,
        pt: 0.75,
        pb: 0.25,
        bgcolor: 'background.sunken',
        borderRadius: '0 0 18px 18px',
      }}
    >
      <Box
        role="group"
        aria-label="Database context"
        sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', alignItems: 'center', pb: 0.5 }}
      >
        <Button
          type="button"
          startIcon={<DatabaseIcon />}
          disabled={locked}
          aria-label={
            isConnected ? `Database: ${currentDatabase || 'Select database'}` : 'Connect database'
          }
          aria-haspopup={isConnected ? 'menu' : undefined}
          aria-expanded={picker?.kind === 'database' || undefined}
          onClick={(event) =>
            isConnected ? openPicker(event, 'database') : onOpenDatabase?.(event)
          }
          sx={controlSx}
        >
          <Box
            component="span"
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {isConnected ? currentDatabase || 'Select database' : 'Connect database'}
          </Box>
        </Button>
        {isConnected && dbType?.toLowerCase() === 'postgresql' && (
          <Button
            type="button"
            startIcon={<SchemaIcon />}
            disabled={locked}
            aria-haspopup="menu"
            aria-label={`Schema: ${currentSchema || 'Select schema'}`}
            aria-expanded={picker?.kind === 'schema' || undefined}
            onClick={(event) => openPicker(event, 'schema')}
            sx={controlSx}
          >
            <Box
              component="span"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {currentSchema || 'Select schema'}
            </Box>
          </Button>
        )}
        {onOpenContext && (
          <Button type="button" onClick={onOpenContext} disabled={locked} sx={controlSx}>
            Context
          </Button>
        )}
      </Box>
      {error && (
        <Typography
          role="alert"
          sx={{ ...theme.typography.uiCaptionSm, color: 'error.main', px: 1 }}
        >
          {error}
        </Typography>
      )}
      <AppPopover
        anchorEl={picker?.anchor}
        open={Boolean(picker)}
        onClose={() => setPicker(null)}
        width={288}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isSchema ? 'Search schemas' : 'Search databases'}
            slotProps={{
              htmlInput: { 'aria-label': isSchema ? 'Search schemas' : 'Search databases' },
            }}
          />
        </Box>
        <MenuList
          aria-label={isSchema ? 'Schemas' : 'Databases'}
          sx={{ maxHeight: 280, overflowY: 'auto', p: 0 }}
        >
          {filtered.map((name) => (
            <AppPopoverItem
              key={name}
              role="menuitemradio"
              ariaChecked={name === selected}
              selected={name === selected}
              disabled={locked}
              label={name}
              onClick={() => choose(name)}
              trailing={name === selected ? <CheckIcon /> : null}
              reserveTrailing
            />
          ))}
        </MenuList>
        {!filtered.length && (
          <AppPopoverEmptyState title="No matches" description="Try another search." />
        )}
      </AppPopover>
    </Box>
  );
}
