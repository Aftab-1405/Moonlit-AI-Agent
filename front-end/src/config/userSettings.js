/**
 * User preferences synced per account via the API (Firestore-backed).
 * @module config/userSettings
 */

export const defaultUserSettings = {
  confirmBeforeRun: false,
  queryTimeout: 30,
  maxRows: 1000,
  nullDisplay: 'NULL',
  rememberConnection: false,
  defaultDbType: 'postgresql',
  connectionPersistence: 0,
  enableReasoning: true,
  reasoningEffort: 'medium',
  responseStyle: 'balanced',
  // ENH [AUTO-TASK-MODE]: User's preferred task mode. 'auto' lets the
  // backend auto-detect from the prompt; the other values force the mode
  // for every message in this conversation.
  taskMode: 'auto',
  llmProvider: null,
  llmModel: null,
};

export const REASONING_EFFORT_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** Supported reasoning models clamp disabled reasoning to Low, not Off. */
export function getEffectiveReasoningEffort(settings) {
  if (settings.enableReasoning === false) return 'low';
  return REASONING_EFFORT_OPTIONS.some(({ value }) => value === settings.reasoningEffort)
    ? settings.reasoningEffort
    : 'medium';
}

/**
 * Valid task-mode values for the user-facing selector.
 * 'auto' is the default — the backend classifier decides per prompt.
 */
export const TASK_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Backend auto-detects from prompt' },
  { value: 'normal', label: 'Standard', description: '50 steps — quick Q&A' },
  { value: 'tool_task', label: 'Tool Task', description: '100 steps — multi-tool workflows' },
  { value: 'long_task', label: 'Long Task', description: '200 steps — reports & deep analysis' },
];

/**
 * Map the user-facing taskMode setting to the backend task_mode value.
 * 'auto' is translated to 'normal' on the wire (the backend classifier
 * will then upgrade it if the prompt matches). The other values are
 * passed through unchanged so the backend respects the explicit choice.
 *
 * @param {string} userTaskMode - The user's taskMode setting
 * @returns {string} The backend task_mode value to send
 */
export function toBackendTaskMode(userTaskMode) {
  if (userTaskMode === 'auto' || !userTaskMode) return 'normal';
  return userTaskMode;
}

/** Keys persisted to the server for cross-browser sync. */
const SYNCABLE_SETTING_KEYS = Object.keys(defaultUserSettings);

const NUMERIC_KEYS = new Set(['queryTimeout', 'maxRows', 'connectionPersistence']);

/**
 * Build a partial settings object for POST /user/settings.
 * @param {Object} settings
 * @returns {Object}
 */
export function pickSyncableSettings(settings = {}) {
  const payload = {};
  for (const key of SYNCABLE_SETTING_KEYS) {
    if (settings[key] === undefined) continue;
    let value = settings[key];
    if (NUMERIC_KEYS.has(key) && value !== null && value !== '') {
      value = Number(value);
      if (Number.isNaN(value)) continue;
    }
    payload[key] = value;
  }
  return payload;
}

/**
 * Map API settings payload onto SettingsContext keys.
 * @param {Object} serverPayload
 * @returns {Object}
 */
export function mapServerSettingsToClient(serverPayload = {}) {
  const source = serverPayload.settings ?? serverPayload;
  const patch = {};

  for (const key of SYNCABLE_SETTING_KEYS) {
    if (source[key] === undefined || source[key] === null) continue;
    let value = source[key];
    if (NUMERIC_KEYS.has(key)) {
      value = Number(value);
      if (Number.isNaN(value)) continue;
    }
    patch[key] = value;
  }

  const legacyPersistence = source.connectionPersistenceMinutes;
  if (
    patch.connectionPersistence === undefined &&
    legacyPersistence !== undefined &&
    legacyPersistence !== null
  ) {
    const minutes = Number(legacyPersistence);
    if (!Number.isNaN(minutes)) {
      patch.connectionPersistence = minutes;
    }
  }

  return patch;
}
