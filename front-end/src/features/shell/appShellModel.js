const DEFAULT_SIDEBAR_WIDTHS = Object.freeze({ expanded: 344, collapsed: 52 });

export function getAppShellLayout(
  { isNarrowLayout, sidebarOpen, canvasOpen, canvasWidth },
  sidebarWidths = DEFAULT_SIDEBAR_WIDTHS,
) {
  return {
    regions: ['sidebar', 'chat', 'workspace'],
    sidebarWidth: isNarrowLayout
      ? 0
      : sidebarOpen
        ? sidebarWidths.expanded
        : sidebarWidths.collapsed,
    workspacePosition: isNarrowLayout ? 'fixed' : 'relative',
    workspaceWidth: isNarrowLayout ? '100%' : canvasOpen ? canvasWidth : 0,
    workspaceY: isNarrowLayout && !canvasOpen ? '100%' : 0,
    workspaceInteractive: canvasOpen,
  };
}
