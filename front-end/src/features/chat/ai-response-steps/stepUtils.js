import { TOOL_ACTIONS } from '../../../config/toolActions.js';

export {
  getColumnDisplayMeta,
  getDetailedResult,
  getGenericResultView,
  getQueryHistoryItems,
  getTableRowCountItems,
  getTimelineResult,
  getWebSearchItems,
} from './toolResultPresentation.js';

function formatToolName(name = '') {
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStepId(step, idx) {
  if (step?.id) return String(step.id);
  if (step?.type === 'tool') {
    const status = step.status || 'unknown';
    const name = step.name || 'tool';
    return `tool-${idx}-${name}-${status}`;
  }
  return `thinking-${idx}`;
}

function isSemanticFailure(name, result) {
  if (!result) return false;
  if (result.success === false || result.error) return true;
  switch (name) {
    case 'get_connection_status':
      return result.connected === false;
    case 'get_database_list':
      return (result.count ?? result.databases?.length ?? 0) === 0;
    case 'get_schema_overview':
      return (result.table_count ?? result.tables?.length ?? 0) === 0;
    default:
      return false;
  }
}

export function normalizeSteps(steps) {
  const validSteps = Array.isArray(steps) ? steps.filter((step) => step?.type) : [];
  return validSteps
    .map((step, idx) => {
      if (step.type === 'thinking') {
        return {
          id: getStepId(step, idx),
          type: 'thinking',
          content: step.content || '',
          isComplete: Boolean(step.isComplete),
        };
      }

      if (step.type === 'skill') {
        return {
          id: step.id || `skill-${idx}`,
          type: 'skill',
          skills: Array.isArray(step.skills) ? step.skills : [],
        };
      }

      if (step.type === 'tool') {
        const parsedArgs = step.args;
        const parsedResult = step.result;
        const isRunning = step.status === 'running';
        const config = TOOL_ACTIONS[step.name];
        return {
          id: getStepId(step, idx),
          type: 'tool',
          name: step.name,
          actionText: config
            ? isRunning
              ? config.running
              : config.done
            : formatToolName(step.name),
          parsedArgs,
          parsedResult,
          isRunning,
          isError: step.status === 'error' || isSemanticFailure(step.name, parsedResult),
        };
      }

      return null;
    })
    .filter(Boolean);
}

/**
 * Extract a short semantic subject from a tool's parsed result, for use in
 * the count-based summary (e.g., "Analyzed 6 tables"). Returns null when
 * no meaningful subject can be derived — the caller falls back to the
 * action text in that case.
 *
 * The mapping is intentionally conservative: we only extract a subject
 * for tools whose result carries a clear countable noun (tables, columns,
 * rows, indexes, foreign keys, databases). For everything else we return
 * null so the summary uses the humanized action text instead.
 */
function extractToolSubject(step) {
  if (!step?.parsedResult || typeof step.parsedResult !== 'object') return null;
  const r = step.parsedResult;
  switch (step.name) {
    case 'get_schema_overview':
    case 'get_database_list': {
      const count = r.table_count ?? r.tables?.length ?? r.count ?? r.databases?.length;
      const noun = step.name === 'get_database_list' ? 'database' : 'table';
      if (typeof count === 'number') return `${count} ${noun}${count !== 1 ? 's' : ''}`;
      return null;
    }
    case 'get_table_details': {
      const count = r.column_count ?? r.columns?.length;
      if (typeof count === 'number') return `${count} column${count !== 1 ? 's' : ''}`;
      return null;
    }
    case 'get_table_row_counts': {
      const count = r.table_count ?? r.row_counts?.length;
      if (typeof count === 'number') return `${count} table count${count !== 1 ? 's' : ''}`;
      return null;
    }
    case 'execute_query': {
      const count = r.row_count ?? 0;
      return `${count.toLocaleString()} row${count !== 1 ? 's' : ''}`;
    }
    case 'get_table_indexes': {
      const count = r.count ?? r.indexes?.length ?? 0;
      return `${count} index${count !== 1 ? 'es' : ''}`;
    }
    case 'get_foreign_keys': {
      const count = r.count ?? r.foreign_keys?.length ?? 0;
      return `${count} foreign key${count !== 1 ? 's' : ''}`;
    }
    case 'list_views': {
      const count = r.views?.length ?? 0;
      return `${count} view${count !== 1 ? 's' : ''}`;
    }
    case 'web_search': {
      const count = r.count ?? r.results?.length ?? 0;
      return `${count} source${count !== 1 ? 's' : ''}`;
    }
    default:
      return null;
  }
}

/**
 * Pick a verb that best describes the overall phase of work done by a group
 * of completed tools. We look at the tool mix and choose the most
 * semantically significant verb:
 *   - Any execute_query present   → "Analyzed"
 *   - Only schema/structure tools → "Retrieved"
 *   - Only thinking steps         → "Reasoned"
 *   - Fallback                    → "Processed"
 */
function pickPhaseVerb(completedTools) {
  if (completedTools.length === 0) return 'Processed';
  const hasQuery = completedTools.some((t) => t.name === 'execute_query');
  if (hasQuery) return 'Analyzed';
  return 'Retrieved';
}

export function buildStepsSummary(normalizedSteps) {
  if (normalizedSteps.length === 0) return '';

  // ── Live state: a tool is currently running ──────────────────────────
  // Show the running tool's action so the user sees live progress. If
  // other tools have already completed in this phase, prepend a short
  // "done X, now Y" lead-in so the summary reads naturally.
  const activeTool = normalizedSteps.find((s) => s.type === 'tool' && s.isRunning);
  if (activeTool) {
    const completedTools = normalizedSteps.filter(
      (s) => s.type === 'tool' && !s.isRunning && !s.isError,
    );
    if (completedTools.length === 0) {
      return activeTool.actionText;
    }
    if (completedTools.length === 1) {
      return `${completedTools[0].actionText}, now ${activeTool.actionText.toLowerCase()}`;
    }
    // 2+ completed + 1 running → "Retrieved schema and 1 more, getting columns"
    return `${completedTools[0].actionText} and ${completedTools.length - 1} more, ${activeTool.actionText.toLowerCase()}`;
  }

  const activeThinking = normalizedSteps.find((s) => s.type === 'thinking' && !s.isComplete);
  if (activeThinking) {
    if (activeThinking.id?.startsWith('workflow-')) {
      return activeThinking.content;
    }
    return 'Thinking';
  }

  const completedTools = normalizedSteps.filter((s) => s.type === 'tool' && !s.isRunning);
  const thinkingSteps = normalizedSteps.filter((s) => s.type === 'thinking');
  const errorTools = completedTools.filter((s) => s.isError);

  // ── Error state: surface the failure in the summary ─────────────────
  if (errorTools.length > 0) {
    if (errorTools.length === 1) return `${errorTools[0].actionText} (failed)`;
    return `${errorTools.length} tools failed`;
  }

  if (completedTools.length === 0) {
    if (thinkingSteps.length > 0) {
      const workflowStep = thinkingSteps.find((s) => s.id?.startsWith('workflow-'));
      if (workflowStep) {
        return workflowStep.content;
      }
      return 'Reasoned through the request';
    }
    const skillSteps = normalizedSteps.filter((s) => s.type === 'skill');
    if (skillSteps.length > 0) {
      return 'Loaded skills';
    }
    return 'Processing';
  }

  // ── Completed state ──────────────────────────────────────────────────
  const actions = completedTools.map((s) => s.actionText);

  // 1 tool → just its action text ("Retrieved schema overview")
  if (actions.length === 1) return actions[0];

  // 2 tools → join with comma ("Retrieved schema, queried data")
  if (actions.length === 2) return actions.join(', ');

  // 3+ tools → count-based summary with semantic subject when available.
  // Format: "<Verb> <subject> · <N> tools used"
  //   e.g., "Retrieved 6 tables · 3 tools used"
  //   e.g., "Analyzed 12,000 rows · 5 tools used"
  // If no subject can be derived, fall back to the first two action texts
  // plus a count: "Retrieved schema, queried data · 5 tools used"
  const verb = pickPhaseVerb(completedTools);

  // Try to find the most informative subject across all completed tools.
  // Prefer execute_query row counts, then schema/table counts, then
  // anything else extractable.
  const subjects = completedTools.map(extractToolSubject).filter(Boolean);
  const uniqueSubjects = [...new Set(subjects)];

  const toolCountSuffix = ` · ${completedTools.length} tool${completedTools.length !== 1 ? 's' : ''} used`;

  if (uniqueSubjects.length > 0) {
    // Use the first subject — it's usually the broadest (schema overview
    // comes before column details, etc.).
    return `${verb} ${uniqueSubjects[0]}${toolCountSuffix}`;
  }

  // No extractable subject — fall back to action-text-based summary.
  return `${actions.slice(0, 2).join(', ')}${toolCountSuffix}`;
}

export function isAnyStepActive(normalizedSteps) {
  return normalizedSteps.some(
    (s) => (s.type === 'tool' && s.isRunning) || (s.type === 'thinking' && !s.isComplete),
  );
}

export function getCurrentStepIndex(normalizedSteps) {
  return normalizedSteps.findIndex(
    (step) =>
      (step.type === 'thinking' && !step.isComplete) || (step.type === 'tool' && step.isRunning),
  );
}

export function areAllStepsComplete(normalizedSteps, isStreaming) {
  return (
    !isStreaming &&
    normalizedSteps.every(
      (step) =>
        (step.type === 'thinking' && step.isComplete) ||
        (step.type === 'tool' && !step.isRunning) ||
        step.type === 'skill',
    )
  );
}
