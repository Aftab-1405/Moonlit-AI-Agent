const prompt = (id, label, promptText) =>
  Object.freeze({ id, label, type: 'prompt', prompt: promptText });

const openDatabase = Object.freeze({
  id: 'open-database-setup',
  label: 'Open database connection setup',
  type: 'openDatabase',
});

const category = (id, label, icon, entries) =>
  Object.freeze({ id, label, icon, entries: Object.freeze(entries) });

const CONNECTED_CATEGORIES = Object.freeze([
  category('explore-schema', 'Explore schema', 'schema', [
    prompt(
      'summarize-schema',
      'Summarize my database schema',
      'Summarize my database schema and highlight the most important tables.',
    ),
    prompt(
      'map-relationships',
      'Map table relationships',
      'Show the relationships between my main tables and explain how they connect.',
    ),
    prompt(
      'find-primary-keys',
      'Review keys and constraints',
      'Review the primary keys, foreign keys, and important constraints in my schema.',
    ),
    prompt(
      'explain-columns',
      'Explain unclear columns',
      'Identify columns whose names or data types may need clarification and explain what they likely represent.',
    ),
    prompt(
      'schema-opportunities',
      'Find schema exploration opportunities',
      'Suggest useful questions I can ask based on the structure of my database.',
    ),
  ]),
  category('write-sql', 'Write SQL', 'code', [
    prompt(
      'draft-read-query',
      'Draft a read-only query',
      'Help me draft a read-only SQL query for the result I describe.',
    ),
    prompt(
      'explain-query',
      'Explain a SQL query',
      'Explain a SQL query step by step and point out any risky or confusing parts.',
    ),
    prompt(
      'optimize-query',
      'Optimize a slow query',
      'Review a slow read-only SQL query and suggest safe performance improvements.',
    ),
    prompt(
      'validate-query',
      'Validate query logic',
      'Check whether a read-only SQL query matches the business question it is meant to answer.',
    ),
    prompt(
      'build-cte',
      'Structure a query with CTEs',
      'Help me structure a complex read-only query using clear common table expressions.',
    ),
  ]),
  category('analyze-data', 'Analyze data', 'analysis', [
    prompt(
      'find-trends',
      'Find meaningful trends',
      'Analyze my data for meaningful trends over time and explain the strongest signals.',
    ),
    prompt(
      'compare-segments',
      'Compare important segments',
      'Compare the most important segments in my data and summarize the differences.',
    ),
    prompt(
      'spot-anomalies',
      'Look for anomalies',
      'Look for unusual values or patterns in my data and suggest possible explanations.',
    ),
    prompt(
      'create-breakdown',
      'Build a useful breakdown',
      'Create a useful breakdown of a key metric by the dimensions that matter most.',
    ),
    prompt(
      'executive-summary',
      'Create an executive summary',
      'Summarize the most decision-relevant findings in my data for an executive audience.',
    ),
  ]),
  category('moonlits-choice-connected', "Moonlit's choice", 'moonlit', [
    prompt(
      'discover-question',
      'Discover a high-value question',
      'Inspect my schema and suggest one high-value analytical question to investigate.',
    ),
    prompt(
      'data-quality',
      'Check data quality signals',
      'Look for schema and query signals that may reveal data quality issues.',
    ),
    prompt(
      'relationship-story',
      'Tell the story of my schema',
      'Explain how the main entities in my database work together as a coherent data story.',
    ),
    prompt(
      'metric-opportunity',
      'Find a useful metric',
      'Suggest a useful metric I can calculate from my available data and draft the read-only SQL.',
    ),
    prompt(
      'surprising-pattern',
      'Search for a surprising pattern',
      'Choose a promising part of my data to explore for an unexpected pattern.',
    ),
  ]),
]);

const DISCONNECTED_CATEGORIES = Object.freeze([
  category('connect-database', 'Connect database', 'database', [
    openDatabase,
    prompt(
      'supported-databases',
      'See supported databases',
      'Which database systems can I connect to Moonlit?',
    ),
    prompt(
      'connection-requirements',
      'Review connection requirements',
      'What information do I need before connecting a database to Moonlit?',
    ),
    prompt(
      'connection-safety',
      'Understand connection safety',
      'How does Moonlit keep database access controlled and read-only?',
    ),
    prompt(
      'remote-connection',
      'Plan a remote connection',
      'Help me prepare a secure remote database connection for Moonlit.',
    ),
  ]),
  category('understand-moonlit', 'Understand Moonlit', 'moonlit', [
    prompt(
      'moonlit-workflow',
      'See how Moonlit works',
      'Explain the Moonlit workflow from a plain-English question to a verified result.',
    ),
    prompt(
      'read-only-execution',
      'Understand read-only execution',
      'Explain how Moonlit handles read-only SQL execution and its safety limits.',
    ),
    prompt(
      'available-artifacts',
      'Explore available artifacts',
      'What tables, charts, diagrams, and SQL artifacts can Moonlit create?',
    ),
    prompt('model-choice', 'Understand model choice', 'How does model selection work in Moonlit?'),
    prompt(
      'conversation-context',
      'Understand conversation context',
      'How does Moonlit preserve context across a database investigation?',
    ),
  ]),
  category('plan-query', 'Plan a query', 'code', [
    prompt(
      'define-question',
      'Turn a goal into a data question',
      'Help me turn a business goal into a precise data question before I connect a database.',
    ),
    prompt(
      'identify-tables',
      'Identify likely tables',
      'Given my analysis goal, help me identify the tables and columns I will probably need.',
    ),
    prompt(
      'draft-generic-sql',
      'Draft generic SQL',
      'Draft a database-agnostic read-only SQL outline for the analysis I describe.',
    ),
    prompt(
      'plan-validation',
      'Plan result validation',
      'Help me plan how to validate that a query result answers the intended question.',
    ),
    prompt(
      'plan-breakdown',
      'Choose useful dimensions',
      'Help me choose useful dimensions and filters for an analytical breakdown.',
    ),
  ]),
  category('moonlits-choice-disconnected', "Moonlit's choice", 'moonlit', [
    prompt(
      'prepare-first-analysis',
      'Prepare my first analysis',
      'Help me plan a valuable first analysis to run after I connect my database.',
    ),
    prompt(
      'schema-readiness',
      'Create a schema readiness checklist',
      'Create a short checklist for preparing a database schema for AI-assisted analysis.',
    ),
    prompt(
      'safe-query-practices',
      'Learn safe query practices',
      'Teach me the essential practices for safe, read-only analytical SQL.',
    ),
    prompt(
      'question-ladder',
      'Build an analysis question ladder',
      'Build a sequence of questions that moves from a broad metric to a useful diagnosis.',
    ),
    prompt(
      'artifact-plan',
      'Plan an analysis artifact',
      'Help me decide whether my result should become a table, chart, SQL artifact, or schema diagram.',
    ),
  ]),
]);

