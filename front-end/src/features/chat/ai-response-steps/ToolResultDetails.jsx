import { Box, ButtonBase, Collapse, Link, Typography, useTheme } from '@mui/material';
import { useId, useState } from 'react';
import { ExpandMoreIcon } from '@/components/icons';
import { AGENT_TOOL_ACTIONS } from '@/config/toolActions';
import { MarkdownRenderer } from '@/features/chat';
import {
  getColumnDisplayMeta,
  getDetailedResult,
  getGenericResultView,
  getQueryHistoryItems,
  getTableRowCountItems,
  getTimelineResult,
  getWebSearchItems,
} from '@/features/chat/ai-response-steps/stepUtils';
import { getFlatStepControlSx } from '@/features/chat/ai-response-steps/timelineShared';
import { HOVER_CAPABLE_QUERY } from '@/styles/mediaQueries';
import { getInteractionColors } from '@/styles/shared';
import { TRANSITIONS } from '@/theme/index';
import { normalizeCitationMarkdown } from '@/utils/toolResultFormatting';

const getStepTypeScale = (theme) => {
  return {
    sectionLabel: {
      color: theme.palette.text.disabled,
      ...theme.typography.uiCaptionMd,
      fontWeight: 400,
      letterSpacing: 0,
      textTransform: 'none',
    },
    metaLabel: {
      color: theme.palette.text.disabled,
      ...theme.typography.uiCaptionSm,
      fontWeight: theme.typography.fontWeightMedium,
    },
    metaValue: {
      color: theme.palette.text.secondary,
      fontFamily: theme.typography.fontFamilyMono,
      ...theme.typography.uiCaptionSm,
      fontWeight: theme.typography.fontWeightMedium,
      letterSpacing: '0',
    },
    primaryMono: {
      color: theme.palette.text.primary,
      fontFamily: theme.typography.fontFamilyMono,
      ...theme.typography.uiCaptionMd,
      fontWeight: theme.typography.fontWeightMedium,
      letterSpacing: '0',
    },
    secondaryMono: {
      color: theme.palette.text.secondary,
      fontFamily: theme.typography.fontFamilyMono,
      ...theme.typography.uiCaptionSm,
      fontWeight: theme.typography.fontWeightRegular,
      letterSpacing: '0',
    },
    mutedMono: {
      color: theme.palette.text.disabled,
      fontFamily: theme.typography.fontFamilyMono,
      ...theme.typography.uiCaption2xs,
      fontWeight: theme.typography.fontWeightRegular,
      letterSpacing: '0',
    },
    body: {
      color: theme.palette.text.secondary,
      ...theme.typography.uiResponseCompact,
      fontFamily: theme.typography.fontFamily,
      fontWeight: theme.typography.fontWeightRegular,
      letterSpacing: 0,
      maxWidth: '72ch',
    },
  };
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const getColumnName = (column) => {
  if (typeof column === 'string') return column;
  return column?.name || column?.column_name || String(column || '');
};

const normalizeTableKey = (value = '') =>
  String(value).replace(/["'`]/g, '').split('.').pop().toLowerCase();

const resolveColumnsForTable = (columnsByTable, table) => {
  if (!columnsByTable) return null;

  if (Array.isArray(columnsByTable)) {
    const normalizedTable = normalizeTableKey(table);
    const matches = columnsByTable.filter(
      (column) =>
        normalizeTableKey(column?.table || column?.table_name || column?.tableName) ===
        normalizedTable,
    );
    return matches.length ? matches : null;
  }

  if (typeof columnsByTable !== 'object') return null;
  if (Array.isArray(columnsByTable[table])) return columnsByTable[table];

  const normalizedTable = normalizeTableKey(table);
  const matchingKey = Object.keys(columnsByTable).find(
    (key) => normalizeTableKey(key) === normalizedTable,
  );

  return matchingKey && Array.isArray(columnsByTable[matchingKey])
    ? columnsByTable[matchingKey]
    : null;
};

// ─── Shared primitives ────────────────────────────────────────────────────────

export const DetailLabel = ({ children }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  return (
    <Typography
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        mb: 0.8,
        ...type.sectionLabel,
      }}
    >
      {children}
    </Typography>
  );
};

const MetaPill = ({ children }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        maxWidth: '100%',
        ...type.mutedMono,
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </Box>
  );
};

