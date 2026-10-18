import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  dbStatus: ['db', 'status'],
  dbDatabases: ['db', 'databases'],
  dbSchemas: (database) => ['db', 'schemas', database || '__current__'],
  dbTables: (database) => ['db', 'tables', database || '__current__'],
  dbTableSchema: (database, tableName) => [
    'db',
    'tableSchema',
    database || '__current__',
    tableName,
  ],
  llmOptions: ['llm', 'options'],
  conversations: ['conversations', 'list'],
  conversation: (conversationId) => ['conversations', 'detail', conversationId],
  chatSession: (sessionKey) => ['chatSessions', sessionKey],
  userSettings: (userId) => ['user', userId || '__anonymous__', 'settings'],
  userContext: ['user', 'context'],
  dashboardOverview: (userId) => ['user', userId, 'dashboard', 'overview'],
  dashboardUsage: (userId, days) => ['user', userId, 'dashboard', 'usage', days],
  userQuota: (userId) => ['user', userId, 'quota'],
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
