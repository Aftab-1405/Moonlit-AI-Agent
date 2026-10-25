/** Canonical SQL snapshots. Legacy data has unknown scope, never assumed complete. */
export function normalizeQueryResult(payload = {}) {
  const canonical =
    payload.tabular_result ||
    (payload.result && !Array.isArray(payload.result) ? payload.result : payload);
  const sourceRows =
    canonical.rows ||
    (Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.result)
        ? payload.result
        : []);
  const columns =
    canonical.columns ||
    payload.columns ||
    (sourceRows[0] && !Array.isArray(sourceRows[0]) ? Object.keys(sourceRows[0]) : []);
  const metadata = canonical.result_metadata || payload.result_metadata || null;
  return {
    columns,
    expired: canonical.expired === true,
    rows: sourceRows.map((row) =>
      Array.isArray(row) ? row : columns.map((column) => row[column] ?? null),
    ),
    column_types: canonical.column_types || payload.column_types || {},
    column_metadata: canonical.column_metadata || payload.column_metadata || [],
    result_metadata: metadata,
    row_count: metadata?.returned_rows ?? payload.row_count ?? sourceRows.length,
    total_rows: payload.total_rows ?? null,
    truncated: metadata ? metadata.completeness === 'truncated' : payload.truncated === true,
    execution_time:
      (metadata?.execution_time_ms ?? payload.execution_time_ms) != null
        ? (metadata?.execution_time_ms ?? payload.execution_time_ms) / 1000
        : (payload.execution_time ?? null),
    client_metrics: payload.client_metrics || canonical.client_metrics || null,
  };
}

function inferredType(values) {
  const populated = values.filter((value) => value != null);
  if (!populated.length) return 'string';
  if (populated.every((value) => typeof value === 'boolean')) return 'boolean';
  if (populated.every((value) => typeof value === 'number')) {
    return populated.every(
      (value) => Number.isInteger(value) && value >= -(2 ** 31) && value < 2 ** 31,
    )
      ? 'integer'
      : 'float';
  }
  return 'string';
}

function uniqueLabel(label, reserved, used, position) {
  let candidate = label;
  if (used.has(candidate)) {
    candidate = `${label} [${position + 1}]`;
    while (reserved.has(candidate) || used.has(candidate)) candidate += '·';
  }
  used.add(candidate);
  return candidate;
}