const FieldBadge = ({ label, value }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  if (value === undefined || value === null || value === '') return null;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.55, minWidth: 0 }}>
      <Typography sx={type.metaLabel}>{label}</Typography>
      <Typography sx={{ ...type.metaValue, minWidth: 0, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  );
};

const EmptyResult = ({ children = 'No details returned.' }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  return <Typography sx={type.body}>{children}</Typography>;
};

const ColumnChip = ({ column, metadataLimit = 2 }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  const name = getColumnName(column);
  const meta = getColumnDisplayMeta(column);

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.45,
        flexWrap: 'wrap',
        minWidth: 0,
        maxWidth: '100%',
        px: 0.8,
        py: 0.35,
        borderRadius: 9999,
        bgcolor: theme.palette.layer.faint,
      }}
    >
      <Typography
        sx={{
          ...type.secondaryMono,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </Typography>
      {meta.slice(0, metadataLimit).map((item, index) => (
        <Typography
          key={`${item}-${index}`}
          sx={{ ...type.mutedMono, lineHeight: 1, flexShrink: 0 }}
        >
          {item}
        </Typography>
      ))}
    </Box>
  );
};

const ColumnList = ({ columns, limit, metadataLimit }) => {
  const list = toArray(columns);
  const visibleColumns = typeof limit === 'number' ? list.slice(0, limit) : list;
  const hiddenCount = list.length - visibleColumns.length;
  if (list.length === 0) return <EmptyResult>No columns returned.</EmptyResult>;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, minWidth: 0 }}>
      {visibleColumns.map((column, index) => (
        <ColumnChip
          key={`${getColumnName(column)}-${index}`}
          column={column}
          metadataLimit={metadataLimit}
        />
      ))}
      {hiddenCount > 0 && <MetaPill>+{hiddenCount} more</MetaPill>}
    </Box>
  );
};

const ToolMetaGrid = ({ items }) => {
  const visibleItems = items.filter(
    (item) => item.value !== undefined && item.value !== null && item.value !== '',
  );
  if (visibleItems.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.4, rowGap: 0.3, mb: 1.2 }}>
      {visibleItems.map((item) => (
        <FieldBadge key={item.label} label={item.label} value={item.value} />
      ))}
    </Box>
  );
};

// ─── Schema result ────────────────────────────────────────────────────────────

