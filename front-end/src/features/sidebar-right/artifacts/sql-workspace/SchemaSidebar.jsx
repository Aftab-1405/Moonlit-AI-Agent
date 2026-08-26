import { Box, Collapse, Fade, IconButton, Skeleton, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ButtonLoadingSpinner } from '@/components';
import {
  ChevronRightIcon,
  CloseIcon,
  ColumnIcon,
  RefreshIcon,
  SchemaIcon,
  TableIcon,
} from '@/components/icons';
import { useDatabaseConnection } from '@/contexts/DatabaseContext';
import { getArtifactActionButtonSx } from '@/features/sidebar-right/artifact-loader';
import { getInteractionColors, getScrollbarStyles } from '@/styles/shared';

const TREE_ROW_HEIGHT = 32;
const ICON_SLOT = 24;

function getColumnMeta(column) {
  if (typeof column === 'string') return { name: column, dataType: '' };
  if (!column || typeof column !== 'object') return { name: '', dataType: '' };

  return {
    name: column.name || column.column_name || '',
    dataType: column.data_type || column.type || '',
  };
}

function getTreeRowSx(theme, interaction, { radius = '7px' } = {}) {
  return {
    width: '100%',
    minHeight: TREE_ROW_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    border: 0,
    borderRadius: radius,
    color: 'inherit',
    bgcolor: 'transparent',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    userSelect: 'none',
    transition: theme.transitions.create(['background-color', 'color'], {
      duration: theme.transitions.duration.shorter,
    }),
    '&:hover': { bgcolor: interaction.hoverBackground },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.border.focus}`,
      outlineOffset: -2,
    },
  };
}

function TreeIconSlot({ children, color = 'text.secondary' }) {
  return (
    <Box
      component="span"
      sx={{
        width: ICON_SLOT,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color,
      }}
    >
      {children}
    </Box>
  );
}

function SchemaStatusText({ children, color = 'text.secondary' }) {
  const theme = useTheme();

  return (
    <Fade in timeout={160}>
      <Typography
        sx={{
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          px: 1,
          ...theme.typography.uiCaptionXs,
          color,
          fontFamily: theme.typography.fontFamilyMono,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </Typography>
    </Fade>
  );
}

function ColumnItem({ column }) {
  const theme = useTheme();
  const interaction = getInteractionColors(theme);
  const { name, dataType } = getColumnMeta(column);

  return (
    <Box
      title={dataType ? `${name} · ${dataType}` : name}
      sx={{
        minHeight: 29,
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.75,
        borderRadius: '6px',
        transition: theme.transitions.create('background-color', {
          duration: theme.transitions.duration.shortest,
        }),
        '&:hover': { bgcolor: interaction.hoverBackground },
      }}
    >
      <TreeIconSlot color="text.disabled">
        <ColumnIcon sx={{ fontSize: 14 }} />
      </TreeIconSlot>
      <Typography
        sx={{
          ...theme.typography.uiCaptionXs,
          minWidth: 0,
          flex: 1,
          color: 'text.secondary',
          fontFamily: theme.typography.fontFamilyMono,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </Typography>
      {dataType ? (
        <Typography
          sx={{
            ...theme.typography.uiCaptionXs,
            ml: 0.5,
            maxWidth: '46%',
            color: 'text.disabled',
            fontFamily: theme.typography.fontFamilyMono,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {dataType}
        </Typography>
      ) : null}
    </Box>
  );
}

function TableItem({ table, currentDatabase, fetchTableSchema }) {
  const theme = useTheme();
  const interaction = getInteractionColors(theme);
  const [expanded, setExpanded] = useState(false);
  const [columns, setColumns] = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState('');

  const handleToggle = useCallback(async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);

    if (!nextExpanded || columns.length > 0 || columnsLoading) return;

    setColumnsLoading(true);
    setColumnsError('');
    try {
      const response = await fetchTableSchema({
        database: currentDatabase,
        tableName: table.name,
      });
      if (response.status === 'success') {
        setColumns(response.data?.columns || []);
      } else {
        setColumnsError(response.message || 'Columns unavailable');
      }
    } catch (error) {
      setColumnsError(error.message || 'Columns unavailable');
    } finally {
      setColumnsLoading(false);
    }
  }, [columns.length, columnsLoading, currentDatabase, expanded, fetchTableSchema, table.name]);

  return (
    <Box>
      <Box
        component="button"
        type="button"
        aria-expanded={expanded}
        onClick={handleToggle}
        sx={{
          ...getTreeRowSx(theme, interaction),
          px: 0.75,
        }}
      >
        <TreeIconSlot>
          <ChevronRightIcon
            sx={{
              fontSize: 16,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: theme.transitions.create('transform', {
                duration: theme.transitions.duration.shorter,
              }),
            }}
          />
        </TreeIconSlot>
        <TreeIconSlot color={expanded ? 'primary.main' : 'text.secondary'}>
          <TableIcon sx={{ fontSize: 16 }} />
        </TreeIconSlot>
        <Typography
          component="span"
          sx={{
            ...theme.typography.uiCaptionSm,
            minWidth: 0,
            flex: 1,
            color: 'text.primary',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {table.name}
        </Typography>
      </Box>
      <Collapse in={expanded} timeout={160}>
        <Box sx={{ pl: 5.5, pr: 0.25, pb: 0.25 }}>
          {columnsLoading ? (
            <SchemaStatusText>Loading columns</SchemaStatusText>
          ) : columnsError ? (
            <SchemaStatusText color="error.main">{columnsError}</SchemaStatusText>
          ) : columns.length === 0 ? (
            <SchemaStatusText>No columns found</SchemaStatusText>
          ) : (
            columns.map((column, index) => (
              <ColumnItem key={`${getColumnMeta(column).name}-${index}`} column={column} />
            ))
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

function SchemaItem({ schema, currentDatabase, fetchTableSchema }) {
  const theme = useTheme();
  const interaction = getInteractionColors(theme);
  const [expanded, setExpanded] = useState(true);

  return (
    <Box>
      <Box
        component="button"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        sx={{
          ...getTreeRowSx(theme, interaction, { radius: '8px' }),
          px: 0.75,
          mb: 0.25,
        }}
      >
        <TreeIconSlot>
          <ChevronRightIcon
            sx={{
              fontSize: 17,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: theme.transitions.create('transform', {
                duration: theme.transitions.duration.shorter,
              }),
            }}
          />
        </TreeIconSlot>
        <TreeIconSlot color="primary.main">
          <SchemaIcon sx={{ width: 16, height: 16 }} />
        </TreeIconSlot>
        <Typography
          component="span"
          sx={{
            ...theme.typography.uiCaptionMd,
            minWidth: 0,
            flex: 1,
            fontWeight: 400,
            color: 'text.primary',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {schema.name}
        </Typography>
        <Typography
          component="span"
          sx={{
            ...theme.typography.uiCaptionXs,
            color: 'text.disabled',
            fontFamily: theme.typography.fontFamilyMono,
            pr: 0.5,
          }}
        >
          {schema.tables.length}
        </Typography>
      </Box>
      <Collapse in={expanded} timeout={180}>
        <Box sx={{ pl: 1 }}>
          {schema.tables.map((table) => (
            <TableItem
              key={`${currentDatabase || 'db'}-${table.name}`}
              table={table}
              currentDatabase={currentDatabase}
              fetchTableSchema={fetchTableSchema}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function SchemaLoadingState() {
  return (
    <Box aria-label="Loading schema" sx={{ px: 1, py: 0.5 }}>
      {[76, 62, 84, 55, 70, 66].map((width, index) => (
        <Box
          key={`${width}-${index}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 32, px: 0.75 }}
        >
          <Skeleton variant="rounded" width={16} height={16} sx={{ borderRadius: '4px' }} />
          <Skeleton variant="text" width={`${width}%`} height={16} />
        </Box>
      ))}
    </Box>
  );
}

