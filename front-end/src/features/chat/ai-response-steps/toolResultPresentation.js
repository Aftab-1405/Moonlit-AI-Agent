const MAX_TOP_LEVEL_ENTRIES = 20;
const MAX_ARRAY_ITEMS = 50;
const MAX_JSON_CHARACTERS = 4000;
const MAX_SCALAR_CHARACTERS = 500;
const MAX_NESTING_DEPTH = 4;
const TRUNCATION_MARKER = '… truncated';

function humanizeName(name = '') {
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

export function getTableRowCountItems(result) {
  if (!Array.isArray(result?.row_counts)) return [];

  return result.row_counts
    .filter(
      (item) =>
        item &&
        typeof item.table === 'string' &&
        item.table.length > 0 &&
        typeof item.row_count === 'number' &&
        Number.isFinite(item.row_count) &&
        item.row_count >= 0,
    )
    .map((item) => ({
      table: item.table,
      rowCount: item.row_count,
      isEstimate: Boolean(item.is_estimate),
    }));
}

export function getColumnDisplayMeta(column) {
  if (!column || typeof column !== 'object') return [];

  const dataType = column.data_type ?? column.type;
  const isNullable = column.is_nullable ?? column.nullable;
  const defaultValue = column.default ?? column.default_value;
  const maxLength = column.max_length;

  return [
    dataType,
    column.is_primary_key ? 'PK' : null,
    typeof isNullable === 'boolean' ? (isNullable ? 'NULLABLE' : 'NOT NULL') : null,
    column.is_unique ? 'UNIQUE' : null,
    maxLength !== undefined && maxLength !== null ? `MAX ${maxLength}` : null,
    defaultValue !== undefined && defaultValue !== null ? `DEFAULT ${defaultValue}` : null,
  ].filter((value) => value !== undefined && value !== null && value !== '');
}

export function getDetailedResult(name, result) {
  if (!result) return 'No result';
  if (result.success === false || result.error) {
    return `Error: ${result.error || result.message || 'Unknown error'}`;
  }

  const details = {
    read_skill: () => {
      const skillName = humanizeName(result.skill_name || result.skillName || 'skill');
      return result.already_loaded
        ? `Reused ${skillName} instructions`
        : `Loaded ${skillName} instructions`;
    },
    get_connection_status: () => {
      if (!result.connected) return 'Not connected to any database';
      let message = `Connected to ${result.database || 'database'}`;
      if (result.db_type) message += ` (${String(result.db_type).toUpperCase()})`;
      return message;
    },
    get_database_list: () => {
      const count = result.count ?? result.databases?.length ?? 0;
      return `Found ${count} available ${plural(count, 'database')}`;
    },
    execute_query: () => {
      const rowCount = result.row_count ?? 0;
      const totalRows = result.total_rows ?? rowCount;
      let message = `Query returned ${rowCount} ${plural(rowCount, 'row')}`;
      if (result.truncated && totalRows > rowCount) {
        message += ` (of ${totalRows.toLocaleString()} total)`;
      }
      return message;
    },
    analyze_query_result: () => {
      const rows = result.analyzed_rows ?? 0;
      const columns = result.columns;
      if (result.operation === 'correlation' && Array.isArray(columns) && columns.length === 2) {
        const coefficient = Number(result.pearson_correlation);
        const formatted = Number.isFinite(coefficient) ? coefficient.toFixed(3) : 'unavailable';
        return `Correlation over ${rows} rows: ${columns[0]} vs ${columns[1]} (r = ${formatted})`;
      }
      const columnCount = columns && !Array.isArray(columns) ? Object.keys(columns).length : 0;
      if (result.operation === 'data_quality') {
        const duplicates = result.duplicate_row_count ?? 0;
        return `Checked ${rows} rows across ${columnCount} columns; found ${duplicates} duplicate ${plural(duplicates, 'row')}`;
      }
      return `Profiled ${rows} rows across ${columnCount} columns`;
    },
    get_table_indexes: () => {
      const count = result.count ?? result.indexes?.length ?? 0;
      const table = result.table ? ` on ${result.table}` : '';
      return `Found ${count} ${plural(count, 'index', 'indexes')}${table}`;
    },
    get_schema_overview: () => {
      const count = result.table_count ?? result.tables?.length ?? 0;
      const database = result.database ? ` from ${result.database}` : '';
      return `Retrieved ${count} ${plural(count, 'table')}${database}`;
    },
    explain_query: () => {
      const rowCount = result.row_count ?? result.plan?.length ?? 0;
      const format = result.plan_format ? ` ${result.plan_format}` : '';
      const truncated = result.truncated ? ', truncated' : '';
      return `Retrieved${format} query plan (${rowCount} ${plural(rowCount, 'row')}${truncated})`;
    },
    get_table_details: () => {
      const count = result.column_count ?? result.columns?.length ?? 0;
      const table = result.table ? ` for ${result.table}` : '';
      return `Retrieved ${count} ${plural(count, 'column')}${table}`;
    },
    get_table_row_counts: () => {
      const rowCounts = getTableRowCountItems(result);
      if (rowCounts.length === 0) return 'No table row counts returned';
      const values = rowCounts
        .map(
          ({ table, rowCount, isEstimate }) =>
            `${table} (${rowCount.toLocaleString()} rows${isEstimate ? ', estimated' : ''})`,
        )
        .join(', ');
      return `Counted ${rowCounts.length} ${plural(rowCounts.length, 'table')}: ${values}`;
    },
    get_foreign_keys: () => {
      const count = result.count ?? result.foreign_keys?.length ?? 0;
      const table = result.table ? ` for ${result.table}` : '';
      return `Found ${count} foreign key ${plural(count, 'relationship')}${table}`;
    },
    list_views: () => {
      const count =
        result.count ?? (result.views?.length ?? 0) + (result.materialized_views?.length ?? 0);
      return `Found ${count} database ${plural(count, 'view')}`;
    },
    web_search: () => {
      const count = result.count ?? result.results?.length ?? 0;
      const query = result.query ? ` for "${result.query}"` : '';
      return `Found ${count} cited ${plural(count, 'source')}${query}`;
    },
    get_query_history: () => {
      const count = result.count ?? result.queries?.length ?? 0;
      return `Retrieved ${count} recent ${plural(count, 'query', 'queries')}`;
    },
    open_sql_editor: () => 'UI action completed: SQL editor opened',
    write_sql_editor_query: () => 'UI action completed: query prepared',
    open_database_modal: () => 'UI action completed: database modal opened',
    open_settings_modal: () => 'UI action completed: settings opened',
    navigate_new_chat: () => {
      if (result.requiresConfirmation && result.approved === false) {
        return 'UI action declined: stayed in the current chat';
      }
      if (result.requiresConfirmation && result.approved !== true) {
        return 'UI action awaiting confirmation: new chat';
      }
      return 'UI action completed: new chat opened';
    },
    retrieve_memory: () => {
      const query = result.query ? ` for "${result.query}"` : '';
      return result.found
        ? `Found conversation memory${query}`
        : `No conversation memory found${query}`;
    },
  };

  return details[name]?.() || 'Structured result available';
}

function isScalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function boundValue(value, state, depth = 0) {
  if (isScalar(value)) {
    if (typeof value === 'string' && value.length > MAX_SCALAR_CHARACTERS) {
      state.truncated = true;
      return `${value.slice(0, MAX_SCALAR_CHARACTERS)} ${TRUNCATION_MARKER}`;
    }
    return value;
  }
  if (depth >= MAX_NESTING_DEPTH) {
    state.truncated = true;
    return TRUNCATION_MARKER;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) state.truncated = true;
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => boundValue(item, state, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > MAX_TOP_LEVEL_ENTRIES) state.truncated = true;
    return Object.fromEntries(
      entries
        .slice(0, MAX_TOP_LEVEL_ENTRIES)
        .map(([key, nestedValue]) => [key, boundValue(nestedValue, state, depth + 1)]),
    );
  }
  state.truncated = true;
  return String(value);
}