const SchemaResultDetails = ({ result }) => {
  const [expandedTables, setExpandedTables] = useState(() => new Set());
  const schemaDetailsId = useId();
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  const tables = toArray(result.tables);
  const columnsByTable =
    result.columns && typeof result.columns === 'object' ? result.columns : null;
  const hasColumnPayload = Boolean(columnsByTable);

  const toggleTable = (table) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  };

  return (
    <Box>
      <ToolMetaGrid
        items={[
          { label: 'Database', value: result.database },
          { label: 'Tables', value: result.table_count ?? tables.length },
          { label: 'Source', value: result.source },
        ]}
      />
      <DetailLabel>Tables</DetailLabel>
      {tables.length === 0 ? (
        <EmptyResult>No tables returned.</EmptyResult>
      ) : (
        <Box sx={{ display: 'grid', gap: 0 }}>
          {tables.map((table, index) => {
            const columns = resolveColumnsForTable(columnsByTable, table);
            const isExpanded = expandedTables.has(table);
            const canExpand = Boolean(columns?.length);
            const tableDetailsId = `${schemaDetailsId}-${index}`;
            const columnCountLabel = columns
              ? `${columns.length} column${columns.length !== 1 ? 's' : ''}`
              : 'not loaded';
            return (
              <Box
                key={table}
                sx={{
                  py: 0.5,
                  '&:first-of-type': { pt: 0 },
                  '&:last-of-type': { pb: 0 },
                }}
              >
                <ButtonBase
                  onClick={() => canExpand && toggleTable(table)}
                  disabled={!canExpand}
                  aria-expanded={canExpand ? isExpanded : undefined}
                  aria-controls={canExpand ? tableDetailsId : undefined}
                  aria-label={
                    canExpand
                      ? `${isExpanded ? 'Collapse' : 'Expand'} columns for ${table}`
                      : undefined
                  }
                  sx={{
                    ...(canExpand
                      ? getFlatStepControlSx(theme)
                      : { minHeight: { xs: 44, md: 32 } }),
                    width: '100%',
                    display: 'block',
                    textAlign: 'left',
                    px: { xs: 0.5, md: 1 },
                    py: 0.5,
                    cursor: canExpand ? 'pointer' : 'default',
                  }}
                  disableRipple
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 1.2,
                    }}
                  >
                    <Typography sx={{ ...type.primaryMono, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {table}
                    </Typography>
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.4,
                        flexShrink: 0,
                      }}
                    >
                      <Typography sx={type.metaLabel}>{columnCountLabel}</Typography>
                      {canExpand && (
                        <ExpandMoreIcon
                          sx={{
                            fontSize: 15,
                            color: theme.palette.text.secondary,
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: TRANSITIONS.default,
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                  {canExpand && !isExpanded && (
                    <Box sx={{ mt: 0.4 }}>
                      <ColumnList columns={columns} limit={5} />
                    </Box>
                  )}
                </ButtonBase>
                <Collapse in={isExpanded} timeout={200} unmountOnExit>
                  <Box
                    id={tableDetailsId}
                    sx={{
                      px: { xs: 0.5, md: 1 },
                      pb: 0.5,
                      pt: 0,
                    }}
                  >
                    <ColumnList columns={columns} />
                  </Box>
                </Collapse>
                {!hasColumnPayload && (
                  <Typography sx={{ px: 0.25, pb: 0.6, ...type.metaLabel }}>
                    Column details were not included in this schema response.
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

// ─── Table details result ─────────────────────────────────────────────────────

const TableDetailsResultDetails = ({ result, args }) => (
  <Box>
    <ToolMetaGrid
      items={[
        { label: 'Table', value: result.table || args?.table_name },
        { label: 'Columns', value: result.column_count ?? toArray(result.columns).length },
        { label: 'Source', value: result.source },
      ]}
    />
    <DetailLabel>Columns</DetailLabel>
    <ColumnList columns={result.columns} metadataLimit={6} />
    {toArray(result.constraints).length > 0 && (
      <Box sx={{ mt: 1.2 }}>
        <DetailLabel>Constraints</DetailLabel>
        <Typography
          component="pre"
          sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'monospace' }}
        >
          {JSON.stringify(result.constraints, null, 2)}
        </Typography>
      </Box>
    )}
  </Box>
);

// ─── Table row counts result ─────────────────────────────────────────────────

const TableRowCountsResultDetails = ({ result }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  const rows = getTableRowCountItems(result);

  return (
    <Box>
      <ToolMetaGrid items={[{ label: 'Tables', value: rows.length }]} />
      <DetailLabel>Exact row counts</DetailLabel>
      {rows.length === 0 ? (
        <EmptyResult>No table row counts returned.</EmptyResult>
      ) : (
        <Box component="dl" sx={{ display: 'grid', gap: 0, m: 0 }}>
          {rows.map(({ table, rowCount, isEstimate }) => (
            <Box
              key={table}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 1.5,
                px: 0.5,
                py: 0.5,
              }}
            >
              <Typography component="dt" sx={{ ...type.primaryMono, overflowWrap: 'anywhere' }}>
                {table}
              </Typography>
              <Typography component="dd" sx={{ ...type.metaValue, m: 0, flexShrink: 0 }}>
                {rowCount.toLocaleString()} rows{isEstimate ? ' (estimated)' : ''}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ─── Foreign keys result ──────────────────────────────────────────────────────

const ForeignKeysResultDetails = ({ result, args }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  const rows = toArray(result.foreign_keys);

  return (
    <Box>
      <ToolMetaGrid
        items={[
          { label: 'Table', value: result.table || args?.table_name || 'All tables' },
          { label: 'Relationships', value: result.count ?? rows.length },
        ]}
      />
      <DetailLabel>Relationships</DetailLabel>
      {rows.length === 0 ? (
        <EmptyResult>No foreign key relationships returned.</EmptyResult>
      ) : (
        <Box sx={{ display: 'grid', gap: 0 }}>
          {rows.map((fk, index) => (
            <Box
              key={`${fk.table_name}-${fk.column_name}-${fk.referenced_table}-${fk.referenced_column}-${index}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto minmax(0, 1fr)' },
                alignItems: 'center',
                gap: { xs: 0.5, md: 1 },
                px: 0.5,
                py: 0.5,
                bgcolor: 'transparent',
              }}
            >
              <Typography sx={{ ...type.primaryMono, overflowWrap: 'anywhere' }}>
                {fk.table_name}.{fk.column_name}
              </Typography>
              <Typography sx={{ ...type.metaLabel, textAlign: { xs: 'left', md: 'center' } }}>
                →
              </Typography>
              <Typography sx={{ ...type.primaryMono, overflowWrap: 'anywhere' }}>
                {fk.referenced_table}.{fk.referenced_column}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ─── Web search result ────────────────────────────────────────────────────────

const WebSearchResultDetails = ({ result, args }) => {
  const theme = useTheme();
  const interaction = getInteractionColors(theme);
  const type = getStepTypeScale(theme);
  const rows = getWebSearchItems(result);
  const query = result.query || args?.query;

  return (
    <Box>
      <ToolMetaGrid
        items={[
          { label: 'Query', value: query },
          { label: 'Sources', value: result.count ?? rows.length },
        ]}
      />
      <DetailLabel>Citations</DetailLabel>
      {rows.length === 0 ? (
        <EmptyResult>No citations returned.</EmptyResult>
      ) : (
        <Box sx={{ display: 'grid', gap: 0 }}>
          {rows.map((item, index) => {
            const normalizedContent = normalizeCitationMarkdown(item.content);
            return (
              <Box
                key={`${item.url}-${index}`}
                sx={{
                  py: { xs: 0.85, sm: 1.1 },
                  px: 0,
                  bgcolor: 'transparent',
                }}
              >
                {/* Title link */}
                <Link
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    color: interaction.activeColor,
                    ...theme.typography.uiBodySm,
                    fontWeight: theme.typography.fontWeightMedium,
                    textDecoration: 'none',
                    overflowWrap: 'anywhere',
                    transition: TRANSITIONS.default,
                    [HOVER_CAPABLE_QUERY]: {
                      '&:hover': {
                        color: interaction.hoverColor,
                        textDecoration: 'underline',
                      },
                    },
                    '&:focus-visible': {
                      outline: `2px solid ${interaction.focusRing}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  {index + 1}. {item.title || item.url || 'Untitled source'}
                </Link>

                {/* URL */}
                {item.url && (
                  <Link
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    sx={{
                      display: 'block',
                      mt: 0.2,
                      ...type.mutedMono,
                      color: interaction.restingColor,
                      textDecoration: 'none',
                      overflowWrap: 'anywhere',
                      transition: TRANSITIONS.default,
                      [HOVER_CAPABLE_QUERY]: {
                        '&:hover': {
                          color: interaction.hoverColor,
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                        },
                      },
                      '&:focus-visible': {
                        outline: `2px solid ${interaction.focusRing}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    {item.url}
                  </Link>
                )}

                {/* Snippet content */}
                {normalizedContent && (
                  <Box
                    sx={{
                      mt: 0.6,
                      ...type.body,
                      lineHeight: 1.6,
                      '& p': { mt: 0, mb: 0.65 },
                      '& p:last-child': { mb: 0 },
                      '& strong': {
                        color: theme.palette.text.primary,
                        fontWeight: theme.typography.fontWeightMedium,
                      },
                      '& h1, & h2, & h3, & h4, & h5, & h6': {
                        mt: 0.65,
                        mb: 0.3,
                        color: theme.palette.text.primary,
                        ...theme.typography.uiBodySm,
                        fontWeight: theme.typography.fontWeightMedium,
                      },
                      '& a': {
                        color: interaction.restingColor,
                        textDecorationColor: theme.palette.border.subtle,
                        textUnderlineOffset: '3px',
                      },
                      [HOVER_CAPABLE_QUERY]: {
                        '& a:hover': {
                          color: interaction.hoverColor,
                        },
                      },
                      '& a:focus-visible': {
                        color: interaction.hoverColor,
                        outline: `2px solid ${interaction.focusRing}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <MarkdownRenderer content={normalizedContent} variant="compact" />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

// ─── Query history result ─────────────────────────────────────────────────────

const QueryHistoryResultDetails = ({ result }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  const queries = getQueryHistoryItems(result);

  return (
    <Box>
      <ToolMetaGrid items={[{ label: 'Queries', value: result.count ?? queries.length }]} />
      <DetailLabel>Recent queries</DetailLabel>
      {queries.length === 0 ? (
        <EmptyResult>No recent queries returned.</EmptyResult>
      ) : (
        <Box component="ol" sx={{ display: 'grid', gap: 1.2, m: 0, pl: 2.5 }}>
          {queries.map((query, index) => (
            <Box component="li" key={`${query.executedAt}-${index}`} sx={{ minWidth: 0, pl: 0.4 }}>
              <ToolMetaGrid
                items={[
                  { label: 'Database', value: query.database },
                  { label: 'Status', value: query.status },
                  { label: 'Rows', value: query.rowCount },
                  { label: 'Executed', value: query.executedAt },
                ]}
              />
              <Typography
                component="pre"
                sx={{
                  ...type.secondaryMono,
                  m: 0,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {query.query}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ─── Generic result ───────────────────────────────────────────────────────────

const DETAIL_LABELS = {
  skill: 'Skill metadata',
  connection: 'Connection details',
  databases: 'Available databases',
  query: 'Execution metadata',
  analysis: 'Analysis result',
  indexes: 'Indexes',
  explain: 'Query plan',
  views: 'Database views',
  ui_action: 'Action details',
  memory: 'Memory lookup',
};

const GenericResultDetails = ({ stepName, result, isError, detailLabel }) => {
  const theme = useTheme();
  const type = getStepTypeScale(theme);
  const visibleResult = getTimelineResult(stepName, result);
  const view = getGenericResultView(visibleResult);
  const summary = getDetailedResult(stepName, result);

  if (isError || view.error) {
    return (
      <Typography sx={{ ...type.body, color: theme.palette.error.main, lineHeight: 1.6 }}>
        {summary}
      </Typography>
    );
  }

  return (
    <Box>
      <Typography sx={{ ...type.body, mb: view.metadata.length || view.structuredText ? 1 : 0 }}>
        {summary}
      </Typography>
      <ToolMetaGrid items={view.metadata} />
      {view.structuredText && (
        <Box>
          <DetailLabel>{detailLabel || 'Structured result'}</DetailLabel>
          <Typography
            component="pre"
            sx={{
              ...type.secondaryMono,
              m: 0,
              maxWidth: '100%',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {view.structuredText}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export function ToolResultDetails({ stepName, result, args, isError }) {
  if (isError)
    return <GenericResultDetails stepName={stepName} result={result} isError={isError} />;

  const presentation = AGENT_TOOL_ACTIONS[stepName]?.presentation;
  switch (presentation) {
    case 'schema':
      return <SchemaResultDetails result={result} />;
    case 'table_details':
      return <TableDetailsResultDetails result={result} args={args} />;
    case 'row_counts':
      return <TableRowCountsResultDetails result={result} />;
    case 'foreign_keys':
      return <ForeignKeysResultDetails result={result} args={args} />;
    case 'web_search':
      return <WebSearchResultDetails result={result} args={args} />;
    case 'query_history':
      return <QueryHistoryResultDetails result={result} />;
    case 'skill':
    case 'connection':
    case 'databases':
    case 'query':
    case 'analysis':
    case 'indexes':
    case 'explain':
    case 'views':
    case 'ui_action':
    case 'memory':
      return (
        <GenericResultDetails
          stepName={stepName}
          result={result}
          isError={isError}
          detailLabel={DETAIL_LABELS[presentation]}
        />
      );
    default:
      return <GenericResultDetails stepName={stepName} result={result} isError={isError} />;
  }
}
