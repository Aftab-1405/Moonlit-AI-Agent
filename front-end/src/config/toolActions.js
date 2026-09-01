import { UI_ACTIONS } from './uiActions.js';

export const AGENT_TOOL_ACTIONS = {
  read_skill: {
    running: 'Reading skill instructions',
    done: 'Read skill instructions',
    presentation: 'skill',
  },
  get_connection_status: {
    running: 'Checking connection status',
    done: 'Checked connection status',
    presentation: 'connection',
  },
  get_database_list: {
    running: 'Listing available databases',
    done: 'Listed available databases',
    presentation: 'databases',
  },
  execute_query: {
    running: 'Executing SQL query',
    done: 'Executed SQL query',
    presentation: 'query',
  },
  analyze_query_result: {
    running: 'Analyzing query result',
    done: 'Analyzed query result',
    presentation: 'analysis',
  },
  get_table_indexes: {
    running: 'Fetching indexes',
    done: 'Fetched indexes',
    presentation: 'indexes',
  },
  get_schema_overview: {
    running: 'Fetching schema overview',
    done: 'Fetched schema overview',
    presentation: 'schema',
  },
  explain_query: {
    running: 'Explaining SQL query',
    done: 'Explained SQL query',
    presentation: 'explain',
  },
  get_table_details: {
    running: 'Fetching table details',
    done: 'Fetched table details',
    presentation: 'table_details',
  },
  get_table_row_counts: {
    running: 'Counting table rows',
    done: 'Counted table rows',
    presentation: 'row_counts',
  },
  get_foreign_keys: {
    running: 'Fetching foreign keys',
    done: 'Fetched foreign keys',
    presentation: 'foreign_keys',
  },
  list_views: {
    running: 'Listing database views',
    done: 'Listed database views',
    presentation: 'views',
  },
  web_search: {
    running: 'Searching the web',
    done: 'Searched the web',
    presentation: 'web_search',
  },
  get_query_history: {
    running: 'Retrieving query history',
    done: 'Retrieved query history',
    presentation: 'query_history',
  },
  open_sql_editor: {
    running: UI_ACTIONS.open_sql_editor.running,
    done: UI_ACTIONS.open_sql_editor.done,
    presentation: 'ui_action',
  },
  open_database_modal: {
    running: UI_ACTIONS.open_database_modal.running,
    done: UI_ACTIONS.open_database_modal.done,
    presentation: 'ui_action',
  },
  open_settings_modal: {
    running: UI_ACTIONS.open_settings_modal.running,
    done: UI_ACTIONS.open_settings_modal.done,
    presentation: 'ui_action',
  },
  navigate_new_chat: {
    running: UI_ACTIONS.navigate_new_chat.running,
    done: UI_ACTIONS.navigate_new_chat.done,
    presentation: 'ui_action',
  },
  retrieve_memory: {
    running: 'Searching conversation memory',
    done: 'Searched conversation memory',
    presentation: 'memory',
  },
};

const FRONTEND_ONLY_ACTIONS = Object.fromEntries(
  Object.entries(UI_ACTIONS)
    .filter(([name]) => !(name in AGENT_TOOL_ACTIONS))
    .map(([name, config]) => [name, { running: config.running, done: config.done }]),
);

export const TOOL_ACTIONS = {
  ...AGENT_TOOL_ACTIONS,
  ...FRONTEND_ONLY_ACTIONS,
};