export function getGenericResultView(result) {
  if (result?.success === false || result?.error) {
    return {
      error: result.error || result.message || 'Unknown error',
      metadata: [],
      structuredText: '',
      truncated: false,
    };
  }

  const state = { truncated: false };
  const entries =
    result && typeof result === 'object' && !Array.isArray(result) ? Object.entries(result) : [];
  if (entries.length > MAX_TOP_LEVEL_ENTRIES) state.truncated = true;
  const boundedEntries = entries.slice(0, MAX_TOP_LEVEL_ENTRIES);
  const metadata = [];
  const structured = {};

  for (const [key, value] of boundedEntries) {
    if (key === 'success' || key === 'error' || key === 'error_code') continue;
    if (isScalar(value)) {
      metadata.push({ label: humanizeName(key), value: boundValue(value, state) });
    } else {
      structured[key] = boundValue(value, state, 1);
    }
  }

  if (state.truncated) structured._notice = TRUNCATION_MARKER;
  let structuredText =
    Object.keys(structured).length > 0 ? JSON.stringify(structured, null, 2) : '';
  if (structuredText.length > MAX_JSON_CHARACTERS) {
    state.truncated = true;
    structuredText = `${structuredText.slice(0, MAX_JSON_CHARACTERS - 15)}\n${TRUNCATION_MARKER}`;
  }
  if (state.truncated && !/truncated/i.test(structuredText)) {
    structuredText = JSON.stringify({ _notice: TRUNCATION_MARKER }, null, 2);
  }

  return { error: null, metadata, structuredText, truncated: state.truncated };
}

export function getTimelineResult(toolName, result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  if (toolName === 'retrieve_memory') {
    const { memories: _memories, ...safeMetadata } = result;
    return safeMetadata;
  }
  if (toolName !== 'execute_query') return result;
  const {
    data: _data,
    preview: _preview,
    preview_note: _previewNote,
    preview_row_count: _previewRowCount,
    preview_is_partial: _previewIsPartial,
    full_result_location: _fullResultLocation,
    ...metadata
  } = result;
  return metadata;
}

export function getQueryHistoryItems(result) {
  if (!Array.isArray(result?.queries)) return [];
  return result.queries
    .slice(0, 10)
    .filter((item) => item && typeof item.query === 'string' && item.query.length > 0)
    .map((item) => ({
      query: item.query,
      database: typeof item.database === 'string' ? item.database : '',
      rowCount:
        typeof item.row_count === 'number' && Number.isFinite(item.row_count) ? item.row_count : 0,
      status: typeof item.status === 'string' ? item.status : '',
      executedAt: typeof item.executed_at === 'string' ? item.executed_at : '',
    }));
}

export function getWebSearchItems(result) {
  if (!Array.isArray(result?.results)) return [];
  return result.results
    .slice(0, 5)
    .filter((item) => {
      if (!item || typeof item.url !== 'string') return false;
      try {
        const url = new URL(item.url);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    })
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      url: item.url,
      content: typeof item.content === 'string' ? item.content : '',
    }));
}
