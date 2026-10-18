const STORAGE_PREFIX = 'moonlit:perspective:v4:';
const _SAMPLE_SIZE = 100;

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createAnalysisStorageKey({ userId = '', sourceQuery = '', columns = [], database = '' }) {
  const identity = JSON.stringify({ sourceQuery, columns, database });
  const accountPrefix = userId ? `moonlit:${userId}:perspective:v4:` : STORAGE_PREFIX;
  return `${accountPrefix}${hashText(identity)}`;
}

export function loadAnalysisConfig(storageKey) {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return null;
    const { table: _ephemeralTable, ...config } = JSON.parse(value);
    return config;
  } catch {
    return null;
  }
}

export function saveAnalysisConfig(storageKey, config) {
  if (!storageKey || !config || typeof window === 'undefined') return false;
  try {
    const { table: _ephemeralTable, ...portableConfig } = config;
    window.localStorage.setItem(storageKey, JSON.stringify(portableConfig));
    return true;
  } catch {
    return false;
  }
}

export function clearAnalysisConfig(storageKey) {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function inferColumnType(values) {
  const populated = values.filter((value) => value !== null && value !== undefined);
  if (!populated.length) return 'string';
  if (populated.every((value) => typeof value === 'boolean')) return 'boolean';
  if (populated.every((value) => Number.isInteger(value))) return 'integer';
  if (populated.every((value) => typeof value === 'number' && Number.isFinite(value)))
    return 'float';
  if (
    populated.every(
      (value) =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
    )
  ) {
    return 'date';
  }
  if (
    populated.every(
      (value) =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(value) &&
        !Number.isNaN(Date.parse(value)),
    )
  ) {
    return 'datetime';
  }
  return 'string';
}

/**
 * Convert row-oriented data to Perspective's column-oriented format.
 *
 * Type-aware coercion: when `column_types` is provided, values are coerced
 * to match the declared Perspective type. This fixes two critical issues:
 *
 *   1. **Decimal/float mismatch.** The backend converts `Decimal` to `float`
 *      in `_normalize_rows()`, but if any string-encoded numbers slip through
 *      (e.g. from older backend versions or the agent path), Perspective
 *      would receive a string `"19.99"` for a `float` column → `NaN`. We
 *      coerce strings to numbers when the schema says `float` or `integer`.
 *
 *   2. **Datetime format mismatch.** The backend sends ISO 8601 strings
 *      (`"2024-01-15T10:30:00"`) for `datetime`/`date` columns. Perspective's
 *      `datetime` and `date` types expect **epoch milliseconds** (numbers),
 *      not ISO strings. Without conversion, Perspective treats the column as
 *      strings — breaking time-based aggregations, filtering, and chart axes.
 *      We convert ISO strings to epoch ms when the schema says `datetime` or
 *      `date`.
 *
 * @param {string[]} columns        — column names
 * @param {Array[]} rows           — row-oriented data (rows[i][colIdx])
 * @param {Object}  column_types    — map of column name → Perspective type
 * @returns {Object} column-oriented data ready for `table.update()`
 */
export function toColumnar(columns, rows, column_types = {}) {
  const out = {};
  columns.forEach((col, idx) => {
    const type = column_types[col];
    out[col] = rows.map((row) => {
      const val = row[idx];

      // Null/undefined → null (Perspective's null representation)
      if (val == null) return null;

      // Object values (arrays, nested objects) → JSON string
      // Perspective doesn't have a JSON/object column type.
      if (val && typeof val === 'object') return JSON.stringify(val);

      // Type-aware coercion based on the declared Perspective schema
      if (type === 'float') {
        if (typeof val === 'string') {
          const n = parseFloat(val);
          return Number.isNaN(n) ? null : n;
        }
        return typeof val === 'number' ? val : Number(val);
      }

      if (type === 'integer') {
        if (typeof val === 'string') {
          const n = parseInt(val, 10);
          return Number.isNaN(n) ? null : n;
        }
        return typeof val === 'number' ? Math.trunc(val) : Number(val);
      }

      if (type === 'datetime') {
        // Perspective's datetime type expects epoch milliseconds.
        // The backend sends ISO 8601 strings (e.g. "2024-01-15T10:30:00").
        if (typeof val === 'string') {
          const ms = Date.parse(val);
          return Number.isNaN(ms) ? null : ms;
        }
        if (typeof val === 'number') return val; // already epoch
        return null;
      }

      if (type === 'date') {
        // Perspective's date type also expects epoch milliseconds, but at
        // midnight UTC. The backend sends "2024-01-15" (ISO date).
        if (typeof val === 'string') {
          // Date-only strings need a time component for Date.parse
          const iso = val.length === 10 ? `${val}T00:00:00Z` : val;
          const ms = Date.parse(iso);
          return Number.isNaN(ms) ? null : ms;
        }
        if (typeof val === 'number') return val;
        return null;
      }

      if (type === 'boolean') {
        if (typeof val === 'string') {
          if (val === 'true' || val === '1' || val === 't') return true;
          if (val === 'false' || val === '0' || val === 'f') return false;
          return null;
        }
        return Boolean(val);
      }

      // Default: pass through as-is (strings, etc.)
      return val;
    });
  });
  return out;
}