function SchemaEmptyState({ message, tone }) {
  const theme = useTheme();

  return (
    <Fade in timeout={180}>
      <Box
        sx={{
          height: '100%',
          minHeight: 180,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.25,
          px: 2.5,
          py: 4,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '8px',
            color: tone === 'error' ? 'error.main' : 'text.disabled',
            bgcolor: alpha(
              tone === 'error' ? theme.palette.error.main : theme.palette.text.primary,
              theme.palette.opacity.soft,
            ),
          }}
        >
          <SchemaIcon sx={{ width: 18, height: 18 }} />
        </Box>
        <Typography
          sx={{
            ...theme.typography.uiCaptionSm,
            maxWidth: 190,
            color: tone === 'error' ? 'error.main' : 'text.secondary',
            lineHeight: 1.55,
          }}
        >
          {message}
        </Typography>
      </Box>
    </Fade>
  );
}

function SchemaSidebar({
  width,
  isConnected,
  currentDatabase,
  onClose,
  onResizeStart,
  resizing = false,
}) {
  const theme = useTheme();
  const { fetchSchemaTables, fetchTableSchema, invalidateSchemaTables } = useDatabaseConnection();
  const [schemaInfo, setSchemaInfo] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState('');

  const loadSchema = useCallback(
    async (isCancelled, { force = false } = {}) => {
      setSchemaLoading(true);
      setSchemaError('');

      try {
        const response = await fetchSchemaTables({ database: currentDatabase, force });
        if (isCancelled()) return;

        if (response.status === 'success') {
          const tables = (response.data?.tables || []).map((tableName) => ({ name: tableName }));
          setSchemaInfo({
            name: response.data?.schema || currentDatabase || 'Schema',
            tables,
          });
        } else {
          setSchemaError(response.message || 'Schema unavailable');
        }
      } catch (error) {
        if (!isCancelled()) setSchemaError(error.message || 'Schema unavailable');
      } finally {
        if (!isCancelled()) setSchemaLoading(false);
      }
    },
    [currentDatabase, fetchSchemaTables],
  );

  useEffect(() => {
    if (!isConnected) return undefined;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadSchema(() => cancelled);
    });

    return () => {
      cancelled = true;
    };
  }, [isConnected, loadSchema]);

  const handleRefreshSchema = useCallback(() => {
    if (!isConnected || schemaLoading) return;

    const cancelled = false;
    invalidateSchemaTables(currentDatabase);
    loadSchema(() => cancelled, { force: true });
  }, [currentDatabase, invalidateSchemaTables, isConnected, loadSchema, schemaLoading]);

  const schemaContent = useMemo(() => {
    if (!isConnected)
      return { message: 'Connect a database to browse its schema.', tone: 'disabled' };
    if (schemaError) return { message: schemaError, tone: 'error' };
    if (!schemaInfo || schemaInfo.tables.length === 0) {
      return { message: 'No tables were found in this schema.', tone: 'disabled' };
    }
    return null;
  }, [isConnected, schemaError, schemaInfo]);

  return (
    <Box
      sx={{
        width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.border.subtle}`,
      }}
    >
      <Box
        sx={{
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 1.5,
          py: 0.75,
          flexShrink: 0,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{ ...theme.typography.uiCaptionMd, fontWeight: 400, color: 'text.primary' }}
          >
            Schema explorer
          </Typography>
          <Typography
            sx={{
              ...theme.typography.uiCaptionXs,
              mt: 0.125,
              color: 'text.disabled',
              fontFamily: theme.typography.fontFamilyMono,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentDatabase || 'No database selected'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Tooltip title="Refresh schema">
            <span>
              <IconButton
                size="small"
                onClick={handleRefreshSchema}
                disabled={!isConnected || schemaLoading}
                aria-label="Refresh schema"
                sx={getArtifactActionButtonSx(theme, { size: 30 })}
              >
                {schemaLoading ? (
                  <ButtonLoadingSpinner size={14} />
                ) : (
                  <RefreshIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Hide schema explorer">
            <IconButton
              size="small"
              onClick={onClose}
              aria-label="Hide schema explorer"
              sx={getArtifactActionButtonSx(theme, { size: 30 })}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: 0.75,
          pb: 0.75,
          ...getScrollbarStyles(theme),
        }}
      >
        {schemaLoading && !schemaInfo ? (
          <SchemaLoadingState />
        ) : schemaContent ? (
          <SchemaEmptyState message={schemaContent.message} tone={schemaContent.tone} />
        ) : (
          <SchemaItem
            schema={schemaInfo}
            currentDatabase={currentDatabase}
            fetchTableSchema={fetchTableSchema}
          />
        )}
      </Box>

      <Box
        onMouseDown={(event) => {
          event.preventDefault();
          onResizeStart?.(event);
        }}
        aria-hidden="true"
        sx={{
          position: 'absolute',
          top: 0,
          right: -4,
          bottom: 0,
          width: 8,
          cursor: 'col-resize',
          zIndex: 10,
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '50%',
            right: 3,
            width: 2,
            height: 34,
            borderRadius: 999,
            bgcolor: resizing ? 'primary.main' : 'transparent',
            transform: 'translateY(-50%)',
            transition: theme.transitions.create('background-color', {
              duration: theme.transitions.duration.shorter,
            }),
          },
          '&:hover::after, &:active::after': {
            bgcolor: 'primary.main',
          },
        }}
      />
    </Box>
  );
}

export default memo(SchemaSidebar);