const WELCOME_PERIOD_BOUNDARY_HOURS = Object.freeze([5, 12, 17, 21]);

export function getWelcomeSuggestionMotion(reduceMotion = false) {
  if (reduceMotion) {
    const instant = { duration: 0 };
    return {
      containerLayout: false,
      stageTransition: instant,
      panelVariants: {
        open: { opacity: 1, scaleY: 1, transition: instant },
        closed: { opacity: 0, scaleY: 1, transition: instant },
      },
      itemVariants: {
        open: { opacity: 1, y: 0, transition: instant },
        closed: { opacity: 0, y: 0, transition: instant },
      },
    };
  }

  return {
    containerLayout: false,
    stageTransition: { duration: 0 },
    panelVariants: {
      open: {
        opacity: 1,
        scaleY: 1,
        transition: {
          duration: 0.16,
          ease: [0.22, 1, 0.36, 1],
          when: 'beforeChildren',
          staggerChildren: 0.055,
        },
      },
      closed: {
        opacity: 0,
        scaleY: 0,
        transition: {
          duration: 0.14,
          ease: 'easeIn',
          when: 'afterChildren',
          staggerChildren: 0.045,
          staggerDirection: -1,
        },
      },
    },
    itemVariants: {
      open: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
      },
      closed: {
        opacity: 0,
        y: -12,
        transition: { duration: 0.12, ease: 'easeIn' },
      },
    },
  };
}

export function getWelcomePeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'this morning';
  if (hour >= 12 && hour < 17) return 'this afternoon';
  if (hour >= 17 && hour < 21) return 'this evening';
  return 'tonight';
}

export function getWelcomePeriodBoundaryDelay(date = new Date()) {
  const timestamp = date.getTime();
  for (const hour of WELCOME_PERIOD_BOUNDARY_HOURS) {
    const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0);
    if (boundary.getTime() > timestamp) return boundary.getTime() - timestamp;
  }

  const nextMorning = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    WELCOME_PERIOD_BOUNDARY_HOURS[0],
    0,
    0,
    0,
  );
  return nextMorning.getTime() - timestamp;
}

export function getWelcomeGreeting({ date = new Date(), displayName = null } = {}) {
  const firstName = displayName?.trim().split(/\s+/)[0] || '';
  const suffix = firstName ? `, ${firstName}` : '';
  return `What are we exploring ${getWelcomePeriod(date)}${suffix}?`;
}

export function getWelcomeCategories(isConnected) {
  return isConnected ? CONNECTED_CATEGORIES : DISCONNECTED_CATEGORIES;
}

export function isWelcomeEntryDisabled(
  entry,
  { promptDisabled = false, canOpenDatabase = false } = {},
) {
  if (entry?.type === 'openDatabase') return !canOpenDatabase;
  if (entry?.type === 'prompt') return promptDisabled;
  return true;
}

export function isWelcomeCategoryDisabled(category, availability) {
  return !category?.entries?.some((entry) => !isWelcomeEntryDisabled(entry, availability));
}

export function getSuggestionNavigationIndex({ key, currentIndex, itemCount }) {
  if (itemCount <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  if (key === 'ArrowDown' || key === 'ArrowRight') return (currentIndex + 1) % itemCount;
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return (currentIndex - 1 + itemCount) % itemCount;
  }
  return null;
}

export function runWelcomeEntry(entry, { canSend, onSend, onOpenDatabase } = {}) {
  if (entry?.type === 'openDatabase') {
    if (typeof onOpenDatabase !== 'function') return false;
    onOpenDatabase();
    return true;
  }
  if (entry?.type !== 'prompt' || !canSend || typeof onSend !== 'function') return false;
  onSend(entry.prompt);
  return true;
}

export function createWelcomeInteractionGuard() {
  let locked = false;

  return Object.freeze({
    isLocked: () => locked,
    tryLock: () => {
      if (locked) return false;
      locked = true;
      return true;
    },
    completeTransition: () => {
      locked = false;
    },
  });
}

export function beginWelcomeStageTransition(guard, changeStage) {
  if (typeof changeStage !== 'function' || !guard?.tryLock?.()) return false;
  try {
    changeStage();
    return true;
  } catch (error) {
    guard.completeTransition();
    throw error;
  }
}

export function runGuardedWelcomeActivation(guard, activate) {
  if (typeof activate !== 'function' || !guard?.tryLock?.()) return false;
  try {
    const handled = activate() === true;
    if (!handled) guard.completeTransition();
    return handled;
  } catch (error) {
    guard.completeTransition();
    throw error;
  }
}
