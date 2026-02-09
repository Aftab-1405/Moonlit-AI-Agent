import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Alert,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Collapse,
  useTheme,
  useMediaQuery,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import Editor from '@monaco-editor/react';
import { registerMonacoThemes, getMonacoThemeName } from '../theme';
import { getUserContext } from '../api';
import { USER } from '../api/endpoints';
const formatTimeAgo = (isoString) => {
  if (!isoString) return 'Unknown';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const registerOpaqueMonacoThemes = (monaco) => registerMonacoThemes(monaco);
function ContextCard({ children, sx = {} }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: alpha(theme.palette.background.paper, 0.5),
        transition: 'border-color 0.15s ease',
        '&:hover': {
          borderColor: alpha(theme.palette.text.primary, 0.15),
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
function EmptyState({ icon: _Icon, title, subtitle }) {
  const Icon = _Icon;
  return (
    <ContextCard sx={{ textAlign: 'center', py: 4 }}>
      <Icon sx={{ fontSize: 44, color: 'text.disabled', mb: 1.5 }} />
      <Typography variant="body2" color="text.secondary" fontWeight={500}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          {subtitle}
        </Typography>
      )}
    </ContextCard>
  );
}
function UserDBContextManagerForAI() {
  const [loading, setLoading] = useState(true);
  const [schemas, setSchemas] = useState([]);
  const [queries, setQueries] = useState([]);
  const [activeView, setActiveView] = useState('schemas'); // 'schemas' | 'queries'
  const [expandedSchema, setExpandedSchema] = useState(null);
  const [expandedQuery, setExpandedQuery] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: null, target: null });
  const [error, setError] = useState(null);

  const theme = useTheme();
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserContext();
      if (data.status === 'success') {
        setSchemas(data.schemas || []);
        setQueries(data.recent_queries || []);
      } else {
        setError(data.message || 'Failed to load context');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const handleDelete = useCallback(async () => {
    const { type, target } = deleteDialog;
    setDeleteDialog({ open: false, type: null, target: null });

    try {
      let url;
      if (type === 'schema') {
        url = USER.CONTEXT_DELETE_SCHEMA(target);
      } else if (type === 'all-schemas') {
        url = USER.CONTEXT_DELETE_ALL_SCHEMAS;
      } else if (type === 'queries') {
        url = USER.CONTEXT_DELETE_QUERIES;
      }
      const { del } = await import('../api');
      await del(url);
      fetchContext();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  }, [deleteDialog, fetchContext]);

  const openDeleteDialog = useCallback((type, target = null) => {
    setDeleteDialog({ open: true, type, target });
  }, []);

  const toggleSchemaExpand = useCallback((database) => {
    setExpandedSchema(prev => prev === database ? null : database);
  }, []);

  const toggleQueryExpand = useCallback((index) => {
    setExpandedQuery(prev => prev === index ? null : index);
  }, []);

  const dialogContent = useMemo(() => {
    const { type, target } = deleteDialog;
    if (type === 'schema') {
      const schema = schemas.find(s => s.database === target);
      return {
        title: 'Delete Schema Context?',
        database: target,
        tableCount: schema?.table_count || 0,
      };
    }
    if (type === 'all-schemas') {
      return {
        title: 'Delete All Schema Context?',
        database: `${schemas.length} database${schemas.length !== 1 ? 's' : ''}`,
        tableCount: schemas.reduce((sum, s) => sum + (s.table_count || 0), 0),
      };
    }
    if (type === 'queries') {
      return {
        title: 'Clear Query History?',
        database: null,
        tableCount: queries.length,
      };
    }
    return {};
  }, [deleteDialog, schemas, queries]);
  if (loading) {
    return (
      <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Alert
        severity="info"
        icon={<InfoOutlinedIcon />}
        sx={{
          mb: 2.5,
          borderRadius: 2,
          py: { xs: 0.25, sm: 0.5 },
          px: { xs: 0.25, sm: 0.5 },
          '& .MuiAlert-message': { width: '100%' },
        }}
      >
        <Typography variant="body2" sx={{ fontSize: { xs: '0.82rem', sm: '0.875rem' }, lineHeight: 1.45 }}>
          This is the AI's memory of your database structure. Delete only if your schema has changed.
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1, sm: 1.5 },
          mb: 2.5,
        }}
      >
        <ToggleButtonGroup
          value={activeView}
          exclusive
          onChange={(e, v) => v && setActiveView(v)}
          size="small"
          fullWidth={isCompactMobile}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            flexShrink: 0,
            '& .MuiToggleButton-root': {
              px: 2,
              py: 0.75,
              minHeight: 44,
              flex: { xs: 1, sm: '0 0 auto' },
              textTransform: 'none',
              fontWeight: 500,
              gap: 1,
            },
          }}
        >
          <ToggleButton value="schemas">
            <StorageRoundedIcon sx={{ fontSize: 16 }} />
            Schemas
            {schemas.length > 0 && (
              <Chip size="small" label={schemas.length} sx={{ height: 18, ml: 0.5 }} />
            )}
          </ToggleButton>
          <ToggleButton value="queries">
            <HistoryRoundedIcon sx={{ fontSize: 16 }} />
            Queries
            {queries.length > 0 && (
              <Chip size="small" label={queries.length} sx={{ height: 18, ml: 0.5 }} />
            )}
          </ToggleButton>
        </ToggleButtonGroup>
        {((activeView === 'schemas' && schemas.length > 0) ||
          (activeView === 'queries' && queries.length > 0)) && (
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() => openDeleteDialog(activeView === 'schemas' ? 'all-schemas' : 'queries')}
            fullWidth={false}
            sx={{
              minHeight: 44,
              width: { xs: '100%', sm: 'fit-content' },
              minWidth: { sm: 108 },
              ml: { sm: 1 },
              alignSelf: { xs: 'stretch', sm: 'center' },
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Clear All
          </Button>
        )}
      </Box>
      {activeView === 'schemas' && (
        <>
          {schemas.length === 0 ? (
            <EmptyState
              icon={StorageRoundedIcon}
              title="No cached schemas"
              subtitle="Connect to a database to cache its schema"
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {schemas.map((schema) => (
                <ContextCard key={schema.database} sx={{ p: 0, overflow: 'hidden' }}>
                  <ListItemButton
                    onClick={() => toggleSchemaExpand(schema.database)}
                    sx={{ py: 1.5, px: 2 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <StorageRoundedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight={600}>
                          {schema.database}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {schema.table_count} table{schema.table_count !== 1 ? 's' : ''} - {formatTimeAgo(schema.cached_at)}
                        </Typography>
                      }
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); openDeleteDialog('schema', schema.database); }}
                        sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                      >
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                      <KeyboardArrowDownIcon
                        sx={{
                          fontSize: 20,
                          color: 'text.secondary',
                          transform: expandedSchema === schema.database ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    </Box>
                  </ListItemButton>
                  <Collapse in={expandedSchema === schema.database} timeout={200}>
                    <Divider />
                    <Box sx={{ p: 2, backgroundColor: alpha(theme.palette.background.default, 0.5) }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          fontWeight: 600,
                          mb: 1,
                          display: 'block',
                        }}
                      >
                        Tables
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                        {schema.tables.slice(0, 15).map((table) => (
                          <Chip
                            key={table}
                            size="small"
                            icon={<TableChartRoundedIcon sx={{ fontSize: 12 }} />}
                            label={table}
                            sx={{
                              height: 24,
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          />
                        ))}
                        {schema.tables.length > 15 && (
                          <Chip
                            size="small"
                            label={`+${schema.tables.length - 15} more`}
                            sx={{ height: 24 }}
                          />
                        )}
                      </Box>
                      {Object.entries(schema.columns || {}).slice(0, 2).map(([tableName, columns]) => (
                        <Box key={tableName} sx={{ mb: 1 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <ViewColumnRoundedIcon sx={{ fontSize: 12 }} />
                            {tableName} ({Array.isArray(columns) ? columns.length : 0} columns)
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', pl: 2 }}>
                            {Array.isArray(columns)
                              ? columns.slice(0, 6).map(c => typeof c === 'object' ? c.name : c).join(', ')
                              : 'No columns'}
                            {Array.isArray(columns) && columns.length > 6 && ` +${columns.length - 6} more`}
                          </Typography>
                        </Box>
                      ))}
                      {Object.keys(schema.columns || {}).length > 2 && (
                        <Typography variant="caption" color="text.disabled">
                          ...and {Object.keys(schema.columns).length - 2} more tables
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </ContextCard>
              ))}
            </Box>
          )}
        </>
      )}
      {activeView === 'queries' && (
        <>
          {queries.length === 0 ? (
            <EmptyState
              icon={HistoryRoundedIcon}
              title="No queries stored"
              subtitle="Run SQL queries to build history"
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {queries.map((query, index) => (
                <ContextCard key={index} sx={{ p: 0, overflow: 'hidden' }}>
                  <Box
                    onClick={() => toggleQueryExpand(index)}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: query.status === 'success'
                          ? alpha(theme.palette.success.main, 0.1)
                          : alpha(theme.palette.error.main, 0.1),
                        flexShrink: 0,
                      }}
                    >
                      {query.status === 'success' ? (
                        <CheckCircleRoundedIcon sx={{ fontSize: 18, color: 'success.main' }} />
                      ) : (
                        <ErrorRoundedIcon sx={{ fontSize: 18, color: 'error.main' }} />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          icon={<StorageRoundedIcon sx={{ fontSize: 12 }} />}
                          label={query.database}
                          sx={{
                            height: 22,
                            fontWeight: 500,
                            '& .MuiChip-icon': { color: 'inherit' },
                          }}
                        />
                      <Typography variant="caption" color="text.secondary">
                        {query.row_count} row{query.row_count !== 1 ? 's' : ''}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        - {formatTimeAgo(query.executed_at)}
                      </Typography>
                      </Box>
                    </Box>
                    <KeyboardArrowDownIcon
                      sx={{
                        fontSize: 20,
                        color: 'text.secondary',
                        transform: expandedQuery === index ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                      }}
                    />
                  </Box>
                  <Collapse in={expandedQuery === index} timeout={200}>
                    <Divider />
                    <Box sx={{ p: 2, backgroundColor: alpha(theme.palette.background.default, 0.5) }}>
                      <Box
                        sx={{
                          borderRadius: 2,
                          overflow: 'hidden',
                          border: '1px solid',
                          borderColor: 'divider',
                          height: Math.min(Math.max(80, (query.query.split('\n').length * 20) + 32), 200),
                        }}
                      >
                        <Editor
                          height="100%"
                          language="sql"
                          theme={getMonacoThemeName(theme.palette.mode)}
                          value={query.query}
                          beforeMount={registerOpaqueMonacoThemes}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 12,
                            fontFamily: theme.typography.fontFamilyMono,
                            lineNumbers: 'off',
                            folding: false,
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: 'on',
                            padding: { top: 12, bottom: 12 },
                            renderLineHighlight: 'none',
                            scrollbar: { vertical: 'auto', horizontal: 'hidden', verticalScrollbarSize: 6 },
                            overviewRulerLanes: 0,
                            hideCursorInOverviewRuler: true,
                            overviewRulerBorder: false,
                            guides: { indentation: false },
                            contextmenu: false,
                          }}
                        />
                      </Box>
                    </Box>
                  </Collapse>
                </ContextCard>
              ))}
            </Box>
          )}
        </>
      )}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, type: null, target: null })}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
          <WarningAmberRoundedIcon color="warning" />
          {dialogContent.title}
        </DialogTitle>
        <DialogContent>
          {deleteDialog.type !== 'queries' && (
            <Box sx={{ mb: 2 }}>
              <Chip
                icon={<StorageRoundedIcon />}
                label={dialogContent.database}
                sx={{ mr: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                ({dialogContent.tableCount} table{dialogContent.tableCount !== 1 ? 's' : ''})
              </Typography>
            </Box>
          )}

          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            {deleteDialog.type === 'queries' ? (
              'Query history helps the AI understand your recent work patterns.'
            ) : (
              <>
                After deletion, the AI will re-learn your database schema on next connection.
                <Box component="ul" sx={{ mt: 1, pl: 2, mb: 0 }}>
                  <li><strong>Schema OUTDATED?</strong> Delete and reconnect to sync.</li>
                  <li><strong>Schema CURRENT?</strong> Deleting is unnecessary.</li>
                </Box>
              </>
            )}
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setDeleteDialog({ open: false, type: null, target: null })}
            color="inherit"
            sx={{ minHeight: 44 }}
          >
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" sx={{ minHeight: 44 }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default memo(UserDBContextManagerForAI);

