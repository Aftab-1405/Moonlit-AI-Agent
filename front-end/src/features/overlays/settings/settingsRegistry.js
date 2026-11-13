export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', group: 'Personal' },
  { id: 'appearance', label: 'Appearance', group: 'Personal' },
  { id: 'database', label: 'Database', group: 'Workspace' },
  { id: 'ai-context', label: 'AI context', group: 'Workspace' },
];
export function normalizeSettingsSection(section) {
  const id =
    { ai: 'general', context: 'ai-context', 'general-settings': 'general' }[section] || section;
  return SETTINGS_SECTIONS.some((s) => s.id === id) ? id : 'general';
}
const entries = [
  [
    'general',
    'Reasoning effort',
    'Available reasoning levels for AI responses',
    'setting-reasoningEffort',
  ],
  ['general', 'Response style', 'App responses concise balanced detailed', 'setting-responseStyle'],
  ['general', 'Task mode', 'Choose standard tools or long tasks', 'setting-taskMode'],
  ['appearance', 'Mode', 'System Light Dark app theme', 'appearance-mode'],
  ['appearance', 'Theme', 'Preset Import Copy ChatGPT Moonlit', 'appearance-theme'],
  ['appearance', 'Accent', 'App colors Purple White custom', 'appearance-accent'],
  ['appearance', 'Background', 'Surface color hex', 'appearance-background'],
  ['appearance', 'Foreground', 'Ink text color hex', 'appearance-foreground'],
  ['appearance', 'Font', 'UI content code font size', 'appearance-font'],
  ['appearance', 'Reduce motion', 'System animations On Off', 'appearance-reduced-motion'],
  [
    'appearance',
    'Separate light and dark modes',
    'Independent theme profiles',
    'appearance-separate-modes',
  ],
  ['appearance', 'Contrast', 'Theme readability', 'appearance-contrast'],
  ['appearance', 'Diff markers', 'Color plus minus additions deletions', 'appearance-diff-markers'],
  ['database', 'Confirm before run', 'SQL execution confirmation', 'setting-confirmBeforeRun'],
  ['database', 'Query timeout', 'SQL duration limit', 'setting-queryTimeout'],
  ['database', 'Maximum rows', 'Limit results', 'setting-maxRows'],
  ['database', 'NULL display', 'Missing values', 'setting-nullDisplay'],
  ['database', 'Remember connection', 'Auto-fill on next visit', 'setting-rememberConnection'],
  ['database', 'Connection persistence', 'Keep connection alive', 'setting-connectionPersistence'],
  ['database', 'Default database type', 'Preselected connection provider', 'setting-defaultDbType'],
  ['ai-context', 'AI context', 'Database schema context for app AI', 'settings-context'],
].map(([section, label, description, target]) => ({ section, label, description, target }));
export function searchSettings(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = entries.filter((e) => `${e.label} ${e.description}`.toLowerCase().includes(q));
  for (const section of SETTINGS_SECTIONS)
    if (section.label.toLowerCase().includes(q) && !results.some((r) => r.section === section.id))
      results.push({ section: section.id, label: section.label, target: null });
  return results.map((r) => ({
    ...r,
    parentLabel: SETTINGS_SECTIONS.find((s) => s.id === r.section).label,
  }));
}