/** Preserve exact source columns; expose separately labelled floating approximations. */
export function buildPerspectiveData(input) {
  const data = normalizeQueryResult(input);
  const schema = Object.create(null);
  const columnar = Object.create(null);
  const notices = new Set();
  const labels = data.columns.map((key, index) => {
    const meta = data.column_metadata[index];
    const label = String(meta?.label ?? key);
    return meta?.timezone === 'unavailable' ? `${label} (timezone unavailable)` : label;
  });
  const reserved = new Set(labels);
  const used = new Set();
  data.columns.forEach((key, index) => {
    const meta = data.column_metadata[index] || {};
    const label = uniqueLabel(labels[index], reserved, used, index);
    const values = data.rows.map((row) => row[index] ?? null);
    for (const value of values) {
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) ||
          (Number.isInteger(value) &&
            !Number.isSafeInteger(value) &&
            meta.perspective_type !== 'float' &&
            data.column_types[key] !== 'float'))
      ) {
        throw new Error(
          `Column “${label}” contains an unsafe integer or non-finite number. Rerun the query to load lossless source values.`,
        );
      }
    }
    let type = meta.perspective_type || data.column_types[key] || inferredType(values);
    if (
      type === 'integer' &&
      values.some(
        (value) =>
          value != null &&
          (typeof value !== 'number' ||
            !Number.isInteger(value) ||
            value < -(2 ** 31) ||
            value >= 2 ** 31),
      )
    ) {
      type = values.every((value) => value == null || typeof value === 'number')
        ? 'float'
        : 'string';
    }
    // Never infer a timezone for legacy datetime strings either.
    if (
      type === 'datetime' &&
      values.some((value) => typeof value === 'string' && !/(Z|[+-]\d\d:\d\d)$/.test(value))
    ) {
      type = 'string';
      notices.add('Timezone-naive timestamps remain source text; no timezone is inferred.');
    }
    if (!['integer', 'float', 'boolean', 'date', 'datetime', 'string'].includes(type))
      type = 'string';
    schema[label] = type;
    columnar[label] = values.map((value) => {
      if (value == null) return null;
      if (type === 'string')
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (type === 'date' || type === 'datetime') {
        const epoch =
          typeof value === 'number'
            ? value
            : Date.parse(type === 'date' ? `${String(value).slice(0, 10)}T00:00:00Z` : value);
        if (!Number.isFinite(epoch))
          throw new Error(`Column “${label}” contains an invalid ${type} value.`);
        return epoch;
      }
      if (type === 'boolean' && typeof value !== 'boolean')
        throw new Error(`Column “${label}” contains an invalid boolean value.`);
      if ((type === 'integer' || type === 'float') && typeof value !== 'number')
        throw new Error(
          `Column “${label}” contains a non-numeric value; rerun the query with current type metadata.`,
        );
      return value;
    });
    if (meta.timezone === 'naive' || meta.timezone === 'offset') {
      notices.add(
        'Timestamp source text preserves its original timezone semantics; date grouping requires an explicit SQL expression.',
      );
    }
    if (meta.encoding === 'decimal-string' || meta.encoding === 'integer-string') {
      let approximation = `${label} (approximate)`;
      while (reserved.has(approximation) || used.has(approximation)) approximation += '·';
      used.add(approximation);
      const numeric = values.map((value) => (value == null ? null : Number(value)));
      if (numeric.every((value) => value == null || Number.isFinite(value))) {
        schema[approximation] = 'float';
        columnar[approximation] = numeric;
        notices.add(
          'Columns labelled “approximate” use floating-point arithmetic and may round values and totals. Original source columns and source CSV retain exact values; use SQL for exact calculations.',
        );
      } else {
        notices.add(
          `“${label}” exceeds the finite numeric analysis range; its exact source text is retained.`,
        );
      }
    } else if (meta.analysis_semantics && !['json', 'text', 'iso8601'].includes(meta.encoding)) {
      notices.add(meta.analysis_semantics);
    }
  });
  return {
    schema: Object.fromEntries(Object.entries(schema)),
    columnar: Object.fromEntries(Object.entries(columnar)),
    notices: [...notices],
  };
}

export function describeResultScope(input) {
  const data = normalizeQueryResult(input);
  const meta = data.result_metadata;
  const scope =
    meta?.completeness === 'complete'
      ? 'Complete query result'
      : meta?.completeness === 'truncated' || data.truncated
        ? 'Truncated query result'
        : 'Completeness unknown';
  const limit =
    meta?.effective_limit != null
      ? ` · Limit ${meta.effective_limit.toLocaleString('en-US')}`
      : ' · Limit unknown';
  return `${scope} · ${data.rows.length.toLocaleString('en-US')} rows loaded${limit}`;
}

export function resultToCsv(input) {
  const data = normalizeQueryResult(input);
  const quote = (value) => {
    if (value == null) return '';
    if (value === '') return '""';
    const text =
      value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const labels = data.columns.map((key, i) => data.column_metadata[i]?.label ?? key);
  return [labels, ...data.rows].map((row) => row.map(quote).join(',')).join('\r\n');
}

/** Portable provenance for source exports and the currently configured view. */
export function resultExportMetadata(input, viewConfig = null) {
  const data = normalizeQueryResult(input);
  const { table: _table, ...portableConfig } = viewConfig || {};
  return {
    version: 1,
    result_metadata: data.result_metadata,
    column_metadata: data.column_metadata,
    scope: describeResultScope(data),
    coverage:
      'Filters, pivots, totals and exports cover the loaded SQL result, not necessarily all database rows.',
    calculation_semantics:
      'Columns labelled approximate use floating-point arithmetic and may round values and totals. Source numeric text retains exact values.',
    source_csv_null_encoding:
      'Unquoted empty field means null; quoted empty field means empty string. Use a CSV reader that preserves this distinction.',
    view_config: viewConfig ? portableConfig : null,
  };
}
